// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111",
  viewer = "33333333-3333-4333-8333-333333333333",
  app = "22222222-2222-4222-8222-222222222222";
type DeliveryClaim = { id: string; claim_id: string };
async function v<T = unknown>(sql: string, args: unknown[] = []): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
const clock = (d: string) =>
  db.exec(
    `create or replace function public.tuition_today() returns date language sql stable as $$select date '${d}'$$`,
  );
async function active(id = app) {
  await db.query(
    "insert into public.applications(id,application_number,learner_name,learner_email,guardian_name,guardian_email,grade_level,tutoring_mode,selected_subjects,monthly_fee,status,enrollment_state,tuition_start_date) values($1,$2,'Test Learner','learner@example.test','Guardian','guardian@example.test','Grade 12','Online',array['Mathematics'],500,'active','active','2026-10-01')",
    [id, "AUDIT-" + id],
  );
  await db.query(
    "insert into public.learners(application_id,student_number,full_name,email) values($1,$2,'Test Learner','learner@example.test')",
    [id, "ST-" + id],
  );
}
const createOrder = (id: string = randomUUID()) =>
  v<{ id: string }>(
    "select public.payfast_order_create($1,'Analytical Geometry Practice','Test','Buyer','buyer@example.test','0712345678') v",
    [id],
  );
const payment = (
  orderId: string | null,
  paymentId = "PAY-1",
  extra: object = {},
) =>
  v<{ orderId: string; paymentId: string }>(
    "select public.payfast_record_payment($1) v",
    [
      JSON.stringify({
        orderId,
        paymentId,
        product: "Analytical Geometry Practice",
        grossCents: 29900,
        feeCents: 900,
        email: "buyer@example.test",
        firstName: "Test",
        lastName: "Buyer",
        phone: "0712345678",
        adminEmail: "admin@example.test",
        ...extra,
      }),
    ],
  );
