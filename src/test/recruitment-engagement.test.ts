/* eslint-disable @typescript-eslint/no-explicit-any -- isolated SQL test assertions validate heterogeneous RPC data. */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fixture, owner, manager } from "./helpers/recruitment-m3";
import { engagementInput, applicantEngagementInput } from "../lib/recruitment-engagement";
let f: Awaited<ReturnType<typeof fixture>>;
let caseId: string, hash: string, template: string, offer: string;
let teachingClass: string, completedSession: string;
const future = () => new Date(Date.now() + 7 * 86400000).toISOString();
async function revision() { return (await f.rpc("recruitment_engagement_read", { p_actor: owner, p_case: caseId, p_aal: "aal2" })).revision; }
async function change(operation: string, data: Record<string, unknown> = {}, actor = owner, aal = "aal2") {
 const d = {requestId:randomUUID(),caseId,expectedRevision:await revision(),...data};
 return f.rpc("recruitment_engagement_mutate",{p_actor:actor,p_operation:operation,d,p_aal:aal});
}
async function applicant(action: string, data: Record<string, unknown> = {}) {
 return f.rpc("recruitment_engagement_applicant",{p_hash:hash,p_action:action,d:{requestId:randomUUID(),expectedRevision:await revision(),...data}});
}
beforeAll(async()=>{
 f=await fixture();
 for(const n of ['20261115010000_recruitment_selection','20261115020000_recruitment_engagement']) await f.db.exec(readFileSync(`supabase/migrations/${n}.sql`,'utf8')).catch(e=>{throw new Error(`${n}: ${e.message}; ${e.position}`)});
 await f.enable();
 await f.db.exec("update public.recruitment_settings set onboarding_enabled=true");
 // Selection flag remains default-off in production; enabled only in disposable test.
 await f.db.exec("update public.recruitment_settings set selection_enabled=true").catch(()=>undefined);
 const v=await f.vacancy('tutor',false),s=await f.email(v.slug);hash=s.hash;
 const r=await f.rpc('recruitment_applicant_read',{p_hash:hash});caseId=r.id;
 await f.rpc('recruitment_applicant_mutate',{p_hash:hash,p_action:'save',p_data:{requestId:randomUUID(),expectedRevision:r.revision,formId:r.formId,answersPatch:f.answers},p_digest:'a'.repeat(64),p_key_version:1});
 const saved=await f.rpc('recruitment_applicant_read',{p_hash:hash});
 await f.rpc('recruitment_submit',{p_hash:hash,d:{requestId:randomUUID(),expectedRevision:saved.revision,formId:saved.formId,poolConsent:false,privacyAcknowledged:true},p_digest:'b'.repeat(64),p_key_version:1});
 await f.db.query("insert into public.recruitment_selection_cases(case_id,stage,decision) values($1,'approved_for_offer','approved_for_offer')",[caseId]);
 const recommendation=randomUUID();
 await f.db.query("insert into public.recruitment_selection_recommendations(id,case_id,outcome,reason,evaluation_ids,actor_id) values($1,$2,'recommended','Synthetic independently tested M4 prerequisite','{}',$3)",[recommendation,caseId,owner]);
 await f.db.query("insert into public.recruitment_selection_decisions(case_id,outcome,reason,recommendation_id,decided_by) values($1,'approved_for_offer','Synthetic M4 approval',$2,$3)",[caseId,recommendation,owner]);
},120000);
afterAll(async()=>{await f?.db.close();});
describe('M5 owner and candidate engagement lifecycle',()=>{
 it('installs least privilege and default-off activation without changing existing business tables',async()=>{
  const flags=await f.db.query<any>('select activation_enabled from public.recruitment_settings');expect(flags.rows[0].activation_enabled).toBe(false);
  await f.db.exec('update public.recruitment_settings set onboarding_enabled=false');
  await expect(change('template_approve',{agreementType:'independent_contractor',engagementType:'independent_contractor',title:'Synthetic disabled agreement',body:'Synthetic agreement requiring actual legal review for production.',legalApprovalReference:'SYNTHETIC-LEGAL'})).rejects.toThrow('onboarding_disabled');
  await f.db.exec('update public.recruitment_settings set onboarding_enabled=true');
  for(const role of ['anon','authenticated','service_role']) expect((await f.db.query<any>("select has_table_privilege($1,'public.recruitment_offer_versions','SELECT') allowed",[role])).rows[0].allowed).toBe(false);
  await expect(change('template_approve',{agreementType:'independent_contractor',engagementType:'independent_contractor',title:'Synthetic agreement',body:'Synthetic agreement requiring actual legal review for production.',legalApprovalReference:'SYNTHETIC-LEGAL'},manager)).rejects.toThrow();
 });
 it('requires owner AAL2 and creates approved immutable legal template',async()=>{
  const data={agreementType:'independent_contractor',engagementType:'independent_contractor',title:'Synthetic agreement',body:'Synthetic agreement requiring actual legal review for production.',legalApprovalReference:'SYNTHETIC-LEGAL'};
  await expect(change('template_approve',data,owner,'aal1')).rejects.toThrow();
  template=(await change('template_approve',data)).id;
  await expect(f.db.query("update public.recruitment_agreement_templates set body='modified' where id=$1",[template])).rejects.toThrow();
 });
 it('creates versioned offer and exact replay, rejects stale revision and payload reuse',async()=>{
  const d={requestId:randomUUID(),caseId,expectedRevision:await revision(),terms:{positionTitle:'Synthetic tutor',engagementType:'independent_contractor',startDate:future().slice(0,10),workArrangement:'Online afternoons',reportingArrangements:'Teaching lead',compensationTerms:'Synthetic agreed per completed session',sessionRateCents:10000,expiresAt:future(),conditions:'Subject to verified onboarding',agreementTemplateId:template}};
  const a={p_actor:owner,p_operation:'offer_create',d,p_aal:'aal2'};
  const r=await f.rpc('recruitment_engagement_mutate',a);offer=r.id;
  expect((await f.rpc('recruitment_engagement_mutate',a)).replayed).toBe(true);
  await expect(f.rpc('recruitment_engagement_mutate',{...a,d:{...d,terms:{...d.terms,positionTitle:'Changed'}}})).rejects.toThrow('request_conflict');
  await expect(f.rpc('recruitment_engagement_mutate',{...a,d:{...d,requestId:randomUUID()}})).rejects.toThrow('revision_conflict');
  await expect(f.db.query("update public.recruitment_offer_versions set terms='{}' where id=$1",[offer])).rejects.toThrow();
  const applicantRead=await f.rpc('recruitment_engagement_applicant',{p_hash:hash,p_action:'read',d:{}});expect(applicantRead.offers).toHaveLength(0);expect(applicantRead.templates).toHaveLength(0);
 });
 it('requires approval before issue and applicant cannot approve or access another case',async()=>{
  await expect(change('offer_issue',{offerId:offer})).rejects.toThrow('invalid_transition');
  await change('offer_approve',{offerId:offer});
  await change('offer_issue',{offerId:offer});
  await expect(applicant('offer_accept',{offerId:randomUUID(),acknowledged:true})).rejects.toThrow('offer_unavailable');
  const read=await f.rpc('recruitment_engagement_applicant',{p_hash:hash,p_action:'read',d:{}});expect(read.offers[0].status).toBe('issued');expect(read.events).toEqual([]);expect(read.templates[0].legal_approval_reference).toBe(null);
  const attempt={requestId:randomUUID(),expectedRevision:await revision(),offerId:offer,acknowledged:true};
  const races=await Promise.allSettled([f.rpc('recruitment_engagement_applicant',{p_hash:hash,p_action:'offer_accept',d:attempt}),f.rpc('recruitment_engagement_applicant',{p_hash:hash,p_action:'offer_accept',d:{...attempt,requestId:randomUUID()}})]);
  expect(races.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await f.rpc('recruitment_engagement_applicant',{p_hash:hash,p_action:'offer_accept',d:attempt})).replayed).toBe(true);
  expect((await f.db.query<any>('select * from public.recruitment_staff_engagements')).rows).toHaveLength(0);
  expect((await f.rpc('recruitment_engagement_applicant',{p_hash:hash,p_action:'recover',d:{requestId:attempt.requestId}})).state).toBe('committed');
 });
 it('starts role onboarding, records immutable agreement acceptance and verifies tasks',async()=>{
  await change('onboarding_start',{offerId:offer});
  await applicant('agreement_accept',{templateId:template,acknowledged:true});
  const policy=(await change('template_approve',{agreementType:'code_of_conduct',engagementType:'independent_contractor',title:'Synthetic conduct policy',body:'Synthetic conduct policy text requiring actual legal approval for production.',legalApprovalReference:'SYNTHETIC-POLICY'})).id;
  await change('policy_require',{templateId:policy});
  await applicant('agreement_accept',{templateId:policy,acknowledged:true});
  await expect(f.db.exec("update public.recruitment_agreement_acceptances set method='other'")).rejects.toThrow();
  const read=await f.rpc('recruitment_engagement_read',{p_actor:owner,p_case:caseId,p_aal:'aal2'});
  expect(read.tasks.map((t:any)=>t.key)).toContain('qualifications');
  for(const task of read.tasks){
   if(task.kind==='declaration')await applicant('task_complete',{taskId:task.id,acknowledged:true});
   await change('task_verify',{taskId:task.id,documentId:null,evidenceReference:'SYNTHETIC-CHECK'});
  }
  expect((await f.rpc('recruitment_engagement_read',{p_actor:owner,p_case:caseId,p_aal:'aal2'})).tasks.every((t:any)=>t.status==='verified')).toBe(true);
 });
 it('keeps activation disabled until explicit feature approval and checks candidate identity',async()=>{
  const uid=randomUUID();await f.db.query("insert into auth.users values($1,'applicant@example.test',now())",[uid]);
  const data={userId:uid,tutorId:null,displayName:'Synthetic Applicant',subjects:['Mathematics'],grades:['Grade 12'],permissions:[],evidenceReference:'SYNTHETIC-PERSONNEL',personnelRetentionReviewAt:future()};
  await expect(change('activation_approve',data)).rejects.toThrow('activation_disabled');
  await f.db.exec('update public.recruitment_settings set activation_enabled=true');
  await expect(change('activation_approve',{...data,userId:manager})).rejects.toThrow();
  await expect(change('activation_approve',{...data,subjects:['Unapproved invented subject']})).rejects.toThrow('invalid_subject');
  const d={requestId:randomUUID(),caseId,expectedRevision:await revision(),...data};
  const attempts=await Promise.allSettled([f.rpc('recruitment_engagement_mutate',{p_actor:owner,p_operation:'activation_approve',d,p_aal:'aal2'}),f.rpc('recruitment_engagement_mutate',{p_actor:owner,p_operation:'activation_approve',d:{...d,requestId:randomUUID()},p_aal:'aal2'})]);
  expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await f.rpc('recruitment_engagement_mutate',{p_actor:owner,p_operation:'activation_approve',d,p_aal:'aal2'})).replayed).toBe(true);
  const active=(await f.db.query<any>('select * from public.recruitment_staff_engagements where case_id=$1',[caseId])).rows[0];
  expect(active.status).toBe('active');expect(active.user_id).toBe(uid);
  expect((await f.db.query<any>('select enabled from public.teaching_tutors where id=$1',[active.tutor_id])).rows[0].enabled).toBe(true);
  expect((await f.db.query<any>('select * from public.admin_users where user_id=$1',[uid])).rows).toHaveLength(0);
  expect((await f.db.query<any>('select * from public.recruitment_privacy_holds where case_id=$1',[caseId])).rows).toHaveLength(1);
  await expect(change('activation_approve',data)).rejects.toThrow();
  await expect(change('task_require',{key:'late_requirement',label:'Late requirement',kind:'required_check',required:true,dueAt:future()})).rejects.toThrow('onboarding_locked_after_activation');
 });
 it('enforces approved tutor scheduling and prepares approved sessions once in account 5000',async()=>{
  const a=(await f.db.query<any>('select * from public.recruitment_staff_engagements where case_id=$1',[caseId])).rows[0];
  await f.db.query("select set_config('viva.teaching_actor',$1,false)",[owner]);
  const venue=randomUUID(),topic=randomUUID();
  await f.db.query("insert into public.teaching_venues(id,name,mode,detail) values($1,'Synthetic room','Online','https://example.test/room')",[venue]);
  await f.db.query("insert into public.teaching_topics(id,grade,subject,title,goal) values($1,'Grade 12','Mathematics','Synthetic algebra','Synthetic practice with algebra')",[topic]);
  async function newClass(subject='Mathematics',grade='Grade 12',group='A'){
   return (await f.db.query<any>("insert into public.teaching_classes(name,grade,subject,group_name,season,tutor_id,venue_id,weekdays,starts_at,ends_at) values('Synthetic class',$1,$2,$3,2026,$4,$5,array[1,2]::smallint[],'16:00','17:00') returning id",[grade,subject,group,a.tutor_id,venue])).rows[0].id;
  }
  teachingClass=await newClass();
  await expect(newClass('Physical Sciences','Grade 12','B')).rejects.toThrow('approved_teaching_scope_required');
  await expect(newClass('Mathematics','Grade 11','C')).rejects.toThrow('approved_teaching_scope_required');
  const starts=new Date(Date.now()+86400000).toISOString(),ends=new Date(Date.now()+90000000).toISOString();
  const scheduled=await f.db.query<any>("insert into public.teaching_sessions(class_id,topic_id,topic_title,learning_goal,tutor_id,venue_name,venue_detail,mode,starts_at,ends_at) values($1,$2,'Synthetic algebra','Synthetic practice with algebra',$3,'Room','https://example.test/room','Online',$4,$5) returning id",[teachingClass,topic,a.tutor_id,starts,ends]);
  await expect(f.db.query("insert into public.teaching_sessions(class_id,topic_id,topic_title,learning_goal,tutor_id,venue_name,venue_detail,mode,starts_at,ends_at) values($1,$2,'Synthetic algebra','Synthetic practice with algebra',$3,'Room','https://example.test/room','Online',$4,$5)",[teachingClass,topic,a.tutor_id,starts,ends])).rejects.toThrow('teaching_schedule_conflict');
  await f.db.query("update public.teaching_sessions set status='cancelled',cancel_reason='Synthetic cancelled session' where id=$1",[scheduled.rows[0].id]);
  // Synthetic historical engagement simulates a completed session after activation.
  await f.db.query("update public.recruitment_staff_engagements set activated_at=clock_timestamp()-interval '7 days' where case_id=$1",[caseId]);
  completedSession=(await f.db.query<any>("insert into public.teaching_sessions(class_id,topic_id,topic_title,learning_goal,tutor_id,venue_name,venue_detail,mode,starts_at,ends_at,status,outcome) values($1,$2,'Synthetic algebra','Synthetic practice with algebra',$3,'Room','https://example.test/room','Online',clock_timestamp()-interval '2 days',clock_timestamp()-interval '47 hours','completed','Objective covered') returning id",[teachingClass,topic,a.tutor_id])).rows[0].id;
  await expect(change('session_payment_prepare',{sessionIds:[completedSession],issuedOn:new Date().toISOString().slice(0,10),dueOn:new Date().toISOString().slice(0,10),approvalReference:'SYNTHETIC-PAYMENT'})).rejects.toThrow();
  // Existing finance owner is established only in this isolated fixture; recruitment never grants it.
  await f.db.exec('update public.recruitment_settings set staff_console_enabled=false,access_guards_enabled=false');
  await f.db.query("insert into public.admin_users(user_id,enabled,finance_role) values($1,true,'owner')",[owner]);
  await f.db.exec('update public.recruitment_settings set access_guards_enabled=true,staff_console_enabled=true');
  const input={requestId:randomUUID(),caseId,expectedRevision:await revision(),sessionIds:[completedSession],issuedOn:new Date().toISOString().slice(0,10),dueOn:new Date().toISOString().slice(0,10),approvalReference:'SYNTHETIC-PAYMENT'};
  const paid=await f.rpc('recruitment_engagement_mutate',{p_actor:owner,p_operation:'session_payment_prepare',d:input,p_aal:'aal2'});
  expect((await f.rpc('recruitment_engagement_mutate',{p_actor:owner,p_operation:'session_payment_prepare',d:input,p_aal:'aal2'})).replayed).toBe(true);
  const bill=(await f.db.query<any>('select category,amount_cents from public.accounting_bills where id=$1',[paid.id])).rows[0];expect(bill.category).toBe('5000');expect(Number(bill.amount_cents)).toBe(10000);
  expect((await f.db.query<any>('select * from public.accounting_bill_payments where bill_id=$1',[paid.id])).rows).toHaveLength(0);
  await expect(change('session_payment_prepare',{sessionIds:[completedSession],issuedOn:input.issuedOn,dueOn:input.dueOn,approvalReference:'SYNTHETIC-DUPLICATE'})).rejects.toThrow('session_payment_ineligible');
  await f.db.query('update public.teaching_classes set archived=true where id=$1',[teachingClass]);
 });
 it('suspends, resumes and offboards without deleting teaching identity or history',async()=>{
  await change('access_suspend',{reason:'Synthetic access review'});
  let a=(await f.db.query<any>('select * from public.recruitment_staff_engagements where case_id=$1',[caseId])).rows[0];expect(a.status).toBe('suspended');
  await change('access_resume',{reason:'Synthetic review complete'});
  await f.db.query("update public.recruitment_cases set state='withdrawn',withdrawn_at=clock_timestamp()-interval '31 days',revision=revision+1 where id=$1",[caseId]);
  await f.db.exec('update public.recruitment_settings set selection_enabled=false,onboarding_enabled=false,activation_enabled=false,case_processing_enabled=false');
  await expect(f.rpc('recruitment_engagement_read',{p_actor:owner,p_case:caseId,p_aal:'aal2'})).rejects.toThrow();
  const personnel=await f.rpc('recruitment_engagement_personnel_read',{p_actor:owner,p_case:caseId,p_aal:'aal2'});
  expect(personnel.offers).toEqual([]);expect(personnel.tasks).toEqual([]);expect(personnel.activation.user_id).toBe(a.user_id);
  const d={requestId:randomUUID(),caseId,expectedRevision:personnel.revision,effectiveDate:new Date().toISOString().slice(0,10),replacementTutorId:null,reconciliationReference:'SYNTHETIC-RECONCILED',reason:'Synthetic engagement ended'};
  await expect(f.rpc('recruitment_engagement_mutate',{p_actor:manager,p_operation:'offboard',d,p_aal:'aal2'})).rejects.toThrow();
  await expect(f.rpc('recruitment_engagement_mutate',{p_actor:owner,p_operation:'offboard',d,p_aal:'aal1'})).rejects.toThrow();
  await f.rpc('recruitment_engagement_mutate',{p_actor:owner,p_operation:'offboard',d,p_aal:'aal2'});
  expect((await f.rpc('recruitment_engagement_recover',{p_actor:owner,p_case:null,p_request:d.requestId,p_aal:'aal2'})).state).toBe('committed');
  expect((await f.rpc('recruitment_engagement_mutate',{p_actor:owner,p_operation:'offboard',d,p_aal:'aal2'})).replayed).toBe(true);
  await f.enable();await f.db.exec('update public.recruitment_settings set selection_enabled=true,onboarding_enabled=true,activation_enabled=true');
  a=(await f.db.query<any>('select * from public.recruitment_staff_engagements where case_id=$1',[caseId])).rows[0];expect(a.status).toBe('ended');expect(new Date(a.ended_effective_on).toISOString().slice(0,10)).toBe(new Date().toISOString().slice(0,10));
  expect((await f.db.query<any>('select enabled from public.teaching_tutors where id=$1',[a.tutor_id])).rows[0].enabled).toBe(false);
  expect((await f.db.query<any>('select * from public.recruitment_engagement_events where case_id=$1',[caseId])).rows.length).toBeGreaterThan(10);
 });
});

