// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createIntakeDefinition, intakeAnswersSchema, type IntakeCategory,
} from "@/lib/recruitment-applications";
import { emptyVacancyContent, type VacancyContent } from "@/lib/recruitment-vacancies";

const owner = "11111111-1111-4111-8111-111111111111";
const manager = "22222222-2222-4222-8222-222222222222";
const officer = "33333333-3333-4333-8333-333333333333";
const otherOwner = "44444444-4444-4444-8444-444444444444";
const outsider = "55555555-5555-4555-8555-555555555555";
const migrationPath = "supabase/migrations/20261111010000_recruitment_intake_foundation.sql";
const migration = readFileSync(migrationPath, "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");
const j = JSON.stringify;
let db: PGlite;
async function value<T = unknown>(sql: string, args: unknown[] = []): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
function content(category: IntakeCategory = "tutor", extra: Partial<VacancyContent> = {}): VacancyContent {
  return {
    ...emptyVacancyContent(), title: "Synthetic recruitment vacancy", category,
    department: "Synthetic department", location: "Cape Town", summary: "A synthetic vacancy for isolated tests only.",
    responsibilities: ["Relevant responsibilities"], minimumRequirements: ["Relevant experience"],
    requiredExperience: "Relevant experience", scheduleDetails: "Part-time afternoons",
    subjects: category === "tutor" ? ["Mathematics"] : [], grades: category === "tutor" ? ["12"] : [],
    opensAt: new Date(Date.now() - 86400000).toISOString(), closesAt: new Date(Date.now() + 86400000).toISOString(),
    questions: [{ key: "motivation", type: "text", label: "Why this role?", required: true }],
    requiredDocuments: [{ key: "cv", label: "CV", required: true }], ...extra,
  };
}
async function vacancy(c = content()) {
  const id = randomUUID(), version = randomUUID(), scope = randomUUID(), publication = randomUUID();
  await db.exec("begin");
  try {
    await db.query("insert into public.recruitment_scopes(id,kind,label) values($1,'vacancy','Synthetic vacancy scope')", [scope]);
    await db.query("insert into public.recruitment_vacancies(id,reference,slug,scope_id,draft_version_id,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6)", [id, id, `vacancy-${id}`, scope, version, owner]);
    await db.query("insert into public.recruitment_vacancy_versions(id,vacancy_id,number,content,created_by) values($1,$2,1,$3,$4)", [version, id, j(c), owner]);
    await db.query("insert into public.recruitment_vacancy_approvals(vacancy_id,version_id,owner_id,request_id) values($1,$2,$3,$4)", [id, version, owner, randomUUID()]);
    await db.query("insert into public.recruitment_vacancy_publications(id,vacancy_id,version_id,owner_id,request_id) values($1,$2,$3,$4,$5)", [publication, id, version, owner, randomUUID()]);
    await db.query("update public.recruitment_vacancies set status='published',review_state='approved',approved_version_id=$2,published_version_id=$2,published_at=now() where id=$1", [id, version]);
    await db.exec("commit");
  } catch (e) { await db.exec("rollback"); throw e; }
  return { id, version, scope, publication, content: c };
}
async function form(input?: Awaited<ReturnType<typeof vacancy>>, approvedBy = owner) {
  const v = input ?? await vacancy();
  const id = randomUUID(), definition = createIntakeDefinition("vacancy", v.content.category, v.content);
  await db.query("insert into public.recruitment_intake_forms(id,purpose,scope_id,vacancy_id,version_id,category,definition,privacy_notice_version,document_policy_version,approved_by) values($1,'vacancy',$2,$3,$4,$5,$6,'synthetic-notice','pdf-v1',$7)", [id, v.scope, v.id, v.version, v.content.category, j(definition), approvedBy]);
  return { id, definition, vacancy: v };
}
async function caseRecord(input?: Awaited<ReturnType<typeof form>>, email = "applicant@example.test", reapply?: string) {
  const f = input ?? await form();
  const id = randomUUID(), v = f.vacancy;
  await db.query("insert into public.recruitment_cases(id,kind,scope_id,vacancy_id,version_id,publication_id,form_id,retention_due_at) values($1,'vacancy',$2,$3,$4,$5,$6,now())", [id, v.scope, v.id, v.version, v.publication, f.id]);
  if (email)
    await db.query("insert into public.recruitment_case_contacts(case_id,kind,scope_id,vacancy_id,normalized_email,email_hmac,key_version,verified_at,reapplication_authorized_by,reapplication_approval_ref) values($1,'vacancy',$2,$3,$4,$5,1,now(),$6,$7)", [id, v.scope, v.id, email, "a".repeat(64), reapply ?? null, reapply ? "SYNTHETIC-REAPPLICATION" : null]);
  return { id, form: f, scope: v.scope };
}
async function staff(id: string, role: string) {
  await db.query("insert into public.recruitment_staff(user_id,role,enabled,granted_by) values($1,$2,true,$3)", [id, role, owner]);
}
async function scope(id: string, scopeId: string) {
  await db.query("insert into public.recruitment_staff_scopes(user_id,scope_id,enabled,granted_by) values($1,$2,true,$3)", [id, scopeId, owner]);
}
const allowed = (id: string, caseId: string, action = "read") => value<boolean>("select public.recruitment_case_staff_allowed($1,$2,$3) v", [id, caseId, action]);
const assign = (id: string, caseId: string) => db.query("insert into public.recruitment_case_assignments(case_id,user_id,enabled,granted_by) values($1,$2,true,$3)", [caseId, id, owner]);
const completeAnswers = () => ({ fields: {
  firstName: "Synthetic", lastName: "Applicant", location: "Cape Town", availability: "Afternoons",
  adultConfirmed: true, privacyAcknowledged: true, subjects: ["Mathematics"], grades: ["12"],
  qualifications: "Relevant qualification", teachingExperience: "Relevant experience",
}, questions: { motivation: "Relevant motivation" } });

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create schema storage;create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
  await db.exec(schema.replace('create extension if not exists "pgcrypto";', ""));
  for (const [id, email] of [[owner, "owner@example.test"], [manager, "manager@example.test"], [officer, "officer@example.test"], [otherOwner, "independent@example.test"], [outsider, "outsider@example.test"]])
    await db.query("insert into auth.users values($1,$2,now())", [id, email]);
}, 30000);
beforeEach(async () => {
  await db.exec("truncate public.recruitment_staff,public.recruitment_scopes,public.recruitment_events,public.recruitment_requests,public.recruitment_operational_events cascade; update public.recruitment_settings set bootstrapped_at=null,revision=0,staff_console_enabled=false,access_guards_enabled=false,access_guards_mandatory=false,owner_aal2_required=false;update auth.users set email_confirmed_at=now();");
  await db.query("update auth.users set email=$2 where id=$1", [owner, "owner@example.test"]);
  await db.query("update auth.users set email=$2 where id=$1", [officer, "officer@example.test"]);
  await db.query("select public.recruitment_bootstrap($1,'synthetic-operator','M31-TEST','Authorized isolated foundation test')", [owner]);
  await db.exec("update public.recruitment_settings set staff_console_enabled=true,access_guards_enabled=true");
});
afterAll(async () => { await db?.close(); });

