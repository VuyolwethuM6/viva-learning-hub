import { useCallback, useEffect, useState, type ReactNode } from "react";
import { VivaLoader } from "../VivaLoader";
import { AccountingDialog, MoneyField, ReasonField } from "./AccountingForms";
import {
  financeRequest,
  formText,
  formChecked,
  formMoney,
} from "@/lib/accounting-client";
import { rand } from "@/lib/admin-types";
import type {
  RecoverySnapshot,
  PurchasePayment,
  PurchaseDelivery,
} from "@/lib/recovery-types";
type Spec = {
  title: string;
  action: string;
  fields: ReactNode;
  build: (f: FormData) => Record<string, unknown>;
  summary: (data: Record<string, unknown>) => ReactNode;
};
export function FinancialRecoveryControls({
  today,
  booksStart,
  changed,
}: {
  today: string;
  booksStart: string;
  changed: () => Promise<unknown>;
}) {
  const [month, setMonth] = useState(today.slice(0, 7) + "-01"),
    [view, setView] = useState("Billing recovery"),
    [data, setData] = useState<RecoverySnapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [spec, setSpec] = useState<Spec | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(
        await financeRequest<RecoverySnapshot>(
          undefined,
          "?safety=1&month=" + month,
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Recovery records unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }, [month]);
  useEffect(() => {
    void load();
  }, [load]);
  const owner = data?.sales.role === "owner";
  const months: string[] = [];
  for (
    let d = today.slice(0, 7) + "-01";
    d >= booksStart.slice(0, 7) + "-01" && months.length < 120;

  ) {
    months.push(d);
    const date = new Date(d + "T12:00:00Z");
    date.setUTCMonth(date.getUTCMonth() - 1);
    d = date.toISOString().slice(0, 10);
  }
  const reviewed = (
    <label className="admin-check">
      <input name="reviewed" type="checkbox" required />I checked the provider
      records and existing books for this payment.
    </label>
  );
  const simple = (
    title: string,
    action: string,
    detail: string,
    extra: Record<string, unknown>,
  ) =>
    setSpec({
      title,
      action,
      fields: (
        <>
          <p>{detail}</p>
          <ReasonField />
        </>
      ),
      build: (f) => ({ ...extra, reason: formText(f, "reason") }),
      summary: (p) => (
        <>
          <p>{detail}</p>
          <p>{String(p.reason)}</p>
        </>
      ),
    });
  function reviewPayment(p: PurchasePayment) {
    setSpec({
      title: "Review PDF payment posting",
      action: "payfast_post",
      fields: (
        <>
          <p>
            {p.provider_id} · {p.product} · {rand(p.gross_cents)}
          </p>
          <p>
            {p.review_reason === "repeat_order_payment"
              ? "A second payment for this order will be recorded as money owed back to the customer, not another sale."
              : "Confirm this payment has not already been entered manually. Posting uses today in the open books."}
          </p>
          <MoneyField
            name="fee"
            label="Verified provider fee (rand)"
            value={
              p.fee_cents === null ? undefined : (p.fee_cents / 100).toFixed(2)
            }
            min="0"
          />
          {reviewed}
          <ReasonField />
        </>
      ),
      build: (f) => ({
        id: p.id,
        feeCents: formMoney(f, "fee"),
        reviewed: formChecked(f, "reviewed"),
        reason: formText(f, "reason"),
      }),
      summary: (r) => (
        <>
          <p>
            {p.provider_id} · gross {rand(p.gross_cents)} · fee{" "}
            {rand(Number(r.feeCents))}
          </p>
          <p>{String(r.reason)}</p>
        </>
      ),
    });
  }
  function reviewDelivery(d: PurchaseDelivery) {
    setSpec({
      title: "Review PDF email outcome",
      action: "payfast_delivery_review",
      fields: (
        <>
          <p>
            {d.product} · {d.kind} ·{" "}
            {d.recipient || "Admin email not configured"}
          </p>
          <p>
            Check the provider history before authorizing another attempt.
            Acceptance confirms the provider took the message; it does not prove
            inbox delivery.
          </p>
          <label>
            Verified outcome
            <select name="outcome" required>
              <option value="accepted">
                Provider accepted the original message
              </option>
              <option value="not_sent">
                Provider confirms no message was accepted; authorize retry
              </option>
            </select>
          </label>
          <label>
            Provider message ID (required for acceptance)
            <input name="providerId" maxLength={150} />
          </label>
          <label className="admin-check">
            <input name="reviewed" type="checkbox" required />I verified this
            outcome in the provider history.
          </label>
          <ReasonField />
        </>
      ),
      build: (f) => ({
        id: d.id,
        outcome: formText(f, "outcome"),
        providerId: formText(f, "providerId"),
        reviewed: formChecked(f, "reviewed"),
        reason: formText(f, "reason"),
      }),
      summary: (r) => (
        <>
          <p>
            {d.product} · {d.kind} · {d.recipient}
          </p>
          <p>
            {r.outcome === "accepted"
              ? "Record provider acceptance."
              : "Queue one reviewed retry. Use Send pending emails afterward."}
          </p>
          <p>
            {String(r.providerId || "")} · {String(r.reason)}
          </p>
        </>
      ),
    });
  }
  return (
    <section className="admin-card">
      <div className="finance-heading">
        <h2>Billing recovery & PDF sales</h2>
        <button
          disabled={busy}
          onClick={() => void load()}
          aria-label="Refresh recovery records"
        >
          {busy ? <VivaLoader size="button" decorative /> : "Refresh"}
        </button>
      </div>
      <div className="viva-chips">
        {["Billing recovery", "PDF sales"].map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="admin-error">
          {error} If this release is not installed, run the complete{" "}
          <a
            href="https://github.com/VuyolwethuM6/viva-learning-hub/blob/work/docs/high-priority-recovery.md"
            target="_blank"
            rel="noreferrer"
          >
            recovery setup guide
          </a>
          .
        </p>
      )}
      {!data && busy ? (
        <VivaLoader label="Loading recovery records…" />
      ) : (
        data && (
          <>
            {view === "Billing recovery" ? (
              <>
                <p>
                  Scheduled and manual accounting runs recover missing
                  current-month invoices. Older months require owner review of
                  actual service and agreed charges.
                </p>
                {!owner ? (
                  <p>
                    Only a finance owner can preview and recover missing
                    invoices.
                  </p>
                ) : (
                  <>
                    <label>
                      Billing month
                      <select
                        aria-label="Recovery billing month"
                        value={month}
                        onChange={(e) => {
                          setData(null);
                          setMonth(e.target.value);
                        }}
                      >
                        {months.map((m) => (
                          <option key={m} value={m}>
                            {m.slice(0, 7)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!data.candidates.length ? (
                      <p>No eligible missing invoices for this month.</p>
                    ) : (
                      <>
                        <div className="finance-records">
                          {data.candidates.map((c) => (
                            <article key={c.id}>
                              <p>
                                <strong>{c.learner_name}</strong> ·{" "}
                                {c.application_number}
                              </p>
                              <p>
                                {c.starts_on}–{c.ends_on} ·{" "}
                                {rand(c.amount_cents)}
                              </p>
                            </article>
                          ))}
                        </div>
                        <button
                          className="admin-primary"
                          disabled={busy}
                          onClick={() =>
                            setSpec({
                              title: "Review missing tuition invoices",
                              action: "recover_billing",
                              fields: (
                                <>
                                  <p>
                                    Confirm that each selected learner actually
                                    received or agreed to the billed service.
                                    Preview uses stored fees, grade programmes,
                                    closures and current lifecycle records;
                                    historical eligibility needs owner review.
                                  </p>
                                  {data.candidates.slice(0, 100).map((c) => (
                                    <label className="admin-check" key={c.id}>
                                      <input
                                        name="applications"
                                        type="checkbox"
                                        value={c.id}
                                      />
                                      {c.learner_name} · {c.application_number}{" "}
                                      · {rand(c.amount_cents)}
                                    </label>
                                  ))}
                                  <label className="admin-check">
                                    <input
                                      name="reviewed"
                                      type="checkbox"
                                      required
                                    />
                                    I reviewed the service dates, existing
                                    invoices and agreed charges.
                                  </label>
                                  <ReasonField />
                                </>
                              ),
                              build: (f) => {
                                const ids = f
                                  .getAll("applications")
                                  .map(String);
                                if (!ids.length)
                                  throw new Error(
                                    "Select at least one learner.",
                                  );
                                return {
                                  month,
                                  fingerprint: data.fingerprint,
                                  applications: ids,
                                  reviewed: formChecked(f, "reviewed"),
                                  reason: formText(f, "reason"),
                                };
                              },
                              summary: (p) => (
                                <>
                                  <p>Billing month: {month.slice(0, 7)}</p>
                                  {data.candidates
                                    .filter((c) =>
                                      (p.applications as string[]).includes(
                                        c.id,
                                      ),
                                    )
                                    .map((c) => (
                                      <p key={c.id}>
                                        {c.learner_name} · {c.starts_on}–
                                        {c.ends_on} · {rand(c.amount_cents)}
                                      </p>
                                    ))}
                                  <p>{String(p.reason)}</p>
                                </>
                              ),
                            })
                          }
                        >
                          Review missing invoices
                        </button>
                      </>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <p>
                  PayFast study-material purchases are separate from EFT/cash
                  tuition. Provider acceptance is shown separately from verified
                  payment and accounting.
                </p>
                <p>
                  <b>{data.sales.unposted}</b> payments awaiting posting ·{" "}
                  <b>{data.sales.deliveryAttention}</b> emails needing review ·
                  Clearing balance <b>{rand(data.sales.clearingCents)}</b>
                </p>
                {!data.sales.authorized && (
                  <p className="admin-notice">
                    An enabled finance owner must authorize automatic PDF sales
                    posting. Verified payments remain saved while posting is
                    unavailable.
                  </p>
                )}
                {owner && (
                  <div className="finance-actions">
                    <button
                      onClick={() =>
                        simple(
                          "Authorize PDF sales accounting",
                          "payfast_authorize",
                          "Use my enabled owner account to authorize future verified PDF sales postings. Existing unposted payments still need review.",
                          {},
                        )
                      }
                    >
                      Authorize PDF sales accounting
                    </button>
                    <button
                      disabled={data.sales.clearingCents <= 0}
                      onClick={() =>
                        setSpec({
                          title: "Record a PayFast bank settlement",
                          action: "payfast_settlement",
                          fields: (
                            <>
                              <p>
                                Record only a settlement actually received into
                                the business bank. Sales and fees are already
                                recorded; this moves net money from clearing to
                                bank.
                              </p>
                              <MoneyField />
                              <label>
                                Bank settlement date
                                <input
                                  name="postedOn"
                                  type="date"
                                  max={today}
                                  defaultValue={today}
                                  required
                                />
                              </label>
                              <label>
                                Unique provider/bank settlement reference
                                <input
                                  name="reference"
                                  minLength={3}
                                  maxLength={120}
                                  required
                                />
                              </label>
                              <ReasonField />
                            </>
                          ),
                          build: (f) => ({
                            amountCents: formMoney(f),
                            postedOn: formText(f, "postedOn"),
                            reference: formText(f, "reference"),
                            reason: formText(f, "reason"),
                          }),
                          summary: (p) => (
                            <>
                              <p>
                                {rand(Number(p.amountCents))} from PayFast
                                clearing to business bank · {String(p.postedOn)}
                              </p>
                              <p>
                                {String(p.reference)} · {String(p.reason)}
                              </p>
                            </>
                          ),
                        })
                      }
                    >
                      Record bank settlement
                    </button>
                  </div>
                )}
                {data.sales.limited && (
                  <p className="admin-notice">
                    These are bounded recent/review lists. Totals use all
                    records; use the database guide to investigate older
                    provider references.
                  </p>
                )}
                <h3>Verified payments</h3>
                {!data.sales.payments.length && (
                  <p>No verified PDF payments recorded.</p>
                )}
                <div className="finance-records">
                  {data.sales.payments.map((p) => (
                    <article key={p.id}>
                      <p>
                        <strong>{p.provider_id}</strong> · {p.product}
                      </p>
                      <p>
                        {p.email} · {rand(p.gross_cents)} · Fee{" "}
                        {p.fee_cents === null
                          ? "Needs verification"
                          : rand(p.fee_cents)}
                      </p>
                      <p>
                        {p.journal_id
                          ? "Posted to clearing and the ledger"
                          : "Posting needs review"}{" "}
                        · Verified {p.verified_on}
                      </p>
                      {p.posting_error && <p>{p.posting_error}</p>}
                      {owner && !p.journal_id && (
                        <button onClick={() => reviewPayment(p)}>
                          Review posting
                        </button>
                      )}
                    </article>
                  ))}
                </div>
                <h3>Email delivery records</h3>
                <div className="finance-records">
                  {data.sales.deliveries.map((d) => (
                    <article key={d.id}>
                      <p>
                        <strong>{d.product}</strong> · {d.kind}
                      </p>
                      <p>
                        {d.recipient ||
                          "Admin recipient will be set from server configuration"}{" "}
                        ·{" "}
                        {d.display_state === "accepted"
                          ? "Accepted by provider"
                          : d.display_state}
                      </p>
                      {d.provider_id && <p>Provider ID: {d.provider_id}</p>}
                      {d.last_error && <p>{d.last_error}</p>}
                      {owner && d.display_state === "pending" && (
                        <button
                          onClick={() =>
                            simple(
                              "Send pending PDF emails",
                              "payfast_dispatch",
                              `Send only unattempted or explicitly requeued messages for ${d.product}. Already accepted, active and uncertain attempts are skipped.`,
                              { orderId: d.order_id },
                            )
                          }
                        >
                          Send pending emails
                        </button>
                      )}
                      {owner &&
                        ["failed", "uncertain"].includes(d.display_state) && (
                          <button onClick={() => reviewDelivery(d)}>
                            Review provider outcome
                          </button>
                        )}
                    </article>
                  ))}
                </div>
                <h3>Recorded bank settlements</h3>
                {!data.sales.settlements.length && (
                  <p>
                    No settlements recorded. A provider payment is not yet a
                    bank deposit.
                  </p>
                )}
                <div className="finance-records">
                  {data.sales.settlements.map((s) => (
                    <article key={s.id}>
                      <p>
                        {s.posted_on} · {s.reference} · {rand(s.amount_cents)}{" "}
                        {s.reversed_at ? "· Reversed" : ""}
                      </p>
                      {owner && !s.reversed_at && (
                        <button
                          onClick={() =>
                            simple(
                              "Reverse an incorrect PayFast settlement",
                              "payfast_settlement_reverse",
                              `Reverse the accounting entry for ${s.reference}. Unmatch any bank reconciliation first. This records a correction; it does not move real money.`,
                              { id: s.id },
                            )
                          }
                        >
                          Reverse incorrect settlement
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )
      )}
      {spec && (
        <AccountingDialog
          title={spec.title}
          action={spec.action}
          close={() => setSpec(null)}
          changed={async () => {
            await load();
            await changed();
          }}
          build={spec.build}
          summary={spec.summary}
          label="Confirm"
        >
          {spec.fields}
        </AccountingDialog>
      )}
    </section>
  );
}
