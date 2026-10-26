// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const actor = "11111111-1111-4111-8111-111111111111";
const app = "22222222-2222-4222-8222-222222222222";
const pay = "33333333-3333-4333-8333-333333333333";
let start: string;
let month: string;
let invoiceId: string;
async function action(name: string, data: object) {
  return db.query<{ result: { invoiceId: string } }>(
    "select public.admin_mutate($1,$2,$3::jsonb) result",
    [actor, name, JSON.stringify(data)],
  );
}
async function approve() {
  const result = await action("approve", {
    applicationId: app,
    startDate: start,
  });
  invoiceId = result.rows[0].result.invoiceId;
}
async function record(amountCents: number, overrides: object = {}) {
  return action("payment", {
    invoiceId,
    paymentId: pay,
    amountCents,
    paidOn: "2026-01-02",
    method: "EFT",
    reference: "BANK-UNIQUE-001",
    note: "Checked statement",
    ...overrides,
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create schema storage;create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  const sql = readFileSync("supabase/schema.sql", "utf8").replace(
    'create extension if not exists "pgcrypto";',
    "",
  );
  await db.exec(sql);
  await db.exec(sql); // Bootstrap remains rerunnable.
  await db.query(
    "insert into auth.users(id,email) values($1,'admin@example.test')",
    [actor],
  );
  await db.query("insert into public.admin_users values($1,true)", [actor]);
  const result = await db.query<{ day: string }>(`select '2026-11-01' as day`);
  month = result.rows[0].day;
  const date = new Date(`${month}T12:00:00Z`);
  date.setUTCDate(15);
  while ([0, 6].includes(date.getUTCDay()))
    date.setUTCDate(date.getUTCDate() + 1);
  start = date.toISOString().slice(0, 10);
}, 30_000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(
    "create or replace function public.tuition_today() returns date language sql stable as $$ select date '2026-10-26' $$;",
  );
  await db.exec(
    "truncate public.tuition_messages,public.tuition_payments,public.tuition_invoices,public.admin_audit,public.applications,public.tuition_closures,public.tuition_invoice_counters,storage.objects cascade",
  );
  await db.query(
    `insert into public.applications(id,application_number,learner_name,learner_email,guardian_name,guardian_email,grade_level,tutoring_mode,monthly_fee,status,report_card_name,report_card_size,report_card_path) values($1,'VT-TEST','Test Learner','learner@example.test','Parent','parent@example.test','Grade 10','Online',800,'pending_review','report.pdf',100,'VT-TEST/report.pdf')`,
    [app],
  );
  await db.query(
    `insert into public.learners(application_id,student_number,full_name,email) values($1,'VT-TEST-STUDENT','Test Learner','learner@example.test')`,
    [app],
  );
  await db.query(
    `insert into public.learner_documents(application_id,document_type,file_name,storage_path,mime_type,size_bytes) values($1,'report_card','report.pdf','VT-TEST/report.pdf','application/pdf',100)`,
    [app],
  );
});

