// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ParentSnapshot } from "@/lib/parent-types";
import type { AccountingDocument } from "../../api/_lib/accounting-document";
let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111",
  parent = "33333333-3333-4333-8333-333333333333",
  other = "44444444-4444-4444-8444-444444444444",
  unconfirmed = "55555555-5555-4555-8555-555555555555";
const app = "22222222-2222-4222-8222-222222222222",
  sibling = "66666666-6666-4666-8666-666666666666",
  foreign = "77777777-7777-4777-8777-777777777777";
async function value<T = unknown>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  return (await db.query<{ value: T }>(sql, params)).rows[0].value;
}
const op = (action: string, data: object) =>
  value<Record<string, unknown>>(
    "select public.accounting_mutate($1,$2,$3) value",
    [owner, action, JSON.stringify({ requestId: randomUUID(), ...data })],
  );
async function seed(id: string, name: string, email: string) {
  await db.query(
    "insert into public.applications(id,application_number,learner_name,learner_email,guardian_name,guardian_email,grade_level,tutoring_mode,monthly_fee,selected_subjects,status) values($1,$2,$3,'learner@example.test','Test Parent',$4,'Grade 12','Online',800,array['Mathematics','Physical Sciences'],'pending_review')",
    [id, "VT-" + name, name, email],
  );
  await db.query(
    "insert into public.learners(application_id,student_number,full_name,email) values($1,$2,$3,'learner@example.test')",
    [id, "ST-" + name, name],
  );
  await db.query(
    "insert into public.learner_documents(application_id,document_type,file_name,storage_path,mime_type,size_bytes) values($1,'report_card','report.pdf',$2,'application/pdf',100)",
    [id, id + "/report.pdf"],
  );
}
const approve = async (id = app) =>
  (
    await value<{ invoiceId: string }>(
      "select public.admin_mutate($1,'approve',$2) value",
      [
        owner,
        JSON.stringify({
          applicationId: id,
          startDate: "2026-11-01",
          note: "Private staff review notes",
        }),
      ],
    )
  ).invoiceId;
const access = (id = app, enabled: boolean | null = true, actor = owner) =>
  value<{ enabled: boolean; registered: boolean }>(
    "select public.admin_parent_access($1,$2,$3,'Guardian identity and enrollment email verified') value",
    [actor, id, enabled],
  );
const bind = (id = parent) =>
  value("select public.parent_bind($1) value", [id]);
