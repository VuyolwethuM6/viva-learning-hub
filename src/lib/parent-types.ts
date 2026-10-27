export type ParentChild = {
  id: string;
  name: string;
  applicationNumber: string;
  studentNumber: string;
  grade: string;
  mode: string;
  subjects: string[];
  monthlyFeeCents: number;
  outstandingCents: number;
  readyForActivation: boolean;
  status: string;
  startDate: string | null;
  billingEndDate: string | null;
  arrangementUntil: string | null;
  school: string | null;
  programme: string | null;
  schedule: number[] | null;
};
export type ParentInvoice = {
  id: string;
  application_id: string;
  number: string;
  billing_month: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_cents: number;
  credited_cents: number;
  balance_cents: number;
};
export type ParentReceipt = {
  id: string;
  application_id: string;
  number: string;
  amount_cents: number;
  paid_on: string;
  method: string;
  reference: string;
  reversed_at: string | null;
  available_cents: number;
  allocations: {
    invoiceNumber: string;
    learner: string;
    amountCents: number;
  }[];
};
export type ParentCredit = {
  id: string;
  invoice_id: string;
  application_id: string;
  invoice_number: string;
  number: string;
  amount_cents: number;
  issued_on: string;
  reversed_at: string | null;
};
export type ParentRefund = {
  id: string;
  application_id: string;
  number: string;
  amount_cents: number;
  paid_on: string;
  method: string;
  reversed_at: string | null;
};
export type ParentSnapshot = {
  today: string;
  parent: { email: string; name: string };
  children: ParentChild[];
  invoices: ParentInvoice[];
  receipts: ParentReceipt[];
  creditNotes: ParentCredit[];
  refunds: ParentRefund[];
  totals: {
    outstandingCents: number;
    overdueCents: number;
    availableCreditCents: number;
  };
  historyLimited: boolean;
  paymentDetails?: {
    accountName: string;
    bank: string;
    accountNumber: string;
    accountType: string;
    branchCode: string;
  } | null;
};