describe("admin database financial invariants", () => {
  it("cancels queued email without deleting receipt snapshots, financial records or audit history", async () => {
    await approve();
    await record(10000);
    const before = (
      await db.query<{ id: string; payload: object }>(
        "select id,payload from public.tuition_messages where kind='receipt'",
      )
    ).rows[0];
    await db.query(
      "select public.admin_cancel_message($1,$2,'Duplicate communication is no longer needed',false)",
      [actor, before.id],
    );
    expect(
      (
        await db.query<{ state: string; payload: object }>(
          "select state,payload from public.tuition_messages where id=$1",
          [before.id],
        )
      ).rows[0],
    ).toMatchObject({ state: "cancelled", payload: before.payload });
    expect(
      (await db.query("select * from public.tuition_payments")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.tuition_invoices")).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from public.admin_audit where action='cancel_message'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ value: unknown }>(
          "select public.admin_claim_message($1,$2) value",
          [actor, before.id],
        )
      ).rows[0].value,
    ).toBeNull();
    await db.query(
      "select public.admin_cancel_message($1,$2,'Repeat request after a lost response',false)",
      [actor, before.id],
    );
    expect(
      (
        await db.query(
          "select * from public.admin_audit where action='cancel_message'",
        )
      ).rows,
    ).toHaveLength(1);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261026130000_notification_management.sql",
        "utf8",
      ),
    );
    const snap = (
      await db.query<{
        value: {
          messages: { id: string; state: string; payload: object }[];
          audit: { actor_email: string }[];
        };
      }>("select public.admin_snapshot($1) value", [actor])
    ).rows[0].value;
    expect(snap.messages.find((m) => m.id === before.id)).toMatchObject({
      state: "cancelled",
      payload: before.payload,
    });
    expect(snap.audit[0].actor_email).toBe("admin@example.test");
  });
  it("protects sending, attempted and completed notifications from unsafe cancellation", async () => {
    await approve();
    const id = (
      await db.query<{ id: string }>("select id from public.tuition_messages")
    ).rows[0].id;
    await expect(
      db.query(
        "select public.admin_cancel_message($1,$2,'Valid reason for cancellation',false)",
        ["99999999-9999-4999-8999-999999999999", id],
      ),
    ).rejects.toThrow("Admin");
    await expect(
      db.query("select public.admin_cancel_message($1,$2,'',false)", [
        actor,
        id,
      ]),
    ).rejects.toThrow("reason");
    const claim = (
      await db.query<{ value: { claim_token: string } }>(
        "select public.admin_claim_message($1,$2) value",
        [actor, id],
      )
    ).rows[0].value;
    await expect(
      db.query(
        "select public.admin_cancel_message($1,$2,'Cancellation during an active send',true)",
        [actor, id],
      ),
    ).rejects.toThrow("being sent");
    await db.query("select public.admin_finish_message($1,$2,$3,false)", [
      actor,
      id,
      claim.claim_token,
    ]);
    await expect(
      db.query(
        "select public.admin_cancel_message($1,$2,'Attempted email should be stopped',false)",
        [actor, id],
      ),
    ).rejects.toThrow("provider history");
    await db.query(
      "select public.admin_cancel_message($1,$2,'Checked provider history and stopped retries',true)",
      [actor, id],
    );
    await db.query("select public.admin_finish_message($1,$2,$3,true)", [
      actor,
      id,
      claim.claim_token,
    ]);
    expect(
      (
        await db.query<{ state: string }>(
          "select state from public.tuition_messages where id=$1",
          [id],
        )
      ).rows[0].state,
    ).toBe("cancelled");
    await db.exec("set role authenticated");
    try {
      await expect(
        db.query(
          "select public.admin_cancel_message($1,$2,'Cannot call this from browser roles',true)",
          [actor, id],
        ),
      ).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
    await db.query(
      "update public.tuition_messages set state='sent' where id=$1",
      [id],
    );
    await expect(
      db.query(
        "select public.admin_cancel_message($1,$2,'This was already accepted',true)",
        [actor, id],
      ),
    ).rejects.toThrow("completed");
  });
  it("loads waiting notifications before completed history and flags a truncated queue", async () => {
    await approve();
    const waiting = (
      await db.query<{ id: string }>("select id from public.tuition_messages")
    ).rows[0].id;
    await db.exec(
      "insert into public.tuition_messages(invoice_id,kind,event_key,payload,state) select i.id,'invoice','history:'||n,'{}'::jsonb,'sent' from public.tuition_invoices i cross join generate_series(1,201) n",
    );
    const snap = (
      await db.query<{
        value: { messages: { id: string }[]; messages_truncated: boolean };
      }>("select public.admin_snapshot($1) value", [actor])
    ).rows[0].value;
    expect(snap.messages).toHaveLength(200);
    expect(snap.messages[0].id).toBe(waiting);
    expect(snap.messages_truncated).toBe(true);
  });
  it("prorates using actual weekdays minus closures and queues one invoice", async () => {
    await db.query("insert into public.tuition_closures values($1,$2)", [
      start,
      "Closure",
    ]);
    await expect(approve()).rejects.toThrow("closure");
    await db.exec("delete from public.tuition_closures");
    await approve();
    const {
      rows: [i],
    } = await db.query<{
      amount_cents: number;
      teaching_days: number;
      remaining_days: number;
      due_date: string;
    }>("select * from public.tuition_invoices");
    const days = [];
    for (
      const day = new Date(`${month}T12:00:00Z`);
      day.toISOString().slice(0, 7) === month.slice(0, 7);
      day.setUTCDate(day.getUTCDate() + 1)
    )
      if (day.getUTCDay() !== 0) days.push(day.toISOString().slice(0, 10));
    expect(i.amount_cents).toBe(
      Math.round((80000 * days.filter((d) => d >= start).length) / days.length),
    );
    expect(i.teaching_days).toBe(days.length);
    expect(new Date(i.due_date).toISOString().slice(0, 10)).toBe(start);
    expect(
      (await db.query("select * from public.tuition_messages")).rows,
    ).toHaveLength(1);
    await expect(approve()).rejects.toThrow("pending review");
  });
  it("does not allow activation before full payment; repeated payment requests do not duplicate money", async () => {
    await approve();
    await expect(action("activate", { applicationId: app })).rejects.toThrow(
      "fully paid",
    );
    const {
      rows: [i],
    } = await db.query<{ amount_cents: number }>(
      "select amount_cents from public.tuition_invoices",
    );
    await record(100);
    await record(100);
    expect(
      (await db.query("select * from public.tuition_payments")).rows,
    ).toHaveLength(1);
    await expect(record(101)).rejects.toThrow("different details");
    await expect(action("activate", { applicationId: app })).rejects.toThrow(
      "fully paid",
    );
    await record(i.amount_cents - 100, {
      paymentId: "44444444-4444-4444-8444-444444444444",
      reference: "BANK-UNIQUE-002",
    });
    await action("activate", { applicationId: app });
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.applications",
        )
      ).rows[0].status,
    ).toBe("active");
    await expect(action("activate", { applicationId: app })).rejects.toThrow(
      "Approval",
    );
    expect(
      (
        await db.query(
          "select * from public.tuition_messages where kind='activation'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("rejects over-allocation and duplicate bank transactions", async () => {
    await approve();
    await expect(record(1000000)).rejects.toThrow("exceeds");
    await record(100);
    await expect(
      record(100, { paymentId: "44444444-4444-4444-8444-444444444444" }),
    ).rejects.toThrow("reference");
    await expect(record(100, { amountCents: null })).rejects.toThrow(
      "valid amount",
    );
  });
  it("checks the actor and denies browser roles direct financial access and RPC calls", async () => {
    await expect(
      db.query("select public.admin_snapshot($1)", [
        "99999999-9999-4999-8999-999999999999",
      ]),
    ).rejects.toThrow("Admin");
    await db.exec("set role authenticated");
    try {
      await expect(
        db.query("select * from public.tuition_payments"),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query("select public.admin_snapshot($1)", [actor]),
      ).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  });
  it("requires a document and review reason, preserves rejection history", async () => {
    await expect(
      action("reject", { applicationId: app, note: "" }),
    ).rejects.toThrow("reason");
    await db.exec("delete from public.learner_documents");
    await expect(approve()).rejects.toThrow("report card");
    await action("reject", {
      applicationId: app,
      note: "Cannot support subjects",
    });
    expect(
      (await db.query("select * from public.tuition_invoices")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.admin_audit")).rows,
    ).toHaveLength(1);
  });
  it("leases queued messages and acknowledges only the matching claim", async () => {
    await approve();
    const {
      rows: [m],
    } = await db.query<{ id: string }>(
      "select id from public.tuition_messages",
    );
    const {
      rows: [r],
    } = await db.query<{ result: { claim_token: string } }>(
      "select public.admin_claim_message($1,$2) result",
      [actor, m.id],
    );
    await expect(
      db.query("select public.admin_claim_message($1,$2)", [actor, m.id]),
    ).rejects.toThrow("already being sent");
    await db.query("select public.admin_finish_message($1,$2,$3,true)", [
      actor,
      m.id,
      pay,
    ]);
    expect(
      (
        await db.query<{ state: string }>(
          "select state from public.tuition_messages",
        )
      ).rows[0].state,
    ).toBe("sending");
    await db.query("select public.admin_finish_message($1,$2,$3,true)", [
      actor,
      m.id,
      r.result.claim_token,
    ]);
    expect(
      (
        await db.query<{ state: string }>(
          "select state from public.tuition_messages",
        )
      ).rows[0].state,
    ).toBe("sent");
  });
  it("generates next-month invoices only from the 25th and never twice for a learner/month", async () => {
    await approve();
    const {
      rows: [i],
    } = await db.query<{ amount_cents: number }>(
      "select amount_cents from public.tuition_invoices",
    );
    await record(i.amount_cents);
    await action("activate", { applicationId: app });
    await db.exec(
      "create or replace function public.tuition_today() returns date language sql stable as $$ select date '2026-11-24' $$;",
    );
    await expect(
      action("generate_month", { month: "2026-12-01" }),
    ).rejects.toThrow("25th");
    await db.exec(
      "create or replace function public.tuition_today() returns date language sql stable as $$ select date '2026-11-25' $$;",
    );
    await action("generate_month", { month: "2026-12-01" });
    await action("generate_month", { month: "2026-12-01" });
    const { rows } = await db.query<{ due: string; amount_cents: number }>(
      "select due_date::text as due,amount_cents from public.tuition_invoices where billing_month='2026-12-01'",
    );
    expect(rows).toEqual([{ due: "2026-12-01", amount_cents: 80000 }]);
  });
  it("queues one monthly reminder from the 3rd and skips a settled invoice at send time", async () => {
    await approve();
    await db.exec(
      "create or replace function public.tuition_today() returns date language sql stable as $$ select date '2026-12-02' $$;",
    );
    await expect(action("queue_reminders", {})).rejects.toThrow("3rd");
    await db.exec(
      "create or replace function public.tuition_today() returns date language sql stable as $$ select date '2026-12-03' $$;",
    );
    await action("queue_reminders", {});
    await action("queue_reminders", {});
    const { rows } = await db.query<{ id: string }>(
      "select id from public.tuition_messages where kind='reminder'",
    );
    expect(rows).toHaveLength(1);
    const {
      rows: [i],
    } = await db.query<{ amount_cents: number }>(
      "select amount_cents from public.tuition_invoices",
    );
    await record(i.amount_cents);
    const result = await db.query<{ value: unknown }>(
      "select public.admin_claim_message($1,$2) value",
      [actor, rows[0].id],
    );
    expect(result.rows[0].value).toBeNull();
    expect(
      (
        await db.query<{ last_error: string }>(
          "select last_error from public.tuition_messages where kind='reminder'",
        )
      ).rows[0].last_error,
    ).toContain("settled");
  });

  it("uses Grade 12 Sundays and all Matric Rewrite weekdays, and preserves the invoice calendar", async () => {
    await db.exec("update public.applications set grade_level='Grade 12'");
    const sunday = "2026-11-15";
    await action("approve", { applicationId: app, startDate: sunday });
    let result = await db.query<{
      programme_weekdays: number[];
      teaching_days: number;
      remaining_days: number;
      amount_cents: number;
    }>("select * from public.tuition_invoices");
    expect(result.rows[0]).toMatchObject({
      programme_weekdays: [1, 2, 3, 4, 5, 6, 7],
      teaching_days: 30,
      remaining_days: 16,
      amount_cents: 42667,
    });
    await db.exec(
      "update public.tuition_programmes set weekdays=array[1,2,3,4,5]::smallint[] where grade='Grade 12'",
    );
    result = await db.query("select * from public.tuition_invoices");
    expect(result.rows[0].programme_weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await db.exec(
      "update public.tuition_programmes set weekdays=array[1,2,3,4,5,6,7]::smallint[] where grade='Grade 12'",
    );
  });
  it("keeps billing programme seeds aligned with the enrollment programme", async () => {
    const config = JSON.parse(
      readFileSync("src/lib/tuition-programme.json", "utf8"),
    ) as Record<string, { label: string; weekdays: number[] }>;
    const { rows } = await db.query<{
      grade: string;
      label: string;
      weekdays: number[];
    }>("select * from public.tuition_programmes");
    for (const row of rows)
      expect({ label: row.label, weekdays: row.weekdays }).toEqual({
        label: config[row.grade].label,
        weekdays: config[row.grade].weekdays,
      });
    await db.exec(
      "update public.applications set grade_level='Matric Rewrite',selected_subjects=array['Mathematics']",
    );
    await approve();
    expect(
      (
        await db.query<{ programme_weekdays: number[] }>(
          "select * from public.tuition_invoices",
        )
      ).rows[0].programme_weekdays,
    ).toEqual([1, 2, 3, 4, 5]);
  });
  it("recovers verified metadata for a legacy pending-review application and is repeatable", async () => {
    await db.exec("delete from public.learner_documents");
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('learner-documents','VT-TEST/report.pdf',$1)",
      [JSON.stringify({ size: 100, mimetype: "application/pdf" })],
    );
    await expect(approve()).rejects.toThrow("report card");
    const result = await db.query<{ value: { document_id: string } }>(
      "select public.finalize_enrollment_document($1,'application/pdf') value",
      [app],
    );
    expect(result.rows[0].value.document_id).toBeTruthy();
    await db.query(
      "select public.finalize_enrollment_document($1,'application/pdf')",
      [app],
    );
    expect(
      (await db.query("select * from public.learner_documents")).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.applications",
        )
      ).rows[0].status,
    ).toBe("pending_review");
    await approve();
  });
  it("does not manufacture document records for missing or mismatched stored files", async () => {
    await db.exec("delete from public.learner_documents");
    await expect(
      db.query(
        "select public.finalize_enrollment_document($1,'application/pdf')",
        [app],
      ),
    ).rejects.toThrow("not found");
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('learner-documents','VT-TEST/report.pdf',$1)",
      [JSON.stringify({ size: 101, mimetype: "application/pdf" })],
    );
    await expect(
      db.query(
        "select public.finalize_enrollment_document($1,'application/pdf')",
        [app],
      ),
    ).rejects.toThrow("size");
    await db.exec("update storage.objects set metadata='{}'::jsonb");
    await expect(
      db.query(
        "select public.finalize_enrollment_document($1,'application/pdf')",
        [app],
      ),
    ).rejects.toThrow("verified");
    expect(
      (await db.query("select * from public.learner_documents")).rows,
    ).toHaveLength(0);
  });

  it("numbers invoices by tuition month and grows beyond 99 without truncation", async () => {
    await approve();
    expect(
      (
        await db.query<{ number: string }>(
          "select number from public.tuition_invoices",
        )
      ).rows[0].number,
    ).toBe("VT-20261101");
    await db.exec(
      "update public.tuition_invoice_counters set last_number=99 where billing_month='2026-11-01'",
    );
    await db.exec(
      "update public.tuition_invoices set number='VT-T-LEGACY-000001'",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261026120000_monthly_invoice_numbers.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query<{ number: string }>(
          "select number from public.tuition_invoices",
        )
      ).rows[0].number,
    ).toBe("VT-T-LEGACY-000001");
    expect(
      Number(
        (
          await db.query<{ last_number: number }>(
            "select last_number from public.tuition_invoice_counters",
          )
        ).rows[0].last_number,
      ),
    ).toBe(99);
    await db.exec(
      "delete from public.tuition_messages;delete from public.tuition_invoices",
    );
    await db.exec("update public.applications set status='pending_review'");
    await approve();
    expect(
      (
        await db.query<{ number: string }>(
          "select number from public.tuition_invoices",
        )
      ).rows[0].number,
    ).toBe("VT-202611100");
    await db.exec("update public.applications set status='active'");
    await db.exec(
      "create or replace function public.tuition_today() returns date language sql stable as $$ select date '2026-11-25' $$;",
    );
    await action("generate_month", { month: "2026-12-01" });
    expect(
      (
        await db.query<{ number: string }>(
          "select number from public.tuition_invoices where billing_month='2026-12-01'",
        )
      ).rows[0].number,
    ).toBe("VT-20261201");
  });
});
