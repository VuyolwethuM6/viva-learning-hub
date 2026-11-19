import { handleLifecycleCancel } from "./recruitment-lifecycle-recovery.js";
import type { ServerResponse } from "node:http";
import { z } from "zod";
import { readJsonBody, sendJson, type ApiRequest } from "./http.js";
import type { RecruitmentUser } from "../../src/lib/recruitment-types.js";
import { selectionCommands, selectionStages, type SelectionOperation } from "../../src/lib/recruitment-selection.js";
import { fresh } from "./recruitment-case-service.js";
import { id, IntakeError, intakeFailure, intakeLimit, intakeRpc, secret, sha256 } from "./recruitment-intake.js";
const list = z.object({ action:z.literal("list"),search:z.string().trim().max(160).default(""),status:z.enum(["",...selectionStages]).default(""),offset:z.number().int().min(0).max(100000).default(0),vacancyId:id.optional() }).strict();
export async function handleRecruitmentSelection(req:ApiRequest,res:ServerResponse,user:RecruitmentUser,url:URL) {
 try {
  if(req.method==="GET") {
   if(url.searchParams.has("search")) throw new IntakeError("invalid_request");
   const requestId=url.searchParams.get("requestId");
   if(requestId) return sendJson(res,200,await intakeRpc("recruitment_selection_recover",{p_actor:user.id,p_request:id.parse(requestId),p_aal:user.aal||"aal1"}));
   if(url.searchParams.get("report")==="summary") return sendJson(res,200,await intakeRpc("recruitment_lifecycle_summary",{p_actor:user.id,p_aal:user.aal||"aal1"}));
   const caseId=url.searchParams.get("caseId");
   return sendJson(res,200,await intakeRpc("recruitment_selection_read",{p_actor:user.id,p_case:caseId?id.parse(caseId):null,p_aal:user.aal||"aal1",p_status:z.enum(["",...selectionStages]).parse(url.searchParams.get("status")||""),p_offset:z.coerce.number().int().min(0).max(100000).parse(url.searchParams.get("offset")||"0")}));
  }
  if(req.method!=="POST") return sendJson(res,405,{error:"method_not_allowed"});
  const input=await readJsonBody(req,65536,"Recruitment selection");
  if(input.action==="cancel_pending") return await handleLifecycleCancel(req,res,user,"selection",input);
  if(input.action==="list") {
   const body=list.parse(input);await intakeLimit(req,"selection-search",60,60,user.id);
   return sendJson(res,200,await intakeRpc("recruitment_selection_read",{p_actor:user.id,p_aal:user.aal||"aal1",p_search:body.search,p_status:body.status,p_offset:body.offset,p_vacancy:body.vacancyId||null}));
  }
  const body=z.object({operation:z.enum(Object.keys(selectionCommands) as [SelectionOperation,...SelectionOperation[]]),data:z.record(z.unknown()),password:z.string().min(1).max(1024),factorId:id.optional(),code:z.string().regex(/^\d{6}$/).optional()}).strict().parse(input);
  const data=selectionCommands[body.operation].parse(body.data);
  await intakeLimit(req,"selection-command",20,60,user.id);
  const result=await fresh(req,res,user,body,async(verified,session)=>{
   const proof=sha256(secret());
   const args={p_actor:verified.id,p_case:data.caseId,p_operation:body.operation,d:data,p_aal:verified.aal||"aal1",p_session:session,p_proof:proof};
   await intakeRpc("recruitment_selection_prepare",args);
   return intakeRpc("recruitment_selection_mutate",args);
  },body.operation === "decide" || ("supersedesId" in data && !!data.supersedesId));
  return sendJson(res,200,{result});
 } catch(error) { return intakeFailure(res,error); }
}
