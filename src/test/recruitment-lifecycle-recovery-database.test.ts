/* eslint-disable @typescript-eslint/no-explicit-any -- Disposable PostgreSQL validates mixed RPC evidence. */
// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fixture, owner, manager } from "./helpers/recruitment-m3";
let f: Awaited<ReturnType<typeof fixture>>, caseId: string, hash: string;
const session = "a".repeat(64);
async function submitted(email: string) {
 const v = await f.vacancy("tutor",false), capability = await f.email(v.slug,email);
 let c = await f.rpc("recruitment_applicant_read",{p_hash:capability.hash});
 await f.rpc("recruitment_applicant_mutate",{p_hash:capability.hash,p_action:"save",p_data:{requestId:randomUUID(),expectedRevision:c.revision,formId:c.formId,answersPatch:f.answers},p_digest:"e".repeat(64),p_key_version:1});
 c = await f.rpc("recruitment_applicant_read",{p_hash:capability.hash});
 await f.rpc("recruitment_submit",{p_hash:capability.hash,d:{requestId:randomUUID(),expectedRevision:c.revision,formId:c.formId,poolConsent:false,privacyAcknowledged:true},p_digest:"f".repeat(64),p_key_version:1});
 return {caseId:c.id,hash:capability.hash};
}
async function command(requestId=randomUUID()) {
 const r=await f.rpc("recruitment_selection_read",{p_actor:owner,p_case:caseId,p_aal:"aal2"});
 return {requestId,caseId,expectedRevision:r.selection?.revision||0,checks:[{key:"qualifications",complete:true,evidence:"Synthetic qualification checked"}],notes:"Synthetic screening evidence"};
}
const args=(d:Record<string,unknown>)=>({p_actor:owner,p_case:caseId,p_operation:"screen",d,p_aal:"aal2",p_session:session,p_proof:"b".repeat(64)});
const cancel=(domain:string,requestId:string,actor=owner)=>f.rpc("recruitment_lifecycle_cancel",{p_domain:domain,p_request:requestId,p_actor:actor,p_aal:"aal2"});
beforeAll(async()=>{
 f=await fixture();
 for(const name of ["20261115010000_recruitment_selection","20261115020000_recruitment_engagement","20261115025000_recruitment_onboarding_documents","20261115030000_recruitment_lifecycle_workers","20261115040000_recruitment_lifecycle_recovery"])await f.db.exec(readFileSync(`supabase/migrations/${name}.sql`,"utf8"));
 await f.enable();await f.db.exec("update public.recruitment_settings set selection_enabled=true,onboarding_enabled=true");
 ({caseId,hash}=await submitted("recovery@example.test"));
 await f.change("staff_grant",{userId:manager,role:"manager",enabled:true,expectedRevision:-1});
},120000);
afterAll(async()=>{await f?.db.close();});
it("installs an internal immutable RLS audit with no direct browser/service or helper privilege",async()=>{
 const acl=await f.db.query<any>("select relrowsecurity from pg_class where oid='public.recruitment_lifecycle_cancellations'::regclass");expect(acl.rows[0].relrowsecurity).toBe(true);
 for(const role of ["anon","authenticated","service_role"]){
  expect((await f.db.query<any>("select has_table_privilege($1,'public.recruitment_lifecycle_cancellations','SELECT,INSERT,UPDATE,DELETE') p",[role])).rows[0].p).toBe(false);
  expect((await f.db.query<any>("select has_function_privilege($1,'public.recruitment_lifecycle_request_check(text,uuid,text,uuid)','EXECUTE') p",[role])).rows[0].p).toBe(false);
 }
});
it("cancels before a delayed original authentication/prepare and blocks every later replay",async()=>{
 const d=await command();expect(await cancel("selection",d.requestId)).toEqual({state:"cancelled"});
 expect(await cancel("selection",d.requestId)).toEqual({state:"cancelled"});
 await expect(f.rpc("recruitment_selection_prepare",args(d))).rejects.toThrow("request_cancelled");
 await expect(f.rpc("recruitment_selection_mutate",args(d))).rejects.toThrow("request_cancelled");
 expect((await f.db.query<any>("select count(*)::int n from public.recruitment_selection_screenings where case_id=$1",[caseId])).rows[0].n).toBe(0);
 await expect(f.db.exec("update public.recruitment_lifecycle_cancellations set domain='engagement'")).rejects.toThrow();
});
it("cancels a staged proof and prevents changed-data reuse without blocking other actors or domains",async()=>{
 const d=await command();await f.rpc("recruitment_selection_prepare",args(d));
 await cancel("selection",d.requestId);await expect(f.rpc("recruitment_selection_mutate",args({...d,notes:"Changed payload"}))).rejects.toThrow("request_cancelled");
 const next=await command();await cancel("selection",next.requestId,manager);await cancel("engagement",next.requestId);
 await f.rpc("recruitment_selection_prepare",args(next));await expect(f.rpc("recruitment_selection_mutate",args(next))).resolves.toHaveProperty("resultId");
});
it("reports an already committed mutation without cancelling or duplicating its result",async()=>{
 const d=await command();await f.rpc("recruitment_selection_prepare",args(d));await f.rpc("recruitment_selection_mutate",args(d));
 expect(await cancel("selection",d.requestId)).toEqual({state:"committed"});
 const rows=await f.db.query<any>("select count(*)::int n from public.recruitment_lifecycle_cancellations where actor_id=$1 and domain='selection' and request_id=$2",[owner,d.requestId]);expect(rows.rows[0].n).toBe(0);
 await f.rpc("recruitment_selection_prepare",args(d));await expect(f.rpc("recruitment_selection_mutate",args(d))).resolves.toHaveProperty("resultId");
});
it("fences delayed M5 staff and accountless applicant commands and exposes no other case",async()=>{
 const requestId=randomUUID();await cancel("engagement",requestId);
 await expect(f.rpc("recruitment_engagement_mutate",{p_actor:owner,p_operation:"template_approve",d:{requestId,caseId,expectedRevision:0},p_aal:"aal2"})).rejects.toThrow("request_cancelled");
 const appId=randomUUID();expect(await f.rpc("recruitment_lifecycle_cancel",{p_domain:"engagement",p_request:appId,p_hash:hash})).toEqual({state:"cancelled"});
 await expect(f.rpc("recruitment_engagement_applicant",{p_hash:hash,p_action:"offer_accept",d:{requestId:appId,offerId:randomUUID(),acknowledged:true,expectedRevision:0}})).rejects.toThrow("request_cancelled");
 const interviewId=randomUUID(),responseId=randomUUID();await f.rpc("recruitment_lifecycle_cancel",{p_domain:"selection",p_request:responseId,p_hash:hash});
 await expect(f.rpc("recruitment_selection_response",{p_hash:hash,d:{requestId:responseId,interviewId,response:"confirmed"}})).rejects.toThrow("request_cancelled");
 const other=await submitted("separate-recovery@example.test");
 // Another case cancelling that UUID does not observe or change the first case.
 expect(await f.rpc("recruitment_lifecycle_cancel",{p_domain:"engagement",p_request:appId,p_hash:other.hash})).toEqual({state:"cancelled"});
 await expect(f.rpc("recruitment_lifecycle_cancel",{p_domain:"engagement",p_request:randomUUID(),p_hash:"0".repeat(64)})).rejects.toThrow();
 const c=await f.db.query<any>("select count(*)::int n from public.recruitment_lifecycle_cancellations where actor_kind='applicant' and request_id=$1",[appId]);expect(c.rows[0].n).toBe(2);
});
it("does not add a foreign-key barrier to the existing finite case header erasure",async()=>{
 const g=await submitted("erasure-recovery@example.test"),requestId=randomUUID();await f.rpc("recruitment_lifecycle_cancel",{p_domain:"selection",p_request:requestId,p_hash:g.hash});
 // The same parent FK path used by final M3 evidence pruning can remove this
 // audit after the existing controlled erasure worker has removed other children.
 const fk=await f.db.query<any>("select confdeltype from pg_constraint where conrelid='public.recruitment_lifecycle_cancellations'::regclass and contype='f'");expect(fk.rows).toEqual([{confdeltype:"c"}]);
});

it("keeps denial-only recovery available while selection and onboarding rollout are disabled",async()=>{
 await f.db.exec("update public.recruitment_settings set selection_enabled=false,onboarding_enabled=false");
 const requestId=randomUUID();expect(await cancel("selection",requestId)).toEqual({state:"cancelled"});
 expect(await f.rpc("recruitment_lifecycle_cancel",{p_domain:"engagement",p_request:randomUUID(),p_hash:hash})).toEqual({state:"cancelled"});
 const r=await f.db.query<any>("select count(*)::int n from public.recruitment_lifecycle_cancellations where request_id=$1",[requestId]);expect(r.rows[0].n).toBe(1);
});
