/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic SQL/HTTP fixture validates heterogeneous JSON at runtime. */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { emptyVacancyContent } from "../../lib/recruitment-vacancies";
export const owner = "11111111-1111-4111-8111-111111111111";
export const manager = "22222222-2222-4222-8222-222222222222";
export const officer = "33333333-3333-4333-8333-333333333333";
export const migrations = [
  "20261111030000_recruitment_applicants",
  "20261111040000_recruitment_documents_submissions",
  "20261111050000_recruitment_case_operations",
  "20261111060000_recruitment_runtime_guards",
];
export async function fixture() {
  const db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create schema storage;create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  const schema = readFileSync("supabase/schema.sql", "utf8");
  await db.exec(
    schema.replace('create extension if not exists "pgcrypto";', ""),
  );
  if (!schema.includes("-- M3.6 runtime boundaries"))
    for (const n of migrations)
      await db.exec(readFileSync("supabase/migrations/" + n + ".sql", "utf8"));
  async function rpc<T = any>(
    name: string,
    args: Record<string, unknown> = {},
  ) {
    const entries = Object.entries(args);
    return (
      await db.query<{ v: T }>(
        `select public.${name}(${entries.map(([k], i) => `${k}=>$${i + 1}`).join(",")}) v`,
        entries.map(([, v]) =>
          Array.isArray(v) && name === "recruitment_public_intake"
            ? v
            : v !== null && typeof v === "object"
              ? JSON.stringify(v)
              : v,
        ),
      )
    ).rows[0]?.v;
  }
  for (const [id, email] of [
    [owner, "owner@example.test"],
    [manager, "manager@example.test"],
    [officer, "officer@example.test"],
  ])
    await db.query("insert into auth.users values($1,$2,now())", [id, email]);
  await rpc("recruitment_bootstrap", {
    p_owner: owner,
    p_operator: "synthetic-operator",
    p_approval_reference: "M3-TEST",
    p_reason: "Authorized isolated synthetic testing",
  }).catch(async () => {
    await db.query(
      "select public.recruitment_bootstrap($1,'synthetic-operator','M3-TEST','Authorized isolated synthetic testing')",
      [owner],
    );
  });
  await db.exec(
    "update public.recruitment_settings set staff_console_enabled=true,access_guards_enabled=true",
  );
  async function change(
    operation: string,
    data: Record<string, unknown>,
    actor = owner,
  ) {
    const d = { requestId: randomUUID(), ...data },
      proof = randomUUID().replaceAll("-", "").repeat(2);
    await db.query(
      "select public.recruitment_issue_challenge($1,$2,$3,$4,$5)",
      [actor, "a".repeat(64), operation, JSON.stringify(d), proof],
    );
    return (
      await db.query<{ v: any }>(
        "select public.recruitment_mutate($1,$2,$3,$4,$5) v",
        [actor, operation, JSON.stringify(d), "a".repeat(64), proof],
      )
    ).rows[0].v;
  }
  await change("intake_policy", {
    noticeVersion: "synthetic-v1",
    noticeText: "Synthetic privacy notice for isolated tests only. ".repeat(5),
    approvalReference: "SYNTHETIC-LEGAL",
    evidenceDays: 7,
  });
  await db.query(
    "select public.recruitment_intake_operate('attest_operations','synthetic-operator','SYNTHETIC-OPS','Synthetic backup recovery tested',30,null)",
  );
  await db.query(
    "select public.recruitment_intake_operate('attest_scanner','synthetic-operator','SYNTHETIC-SCAN','Synthetic signed protocol only',null,'pdf-v1')",
  );
  // Only this isolated fixture removes the M3.1 production interlock to exercise enabled paths.
  async function enable() {
    await db.exec(
      "alter table public.recruitment_settings drop constraint if exists recruitment_m31_intake_interlock;update public.recruitment_settings set vacancy_intake_enabled=true,talent_pool_intake_enabled=true,applicant_email_enabled=true,document_uploads_enabled=true,case_processing_enabled=true,public_vacancies_enabled=true",
    );
  }
  async function vacancy(category = "tutor", documents = true) {
    const c = {
      ...emptyVacancyContent(),
      title: "Synthetic vacancy",
      category,
      department: "Teaching",
      location: "Cape Town",
      summary: "A synthetic vacancy for isolated testing only.",
      responsibilities: ["Support learning"],
      minimumRequirements: ["Relevant experience"],
      requiredExperience: "Relevant experience",
      scheduleDetails: "Afternoons",
      subjects: category === "tutor" ? ["Mathematics"] : [],
      grades: category === "tutor" ? ["12"] : [],
      opensAt: new Date(Date.now() - 86400000).toISOString(),
      closesAt: new Date(Date.now() + 86400000).toISOString(),
      requiredDocuments: documents
        ? [{ key: "cv", label: "CV", required: true }]
        : [],
    };
    const created = await change("vacancy_create", {
      scopeId: null,
      content: c,
    });
    const id = created.vacancyId;
    let v = (
      await db.query<any>(
        "select * from public.recruitment_vacancies where id=$1",
        [id],
      )
    ).rows[0];
    for (const operation of [
      "vacancy_submit",
      "vacancy_approve",
      "vacancy_publish",
    ]) {
      await change(operation, {
        vacancyId: id,
        expectedRevision: v.revision,
        reason: "",
      });
      v = (
        await db.query<any>(
          "select * from public.recruitment_vacancies where id=$1",
          [id],
        )
      ).rows[0];
    }
    const f = await change("intake_form_approve", {
      purpose: "vacancy",
      vacancyId: id,
      versionId: v.published_version_id,
      noticeVersion: "synthetic-v1",
    });
    await change("intake_form_bind", {
      formId: f.formId,
      expectedRevision: -1,
      enabled: true,
    });
    return { ...v, formId: f.formId, content: c };
  }
  async function email(
    slug: string | null,
    email = "applicant@example.test",
    action = "begin",
    caseReference: string | null = null,
  ) {
    const id = randomUUID(),
      proof = randomUUID().replaceAll("-", "").repeat(2),
      hash = randomUUID().replaceAll("-", "").repeat(2);
    const d = {
      requestId: randomUUID(),
      noticeVersion: "synthetic-v1",
      caseReference: "",
      action,
      purpose: slug ? "vacancy" : "talent_pool",
      slug: slug || "",
      email,
      adultConfirmed: true,
      privacyAcknowledged: true,
      ...(caseReference ? { caseReference } : {}),
    };
    await rpc("recruitment_email_request", {
      p_data: d,
      p_id: id,
      p_proof_hash: proof,
      p_email_hmac: "d".repeat(64),
      p_key_version: 1,
      p_envelope: { v: 1 },
      p_ip_key: randomUUID().replaceAll("-", "").repeat(2),
      p_email_key: randomUUID().replaceAll("-", "").repeat(2),
      p_daily_key: "e".repeat(64),
    });
    const result = await rpc("recruitment_email_exchange", {
      p_id: id,
      p_proof_hash: proof,
      p_email: email,
      p_session_hash: hash,
    });
    return { ...result, hash, email };
  }
  const answers = {
    fields: {
      firstName: "Synthetic",
      lastName: "Applicant",
      location: "Cape Town",
      availability: "Afternoons",
      adultConfirmed: true,
      privacyAcknowledged: true,
      subjects: ["Mathematics"],
      grades: ["12"],
      qualifications: "Relevant qualification",
      teachingExperience: "Relevant teaching experience",
    },
    questions: {},
  };
  return { db, rpc, change, enable, vacancy, email, answers };
}
