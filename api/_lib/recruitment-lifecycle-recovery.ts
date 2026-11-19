import type { ServerResponse } from "node:http";
import { z } from "zod";
import { sendJson, type ApiRequest } from "./http.js";
import { id, IntakeError, intakeFailure, intakeLimit, intakeRpc } from "./recruitment-intake.js";
import type { RecruitmentUser } from "../../src/lib/recruitment-types.js";
const input = z.object({ action: z.literal("cancel_pending"), requestId: id }).strict();
/** The enclosing staff/applicant handler authenticates, enforces origin and bounds
 * the JSON body. Cancellation grants no new capability and returns no case data. */
export async function handleLifecycleCancel(
  req: ApiRequest,
  res: ServerResponse,
  identity: RecruitmentUser | string,
  domain: "selection" | "engagement",
  body: unknown,
) {
  try {
    if (req.method !== "POST") throw new IntakeError("method_not_allowed", 405);
    const data = input.parse(body);
    await intakeLimit(req, "lifecycle-cancel", 20, 60, typeof identity === "string" ? identity : identity.id);
    const result = await intakeRpc("recruitment_lifecycle_cancel", {
      p_domain: domain,
      p_request: data.requestId,
      p_actor: typeof identity === "string" ? null : identity.id,
      p_hash: typeof identity === "string" ? identity : null,
      p_aal: typeof identity === "string" ? "aal1" : identity.aal || "aal1",
    });
    return sendJson(res, 200, result);
  } catch (error) {
    return intakeFailure(res, error);
  }
}