describe("M3.1 immutable intake contracts", () => {
  it.each(["tutor", "administrator", "support_staff"] as const)("matches SQL and TypeScript %s templates and isolates roles", async (category) => {
    const v = await vacancy(content(category));
    const f = await form(v);
    expect(await value("select public.recruitment_intake_definition('vacancy',$1,$2) v", [category, j(v.content)])).toEqual(f.definition);
    const answer = { fields: { administrativeSkills: "Unexpected" }, questions: {} };
    if (category !== "administrator") {
      expect(intakeAnswersSchema(f.definition).safeParse(answer).success).toBe(false);
      expect(await value("select public.recruitment_answers_valid($1,$2,false) v", [f.id, j(answer)])).toBe(false);
    }
    expect(f.definition.documentPolicy).toEqual({ mimeTypes: ["application/pdf"], maxFileBytes: 10485760, maxFiles: 8, maxCaseBytes: 41943040, cleanRequired: true });
  });
  it("matches the general pool template without a tutor category or implied document requirements", async () => {
    const definition = createIntakeDefinition("talent_pool", null);
    expect(await value("select public.recruitment_intake_definition('talent_pool',null,null) v")).toEqual(definition);
    expect(definition.category).toBeNull();
    expect(definition.fields.map((f) => f.key)).not.toContain("teachingExperience");
    expect(definition.requiredDocuments).toEqual([]);
    expect(() => createIntakeDefinition("talent_pool", "tutor")).toThrow("intake_purpose_mismatch");
  });
  it("requires a currently verified owner and approved version, and makes forms immutable", async () => {
    await staff(manager, "manager");
    const v = await vacancy();
    await expect(form(v, manager)).rejects.toThrow("permission");
    await db.query("update auth.users set email_confirmed_at=null where id=$1", [owner]);
    await expect(form(v)).rejects.toThrow("permission");
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [owner]);
    const f = await form(v);
    expect(await value<string>("select definition_hash v from public.recruitment_intake_forms where id=$1", [f.id])).toMatch(/^[0-9a-f]{64}$/);
    await expect(db.query("update public.recruitment_intake_forms set definition='{}' where id=$1", [f.id])).rejects.toThrow("append-only");
    await expect(db.query("delete from public.recruitment_intake_forms where id=$1", [f.id])).rejects.toThrow("append-only");
  });
  it("rejects invented fields/scripts and incompatible approved document sets before binding", async () => {
    const v = await vacancy();
    const definition = { ...createIntakeDefinition("vacancy", "tutor", v.content), script: "untrusted" };
    await expect(db.query("insert into public.recruitment_intake_forms(purpose,scope_id,vacancy_id,version_id,category,definition,privacy_notice_version,document_policy_version,approved_by) values('vacancy',$1,$2,$3,'tutor',$4,'notice','pdf-v1',$5)", [v.scope, v.id, v.version, j(definition), owner])).rejects.toThrow("intake_definition_mismatch");
    const tooMany = content("tutor", { requiredDocuments: Array.from({ length: 9 }, (_, n) => ({ key: `doc${n}`, label: "Document", required: true })) });
    expect(() => createIntakeDefinition("vacancy", "tutor", tooMany)).toThrow("incompatible_document_requirements");
    await expect(db.query("select public.recruitment_intake_definition('vacancy','tutor',$1)", [j(tooMany)])).rejects.toThrow("incompatible_document_requirements");
  });
  it("checks complete answers, adult affirmation, unknown keys, numeric bounds and document-question namespaces", async () => {
    const f = await form();
    const samples = [
      { fields: {}, questions: {} }, completeAnswers(),
      { ...completeAnswers(), fields: { ...completeAnswers().fields, adultConfirmed: false } },
      { ...completeAnswers(), fields: { ...completeAnswers().fields, nationalId: "not collected" } },
      { ...completeAnswers(), fields: { ...completeAnswers().fields, subjects: ["Unknown"] } },
      { ...completeAnswers(), fields: { ...completeAnswers().fields, grades: ["12", "12"] } },
      { ...completeAnswers(), questions: { motivation: false } },
      { ...completeAnswers(), questions: { motivation: "x".repeat(4001) } },
    ];
    for (const sample of samples) for (const complete of [false, true])
      expect(await value("select public.recruitment_answers_valid($1,$2,$3) v", [f.id, j(sample), complete])).toBe(intakeAnswersSchema(f.definition, complete).safeParse(sample).success);
    expect(intakeAnswersSchema(f.definition, true).safeParse(completeAnswers()).success).toBe(true);
    const numeric = await form(await vacancy(content("tutor", { questions: [{ key: "location", label: "Numeric question in a separate namespace", type: "number", required: true }] })));
    expect(intakeAnswersSchema(numeric.definition, true).safeParse({ ...completeAnswers(), questions: { location: Infinity } }).success).toBe(false);
    expect(await value("select public.recruitment_answers_valid($1,'{\"fields\":{},\"questions\":{\"location\":1e309}}',false) v", [numeric.id])).toBe(false);
  });
  it("keeps bindings default off, owner-controlled and exact-version linked", async () => {
    const f = await form();
    await db.query("insert into public.recruitment_intake_form_bindings(form_id,purpose,scope_id,vacancy_id,version_id,updated_by) values($1,'vacancy',$2,$3,$4,$5)", [f.id, f.vacancy.scope, f.vacancy.id, f.vacancy.version, owner]);
    expect(await value("select enabled v from public.recruitment_intake_form_bindings where form_id=$1", [f.id])).toBe(false);
    await staff(manager, "manager");
    await expect(db.query("update public.recruitment_intake_form_bindings set enabled=true,updated_by=$2 where form_id=$1", [f.id, manager])).rejects.toThrow("permission");
    await db.query("update public.recruitment_vacancies set status='paused' where id=$1", [f.vacancy.id]);
    await expect(db.query("update public.recruitment_intake_form_bindings set enabled=true where form_id=$1", [f.id])).rejects.toThrow("intake_publication_required");
  });
});

