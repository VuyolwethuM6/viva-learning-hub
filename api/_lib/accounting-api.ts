import { createHash } from "node:crypto";
import { db, rpc, uuid } from "./admin.js";
import { getEmailConfig } from "./email.js";
import { HttpError } from "./http.js";
import { dispatchTuitionMessage } from "./dispatch-tuition-message.js";
import {
  csvCell,
  parseStatementCSV,
  validAccountingDate,
} from "../../src/lib/accounting-input.js";
import type { FinanceSnapshot } from "../../src/lib/accounting-types.js";

export function detailedFinancialCSV(
  kind: string,
  rows: Record<string, string | number>[],
): string {
  const table: (string | number)[][] =
    kind === "ledger"
      ? [
          [
            "Date",
            "Description",
            "Journal ID",
            "Account",
            "Debit ZAR",
            "Credit ZAR",
          ],
          ...rows.map((r) => [
            r.posted_on,
            r.description,
            r.journal_id,
            `${r.account_code} ${r.name}`,
            Math.max(Number(r.amount_cents), 0) / 100,
            Math.max(-Number(r.amount_cents), 0) / 100,
          ]),
        ]
      : [
          [
            "Invoice",
            "Learner",
            "Guardian email",
            "Due",
            "Age",
            "Outstanding ZAR",
          ],
          ...rows.map((r) => [
            r.number,
            r.learner_name,
            r.guardian_email,
            r.due_date,
            r.bucket,
            Number(r.balance_cents) / 100,
          ]),
        ];
  return "\uFEFF" + table.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function validateAccountingInput(input: Record<string, unknown>) {
  uuid(input.requestId);
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === "") continue;
    if (
      [
        "id",
        "applicationId",
        "receiptId",
        "invoiceId",
        "billId",
        "paymentId",
        "refundId",
        "journalId",
        "lineId",
        "supplierId",
        "creditNoteId",
        "batchId",
        "userId",
      ].includes(key)
    )
      uuid(value);
    if (
      [
        "paidOn",
        "postedOn",
        "issuedOn",
        "dueOn",
        "throughDate",
        "fromDate",
        "toDate",
        "startDate",
        "endDate",
        "noticeDate",
        "untilDate",
        "booksStart",
        "expectedOn",
      ].includes(key) &&
      (typeof value !== "string" || !validAccountingDate(value))
    )
      throw new HttpError(400, `Supply a valid ${key} date.`);
    if (
      key.endsWith("Cents") &&
      (typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        Math.abs(value) > 2000000000)
    )
      throw new HttpError(
        400,
        "Supply money amounts as whole cents within the transaction limit.",
      );
  }
  for (const key of ["allocations", "lines"]) {
    if (input[key] === undefined) continue;
    if (!Array.isArray(input[key]) || input[key].length > 100)
      throw new HttpError(400, "Too many financial lines.");
    for (const line of input[key] as Record<string, unknown>[]) {
      if (!line || typeof line !== "object")
        throw new HttpError(400, "Supply valid financial lines.");
      const amount = key === "lines" ? line.cents : line.amountCents;
      if (
        typeof amount !== "number" ||
        !Number.isSafeInteger(amount) ||
        Math.abs(amount) > 2000000000
      )
        throw new HttpError(400, "Financial lines must use integer cents.");
      if (key === "allocations") uuid(line.invoiceId);
    }
  }
}
export function prepareBankImport(input: Record<string, unknown>) {
  if (typeof input.csv !== "string")
    throw new HttpError(400, "Attach a bank statement CSV.");
  try {
    const rows = parseStatementCSV(input.csv);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          input.fromDate,
          input.toDate,
          input.openingCents,
          input.closingCents,
          rows,
        ]),
      )
      .digest("hex");
    const { csv: _csv, ...data } = input;
    return { ...data, rows, fingerprint };
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error
        ? error.message
        : "The bank CSV could not be read.",
    );
  }
}
export function financialCSV(data: FinanceSnapshot, kind: string): string {
  let rows: (string | number)[][];
  if (kind === "trial_balance")
    rows = [
      ["Code", "Account", "Type", "Debit ZAR", "Credit ZAR"],
      ...data.accounts.map((a) => [
        a.code,
        a.name,
        a.kind,
        Math.max(a.balance_cents, 0) / 100,
        Math.max(-a.balance_cents, 0) / 100,
      ]),
    ];
  else if (kind === "profit_loss")
    rows = [
      ["Account", "Type", "Period amount ZAR"],
      ...data.accounts
        .filter((a) => ["income", "expense"].includes(a.kind))
        .map((a) => [
          a.name,
          a.kind,
          (a.kind === "income" ? -a.period_net_cents : a.period_net_cents) /
            100,
        ]),
      ["Net profit / loss", "", data.reports.profitCents / 100],
    ];
  else if (kind === "ageing")
    rows = [
      ["Invoice", "Learner", "Guardian email", "Due", "Age", "Outstanding ZAR"],
      ...data.ageing.map((a) => [
        a.number,
        a.learner_name,
        a.guardian_email,
        a.due_date,
        a.bucket,
        a.balance_cents / 100,
      ]),
    ];
  else if (kind === "ledger")
    rows = [
      ["Date", "Entry", "Journal ID", "Account", "Debit ZAR", "Credit ZAR"],
      ...data.journals.flatMap((j) =>
        j.lines.map((l) => [
          j.posted_on,
          j.description,
          j.id,
          `${l.account} ${l.name}`,
          Math.max(l.cents, 0) / 100,
          Math.max(-l.cents, 0) / 100,
        ]),
      ),
    ];
  else
    throw new HttpError(
      400,
      "Choose trial_balance, profit_loss, ageing or ledger export.",
    );
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export async function runScheduledAccounting(actor: string, send: boolean) {
  const result = await rpc<{ success?: boolean; error?: string }>(
    "accounting_run_schedule",
    { p_actor: actor },
  );
  if (result.success === false) return { ...result, sent: 0 };
  if (!send) return { ...result, sent: 0, dispatch: "disabled" };
  if (
    !getEmailConfig() ||
    process.env.TUITION_BANK_DETAILS_CONFIRMED !== "true"
  )
    return {
      ...result,
      sent: 0,
      dispatch:
        "Email configuration and confirmed banking details are required.",
    };
  const queued = await db<
    {
      id: string;
      kind: string;
      invoice_id: string | null;
      payload: { balanceCents?: number };
    }[]
  >(
    "/rest/v1/tuition_messages?state=eq.pending&attempts=eq.0&order=created_at.asc&limit=5&select=id,kind,invoice_id,payload",
  );
  let sent = 0,
    stale = 0,
    failed = 0;
  const deadline = Date.now() + 40000;
  for (const item of queued) {
    if (Date.now() > deadline) break;
    if (item.invoice_id && ["invoice", "reminder"].includes(item.kind)) {
      const balance = await rpc<number>(
        "accounting_invoice_balance_for_admin",
        { p_actor: actor, p_invoice: item.invoice_id },
      );
      if (balance > 0 && balance !== item.payload.balanceCents) {
        stale++;
        continue;
      }
    }
    try {
      await dispatchTuitionMessage(actor, item.id);
      sent++;
    } catch {
      failed++;
    }
  }
  return { ...result, sent, stale, failed };
}
