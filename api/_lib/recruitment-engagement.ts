import { handleLifecycleCancel } from "./recruitment-lifecycle-recovery.js";
import { sendApplicantOfferDocument } from "./recruitment-offer-document.js";
import type { ServerResponse } from "node:http";
import { z } from "zod";
import { readJsonBody, sendJson, type ApiRequest } from "./http.js";
import { fresh } from "./recruitment-case-service.js";
import { id, IntakeError, intakeFailure, intakeLimit, intakeRpc } from "./recruitment-intake.js";
import { engagementInput, applicantEngagementInput } from "../../src/lib/recruitment-engagement.js";
import type { RecruitmentUser } from "../../src/lib/recruitment-types.js";
const credentials = z.object({ password: z.string().min(1).max(1024), factorId: id.optional(), code: z.string().regex(/^\d{6}$/).optional() });
export async function handleRecruitmentEngagement(req: ApiRequest, res: ServerResponse, user: RecruitmentUser, url: URL) {
  try {
    if (req.method === "GET") {
      const caseId = url.searchParams.has("caseId") ? id.parse(url.searchParams.get("caseId")) : null;
      const requestId = url.searchParams.get("requestId");
      if (url.searchParams.get("view") === "personnel") return sendJson(res, 200, await intakeRpc(caseId ? "recruitment_engagement_personnel_read" : "recruitment_engagement_personnel_list", { p_actor: user.id, p_aal: user.aal || "aal1", ...(caseId ? { p_case: caseId } : {}) }));
      if (!requestId && !caseId) throw new IntakeError("invalid_request");
      return sendJson(res, 200, await intakeRpc(requestId ? "recruitment_engagement_recover" : "recruitment_engagement_read", {
        p_actor: user.id, p_case: caseId, p_aal: user.aal || "aal1", ...(requestId ? { p_request: id.parse(requestId) } : {}),
      }));
    }
    if (req.method !== "POST") throw new IntakeError("method_not_allowed", 405);
    const body = await readJsonBody(req, 45000, "recruitment");
    if (body.action === "cancel_pending") return await handleLifecycleCancel(req,res,user,"engagement",body);
    let command: ReturnType<typeof engagementInput>;
    try { command = engagementInput(body.operation, body.data); } catch { throw new IntakeError("invalid_request"); }
    if (url.searchParams.has("caseId") && command.data.caseId !== id.parse(url.searchParams.get("caseId"))) throw new IntakeError("invalid_request");
    const auth = credentials.parse(body);
    const result = await fresh(req, res, user, auth, async (verified) => intakeRpc("recruitment_engagement_mutate", {
      p_actor: verified.id, p_operation: command.operation, d: command.data, p_aal: verified.aal || "aal1",
    }), true);
    return sendJson(res, 200, result);
  } catch (error) {
    return intakeFailure(res, error instanceof z.ZodError ? new IntakeError("invalid_request") : error);
  }
}
export async function handleApplicantEngagement(req: ApiRequest, res: ServerResponse, hash: string, requestUrl?: URL) {
  try {
    if (req.method === "GET") {
      const url = requestUrl || new URL(req.url || "", "http://localhost"), requestId = url.searchParams.get("requestId");
      if (url.searchParams.get("document") === "offer") return await sendApplicantOfferDocument(req,res,hash,url);
      return sendJson(res, 200, await intakeRpc("recruitment_engagement_applicant", { p_hash: hash, p_action: requestId ? "recover" : "read", d: requestId ? { requestId: id.parse(requestId) } : {} }));
    }
    if (req.method !== "POST") throw new IntakeError("method_not_allowed", 405);
    await intakeLimit(req, "engagement", 20, 60, hash);
    const body = await readJsonBody(req, 4096, "recruitment");
    if (body.action === "cancel_pending") return await handleLifecycleCancel(req,res,hash,"engagement",body);
    let command: ReturnType<typeof applicantEngagementInput>;
    try { command = applicantEngagementInput(body.operation ?? body.action, body.data); } catch { throw new IntakeError("invalid_request"); }
    return sendJson(res, 200, await intakeRpc("recruitment_engagement_applicant", { p_hash: hash, p_action: command.operation, d: command.data }));
  } catch (error) { return intakeFailure(res, error); }
}
