import { db } from "./admin.js";
import { HttpError } from "./http.js";
import type {
  Invoice,
  Payment,
  Application,
} from "../../src/lib/admin-types.js";
import type { TuitionDocument } from "./tuition-document.js";

export async function loadTuitionDocument(
  kind: "invoice" | "receipt",
  id: string,
): Promise<TuitionDocument & { applicationId: string }> {
  const payments =
    kind === "receipt"
      ? await db<Payment[]>(`/rest/v1/tuition_payments?id=eq.${id}&select=*`)
      : [];
  const payment = payments[0];
  if (kind === "receipt" && !payment)
    throw new HttpError(404, "Receipt not found.");
  const invoices = await db<Invoice[]>(
    `/rest/v1/tuition_invoices?id=eq.${payment?.invoice_id || id}&select=*`,
  );
  const invoice = invoices[0];
  if (!invoice) throw new HttpError(404, "Invoice not found.");
  const apps = await db<Application[]>(
    `/rest/v1/applications?id=eq.${invoice.application_id}&select=learner_name,learner_email,guardian_email,selected_subjects`,
  );
  const learners = await db<{ student_number: string }[]>(
    `/rest/v1/learners?application_id=eq.${invoice.application_id}&select=student_number`,
  );
  if (!apps[0] || !learners[0])
    throw new HttpError(404, "Learner record not found.");
  let balance: number;
  let issuedAt = invoice.created_at;
  let reversed = false;
  let remainingAllocation: number | undefined;
  if (payment) {
    const events = await db<
      { payload: { balanceCents: number }; created_at: string }[]
    >(
      `/rest/v1/tuition_messages?event_key=eq.${encodeURIComponent(`receipt:${payment.id}`)}&select=payload,created_at`,
    );
    if (events[0] && Number.isFinite(events[0].payload.balanceCents)) {
      balance = events[0].payload.balanceCents;
      issuedAt = events[0].created_at;
    } else {
      const snapshots = await db<
        { balance_cents: number; created_at: string }[]
      >(
        `/rest/v1/accounting_allocation_snapshots?payment_id=eq.${id}&select=balance_cents,created_at`,
      );
      if (!snapshots[0])
        throw new HttpError(
          409,
          "The recorded receipt snapshot is unavailable.",
        );
      balance = snapshots[0].balance_cents;
      issuedAt = snapshots[0].created_at;
    }
    if (payment.receipt_id) {
      const receipts = await db<{ reversed_at: string | null }[]>(
        `/rest/v1/accounting_receipts?id=eq.${payment.receipt_id}&select=reversed_at`,
      );
      reversed = !!receipts[0]?.reversed_at;
      const releases = await db<{ amount_cents: number }[]>(
        `/rest/v1/accounting_allocation_releases?payment_id=eq.${payment.id}&select=amount_cents`,
      );
      remainingAllocation =
        payment.amount_cents -
        releases.reduce((sum, r) => sum + Number(r.amount_cents), 0);
    }
  } else {
    const allocated = await db<
      {
        amount_cents: number;
        accounting_allocation_releases?: { amount_cents: number }[];
      }[]
    >(
      `/rest/v1/tuition_payments?invoice_id=eq.${invoice.id}&select=amount_cents,accounting_allocation_releases(amount_cents)`,
    );
    if (allocated.length >= 1000)
      throw new HttpError(
        409,
        "The full payment history must be reconciled before this invoice can be generated.",
      );
    balance =
      invoice.amount_cents -
      Number(invoice.credited_cents || 0) -
      allocated.reduce(
        (n, p) =>
          n +
          p.amount_cents -
          (p.accounting_allocation_releases || []).reduce(
            (sum, r) => sum + Number(r.amount_cents),
            0,
          ),
        0,
      );
  }
  return {
    kind,
    applicationId: invoice.application_id,
    issuedAt,
    bankConfirmed: process.env.TUITION_BANK_DETAILS_CONFIRMED === "true",
    recipients: [apps[0].guardian_email, apps[0].learner_email],
    invoiceNumber: invoice.number,
    studentNumber: learners[0].student_number,
    learner: apps[0].learner_name,
    month: invoice.billing_month,
    dueDate: invoice.due_date,
    amountCents: invoice.amount_cents,
    creditedCents: Number(invoice.credited_cents || 0),
    reversed,
    remainingAllocationCents: remainingAllocation,
    balanceCents: balance,
    remainingDays: invoice.remaining_days,
    teachingDays: invoice.teaching_days,
    monthlyFee: Number(invoice.monthly_fee),
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end,
    ...(payment
      ? {
          paidCents: payment.amount_cents,
          paidOn: payment.paid_on,
          method: payment.method,
          paymentId: payment.id,
          transactionReference: payment.transaction_reference,
        }
      : {}),
  };
}
