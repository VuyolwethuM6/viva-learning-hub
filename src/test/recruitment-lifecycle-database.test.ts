/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated PostgreSQL fixture checks runtime JSON projections. */
// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fixture, owner } from "./helpers/recruitment-m3";

let f: Awaited<ReturnType<typeof fixture>>;
let template: string;
beforeAll(async () => {
  f = await fixture();
  for (const [table, migration] of [
    ["recruitment_selection_cases", "20261115010000_recruitment_selection"],
    ["recruitment_engagement_cases", "20261115020000_recruitment_engagement"],
    ["recruitment_lifecycle_notifications", "20261115030000_recruitment_lifecycle_workers"],
  ]) {
    const exists = await f.db.query<{ v: string | null }>("select to_regclass($1) v", [`public.${table}`]);
    if (!exists.rows[0].v) await f.db.exec(readFileSync(`supabase/migrations/${migration}.sql`, "utf8"));
  }
  await f.enable();
  template = randomUUID();
  await f.db.query("insert into public.recruitment_agreement_templates(id,agreement_type,engagement_type,title,body,legal_approval_reference,approved_by) values($1,'employment','employee','Synthetic agreement','Synthetic terms for isolated worker tests only','SYNTHETIC-REVIEW',$2)", [template, owner]);
}, 60000);
afterAll(async () => { await f?.db.close(); });

async function submitted() {
  const v = await f.vacancy("tutor", false), session = await f.email(v.slug, `${randomUUID()}@example.test`);
  const c = await f.rpc<any>("recruitment_applicant_read", { p_hash: session.hash });
  await f.rpc("recruitment_applicant_mutate", {
    p_hash: session.hash, p_action: "save", p_data: { requestId: randomUUID(), expectedRevision: c.revision, formId: c.formId, answersPatch: f.answers }, p_digest: "f".repeat(64), p_key_version: 1,
  });
  const saved = await f.rpc<any>("recruitment_applicant_read", { p_hash: session.hash });
  await f.rpc("recruitment_submit", { p_hash: session.hash, d: { requestId: randomUUID(), expectedRevision: saved.revision, formId: c.formId, poolConsent: false, privacyAcknowledged: true }, p_digest: "e".repeat(64), p_key_version: 1 });
  return c.id as string;
}
async function offer(caseId: string, expiresAt: string, status = "issued") {
  const id = randomUUID();
  await f.db.query("insert into public.recruitment_engagement_cases(case_id,category,onboarding_started_at) values($1,'tutor',case when $2='accepted' then clock_timestamp() else null end)", [caseId, status]);
  await f.db.query("insert into public.recruitment_offer_versions(id,case_id,version,terms,agreement_template_id,created_by) values($1,$2,1,$3,$4,$5)", [id, caseId, JSON.stringify({ expiresAt }), template, owner]);
  await f.db.query("insert into public.recruitment_offers(id,case_id,status,approved_by,approved_at,issued_at,accepted_at) values($1,$2,$3,$4,clock_timestamp(),clock_timestamp(),case when $3='accepted' then clock_timestamp() else null end)", [id, caseId, status, owner]);
  return id;
}
const tick = () => f.rpc<any>("recruitment_lifecycle_tick", { p_limit: 10 });

it("installs disabled and preserves the existing M3 activation interlocks and grants", async () => {
  const settings = (await f.db.query<any>("select selection_enabled,onboarding_enabled,activation_enabled from public.recruitment_settings")).rows[0];
  expect(settings).toEqual({ selection_enabled: false, onboarding_enabled: false, activation_enabled: false });
  expect(await tick()).toEqual({ interviewsReminded: 0, offersExpired: 0, offersReminded: 0, onboardingReminded: 0 });
  const grants = (await f.db.query<any>("select relrowsecurity,has_table_privilege('authenticated',oid,'select') browser,has_table_privilege('service_role',oid,'insert') direct from pg_class where oid='public.recruitment_lifecycle_notifications'::regclass")).rows[0];
  expect(grants).toEqual({ relrowsecurity: true, browser: false, direct: false });
  const execute = (await f.db.query<any>("select has_function_privilege('authenticated','public.recruitment_lifecycle_tick(integer)','execute') browser,has_function_privilege('service_role','public.recruitment_lifecycle_tick(integer)','execute') worker,has_function_privilege('service_role','public.recruitment_lifecycle_enqueue(uuid,text,text,timestamp with time zone)','execute') helper")).rows[0];
  expect(execute).toEqual({ browser: false, worker: true, helper: false });
  await expect(f.rpc("recruitment_lifecycle_tick", { p_limit: 11 })).rejects.toThrow("invalid_request");
});

it("queues interview reminders once, revalidates cancellation before delivery, and survives outbox pruning", async () => {
  await f.db.exec("update public.recruitment_settings set selection_enabled=true,onboarding_enabled=true");
  const caseId = await submitted(), interview = randomUUID();
  await f.db.query("insert into public.recruitment_selection_interviews(id,case_id,round,type,starts_at,ends_at,location,interviewer_ids,created_by) values($1,$2,1,'Synthetic interview',clock_timestamp()+interval '2 hours',clock_timestamp()+interval '3 hours','Private synthetic location',array[$3::uuid],$3)", [interview, caseId, owner]);
  expect((await tick()).interviewsReminded).toBe(1);
  expect((await tick()).interviewsReminded).toBe(0);
  const message = (await f.db.query<any>("select * from public.recruitment_email_outbox where case_id=$1 and template='interview_reminder'", [caseId])).rows[0];
  expect(message.envelope).toBeNull();
  const claim = randomUUID();
  await f.db.query("update public.recruitment_email_outbox set status='claimed',claim_id=$2,lease_until=clock_timestamp()+interval '1 minute' where id=$1", [message.id, claim]);
  expect(await f.rpc("recruitment_mail_authorize", { p_id: message.id, p_claim: claim })).toBe(true);
  await f.db.query("update public.recruitment_selection_interviews set status='cancelled' where id=$1", [interview]);
  expect(await f.rpc("recruitment_mail_authorize", { p_id: message.id, p_claim: claim })).toBe(false);
  await tick();
  expect((await f.db.query<any>("select status from public.recruitment_email_outbox where id=$1", [message.id])).rows[0].status).toBe("cancelled");
  await f.db.query("delete from public.recruitment_email_outbox where id=$1", [message.id]);
  await f.db.query("update public.recruitment_selection_interviews set status='scheduled' where id=$1", [interview]);
  expect((await tick()).interviewsReminded).toBe(0);
});

