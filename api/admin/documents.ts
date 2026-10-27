import type { ServerResponse } from "node:http";
import { db, privateResponse, requireAdmin, rpc, uuid } from "../_lib/admin.js";
import {
  encodeStoragePath,
  getSupabaseConfig,
  handleError,
  HttpError,
  serviceHeaders,
  type ApiRequest,
} from "../_lib/http.js";
import { buildTuitionPDF, documentFilename } from "../_lib/tuition-document.js";
import { loadTuitionDocument } from "../_lib/tuition-document-data.js";
import {
  accountingFilename,
  buildAccountingPDF,
  type AccountingDocument,
} from "../_lib/accounting-document.js";
import { validAccountingDate } from "../../src/lib/accounting-input.js";
export default async function handler(
  request: ApiRequest,
  response: ServerResponse,
) {
  privateResponse(response);
  try {
    const actor = await requireAdmin(request);
    if (request.method !== "GET")
      throw new HttpError(405, "Method not allowed.");
    const url = new URL(request.url || "", "http://localhost");
    const kind = url.searchParams.get("kind");
    if (
      kind &&
      [
        "account_receipt",
        "credit_note",
        "refund",
        "allocation",
        "statement",
        "financial_report",
      ].includes(kind)
    ) {
      const from = url.searchParams.get("from"),
        to = url.searchParams.get("to");
      if (
        (from && !validAccountingDate(from)) ||
        (to && !validAccountingDate(to))
      )
        throw new HttpError(400, "Choose valid document dates.");
      const document = await rpc<AccountingDocument>(
        "accounting_document_data",
        {
          p_actor: actor.id,
          p_kind: kind,
          p_id: uuid(url.searchParams.get("id")),
          p_from: from,
          p_to: to,
        },
      );
      const bytes = await buildAccountingPDF(document);
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader(
        "Content-Disposition",
        `inline; filename="${accountingFilename(document)}"`,
      );
      return response.end(Buffer.from(bytes));
    }
    if (kind !== "invoice" && kind !== "receipt" && kind !== "report")
      throw new HttpError(400, "Choose invoice, receipt or report card.");
    const id = uuid(url.searchParams.get("id"));
    if (kind === "report") {
      const rows = await db<
        { report_card_path: string; report_card_name: string }[]
      >(
        `/rest/v1/applications?id=eq.${id}&select=report_card_path,report_card_name`,
      );
      if (!rows[0]?.report_card_path)
        throw new HttpError(404, "Report card not found.");
      const config = getSupabaseConfig()!;
      const file = await fetch(
        `${config.url}/storage/v1/object/authenticated/learner-documents/${encodeStoragePath(rows[0].report_card_path)}`,
        {
          headers: serviceHeaders(config.key),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!file.ok)
        throw new HttpError(
          502,
          "The private report card could not be downloaded.",
        );
      const mime =
        file.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() ||
        "";
      if (!["application/pdf", "image/jpeg", "image/png"].includes(mime))
        throw new HttpError(409, "The stored document type is not supported.");
      const reader = file.body?.getReader();
      if (!reader) throw new HttpError(502, "The document was empty.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 10485760)
            throw new HttpError(
              413,
              "The report card exceeds the download limit.",
            );
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      if (size === 0) throw new HttpError(502, "The report card was empty.");
      await rpc("admin_log_document", { p_actor: actor.id, p_application: id });
      response.setHeader("Content-Type", mime);
      response.setHeader("X-Content-Type-Options", "nosniff");
      const name = (rows[0].report_card_name || "report-card").replace(
        /[^a-zA-Z0-9_.-]/g,
        "_",
      );
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${name}"`,
      );
      response.end(Buffer.concat(chunks));
      return;
    }
    const doc = await loadTuitionDocument(kind, id);
    const bytes = await buildTuitionPDF(doc);
    await rpc("admin_log_document", {
      p_actor: actor.id,
      p_application: doc.applicationId,
    });
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${documentFilename(doc, kind)}"`,
    );
    response.end(Buffer.from(bytes));
  } catch (error) {
    return handleError(
      response,
      error,
      "Tuition document",
      "The document could not be generated. Please retry.",
    );
  }
}
