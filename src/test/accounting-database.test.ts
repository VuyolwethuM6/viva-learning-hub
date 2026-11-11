// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { FinanceSnapshot } from "@/lib/accounting-types";
import type { AccountingDocument } from "../../api/_lib/accounting-document";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
let db: PGlite;
const actor = "11111111-1111-4111-8111-111111111111",
  app = "22222222-2222-4222-8222-222222222222";
const bootstrap = readFileSync("supabase/schema.sql", "utf8").replace(
  'create extension if not exists "pgcrypto";',
  "",
);
async function value<T = unknown>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  return (await db.query<{ value: T }>(sql, params)).rows[0].value;
}
async function clock(date: string) {
  await db.exec(
    `create or replace function public.tuition_today() returns date language sql stable as $$ select date '${date}' $$`,
  );
}
async function seed(id = app, name = "Alex", email = "parent@example.test") {
  await db.query(
    "insert into public.applications(id,application_number,learner_name,learner_email,guardian_name,guardian_email,grade_level,tutoring_mode,monthly_fee,status) values($1,$2,$3,'learner@example.test','Parent',$4,'Grade 12','Online',800,'pending_review')",
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
const admin = (action: string, data: object) =>
  value<{ invoiceId: string; count?: number; seasonalSkip?: boolean }>(
    "select public.admin_mutate($1,$2,$3) value",
    [actor, action, JSON.stringify(data)],
  );
const op = (
  action: string,
  data: object = {},
  requestId: string = randomUUID(),
) =>
  value<Record<string, unknown>>(
    "select public.accounting_mutate($1,$2,$3) value",
    [actor, action, JSON.stringify({ requestId, ...data })],
  );
const approve = async (id = app, startDate = "2026-11-01") =>
  (await admin("approve", { applicationId: id, startDate })).invoiceId;
const receive = (data: object = {}, requestId?: string) =>
  op(
    "receipt",
    {
      applicationId: app,
      amountCents: 80000,
      paidOn: "2026-10-27",
      method: "EFT",
      reference: randomUUID(),
      note: "Verified against synthetic bank statement",
      allocations: [],
      ...data,
    },
    requestId,
  );
const report = () =>
  value<FinanceSnapshot>(
    "select public.accounting_snapshot($1,'2026-01-01','2026-12-31') value",
    [actor],
  );
const clean = async () =>
  expect(
    Object.values(
      await value<Record<string, number>>(
        "select public.accounting_integrity() value",
      ),
    ),
  ).toEqual([0, 0, 0, 0, 0]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create schema storage;create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  await db.exec(bootstrap);
  await db.query("insert into auth.users values($1,'finance@example.test')", [
    actor,
  ]);
  await db.query("insert into public.admin_users(user_id) values($1)", [actor]);
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await clock("2026-10-27");
  await db.exec(
    "truncate public.accounting_requests,public.accounting_journals,public.applications,public.tuition_invoice_counters,public.accounting_counters,public.accounting_statement_batches,public.accounting_period_events,public.accounting_runs,public.tuition_closures,storage.objects cascade",
  );
  await db.exec(
    "update public.accounting_settings set books_start='2026-01-01',closed_through=null,recognised_through=null,automation_enabled=false,auto_send=false,scheduler_actor=null;update public.admin_users set finance_role='owner',enabled=true;",
  );
  await seed();
});
describe("accounting ledger and tuition integration", () => {
  it("reverses an incorrect credit note and lets released funds settle the restored charge", async () => {
    const invoice = await approve();
    const receipt = await receive({
      allocations: [{ invoiceId: invoice, amountCents: 80000 }],
    });
    const credit = await op("credit_note", {
      invoiceId: invoice,
      amountCents: 20000,
      reason: "Synthetic reduction entered for testing",
    });
    await op("reverse_credit_note", {
      creditNoteId: credit.creditNoteId,
      reason: "Credit note was entered in error",
    });
    expect(
      await value<number>(
        "select public.accounting_invoice_balance($1)::integer value",
        [invoice],
      ),
    ).toBe(20000);
    await op("allocate", {
      receiptId: receipt.receiptId,
      invoiceId: invoice,
      amountCents: 20000,
    });
    expect(
      await value<number>(
        "select public.accounting_invoice_balance($1)::integer value",
        [invoice],
      ),
    ).toBe(0);
    expect(
      (
        await value<AccountingDocument>(
          "select public.accounting_document_data($1,'credit_note',$2) value",
          [actor, credit.creditNoteId],
        )
      ).voided,
    ).toBe(true);
    await clean();
  });
  it("voids a bad unmatched bank import without deleting its history and allows a corrected reimport", async () => {
    const data = {
      name: "Bad statement",
      fromDate: "2026-10-01",
      toDate: "2026-10-27",
      openingCents: 0,
      closingCents: 500,
      fingerprint: "void-test",
      rows: [
        {
          externalId: "IMPORT-001",
          postedOn: "2026-10-27",
          description: "Synthetic test",
          amountCents: 500,
        },
      ],
    };
    const first = await op("bank_import", data);
    await op("bank_void_import", {
      batchId: first.batchId,
      reason: "Wrong statement file imported during testing",
    });
    await op("bank_import", data);
    const snapshot = await report();
    expect(snapshot.bank_batches).toHaveLength(2);
    expect(snapshot.bank_lines).toHaveLength(1);
    expect(snapshot.bank_batches.some((b) => !!b.voided_at)).toBe(true);
    await clean();
  });
  it("closes a month with a verified deposit clearing on the next statement and later matches it without reposting", async () => {
    await receive({ amountCents: 10000, method: "Cash" });
    const deposit = await op("cash_deposit", {
      amountCents: 10000,
      postedOn: "2026-10-27",
      reason: "Cash lodged, bank clearing next month",
    });
    await clock("2026-11-03");
    await op("bank_timing", {
      journalId: deposit.journalId,
      expectedOn: "2026-11-01",
      reason: "Deposit slip confirms next-month bank clearing",
    });
    await op("bank_import", {
      name: "October closing statement",
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
      openingCents: 0,
      closingCents: 0,
      fingerprint: "empty-october",
      rows: [],
    });
    await op("close_period", {
      throughDate: "2026-10-31",
      countedCashCents: 0,
      reviewed: true,
      reason: "Statement and outstanding deposit reviewed",
    });
    await op("bank_import", {
      name: "November clearing",
      fromDate: "2026-11-01",
      toDate: "2026-11-03",
      openingCents: 0,
      closingCents: 10000,
      fingerprint: "november-clearing",
      rows: [
        {
          externalId: "DEPOSIT-CLEAR",
          postedOn: "2026-11-01",
          description: "Cash deposit cleared",
          amountCents: 10000,
        },
      ],
    });
    const line = await value<string>(
      "select id value from public.accounting_statement_lines",
    );
    const count = await value<number>(
      "select count(*)::integer value from public.accounting_journals",
    );
    await op("bank_match", {
      lineId: line,
      journalId: deposit.journalId,
      reason: "Deposit matched on later bank statement",
    });
    expect(
      await value<number>(
        "select count(*)::integer value from public.accounting_journals",
      ),
    ).toBe(count);
    expect((await report()).bank_timing[0].cleared_on).toBe("2026-11-01");
    await clean();
  });
  it("permits a corrected replacement reference after reversal while retaining the original receipt", async () => {
    const receipt = await receive({ reference: "CORRECT-ME" });
    await op("reverse_receipt", {
      receiptId: receipt.receiptId,
      reason: "Incorrect amount on original receipt",
    });
    const replacement = await receive({
      reference: "CORRECT-ME",
      amountCents: 90000,
    });
    expect(replacement.receiptId).not.toBe(receipt.receiptId);
    expect(
      await value<string>(
        "select replaces_receipt_id value from public.accounting_receipts where id=$1",
        [replacement.receiptId],
      ),
    ).toBe(receipt.receiptId);
    await clean();
  });
  it("posts invoice receivables/deferred tuition and recognises the saved teaching programme exactly once", async () => {
    const id = await approve();
    let r = await report();
    expect(r.reports.incomeCents).toBe(0);
    expect(r.reports.assetsCents).toBe(80000);
    expect(r.reports.liabilitiesCents).toBe(80000);
    await op("recognise", { throughDate: "2026-10-27" });
    await clock("2026-11-15");
    await op("recognise", { throughDate: "2026-11-15" });
    r = await report();
    expect(r.reports.incomeCents).toBe(40000);
    await clock("2026-12-02");
    await op("recognise", { throughDate: "2026-12-02" });
    expect(
      await value<number>(
        "select recognised_cents::integer value from public.tuition_invoices where id=$1",
        [id],
      ),
    ).toBe(80000);
    const count = await value<number>(
      "select count(*)::integer value from public.accounting_journals",
    );
    await op("recognise", { throughDate: "2026-12-02" });
    expect(
      await value<number>(
        "select count(*)::integer value from public.accounting_journals",
      ),
    ).toBe(count);
    const income = await value<number>(
      "select -sum(l.amount_cents)::integer value from public.accounting_lines l join public.accounting_journals j on j.id=l.journal_id where l.account_code='4000' and extract(month from j.posted_on)=11",
    );
    expect(income).toBe(80000);
    await clean();
  });
  it("splits one payment across siblings while keeping unused credit separate from income", async () => {
    const sibling = randomUUID();
    await seed(sibling, "Sam");
    const a = await approve(),
      b = await approve(sibling);
    const r = await receive({
      amountCents: 100000,
      allocations: [
        { invoiceId: a, amountCents: 50000 },
        { invoiceId: b, amountCents: 30000 },
      ],
    });
    expect(
      await value<number>(
        "select public.accounting_receipt_available($1)::integer value",
        [r.receiptId],
      ),
    ).toBe(20000);
    expect(
      await value<number>(
        "select public.accounting_invoice_balance($1)::integer value",
        [a],
      ),
    ).toBe(30000);
    const snapshot = await report();
    expect(snapshot.receipts).toHaveLength(1);
    expect(snapshot.receipts[0].allocations).toHaveLength(2);
    expect(snapshot.reports.bankCents).toBe(100000);
    expect(snapshot.reports.incomeCents).toBe(0);
    await clean();
  });
  it("rejects cross-family allocations atomically and preserves the original invoice", async () => {
    const other = randomUUID();
    await seed(other, "Other", "other@example.test");
    const i = await approve(other);
    await expect(
      receive({ allocations: [{ invoiceId: i, amountCents: 1000 }] }),
    ).rejects.toThrow("same parent");
    expect(
      await value<number>(
        "select count(*)::integer value from public.accounting_receipts",
      ),
    ).toBe(0);
    expect(
      await value<number>(
        "select public.accounting_invoice_balance($1)::integer value",
        [i],
      ),
    ).toBe(80000);
    await clean();
  });
  it("prevents duplicate requests/references and refuses changed retries", async () => {
    const request = randomUUID(),
      payload = { reference: "UNIQUE-001" };
    const first = await receive(payload, request);
    const again = await receive(payload, request);
    expect(again.receiptId).toBe(first.receiptId);
    expect(again.alreadyRecorded).toBe(true);
    await expect(receive({ reference: "UNIQUE-002" }, request)).rejects.toThrow(
      "different details",
    );
    await expect(receive(payload)).rejects.toThrow("already been recorded");
    expect((await report()).receipts).toHaveLength(1);
    await clean();
  });
  it("treats cash deposits as transfers and prevents spending unavailable cash", async () => {
    await receive({ amountCents: 10000, method: "Cash" });
    await op("cash_deposit", {
      amountCents: 6000,
      postedOn: "2026-10-27",
      reason: "Cash counted and bank deposit verified",
    });
    const r = await report();
    expect(r.reports.cashCents).toBe(4000);
    expect(r.reports.bankCents).toBe(6000);
    expect(r.reports.cashInCents).toBe(10000);
    expect(r.reports.incomeCents).toBe(0);
    await expect(
      op("cash_deposit", {
        amountCents: 5000,
        postedOn: "2026-10-27",
        reason: "Invalid excess cash deposit",
      }),
    ).rejects.toThrow("negative");
    await clean();
  });
  it("releases overpayments after credit notes and supports reviewed refunds/reversals without deleting history", async () => {
    const invoice = await approve(),
      receipt = await receive({
        amountCents: 50000,
        allocations: [{ invoiceId: invoice, amountCents: 50000 }],
      });
    const allocation = await value<string>(
      "select id value from public.tuition_payments",
    );
    await op("credit_note", {
      invoiceId: invoice,
      amountCents: 60000,
      reason: "Agreed reduction of unused tutoring",
    });
    expect(
      await value<number>(
        "select public.accounting_allocation_net($1)::integer value",
        [allocation],
      ),
    ).toBe(20000);
    expect(
      await value<number>(
        "select public.accounting_receipt_available($1)::integer value",
        [receipt.receiptId],
      ),
    ).toBe(30000);
    const refund = await op("refund", {
      receiptId: receipt.receiptId,
      amountCents: 10000,
      paidOn: "2026-10-27",
      method: "EFT",
      reference: "REF-001",
      reason: "Verified refund of excess funds",
    });
    await expect(
      op("reverse_receipt", {
        receiptId: receipt.receiptId,
        reason: "Payment incorrectly recorded",
      }),
    ).rejects.toThrow("refunds");
    await op("reverse_refund", {
      refundId: refund.refundId,
      reason: "Refund record entered in error",
    });
    await op("reverse_receipt", {
      receiptId: receipt.receiptId,
      reason: "Original receipt was entered in error",
    });
    expect(
      await value<number>(
        "select public.accounting_invoice_balance($1)::integer value",
        [invoice],
      ),
    ).toBe(20000);
    expect(
      await value<number>(
        "select count(*)::integer value from public.tuition_payments",
      ),
    ).toBe(1);
    expect(
      await value<number>(
        "select count(*)::integer value from public.accounting_allocation_snapshots",
      ),
    ).toBe(1);
    const doc = await value<AccountingDocument>(
      "select public.accounting_document_data($1,'account_receipt',$2) value",
      [actor, receipt.receiptId],
    );
    expect(doc.voided).toBe(true);
    expect(doc.totalCents).toBe(50000);
    await clean();
  });
  it("accrues supplier expenses and partial settlements, with controlled corrections", async () => {
    const bill = await op("bill", {
      supplierName: "Test Tutor",
      category: "5000",
      description: "Tutoring services supplied",
      amountCents: 20000,
      issuedOn: "2026-10-27",
      dueOn: "2026-11-01",
    });
    let r = await report();
    expect(r.reports.expenseCents).toBe(20000);
    expect(r.reports.liabilitiesCents).toBe(20000);
    const pay = await op("pay_bill", {
      billId: bill.billId,
      amountCents: 5000,
      paidOn: "2026-10-27",
      method: "EFT",
      reference: "SUP-001",
      note: "Payment matched against bank statement",
    });
    await expect(
      op("reverse_bill", {
        billId: bill.billId,
        reason: "Supplier bill correction",
      }),
    ).rejects.toThrow("payments");
    await op("reverse_bill_payment", {
      paymentId: pay.billPaymentId,
      reason: "Supplier payment entered in error",
    });
    await op("reverse_bill", {
      billId: bill.billId,
      reason: "Duplicate supplier bill recorded",
    });
    r = await report();
    expect(r.reports.expenseCents).toBe(0);
    expect(r.reports.bankCents).toBe(0);
    expect(r.bills[0].reversed_at).toBeTruthy();
    await clean();
  });
  it("matches existing bank entries without reposting money and blocks reversal until unmatching", async () => {
    const receipt = await receive();
    const count = await value<number>(
      "select count(*)::integer value from public.accounting_journals",
    );
    await op("bank_import", {
      name: "October statement",
      fromDate: "2026-10-01",
      toDate: "2026-10-27",
      openingCents: 0,
      closingCents: 80000,
      fingerprint: "bank-test",
      rows: [
        {
          externalId: "BANK-001",
          postedOn: "2026-10-27",
          description: "Tuition payment",
          amountCents: 80000,
        },
      ],
    });
    const line = await value<string>(
      "select id value from public.accounting_statement_lines",
    );
    await op("bank_match", {
      lineId: line,
      journalId: receipt.journalId,
      reason: "Amount and bank transaction verified",
    });
    expect(
      await value<number>(
        "select count(*)::integer value from public.accounting_journals",
      ),
    ).toBe(count);
    await expect(
      op("reverse_receipt", {
        receiptId: receipt.receiptId,
        reason: "Wrong receipt recorded",
      }),
    ).rejects.toThrow("Unmatch");
    await op("bank_unmatch", {
      lineId: line,
      reason: "Reconciliation needs correction",
    });
    await op("reverse_receipt", {
      receiptId: receipt.receiptId,
      reason: "Incorrect receipt corrected",
    });
    expect(
      await value<number>(
        "select count(*)::integer value from public.accounting_reconciliation_events",
      ),
    ).toBe(2);
    await clean();
  });
  it("checks statement totals and prevents importing duplicate bank transaction IDs", async () => {
    const data = {
      name: "Statement",
      fromDate: "2026-10-01",
      toDate: "2026-10-27",
      openingCents: 0,
      closingCents: 500,
      fingerprint: "file-1",
      rows: [
        {
          externalId: "BANK-001",
          postedOn: "2026-10-27",
          description: "Test",
          amountCents: 500,
        },
      ],
    };
    await expect(
      op("bank_import", { ...data, closingCents: 999 }),
    ).rejects.toThrow("closing balance");
    await op("bank_import", data);
    await expect(
      op("bank_import", { ...data, fingerprint: "file-2" }),
    ).rejects.toThrow("already imported");
    expect(
      await value<number>(
        "select count(*)::integer value from public.accounting_statement_batches",
      ),
    ).toBe(1);
  });
  it("requires reconciliation/cash review to close a month and rejects backdating until an owner reopens it", async () => {
    await receive({ paidOn: "2026-10-27" });
    await clock("2026-11-03");
    await expect(
      op("close_period", {
        throughDate: "2026-10-31",
        countedCashCents: 0,
        reviewed: true,
        reason: "Month-end financial review complete",
      }),
    ).rejects.toThrow("bank");
    const receipt = (await report()).receipts[0];
    await op("bank_import", {
      name: "October statement",
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
      openingCents: 0,
      closingCents: 80000,
      fingerprint: "month-end",
      rows: [
        {
          externalId: "BANK-001",
          postedOn: "2026-10-27",
          description: "Tuition EFT",
          amountCents: 80000,
        },
      ],
    });
    const line = await value<string>(
      "select id value from public.accounting_statement_lines",
    );
    await op("bank_match", {
      lineId: line,
      journalId: receipt.journal_id,
      reason: "Statement and ledger agree",
    });
    await op("close_period", {
      throughDate: "2026-10-31",
      countedCashCents: 0,
      reviewed: true,
      reason: "Bank and cash count reviewed",
    });
    await expect(receive({ paidOn: "2026-10-30" })).rejects.toThrow("closed");
    await op("reopen_period", {
      fromDate: "2026-10-01",
      reason: "Approved historical correction",
    });
    await receive({ paidOn: "2026-10-30" });
    await clean();
  });
  it("retains paid invoices through withdrawal and stops routine billing after the agreed end date", async () => {
    await clock("2026-10-20");
    const i = await approve(app, "2026-10-20"),
      amount = await value<number>(
        "select amount_cents value from public.tuition_invoices where id=$1",
        [i],
      );
    await receive({
      amountCents: amount,
      paidOn: "2026-10-20",
      allocations: [{ invoiceId: i, amountCents: amount }],
    });
    await admin("activate", { applicationId: app });
    await op("withdraw", {
      applicationId: app,
      noticeDate: "2026-10-20",
      noticeConfirmed: true,
      reason: "Family gave agreed withdrawal notice",
    });
    await clock("2026-10-25");
    expect((await admin("generate_month", { month: "2026-11-01" })).count).toBe(
      0,
    );
    expect(
      await value<number>(
        "select count(*)::integer value from public.tuition_invoices",
      ),
    ).toBe(1);
    await clean();
  });
  it("uses payment arrangements for suspension and requires the return invoice to be paid before reactivation", async () => {
    await clock("2026-10-20");
    const first = await approve(app, "2026-10-20"),
      amount = await value<number>(
        "select amount_cents value from public.tuition_invoices where id=$1",
        [first],
      );
    await receive({
      amountCents: amount,
      paidOn: "2026-10-20",
      allocations: [{ invoiceId: first, amountCents: amount }],
    });
    await admin("activate", { applicationId: app });
    await clock("2026-10-25");
    await admin("generate_month", { month: "2026-11-01" });
    await clock("2026-11-10");
    await op("arrangement", {
      applicationId: app,
      untilDate: "2026-11-20",
      reason: "Family agreed a payment date",
    });
    await expect(
      op("suspend", {
        applicationId: app,
        cause: "unpaid",
        noticeConfirmed: true,
        reason: "Unpaid tuition after notice",
      }),
    ).rejects.toThrow("arrangements");
    await op("arrangement", {
      applicationId: app,
      untilDate: "",
      reason: "Previous arrangement ended by agreement",
    });
    await op("suspend", {
      applicationId: app,
      cause: "unpaid",
      noticeConfirmed: true,
      reason: "Unpaid tuition after family notice",
    });
    await op("arrangement", {
      applicationId: app,
      untilDate: "2026-11-30",
      reason: "Agreed settlement before returning",
    });
    const pending = await op("reactivate", {
      applicationId: app,
      startDate: "2026-11-15",
      reason: "Return arrangements confirmed",
    });
    expect(pending.pendingPayment).toBe(true);
    expect(
      await value<string>(
        "select enrollment_state value from public.applications where id=$1",
        [app],
      ),
    ).toBe("suspended");
    await receive({
      paidOn: "2026-11-10",
      allocations: [{ invoiceId: pending.invoiceId, amountCents: 80000 }],
    });
    await op("reactivate", {
      applicationId: app,
      startDate: "2026-11-15",
      reason: "Payment received and return confirmed",
    });
    expect(
      await value<string>(
        "select enrollment_state value from public.applications where id=$1",
        [app],
      ),
    ).toBe("active");
    await clean();
  });
  it("skips December/January invoices and prepares February on 25 January, including safe repeated scheduled runs", async () => {
    const i = await approve();
    await receive({ allocations: [{ invoiceId: i, amountCents: 80000 }] });
    await admin("activate", { applicationId: app });
    await expect(approve(app, "2026-12-01")).rejects.toThrow();
    await clock("2026-11-25");
    expect(
      (await admin("generate_month", { month: "2026-12-01" })).seasonalSkip,
    ).toBe(true);
    await clock("2026-12-25");
    expect(
      (await admin("generate_month", { month: "2027-01-01" })).seasonalSkip,
    ).toBe(true);
    await clock("2027-01-25");
    const run = await value<{ success: boolean; billing: { count: number } }>(
      "select public.accounting_run_schedule($1) value",
      [actor],
    );
    expect(run.success).toBe(true);
    expect(run.billing.count).toBe(1);
    expect(
      (
        await value<{ alreadyCompleted: boolean }>(
          "select public.accounting_run_schedule($1) value",
          [actor],
        )
      ).alreadyCompleted,
    ).toBe(true);
    expect(
      await value<number>(
        "select count(*)::integer value from public.tuition_invoices where billing_month='2027-02-01'",
      ),
    ).toBe(1);
    await clean();
  });
  it("enforces immutable balanced journals and owner/bookkeeper/viewer permissions", async () => {
    await receive();
    await expect(
      db.exec("update public.accounting_lines set amount_cents=99"),
    ).rejects.toThrow("immutable");
    await expect(
      db.exec("delete from public.accounting_receipts"),
    ).rejects.toThrow("cannot be deleted");
    await expect(
      db.query(
        "insert into public.accounting_journals(event_key,posted_on,description,source_kind,actor_id) values('unbalanced','2026-10-27','Bad journal','manual',$1)",
        [actor],
      ),
    ).rejects.toThrow("balanced");
    await db.exec("update public.admin_users set finance_role='viewer'");
    expect((await report()).role).toBe("viewer");
    await expect(receive()).rejects.toThrow("role");
    await db.exec("set role authenticated");
    try {
      await expect(
        db.query("select * from public.accounting_lines"),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query("select public.accounting_mutate($1,'journal','{}')", [actor]),
      ).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  });
  it("verifies private evidence metadata and preserves data when the installed schema is rerun", async () => {
    const bill = await op("bill", {
        supplierName: "Evidence Supplier",
        category: "5030",
        description: "Printed learning resources",
        amountCents: 5000,
        issuedOn: "2026-10-27",
        dueOn: "2026-10-27",
      }),
      id = randomUUID();
    const attachment = await value<{ storage_path: string }>(
      "select public.accounting_attachment($1,'prepare',$2) value",
      [
        actor,
        JSON.stringify({
          id,
          billId: bill.billId,
          name: "receipt.pdf",
          mime: "application/pdf",
          size: 100,
        }),
      ],
    );
    await expect(
      value("select public.accounting_attachment($1,'finalize',$2) value", [
        actor,
        JSON.stringify({ id }),
      ]),
    ).rejects.toThrow("verified");
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('accounting-documents',$1,$2)",
      [
        attachment.storage_path,
        JSON.stringify({ size: 100, mimetype: "application/pdf" }),
      ],
    );
    await value("select public.accounting_attachment($1,'finalize',$2) value", [
      actor,
      JSON.stringify({ id }),
    ]);
    const before = await value<number>(
      "select count(*)::integer value from public.accounting_journals",
    );
    await db.exec(bootstrap);
    expect(
      await value<number>(
        "select count(*)::integer value from public.accounting_journals",
      ),
    ).toBe(before);
    expect((await report()).bills[0].attachments[0].finalized_at).toBeTruthy();
    await clean();
  });
});
