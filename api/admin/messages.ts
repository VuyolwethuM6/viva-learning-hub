import type { ServerResponse } from "node:http";
import {
  privateResponse,
  requireAdmin,
  rpc,
  sameOrigin,
  uuid,
} from "../_lib/admin.js";
import { getEmailConfig } from "../_lib/email.js";
import {
  handleError,
  HttpError,
  readJsonBody,
  sendJson,
  type ApiRequest,
} from "../_lib/http.js";
import { tuitionEmail } from "../_lib/tuition-email.js";

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
    const input = await readJsonBody(request, 1024, "Admin message");
    const id = uuid(input.id);
    const config = getEmailConfig();
    if (!config) throw new HttpError(503, "Email is not configured.");
    const message = await rpc<{
      id: string;
      claim_token: string;
      kind: string;
      payload: Parameters<typeof tuitionEmail>[1];
    } | null>("admin_claim_message", { p_actor: actor.id, p_id: id });
    if (!message)
      return sendJson(response, 200, { success: true, skipped: true });
    try {
      const rendered = tuitionEmail(message.kind, message.payload);
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `tuition-${message.id}`,
        },
        body: JSON.stringify({
          from: config.from,
          to: rendered.to,
          reply_to: config.admin,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!sent.ok)
        throw new HttpError(
          502,
          "The email provider did not confirm acceptance. Check provider history before retrying.",
        );
      await rpc("admin_finish_message", {
        p_actor: actor.id,
        p_id: id,
        p_claim: message.claim_token,
        p_success: true,
      });
    } catch (error) {
      await rpc("admin_finish_message", {
        p_actor: actor.id,
        p_id: id,
        p_claim: message.claim_token,
        p_success: false,
      });
      throw error;
    }
    return sendJson(response, 200, { success: true });
  } catch (error) {
    return handleError(
      response,
      error,
      "Admin message",
      "Delivery could not be confirmed. Check provider history before retrying.",
    );
  }
}
