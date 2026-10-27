import { VivaLoader } from "@/components/VivaLoader";
import { useRef, useState, type ReactNode } from "react";
import { Dialog } from "./AdminPrimitives";
import { rand } from "@/lib/admin-types";
import { financeRequest } from "@/lib/accounting-client";

export function MoneyField({
  name = "amount",
  label = "Amount (rand)",
  value,
  min = "0.01",
}: {
  name?: string;
  label?: string;
  value?: string;
  min?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type="number"
        min={min}
        max="20000000"
        step="0.01"
        defaultValue={value}
        inputMode="decimal"
        required
      />
    </label>
  );
}
export function PaymentFields({
  today,
  amount,
  label = "Amount (rand)",
}: {
  today: string;
  amount?: string;
  label?: string;
}) {
  return (
    <>
      <MoneyField value={amount} label={label} />
      <PaymentDetails today={today} />
    </>
  );
}
export function PaymentDetails({ today }: { today: string }) {
  return (
    <>
      <label>
        Payment date
        <input
          name="paidOn"
          type="date"
          max={today}
          defaultValue={today}
          required
        />
      </label>
      <label>
        Payment method
        <select name="method" defaultValue="EFT">
          <option>EFT</option>
          <option>Cash</option>
        </select>
      </label>
      <label>
        Unique bank transaction ID / cash receipt number
        <input
          name="reference"
          minLength={3}
          maxLength={120}
          required
          autoComplete="off"
        />
      </label>
    </>
  );
}
export function ReasonField({
  label = "Reason",
  name = "reason",
  value,
}: {
  label?: string;
  name?: string;
  value?: string;
}) {
  return (
    <label>
      {label}
      <textarea
        name={name}
        minLength={5}
        maxLength={2000}
        defaultValue={value}
        required
        rows={3}
      />
    </label>
  );
}
export function AccountingDialog({
  title,
  action,
  close,
  changed,
  children,
  build,
  summary,
  label = "Save",
  description,
}: {
  title: string;
  action: string;
  close: () => void;
  changed: () => Promise<unknown>;
  children: ReactNode;
  build: (data: FormData, id: string) => Record<string, unknown>;
  summary?: (data: Record<string, unknown>) => ReactNode;
  label?: string;
  description?: ReactNode;
}) {
  const id = useRef(crypto.randomUUID());
  const [review, setReview] = useState<Record<string, unknown> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      title={title}
      variant="confirm"
      busy={busy}
      close={() => {
        if (!busy) close();
      }}
    >
      {description && <div className="finance-form-intro">{description}</div>}
      <form
        className="finance-form"
        hidden={!!review}
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          try {
            setReview(build(new FormData(event.currentTarget), id.current));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Check the form.");
          }
        }}
      >
        {children}
        {!review && error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <button className="admin-primary">Review before saving</button>
      </form>
      {review && (
        <div className="finance-review">
          <h3>Confirm this entry</h3>
          {summary ? (
            summary(review)
          ) : (
            <dl>
              {[
                [
                  "Amount",
                  typeof review.amountCents === "number"
                    ? rand(review.amountCents)
                    : null,
                ],
                ["Method", review.method],
                ["Reference", review.reference],
                [
                  "Date",
                  review.paidOn ||
                    review.postedOn ||
                    review.issuedOn ||
                    review.throughDate ||
                    review.fromDate,
                ],
                ["Reason", review.reason || review.note],
              ]
                .filter(([, v]) => v !== undefined && v !== null)
                .map(([k, v]) => (
                  <div key={String(k)}>
                    <dt>{String(k)}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
            </dl>
          )}
          {error && (
            <p role="alert" className="admin-error">
              {error}
            </p>
          )}
          <div className="confirm-actions">
            <button
              className="admin-primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void (async () => {
                  try {
                    await financeRequest({
                      action,
                      requestId: id.current,
                      ...review,
                    });
                    await changed();
                    close();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "The entry could not be confirmed.",
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {busy ? (
                <>
                  <VivaLoader size="button" decorative />
                  Saving…
                </>
              ) : (
                label
              )}
            </button>
            <button disabled={busy} onClick={() => setReview(null)}>
              Back to edit
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
