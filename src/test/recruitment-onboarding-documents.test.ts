/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated SQL fixture validates heterogeneous database responses. */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fixture, owner } from "./helpers/recruitment-m3";
let f: Awaited<ReturnType<typeof fixture>>;
let session: { hash: string; caseId: string };
let taskId: string;
let vacancySlug: string;
let pinnedDocument: {documentId:string;generation:string};
const checksum = "f".repeat(64);
const migration = "supabase/migrations/20261115025000_recruitment_onboarding_documents.sql";
beforeAll(async () => {
  f = await fixture();
  for (const n of ["20261115010000_recruitment_selection", "20261115020000_recruitment_engagement"])
    await f.db.exec(readFileSync(`supabase/migrations/${n}.sql`, "utf8")).catch((e) => { throw new Error(`${n}: ${e.message}; position ${e.position}`); });
  await f.db.exec(readFileSync(migration, "utf8")).catch((e) => { throw new Error(`onboarding: ${e.message}; position ${e.position}`); });
  await f.enable();
  const vacancy = await f.vacancy("tutor", true);
  vacancySlug = vacancy.slug;
  const s = await f.email(vacancy.slug);
  let r = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
  session = { hash: s.hash, caseId: r.id };
  const reservedCv = await reserve("cv");
  pinnedDocument = { documentId: reservedCv.documentId, generation: reservedCv.generation };
  await upload("chunk_commit", { ...pinnedDocument, index: 0, size: 20, checksum });
  await upload("finalize", pinnedDocument);
  const applicationClaim = randomUUID();
  const applicationJob = await f.rpc("recruitment_scan_claim", { p_claim: applicationClaim });
  await f.rpc("recruitment_scan_complete", { p_job: applicationJob.jobId, p_claim: applicationClaim, d: { verdict: "clean", checksum, size: 20, engine: "synthetic-fixture", definitions: "isolated-only", policy: "pdf-v1", cleanPath: applicationJob.cleanPath } });
  r = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
  await f.rpc("recruitment_applicant_mutate", { p_hash: s.hash, p_action: "save", p_data: { requestId: randomUUID(), expectedRevision: r.revision, formId: r.formId, answersPatch: f.answers }, p_digest: "b".repeat(64), p_key_version: 1 });
  const saved = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
  await f.rpc("recruitment_submit", { p_hash: s.hash, d: { requestId: randomUUID(), expectedRevision: saved.revision, formId: saved.formId, poolConsent: false, privacyAcknowledged: true }, p_digest: "c".repeat(64), p_key_version: 1 });
  session = { hash: s.hash, caseId: r.id };
  // This fixture starts after accepted owner-approved hiring/offer workflows,
  // tested separately; no production data or legal templates are used here.
  await f.db.query("insert into public.recruitment_engagement_cases(case_id,category,onboarding_started_at) values($1,'tutor',now())", [r.id]);
  const template = randomUUID(), offer = randomUUID();
  await f.db.query("insert into public.recruitment_agreement_templates(id,agreement_type,engagement_type,title,body,legal_approval_reference,approved_by) values($1,'volunteer','volunteer','Synthetic template','Synthetic approved text for isolated document checks only.','SYNTHETIC-LEGAL',$2)", [template, owner]);
  await f.db.query("insert into public.recruitment_offer_versions(id,case_id,version,terms,agreement_template_id,created_by) values($1,$2,1,'{}',$3,$4)", [offer, r.id, template, owner]);
  await f.db.query("insert into public.recruitment_offers(id,case_id,status,approved_by,approved_at,issued_at,accepted_at) values($1,$2,'accepted',$3,now(),now(),now())", [offer, r.id, owner]);
  taskId = randomUUID();
  await f.db.query("insert into public.recruitment_onboarding_tasks(id,case_id,key,label,kind) values($1,$2,'document:identity','Synthetic identity evidence','document')", [taskId, r.id]);
}, 120000);
afterAll(async () => { await f?.db.close(); });
async function upload(action: string, d: Record<string, unknown>, hash = session.hash) {
  return f.rpc("recruitment_document_mutate", { p_hash: hash, p_action: action, d, p_digest: checksum, p_key_version: 1 });
}
const reserve = (key = "identity", requestId = randomUUID(), size = 20) => upload("reserve", { requestId, requirementKey: key, name: "synthetic.pdf", size, checksum });
describe("onboarding uses the established private PDF quarantine", () => {
  it("keeps post-submission uploads closed until onboarding is enabled", async () => {
    await expect(reserve()).rejects.toThrow();
    await f.db.exec("update public.recruitment_settings set onboarding_enabled=true,case_processing_enabled=false");
    await expect(reserve()).rejects.toThrow("case_unavailable");
    await f.db.exec("update public.recruitment_settings set case_processing_enabled=true");
    await expect(reserve("unapproved_identity_key")).rejects.toThrow("invalid_request");
  });
  it("authorizes exact tasks, replays reservation, scopes chunks and requires a real clean verdict", async () => {
    const requestId = randomUUID();
    const doc = await reserve("identity", requestId);
    expect((await reserve("identity", requestId)).documentId).toBe(doc.documentId);
    expect(doc.documentId).toBeTruthy();
    await expect(reserve()).rejects.toThrow("document_exists");
    const other = await f.email(vacancySlug, "other@example.test");
    await expect(upload("chunk_plan", { documentId: doc.documentId, generation: doc.generation, index: 0, size: 20, checksum }, other.hash)).rejects.toThrow();
    const part = { documentId: doc.documentId, generation: doc.generation, index: 0, size: 20, checksum };
    const plan = await upload("chunk_plan", part);
    expect(plan.path).toMatch(/\/0$/);
    await upload("chunk_commit", part);
    expect((await upload("finalize", { documentId: doc.documentId, generation: doc.generation })).state).toBe("uploaded");
    await expect(f.rpc("recruitment_document_access", { p_hash: session.hash, p_actor: null, p_document: doc.documentId })).rejects.toThrow();
    const claim = randomUUID();
    const job = await f.rpc("recruitment_scan_claim", { p_claim: claim });
    expect(job.documentId).toBe(doc.documentId);
    expect(await f.rpc("recruitment_scan_promote", { p_job: job.jobId, p_claim: claim })).toBe(true);
    const verdict = { verdict: "clean", checksum, size: 20, engine: "synthetic-fixture", definitions: "isolated-only", policy: "pdf-v1", cleanPath: job.cleanPath };
    await expect(f.rpc("recruitment_scan_complete", { p_job: job.jobId, p_claim: claim, d: { ...verdict, checksum: "0".repeat(64) } })).rejects.toThrow("scan_integrity_failure");
    expect((await f.rpc("recruitment_scan_complete", { p_job: job.jobId, p_claim: claim, d: verdict })).accepted).toBe(true);
    const access = await f.rpc("recruitment_document_access", { p_hash: session.hash, p_actor: null, p_document: doc.documentId });
    expect(access.path).toBe(job.cleanPath);
    await f.db.query("update public.recruitment_onboarding_tasks set status='verified',verified_by=$1,verified_at=now(),document_id=$2 where id=$3", [owner, doc.documentId, taskId]);
    await expect(upload("discard", { documentId: doc.documentId, generation: doc.generation })).rejects.toThrow("case_unavailable");
  });
  it("retains file quotas and original immutable submission evidence", async () => {
    const before = await f.db.query<any>("select documents from public.recruitment_submissions where case_id=$1", [session.caseId]);
    expect(before.rows[0].documents).toHaveLength(1);
    await expect(upload("discard", pinnedDocument)).rejects.toThrow("case_unavailable");
    expect((await f.db.query<any>("select state from public.recruitment_case_documents where id=$1", [pinnedDocument.documentId])).rows[0].state).toBe("clean");
    await f.db.query("insert into public.recruitment_onboarding_tasks(case_id,key,label,kind) values($1,'document:additional','Synthetic extra evidence','document')", [session.caseId]);
    await expect(reserve("additional", randomUUID(), 10485761)).rejects.toThrow();
    const rows = await f.db.query<any>("select * from public.recruitment_onboarding_document_links where case_id=$1", [session.caseId]);
    expect(rows.rows).toHaveLength(1);
    expect((await f.db.query<any>("select documents from public.recruitment_submissions where case_id=$1", [session.caseId])).rows[0]).toEqual(before.rows[0]);
    const privileges = await f.db.query<any>("select relrowsecurity,has_table_privilege('authenticated','public.recruitment_onboarding_document_links','INSERT') writable from pg_class where oid='public.recruitment_onboarding_document_links'::regclass");
    expect(privileges.rows[0]).toEqual({ relrowsecurity: true, writable: false });
  });
  it("enforces aggregate limits across application and onboarding PDFs", async () => {
    for (let i = 0; i < 8; i++)
      await f.db.query("insert into public.recruitment_onboarding_tasks(case_id,key,label,kind) values($1,$2,'Synthetic quota check','document')", [session.caseId, `document:quota_${i}`]);
    for (let i = 0; i < 3; i++) await reserve(`quota_${i}`, randomUUID(), 10485760);
    await expect(reserve("quota_3", randomUUID(), 10485760)).rejects.toThrow("document_quota");
    for (let i = 3; i < 6; i++) await reserve(`quota_${i}`, randomUUID(), 1);
    await expect(reserve("quota_6", randomUUID(), 1)).rejects.toThrow("document_quota");
  });
  it("withdrawal revokes onboarding upload and scan eligibility", async () => {
    const pending = (await f.db.query<any>("select id,generation from public.recruitment_case_documents where case_id=$1 and requirement_key='quota_3'", [session.caseId])).rows[0];
    await upload("chunk_commit", { documentId: pending.id, generation: pending.generation, index: 0, size: 1, checksum });
    await upload("finalize", { documentId: pending.id, generation: pending.generation });
    const claim = randomUUID(), job = await f.rpc("recruitment_scan_claim", { p_claim: claim });
    expect(await f.rpc("recruitment_scan_promote", { p_job: job.jobId, p_claim: claim })).toBe(true);
    await f.db.query("update public.recruitment_cases set state='withdrawn',withdrawn_at=now(),revision=revision+1 where id=$1", [session.caseId]);
    await expect(reserve("additional")).rejects.toThrow("case_unavailable");
    expect(await f.rpc("recruitment_scan_promote", { p_job: job.jobId, p_claim: claim })).toBe(false);
    expect((await f.rpc("recruitment_scan_complete", { p_job: job.jobId, p_claim: claim, d: { verdict: "clean", checksum, size: 1, engine: "synthetic-fixture", definitions: "isolated-only", policy: "pdf-v1", cleanPath: job.cleanPath } })).accepted).toBe(false);
  });
});
