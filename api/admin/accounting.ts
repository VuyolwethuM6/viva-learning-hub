import { timingSafeEqual } from "node:crypto";
import type { ServerResponse } from "node:http";
import {
  db,
  privateResponse,
  requireAdmin,
  rpc,
  sameOrigin,
  uuid,
} from "../_lib/admin.js";
import {
  financialCSV,
  detailedFinancialCSV,
  prepareBankImport,
  runScheduledAccounting,
  validateAccountingInput,
} from "../_lib/accounting-api.js";
import { getEmailConfig } from "../_lib/email.js";
import {
  encodeStoragePath,
  getSupabaseConfig,
  handleError,
  HttpError,
  readJsonBody,
  sendJson,
  serviceHeaders,
  type ApiRequest,
} from "../_lib/http.js";
import type { FinanceSnapshot } from "../../src/lib/accounting-types.js";
import { validAccountingDate } from "../../src/lib/accounting-input.js";
type Attachment = {
  id: string;
  name: string;
  mime: string;
  storage_path: string;
  size_bytes: number;
};
export default async function handler(
  request: ApiRequest,
  response: ServerResponse,
) {
  privateResponse(response);
  try {
    const url = new URL(request.url || "", "http://localhost");
    if (url.searchParams.get("task") === "scheduled") {
      if (request.method !== "GET")
        throw new HttpError(405, "Method not allowed.");
      const secret = process.env.CRON_SECRET;
      const provided = request.headers.authorization || "";
      if (!secret)
        throw new HttpError(503, "The accounting scheduler is not configured.");
      const expected = Buffer.from(`Bearer ${secret}`),
        actual = Buffer.from(provided);
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      )
        throw new HttpError(401, "Scheduler authorization is required.");
      const config = await rpc<{
        enabled: boolean;
        autoSend: boolean;
        actor: string;
        validActor: boolean;
      }>("accounting_scheduler_context", {});
      if (!config.enabled) return sendJson(response, 200, { disabled: true });
      if (!config.actor || !config.validActor)
        throw new HttpError(
          503,
          "Configure an enabled finance owner for the scheduled run.",
        );
      const result = await runScheduledAccounting(
        config.actor,
        config.autoSend,
      );
      return sendJson(response, result.success === false ? 503 : 200, result);
    }
    const actor = await requireAdmin(request);
    if (request.method === "GET") {
      if (url.searchParams.has("file")) {
        const file = await rpc<Attachment>("accounting_attachment", {
          p_actor: actor.id,
          p_action: "view",
          p_data: { id: uuid(url.searchParams.get("file")) },
        });
        const config = getSupabaseConfig()!;
        const upstream = await fetch(
          `${config.url}/storage/v1/object/authenticated/accounting-documents/${encodeStoragePath(file.storage_path)}`,
          {
            headers: serviceHeaders(config.key),
            signal: AbortSignal.timeout(20000),
          },
        );
        if (!upstream.ok || !upstream.body)
          throw new HttpError(
            502,
            "The expense document could not be downloaded.",
          );
        const reader = upstream.body.getReader(),
          chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.length;
            if (size > 10485760)
              throw new HttpError(
                413,
                "The document exceeds the download limit.",
              );
            chunks.push(part.value);
          }
        } finally {
          await reader.cancel();
        }
        if (
          size !== file.size_bytes ||
          upstream.headers.get("Content-Type")?.split(";")[0].toLowerCase() !==
            file.mime
        )
          throw new HttpError(
            409,
            "The stored expense document does not match its record.",
          );
        response.setHeader("Content-Type", file.mime);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader(
          "Content-Disposition",
          `attachment; filename="${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
        );
        return response.end(Buffer.concat(chunks));
      }
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "Africa/Johannesburg",
      });
      const from = url.searchParams.get("from") || `${today.slice(0, 4)}-01-01`,
        to = url.searchParams.get("to") || today;
      if (!validAccountingDate(from) || !validAccountingDate(to))
        throw new HttpError(400, "Choose valid report dates.");
      const detailedKind = url.searchParams.get("export");
      if (detailedKind === "ledger" || detailedKind === "ageing") {
        const rows = await rpc<Record<string, string | number>[]>(
          "accounting_export_rows",
          { p_actor: actor.id, p_kind: detailedKind, p_from: from, p_to: to },
        );
        response.setHeader("Content-Type", "text/csv; charset=utf-8");
        response.setHeader(
          "Content-Disposition",
          `attachment; filename="Viva-${detailedKind}-${from}-${to}.csv"`,
        );
        return response.end(detailedFinancialCSV(detailedKind, rows));
      }
      const snapshot = await rpc<FinanceSnapshot>("accounting_snapshot", {
        p_actor: actor.id,
        p_from: from,
        p_to: to,
      });
      const exportKind = url.searchParams.get("export");
      if (exportKind) {
        if (
          (exportKind === "ledger" && snapshot.limits.journals) ||
          (exportKind === "ageing" && snapshot.limits.ageing)
        )
          throw new HttpError(
            409,
            "This export exceeds the displayed row limit. Narrow the date range before exporting.",
          );
        response.setHeader("Content-Type", "text/csv; charset=utf-8");
        response.setHeader(
          "Content-Disposition",
          `attachment; filename="Viva-${exportKind.replace(/[^a-z_]/g, "")}-${from}-${to}.csv"`,
        );
        return response.end(financialCSV(snapshot, exportKind));
      }
      return sendJson(response, 200, snapshot);
    }
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed.");
    sameOrigin(request);
    const body = await readJsonBody(request, 1200000, "Accounting");
    const action = String(body.action || "");
    if (action.startsWith("attachment_")) {
      const operation = action.slice("attachment_".length);
      if (!["prepare", "finalize", "view"].includes(operation))
        throw new HttpError(400, "Unknown document action.");
      const attachment = await rpc<Attachment>("accounting_attachment", {
        p_actor: actor.id,
        p_action: operation,
        p_data: { ...body, id: uuid(body.id) },
      });
      if (operation === "finalize")
        return sendJson(response, 200, { success: true, attachment });
      const route = operation === "prepare" ? "upload/sign" : "sign";
      const signed = await db<{
        url?: string;
        token?: string;
        signedURL?: string;
        signedUrl?: string;
      }>(
        `/storage/v1/object/${route}/accounting-documents/${encodeStoragePath(attachment.storage_path)}`,
        {
          method: "POST",
          body: JSON.stringify(
            operation === "prepare" ? { upsert: false } : { expiresIn: 60 },
          ),
        },
      );
      const config = getSupabaseConfig()!;
      const path =
        operation === "prepare"
          ? signed.url
          : signed.signedURL || signed.signedUrl;
      if (
        !path ||
        !path.startsWith(
          operation === "prepare" ? "/object/upload/sign/" : "/object/sign/",
        )
      )
        throw new HttpError(
          502,
          "A private document link could not be created.",
        );
      const link = new URL(`${config.url}/storage/v1${path}`);
      if (signed.token) link.searchParams.set("token", signed.token);
      return sendJson(response, 200, { attachment, url: link.toString() });
    }
    if (action === "run_schedule") {
      const context = await rpc<{ autoSend: boolean }>(
        "accounting_scheduler_context",
        {},
      );
      const result = await runScheduledAccounting(actor.id, context.autoSend);
      return sendJson(response, result.success === false ? 503 : 200, result);
    }
    validateAccountingInput(body);
    if (
      action === "settings" &&
      body.automationEnabled === true &&
      !process.env.CRON_SECRET
    )
      throw new HttpError(
        503,
        "Configure CRON_SECRET on the server before enabling scheduled accounting.",
      );
    if (
      action === "settings" &&
      body.autoSend === true &&
      (!getEmailConfig() ||
        process.env.TUITION_BANK_DETAILS_CONFIRMED !== "true")
    )
      throw new HttpError(
        503,
        "Configure the email sender and confirm bank details before enabling automatic email dispatch.",
      );
    const data = action === "bank_import" ? prepareBankImport(body) : body;
    const result = await rpc("accounting_mutate", {
      p_actor: actor.id,
      p_action: action,
      p_data: data,
    });
    return sendJson(response, 200, { success: true, result });
  } catch (error) {
    return handleError(
      response,
      error,
      "Accounting",
      "The accounting operation could not be confirmed. Refresh and check the records before retrying.",
    );
  }
}
