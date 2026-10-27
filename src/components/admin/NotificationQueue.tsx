import { VivaLoader } from "@/components/VivaLoader";
import { useState } from "react";
import { Ban, Search, Send } from "lucide-react";
import type { Application, Invoice, Message } from "@/lib/admin-types";
import { invoiceBalance, rand } from "@/lib/admin-types";
import { auditTime, notificationName } from "@/lib/admin-format";
import { Badge, Dialog, EmptyState } from "./AdminPrimitives";

export function NotificationQueue({
  messages,
  invoices,
  applications,
  busy,
  error,
  truncated,
  onSend,
  onCancel,
}: {
  messages: Message[];
  invoices: Invoice[];
  applications: Application[];
  busy: boolean;
  error: string;
  truncated?: boolean;
  onSend: (message: Message) => void;
  onCancel: (
    message: Message,
    reason: string,
    providerReviewed: boolean,
  ) => Promise<boolean>;
}) {
  const [view, setView] = useState("waiting");
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState<Message | null>(null);
  const waiting = messages.filter(
    (m) => !["sent", "cancelled"].includes(m.state),
  );
  const completed = messages.filter((m) =>
    ["sent", "cancelled"].includes(m.state),
  );
  const candidates = view === "waiting" ? waiting : completed;
  const invoiceFor = (m: Message) =>
    invoices.find((i) => i.id === m.invoice_id);
  const learnerFor = (m: Message) =>
    m.payload?.learner ||
    applications.find((a) => a.id === invoiceFor(m)?.application_id)
      ?.learner_name ||
    "Learner record unavailable";
  const numberFor = (m: Message) =>
    m.payload?.documentNumber ||
    m.payload?.invoiceNumber ||
    invoiceFor(m)?.number ||
    "Invoice record unavailable";
  const visible = candidates.filter((m) =>
    `${notificationName(m.kind)} ${learnerFor(m)} ${numberFor(m)} ${(m.payload?.recipients || []).join(" ")} ${m.state}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const inFlight = (m: Message) =>
    m.state === "sending" &&
    (!m.claimed_at || new Date(m.claimed_at).getTime() > Date.now() - 120000);
  const summary = (m: Message) => {
    if (m.state === "cancelled")
      return "Removed from the send queue. No further sends are allowed for this notification.";
    if (m.state === "sent")
      return m.last_error?.startsWith("Skipped:")
        ? `No email was sent. ${m.last_error.slice("Skipped: ".length)}.`
        : "Accepted by the email provider. Inbox delivery has not been confirmed.";
    if (inFlight(m))
      return "A send attempt is in progress. Refresh after it finishes.";
    if (m.state === "failed" || m.state === "sending")
      return "Delivery was not confirmed. Check the email provider history before retrying or cancelling.";
    return "Ready to send. This notification has not been sent yet.";
  };
  return (
    <>
      <div className="queue-guide admin-card">
        <h2>What happens here</h2>
        <p>
          Approvals prepare invoice emails, recorded payments prepare receipts,
          and activation prepares a welcome email. Each message waits here until
          you send it.
        </p>
        <p>
          You can remove an unwanted email from the queue with a reason. Its
          history and the linked financial records are kept.
        </p>
      </div>
      {truncated && (
        <p role="status" className="admin-notice">
          This view contains up to 200 notifications, with waiting items loaded
          first. Older history may be outside this view.
        </p>
      )}
      <div className="admin-card queue-controls">
        <div
          className="queue-tabs"
          role="group"
          aria-label="Notification views"
        >
          <button
            aria-pressed={view === "waiting"}
            onClick={() => setView("waiting")}
          >
            Waiting to send ({waiting.length})
          </button>
          <button
            aria-pressed={view === "history"}
            onClick={() => setView("history")}
          >
            Completed history ({completed.length})
          </button>
        </div>
        <label className="search-field">
          <Search size={19} />
          <span className="sr-only">Search notifications</span>
          <input
            aria-label="Search notifications"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search learner, invoice or recipient"
          />
        </label>
      </div>
      <div className="queue-list">
        {visible.map((m) => (
          <article className="admin-card queue-message" key={m.id}>
            <div className="queue-message-heading">
              <div>
                <span className="eyebrow">{notificationName(m.kind)}</span>
                <h2>{learnerFor(m)}</h2>
                <p>
                  {numberFor(m)}
                  {m.payload?.month
                    ? ` · Tuition month ${m.payload.month.slice(0, 7)}`
                    : ""}
                </p>
              </div>
              <Badge
                value={
                  m.state === "sent" && m.last_error?.startsWith("Skipped:")
                    ? "skipped"
                    : m.state
                }
              />
            </div>
            <p className="queue-explanation">{summary(m)}</p>
            <dl className="queue-facts">
              <div>
                <dt>Recipients</dt>
                <dd>
                  {m.payload?.recipients?.length
                    ? Array.from(new Set(m.payload.recipients)).join(", ")
                    : "Recipient details unavailable. Refresh before sending."}
                </dd>
              </div>
              <div>
                <dt>Prepared</dt>
                <dd>{auditTime(m.created_at)}</dd>
              </div>
              <div>
                <dt>Send attempts</dt>
                <dd>
                  {m.attempts}
                  {m.first_attempt_at
                    ? ` · First attempt ${auditTime(m.first_attempt_at)}`
                    : " · None yet"}
                </dd>
              </div>
              {typeof m.payload?.paidCents === "number" && (
                <div>
                  <dt>This payment</dt>
                  <dd>{rand(m.payload.paidCents)}</dd>
                </div>
              )}
              {typeof m.payload?.balanceCents === "number" && (
                <div>
                  <dt>Balance when prepared</dt>
                  <dd>
                    {rand(m.payload.balanceCents)} · May differ from the current
                    invoice balance
                  </dd>
                </div>
              )}
              {invoiceFor(m) && (
                <div>
                  <dt>Current invoice balance</dt>
                  <dd>{rand(invoiceBalance(invoiceFor(m)!))}</dd>
                </div>
              )}
              {m.sent_at && (
                <div>
                  <dt>
                    {m.last_error?.startsWith("Skipped:")
                      ? "Completed"
                      : "Provider accepted"}
                  </dt>
                  <dd>{auditTime(m.sent_at)}</dd>
                </div>
              )}
              {m.cancelled_at && (
                <div>
                  <dt>Cancelled</dt>
                  <dd>{auditTime(m.cancelled_at)}</dd>
                </div>
              )}
              {m.cancellation_reason && (
                <div>
                  <dt>Cancellation reason</dt>
                  <dd>{m.cancellation_reason}</dd>
                </div>
              )}
            </dl>
            {m.last_error && m.state !== "sent" && (
              <p className="queue-warning">Last attempt: {m.last_error}</p>
            )}
            {!["sent", "cancelled"].includes(m.state) && (
              <div className="queue-message-actions">
                <button
                  className="admin-primary"
                  disabled={
                    busy || inFlight(m) || !m.payload?.recipients?.length
                  }
                  onClick={() => onSend(m)}
                >
                  <Send size={16} />
                  {m.attempts
                    ? "Retry after checking delivery"
                    : "Send notification"}
                </button>
                <button
                  disabled={busy || inFlight(m)}
                  onClick={() => setCancelling(m)}
                >
                  <Ban size={16} />
                  Remove from queue
                </button>
              </div>
            )}
          </article>
        ))}
        {!visible.length && (
          <section className="admin-card">
            <EmptyState
              title={
                search
                  ? "No matching notifications"
                  : view === "waiting"
                    ? "No notifications waiting"
                    : "No completed notifications yet"
              }
            >
              {search
                ? "Try a different learner, invoice number or recipient."
                : view === "waiting"
                  ? "New invoice, receipt and activation messages will appear here when those events happen. Sent and cancelled items are in Completed history."
                  : "Emails accepted by the provider, skipped reminders and cancelled messages will appear here."}
            </EmptyState>
          </section>
        )}
      </div>
      {cancelling && (
        <Dialog
          title="Remove this email from the queue?"
          subtitle={`${notificationName(cancelling.kind)} · ${numberFor(cancelling)}`}
          variant="confirm"
          busy={busy}
          close={() => {
            if (!busy) setCancelling(null);
          }}
        >
          <form
            className="cancel-notification-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              void onCancel(
                cancelling,
                String(values.get("reason") || ""),
                values.get("providerReviewed") === "on",
              ).then((success) => {
                if (success) setCancelling(null);
              });
            }}
          >
            <p>
              This stops future sends for this notification. The invoice,
              payment, receipt snapshot and audit history will remain available.
            </p>
            {cancelling.attempts > 0 && (
              <>
                <p className="queue-warning">
                  This email has already been attempted. Cancellation cannot
                  recall an email that the provider may have accepted.
                </p>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    name="providerReviewed"
                    required
                    disabled={busy}
                  />
                  I checked the email provider history and understand that
                  cancellation only stops future send attempts.
                </label>
              </>
            )}
            <label>
              Cancellation reason
              <textarea
                name="reason"
                minLength={5}
                maxLength={500}
                required
                disabled={busy}
                placeholder="Explain why this notification is no longer needed"
              />
            </label>
            {error && (
              <p role="alert" className="admin-error">
                {error}
              </p>
            )}
            <div className="confirm-actions">
              <button className="admin-danger" disabled={busy}>
                {busy ? (
                  <>
                    <VivaLoader size="button" decorative />
                    Saving…
                  </>
                ) : (
                  "Cancel queued email"
                )}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setCancelling(null)}
              >
                Keep in queue
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
