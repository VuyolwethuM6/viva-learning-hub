/* eslint-disable @typescript-eslint/no-explicit-any -- Disposable PostgreSQL package rehearsal compares heterogeneous synthetic records. */
// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fixture } from "./helpers/recruitment-m3";
const directory = "docs/recruitment/milestone-4-5/production/";
const manifest = JSON.parse(readFileSync(directory + "manifest.json", "utf8"));
const installer = readFileSync(directory + "migration.sql", "utf8");
const boundInstaller = installer.replace(/__REQUIRED_[A-Z0-9_]+__/g, "SYNTHETIC-REHEARSAL-ONLY");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
let f: Awaited<ReturnType<typeof fixture>>;
let baseline: Record<string, unknown>;
let baselineTables: string[];
async function snapshot() {
  const data: Record<string, unknown> = {};
  for (const table of baselineTables) {
    const quoted = table.replaceAll('"', '""');
    const result = await f.db.query<any>(`select coalesce(jsonb_agg(to_jsonb(t)-array['selection_enabled','onboarding_enabled','activation_enabled'] order by to_jsonb(t)::text),'[]') value from public."${quoted}" t`);
    data[table] = result.rows[0].value;
  }
  data.buckets = (await f.db.query<any>("select jsonb_agg(to_jsonb(b) order by b.id) value from storage.buckets b")).rows[0].value;
  data.auth = (await f.db.query<any>("select jsonb_agg(to_jsonb(u) order by u.id) value from auth.users u")).rows[0].value;
  data.operationalEvents = (await f.db.query<any>("select jsonb_agg(to_jsonb(e) order by e.id) value from public.recruitment_operational_events e where action<>'installation_m4_m5'")).rows[0].value;
  data.vacancyReferenceSequence = (await f.db.query<any>("select last_value,is_called from public.recruitment_vacancy_reference_seq")).rows[0];
  return data;
}
beforeAll(async () => {
  f = await fixture();
  // Real M2+M3 RPCs create existing data before the incremental installation.
  await f.enable();
  const vacancy = await f.vacancy("tutor", false);
  await f.email(vacancy.slug);
  await f.db.exec("update public.recruitment_settings set vacancy_intake_enabled=false,talent_pool_intake_enabled=false,document_uploads_enabled=false,case_processing_enabled=false,applicant_email_enabled=false");
  await f.db.query("insert into public.recruitment_operational_events(action,database_actor,operator_reference,approval_reference,reason,details) values('installation_m1_m3','synthetic','SYNTHETIC-OPERATOR','SYNTHETIC-APPROVAL','Synthetic historical installation evidence',$1)", [JSON.stringify({ sourceSetSha256: manifest.baselineSourceSetSha256 })]);
  // Four legacy buckets supplement the two established M3 private buckets.
  for (const id of ["synthetic-legacy-one", "synthetic-legacy-two", "synthetic-legacy-three", "synthetic-legacy-four"])
    await f.db.query("insert into storage.buckets(id,name,public) values($1,$1,false)", [id]);
  baselineTables = (await f.db.query<{ relname: string }>("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname<>'recruitment_operational_events' order by relname")).rows.map((row) => row.relname);
  baseline = await snapshot();
}, 120000);
afterEach(async () => { await f?.db.exec("rollback"); });
afterAll(async () => { await f?.db.close(); });