async function prepareRole(category: string,email: string,userId?:string) {
 await f.enable();await f.db.exec('update public.recruitment_settings set selection_enabled=true,onboarding_enabled=true,activation_enabled=true');
 const v=await f.vacancy(category,false),session=await f.email(v.slug,email);hash=session.hash;
 let c=await f.rpc('recruitment_applicant_read',{p_hash:hash});caseId=c.id;
 const answers={fields:{firstName:'Synthetic',lastName:'Role applicant',location:'Cape Town',availability:'Afternoons',adultConfirmed:true,privacyAcknowledged:true,...(category==='administrator'?{administrativeExperience:'Relevant administration experience',administrativeSkills:'Administration'}:{supportExperience:'Relevant support experience',supportSkills:'Support'})},questions:{}};
 await f.rpc('recruitment_applicant_mutate',{p_hash:hash,p_action:'save',p_data:{requestId:randomUUID(),expectedRevision:c.revision,formId:c.formId,answersPatch:answers},p_digest:'3'.repeat(64),p_key_version:1});
 c=await f.rpc('recruitment_applicant_read',{p_hash:hash});await f.rpc('recruitment_submit',{p_hash:hash,d:{requestId:randomUUID(),expectedRevision:c.revision,formId:c.formId,poolConsent:false,privacyAcknowledged:true},p_digest:'4'.repeat(64),p_key_version:1});
 await f.db.query("insert into public.recruitment_selection_cases(case_id,stage,decision) values($1,'approved_for_offer','approved_for_offer')",[caseId]);
 const rec=randomUUID();await f.db.query("insert into public.recruitment_selection_recommendations(id,case_id,outcome,reason,evaluation_ids,actor_id) values($1,$2,'recommended','Synthetic separately-tested M4 prerequisite','{}',$3)",[rec,caseId,owner]);await f.db.query("insert into public.recruitment_selection_decisions(case_id,outcome,reason,recommendation_id,decided_by) values($1,'approved_for_offer','Synthetic M4 owner approval',$2,$3)",[caseId,rec,owner]);
 const terms={positionTitle:'Synthetic '+category,engagementType:'independent_contractor',startDate:future().slice(0,10),workArrangement:'Flexible work',reportingArrangements:'Approved lead',compensationTerms:'Reviewed compensation',sessionRateCents:0,expiresAt:future(),conditions:'Verified onboarding',agreementTemplateId:template};
 offer=(await change('offer_create',{terms})).id;await change('offer_approve',{offerId:offer});await change('offer_issue',{offerId:offer});await applicant('offer_accept',{offerId:offer,acknowledged:true});await change('onboarding_start',{offerId:offer});await applicant('agreement_accept',{templateId:template,acknowledged:true});
 const policy=(await f.db.query<any>("select id from public.recruitment_agreement_templates where agreement_type='code_of_conduct' limit 1")).rows[0].id;
 await change('policy_require',{templateId:policy});await applicant('agreement_accept',{templateId:policy,acknowledged:true});
 const d=await f.rpc('recruitment_engagement_read',{p_actor:owner,p_case:caseId,p_aal:'aal2'});
 for(const task of d.tasks)await change('task_verify',{taskId:task.id,documentId:null,evidenceReference:'SYNTHETIC-ROLE-CHECK'});
 if(!userId){userId=randomUUID();await f.db.query('insert into auth.users values($1,$2,now())',[userId,email]);}
 return {userId,caseId,hash,data:{userId,tutorId:null,displayName:'Synthetic staff',subjects:[],grades:[],permissions:category==='administrator'?['administration']:[],evidenceReference:'SYNTHETIC-PERSONNEL',personnelRetentionReviewAt:future()}};
}
describe('role-specific access and complete case erasure',()=>{
 it('provisions only explicit administration access and blocks inherited finance/recruitment authority',async()=>{
  const r=await prepareRole('administrator','administrator@example.test');
  await expect(change('activation_approve',{...r.data,permissions:[]})).rejects.toThrow('invalid_permissions');
  await change('activation_approve',r.data);
  const admin=(await f.db.query<any>('select enabled,finance_role from public.admin_users where user_id=$1',[r.userId])).rows[0];expect(admin).toEqual({enabled:true,finance_role:'viewer'});
  expect((await f.db.query<any>('select * from public.recruitment_staff where user_id=$1',[r.userId])).rows).toHaveLength(0);
  await expect(f.rpc('accounting_snapshot',{p_actor:r.userId,p_from:'2026-01-01',p_to:'2026-12-31'})).rejects.toThrow('accounting_read_permission_required');
  await expect(f.rpc('accounting_export_rows',{p_actor:r.userId,p_kind:'ledger',p_from:'2026-01-01',p_to:'2026-12-31'})).rejects.toThrow('accounting_read_permission_required');
  await expect(f.rpc('accounting_document_data',{p_actor:r.userId,p_kind:'trial_balance',p_id:randomUUID()})).rejects.toThrow('accounting_read_permission_required');
  await change('offboard',{effectiveDate:new Date().toISOString().slice(0,10),replacementTutorId:null,reconciliationReference:'SYNTHETIC-ADMIN-END',reason:'Synthetic engagement ended'});
  const rehire=await prepareRole('administrator','administrator@example.test',r.userId);await change('activation_approve',rehire.data);
  expect((await f.db.query<any>('select * from public.admin_users where user_id=$1',[r.userId])).rows).toHaveLength(1);
  expect((await f.db.query<any>("select * from public.recruitment_staff_engagements where user_id=$1 and status='active'",[r.userId])).rows).toHaveLength(1);
 });
 it('preserves existing legacy finance viewers and tutors outside recruitment-bound permissions',async()=>{
  const uid=randomUUID(),tid=randomUUID(),venue=randomUUID();
  await f.db.query("insert into auth.users values($1,'legacy-viewer@example.test',now())",[uid]);
  await f.db.exec('update public.recruitment_settings set staff_console_enabled=false,access_guards_enabled=false');
  await f.db.query("insert into public.admin_users(user_id,enabled,finance_role) values($1,true,'viewer')",[uid]);
  await f.db.query("insert into public.teaching_tutors(id,name,email,user_id,enabled) values($1,'Legacy tutor','legacy-viewer@example.test',$2,true)",[tid,uid]);
  await f.db.exec('update public.recruitment_settings set staff_console_enabled=true,access_guards_enabled=true');
  expect(await f.rpc('accounting_snapshot',{p_actor:uid,p_from:'2026-01-01',p_to:'2026-12-31'})).toHaveProperty('accounts');
  await f.db.query("select set_config('viva.teaching_actor',$1,false)",[owner]);
  await f.db.query("insert into public.teaching_venues(id,name,mode,detail) values($1,'Legacy room','Online','https://example.test/legacy')",[venue]);
  expect((await f.db.query<any>("insert into public.teaching_classes(name,grade,subject,group_name,season,tutor_id,venue_id,weekdays,starts_at,ends_at) values('Legacy class','Grade 11','Life Sciences','D',2026,$1,$2,array[1,2]::smallint[],'16:00','17:00') returning id",[tid,venue])).rows).toHaveLength(1);
 });
 it('activates support without admin, tutor, recruitment or finance access',async()=>{
  const r=await prepareRole('support_staff','support@example.test');
  await expect(change('activation_approve',{...r.data,permissions:['administration']})).rejects.toThrow('invalid_permissions');
  await change('activation_approve',r.data);
  expect((await f.db.query<any>('select * from public.admin_users where user_id=$1',[r.userId])).rows).toHaveLength(0);
  expect((await f.db.query<any>('select * from public.teaching_tutors where user_id=$1',[r.userId])).rows).toHaveLength(0);
  expect((await f.db.query<any>('select * from public.recruitment_staff where user_id=$1',[r.userId])).rows).toHaveLength(0);
 });
 it('erases unactivated engagement data and permits finite evidence/header pruning',async()=>{
  const r=await prepareRole('support_staff','erasure@example.test');
  const c=await f.rpc('recruitment_applicant_read',{p_hash:hash});
  await f.rpc('recruitment_privacy_command',{p_hash:hash,p_action:'request_deletion',d:{requestId:randomUUID(),expectedRevision:c.revision,formId:null,noticeVersion:'',consent:false},p_digest:'6'.repeat(64),p_key_version:1});
  await f.rpc('recruitment_deletion_claim',{p_claim:randomUUID()});
  // Trusted isolated clock advancement matches existing M3 grace-period tests.
  await f.db.exec('alter table public.recruitment_cases disable trigger recruitment_case_guard');
  await f.db.query("update public.recruitment_cases set deletion_barrier_at=clock_timestamp()-interval '7 minutes' where id=$1",[r.caseId]);
  await f.db.exec('alter table public.recruitment_cases enable trigger recruitment_case_guard');
  await f.db.query('update public.recruitment_deletion_jobs set available_at=clock_timestamp() where case_id=$1',[r.caseId]);
  const claim=randomUUID(),job=await f.rpc('recruitment_deletion_claim',{p_claim:claim});expect(job.caseId).toBe(r.caseId);
  expect((await f.rpc('recruitment_deletion_complete',{p_job:job.jobId,p_claim:claim,p_objects_verified:true})).complete).toBe(true);
  for(const table of ['recruitment_offers','recruitment_offer_versions','recruitment_onboarding_tasks','recruitment_agreement_acceptances','recruitment_engagement_requests'])expect((await f.db.query<any>(`select * from public.${table} where case_id=$1`,[r.caseId])).rows).toHaveLength(0);
  await f.db.query("update public.recruitment_erasure_evidence set expires_at=clock_timestamp()-interval '1 minute',verified_at=clock_timestamp() where case_id=$1",[r.caseId]);
  await f.rpc('recruitment_retention_prune');
  expect((await f.db.query<any>('select * from public.recruitment_cases where id=$1',[r.caseId])).rows).toHaveLength(0);
  expect((await f.db.query<any>('select * from public.recruitment_engagement_cases where case_id=$1',[r.caseId])).rows).toHaveLength(0);
 });
});
describe('M5 API validation',()=>{
 it('bounds role and engagement payloads, forbids implicit or extra privileges',()=>{
  expect(()=>engagementInput('activation_approve',{requestId:randomUUID(),caseId:randomUUID(),expectedRevision:0,permissions:['owner']})).toThrow();
  expect(()=>applicantEngagementInput('offer_accept',{requestId:randomUUID(),expectedRevision:0,offerId:randomUUID(),acknowledged:false})).toThrow();
  expect(()=>applicantEngagementInput('offer_approve',{})).toThrow();
 });
});
