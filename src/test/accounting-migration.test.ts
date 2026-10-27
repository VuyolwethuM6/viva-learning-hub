// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

const schema = readFileSync("supabase/schema.sql", "utf8");
const marker = "\n-- BEGIN ACCOUNTING MIGRATIONS";
const setup = readFileSync("docs/accounting-setup.sql", "utf8");
const actor = "11111111-1111-4111-8111-111111111111";
let db: PGlite | undefined;
async function legacyDatabase() {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text); create schema storage; create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb); create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  await db.exec(
    schema
      .split(marker)[0]
      .replace('create extension if not exists "pgcrypto";', ""),
  );
  await db.query("insert into auth.users values($1,'owner@example.test');", [
    actor,
  ]);
  await db.query("insert into public.admin_users(user_id) values($1)", [actor]);
  return db;
}
afterEach(async () => {
  await db?.close();
  db = undefined;
});

describe("reviewable accounting SQL Editor migration", () => {
  it("keeps the fresh schema and single transaction identical to the six canonical migrations", () => {
    const files = readdirSync("supabase/migrations")
      .filter(
        (name) => name.startsWith("20261027") && name.includes("_accounting_"),
      )
      .sort();
    expect(files).toHaveLength(6);
    const canonical = files
      .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
      .join("\n\n");
    const endMarker = "\n-- END ACCOUNTING MIGRATIONS\n";
    const block = schema.slice(
      schema.indexOf(marker),
      schema.indexOf(endMarker) + endMarker.length,
    );
    expect(block).toContain(canonical);
    expect(setup).toContain(block);
    expect(setup.trim()).toMatch(/begin;[\s\S]*commit;$/);
  });
  it("upgrades the existing admin schema atomically, preserves counters and safely reruns", async () => {
    const database = await legacyDatabase();
    await database.exec(
      "insert into public.tuition_invoice_counters(billing_month,last_number) values('2026-11-01',42)",
    );
    await database.exec(setup);
    await database.exec(
      "update public.accounting_settings set automation_enabled=true",
    );
    await database.exec(setup);
    const settings = (
      await database.query<{
        currency: string;
        vat_enabled: boolean;
        automation_enabled: boolean;
        auto_send: boolean;
      }>("select * from public.accounting_settings")
    ).rows[0];
    expect(settings).toMatchObject({
      currency: "ZAR",
      vat_enabled: false,
      automation_enabled: true,
      auto_send: false,
    });
    expect(
      (
        await database.query<Record<string, unknown>>(
          "select finance_role from public.admin_users",
        )
      ).rows[0],
    ).toEqual({ finance_role: "owner" });
    expect(
      (
        await database.query<Record<string, unknown>>(
          "select last_number from public.tuition_invoice_counters",
        )
      ).rows[0].last_number,
    ).toBe(42);
    expect(
      (
        await database.query<Record<string, unknown>>(
          "select public from storage.buckets where id='accounting-documents'",
        )
      ).rows[0].public,
    ).toBe(false);
    expect(
      (
        await database.query<Record<string, unknown>>(
          "select public.accounting_integrity() as value",
        )
      ).rows[0].value,
    ).toEqual({
      trialBalance: 0,
      receivableDifference: 0,
      creditDifference: 0,
      deferredDifference: 0,
      payableDifference: 0,
    });
    expect(
      (
        await database.query<Record<string, unknown>>(
          "select has_function_privilege('authenticated','public.accounting_mutate(uuid,text,jsonb)','execute') as allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  }, 30000);
  it("rejects unimported legacy invoices without installing a partial accounting schema", async () => {
    const database = await legacyDatabase();
    await database.exec(
      `insert into public.applications(application_number,learner_name,learner_email,guardian_name,guardian_email,grade_level,tutoring_mode,monthly_fee,status) values('LEGACY','Test','learner@example.test','Parent','parent@example.test','Grade 12','Online',800,'pending_review')`,
    );
    await database.query<Record<string, unknown>>(
      "insert into public.tuition_invoices(application_id,billing_month,period_start,period_end,due_date,monthly_fee,teaching_days,remaining_days,programme_label,programme_weekdays,amount_cents,created_by) select id,'2026-11-01','2026-11-01','2026-11-30','2026-11-01',800,30,30,'Grade 12',array[1,2,3,4,5,6,7]::smallint[],80000,$1 from public.applications",
      [actor],
    );
    await expect(database.exec(setup)).rejects.toThrow(
      "Accounting first install requires empty test financial tables",
    );
    await database.exec("rollback");
    expect(
      (
        await database.query<Record<string, unknown>>(
          "select to_regclass('public.accounting_settings') as value",
        )
      ).rows[0].value,
    ).toBeNull();
    expect(
      (
        await database.query<Record<string, unknown>>(
          "select count(*)::integer as count from public.tuition_invoices",
        )
      ).rows[0].count,
    ).toBe(1);
  }, 30000);
});