const admin = (op: string, data: object = {}, actor = owner) =>
  v("select public.payfast_admin($1,$2,$3) v", [
    actor,
    op,
    JSON.stringify({
      requestId: randomUUID(),
      reason: "Verified against synthetic provider records",
      ...data,
    }),
  ]);
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
  await db.query(
    "insert into auth.users values($1,'owner@example.test',now()),($2,'viewer@example.test',now())",
    [owner, viewer],
  );
  await db.query(
    "insert into public.admin_users(user_id,finance_role) values($1,'owner'),($2,'viewer')",
    [owner, viewer],
  );
}, 30000);
beforeEach(async () => {
  await clock("2026-11-03");
  await db.exec(
    "truncate public.applications,public.accounting_journals,public.accounting_requests,public.accounting_runs,public.payfast_orders,public.tuition_closures,public.tuition_invoice_counters cascade;update public.accounting_settings set books_start='2026-01-01',closed_through=null;update public.payfast_settings set actor_id=null;",
  );
});
afterAll(async () => {
  await db?.close();
});
it("recovers the current month after a completely missed generation window, without duplicate invoices/outbox", async () => {
  await active();
  await v(
    "select public.admin_create_invoice($1,$2,'2026-10-01','2026-10-01') v",
    [owner, app],
  );
  const r = await v<{ success: boolean; currentMonthRecovered: number }>(
    "select public.accounting_run_schedule($1) v",
    [owner],
  );
  expect(r.success).toBe(true);
  expect(r.currentMonthRecovered).toBe(1);
  await v<{ success: boolean; currentMonthRecovered: number }>(
    "select public.accounting_run_schedule($1) v",
    [owner],
  );
  expect(
    await v(
      "select count(*)::int v from public.tuition_invoices where billing_month='2026-11-01'",
    ),
  ).toBe(1);
  expect(
    await v(
      "select count(*)::int v from public.tuition_messages where kind='invoice'",
    ),
  ).toBe(2);
});
it("rechecks billing coverage after a completed same-day run and honors closures/programmes", async () => {
  await v<{ success: boolean; currentMonthRecovered: number }>(
    "select public.accounting_run_schedule($1) v",
    [owner],
  );
  await active();
  await db.exec(
    "insert into public.tuition_closures values('2026-11-10','Test closure')",
  );
  const r = await v<{ success: boolean; currentMonthRecovered: number }>(
    "select public.accounting_run_schedule($1) v",
    [owner],
  );
  expect(r.currentMonthRecovered).toBe(1);
  const i = await v<{
    programme_weekdays: number[];
    earning_dates: string[];
    amount_cents: number;
  }>("select to_jsonb(i) v from public.tuition_invoices i");
  expect(i.programme_weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(i.earning_dates).not.toContain("2026-11-10");
  expect(i.amount_cents).toBe(50000);
});
it("does not bill catch-up service days before initial activation later in the month", async () => {
  await clock("2026-11-20");
  await active();
  await db.query(
    "update public.applications set activated_at='2026-11-20T08:00:00+02' where id=$1",
    [app],
  );
  const c = await v<{ starts_on: string; amount_cents: number }[]>(
    "select public.accounting_billing_candidates($1,'2026-11-01') v",
    [owner],
  );
  expect(c[0].starts_on).toBe("2026-11-20");
  expect(c[0].amount_cents).toBe(18333);
  await v("select public.accounting_run_schedule($1) v", [owner]);
  expect(
    await v(
      "select amount_cents v from public.tuition_invoices where billing_month='2026-11-01'",
    ),
  ).toBe(18333);
});
it("never creates routine December/January invoices", async () => {
  await active();
  for (const day of ["2026-12-03", "2027-01-03"]) {
    await clock(day);
    expect(
      (
        await v<{ success: boolean; currentMonthRecovered: number }>(
          "select public.accounting_run_schedule($1) v",
          [owner],
        )
      ).success,
    ).toBe(true);
  }
  expect(await v("select count(*)::int v from public.tuition_invoices")).toBe(
    0,
  );
});
it("requires owner review of older recovery with a matching preview and stable retry", async () => {
  await active();
  const c = await v(
    "select public.accounting_billing_candidates($1,'2026-10-01') v",
    [owner],
  );
  const fingerprint = await v(
    "select md5(public.accounting_billing_candidates($1,'2026-10-01')::text) v",
    [owner],
  );
  const data = {
    requestId: randomUUID(),
    fingerprint,
    applications: [app],
    reviewed: true,
    reason: "Reviewed prior service and agreed charges",
  };
  const call = () =>
    v<{ count: number }>(
      "select public.accounting_recover_billing($1,'2026-10-01',$2) v",
      [owner, JSON.stringify(data)],
    );
  expect(c).toHaveLength(1);
  expect((await call()).count).toBe(1);
  expect((await call()).count).toBe(1);
  await expect(
    v<{ count: number }>(
      "select public.accounting_recover_billing($1,'2026-10-01',$2) v",
      [owner, JSON.stringify({ ...data, requestId: randomUUID() })],
    ),
  ).rejects.toThrow("changed");
  await expect(
    v("select public.accounting_billing_candidates($1,'2026-10-01') v", [
      viewer,
    ]),
  ).rejects.toThrow();
});
it("retains one checkout identity and rejects changed details or another purchase after payment", async () => {
  const o = await createOrder();
  expect((await createOrder(o.id)).id).toBe(o.id);
  await expect(
    v(
      "select public.payfast_order_create($1,'Analytical Geometry Practice','Other','Buyer','buyer@example.test','0712345678') v",
      [o.id],
    ),
  ).rejects.toThrow("different details");
  await payment(o.id);
  await expect(createOrder(o.id)).rejects.toThrow("already paid");
});
it("records a verified payment exactly once and retains unposted money when no owner is configured", async () => {
  const o = await createOrder();
  const r = await payment(o.id);
  expect((await payment(o.id)).paymentId).toBe(r.paymentId);
  expect(await v("select count(*)::int v from public.payfast_payments")).toBe(
    1,
  );
  expect(
    await v("select journal_id v from public.payfast_payments"),
  ).toBeNull();
  expect(await v("select count(*)::int v from public.payfast_deliveries")).toBe(
    2,
  );
  await expect(payment(o.id, "PAY-1", { feeCents: 1000 })).rejects.toThrow(
    "conflicting",
  );
});
it("posts gross sales, provider fees and net clearing once without inventing a bank deposit", async () => {
  await admin("authorize");
  const o = await createOrder();
  await payment(o.id);
  await payment(o.id);
  expect(
    await v(
      "select public.accounting_balance('1020',public.tuition_today())::int v",
    ),
  ).toBe(29000);
  expect(
    await v(
      "select public.accounting_balance('4110',public.tuition_today())::int v",
    ),
  ).toBe(-29900);
  expect(
    await v(
      "select public.accounting_balance('5060',public.tuition_today())::int v",
    ),
  ).toBe(900);
  expect(
    await v(
      "select public.accounting_balance('1000',public.tuition_today())::int v",
    ),
  ).toBe(0);
  expect(
    Object.values(
      await v<Record<string, number>>("select public.accounting_integrity() v"),
    ),
  ).toEqual([0, 0, 0, 0, 0]);
});
it("separately records provider settlement to bank and rejects duplicates/overdraw", async () => {
  await admin("authorize");
  await payment((await createOrder()).id);
  await admin("settlement", {
    amountCents: 29000,
    postedOn: "2026-11-03",
    reference: "SETTLEMENT-1",
  });
  expect(
    await v(
      "select public.accounting_balance('1000',public.tuition_today())::int v",
    ),
  ).toBe(29000);
  expect(
    await v(
      "select public.accounting_balance('1020',public.tuition_today())::int v",
    ),
  ).toBe(0);
  await expect(
    admin("settlement", {
      amountCents: 1,
      postedOn: "2026-11-03",
      reference: "SETTLEMENT-2",
    }),
  ).rejects.toThrow();
});
it("serializes customer/admin delivery claims and ignores stale finish tokens", async () => {
  const o = await createOrder();
  await payment(o.id);
  const claim = () =>
    v<DeliveryClaim>("select public.payfast_claim_delivery($1,'customer') v", [
      o.id,
    ]);
  const [a, b] = await Promise.all([claim(), claim()]);
  expect([a, b].filter(Boolean)).toHaveLength(1);
  const d = a || b;
  await v(
    "select public.payfast_finish_delivery($1,$2,'accepted','resend-1') v",
    [d.id, randomUUID()],
  );
  expect(
    await v("select state v from public.payfast_deliveries where id=$1", [
      d.id,
    ]),
  ).toBe("sending");
  await v(
    "select public.payfast_finish_delivery($1,$2,'accepted','resend-1') v",
    [d.id, d.claim_id],
  );
  expect(await claim()).toBeNull();
});
it("requires explicit provider review for ambiguous, failed and abandoned delivery attempts", async () => {
  const o = await createOrder();
  await payment(o.id);
  const d = await v<DeliveryClaim>(
    "select public.payfast_claim_delivery($1,'customer') v",
    [o.id],
  );
  await v("select public.payfast_finish_delivery($1,$2,'uncertain') v", [
    d.id,
    d.claim_id,
  ]);
  expect(
    await v<DeliveryClaim>(
      "select public.payfast_claim_delivery($1,'customer') v",
      [o.id],
    ),
  ).toBeNull();
  await expect(
    admin("delivery_review", { id: d.id, outcome: "not_sent" }),
  ).rejects.toThrow();
  await admin("delivery_review", {
    id: d.id,
    outcome: "not_sent",
    reviewed: true,
  });
  expect(
    (
      await v<DeliveryClaim>(
        "select public.payfast_claim_delivery($1,'customer') v",
        [o.id],
      )
    ).id,
  ).toBe(d.id);
});
it("quarantines legacy callback fulfillment and repeated payments for the same order", async () => {
  await admin("authorize");
  const legacy = await payment(null);
  expect(
    await v(
      "select state v from public.payfast_deliveries where order_id=$1 limit 1",
      [legacy.orderId],
    ),
  ).toBe("uncertain");
  expect(
    await v("select journal_id v from public.payfast_payments where id=$1", [
      legacy.paymentId,
    ]),
  ).toBeNull();
  const o = await createOrder();
  await payment(o.id, "NEW-1");
  const second = await payment(o.id, "NEW-2");
  expect(
    await v("select review_reason v from public.payfast_payments where id=$1", [
      second.paymentId,
    ]),
  ).toBe("repeat_order_payment");
  await admin("post", { id: second.paymentId, reviewed: true, feeCents: 900 });
  expect(
    await v(
      "select public.accounting_balance('2300',public.tuition_today())::int v",
    ),
  ).toBe(-29900);
  expect(
    await v(
      "select count(*)::int v from public.payfast_deliveries where order_id=$1",
      [o.id],
    ),
  ).toBe(2);
});
it("allows owner fee review when the provider omitted fee metadata and preserves closed books", async () => {
  await admin("authorize");
  const r = await payment((await createOrder()).id, "NO-FEE", {
    feeCents: null,
  });
  await admin("post", { id: r.paymentId, reviewed: true, feeCents: 900 });
  expect(
    await v(
      "select journal_id is not null v from public.payfast_payments where id=$1",
      [r.paymentId],
    ),
  ).toBe(true);
  await expect(admin("authorize", {}, viewer)).rejects.toThrow();
  await db.exec(
    "update public.accounting_settings set closed_through='2026-11-03'",
  );
  const pending = await payment((await createOrder()).id, "CLOSED");
  expect(
    await v("select journal_id v from public.payfast_payments where id=$1", [
      pending.paymentId,
    ]),
  ).toBeNull();
});
it("records settlement corrections without erasing the verified payment or original payout", async () => {
  await admin("authorize");
  await payment((await createOrder()).id);
  const requestId = randomUUID();
  await admin("settlement", {
    requestId,
    amountCents: 29000,
    postedOn: "2026-11-03",
    reference: "CORRECT-1",
  });
  await admin("settlement_reverse", { id: requestId });
  expect(
    await v(
      "select public.accounting_balance('1020',public.tuition_today())::int v",
    ),
  ).toBe(29000);
  expect(
    await v(
      "select public.accounting_balance('1000',public.tuition_today())::int v",
    ),
  ).toBe(0);
  await expect(
    db.exec("update public.payfast_payments set gross_cents=1"),
  ).rejects.toThrow("immutable");
  await expect(db.exec("delete from public.payfast_orders")).rejects.toThrow(
    "history",
  );
});
it("keeps browser roles out of integration tables/RPCs and preserves records on migration rerun", async () => {
  const o = await createOrder();
  await payment(o.id);
  await db.exec(readFileSync("docs/high-priority-setup.sql", "utf8"));
  expect(await v("select count(*)::int v from public.payfast_payments")).toBe(
    1,
  );
  for (const role of ["anon", "authenticated"]) {
    expect(
      await v(
        "select has_function_privilege($1,'public.payfast_record_payment(jsonb)','EXECUTE') v",
        [role],
      ),
    ).toBe(false);
    expect(
      await v(
        "select has_table_privilege($1,'public.payfast_orders','SELECT,INSERT,UPDATE,DELETE') v",
        [role],
      ),
    ).toBe(false);
  }
});