it("expires issued offers exactly once, journals the revision, and never activates staff", async () => {
  const caseId = await submitted(), id = await offer(caseId, new Date(Date.now() - 1000).toISOString());
  expect((await tick()).offersExpired).toBe(1);
  expect((await tick()).offersExpired).toBe(0);
  expect((await f.db.query<any>("select status from public.recruitment_offers where id=$1", [id])).rows[0].status).toBe("expired");
  expect((await f.db.query("select * from public.recruitment_engagement_events where case_id=$1 and action='offer_expire'", [caseId])).rows).toHaveLength(1);
  expect((await f.db.query("select * from public.recruitment_staff_engagements where case_id=$1", [caseId])).rows).toHaveLength(0);
});

it("reminds issued offers and outstanding onboarding tasks without sending private terms", async () => {
  const issuedCase = await submitted();
  await offer(issuedCase, new Date(Date.now() + 3600000).toISOString());
  const onboardCase = await submitted();
  await offer(onboardCase, new Date(Date.now() + 3600000).toISOString(), "accepted");
  const taskId = randomUUID();
  await f.db.query("insert into public.recruitment_onboarding_tasks(id,case_id,key,label,kind,due_at) values($1,$2,'synthetic-check','Synthetic check','required_check',clock_timestamp()+interval '2 hours')", [taskId, onboardCase]);
  const result = await tick();
  expect(result.offersReminded).toBe(1);
  expect(result.onboardingReminded).toBe(1);
  expect((await tick()).onboardingReminded).toBe(0);
  const queued = (await f.db.query<any>("select envelope from public.recruitment_email_outbox where case_id=$1 and template='onboarding_reminder'", [onboardCase])).rows[0];
  expect(queued.envelope).toBeNull();
  await f.db.query("update public.recruitment_onboarding_tasks set status='verified',verified_by=$2,verified_at=clock_timestamp() where id=$1", [taskId, owner]);
  await tick();
  expect((await f.db.query<any>("select status from public.recruitment_email_outbox where case_id=$1 and template='onboarding_reminder'", [onboardCase])).rows[0].status).toBe("cancelled");
});

it("honors feature switches, does not send after withdrawal, and excludes withdrawn cases from expiry", async () => {
  const caseId = await submitted();
  const id = await offer(caseId, new Date(Date.now() - 1000).toISOString());
  await f.db.exec("update public.recruitment_settings set onboarding_enabled=false");
  expect((await tick()).offersExpired).toBe(0);
  await f.db.exec("update public.recruitment_settings set onboarding_enabled=true");
  await f.db.query("update public.recruitment_cases set state='withdrawn',withdrawn_at=clock_timestamp(),revision=revision+1 where id=$1", [caseId]);
  expect((await tick()).offersExpired).toBe(0);
  expect((await f.db.query<any>("select status from public.recruitment_offers where id=$1", [id])).rows[0].status).toBe("issued");
});

it("deduplicates overlapping scheduler requests in the isolated SQL executor", async () => {
  const caseId = await submitted();
  await offer(caseId, new Date(Date.now() - 1000).toISOString());
  const [first, second] = await Promise.all([tick(), tick()]);
  expect(first.offersExpired + second.offersExpired).toBe(1);
  expect((await f.db.query("select id from public.recruitment_engagement_events where case_id=$1 and action='offer_expire'", [caseId])).rows).toHaveLength(1);
  expect((await f.db.query("select id from public.recruitment_email_outbox where case_id=$1 and template='offer_expired'", [caseId])).rows).toHaveLength(1);
});


it("reports scoped lifecycle counts without exposing applicant or offer details", async () => {
 const r=await f.rpc<any>("recruitment_lifecycle_summary",{p_actor:owner,p_aal:"aal2"});
 expect(r.enabled).toBe(true);for(const key of ["offersIssued","offersAccepted","offersDeclined","onboarding","activations","screeningCompleted"])expect(typeof r[key]).toBe("number");
 for(const key of ["offers","templates","tasks","email","normalized_email","candidateName","screening","evaluations"])expect(r).not.toHaveProperty(key);
 await f.db.exec("update public.recruitment_settings set selection_enabled=false");
 expect(await f.rpc("recruitment_lifecycle_summary",{p_actor:owner,p_aal:"aal2"})).toEqual({enabled:false});
});


it("reports current backend switches rather than hard-coded M2 availability",async()=>{
 await f.db.exec("update public.recruitment_settings set selection_enabled=true,onboarding_enabled=true,activation_enabled=false");
 const r=await f.rpc<any>("recruitment_snapshot",{p_actor:owner});
 expect(r.features.interviews).toBe(true);expect(r.features.decisions).toBe(true);expect(r.features.onboarding).toBe(true);expect(r.features.activation).toBe(false);
});
