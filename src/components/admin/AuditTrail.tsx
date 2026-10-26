import { useState } from "react";
import { Search } from "lucide-react";
import type { Audit, Snapshot } from "@/lib/admin-types";
import { rand } from "@/lib/admin-types";
import { auditName, auditTime, notificationName } from "@/lib/admin-format";
import { EmptyState } from "./AdminPrimitives";

export function AuditTrail({
  data,
  user,
  applicationId,
  limit,
  searchable = false,
}: {
  data: Snapshot;
  user: { id: string; email: string };
  applicationId?: string;
  limit?: number;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const context = (event: Audit) => {
    const message = data.messages.find((m) => m.id === event.details.messageId);
    const payment = data.payments.find((p) => p.id === event.details.paymentId);
    const invoice =
      data.invoices.find(
        (i) =>
          i.id ===
          (event.details.invoiceId ||
            message?.invoice_id ||
            payment?.invoice_id),
      ) ||
      (event.action === "approve"
        ? data.invoices.find(
            (i) =>
              i.application_id === event.application_id &&
              i.period_start.slice(0, 10) ===
                String(event.details.startDate).slice(0, 10),
          )
        : undefined);
    const application = data.applications.find(
      (a) => a.id === (event.application_id || invoice?.application_id),
    );
    const actor =
      event.actor_email ||
      (event.actor_id === user.id
        ? user.email
        : `Administrator ${event.actor_id}`);
    return { message, invoice, application, actor };
  };
  const groups: Record<string, string[]> = {
    reviews: ["approve", "reject", "note", "activate"],
    payments: ["payment"],
    billing: ["generate_month", "queue_reminders"],
    notifications: ["send_message", "cancel_message"],
    documents: ["view_document"],
  };
  const events = data.audit
    .filter((event) => {
      const c = context(event);
      return (
        (!applicationId ||
          c.application?.id === applicationId ||
          event.application_id === applicationId) &&
        (category === "all" || groups[category]?.includes(event.action)) &&
        `${auditName(event.action)} ${c.application?.learner_name} ${c.application?.application_number} ${c.invoice?.number} ${c.actor} ${JSON.stringify(event.details)}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .slice(0, limit);
  return (
    <>
      {searchable && (
        <div className="audit-controls">
          <label className="search-field">
            <Search size={19} />
            <span className="sr-only">Search audit history</span>
            <input
              aria-label="Search audit history"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search learner, invoice, admin or payment reference"
            />
          </label>
          <label className="status-select">
            <span>Activity</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All activity</option>
              <option value="reviews">Reviews and activation</option>
              <option value="payments">Payments</option>
              <option value="billing">Billing and reminders</option>
              <option value="notifications">Notifications</option>
              <option value="documents">Document access</option>
            </select>
          </label>
        </div>
      )}
      <div className="activity-list audit-trail">
        {events.map((event) => {
          const { application, invoice, message, actor } = context(event);
          const details = event.details;
          return (
            <article key={event.id}>
              <span className="activity-dot" />
              <div className="audit-event-body">
                <strong>{auditName(event.action)}</strong>
                <p className="audit-context">
                  {application?.learner_name || "Tuition administration"}
                  {invoice ? ` · ${invoice.number}` : ""}
                </p>
                <small>
                  <time dateTime={event.created_at}>
                    {auditTime(event.created_at)}
                  </time>
                  <br />
                  By {actor}
                  {event.actor_id === user.id ? " (you)" : ""}
                </small>
                {event.action === "payment" && (
                  <p className="audit-summary">
                    {typeof details.amountCents === "number"
                      ? rand(details.amountCents)
                      : "Payment"}{" "}
                    recorded
                    {typeof details.method === "string"
                      ? ` by ${details.method}`
                      : ""}
                    {typeof details.paidOn === "string"
                      ? `, paid on ${details.paidOn}`
                      : ""}
                    .
                    {typeof details.reference === "string"
                      ? ` Transaction reference: ${details.reference}.`
                      : ""}
                  </p>
                )}
                {event.action === "approve" && (
                  <p className="audit-summary">
                    Approved for a {String(details.startDate || "recorded")}{" "}
                    start. The first invoice was issued; activation still
                    requires full payment.
                  </p>
                )}
                {event.action === "activate" && (
                  <p className="audit-summary">
                    Enrollment activated after approval and full payment of the
                    first invoice.
                  </p>
                )}
                {event.action === "reject" && (
                  <p className="audit-summary">
                    Application declined. This action does not send an automatic
                    rejection email.
                  </p>
                )}
                {event.action === "generate_month" && (
                  <p className="audit-summary">
                    Monthly invoice generation requested for{" "}
                    {String(details.month || "the next tuition month").slice(
                      0,
                      7,
                    )}
                    . Existing learner/month invoices are preserved.
                  </p>
                )}
                {event.action === "queue_reminders" && (
                  <p className="audit-summary">
                    Outstanding tuition invoices checked for eligible monthly
                    reminders. Sending each queued email is a separate action.
                  </p>
                )}
                {event.action === "send_message" && (
                  <p className="audit-summary">
                    A send attempt started
                    {message
                      ? ` for ${notificationName(message.kind).toLowerCase()}`
                      : " for a notification"}
                    . This event does not confirm delivery; check Notifications
                    for the current status.
                  </p>
                )}
                {event.action === "cancel_message" && (
                  <p className="audit-summary">
                    {typeof details.kind === "string"
                      ? notificationName(details.kind)
                      : "Notification"}{" "}
                    removed from the send queue. Financial records and message
                    history were retained.
                  </p>
                )}
                {event.action === "view_document" && (
                  <p className="audit-summary">
                    A private document link or download was requested. This
                    entry does not confirm that the file was opened.
                  </p>
                )}
                {typeof details.note === "string" && details.note.trim() && (
                  <p className="audit-note">
                    <b>
                      {event.action === "reject"
                        ? "Rejection reason"
                        : event.action === "payment"
                          ? "Payment verification"
                          : "Review note"}
                      :
                    </b>{" "}
                    {details.note}
                  </p>
                )}
                {typeof details.reason === "string" && (
                  <p className="audit-note">
                    <b>Cancellation reason:</b> {details.reason}
                  </p>
                )}
                {details.providerHistoryReviewed === true && (
                  <p className="admin-muted">
                    The administrator confirmed checking the email provider
                    history.
                  </p>
                )}
                {!limit && (
                  <details className="audit-details">
                    <summary>Technical record</summary>
                    <dl>
                      <div>
                        <dt>Event ID</dt>
                        <dd>{event.id}</dd>
                      </div>
                      <div>
                        <dt>Administrator ID</dt>
                        <dd>{event.actor_id}</dd>
                      </div>
                      {application && (
                        <div>
                          <dt>Application reference</dt>
                          <dd>{application.application_number}</dd>
                        </div>
                      )}
                    </dl>
                    <pre>{JSON.stringify(details, null, 2)}</pre>
                  </details>
                )}
              </div>
            </article>
          );
        })}
        {!events.length && (
          <EmptyState
            title={
              query || category !== "all"
                ? "No matching activity"
                : "No recorded activity yet"
            }
          >
            {query || category !== "all"
              ? "Change the search or activity filter to see other recorded events."
              : "Reviews, payments, document requests and notification actions appear here as they happen."}
          </EmptyState>
        )}
      </div>
    </>
  );
}
