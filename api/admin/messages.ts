import type { ServerResponse } from "node:http";
import {
  privateResponse,
  requireAdmin,
  rpc,
  sameOrigin,
  uuid,
} from "../_lib/admin.js";
import {
  handleError,
  HttpError,
  readJsonBody,
  sendJson,
  type ApiRequest,
} from "../_lib/http.js";
import { dispatchTuitionMessage } from "../_lib/dispatch-tuition-message.js";

export default async function handler(
  request: ApiRequest,
  response: ServerResponse,
) {
  privateResponse(response);
  try {
    const actor = await requireAdmin(request);
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed.");
    sameOrigin(request);
    const input = await readJsonBody(request, 4096, "Admin message");
    const id = uuid(input.id);
    if (input.action === "cancel") {
      if (
        typeof input.reason !== "string" ||
        typeof input.providerReviewed !== "boolean"
      )
        throw new HttpError(
          400,
          "Supply a cancellation reason and provider-review confirmation.",
        );
      const result = await rpc("admin_cancel_message", {
        p_actor: actor.id,
        p_id: id,
        p_reason: input.reason,
        p_provider_reviewed: input.providerReviewed,
      });
      return sendJson(response, 200, { success: true, result });
    }
    if (input.action !== undefined && input.action !== "send")
      throw new HttpError(400, "Unknown notification action.");
    const result = await dispatchTuitionMessage(actor.id, id);
    return sendJson(response, 200, result);
  } catch (error) {
    return handleError(
      response,
      error,
      "Admin message",
      "Delivery could not be confirmed. Check provider history before retrying.",
    );
  }
}
