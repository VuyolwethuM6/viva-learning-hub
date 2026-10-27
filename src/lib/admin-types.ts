export type Application = {
  learner?: { dob?: string; gender?: string; school?: string; phone?: string };
  guardian?: { phone?: string; relationship?: string };
  subject_marks?: {
    subject_name: string;
    current_mark: number;
    target_mark: number;
    difficulties: string[];
  }[];
  terms_accepted?: boolean;
  photo_consent?: boolean;
  id: string;
  application_number: string;
  student_number: string;
  learner_name: string;
  learner_email: string;
  guardian_name: string;
  guardian_email: string;
  grade_level: string;
  tutoring_mode: string;
  selected_subjects: string[];
  selected_goals: string[];
  monthly_fee: number;
  status: string;
  created_at: string;
  tuition_start_date: string | null;
  enrollment_state?: string;
  activated_at?: string | null;
  billing_end_date?: string | null;
  withdrawn_on?: string | null;
  lifecycle_reason?: string | null;
  arrangement_until?: string | null;
  arrangement_note?: string | null;
  activation_invoice_id?: string | null;
};
export type Invoice = {
  id: string;
  application_id: string;
  number: string;
  billing_month: string;
  period_start: string;
  period_end: string;
  due_date: string;
  monthly_fee: number;
  teaching_days: number;
  remaining_days: number;
  programme_label?: string;
  programme_weekdays?: number[];
  amount_cents: number;
  paid_cents: number;
  credited_cents?: number;
  recognised_cents?: number;
  created_at: string;
};
export type Payment = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  paid_on: string;
  method: string;
  transaction_reference: string;
  note: string;
  verified_by: string;
  receipt_id?: string;
  net_cents?: number;
  receipt_reversed_at?: string | null;
};
export type Audit = {
  id: string;
  action: string;
  actor_id: string;
  actor_email?: string | null;
  application_id: string | null;
  created_at: string;
  details: Record<string, unknown>;
};
export type Message = {
  id: string;
  invoice_id: string | null;
  kind: string;
  state: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at?: string | null;
  first_attempt_at?: string | null;
  claimed_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  payload?: {
    learner?: string;
    recipients?: string[];
    invoiceNumber?: string;
    month?: string;
    balanceCents?: number;
    paidCents?: number;
    documentNumber?: string;
    payer?: string;
    totalCents?: number;
    creditCents?: number;
  };
};
export type Snapshot = {
  applications: Application[];
  invoices: Invoice[];
  payments: Payment[];
  audit: Audit[];
  messages: Message[];
  closures: { day: string; reason: string }[];
  programmes: { grade: string; label: string; weekdays: number[] }[];
  today: string;
  truncated: boolean;
  messages_truncated?: boolean;
  finance_role?: string;
};
export const invoiceCharge = (invoice: Invoice) =>
  invoice.amount_cents - Number(invoice.credited_cents || 0);
export const invoiceBalance = (invoice: Invoice) =>
  invoiceCharge(invoice) - Number(invoice.paid_cents);
export const learnerState = (application: Application) =>
  application.enrollment_state &&
  application.enrollment_state !== "not_enrolled"
    ? application.enrollment_state
    : application.status;
export const rand = (cents: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    cents / 100,
  );
export function firstInvoiceEstimate(
  fee: number,
  start: string,
  closures: string[],
  weekdays: number[],
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const date = new Date(`${start}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== start
  )
    return null;
  const month = date.getUTCMonth();
  let total = 0,
    remaining = 0;
  for (
    let day = new Date(Date.UTC(date.getUTCFullYear(), month, 1, 12));
    day.getUTCMonth() === month;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const iso = day.toISOString().slice(0, 10);
    if (weekdays.includes(day.getUTCDay() || 7) && !closures.includes(iso)) {
      total++;
      if (iso >= start) remaining++;
    }
  }
  return total && remaining
    ? { total, remaining, cents: Math.round((fee * 100 * remaining) / total) }
    : null;
}