const snapshot = () =>
  value<ParentSnapshot>("select public.parent_snapshot($1) value", [parent]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create schema storage;create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  await db.exec(
    readFileSync("supabase/schema.sql", "utf8").replace(
      'create extension if not exists "pgcrypto";',
      "",
    ),
  );
  for (const [id, email, confirmed] of [
    [owner, "admin@example.test", true],
    [parent, "parent@example.test", true],
    [other, "other@example.test", true],
    [unconfirmed, "unconfirmed@example.test", false],
  ])
    await db.query("insert into auth.users values($1,$2,$3)", [
      id,
      email,
      confirmed ? "2026-10-01T00:00:00Z" : null,
    ]);
  await db.query("insert into public.admin_users(user_id) values($1)", [owner]);
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "truncate public.parent_accounts,public.parent_auth_limits,public.accounting_requests,public.accounting_journals,public.applications,public.tuition_invoice_counters,public.accounting_counters,public.tuition_closures cascade;update public.admin_users set finance_role='owner';create or replace function public.tuition_today() returns date language sql stable as $$select date '2026-10-27'$$;",
  );
  await db.query(
    "update auth.users set email='parent@example.test' where id=$1",
    [parent],
  );
  await seed(app, "Alex", " Parent@Example.Test ");
  await seed(sibling, "Beth", "parent@example.test");
  await seed(foreign, "Foreign Learner", "other@example.test");
});
describe("parent portal identity and family boundaries", () => {
  it("keeps the reviewed SQL Editor upgrade and fresh schema synchronized", () => {
    const canonical = readFileSync(
      "supabase/migrations/20261027150000_parent_portal.sql",
      "utf8",
    );
    expect(readFileSync("supabase/schema.sql", "utf8")).toContain(canonical);
    const upgrade = readFileSync("docs/parent-setup.sql", "utf8");
    expect(upgrade).toContain(canonical);
    expect(upgrade.trim()).toMatch(/begin;[\s\S]*commit;$/);
  });
  it("requires explicit staff enablement and review before allowing sign-in", async () => {
    expect(
      await value(
        "select public.parent_signin_allowed('parent@example.test') value",
      ),
    ).toBe(false);
    await expect(access()).rejects.toThrow("Approve");
    await approve();
    await access();
    expect(
      await value(
        "select public.parent_signin_allowed('PARENT@example.test') value",
      ),
    ).toBe(true);
    await expect(snapshot()).rejects.toThrow("Parent access");
    await bind();
    expect((await snapshot()).children.map((c) => c.name)).toEqual(["Alex"]);
  });
  it("returns reviewed siblings and exact family totals without other families or internal notes", async () => {
    const invoice = await approve();
    await approve(sibling);
    await approve(foreign);
    await access();
    await bind();
    const receipt = await op("receipt", {
      applicationId: app,
      amountCents: 100000,
      paidOn: "2026-10-27",
      method: "Cash",
      reference: "PARENT-CASH-1",
      note: "Private cash verification",
      allocations: [{ invoiceId: invoice, amountCents: 80000 }],
    });
    await op("credit_note", {
      invoiceId: invoice,
      amountCents: 20000,
      reason: "Agreed tuition reduction",
    });
    await op("refund", {
      receiptId: receipt.receiptId,
      amountCents: 10000,
      paidOn: "2026-10-27",
      method: "Cash",
      reference: "REFUND-PARENT-1",
      reason: "Refund agreed and paid",
      verified: true,
    });
    const data = await snapshot();
    expect(data.children.map((c) => c.name)).toEqual(["Alex", "Beth"]);
    expect(data.invoices).toHaveLength(2);
    expect(data.children[0].readyForActivation).toBe(true);
    expect(data.children[0].outstandingCents).toBe(0);
    expect(data.totals).toEqual({
      outstandingCents: 80000,
      overdueCents: 0,
      availableCreditCents: 30000,
    });
    expect(data.receipts[0].allocations[0].amountCents).toBe(60000);
    expect(JSON.stringify(data)).not.toMatch(
      /Foreign Learner|Private staff|Private cash|reviewed_by|storage_path|last_error/,
    );
    const statement = await value<AccountingDocument>(
      "select public.parent_document($1,'statement',$2) value",
      [parent, app],
    );
    expect(statement.totalCents).toBe(50000);
    expect(JSON.stringify(statement)).not.toContain("Private");
  });
  it("denies guessed document IDs and all admin-only document types", async () => {
    const own = await approve(),
      foreignInvoice = await approve(foreign);
    await access();
    await bind();
    expect(
      await value("select public.parent_document($1,'invoice',$2) value", [
        parent,
        own,
      ]),
    ).toEqual({ kind: "invoice", id: own });
    for (const [kind, id] of [
      ["invoice", foreignInvoice],
      ["statement", foreign],
      ["financial_report", app],
      ["report", app],
      ["account_receipt", randomUUID()],
    ])
      await expect(
        value("select public.parent_document($1,$2,$3) value", [
          parent,
          kind,
          id,
        ]),
      ).rejects.toThrow("unavailable");
  });
  it("allows owned receipt PDFs even after queue cancellation and preserves reversal status", async () => {
    const invoice = await approve();
    await access();
    await bind();
    const receipt = await op("receipt", {
      applicationId: app,
      amountCents: 80000,
      paidOn: "2026-10-27",
      method: "Cash",
      reference: "PARENT-CASH-2",
      note: "Verified synthetic receipt",
      allocations: [{ invoiceId: invoice, amountCents: 80000 }],
    });
    await value(
      "select public.admin_cancel_message($1,id,'Communication delivered separately',false) value from public.tuition_messages where event_key=$2",
      [owner, "account_receipt:" + receipt.receiptId],
    );
    expect(
      (
        await value<AccountingDocument>(
          "select public.parent_document($1,'account_receipt',$2) value",
          [parent, receipt.receiptId],
        )
      ).totalCents,
    ).toBe(80000);
    await op("reverse_receipt", {
      receiptId: receipt.receiptId,
      reason: "Correcting synthetic receipt",
    });
    expect(
      (
        await value<AccountingDocument>(
          "select public.parent_document($1,'account_receipt',$2) value",
          [parent, receipt.receiptId],
        )
      ).voided,
    ).toBe(true);
  });
  it("revokes existing sessions immediately and rejects changed or unconfirmed identities", async () => {
    await approve();
    await access();
    await bind();
    await access(app, false);
    await expect(snapshot()).rejects.toThrow("Parent access");
    await access();
    await db.query(
      "update auth.users set email='changed@example.test' where id=$1",
      [parent],
    );
    await expect(snapshot()).rejects.toThrow("Parent access");
    await expect(bind(unconfirmed)).rejects.toThrow("Verify");
    await expect(bind(other)).rejects.toThrow("Parent access");
  });
  it("removes a learner from the old family when the guardian email changes", async () => {
    await approve();
    await approve(sibling);
    await access();
    await bind();
    await db.query(
      "update public.applications set guardian_email='other@example.test' where id=$1",
      [app],
    );
    expect((await snapshot()).children.map((c) => c.name)).toEqual(["Beth"]);
    await expect(
      value("select public.parent_document($1,'statement',$2) value", [
        parent,
        app,
      ]),
    ).rejects.toThrow("unavailable");
  });
  it("keeps paused and withdrawn learner records visible for their remaining balances", async () => {
    const invoice = await approve();
    await op("receipt", {
      applicationId: app,
      amountCents: 80000,
      paidOn: "2026-10-27",
      method: "Cash",
      reference: "ACTIVE-PARENT",
      note: "Verified funds",
      allocations: [{ invoiceId: invoice, amountCents: 80000 }],
    });
    await value("select public.admin_mutate($1,'activate',$2) value", [
      owner,
      JSON.stringify({ applicationId: app }),
    ]);
    await access();
    await bind();
    await op("suspend", {
      applicationId: app,
      cause: "agreed_pause",
      noticeConfirmed: true,
      reason: "Agreed pause during test",
    });
    expect((await snapshot()).children[0].status).toBe("suspended");
  });
  it("enforces staff roles, private tables and service-only parent RPCs", async () => {
    await approve();
    await db.exec("update public.admin_users set finance_role='viewer'");
    expect((await access(app, null)).enabled).toBe(false);
    await expect(access()).rejects.toThrow("role");
    await db.exec("set role authenticated");
    try {
      await expect(
        db.query("select * from public.parent_accounts"),
      ).rejects.toThrow("permission denied");
      await expect(
        value("select public.parent_bind($1) value", [parent]),
      ).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  });
  it("limits repeated sign-in requests durably and safely reruns the upgrade", async () => {
    const hash = "a".repeat(64);
    expect(
      await value("select public.parent_rate_limit($1,'send_email') value", [
        hash,
      ]),
    ).toBe(true);
    expect(
      await value("select public.parent_rate_limit($1,'send_email') value", [
        hash,
      ]),
    ).toBe(false);
    await approve();
    await access();
    await bind();
    await db.exec(readFileSync("docs/parent-setup.sql", "utf8"));
    expect((await snapshot()).children[0].name).toBe("Alex");
    expect((await access(app, null)).registered).toBe(true);
  });
});