describe("M3.1 case isolation and authorization", () => {
  it("pins exact scope/form/publication relationships and never requires applicant Auth", async () => {
    const c = await caseRecord();
    expect(await value("select count(*)::int v from auth.users where id=$1", [c.id])).toBe(0);
    expect(await allowed(c.id, c.id)).toBe(false);
    const other = await vacancy();
    await expect(db.query("insert into public.recruitment_cases(kind,scope_id,vacancy_id,version_id,publication_id,form_id,retention_due_at) values('vacancy',$1,$2,$3,$4,$5,now())", [c.scope, other.id, other.version, other.publication, c.form.id])).rejects.toThrow("case_form_mismatch");
    await expect(db.query("update public.recruitment_cases set publication_id=$2,revision=revision+1 where id=$1", [c.id, other.publication])).rejects.toThrow("foreign key");
  });
  it("enforces one active email/vacancy across HMAC rotations and controlled reapplication", async () => {
    const f = await form(), c = await caseRecord(f);
    await expect(caseRecord(f)).rejects.toThrow("duplicate key");
    await db.query("update public.recruitment_case_contacts set email_hmac=$2,key_version=2 where case_id=$1", [c.id, "b".repeat(64)]);
    await expect(caseRecord(f)).rejects.toThrow("duplicate key");
    await db.query("update public.recruitment_cases set state='withdrawn',withdrawn_at=now(),revision=revision+1 where id=$1", [c.id]);
    await expect(caseRecord(f)).rejects.toThrow("controlled_reapplication_required");
    const next = await caseRecord(f, "applicant@example.test", owner);
    expect(await value("select active v from public.recruitment_case_contacts where case_id=$1", [next.id])).toBe(true);
    await expect(db.query("update public.recruitment_case_contacts set active=false where case_id=$1", [next.id])).resolves.toBeDefined();
    expect(await value("select active v from public.recruitment_case_contacts where case_id=$1", [next.id])).toBe(true);
  });
  it("requires active case assignment as well as scope and keeps case work available after vacancy closure", async () => {
    const c = await caseRecord();
    await staff(manager, "manager"); await staff(officer, "officer");
    await scope(manager, c.scope); await scope(officer, c.scope);
    expect(await allowed(manager, c.id)).toBe(false);
    expect(await allowed(officer, c.id)).toBe(false);
    await assign(manager, c.id); await assign(officer, c.id);
    expect(await allowed(manager, c.id, "assign")).toBe(true);
    expect(await allowed(officer, c.id, "assign")).toBe(false);
    expect(await allowed(officer, c.id, "document")).toBe(true);
    expect(await allowed(manager, c.id, "hold")).toBe(false);
    await db.query("update public.recruitment_vacancies set status='closed' where id=$1", [c.form.vacancy.id]);
    expect(await allowed(officer, c.id)).toBe(true);
    await db.query("update public.recruitment_staff_scopes set enabled=false where user_id=$1", [officer]);
    expect(await allowed(officer, c.id)).toBe(false);
    expect(await allowed(owner, c.id, "hire")).toBe(false);
    // Seed a legacy administrator with guards disabled only in this isolated fixture.
    await db.exec("update public.recruitment_settings set staff_console_enabled=false,access_guards_enabled=false");
    await db.query("insert into public.admin_users(user_id,finance_role) values($1,'owner') on conflict do nothing", [outsider]);
    await db.exec("update public.recruitment_settings set staff_console_enabled=true,access_guards_enabled=true");
    expect(await allowed(outsider, c.id)).toBe(false);
  });
  it("captures owner self-interest and keeps it sticky after both applicant and staff email changes", async () => {
    const c = await caseRecord(await form(), "owner@example.test");
    for (const a of ["read", "document", "review", "assign", "hold", "extend_retention", "resolve_conflict"])
      expect(await allowed(owner, c.id, a)).toBe(false);
    await db.query("update auth.users set email='owner-new@example.test' where id=$1", [owner]);
    await db.query("update public.recruitment_case_contacts set normalized_email='candidate-new@example.test',email_revision=2,verified_at=clock_timestamp()+interval '1 second' where case_id=$1", [c.id]);
    expect(await allowed(owner, c.id)).toBe(false);
    await expect(db.query("update public.recruitment_case_conflicts set resolved_by=$2,resolved_at=now(),resolution_ref='SELF-APPROVAL' where case_id=$1", [c.id, owner])).rejects.toThrow("independent_authority_required");
    await staff(otherOwner, "owner");
    await db.query("update public.recruitment_case_conflicts set resolved_by=$2,resolved_at=now(),resolution_ref='INDEPENDENT-APPROVAL' where case_id=$1", [c.id, otherOwner]);
    expect(await allowed(owner, c.id)).toBe(true);
  });
  it("captures later staff matches and denies clearing an actual current identity match", async () => {
    const c = await caseRecord(await form(), "officer@example.test");
    await staff(officer, "officer");
    expect(await value("select count(*)::int v from public.recruitment_case_conflicts where case_id=$1 and user_id=$2", [c.id, officer])).toBe(1);
    await expect(db.query("update public.recruitment_case_conflicts set resolved_by=$2,resolved_at=now(),resolution_ref='APPROVAL' where case_id=$1", [c.id, owner])).rejects.toThrow("current_identity_conflict");
    await db.query("update auth.users set email='other-officer@example.test' where id=$1", [officer]);
    expect(await value("select public.recruitment_case_conflicted($1,$2) v", [officer, c.id])).toBe(true);
  });
  it("allows assignment revocation after target unverification/disable and never regains it on reverification", async () => {
    const c = await caseRecord(); await staff(officer, "officer"); await scope(officer, c.scope); await assign(officer, c.id);
    await db.query("update auth.users set email_confirmed_at=null where id=$1", [officer]);
    expect(await allowed(officer, c.id)).toBe(false);
    await db.query("update public.recruitment_staff set enabled=false where user_id=$1", [officer]);
    await db.query("update public.recruitment_case_assignments set enabled=false,revision=revision+1 where case_id=$1 and user_id=$2", [c.id, officer]);
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [officer]);
    await db.query("update public.recruitment_staff set enabled=true where user_id=$1", [officer]);
    expect(await allowed(officer, c.id)).toBe(false);
  });
  it("seals answers against updates but permits controlled-owner deletion rather than immutable PII", async () => {
    const c = await caseRecord();
    await db.query("insert into public.recruitment_case_payloads(case_id,form_id,revision,kind,answers,sealed_at) values($1,$2,0,'submitted',$3,now())", [c.id, c.form.id, j(completeAnswers())]);
    await expect(db.query("update public.recruitment_case_payloads set answers=$2 where case_id=$1", [c.id, j(completeAnswers())])).rejects.toThrow("sealed_payload_immutable");
    await db.query("delete from public.recruitment_case_payloads where case_id=$1", [c.id]);
    expect(await value("select count(*)::int v from public.recruitment_case_payloads where case_id=$1", [c.id])).toBe(0);
  });
});

