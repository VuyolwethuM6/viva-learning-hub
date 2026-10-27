import { systemRead, systemMutation } from "../_lib/system-service.js";
import { academicRead, academicMutation } from "../_lib/academic-service.js";
import { teachingRead, teachingMutation } from "../_lib/teaching-service.js";
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
  encodeStoragePath,
  handleError,
  HttpError,
  readJsonBody,
  sendJson,
  type ApiRequest,
} from "../_lib/http.js";

export default async function handler(
  request: ApiRequest,
  response: ServerResponse,
) {
  privateResponse(response);
  try {
    const actor = await requireAdmin(request);
    const system = new URL(
      request.url || "",
      "http://localhost",
    ).searchParams.get("system");
    if (request.method === "GET" && system)
      return await systemRead(response, actor.id, system);
    if (
      request.method === "GET" &&
      new URL(request.url || "", "http://localhost").searchParams.get(
        "academic",
      ) === "1"
    )
      return await academicRead(request, response, actor.id, "admin");
    if (
      request.method === "GET" &&
      new URL(request.url || "", "http://localhost").searchParams.get(
        "teaching",
      ) === "1"
    )
      return await teachingRead(request, response, actor.id, "admin");
    if (request.method === "GET")
      return sendJson(
        response,
        200,
        await rpc("admin_snapshot", { p_actor: actor.id }),
      );
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed.");
    sameOrigin(request);
    const body = await readJsonBody(request, 32_768, "Admin records");
    if (body.action === "system")
      return await systemMutation(response, actor.id, body);
    if (body.action === "academic")
      return await academicMutation(response, actor.id, "admin", body);
    if (body.action === "teaching")
      return await teachingMutation(response, actor.id, "admin", body);
    if (body.action === "parent_access") {
      if (body.enabled !== undefined && typeof body.enabled !== "boolean")
        throw new HttpError(
          400,
          "Choose whether parent access should be enabled.",
        );
      return sendJson(
        response,
        200,
        await rpc("admin_parent_access", {
          p_actor: actor.id,
          p_application: uuid(body.applicationId),
          p_enabled: body.enabled ?? null,
          p_reason: typeof body.reason === "string" ? body.reason : "",
        }),
      );
    }
    if (body.action === "document") {
      const id = uuid(body.applicationId);
      const apps = await db<
        { report_card_path: string; report_card_name: string }[]
      >(
        `/rest/v1/applications?id=eq.${id}&select=report_card_path,report_card_name`,
      );
      if (!apps?.[0]?.report_card_path)
        throw new HttpError(404, "Report card not found.");
      const signed = await db(
        `/storage/v1/object/sign/learner-documents/${encodeStoragePath(apps[0].report_card_path)}`,
        { method: "POST", body: JSON.stringify({ expiresIn: 60 }) },
      );
      await rpc("admin_log_document", { p_actor: actor.id, p_application: id });
      const config = process.env.SUPABASE_URL!.replace(/\/$/, "");
      const path = signed.signedURL || signed.signedUrl;
      if (typeof path !== "string" || !path.startsWith("/object/sign/"))
        throw new HttpError(502, "Unable to open document.");
      const extension =
        apps[0].report_card_path.split(".").pop()?.toLowerCase() || "";
      const mime: Record<string, string> = {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
      };
      return sendJson(response, 200, {
        url: `${config}/storage/v1${path}`,
        mime: mime[extension] || "application/octet-stream",
        fileName: apps[0].report_card_name || "report-card",
      });
    }
    const actions = [
      "approve",
      "reject",
      "note",
      "payment",
      "activate",
      "generate_month",
      "queue_reminders",
    ];
    if (!actions.includes(String(body.action)))
      throw new HttpError(400, "Unknown admin action.");
    await rpc("accounting_write_ready", { p_actor: actor.id });
    const result = await rpc("admin_mutate", {
      p_actor: actor.id,
      p_action: body.action,
      p_data: body,
    });
    return sendJson(response, 200, { success: true, result });
  } catch (error) {
    return handleError(
      response,
      error,
      "Admin records",
      "The operation could not be confirmed. Refresh before trying again.",
    );
  }
}
