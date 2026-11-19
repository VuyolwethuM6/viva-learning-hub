/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic SQL exercises heterogeneous RPC results. */
// @vitest-environment node
import { beforeAll,afterAll,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fixture,owner,manager } from "./helpers/recruitment-m3";
import { selectionCommands } from "../lib/recruitment-selection";
let f:Awaited<ReturnType<typeof fixture>>,caseId:string,hash:string;
const migration=readFileSync("supabase/migrations/20261115010000_recruitment_selection.sql","utf8");
async function command(operation:string,data:Record<string,unknown>,actor=owner,aal="aal2") {
 const d={requestId:randomUUID(),caseId,expectedRevision:0,...data},proof=randomUUID().replaceAll("-","").repeat(2);
 const args={p_actor:actor,p_case:caseId,p_operation:operation,d,p_aal:aal,p_session:"a".repeat(64),p_proof:proof};
 await f.rpc("recruitment_selection_prepare",args);
 return f.rpc("recruitment_selection_mutate",args);
}
async function revision(){return (await f.rpc("recruitment_selection_read",{p_actor:owner,p_case:caseId,p_aal:"aal2"})).selection.revision;}
beforeAll(async()=>{
 f=await fixture();await f.db.exec(migration);await f.enable();
 const v=await f.vacancy("tutor",false),s=await f.email(v.slug);hash=s.hash;
 let read=await f.rpc("recruitment_applicant_read",{p_hash:hash});
 await f.rpc("recruitment_applicant_mutate",{p_hash:hash,p_action:"save",p_data:{requestId:randomUUID(),expectedRevision:read.revision,formId:read.formId,answersPatch:f.answers},p_digest:"f".repeat(64),p_key_version:1});
 read=await f.rpc("recruitment_applicant_read",{p_hash:hash});
 await f.rpc("recruitment_submit",{p_hash:hash,d:{requestId:randomUUID(),expectedRevision:read.revision,formId:read.formId,poolConsent:false,privacyAcknowledged:true},p_digest:"1".repeat(64),p_key_version:1});
 caseId=(await f.db.query<any>("select id from public.recruitment_cases where state='submitted'")).rows[0].id;
},60000);
afterAll(async()=>{await f?.db.close();});
it("installs disabled, RLS protected and preserves M3 case",async()=>{
 expect((await f.rpc("recruitment_selection_read",{p_actor:owner})).enabled).toBe(false);
 const tables=await f.db.query<any>("select relname,relrowsecurity from pg_class where relname like 'recruitment_selection_%' and relkind='r'");
 expect(tables.rows.length).toBeGreaterThanOrEqual(9);expect(tables.rows.every(r=>r.relrowsecurity)).toBe(true);
 await f.db.exec("set role authenticated");await expect(f.db.query("select * from public.recruitment_selection_cases")).rejects.toThrow();await f.db.exec("reset role");
 await expect(command("screen",{checks:[{key:"qualification",complete:true,evidence:"reviewed"}],notes:"Disabled mutation"})).rejects.toThrow("intake_disabled");
 await f.db.exec("update public.recruitment_settings set selection_enabled=true");
});
it("requires scope, authoritative completeness, fresh confirmation and revision checks",async()=>{
 await expect(command("screen",{checks:[{key:"qualification",complete:true,evidence:"reviewed"}],notes:"Reviewed qualifications"},manager)).rejects.toThrow();
 await expect(f.rpc("recruitment_selection_mutate",{p_actor:owner,p_case:caseId,p_operation:"screen",d:{requestId:randomUUID(),caseId,expectedRevision:0},p_aal:"aal2",p_session:"a".repeat(64),p_proof:"b".repeat(64)})).rejects.toThrow("fresh_confirmation_required");
 await command("screen",{checks:[{key:"qualification",complete:false,evidence:"pending"}],notes:"Await qualification evidence"});
 await expect(command("shortlist",{expectedRevision:await revision(),outcome:"shortlisted",reason:"Ready for interview"})).rejects.toThrow("screening_incomplete");
 await expect(command("screen",{checks:[{key:"qualification",complete:true,evidence:"verified"}],notes:"All checks completed"})).rejects.toThrow("revision_conflict");
 await command("screen",{expectedRevision:await revision(),checks:[{key:"qualification",complete:true,evidence:"verified"}],notes:"All checks completed"});
 await command("shortlist",{expectedRevision:await revision(),outcome:"shortlisted",reason:"Ready for interview"});
});
it("serializes concurrent commands, detects booking conflicts and supports applicant-safe responses",async()=>{
 const first={expectedRevision:await revision(),round:1,type:"Subject interview",startsAt:new Date(Date.now()+86400000).toISOString(),durationMinutes:60,location:"Private meeting link",interviewerIds:[owner],reason:"First round"};
 const results=await Promise.allSettled([command("interview_schedule",first),command("interview_schedule",first)]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 await expect(command("interview_schedule",{...first,expectedRevision:await revision()})).rejects.toThrow("interview_conflict");
 const safe=await f.rpc("recruitment_selection_applicant",{p_hash:hash});
 expect(safe).not.toHaveProperty("evaluations");expect(safe).not.toHaveProperty("screening");
 const input={requestId:randomUUID(),interviewId:safe.interviews[0].id,response:"confirmed"};
 expect((await f.rpc("recruitment_selection_response",{p_hash:hash,d:input})).saved).toBe(true);
 expect((await f.rpc("recruitment_selection_response",{p_hash:hash,d:input})).saved).toBe(true);
});
it("supports role assessments with assigned reviewers, evidence gates and immutable results",async()=>{
 const created=await command("assessment_create",{expectedRevision:await revision(),title:"Demonstration lesson",instructions:"Prepare a CAPS aligned lesson and demonstrate it",dueAt:new Date(Date.now()+86400000).toISOString(),evaluatorIds:[owner],criteria:["Lesson planning","CAPS alignment"],evidenceRequired:true});
 await expect(command("assessment_complete",{expectedRevision:await revision(),assessmentId:created.resultId,result:"completed",feedback:"Lesson reviewed"})).rejects.toThrow("assessment_evidence_required");
 await command("assessment_complete",{expectedRevision:await revision(),assessmentId:created.resultId,result:"completed",feedback:"Lesson evidence reviewed",evidenceRef:"case-private/lesson-reviewed"});
 const detail=await f.rpc("recruitment_selection_read",{p_actor:owner,p_case:caseId,p_aal:"aal2"});
 expect(detail.assessments[0].state).toBe("completed");
 expect(detail.assessments[0].results[0].feedback).toContain("reviewed");
 const applicant=await f.rpc("recruitment_selection_applicant",{p_hash:hash});
 expect(applicant.assessments[0]).toEqual(expect.objectContaining({title:"Demonstration lesson",instructions:"Prepare a CAPS aligned lesson and demonstrate it",state:"completed"}));
 for(const key of ["criteria","evaluator_ids","results","feedback","evidence_ref","created_by"])expect(applicant.assessments[0]).not.toHaveProperty(key);

 await expect(f.db.exec("update public.recruitment_selection_assessment_results set feedback='tampered'")).rejects.toThrow();
});
it("requires explicit owner approval to supersede an assessment without erasing prior results",async()=>{
 const assessment={title:"Additional demonstration",instructions:"Present the required lesson evidence",dueAt:new Date(Date.now()+86400000).toISOString(),evaluatorIds:[owner],criteria:["Lesson evidence"],evidenceRequired:false};
 const first=await command("assessment_create",{expectedRevision:await revision(),...assessment});
 await command("assessment_complete",{expectedRevision:await revision(),assessmentId:first.resultId,result:"not_completed",feedback:"Evidence could not be completed"});
 await expect(command("assessment_create",{expectedRevision:await revision(),...assessment,supersedesId:first.resultId},owner,"aal1")).rejects.toThrow("mfa_required");
 const replacement=await command("assessment_create",{expectedRevision:await revision(),...assessment,supersedesId:first.resultId});
 await command("assessment_complete",{expectedRevision:await revision(),assessmentId:replacement.resultId,result:"completed",feedback:"New human review completed"});
 const w=await f.rpc("recruitment_selection_read",{p_actor:owner,p_case:caseId,p_aal:"aal2"});
 expect(w.assessments.find((a:any)=>a.id===first.resultId)).toEqual(expect.objectContaining({state:"superseded",results:[expect.objectContaining({result:"not_completed",feedback:"Evidence could not be completed"})]}));
 expect(w.assessments.find((a:any)=>a.id===replacement.resultId)).toEqual(expect.objectContaining({state:"completed",supersedes_id:first.resultId}));
});
it("replays committed commands exactly and recovers their result without duplicate evidence",async()=>{
 const d={requestId:randomUUID(),caseId,expectedRevision:await revision(),round:2,type:"Second round",startsAt:new Date(Date.now()+2*86400000).toISOString(),durationMinutes:60,location:"Private meeting link",interviewerIds:[owner],reason:"Second round interview"};
 const args={p_actor:owner,p_case:caseId,p_operation:"interview_schedule",d,p_aal:"aal2",p_session:"a".repeat(64),p_proof:"c".repeat(64)};
 await f.rpc("recruitment_selection_prepare",args);
 expect((await f.rpc("recruitment_selection_recover",{p_actor:owner,p_request:d.requestId,p_aal:"aal2"})).state).toBe("pending");
 const first=await f.rpc("recruitment_selection_mutate",args);
 expect(await f.rpc("recruitment_selection_mutate",args)).toEqual(first);
 expect((await f.rpc("recruitment_selection_recover",{p_actor:owner,p_request:d.requestId,p_aal:"aal2"})).result).toEqual(first);
 await expect(f.rpc("recruitment_selection_mutate",{...args,d:{...d,reason:"Changed reason"}})).rejects.toThrow("request_conflict");
 await command("interview_update",{expectedRevision:await revision(),interviewId:first.resultId,status:"cancelled",reason:"Second round no longer required"});
 const detail=await f.rpc("recruitment_selection_read",{p_actor:owner,p_case:caseId,p_aal:"aal2"});
 expect(detail.interviewHistory.length).toBeGreaterThanOrEqual(3);
 const own=await f.rpc("recruitment_selection_applicant_recover",{p_hash:hash,p_request:d.requestId});
 expect(own.state).toBe("not_recorded");
});
it("protects immutable evaluations, corrections, human decisions and owner MFA",async()=>{
 const w=await f.rpc("recruitment_selection_read",{p_actor:owner,p_case:caseId,p_aal:"aal2"});
 await f.db.query("update public.recruitment_selection_interviews set starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' where id=$1",[w.interviews.find((x:any)=>x.status==="scheduled").id]);
 await command("interview_update",{expectedRevision:await revision(),interviewId:w.interviews.find((x:any)=>x.status==="scheduled").id,status:"completed",reason:"Interview completed"});
 const criteria=[{key:"Subject knowledge",score:4,maximum:5,weight:1,feedback:"Strong subject knowledge"}];
 const e=await command("evaluate",{expectedRevision:await revision(),interviewId:w.interviews.find((x:any)=>x.status==="scheduled").id,templateName:"Tutor interview",criteria,comments:"Evidence recorded"});
 await expect(f.db.query("update public.recruitment_selection_evaluations set comments='changed' where id=$1",[e.resultId])).rejects.toThrow();
 const corrected=await command("evaluate",{expectedRevision:await revision(),interviewId:w.interviews.find((x:any)=>x.status==="scheduled").id,templateName:"Tutor interview",criteria,comments:"Correction recorded",replacesId:e.resultId,correctionReason:"Correct transcription"});
 expect(corrected.resultId).not.toBe(e.resultId);
 const staleRec=await command("recommend",{expectedRevision:await revision(),outcome:"recommended",reason:"Evidence supports recommendation",evaluationIds:[corrected.resultId]});
 const newest=await command("evaluate",{expectedRevision:await revision(),interviewId:w.interviews.find((x:any)=>x.status==="scheduled").id,templateName:"Tutor interview",criteria,comments:"Second correction",replacesId:corrected.resultId,correctionReason:"Second transcription review"});
 await command("recommend",{expectedRevision:await revision(),outcome:"recommended",reason:"Current review for later owner decision",evaluationIds:[newest.resultId]});
 await expect(command("decide",{expectedRevision:await revision(),outcome:"approved_for_offer",reason:"Owner must see current evidence",recommendationId:staleRec.resultId})).rejects.toThrow("evaluation_changed");
 const rec=await command("recommend",{expectedRevision:await revision(),outcome:"recommended",reason:"Current corrected evidence",evaluationIds:[newest.resultId]});
 await expect(command("decide",{expectedRevision:await revision(),outcome:"approved_for_offer",reason:"Owner approval",recommendationId:rec.resultId},owner,"aal1")).rejects.toThrow("mfa_required");
 await expect(command("decide",{expectedRevision:await revision(),outcome:"approved_for_offer",reason:"Owner approval",recommendationId:rec.resultId},manager)).rejects.toThrow();
 await command("decide",{expectedRevision:await revision(),outcome:"approved_for_offer",reason:"Owner approval",recommendationId:rec.resultId});
 expect(await f.rpc("recruitment_selection_approved",{p_case:caseId})).toBe(true);
 await expect(command("screen",{expectedRevision:await revision(),checks:[{key:"test",complete:true,evidence:"test"}],notes:"Attempt overwrite"})).rejects.toThrow("decision_final");
});
it("validates score bounds and correction reasons",()=>{
 expect(selectionCommands.evaluate.safeParse({requestId:randomUUID(),caseId:randomUUID(),expectedRevision:0,interviewId:randomUUID(),templateName:"Tutor",criteria:[{key:"test",score:10,maximum:5,weight:1,feedback:"Evidence"}],comments:"Evidence"}).success).toBe(false);
});

it("keeps reporting scoped and rechecks flags even after a committed decision",async()=>{
 const summary=await f.rpc("recruitment_selection_summary",{p_actor:owner,p_aal:"aal2"});
 expect(summary.byStage).toEqual([{stage:"approved_for_offer",count:1}]);
 expect(summary.byVacancyStatus).toEqual([{status:"published",count:1}]);
 expect(JSON.stringify(summary)).not.toContain("Synthetic Applicant");
 await f.db.exec("update public.recruitment_settings set selection_enabled=false");
 expect((await f.rpc("recruitment_selection_read",{p_actor:owner,p_case:caseId,p_aal:"aal2"})).enabled).toBe(false);
 await expect(command("screen",{expectedRevision:0,checks:[{key:"test",complete:true,evidence:"verified"}],notes:"Disabled"})).rejects.toThrow();
 await f.db.exec("update public.recruitment_settings set selection_enabled=true");
});

async function anotherSubmitted(email="additional@example.test") {
 const v=await f.vacancy("tutor",false),s=await f.email(v.slug,email);
 let r=await f.rpc("recruitment_applicant_read",{p_hash:s.hash});
 await f.rpc("recruitment_applicant_mutate",{p_hash:s.hash,p_action:"save",p_data:{requestId:randomUUID(),expectedRevision:r.revision,formId:r.formId,answersPatch:f.answers},p_digest:"a".repeat(64),p_key_version:1});
 r=await f.rpc("recruitment_applicant_read",{p_hash:s.hash});
 await f.rpc("recruitment_submit",{p_hash:s.hash,d:{requestId:randomUUID(),expectedRevision:r.revision,formId:r.formId,poolConsent:false,privacyAcknowledged:true},p_digest:"b".repeat(64),p_key_version:1});
 return {id:r.id,hash:s.hash,scope:v.scope_id};
}
it("separates applicant information requests from private screening reasons and permits replies",async()=>{
 const previous=caseId,c=await anotherSubmitted();caseId=c.id;
 await command("screen",{checks:[{key:"qualification",complete:false,evidence:"Private reviewer evidence"}],notes:"Private suitability notes"});
 await expect(command("shortlist",{expectedRevision:await revision(),outcome:"information_requested",reason:"Private eligibility discussion"})).rejects.toThrow("applicant_message_required");
 const d={requestId:randomUUID(),caseId,expectedRevision:await revision(),outcome:"information_requested",reason:"Private eligibility discussion",applicantMessage:"Please clarify your qualification details in a reply."};
 expect(selectionCommands.shortlist.safeParse(d).success).toBe(true);
 await command("shortlist",d);
 const applicant=await f.rpc("recruitment_applicant_read",{p_hash:c.hash});
 const messages=await f.rpc("recruitment_applicant_messages",{p_hash:c.hash});
 expect(messages[0].text).toBe(d.applicantMessage);
 await f.rpc("recruitment_applicant_reply",{p_hash:c.hash,d:{requestId:randomUUID(),expectedRevision:applicant.revision,replyTo:messages[0].id,text:"My qualification was completed in 2025."},p_digest:"c".repeat(64),p_key_version:1});
 expect((await f.rpc("recruitment_applicant_messages",{p_hash:c.hash})).some((m:any)=>m.kind==="reply")).toBe(true);
 expect(JSON.stringify(applicant)).not.toContain("Private eligibility discussion");
 expect(JSON.stringify(applicant)).not.toContain("Private suitability notes");
 const ownRequest=await f.rpc("recruitment_selection_applicant_recover",{p_hash:c.hash,p_request:d.requestId});expect(ownRequest.state).toBe("not_recorded");
 caseId=previous;
});
it("requires active scope plus case assignment and honors conflicts even for owner",async()=>{
 const previous=caseId,c=await anotherSubmitted("scoped-selection@example.test");caseId=c.id;
 await f.change("staff_grant",{userId:manager,role:"manager",enabled:true,expectedRevision:-1});
 const screen={checks:[{key:"qualification",complete:true,evidence:"Reviewed"}],notes:"Manager screening"};
 await expect(command("screen",screen,manager)).rejects.toThrow("access_denied");
 await f.change("scope_grant",{userId:manager,scopeId:c.scope,enabled:true,expectedRevision:-1});
 await expect(command("screen",screen,manager)).rejects.toThrow("access_denied");
 await f.db.query("insert into public.recruitment_case_assignments(case_id,user_id,enabled,granted_by) values($1,$2,true,$3)",[caseId,manager,owner]);
 await command("screen",screen,manager);
 await f.db.query("update public.recruitment_case_assignments set enabled=false,revision=revision+1 where case_id=$1 and user_id=$2",[caseId,manager]);
 await expect(command("screen",{...screen,expectedRevision:await revision()},manager)).rejects.toThrow("access_denied");
 const conflicted=await anotherSubmitted("owner@example.test");caseId=conflicted.id;
 await expect(command("screen",screen)).rejects.toThrow("access_denied");
 caseId=previous;
});
it("records owner unsuccessful closure with six-month retention and immutable final decision",async()=>{
 const previous=caseId,c=await anotherSubmitted("unsuccessful-selection@example.test");caseId=c.id;
 await command("screen",{checks:[{key:"qualification",complete:false,evidence:"Requirement not met"}],notes:"Human suitability review"});
 await command("shortlist",{expectedRevision:await revision(),outcome:"not_shortlisted",reason:"Required qualification not established"});
 const rec=await command("recommend",{expectedRevision:await revision(),outcome:"not_recommended",reason:"Human reviewed minimum requirements",evaluationIds:[]});
 await command("decide",{expectedRevision:await revision(),outcome:"unsuccessful",reason:"Owner reviewed complete recommendation",recommendationId:rec.resultId});
 const row=(await f.db.query<any>("select unsuccessful_closed_at,retention_due_at,(((unsuccessful_closed_at at time zone 'Africa/Johannesburg')+interval '6 months') at time zone 'Africa/Johannesburg') expected from public.recruitment_cases where id=$1",[caseId])).rows[0];
 expect(row.unsuccessful_closed_at).not.toBeNull();expect(row.retention_due_at).toEqual(row.expected);
 await expect(command("decide",{expectedRevision:await revision(),outcome:"approved_for_offer",reason:"Duplicate final decision",recommendationId:rec.resultId})).rejects.toThrow("decision_final");
 const beforeWithdrawal=await f.rpc("recruitment_applicant_read",{p_hash:c.hash});
 await f.rpc("recruitment_privacy_command",{p_hash:c.hash,p_action:"withdraw",d:{requestId:randomUUID(),expectedRevision:beforeWithdrawal.revision,formId:beforeWithdrawal.formId,noticeVersion:beforeWithdrawal.noticeVersion,consent:false},p_digest:"e".repeat(64),p_key_version:1});
 await expect(f.rpc("recruitment_selection_applicant",{p_hash:c.hash})).rejects.toThrow();
 await expect(f.rpc("recruitment_selection_read",{p_actor:owner,p_case:caseId,p_aal:"aal2"})).rejects.toThrow("access_denied");
 caseId=previous;
});
