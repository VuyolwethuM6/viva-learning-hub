export type BillingCandidate = {
  id: string;
  learner_name: string;
  application_number: string;
  grade_level: string;
  starts_on: string;
  ends_on: string;
  amount_cents: number;
};
export type PurchasePayment = {
  id: string;
  provider_id: string;
  order_id: string;
  product: string;
  email: string;
  gross_cents: number;
  fee_cents: number | null;
  verified_on: string;
  journal_id: string | null;
  posting_error: string | null;
  review_reason: string | null;
};
export type PurchaseDelivery = {
  id: string;
  order_id: string;
  product: string;
  kind: "customer" | "admin";
  recipient: string | null;
  state: string;
  display_state: string;
  provider_id: string | null;
  last_error: string | null;
};
export type RecoverySnapshot = {
  month: string;
  candidates: BillingCandidate[];
  fingerprint: string | null;
  sales: {
    role: string;
    authorized: boolean;
    unposted: number;
    deliveryAttention: number;
    clearingCents: number;
    payments: PurchasePayment[];
    deliveries: PurchaseDelivery[];
    limited: boolean;
    settlements: {
      id: string;
      reference: string;
      amount_cents: number;
      posted_on: string;
      reversed_at: string | null;
    }[];
  };
};
