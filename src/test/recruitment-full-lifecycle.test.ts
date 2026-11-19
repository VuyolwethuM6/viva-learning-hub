/* eslint-disable @typescript-eslint/no-explicit-any -- Full isolated SQL journey asserts heterogeneous API data. */
// @vitest-environment node
import { it,expect } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fixture,owner } from "./helpers/recruitment-m3";

it("connects a real verified application through human selection, offer, onboarding, tutor access and safe offboarding",async()=>{
 const f=await fixture();
 try{
  for(const n of ["20261115010000_recruitment_selection","20261115020000_recruitment_engagement","20261115025000_recruitment_onboarding_documents","20261115030000_recruitment_lifecycle_workers","20261115040000_recruitment_lifecycle_recovery"])await f.db.exec(readFileSync(`supabase/migrations/${n}.sql`,"utf8"));
  await f.enable();await f.db.exec("update public.recruitment_settings set selection_enabled=true,onboarding_enabled=true,activation_enabled=true");
  const vacancy=await f.vacancy("tutor",false),session=await f.email(vacancy.slug),hash=session.hash;
  let c=await f.rpc("recruitment_applicant_read",{p_hash:hash});const caseId=c.id;
  await f.rpc("recruitment_applicant_mutate",{p_hash:hash,p_action:"save",p_data:{requestId:randomUUID(),expectedRevision:c.revision,formId:c.formId,answersPatch:f.answers},p_digest:"a".repeat(64),p_key_version:1});
  c=await f.rpc("recruitment_applicant_read",{p_hash:hash});
  const received=await f.rpc("recruitment_submit",{p_hash:hash,d:{requestId:randomUUID(),expectedRevision:c.revision,formId:c.formId,poolConsent:false,privacyAcknowledged:true},p_digest:"b".repeat(64),p_key_version:1});expect(received.receipt).toBeTruthy();
  async function select(operation:string,data:Record<string,unknown>){
   const w=await f.rpc("recruitment_selection_read",{p_actor:owner,p_case:caseId,p_aal:"aal2"});
   const args={p_actor:owner,p_case:caseId,p_operation:operation,d:{requestId:randomUUID(),caseId,expectedRevision:w.selection.revision,...data},p_aal:"aal2",p_session:"c".repeat(64),p_proof:randomUUID().replaceAll("-","").repeat(2)};
   try{await f.rpc("recruitment_selection_prepare",args);return await f.rpc("recruitment_selection_mutate",args);}catch(e){throw new Error(`${operation}: ${(e as Error).message}`);}
  }
  await select("screen",{checks:[{key:"qualifications",complete:true,evidence:"SYNTHETIC-VERIFIED"}],notes:"Human reviewed original qualification evidence"});
  await select("shortlist",{outcome:"shortlisted",reason:"Human suitability review completed"});
  const interview=await select("interview_schedule",{round:1,type:"Subject demonstration",startsAt:new Date(Date.now()+2000).toISOString(),durationMinutes:30,location:"Synthetic private room",interviewerIds:[owner],reason:"Approved tutor interview"});
  const response={requestId:randomUUID(),interviewId:interview.resultId,response:"confirmed"};
  await f.rpc("recruitment_selection_response",{p_hash:hash,d:response});
  await new Promise(resolve=>setTimeout(resolve,2200));
  await select("interview_update",{interviewId:interview.resultId,status:"completed",reason:"Interview conducted by assigned human"});
  const score=await select("evaluate",{interviewId:interview.resultId,templateName:"Tutor demonstration",criteria:[{key:"Subject knowledge",score:4,maximum:5,weight:1,feedback:"Human verified mathematical explanation"}],comments:"Independent human evaluation"});
  const recommendation=await select("recommend",{outcome:"recommended",reason:"Human evidence supports offer",evaluationIds:[score.resultId]});
  await select("decide",{outcome:"approved_for_offer",reason:"Owner reviewed current human recommendation",recommendationId:recommendation.resultId});
  async function staff(operation:string,data:Record<string,unknown>={}){
   const w=await f.rpc("recruitment_engagement_read",{p_actor:owner,p_case:caseId,p_aal:"aal2"});
   try{return await f.rpc("recruitment_engagement_mutate",{p_actor:owner,p_operation:operation,p_aal:"aal2",d:{requestId:randomUUID(),caseId,expectedRevision:w.revision,...data}});}catch(e){throw new Error(`${operation}: ${(e as Error).message}`);}
  }
  async function candidate(action:string,data:Record<string,unknown>){
   const w=await f.rpc("recruitment_engagement_applicant",{p_hash:hash,p_action:"read",d:{}});
   return f.rpc("recruitment_engagement_applicant",{p_hash:hash,p_action:action,d:{requestId:randomUUID(),expectedRevision:w.revision,...data}});
  }
  const termsTemplate=await staff("template_approve",{agreementType:"independent_contractor",engagementType:"independent_contractor",title:"Synthetic approved agreement",body:"Synthetic text only. Production agreements require independent legal approval.",legalApprovalReference:"SYNTHETIC-LEGAL"});
  const offer=await staff("offer_create",{terms:{positionTitle:"Tutor",engagementType:"independent_contractor",startDate:new Date().toISOString().slice(0,10),workArrangement:"Online afternoons",reportingArrangements:"Teaching lead",compensationTerms:"Approved rate per completed session",sessionRateCents:15000,expiresAt:new Date(Date.now()+86400000).toISOString(),conditions:"Verified mandatory onboarding",agreementTemplateId:termsTemplate.id}});
  await staff("offer_approve",{offerId:offer.id});await staff("offer_issue",{offerId:offer.id});
  await candidate("offer_accept",{offerId:offer.id,acknowledged:true});
  expect((await f.db.query("select * from public.recruitment_staff_engagements")).rows).toHaveLength(0);
  await candidate("agreement_accept",{templateId:termsTemplate.id,acknowledged:true});await staff("onboarding_start",{offerId:offer.id});
  const conduct=await staff("template_approve",{agreementType:"code_of_conduct",engagementType:"independent_contractor",title:"Synthetic conduct policy",body:"Synthetic reviewed code of conduct, no legally approved production terms.",legalApprovalReference:"SYNTHETIC-CONDUCT"});
  await staff("policy_require",{templateId:conduct.id});await candidate("agreement_accept",{templateId:conduct.id,acknowledged:true});
  const onboarding=await f.rpc("recruitment_engagement_read",{p_actor:owner,p_case:caseId,p_aal:"aal2"});
  for(const task of onboarding.tasks){if(task.kind==="declaration")await candidate("task_complete",{taskId:task.id,acknowledged:true});await staff("task_verify",{taskId:task.id,documentId:null,evidenceReference:"SYNTHETIC-VERIFICATION"});}
  const userId=randomUUID();await f.db.query("insert into auth.users values($1,'applicant@example.test',clock_timestamp())",[userId]);
  const activated=await staff("activation_approve",{userId,tutorId:null,displayName:"Synthetic Applicant",subjects:["Mathematics"],grades:["Grade 12"],permissions:[],evidenceReference:"SYNTHETIC-PERSONNEL",personnelRetentionReviewAt:new Date(Date.now()+86400000*365).toISOString()});expect(activated.saved).toBe(true);
  const tutor=(await f.db.query<any>("select t.* from public.teaching_tutors t join public.recruitment_staff_engagements e on e.tutor_id=t.id where e.case_id=$1",[caseId])).rows[0];expect(tutor.enabled).toBe(true);expect(tutor.user_id).toBe(userId);
  const summary=await f.rpc("recruitment_lifecycle_summary",{p_actor:owner,p_aal:"aal2"});expect(summary.offersAccepted).toBe(1);expect(summary.activations).toBe(1);
  await staff("offboard",{effectiveDate:new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Johannesburg"}),replacementTutorId:null,reconciliationReference:"SYNTHETIC-NO-UNPAID-SESSIONS",reason:"Engagement completed by owner"});
  expect((await f.db.query<any>("select enabled from public.teaching_tutors where id=$1",[tutor.id])).rows[0].enabled).toBe(false);
  expect((await f.db.query<any>("select count(*)::int n from public.recruitment_offer_versions where case_id=$1",[caseId])).rows[0].n).toBe(1);
  expect((await f.db.query<any>("select count(*)::int n from public.recruitment_agreement_acceptances where case_id=$1",[caseId])).rows[0].n).toBe(2);
 }finally{await f.db.close();}
},120000);
