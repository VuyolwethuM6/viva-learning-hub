import {
  financeRequest,
  formChecked,
  formMoney,
  formText,
} from "@/lib/accounting-client";
import { useState } from "react";
import {
  type Application,
  type Invoice,
  invoiceBalance,
  learnerState,
  rand,
} from "@/lib/admin-types";
import { AccountingDialog, ReasonField } from "./AccountingForms";
export function LearnerAccountControls({
  application: a,
  today,
  role,
  changed,
  onStatement,
}: {
  application: Application;
  today: string;
  role?: string;
  changed: () => Promise<unknown>;
  onStatement: () => void;
}) {
  const [action, setAction] = useState("");
  const state = learnerState(a),
    canWrite = role !== "viewer";
  const buildChange = (form: FormData) => {
    const common = { applicationId: a.id, reason: formText(form, "reason") };
    if (action === "arrangement")
      return { ...common, untilDate: formText(form, "untilDate") };
    if (action === "withdraw")
      return {
        ...common,
        noticeDate: formText(form, "noticeDate"),
        endDate: formText(form, "endDate"),
        noticeConfirmed: formChecked(form, "noticeConfirmed"),
      };
    if (action === "suspend")
      return {
        ...common,
        cause: formText(form, "cause"),
        noticeConfirmed: formChecked(form, "noticeConfirmed"),
      };
    return { ...common, startDate: formText(form, "startDate") };
  };
  return (
    <section className="profile-section lifecycle-controls">
      <h3>Learner account and billing</h3>
      <p>
        Teaching and routine billing run February–November. Old balances remain
        payable during the break.
      </p>
      {a.billing_end_date && (
        <p>
          <b>Final billing date:</b> {a.billing_end_date}
        </p>
      )}
      {a.lifecycle_reason && (
        <p>
          <b>Account note:</b> {a.lifecycle_reason}
        </p>
      )}
      {a.arrangement_until && (
        <p>
          <b>Payment arrangement until:</b> {a.arrangement_until}
          <br />
          {a.arrangement_note}
        </p>
      )}
      <div className="finance-action-row">
        <button onClick={onStatement}>Family account statement</button>
        {canWrite && (
          <>
            <button onClick={() => setAction("arrangement")}>
              Payment arrangement
            </button>
            {state === "active" && (
              <button onClick={() => setAction("suspend")}>
                Suspend learner
              </button>
            )}
            {["suspended", "withdrawn"].includes(state) && (
              <button onClick={() => setAction("reactivate")}>
                Reactivate / prepare return
              </button>
            )}
            {state !== "withdrawn" &&
              ["active", "suspended", "pending_payment"].includes(state) && (
                <button
                  className="admin-danger"
                  onClick={() => setAction("withdraw")}
                >
                  Record withdrawal
                </button>
              )}
          </>
        )}
      </div>
      {action && (
        <AccountingDialog
          title={
            {
              arrangement: "Record payment arrangement",
              withdraw: "Record learner withdrawal",
              suspend: "Suspend learner",
              reactivate: "Prepare learner return",
            }[action] || "Learner account"
          }
          action={action}
          close={() => setAction("")}
          changed={changed}
          label="Confirm account change"
          description={
            <p>
              {a.learner_name} · {a.student_number}
            </p>
          }
          build={buildChange}
        >
          {action === "arrangement" && (
            <>
              <p>
                A current arrangement pauses automated reminders and
                unpaid-tuition suspension. It does not erase debt or change
                invoice due dates.
              </p>
              <label>
                Arrangement end date
                <input
                  name="untilDate"
                  type="date"
                  min={today}
                  defaultValue={a.arrangement_until || ""}
                />
              </label>
              <p className="admin-muted">
                Leave the date empty to end an existing arrangement. Record the
                agreed terms below.
              </p>
            </>
          )}
          {action === "withdraw" && (
            <>
              <label>
                Notice received
                <input
                  name="noticeDate"
                  type="date"
                  max={today}
                  defaultValue={today}
                  required
                />
              </label>
              <label>
                Agreed final billing date
                <input name="endDate" type="date" />
              </label>
              <p>
                Notice by the 20th defaults to month-end. Later notice needs an
                agreed final date. Future charges stop after that date; adjust
                existing invoices separately with a credit note.
              </p>
              <label className="admin-check">
                <input name="noticeConfirmed" type="checkbox" required />
                The final date and charges were discussed with the family.
              </label>
            </>
          )}
          {action === "suspend" && (
            <>
              <label>
                Reason category
                <select name="cause">
                  <option value="unpaid">Unpaid tuition</option>
                  <option value="other">Other agreed pause</option>
                </select>
              </label>
              <p>
                Unpaid-tuition suspension requires an overdue balance, starts
                from the 10th and respects current arrangements. Suspension
                pauses new routine invoices; existing charges remain.
              </p>
              <label className="admin-check">
                <input name="noticeConfirmed" type="checkbox" required />
                The family has received notice.
              </label>
            </>
          )}
          {action === "reactivate" && (
            <>
              <label>
                Agreed return date
                <input
                  name="startDate"
                  type="date"
                  min={today}
                  defaultValue={today}
                  required
                />
              </label>
              <p>
                The return invoice will be prepared if needed. The learner
                remains suspended/withdrawn until that charge is paid; repeat
                this action after payment to confirm the return. Overdue
                balances require settlement or a current arrangement.
              </p>
            </>
          )}
          <ReasonField
            label={
              action === "arrangement"
                ? "Agreed terms / reason"
                : "Reason and agreed details"
            }
          />
        </AccountingDialog>
      )}
    </section>
  );
}
export function InvoiceAccountingControls({
  invoice: i,
  role,
  changed,
  onPDF,
}: {
  invoice: Invoice;
  role?: string;
  changed: () => Promise<unknown>;
  onPDF: (kind: string, id: string, title: string) => void;
}) {
  const [credit, setCredit] = useState(false);
  return (
    <section className="profile-section">
      <h3>Invoice adjustments</h3>
      <p>
        Original charge: {rand(i.amount_cents)} · Credit notes:{" "}
        {rand(Number(i.credited_cents || 0))} · Current balance:{" "}
        {rand(invoiceBalance(i))}
      </p>
      {role !== "viewer" && i.amount_cents > Number(i.credited_cents || 0) && (
        <button onClick={() => setCredit(true)}>Issue credit note</button>
      )}
      <p className="admin-muted">
        Credits retain the original invoice. Any amount already paid beyond the
        revised charge becomes available family credit.
      </p>
      {credit && (
        <AccountingDialog
          title={`Credit note · ${i.number}`}
          action="credit_note"
          close={() => setCredit(false)}
          changed={changed}
          label="Issue credit note"
          build={(form, id) => ({
            id,
            invoiceId: i.id,
            amountCents: formMoney(form),
            reason: formText(form, "reason"),
          })}
        >
          <label>
            Credit amount (rand)
            <input
              name="amount"
              type="number"
              min="0.01"
              max={(i.amount_cents - Number(i.credited_cents || 0)) / 100}
              step="0.01"
              required
            />
          </label>
          <ReasonField />
        </AccountingDialog>
      )}
    </section>
  );
}
