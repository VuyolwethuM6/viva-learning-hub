export type Account = {
  code: string;
  name: string;
  kind: string;
  control_account: boolean;
  active: boolean;
  balance_cents: number;
  period_net_cents: number;
  debit_cents: number;
  credit_cents: number;
};
export type MoneyReceipt = {
  id: string;
  number: string;
  application_id: string;
  billing_email: string;
  payer_name: string;
  amount_cents: number;
  available_cents: number;
  paid_on: string;
  method: string;
  reference: string;
  note: string;
  journal_id: string;
  reversed_at: string | null;
  allocations: {
    id: string;
    invoiceId: string;
    invoiceNumber: string;
    amountCents: number;
    netCents: number;
  }[];
};
export type CreditNote = {
  reversed_at: string | null;
  id: string;
  number: string;
  invoice_id: string;
  invoice_number: string;
  learner_name: string;
  amount_cents: number;
  reason: string;
  issued_on: string;
};
export type Refund = {
  id: string;
  number: string;
  receipt_id: string;
  receipt_number: string;
  payer_name: string;
  amount_cents: number;
  paid_on: string;
  method: string;
  reference: string;
  reason: string;
  reversed_at: string | null;
};
export type ExpenseAttachment = {
  id: string;
  bill_id: string;
  name: string;
  mime: string;
  size_bytes: number;
  finalized_at: string | null;
};
export type BillPayment = {
  id: string;
  amount_cents: number;
  paid_on: string;
  method: string;
  reference: string;
  reversed_at: string | null;
};
export type SupplierBill = {
  id: string;
  number: string;
  supplier_id: string;
  supplier_name: string;
  category: string;
  description: string;
  issued_on: string;
  due_on: string;
  amount_cents: number;
  paid_cents: number;
  reversed_at: string | null;
  payments: BillPayment[];
  attachments: ExpenseAttachment[];
};
export type Journal = {
  id: string;
  posted_on: string;
  description: string;
  source_kind: string;
  source_id: string;
  actor_email: string;
  reversal_of: string | null;
  reversed_by: string | null;
  bank_match_id: string | null;
  lines: {
    account: string;
    name: string;
    cents: number;
    invoiceId?: string;
    applicationId?: string;
  }[];
};
export type BankLine = {
  id: string;
  batch_id: string;
  external_id: string;
  posted_on: string;
  description: string;
  amount_cents: number;
  matched_journal_id: string | null;
};
export type BankBatch = {
  voided_at: string | null;
  void_reason: string | null;
  id: string;
  name: string;
  from_date: string;
  to_date: string;
  opening_cents: number;
  closing_cents: number;
  row_count: number;
  unmatched_count: number;
};
export type FinanceSnapshot = {
  today: string;
  fromDate: string;
  toDate: string;
  asOf: string;
  role: "owner" | "bookkeeper" | "viewer";
  settings: {
    books_start: string;
    closed_through: string | null;
    automation_enabled: boolean;
    auto_send: boolean;
    recognised_through: string | null;
  };
  accounts: Account[];
  reports: {
    incomeCents: number;
    expenseCents: number;
    profitCents: number;
    assetsCents: number;
    liabilitiesCents: number;
    equityCents: number;
    accumulatedResultCents: number;
    balanceSheetDifference: number;
    bankCents: number;
    cashCents: number;
    cashOpeningCents: number;
    cashInCents: number;
    cashOutCents: number;
  };
  integrity: Record<string, number>;
  families: {
    email: string;
    name: string;
    learners: string;
    owed_cents: number;
    credit_cents: number;
    application_id: string;
  }[];
  receipts: MoneyReceipt[];
  credit_notes: CreditNote[];
  refunds: Refund[];
  suppliers: { id: string; name: string }[];
  bills: SupplierBill[];
  journals: Journal[];
  bank_timing: {
    id: string;
    journal_id: string;
    posted_on: string;
    description: string;
    amount_cents: number;
    expected_on: string;
    reason: string;
    withdrawn_at: string | null;
    cleared_on: string | null;
  }[];
  bank_candidates: {
    id: string;
    posted_on: string;
    description: string;
    amount_cents: number;
  }[];
  bank_batches: BankBatch[];
  bank_lines: BankLine[];
  ageing: {
    id: string;
    number: string;
    learner_name: string;
    guardian_email: string;
    due_date: string;
    balance_cents: number;
    bucket: string;
  }[];
  runs: {
    id: string;
    run_on: string;
    state: string;
    attempts: number;
    result: Record<string, unknown>;
    last_error: string | null;
    finished_at: string;
  }[];
  period_events: {
    id: string;
    action: string;
    through_date: string;
    reason: string;
    created_at: string;
  }[];
  admins: { id: string; email: string; role: string }[];
  limits: Record<string, boolean>;
};