describe("M3.1 retention, evidence and dormant rollout", () => {
  it("calculates qualifying draft, twelve-month review, thirty-day withdrawal and six-month unsuccessful clocks", async () => {
    const activity = "2024-01-31T10:00:00Z";
    const deadline = (...args: (string | null)[]) => value<Date>("select public.recruitment_retention_deadline('vacancy',$1,$2,$3,$4,null,$5) v", [activity, ...args]);
    expect((await deadline(null, null, null, null)).toISOString()).toBe("2024-02-14T10:00:00.000Z");
    expect((await deadline("2024-02-29T10:00:00Z", null, null, null)).toISOString()).toBe("2025-02-28T10:00:00.000Z");
    expect((await deadline(activity, "2024-02-01T10:00:00Z", null, null)).toISOString()).toBe("2024-03-02T10:00:00.000Z");
    expect((await deadline(activity, null, "2024-08-31T10:00:00Z", null)).toISOString()).toBe("2025-02-28T10:00:00.000Z");
    expect((await value<Date>("select public.recruitment_retention_deadline('talent_pool',$1,null,null,null,$1,null) v", ["2024-02-29T23:00:00+02:00"])).toISOString()).toBe("2025-02-28T21:00:00.000Z");
    await db.exec("set timezone='America/New_York'");
    expect((await deadline(null, null, null, null)).toISOString()).toBe("2024-02-14T10:00:00.000Z");
    await db.exec("set timezone='UTC'");
  });
  it("requires authorized finite extensions and never uses recommendations as unsuccessful closure", async () => {
    const c = await caseRecord();
    await db.query("update public.recruitment_cases set state='submitted',submitted_at=now(),revision=revision+1 where id=$1", [c.id]);
    const base = await value<Date>("select retention_due_at v from public.recruitment_cases where id=$1", [c.id]);
    await staff(manager, "manager");
    await expect(db.query("update public.recruitment_cases set retention_extended_until=retention_due_at+interval '1 month',extension_authorized_by=$2,extension_approval_ref='EXTENSION-APPROVAL',revision=revision+1 where id=$1", [c.id, manager])).rejects.toThrow("permission");
    await db.query("update public.recruitment_cases set retention_extended_until=retention_due_at+interval '1 month',extension_authorized_by=$2,extension_approval_ref='EXTENSION-APPROVAL',revision=revision+1 where id=$1", [c.id, owner]);
    expect((await value<Date>("select retention_due_at v from public.recruitment_cases where id=$1", [c.id])).getTime()).toBeGreaterThan(base.getTime());
    await expect(db.query("update public.recruitment_cases set unsuccessful_closed_at=now(),revision=revision+1 where id=$1", [c.id])).rejects.toThrow("final_decisions_unavailable");
    await db.query("update public.recruitment_cases set state='withdrawn',withdrawn_at=now(),revision=revision+1 where id=$1", [c.id]);
    expect(await value("select abs(extract(epoch from (retention_due_at-withdrawn_at))-30*86400)<1 v from public.recruitment_cases where id=$1", [c.id])).toBe(true);
  });
  it("serializes holds before the irreversible barrier, with independent owner authority and no bypass after it", async () => {
    const c = await caseRecord();
    await db.query("update public.recruitment_cases set state='deletion_pending',revision=revision+1 where id=$1", [c.id]);
    await db.query("insert into public.recruitment_privacy_holds(case_id,purpose,reason_code,evidence_ref,placed_by,review_at) values($1,'vacancy','legal_obligation','LEGAL-APPROVAL',$2,now()+interval '30 days')", [c.id, owner]);
    await expect(db.query("update public.recruitment_cases set deletion_barrier_at=now(),revision=revision+1 where id=$1", [c.id])).rejects.toThrow("active_privacy_hold");
    await db.query("update public.recruitment_privacy_holds set released_by=$2,released_at=now() where case_id=$1", [c.id, owner]);
    await db.query("update public.recruitment_cases set deletion_barrier_at=now(),revision=revision+1 where id=$1", [c.id]);
    await expect(db.query("insert into public.recruitment_privacy_holds(case_id,purpose,reason_code,evidence_ref,placed_by,review_at) values($1,'vacancy','legal_obligation','LATE-APPROVAL',$2,now()+interval '30 days')", [c.id, owner])).rejects.toThrow("hold_authority_required");
  });
  it("uses stable case principals for idempotency, rejects duplicate requests, and keeps evidence purgeable", async () => {
    const c = await caseRecord(), request = randomUUID();
    const sql = "insert into public.recruitment_case_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,state,expires_at) values($1,'applicant',$2,$3,'save',$4,'pending',now()+interval '14 days')";
    await db.query(sql, [c.id, c.id, request, "a".repeat(64)]);
    await expect(db.query(sql, [c.id, c.id, request, "b".repeat(64)])).rejects.toThrow("duplicate key");
    await expect(db.query(sql, [c.id, randomUUID(), randomUUID(), "a".repeat(64)])).rejects.toThrow("check constraint");
    await db.query("insert into public.recruitment_case_audit(case_id,actor_kind,actor_id,action,revision,expires_at) values($1,'applicant',$1,'draft_saved',0,now()+interval '14 days')", [c.id]);
    await expect(db.query("update public.recruitment_case_audit set revision=1 where case_id=$1", [c.id])).rejects.toThrow("append-only");
    await db.query("delete from public.recruitment_case_audit where case_id=$1", [c.id]);
    expect(await value("select count(*)::int v from public.recruitment_requests")).toBe(0);
    await expect(db.query("insert into public.recruitment_case_audit(case_id,actor_kind,action,revision,expires_at) values($1,'applicant','draft_saved',0,now())", [c.id])).rejects.toThrow("check constraint");
  });
  it("protects all 13 tables and all new functions from browser/service roles, with no enabling API", async () => {
    const names = ["intake_forms", "intake_form_bindings", "cases", "case_contacts", "case_payloads", "case_assignments", "case_conflicts", "consent_events", "case_audit", "privacy_holds", "case_requests", "staff_change_buffers", "case_challenges"].map((n) => `recruitment_${n}`);
    for (const name of names) {
      expect(await value("select relrowsecurity v from pg_class where oid=$1::regclass", [`public.${name}`])).toBe(true);
      for (const role of ["anon", "authenticated", "service_role"])
        expect(await value("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') v", [role, `public.${name}`])).toBe(false);
    }
    const functions = await db.query<{ signature: string }>("select p.oid::regprocedure::text signature from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('recruitment_intake_field','recruitment_intake_definition','recruitment_guard_intake_form','recruitment_answers_valid','recruitment_case_conflicted','recruitment_case_staff_allowed','recruitment_retention_deadline','recruitment_guard_case','recruitment_guard_case_contact','recruitment_sync_case_contact','recruitment_capture_case_conflicts','recruitment_capture_staff_conflicts','recruitment_guard_case_evidence')");
    expect(functions.rows).toHaveLength(13);
    for (const f of functions.rows) for (const role of ["anon", "authenticated", "service_role"])
      expect(await value("select has_function_privilege($1,$2,'EXECUTE') v", [role, f.signature])).toBe(false);
    for (const flag of ["vacancy_intake_enabled", "talent_pool_intake_enabled", "applicant_email_enabled", "document_uploads_enabled", "case_processing_enabled"]) {
      expect(await value(`select ${flag} v from public.recruitment_settings`)).toBe(false);
      await expect(db.exec(`update public.recruitment_settings set ${flag}=true`)).rejects.toThrow("recruitment_m31_intake_interlock");
    }
    await db.exec("set role anon");
    try { await expect(db.exec("select * from public.recruitment_cases")).rejects.toThrow("permission denied"); }
    finally { await db.exec("reset role"); }
  });
  it("keeps consent independent by purpose and checks verified email revisions and calendar expiry", async () => {
    const c = await caseRecord();
    await expect(db.query("insert into public.recruitment_consent_events(case_id,purpose,action,notice_version,email_revision,evidence_expires_at) values($1,'talent_pool','withdraw','notice',1,now()+interval '1 year')", [c.id])).rejects.toThrow("consent_purpose_mismatch");
    await expect(db.query("insert into public.recruitment_consent_events(case_id,purpose,action,notice_version,email_revision,evidence_expires_at) values($1,'vacancy_notice','acknowledge','notice',2,now()+interval '1 year')", [c.id])).rejects.toThrow("consent_verification_required");
    const poolScope = randomUUID(), poolForm = randomUUID(), poolCase = randomUUID();
    await db.query("insert into public.recruitment_scopes(id,kind,label) values($1,'talent_pool','Synthetic pool')", [poolScope]);
    await db.query("insert into public.recruitment_intake_forms(id,purpose,scope_id,definition,privacy_notice_version,document_policy_version,approved_by) values($1,'talent_pool',$2,$3,'notice','pdf-v1',$4)", [poolForm, poolScope, j(createIntakeDefinition("talent_pool", null)), owner]);
    await db.query("insert into public.recruitment_cases(id,kind,scope_id,form_id,retention_due_at) values($1,'talent_pool',$2,$3,now())", [poolCase, poolScope, poolForm]);
    await db.query("insert into public.recruitment_case_contacts(case_id,kind,scope_id,normalized_email,email_hmac,key_version,verified_at) values($1,'talent_pool',$2,'applicant@example.test',$3,1,now())", [poolCase, poolScope, "c".repeat(64)]);
    const consentSql = "insert into public.recruitment_consent_events(case_id,purpose,action,notice_version,email_revision,recorded_at,expires_at,evidence_expires_at) values($1,'talent_pool','affirm','notice',1,'2024-02-29T10:00:00Z',$2,'2025-03-30T10:00:00Z')";
    await expect(db.query(consentSql, [poolCase, "2025-03-01T10:00:00Z"])).rejects.toThrow("consent_expiry_mismatch");
    await db.query(consentSql, [poolCase, "2025-02-28T10:00:00Z"]);
    expect(await value("select count(*)::int v from public.recruitment_consent_events where case_id=$1", [poolCase])).toBe(1);
    expect(await value("select count(*)::int v from public.recruitment_consent_events where case_id=$1", [c.id])).toBe(0);
  });
  it("does not renew a draft on reads and prevents reversal or premature completion of erasure", async () => {
    const c = await caseRecord();
    const before = await value("select retention_due_at v from public.recruitment_cases where id=$1", [c.id]);
    await allowed(owner, c.id); await allowed(owner, c.id);
    expect(await value("select retention_due_at v from public.recruitment_cases where id=$1", [c.id])).toEqual(before);
    await expect(db.query("update public.recruitment_cases set reference=gen_random_uuid(),revision=revision+1 where id=$1", [c.id])).rejects.toThrow("case_identity_immutable");
    await expect(db.query("update public.recruitment_cases set deletion_barrier_at=now(),revision=revision+1 where id=$1", [c.id])).rejects.toThrow("check constraint");
    await expect(db.query("update public.recruitment_cases set revision=revision where id=$1", [c.id])).rejects.toThrow("case_revision_conflict");
    await db.query("update public.recruitment_cases set state='deletion_pending',deletion_barrier_at=now(),revision=revision+1 where id=$1", [c.id]);
    await expect(db.query("update public.recruitment_cases set deletion_barrier_at=null,revision=revision+1 where id=$1", [c.id])).rejects.toThrow("deletion_barrier_immutable");
    await expect(db.query("update public.recruitment_cases set state='purged',purged_at=now(),revision=revision+1 where id=$1", [c.id])).rejects.toThrow("case_pii_not_erased");
    await db.query("delete from public.recruitment_case_contacts where case_id=$1", [c.id]);
    await db.query("update public.recruitment_cases set state='purged',purged_at=now(),revision=revision+1 where id=$1", [c.id]);
    expect(await allowed(owner, c.id)).toBe(false);
  });
  it("binds staged PII proofs to exactly one case, staff session, digest and revision and prevents revival", async () => {
    const a = await caseRecord(), b = await caseRecord();
    const changeId = randomUUID(), digest = "a".repeat(64), session = "b".repeat(64), secret = "c".repeat(64);
    const time = new Date(), expires = new Date(time.getTime() + 240000);
    await db.query("insert into public.recruitment_staff_change_buffers(id,case_id,actor_id,session_hash,operation,expected_revision,payload,payload_digest,created_at,expires_at) values($1,$2,$3,$4,'note',0,$5,$6,$7,$8)", [changeId, a.id, owner, session, j({ text: "Synthetic private note" }), digest, time, expires]);
    const sql = "insert into public.recruitment_case_challenges(secret_hash,case_id,actor_id,session_hash,request_id,operation,expected_revision,change_id,payload_digest,created_at,expires_at) values($1,$2,$3,$4,$5,'note',0,$6,$7,$8,$9)";
    await expect(db.query(sql, [secret, b.id, owner, session, randomUUID(), changeId, digest, time, expires])).rejects.toThrow("case_challenge_mismatch");
    await expect(db.query(sql, [secret, a.id, owner, "d".repeat(64), randomUUID(), changeId, digest, time, expires])).rejects.toThrow("case_challenge_mismatch");
    await db.query(sql, [secret, a.id, owner, session, randomUUID(), changeId, digest, time, expires]);
    await expect(db.query("update public.recruitment_staff_change_buffers set payload=$2 where id=$1", [changeId, j({ text: "Changed note" })])).rejects.toThrow("case_buffer_immutable");
    await db.query("update public.recruitment_staff_change_buffers set consumed_at=now() where id=$1", [changeId]);
    await db.query("update public.recruitment_case_challenges set consumed_at=now() where secret_hash=$1", [secret]);
    await expect(db.query("update public.recruitment_case_challenges set consumed_at=null where secret_hash=$1", [secret])).rejects.toThrow("case_proof_already_consumed");
    await expect(db.query("update public.recruitment_staff_change_buffers set consumed_at=null where id=$1", [changeId])).rejects.toThrow("case_buffer_already_consumed");
    expect(await value("select count(*)::int v from public.recruitment_requests")).toBe(0);
  });
  it("makes a committed request immutable without binding its identity to a rotating session", async () => {
    const c = await caseRecord(), request = randomUUID(), result = randomUUID();
    await db.query("insert into public.recruitment_case_requests(case_id,actor_kind,actor_id,request_id,operation,payload_digest,state,expires_at) values($1,'applicant',$1,$2,'submit',$3,'pending',now()+interval '1 year')", [c.id, request, "a".repeat(64)]);
    await db.query("update public.recruitment_case_requests set state='committed',result_ref=$3 where case_id=$1 and request_id=$2", [c.id, request, result]);
    await expect(db.query("update public.recruitment_case_requests set payload_digest=$3 where case_id=$1 and request_id=$2", [c.id, request, "b".repeat(64)])).rejects.toThrow("case_request_immutable");
    await expect(db.query("update public.recruitment_case_requests set state='pending' where case_id=$1 and request_id=$2", [c.id, request])).rejects.toThrow("case_request_immutable");
  });
  it("upgrades populated M1/M2 without rewriting existing people, grants, vacancies, teaching or ledger data", async () => {
    const upgrade = new PGlite();
    try {
      await upgrade.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create schema storage;create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
      await upgrade.exec(schema.split("-- BEGIN RECRUITMENT MILESTONE 3.1")[0].replace('create extension if not exists "pgcrypto";', ""));
      await upgrade.query("insert into auth.users values($1,'upgrade@example.test',now())", [owner]);
      await upgrade.query("insert into public.admin_users(user_id,finance_role) values($1,'owner')", [owner]);
      await upgrade.query("select public.recruitment_bootstrap($1,'synthetic-operator','UPGRADE-APPROVAL','Authorized isolated populated upgrade')", [owner]);
      await upgrade.query("select set_config('viva.teaching_actor',$1,false)", [owner]);
      await upgrade.query("insert into public.teaching_tutors(name,email,user_id) values('Synthetic preserved tutor','upgrade@example.test',$1)", [owner]);
      await upgrade.query("insert into public.applications(application_number,learner_name,learner_email,guardian_name,guardian_email,grade_level,tutoring_mode) values('SYNTHETIC-M31','Synthetic learner','learner@example.test','Synthetic guardian','guardian@example.test','Grade 12','online')");
      await upgrade.query("select public.accounting_post($1,'m31-opening',public.tuition_today(),'Synthetic opening','manual',null,'[{\"account\":\"1000\",\"cents\":10000},{\"account\":\"3000\",\"cents\":-10000}]')", [owner]);
      await upgrade.query("insert into public.recruitment_scopes(kind,label) values('vacancy','Populated preserved scope')");
      const command = { requestId: randomUUID(), scopeId: null, content: content() }, proof = "e".repeat(64), session = "f".repeat(64);
      await upgrade.query("select public.recruitment_issue_challenge($1,$2,'vacancy_create',$3,$4)", [owner, session, j(command), proof]);
      await upgrade.query("select public.recruitment_mutate($1,'vacancy_create',$2,$3,$4)", [owner, j(command), session, proof]);
      const tables = ["auth.users", "public.admin_users", "public.applications", "public.teaching_tutors", "public.recruitment_tutor_bindings", "public.recruitment_staff", "public.recruitment_scopes", "public.recruitment_vacancies", "public.recruitment_vacancy_versions", "public.recruitment_requests", "public.recruitment_events", "public.accounting_journals", "public.accounting_lines"];
      const capture = async () => Promise.all(tables.map(async (t) => (await upgrade.query(`select to_jsonb(x) row from ${t} x order by to_jsonb(x)::text`)).rows));
      const before = await capture();
      await upgrade.exec(`begin;${migration}commit;`);
      expect(await capture()).toEqual(before);
      expect((await upgrade.query("select count(*)::int n from public.recruitment_cases")).rows[0]).toEqual({ n: 0 });
    } finally { await upgrade.close(); }
  }, 30000);
  it("keeps canonical SQL, fresh schema and transaction bundle identical and supports rerun without changing legacy functions", async () => {
    expect(schema.split("-- BEGIN RECRUITMENT MILESTONE 3.1\n")[1].split("-- END RECRUITMENT MILESTONE 3.1")[0].trim()).toBe(migration.trim());
    expect(readFileSync("docs/recruitment/milestone-3/phase-1/migration.sql", "utf8")).toContain(migration);
    const capture = () => db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('recruitment_mutate','recruitment_authorize','recruitment_assert','recruitment_require_assurance','tutor_bind','accounting_post') order by oid");
    const before = (await capture()).rows;
    const c = await caseRecord();
    await db.exec(migration);
    expect((await capture()).rows).toEqual(before);
    expect(await allowed(owner, c.id)).toBe(true);
  });
});