describe("incremental M4/M5 production package", () => {
  it("records deterministic exact ordered sources and artifact hashes without environment or Git dependencies", () => {
    expect(manifest.sourceMigrations).toHaveLength(5);
    expect(manifest.sourceMigrations.map((m: any) => m.path)).toEqual([
      "supabase/migrations/20261115010000_recruitment_selection.sql",
      "supabase/migrations/20261115020000_recruitment_engagement.sql",
      "supabase/migrations/20261115025000_recruitment_onboarding_documents.sql",
      "supabase/migrations/20261115030000_recruitment_lifecycle_workers.sql",
      "supabase/migrations/20261115040000_recruitment_lifecycle_recovery.sql",
    ]);
    let offset = 0;
    for (const migration of manifest.sourceMigrations) {
      const bytes = readFileSync(migration.path);
      expect(sha(bytes)).toBe(migration.sha256);
      expect(bytes.length).toBe(migration.bytes);
      const start = installer.indexOf(bytes.toString("utf8"), offset);
      expect(start).toBeGreaterThanOrEqual(offset);
      offset = start + bytes.toString("utf8").length;
    }
    for (const artifact of manifest.files) {
      const bytes = readFileSync(directory + artifact.path);
      expect(sha(bytes)).toBe(artifact.sha256);
      expect(bytes.length).toBe(artifact.bytes);
    }
    expect(manifest.productionSqlExecuted).toBe(false);
    expect(manifest.liveFeatureFlagsChanged).toBe(false);
    expect(manifest.environmentVariablesChanged).toBe(false);
    expect(manifest.expectedServiceRpcs).toContain("public.recruitment_lifecycle_tick(integer)");
    expect(manifest.expectedServiceRpcs).not.toContain("public.recruitment_lifecycle_enqueue(uuid,text,text,timestamptz)");
    expect(() => execFileSync(process.execPath, ["scripts/recruitment-m45-package.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });
  it("requires explicit approval references and rolls back a failed preflight", async () => {
    await expect(f.db.exec(installer)).rejects.toThrow("Explicit target");
    await f.db.exec("rollback");
    expect(await snapshot()).toEqual(baseline);
    expect((await f.db.query<any>("select to_regclass('public.recruitment_selection_cases') table_id")).rows[0].table_id).toBeNull();
  });
  it("rejects function drift before overwriting existing security controls", async () => {
    await f.db.exec("begin; create or replace function public.recruitment_scan_promote(p_job uuid,p_claim uuid) returns boolean language sql stable security definer set search_path='' as $$ select false $$;");
    const withoutBegin = boundInstaller.replace(/^begin;$/m, "");
    await expect(f.db.exec(withoutBegin)).rejects.toThrow("Unsupported baseline function: recruitment_scan_promote");
    await f.db.exec("rollback");
    expect(await snapshot()).toEqual(baseline);
  });
  it("rejects unrecognised historical installation evidence without changing populated records", async () => {
    const unrecognisedBaseline = boundInstaller.replace(manifest.baselineSourceSetSha256, "0".repeat(64));
    await expect(f.db.exec(unrecognisedBaseline)).rejects.toThrow("verified M1–M3 installation evidence required");
    await f.db.exec("rollback");
    expect(await snapshot()).toEqual(baseline);
  });
  it("rejects partial prior installation and disabled baseline RLS before migration", async () => {
    await f.db.exec("begin; create table public.recruitment_selection_cases(id uuid);");
    await expect(f.db.exec(boundInstaller.replace(/^begin;$/m, ""))).rejects.toThrow("M4/M5 object already exists");
    await f.db.exec("rollback");
    await f.db.exec("begin; alter table public.recruitment_cases disable row level security;");
    await expect(f.db.exec(boundInstaller.replace(/^begin;$/m, ""))).rejects.toThrow("Unsupported baseline table/RLS: recruitment_cases");
    await f.db.exec("rollback");
    expect(await snapshot()).toEqual(baseline);
  });
  it("rolls back every migration and preserves populated records when postflight fails", async () => {
    const injected = boundInstaller.replace("-- Integrity checks are in the same transaction", () => "do $$begin raise exception 'synthetic_postflight_failure';end$$;\n-- Integrity checks are in the same transaction");
    await expect(f.db.exec(injected)).rejects.toThrow("synthetic_postflight_failure");
    await f.db.exec("rollback");
    expect(await snapshot()).toEqual(baseline);
    expect((await f.db.query<any>("select to_regclass('public.recruitment_selection_cases') table_id")).rows[0].table_id).toBeNull();
    expect((await f.db.query<any>("select count(*)::integer n from information_schema.columns where table_schema='public' and table_name='recruitment_settings' and column_name='selection_enabled'")).rows[0].n).toBe(0);
  });
  it("rejects unexpected service RPC grants in the same atomic installation", async () => {
    const injected = boundInstaller.replace("-- Integrity checks are in the same transaction", () => "create function public.recruitment_synthetic_unreviewed() returns boolean language sql security definer set search_path='' as $$select true$$;revoke all on function public.recruitment_synthetic_unreviewed() from public,anon,authenticated,service_role;grant execute on function public.recruitment_synthetic_unreviewed() to service_role;\n-- Integrity checks are in the same transaction");
    await expect(f.db.exec(injected)).rejects.toThrow("Unexpected service RPC privilege: recruitment_synthetic_unreviewed");
    await f.db.exec("rollback");
    expect(await snapshot()).toEqual(baseline);
    expect((await f.db.query<any>("select to_regprocedure('public.recruitment_synthetic_unreviewed()') signature")).rows[0].signature).toBeNull();
  });
  it("installs all five migrations atomically with original records, settings and buckets intact", async () => {
    await f.db.exec(boundInstaller);
    expect(await snapshot()).toEqual(baseline);
    expect((await f.db.query<any>("select selection_enabled,onboarding_enabled,activation_enabled from public.recruitment_settings")).rows[0]).toEqual({ selection_enabled: false, onboarding_enabled: false, activation_enabled: false });
    const inventory = await f.db.query<any>("select relname,relrowsecurity,has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') browser_access,has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE') direct_service_access from pg_class where relnamespace='public'::regnamespace and relname=any($1) order by relname", [manifest.newTables]);
    expect(inventory.rows).toHaveLength(manifest.newTables.length);
    for (const row of inventory.rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.browser_access).toBe(false);
      expect(row.direct_service_access).toBe(false);
    }
    const actualServiceRpcs = (await f.db.query<{ signature: string }>("select p.oid::regprocedure::text signature from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'recruitment_%' and has_function_privilege('service_role',p.oid,'EXECUTE') order by 1")).rows;
    const expectedServiceRpcs = (await f.db.query<{ signature: string }>("select to_regprocedure(signature)::text signature from unnest($1::text[]) signature order by 1", [manifest.expectedServiceRpcs])).rows;
    expect(actualServiceRpcs).toEqual(expectedServiceRpcs);
    expect((await f.db.query<any>("select count(*)::integer n from public.recruitment_operational_events where action='installation_m4_m5' and details->>'sourceSetSha256'=$1", [manifest.sourceSetSha256])).rows[0].n).toBe(1);
  });
  it("rejects a repeated installation safely without changing installed data", async () => {
    await expect(f.db.exec(boundInstaller)).rejects.toThrow("M4/M5 already installed");
    await f.db.exec("rollback");
    expect(await snapshot()).toEqual(baseline);
    expect((await f.db.query<any>("select count(*)::integer n from public.recruitment_operational_events where action='installation_m4_m5'")).rows[0].n).toBe(1);
  });
});
