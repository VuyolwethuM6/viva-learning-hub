import { FinancialRecoveryControls } from "./FinancialRecoveryControls";
import { VivaLoader } from "@/components/VivaLoader";
import {
  financeRequest,
  formChecked,
  formMoney,
  formText,
} from "@/lib/accounting-client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { FileDown, Plus, RefreshCw } from "lucide-react";
import type { Application, Snapshot } from "@/lib/admin-types";
import { invoiceBalance, rand } from "@/lib/admin-types";
import type {
  FinanceSnapshot,
  MoneyReceipt,
  SupplierBill,
  ExpenseAttachment,
  Account,
} from "@/lib/accounting-types";
import {
  parseStatementCSV,
  randToCents,
  statementTemplate,
} from "@/lib/accounting-input";
import {
  AccountingDialog,
  MoneyField,
  PaymentDetails,
  PaymentFields,
  ReasonField,
} from "./AccountingForms";
import {
  Badge,
  Dialog,
  DocumentViewer,
  EmptyState,
  type ViewedDocument,
} from "./AdminPrimitives";
import { auditTime } from "@/lib/admin-format";

type FormConfig = {
  title: string;
  action: string;
  fields: ReactNode;
  build: (form: FormData, id: string) => Record<string, unknown>;
  description?: ReactNode;
  summary?: (data: Record<string, unknown>) => ReactNode;
};
type PDFAction = (
  kind: string,
  id: string,
  title: string,
  range?: { from: string; to: string },
) => void;
const paymentData = (f: FormData) => ({
  amountCents: formMoney(f),
  paidOn: formText(f, "paidOn"),
  method: formText(f, "method"),
  reference: formText(f, "reference"),
  note: formText(f, "note"),
});
const moneyValue = (cents: number) => (cents / 100).toFixed(2);
function ReceiptFields({
  snapshot,
  today,
}: {
  snapshot: Snapshot;
  today: string;
}) {
  const [applicationId, setApplicationId] = useState(
    snapshot.applications[0]?.id || "",
  );
  const selected = snapshot.applications.find((a) => a.id === applicationId);
  const eligible = snapshot.invoices.filter(
    (i) =>
      snapshot.applications
        .find((a) => a.id === i.application_id)
        ?.guardian_email.trim()
        .toLowerCase() === selected?.guardian_email.trim().toLowerCase() &&
      invoiceBalance(i) > 0,
  );
  return (
    <>
      <label>
        Learner / family account
        <select
          name="applicationId"
          value={applicationId}
          onChange={(e) => setApplicationId(e.target.value)}
          required
        >
          <option value="" disabled>
            Select an account
          </option>
          {snapshot.applications.map((a) => (
            <option key={a.id} value={a.id}>
              {a.learner_name} · {a.guardian_name}
            </option>
          ))}
        </select>
      </label>
      <PaymentFields today={today} />
      <ReasonField name="note" label="How you verified the funds" />
      <fieldset className="finance-fieldset">
        <legend>Allocate to invoices</legend>
        <p>
          Leave amounts at zero to keep the payment as available family credit.
          One payment can cover several invoices for this guardian.
        </p>
        {eligible.map((i) => (
          <label key={i.id}>
            {i.number} ·{" "}
            {
              snapshot.applications.find((a) => a.id === i.application_id)
                ?.learner_name
            }{" "}
            · {rand(invoiceBalance(i))} owed
            <input
              name={`allocation_${i.id}`}
              type="number"
              min="0"
              max={invoiceBalance(i) / 100}
              step="0.01"
              defaultValue="0"
              inputMode="decimal"
            />
          </label>
        ))}
        {!eligible.length && (
          <p>
            No unpaid invoices for this account. The payment will remain as
            family credit.
          </p>
        )}
      </fieldset>
      <label className="admin-check">
        <input type="checkbox" required />I verified the money was received and
        checked the allocations.
      </label>
    </>
  );
}
function BillFields({ data, today }: { data: FinanceSnapshot; today: string }) {
  const [payNow, setPayNow] = useState(false),
    [supplier, setSupplier] = useState("");
  return (
    <>
      <label>
        Supplier / payee
        <select
          name="supplierId"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        >
          <option value="">Add a supplier / payee</option>
          {data.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {!supplier && (
        <label>
          Supplier / payee name
          <input name="supplierName" required maxLength={200} />
        </label>
      )}
      <label>
        Expense category
        <select name="category" required>
          {data.accounts
            .filter(
              (a) => a.kind === "expense" && a.active && !a.control_account,
            )
            .map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Description
        <input name="description" minLength={5} maxLength={500} required />
      </label>
      <MoneyField />
      <label>
        Bill date
        <input
          name="issuedOn"
          type="date"
          max={today}
          defaultValue={today}
          required
        />
      </label>
      <label>
        Due date
        <input name="dueOn" type="date" defaultValue={today} required />
      </label>
      <label className="admin-check">
        <input
          type="checkbox"
          name="payNow"
          checked={payNow}
          onChange={(e) => setPayNow(e.target.checked)}
        />
        The bill has already been paid in full
      </label>
      {payNow && (
        <>
          <PaymentDetails today={today} />
          <ReasonField name="note" label="Payment verification note" />
          <label className="admin-check">
            <input type="checkbox" required />I verified the supplier payment.
          </label>
        </>
      )}
      <p className="admin-muted">
        Supporting documents can be attached after the expense has been saved.
        An unpaid bill records the expense and the amount owed to the supplier.
      </p>
    </>
  );
}
function JournalFields({
  accounts,
  today,
}: {
  accounts: Account[];
  today: string;
}) {
  const [rows, setRows] = useState([0, 1]);
  return (
    <>
      <label>
        Posting date
        <input
          name="postedOn"
          type="date"
          max={today}
          defaultValue={today}
          required
        />
      </label>
      <ReasonField label="Description and reason" />
      <p>
        Use this for owner funding and reviewed adjustments. Tuition, family
        credit and supplier balances use their dedicated workflows.
      </p>
      {rows.map((n, index) => (
        <fieldset className="finance-fieldset" key={n}>
          <legend>Line {index + 1}</legend>
          <label>
            Account
            <select
              name={`journal_account_${n}`}
              defaultValue={index === 0 ? "1000" : "3000"}
            >
              {accounts
                .filter((a) => !a.control_account && a.active)
                .map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} · {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Entry side
            <select
              name={`journal_side_${n}`}
              defaultValue={index === 0 ? "debit" : "credit"}
            >
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
            </select>
          </label>
          <MoneyField name={`journal_amount_${n}`} />
          {rows.length > 2 && (
            <button
              type="button"
              onClick={() => setRows(rows.filter((v) => v !== n))}
            >
              Remove line
            </button>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        disabled={rows.length >= 20}
        onClick={() => setRows([...rows, Math.max(...rows) + 1])}
      >
        Add journal line
      </button>
    </>
  );
}
function ImportFields({ today }: { today: string }) {
  const [csv, setCSV] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const preview = (() => {
    try {
      return csv ? parseStatementCSV(csv) : [];
    } catch {
      return [];
    }
  })();
  return (
    <>
      <p>
        Use transaction_id,date,description,amount. Dates use YYYY-MM-DD.
        Amounts are signed rand values: positive money in, negative money out.
        Bank transaction IDs must be unique across imports.
      </p>
      <a
        className="admin-button"
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(statementTemplate.replace(/2026-11-0[12]/g, today))}`}
        download="Viva-bank-template.csv"
      >
        Download CSV template
      </a>
      <label>
        Statement CSV
        <input
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setError("");
            setCSV("");
            if (!file) return;
            if (file.size > 1000000) {
              setError("Use a CSV under 1 MB.");
              return;
            }
            const text = await file.text();
            try {
              parseStatementCSV(text);
              setCSV(text);
              setName(file.name);
            } catch (ex) {
              setError(
                ex instanceof Error ? ex.message : "The CSV could not be read.",
              );
            }
          }}
        />
      </label>
      <input type="hidden" name="csv" value={csv} />
      <input type="hidden" name="name" value={name} />
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {preview.length > 0 && (
        <p>
          {preview.length} transactions · Net movement{" "}
          {rand(preview.reduce((n, r) => n + r.amountCents, 0))}. The server
          will verify the file again.
        </p>
      )}
      <label>
        Statement from
        <input name="fromDate" type="date" max={today} required />
      </label>
      <label>
        Statement to
        <input
          name="toDate"
          type="date"
          max={today}
          defaultValue={today}
          required
        />
      </label>
      <MoneyField
        name="opening"
        label="Statement opening balance (rand)"
        value="0.00"
        min="-20000000"
      />
      <MoneyField
        name="closing"
        label="Statement closing balance (rand)"
        min="-20000000"
      />
    </>
  );
}
function Evidence({
  bill,
  changed,
  close,
  onView,
}: {
  bill: SupplierBill;
  changed: () => Promise<unknown>;
  close: () => void;
  onView: (a: ExpenseAttachment) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = (task: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    void task()
      .catch((e) =>
        setError(
          e instanceof Error
            ? e.message
            : "The document could not be confirmed.",
        ),
      )
      .finally(() => setBusy(false));
  };
  return (
    <Dialog
      title={`Expense documents · ${bill.number}`}
      variant="confirm"
      busy={busy}
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="finance-form">
        <p>
          {bill.supplier_name} · {bill.description}
        </p>
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        {bill.attachments.map((a) => (
          <div className="finance-evidence" key={a.id}>
            <strong>{a.name}</strong>
            {a.finalized_at ? (
              <button disabled={busy} onClick={() => run(() => onView(a))}>
                View document
              </button>
            ) : (
              <>
                <p>
                  Upload not yet verified. If the file uploaded but confirmation
                  was interrupted, verify it here.
                </p>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await financeRequest({
                        action: "attachment_finalize",
                        id: a.id,
                      });
                      await changed();
                    })
                  }
                >
                  Verify upload
                </button>
              </>
            )}
          </div>
        ))}
        <label>
          Add supporting PDF / image
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              run(async () => {
                if (
                  file.size > 10485760 ||
                  file.size === 0 ||
                  !["application/pdf", "image/jpeg", "image/png"].includes(
                    file.type,
                  )
                )
                  throw new Error("Use a PDF, JPEG or PNG file up to 10 MB.");
                const result = await financeRequest<{
                  url: string;
                  attachment: ExpenseAttachment;
                }>({
                  action: "attachment_prepare",
                  id: crypto.randomUUID(),
                  billId: bill.id,
                  name: file.name,
                  size: file.size,
                  mime: file.type,
                });
                const uploaded = await fetch(result.url, {
                  method: "PUT",
                  headers: { "Content-Type": file.type },
                  body: file,
                });
                if (!uploaded.ok) {
                  await changed();
                  throw new Error(
                    "The expense is saved, but the file upload was not confirmed. Retry the upload or verify an existing upload.",
                  );
                }
                await financeRequest({
                  action: "attachment_finalize",
                  id: result.attachment.id,
                });
                await changed();
              });
              event.target.value = "";
            }}
          />
        </label>
        <p className="admin-muted">
          Documents stay in private Storage. Adding evidence does not change the
          expense amount.
        </p>
      </div>
    </Dialog>
  );
}

export function FinanceWorkspace({
  initialSection = "Invoices",
  snapshot,
  children,
  changed,
  onPDF,
  user,
}: {
  initialSection?: string;
  snapshot: Snapshot;
  children: ReactNode;
  changed: () => Promise<unknown>;
  onPDF: PDFAction;
  user: { id: string; email: string };
}) {
  const [section, setSection] = useState(initialSection),
    [data, setData] = useState<FinanceSnapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState("");
  const [from, setFrom] = useState(`${snapshot.today.slice(0, 4)}-01-01`),
    [to, setTo] = useState(snapshot.today),
    [query, setQuery] = useState("");
  const [form, setForm] = useState<FormConfig | null>(null),
    [evidenceId, setEvidenceId] = useState<string | null>(null),
    [viewer, setViewer] = useState<ViewedDocument | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await financeRequest<FinanceSnapshot>(
        undefined,
        `?from=${from}&to=${to}`,
      );
      if (
        !Array.isArray(result.accounts) ||
        !Array.isArray(result.journals) ||
        !result.reports
      )
        throw new Error(
          "Accounting is unavailable. Check that the accounting migrations have been applied, then refresh.",
        );
      setData(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accounting could not load.");
      throw e;
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    void load().catch(() => {});
  }, [load]);
  const reload = async () => {
    await changed();
    await load();
    setNotice("Saved. Review Notifications for any prepared messages.");
  };
  const canWrite = data?.role !== "viewer",
    owner = data?.role === "owner",
    today = snapshot.today;
  const openReceipt = () =>
    setForm({
      title: "Record money received",
      action: "receipt",
      fields: <ReceiptFields snapshot={snapshot} today={today} />,
      build: (f, id) => ({
        id,
        applicationId: formText(f, "applicationId"),
        ...paymentData(f),
        allocations: Array.from(f.entries())
          .filter(
            ([key, value]) =>
              key.startsWith("allocation_") && Number(value) > 0,
          )
          .map(([key]) => ({
            invoiceId: key.slice("allocation_".length),
            amountCents: formMoney(f, key),
          })),
      }),
      summary: (p) => (
        <>
          <p>
            {
              snapshot.applications.find((a) => a.id === p.applicationId)
                ?.guardian_name
            }{" "}
            · {rand(p.amountCents as number)} by {String(p.method)}.
          </p>
          <p>
            Reference: {String(p.reference)} · Paid {String(p.paidOn)}
          </p>
          {(p.allocations as { invoiceId: string; amountCents: number }[]).map(
            (a) => (
              <p key={a.invoiceId}>
                {snapshot.invoices.find((i) => i.id === a.invoiceId)?.number}:{" "}
                {rand(a.amountCents)}
              </p>
            ),
          )}
          <p>Any unallocated amount remains available family credit.</p>
        </>
      ),
    });
  const corrective = (
    action: string,
    title: string,
    ids: Record<string, string>,
    description: string,
  ) =>
    setForm({
      title,
      action,
      description: <p>{description}</p>,
      fields: <ReasonField />,
      build: (f) => ({ ...ids, reason: formText(f, "reason") }),
    });
  const showReceipt = (r: MoneyReceipt) =>
    onPDF("account_receipt", r.id, `Receipt ${r.number}`);
  const viewEvidence = async (a: ExpenseAttachment): Promise<void> => {
    const get = async (): Promise<ViewedDocument> => {
      const result = await financeRequest<{ url: string }>({
        action: "attachment_view",
        id: a.id,
      });
      return {
        title: a.name,
        url: result.url,
        mime: a.mime,
        filename: a.name,
        downloadUrl: `/api/admin/accounting?file=${a.id}`,
        expiresAt: Date.now() + 55000,
        refresh: get,
      };
    };
    setViewer(await get());
  };
  const evidence = data?.bills.find((b) => b.id === evidenceId);
  const matches = (value: string) =>
    value.toLowerCase().includes(query.toLowerCase());
  return (
    <div className="finance-workspace">
      <nav className="finance-tabs" aria-label="Finance sections">
        {[
          "Invoices",
          "Family accounts",
          "Receipts & credits",
          "Expenses",
          "Bank & cash",
          "Ledger",
          "Reports",
          "Controls",
        ].map((name) => (
          <button
            key={name}
            aria-current={section === name ? "page" : undefined}
            onClick={() => {
              setSection(name);
              setQuery("");
              setNotice("");
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className="finance-service-bar">
        <span>ZAR · No VAT · EFT / Cash · February–November tuition</span>
        <button disabled={loading} onClick={() => void load().catch(() => {})}>
          {loading ? (
            <VivaLoader size="button" decorative />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh accounts
        </button>
      </div>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      {section === "Invoices" && children}
      {section !== "Invoices" && !data && (
        <section className="admin-card">
          {loading ? (
            <VivaLoader label="Loading accounting records…" />
          ) : (
            <EmptyState title="Accounting is not available yet">
              Apply the accounting migrations and refresh to use this workspace.
            </EmptyState>
          )}
        </section>
      )}
      {data && section !== "Invoices" && (
        <>
          {Object.entries(data.limits).some(([, limited]) => limited) && (
            <p className="admin-notice">
              Some record lists are limited to recent entries. Reports and
              account totals use the complete ledger; narrow the report dates
              for ledger exports.
            </p>
          )}
          {[
            "Family accounts",
            "Receipts & credits",
            "Expenses",
            "Ledger",
          ].includes(section) && (
            <label className="finance-search">
              <span>Search {section.toLowerCase()}</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, reference or document number"
              />
            </label>
          )}
          {section === "Family accounts" && (
            <section className="admin-card">
              <div className="card-heading">
                <h2>Family accounts</h2>
                {canWrite && (
                  <button className="admin-primary" onClick={openReceipt}>
                    <Plus size={16} />
                    Record money received
                  </button>
                )}
              </div>
              <p className="admin-muted">
                Invoices remain per learner. Family payments and available
                credit can cover siblings using the same guardian account.
              </p>
              <div className="finance-records">
                {data.families
                  .filter((f) => matches(`${f.name} ${f.email} ${f.learners}`))
                  .map((f) => (
                    <article key={f.email}>
                      <div>
                        <h3>{f.name}</h3>
                        <p>{f.email}</p>
                        <small>{f.learners}</small>
                      </div>
                      <dl>
                        <div>
                          <dt>Invoices outstanding</dt>
                          <dd>{rand(f.owed_cents)}</dd>
                        </div>
                        <div>
                          <dt>Available family credit</dt>
                          <dd>{rand(f.credit_cents)}</dd>
                        </div>
                      </dl>
                      <button
                        onClick={() =>
                          onPDF(
                            "statement",
                            f.application_id,
                            "Family account statement",
                            { from: data.settings.books_start, to: today },
                          )
                        }
                      >
                        View account statement
                      </button>
                    </article>
                  ))}
              </div>
              {!data.families.length && (
                <EmptyState title="No family accounts yet">
                  Submit an enrollment to create the first learner account.
                </EmptyState>
              )}
            </section>
          )}
          {section === "Receipts & credits" && (
            <>
              <section className="admin-card">
                <div className="card-heading">
                  <h2>Money received</h2>
                  {canWrite && (
                    <button className="admin-primary" onClick={openReceipt}>
                      Record money received
                    </button>
                  )}
                </div>
                <p className="admin-muted">
                  Each entry is one physical EFT or cash payment. Allocating an
                  existing credit records no additional money.
                </p>
                <div className="finance-records">
                  {data.receipts
                    .filter((r) =>
                      matches(`${r.payer_name} ${r.number} ${r.reference}`),
                    )
                    .map((r) => (
                      <article key={r.id}>
                        <div className="finance-record-heading">
                          <div>
                            <h3>{r.number}</h3>
                            <p>
                              {r.payer_name} · {r.method} · {r.paid_on}
                            </p>
                            <small>{r.reference}</small>
                          </div>
                          <Badge value={r.reversed_at ? "reversed" : "paid"} />
                        </div>
                        <strong className="finance-amount">
                          {rand(r.amount_cents)}
                        </strong>
                        <p>
                          Available credit: <b>{rand(r.available_cents)}</b>
                        </p>
                        {r.allocations.map((a) => (
                          <small key={a.id}>
                            {a.invoiceNumber}: {rand(a.netCents)} currently
                            allocated
                            {a.netCents !== a.amountCents
                              ? ` (${rand(a.amountCents)} originally)`
                              : ""}
                          </small>
                        ))}
                        <div className="finance-action-row">
                          <button onClick={() => showReceipt(r)}>
                            View receipt
                          </button>
                          {canWrite && !r.reversed_at && (
                            <>
                              {r.available_cents > 0 && (
                                <>
                                  <button
                                    onClick={() =>
                                      setForm({
                                        title: `Allocate credit · ${r.number}`,
                                        action: "allocate",
                                        fields: (
                                          <>
                                            <label>
                                              Invoice
                                              <select name="invoiceId" required>
                                                {snapshot.invoices
                                                  .filter(
                                                    (i) =>
                                                      invoiceBalance(i) > 0 &&
                                                      snapshot.applications
                                                        .find(
                                                          (a) =>
                                                            a.id ===
                                                            i.application_id,
                                                        )
                                                        ?.guardian_email.trim()
                                                        .toLowerCase() ===
                                                        r.billing_email,
                                                  )
                                                  .map((i) => (
                                                    <option
                                                      key={i.id}
                                                      value={i.id}
                                                    >
                                                      {i.number} ·{" "}
                                                      {rand(invoiceBalance(i))}{" "}
                                                      owed
                                                    </option>
                                                  ))}
                                              </select>
                                            </label>
                                            <MoneyField
                                              value={moneyValue(
                                                r.available_cents,
                                              )}
                                            />
                                          </>
                                        ),
                                        build: (f, id) => ({
                                          id,
                                          receiptId: r.id,
                                          invoiceId: formText(f, "invoiceId"),
                                          amountCents: formMoney(f),
                                        }),
                                      })
                                    }
                                  >
                                    Allocate credit
                                  </button>
                                  <button
                                    onClick={() =>
                                      setForm({
                                        title: `Refund · ${r.number}`,
                                        action: "refund",
                                        description: (
                                          <p>
                                            Available credit:{" "}
                                            {rand(r.available_cents)}. Verify
                                            the actual outgoing payment before
                                            recording the refund.
                                          </p>
                                        ),
                                        fields: (
                                          <>
                                            <PaymentFields
                                              today={today}
                                              amount={moneyValue(
                                                r.available_cents,
                                              )}
                                            />
                                            <ReasonField />
                                            <label className="admin-check">
                                              <input type="checkbox" required />
                                              I verified the refund was paid.
                                            </label>
                                          </>
                                        ),
                                        build: (f, id) => ({
                                          id,
                                          receiptId: r.id,
                                          ...paymentData(f),
                                          reason: formText(f, "reason"),
                                        }),
                                      })
                                    }
                                  >
                                    Record refund
                                  </button>
                                </>
                              )}
                              <button
                                className="admin-danger"
                                onClick={() =>
                                  corrective(
                                    "reverse_receipt",
                                    `Reverse receipt ${r.number}`,
                                    { receiptId: r.id },
                                    "Correct a payment recorded in error. Allocations will return to invoices and the money receipt will be reversed. Reverse any refunds and unmatch bank entries first.",
                                  )
                                }
                              >
                                Reverse receipt
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                </div>
                {!data.receipts.length && (
                  <EmptyState title="No money recorded yet">
                    Record a verified EFT or cash payment here, or allocate a
                    payment from an invoice.
                  </EmptyState>
                )}
              </section>
              <section className="admin-card">
                <h2>Credit notes</h2>
                <p className="admin-muted">
                  Issue a credit note from its invoice in the Invoice register.
                </p>
                <div className="finance-records">
                  {data.credit_notes.map((c) => (
                    <article key={c.id}>
                      <h3>{c.number}</h3>
                      <p>
                        {c.learner_name} · {c.invoice_number} ·{" "}
                        {rand(c.amount_cents)}
                      </p>
                      <p>{c.reason}</p>
                      <button
                        onClick={() =>
                          onPDF("credit_note", c.id, `Credit note ${c.number}`)
                        }
                      >
                        View credit note
                      </button>
                      {c.reversed_at ? (
                        <Badge value="reversed" />
                      ) : (
                        canWrite && (
                          <button
                            onClick={() =>
                              corrective(
                                "reverse_credit_note",
                                "Reverse credit note",
                                { creditNoteId: c.id },
                                "Restore the invoice charge with an opposite accounting entry. Released family credit stays available for allocation; no new cash is received.",
                              )
                            }
                          >
                            Reverse credit note
                          </button>
                        )
                      )}
                    </article>
                  ))}
                </div>
                {!data.credit_notes.length && (
                  <p className="admin-muted">No credit notes issued.</p>
                )}
              </section>
              <section className="admin-card">
                <h2>Refunds</h2>
                <div className="finance-records">
                  {data.refunds.map((f) => (
                    <article key={f.id}>
                      <h3>{f.number}</h3>
                      <p>
                        {f.payer_name} · {rand(f.amount_cents)} · {f.method} ·{" "}
                        {f.paid_on}
                      </p>
                      <p>
                        {f.reference} · {f.reason}
                      </p>
                      {f.reversed_at && <Badge value="reversed" />}
                      <div className="finance-action-row">
                        <button
                          onClick={() =>
                            onPDF("refund", f.id, `Refund ${f.number}`)
                          }
                        >
                          View refund record
                        </button>
                        {canWrite && !f.reversed_at && (
                          <button
                            onClick={() =>
                              corrective(
                                "reverse_refund",
                                "Reverse refund",
                                { refundId: f.id },
                                "Correct a refund recorded in error. This changes the books; it does not initiate a bank transfer.",
                              )
                            }
                          >
                            Reverse refund
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                {!data.refunds.length && (
                  <p className="admin-muted">No refunds recorded.</p>
                )}
              </section>
            </>
          )}
          {section === "Expenses" && (
            <section className="admin-card">
              <div className="card-heading">
                <h2>Expenses and supplier bills</h2>
                {canWrite && (
                  <button
                    className="admin-primary"
                    onClick={() =>
                      setForm({
                        title: "Record expense / supplier bill",
                        action: "bill",
                        fields: <BillFields data={data} today={today} />,
                        build: (f, id) => ({
                          id,
                          supplierId: formText(f, "supplierId"),
                          supplierName: formText(f, "supplierName"),
                          category: formText(f, "category"),
                          description: formText(f, "description"),
                          amountCents: formMoney(f),
                          issuedOn: formText(f, "issuedOn"),
                          dueOn: formText(f, "dueOn"),
                          payNow: formChecked(f, "payNow"),
                          ...(formChecked(f, "payNow")
                            ? {
                                paidOn: formText(f, "paidOn"),
                                method: formText(f, "method"),
                                reference: formText(f, "reference"),
                                note: formText(f, "note"),
                              }
                            : {}),
                        }),
                      })
                    }
                  >
                    Record expense
                  </button>
                )}
              </div>
              <div className="finance-records">
                {data.bills
                  .filter((b) =>
                    matches(`${b.number} ${b.supplier_name} ${b.description}`),
                  )
                  .map((b) => (
                    <article key={b.id}>
                      <div className="finance-record-heading">
                        <div>
                          <h3>
                            {b.number} · {b.supplier_name}
                          </h3>
                          <p>{b.description}</p>
                          <small>
                            {
                              data.accounts.find((a) => a.code === b.category)
                                ?.name
                            }{" "}
                            · Bill {b.issued_on} · Due {b.due_on}
                          </small>
                        </div>
                        <Badge
                          value={
                            b.reversed_at
                              ? "reversed"
                              : b.paid_cents >= b.amount_cents
                                ? "paid"
                                : "unpaid"
                          }
                        />
                      </div>
                      <p>
                        Total {rand(b.amount_cents)} · Paid {rand(b.paid_cents)}{" "}
                        · Outstanding{" "}
                        {rand(
                          b.reversed_at ? 0 : b.amount_cents - b.paid_cents,
                        )}
                      </p>
                      <div className="finance-action-row">
                        <button onClick={() => setEvidenceId(b.id)}>
                          Supporting documents ({b.attachments.length})
                        </button>
                        {canWrite && !b.reversed_at && (
                          <>
                            {b.paid_cents < b.amount_cents && (
                              <button
                                onClick={() =>
                                  setForm({
                                    title: `Pay supplier · ${b.number}`,
                                    action: "pay_bill",
                                    fields: (
                                      <>
                                        <PaymentFields
                                          today={today}
                                          amount={moneyValue(
                                            b.amount_cents - b.paid_cents,
                                          )}
                                        />
                                        <ReasonField
                                          name="note"
                                          label="Payment verification note"
                                        />
                                      </>
                                    ),
                                    build: (f, id) => ({
                                      id,
                                      billId: b.id,
                                      ...paymentData(f),
                                    }),
                                  })
                                }
                              >
                                Record supplier payment
                              </button>
                            )}
                            <button
                              className="admin-danger"
                              onClick={() =>
                                corrective(
                                  "reverse_bill",
                                  "Reverse supplier bill",
                                  { billId: b.id },
                                  "Reverse its payments first. The original expense and its correction remain in the ledger.",
                                )
                              }
                            >
                              Reverse bill
                            </button>
                          </>
                        )}
                      </div>
                      {b.payments.map((p) => (
                        <div className="finance-payment-row" key={p.id}>
                          <p>
                            {rand(p.amount_cents)} · {p.paid_on} · {p.method} ·{" "}
                            {p.reference}
                            {p.reversed_at ? " · Reversed" : ""}
                          </p>
                          {canWrite && !p.reversed_at && (
                            <button
                              onClick={() =>
                                corrective(
                                  "reverse_bill_payment",
                                  "Reverse supplier payment",
                                  { paymentId: p.id },
                                  "Correct a supplier payment recorded in error. Unmatch any bank reconciliation first.",
                                )
                              }
                            >
                              Reverse payment
                            </button>
                          )}
                        </div>
                      ))}
                    </article>
                  ))}
              </div>
              {!data.bills.length && (
                <EmptyState title="No expenses yet">
                  Record tutor payments, rent, internet, printing and other
                  operating costs, whether already paid or still owed.
                </EmptyState>
              )}
            </section>
          )}
          {section === "Bank & cash" && (
            <>
              <div className="finance-balance-grid">
                <section className="admin-card">
                  <span>Bank balance · {data.asOf}</span>
                  <strong>{rand(data.reports.bankCents)}</strong>
                </section>
                <section className="admin-card">
                  <span>Cash on hand · {data.asOf}</span>
                  <strong>{rand(data.reports.cashCents)}</strong>
                </section>
              </div>
              <section className="admin-card">
                <h2>Bank and cash movements</h2>
                <p>
                  Depositing cash moves money between cash on hand and the bank.
                  It creates no additional tuition income.
                </p>
                {canWrite && (
                  <div className="finance-action-row">
                    <button
                      onClick={() =>
                        setForm({
                          title: "Record cash deposited into bank",
                          action: "cash_deposit",
                          fields: (
                            <>
                              <MoneyField />
                              <label>
                                Deposit date
                                <input
                                  name="postedOn"
                                  type="date"
                                  max={today}
                                  defaultValue={today}
                                  required
                                />
                              </label>
                              <ReasonField label="Bank deposit reference and verification" />
                            </>
                          ),
                          build: (f) => ({
                            amountCents: formMoney(f),
                            postedOn: formText(f, "postedOn"),
                            reason: formText(f, "reason"),
                          }),
                        })
                      }
                    >
                      Record cash deposit
                    </button>
                    <button
                      onClick={() =>
                        setForm({
                          title: "Record cash withdrawn from bank",
                          action: "cash_withdrawal",
                          fields: (
                            <>
                              <MoneyField />
                              <label>
                                Withdrawal date
                                <input
                                  type="date"
                                  name="postedOn"
                                  max={today}
                                  defaultValue={today}
                                  required
                                />
                              </label>
                              <ReasonField label="Bank withdrawal reference and cash verification" />
                            </>
                          ),
                          build: (f) => ({
                            amountCents: formMoney(f),
                            postedOn: formText(f, "postedOn"),
                            reason: formText(f, "reason"),
                          }),
                        })
                      }
                    >
                      Record bank cash withdrawal
                    </button>
                    <button
                      onClick={() =>
                        setForm({
                          title: "Import bank statement",
                          action: "bank_import",
                          fields: <ImportFields today={today} />,
                          build: (f) => {
                            const csv = formText(f, "csv");
                            parseStatementCSV(csv);
                            return {
                              csv,
                              name: formText(f, "name"),
                              fromDate: formText(f, "fromDate"),
                              toDate: formText(f, "toDate"),
                              openingCents: randToCents(
                                formText(f, "opening"),
                                true,
                              ),
                              closingCents: randToCents(
                                formText(f, "closing"),
                                true,
                              ),
                            };
                          },
                          summary: (p) => (
                            <p>
                              Import {parseStatementCSV(p.csv as string).length}{" "}
                              bank transactions for {String(p.fromDate)} to{" "}
                              {String(p.toDate)}. Opening{" "}
                              {rand(p.openingCents as number)}; closing{" "}
                              {rand(p.closingCents as number)}.
                            </p>
                          ),
                        })
                      }
                    >
                      Import statement CSV
                    </button>
                  </div>
                )}
              </section>
              <section className="admin-card">
                <h2>Statement reconciliation</h2>
                <p className="admin-muted">
                  Match an existing receipt, supplier payment, refund or deposit
                  with the same signed bank amount. Record missing transactions
                  first; matching does not create income or expense.
                </p>
                <details className="finance-bank-timing">
                  <summary>Bank entries awaiting clearing</summary>
                  <p className="admin-muted">
                    Use a verified clearing-date difference when a recorded
                    deposit or payment appears on a later bank statement. This
                    records a reconciliation explanation and does not move
                    money.
                  </p>
                  {data.bank_candidates.map((j) => (
                    <div className="finance-payment-row" key={j.id}>
                      <p>
                        {j.posted_on} · {j.description} · {rand(j.amount_cents)}
                      </p>
                      {canWrite && (
                        <button
                          onClick={() =>
                            setForm({
                              title: "Record bank clearing difference",
                              action: "bank_timing",
                              fields: (
                                <>
                                  <p>
                                    {j.description} · {rand(j.amount_cents)}
                                  </p>
                                  <label>
                                    Expected bank clearing date
                                    <input
                                      name="expectedOn"
                                      type="date"
                                      min={j.posted_on}
                                      required
                                    />
                                  </label>
                                  <ReasonField label="Evidence and timing explanation" />
                                </>
                              ),
                              build: (f) => ({
                                journalId: j.id,
                                expectedOn: formText(f, "expectedOn"),
                                reason: formText(f, "reason"),
                              }),
                            })
                          }
                        >
                          Record clearing-date difference
                        </button>
                      )}
                    </div>
                  ))}
                  {data.bank_timing.map((t) => (
                    <div className="finance-payment-row" key={t.id}>
                      <p>
                        {t.description} · {rand(t.amount_cents)} · Expected{" "}
                        {t.expected_on}
                      </p>
                      <p>{t.reason}</p>
                      <Badge
                        value={
                          t.withdrawn_at
                            ? "cancelled"
                            : t.cleared_on
                              ? "matched"
                              : "unmatched"
                        }
                      />
                      {canWrite && !t.withdrawn_at && !t.cleared_on && (
                        <button
                          onClick={() =>
                            corrective(
                              "bank_timing_remove",
                              "Withdraw clearing difference",
                              { journalId: t.journal_id },
                              "Remove an incorrect timing explanation. The history is retained; closing checks will require the bank entry to be reconciled or explained again.",
                            )
                          }
                        >
                          Withdraw explanation
                        </button>
                      )}
                    </div>
                  ))}
                </details>
                {data.bank_batches.map((b) => (
                  <p className="finance-batch" key={b.id}>
                    {b.name} · {b.from_date}–{b.to_date} · Closing{" "}
                    {rand(b.closing_cents)} · {b.unmatched_count} of{" "}
                    {b.row_count} unmatched
                    {b.voided_at
                      ? ` · Voided: ${b.void_reason}`
                      : canWrite && (
                          <button
                            onClick={() =>
                              corrective(
                                "bank_void_import",
                                "Void statement import",
                                { batchId: b.id },
                                "Unmatch all its rows first. The import and its reason stay in history, and the corrected statement can then be imported.",
                              )
                            }
                          >
                            Void import
                          </button>
                        )}
                  </p>
                ))}
                <div className="finance-records">
                  {data.bank_lines.map((l) => (
                    <article key={l.id}>
                      <h3>
                        {l.external_id} · {rand(l.amount_cents)}
                      </h3>
                      <p>
                        {l.posted_on} · {l.description}
                      </p>
                      <Badge
                        value={l.matched_journal_id ? "matched" : "unmatched"}
                      />
                      {canWrite &&
                        (l.matched_journal_id ? (
                          <button
                            onClick={() =>
                              corrective(
                                "bank_unmatch",
                                "Unmatch bank transaction",
                                { lineId: l.id },
                                "The previous match stays in reconciliation history. Closed periods must be reopened first.",
                              )
                            }
                          >
                            Unmatch with reason
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              setForm({
                                title: `Match ${l.external_id}`,
                                action: "bank_match",
                                fields: (
                                  <>
                                    <p>
                                      {l.description} · {rand(l.amount_cents)}
                                    </p>
                                    <label>
                                      Existing bank ledger entry
                                      <select name="journalId" required>
                                        <option value="">
                                          Select the matching transaction
                                        </option>
                                        {data.bank_candidates
                                          .filter(
                                            (j) =>
                                              Number(j.amount_cents) ===
                                              Number(l.amount_cents),
                                          )
                                          .map((j) => (
                                            <option key={j.id} value={j.id}>
                                              {j.posted_on} · {j.description} ·{" "}
                                              {rand(j.amount_cents)}
                                            </option>
                                          ))}
                                      </select>
                                    </label>
                                    <ReasonField label="How you verified the match" />
                                  </>
                                ),
                                build: (f) => ({
                                  lineId: l.id,
                                  journalId: formText(f, "journalId"),
                                  reason: formText(f, "reason"),
                                }),
                              })
                            }
                          >
                            Match existing entry
                          </button>
                        ))}
                    </article>
                  ))}
                </div>
                {!data.bank_lines.length && (
                  <EmptyState title="No bank statement imported">
                    Import a statement to compare the bank's records with your
                    books.
                  </EmptyState>
                )}
              </section>
            </>
          )}
          {section === "Ledger" && (
            <section className="admin-card">
              <div className="card-heading">
                <h2>Posted ledger</h2>
                {owner && (
                  <button
                    onClick={() =>
                      setForm({
                        title: "Post reviewed journal",
                        action: "journal",
                        fields: (
                          <JournalFields
                            accounts={data.accounts}
                            today={today}
                          />
                        ),
                        build: (f) => ({
                          postedOn: formText(f, "postedOn"),
                          reason: formText(f, "reason"),
                          lines: Array.from(f.keys())
                            .filter((k) => k.startsWith("journal_account_"))
                            .map((k) => {
                              const n = k.slice("journal_account_".length);
                              return {
                                account: formText(f, k),
                                cents:
                                  formMoney(f, `journal_amount_${n}`) *
                                  (formText(f, `journal_side_${n}`) === "credit"
                                    ? -1
                                    : 1),
                              };
                            }),
                        }),
                        summary: (p) => (
                          <>
                            <p>
                              {String(p.reason)} · {String(p.postedOn)}
                            </p>
                            {(
                              p.lines as { account: string; cents: number }[]
                            ).map((l, index) => (
                              <p key={index}>
                                {l.account}{" "}
                                {
                                  data.accounts.find(
                                    (a) => a.code === l.account,
                                  )?.name
                                }
                                : {l.cents > 0 ? "Debit" : "Credit"}{" "}
                                {rand(Math.abs(l.cents))}
                              </p>
                            ))}
                          </>
                        ),
                      })
                    }
                  >
                    Post journal / owner funding
                  </button>
                )}
              </div>
              <ReportDates
                from={from}
                to={to}
                setFrom={setFrom}
                setTo={setTo}
              />
              <ExportLink kind="ledger" from={from} to={to} />
              <div className="finance-records">
                {data.journals
                  .filter((j) =>
                    matches(
                      `${j.description} ${j.actor_email} ${j.source_kind}`,
                    ),
                  )
                  .map((j) => (
                    <article key={j.id}>
                      <h3>{j.description}</h3>
                      <p>
                        {j.posted_on} · {j.actor_email}
                      </p>
                      {j.reversed_by && <Badge value="reversed" />}
                      <div className="finance-table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Account</th>
                              <th>Debit</th>
                              <th>Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {j.lines.map((l, index) => (
                              <tr key={index}>
                                <td>
                                  {l.account} · {l.name}
                                </td>
                                <td>{l.cents > 0 ? rand(l.cents) : "—"}</td>
                                <td>{l.cents < 0 ? rand(-l.cents) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {owner &&
                        !j.reversed_by &&
                        ["manual", "transfer"].includes(j.source_kind) && (
                          <button
                            onClick={() =>
                              corrective(
                                "reverse_journal",
                                "Reverse journal",
                                { journalId: j.id },
                                "The original journal will remain visible with an opposite entry dated today.",
                              )
                            }
                          >
                            Reverse journal
                          </button>
                        )}
                    </article>
                  ))}
              </div>
              {!data.journals.length && (
                <EmptyState title="No ledger entries in this range">
                  Financial activity posts here automatically. Change the report
                  dates to see other periods.
                </EmptyState>
              )}
            </section>
          )}
          {section === "Reports" && (
            <>
              <section className="admin-card">
                <div className="card-heading">
                  <h2>Financial reports</h2>
                  <button
                    onClick={() =>
                      onPDF(
                        "financial_report",
                        user.id,
                        "Viva financial report",
                        { from, to },
                      )
                    }
                  >
                    <FileDown size={16} />
                    View report PDF
                  </button>
                </div>
                <ReportDates
                  from={from}
                  to={to}
                  setFrom={setFrom}
                  setTo={setTo}
                />
                <button
                  onClick={() => {
                    setFrom(`${today.slice(0, 4)}-02-01`);
                    setTo(`${today.slice(0, 4)}-11-30`);
                  }}
                >
                  February–November season
                </button>
                <p className="admin-muted">
                  Balance-sheet and ageing figures are as of {data.asOf}. Income
                  follows earned tuition, not the date a family pays. Bank and
                  cash are separate from profit.
                </p>
                <p>
                  Earned tuition updated through{" "}
                  {data.settings.recognised_through || "not yet run"}.
                </p>
                {canWrite && (
                  <button
                    onClick={() =>
                      setForm({
                        title: "Update earned tuition",
                        action: "recognise",
                        description: (
                          <p>
                            Recognise tuition using each invoice's saved
                            programme dates. This posts any newly earned amount
                            once; reruns do not duplicate income.
                          </p>
                        ),
                        fields: (
                          <label>
                            Recognise through
                            <input
                              type="date"
                              name="throughDate"
                              max={today}
                              defaultValue={data.asOf}
                              required
                            />
                          </label>
                        ),
                        build: (f) => ({
                          throughDate: formText(f, "throughDate"),
                        }),
                      })
                    }
                  >
                    Update earned tuition
                  </button>
                )}
              </section>
              <section className="admin-card">
                <h2>Profit and loss</h2>
                <Totals
                  rows={[
                    ["Tuition and other income", data.reports.incomeCents],
                    ["Operating expenses", data.reports.expenseCents],
                    ["Net profit / loss", data.reports.profitCents],
                  ]}
                />
                <div className="finance-report-lines">
                  {data.accounts
                    .filter(
                      (a) =>
                        ["income", "expense"].includes(a.kind) &&
                        a.period_net_cents !== 0,
                    )
                    .map((a) => (
                      <p key={a.code}>
                        <span>{a.name}</span>
                        <strong>
                          {rand(
                            a.kind === "income"
                              ? -a.period_net_cents
                              : a.period_net_cents,
                          )}
                        </strong>
                      </p>
                    ))}
                </div>
                <ExportLink kind="profit_loss" from={from} to={to} />
              </section>
              <section className="admin-card">
                <h2>Balance sheet</h2>
                <Totals
                  rows={[
                    ["Assets", data.reports.assetsCents],
                    ["Liabilities", data.reports.liabilitiesCents],
                    ["Capital / equity", data.reports.equityCents],
                    ["Accumulated result", data.reports.accumulatedResultCents],
                  ]}
                />
                <p>
                  Balance check: {rand(data.reports.balanceSheetDifference)}
                </p>
                <p className="admin-muted">
                  Assets should equal liabilities, capital and the accumulated
                  result. The chart below shows the individual account balances.
                </p>
              </section>
              <section className="admin-card">
                <h2>Cash movements</h2>
                <Totals
                  rows={[
                    ["Opening bank and cash", data.reports.cashOpeningCents],
                    ["External money in", data.reports.cashInCents],
                    ["External money out", data.reports.cashOutCents],
                    [
                      "Closing bank and cash",
                      data.reports.bankCents + data.reports.cashCents,
                    ],
                  ]}
                />
                <p className="admin-muted">
                  Transfers between bank and cash are excluded from external
                  inflows and outflows.
                </p>
              </section>
              <section className="admin-card">
                <h2>Debtor ageing</h2>
                <ExportLink kind="ageing" from={from} to={to} />
                <div className="finance-records">
                  {data.ageing.map((a) => (
                    <article key={a.id}>
                      <h3>
                        {a.number} · {a.learner_name}
                      </h3>
                      <p>
                        {a.bucket} · Due {a.due_date} · {rand(a.balance_cents)}
                      </p>
                    </article>
                  ))}
                </div>
                {!data.ageing.length && (
                  <p>No outstanding invoices at this reporting date.</p>
                )}
              </section>
              <section className="admin-card">
                <h2>Trial balance and chart of accounts</h2>
                <ExportLink kind="trial_balance" from={from} to={to} />
                <div className="finance-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Type</th>
                        <th>Debit</th>
                        <th>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.accounts.map((a) => (
                        <tr key={a.code}>
                          <td>
                            {a.code} · {a.name}
                          </td>
                          <td>{a.kind}</td>
                          <td>
                            {a.balance_cents > 0 ? rand(a.balance_cents) : "—"}
                          </td>
                          <td>
                            {a.balance_cents < 0 ? rand(-a.balance_cents) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  Trial balance difference: {rand(data.integrity.trialBalance)}
                </p>
              </section>
            </>
          )}
          {section === "Controls" && (
            <>
              <FinancialRecoveryControls
                today={snapshot.today}
                booksStart={data.settings.books_start}
                changed={async () => {
                  await load();
                  await changed();
                }}
              />
              <section className="admin-card">
                <h2>Accounting controls</h2>
                <p>
                  Your finance role: <b>{data.role}</b>. Books start{" "}
                  {data.settings.books_start}. Closed through{" "}
                  {data.settings.closed_through || "no periods closed"}.
                </p>
                <p>
                  Opening balances are zero. ZAR; no VAT. Tuition invoices run
                  February–November; bank/cash and expenses remain available all
                  year.
                </p>
                <h3>Current ledger reconciliation</h3>
                <Totals
                  rows={Object.entries(data.integrity).map(([k, v]) => [
                    {
                      receivableDifference: "Tuition receivables difference",
                      creditDifference: "Family credit difference",
                      deferredDifference: "Deferred tuition difference",
                      payableDifference: "Supplier payables difference",
                      trialBalance: "Trial balance difference",
                    }[k] || k,
                    v,
                  ])}
                />
                <p className="admin-muted">
                  Every difference should be zero. These checks compare the
                  complete ledger with the underlying financial records.
                </p>
              </section>
              <section className="admin-card">
                <h2>Billing runs and email dispatch</h2>
                <p>
                  Scheduled accounting:{" "}
                  <b>
                    {data.settings.automation_enabled ? "Enabled" : "Disabled"}
                  </b>{" "}
                  · Automatic email dispatch:{" "}
                  <b>{data.settings.auto_send ? "Enabled" : "Disabled"}</b>.
                </p>
                <p>
                  Billing prepares the next eligible month's invoices from the
                  25th. Unpaid reminders start from the 3rd and respect current
                  arrangements. December/January tuition invoices are skipped.
                  Ambiguous email attempts stay for manual review.
                </p>
                {owner && (
                  <div className="finance-action-row">
                    <button
                      disabled={loading}
                      onClick={() => {
                        setLoading(true);
                        setError("");
                        void financeRequest<{
                          sent?: number;
                          stale?: number;
                          dispatch?: string;
                        }>({ action: "run_schedule" })
                          .then(async (r) => {
                            await changed();
                            await load();
                            setNotice(
                              `Accounting run completed. ${r.sent || 0} notifications processed.${r.stale ? ` ${r.stale} older notices need balance review.` : ""}${r.dispatch ? ` Dispatch: ${r.dispatch}` : ""}`,
                            );
                          })
                          .catch((e) => setError(e.message))
                          .finally(() => setLoading(false));
                      }}
                    >
                      Run scheduled work now
                    </button>
                    <button
                      onClick={() =>
                        setForm({
                          title: "Accounting automation settings",
                          action: "settings",
                          fields: (
                            <>
                              <label>
                                Books start date
                                <input
                                  name="booksStart"
                                  type="date"
                                  max={today}
                                  defaultValue={data.settings.books_start}
                                  required
                                />
                              </label>
                              <p>
                                The books start date cannot change after posting
                                begins.
                              </p>
                              <label className="admin-check">
                                <input
                                  type="checkbox"
                                  name="automationEnabled"
                                  defaultChecked={
                                    data.settings.automation_enabled
                                  }
                                />
                                Enable configured scheduled accounting
                              </label>
                              <label className="admin-check">
                                <input
                                  type="checkbox"
                                  name="autoSend"
                                  defaultChecked={data.settings.auto_send}
                                />
                                Automatically send never-attempted queued
                                messages
                              </label>
                              <p>
                                Configure the scheduler and verified email
                                service before enabling these settings.
                                Previously attempted emails always require
                                manual review.
                              </p>
                            </>
                          ),
                          build: (f) => ({
                            booksStart: formText(f, "booksStart"),
                            automationEnabled: formChecked(
                              f,
                              "automationEnabled",
                            ),
                            autoSend: formChecked(f, "autoSend"),
                          }),
                        })
                      }
                    >
                      Configure automation
                    </button>
                  </div>
                )}
                <div className="finance-records">
                  {data.runs.map((r) => (
                    <article key={r.id}>
                      <h3>
                        {r.run_on} · {r.state}
                      </h3>
                      <p>
                        {r.attempts} attempt(s) · {auditTime(r.finished_at)}
                      </p>
                      {r.last_error && (
                        <p className="admin-error">{r.last_error}</p>
                      )}
                      <RunSummary result={r.result} />
                    </article>
                  ))}
                </div>
                {!data.runs.length && (
                  <p className="admin-muted">
                    No accounting runs recorded yet.
                  </p>
                )}
              </section>
              {owner && (
                <section className="admin-card">
                  <h2>Close or reopen an accounting period</h2>
                  <p>
                    Closing requires earned tuition, bank reconciliation and a
                    matching cash count. Posting to a closed date is blocked.
                    Reopening requires an owner and a reason.
                  </p>
                  <div className="finance-action-row">
                    <button
                      onClick={() =>
                        setForm({
                          title: "Close completed accounting month",
                          action: "close_period",
                          fields: (
                            <>
                              <label>
                                Month-end to close
                                <input
                                  name="throughDate"
                                  type="date"
                                  max={today}
                                  required
                                />
                              </label>
                              <MoneyField
                                name="countedCash"
                                label="Counted cash at that month-end (rand)"
                                min="0"
                              />
                              <ReasonField label="Closing review note" />
                              <label className="admin-check">
                                <input
                                  name="reviewed"
                                  type="checkbox"
                                  required
                                />
                                I reviewed the financial reports, bank
                                reconciliation and physical cash count.
                              </label>
                            </>
                          ),
                          build: (f) => ({
                            throughDate: formText(f, "throughDate"),
                            countedCashCents: formMoney(f, "countedCash"),
                            reason: formText(f, "reason"),
                            reviewed: formChecked(f, "reviewed"),
                          }),
                        })
                      }
                    >
                      Close month
                    </button>
                    {data.settings.closed_through && (
                      <button
                        onClick={() =>
                          setForm({
                            title: "Reopen accounting period",
                            action: "reopen_period",
                            fields: (
                              <>
                                <label>
                                  First day of the month to reopen
                                  <input name="fromDate" type="date" required />
                                </label>
                                <ReasonField />
                              </>
                            ),
                            build: (f) => ({
                              fromDate: formText(f, "fromDate"),
                              reason: formText(f, "reason"),
                            }),
                          })
                        }
                      >
                        Reopen with reason
                      </button>
                    )}
                  </div>
                  {data.period_events.map((e) => (
                    <p key={e.id}>
                      {e.action === "close" ? "Closed" : "Reopened"} through{" "}
                      {e.through_date} · {e.reason} · {auditTime(e.created_at)}
                    </p>
                  ))}
                </section>
              )}
              {owner && (
                <section className="admin-card">
                  <h2>Accounts and permissions</h2>
                  <button
                    onClick={() =>
                      setForm({
                        title: "Add ledger account",
                        action: "account",
                        fields: (
                          <>
                            <label>
                              Four-digit code
                              <input
                                name="code"
                                pattern="[0-9]{4}"
                                maxLength={4}
                                required
                              />
                            </label>
                            <label>
                              Account name
                              <input
                                name="name"
                                minLength={2}
                                maxLength={100}
                                required
                              />
                            </label>
                            <label>
                              Type
                              <select name="kind">
                                {[
                                  "asset",
                                  "liability",
                                  "equity",
                                  "income",
                                  "expense",
                                ].map((k) => (
                                  <option key={k}>{k}</option>
                                ))}
                              </select>
                            </label>
                          </>
                        ),
                        build: (f) => ({
                          code: formText(f, "code"),
                          name: formText(f, "name"),
                          kind: formText(f, "kind"),
                        }),
                      })
                    }
                  >
                    Add chart account
                  </button>
                  <div className="finance-records">
                    {data.admins.map((a) => (
                      <article key={a.id}>
                        <p>
                          {a.email} · {a.role}
                        </p>
                        <button
                          onClick={() =>
                            setForm({
                              title: `Finance permissions · ${a.email}`,
                              action: "role",
                              fields: (
                                <label>
                                  Finance role
                                  <select name="role" defaultValue={a.role}>
                                    <option value="owner">
                                      Owner — all financial controls
                                    </option>
                                    <option value="bookkeeper">
                                      Bookkeeper — daily financial operations
                                    </option>
                                    <option value="viewer">
                                      Viewer — read-only finance
                                    </option>
                                  </select>
                                </label>
                              ),
                              build: (f) => ({
                                userId: a.id,
                                role: formText(f, "role"),
                              }),
                            })
                          }
                        >
                          Change finance role
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
      {form && (
        <AccountingDialog
          {...form}
          close={() => setForm(null)}
          changed={reload}
        >
          {form.fields}
        </AccountingDialog>
      )}
      {evidence && (
        <Evidence
          bill={evidence}
          changed={reload}
          close={() => setEvidenceId(null)}
          onView={viewEvidence}
        />
      )}
      {viewer && (
        <DocumentViewer document={viewer} close={() => setViewer(null)} />
      )}
    </div>
  );
}
function ReportDates({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
}) {
  return (
    <div className="finance-date-range">
      <label>
        Report from
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label>
        Report to
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
    </div>
  );
}
function Totals({ rows }: { rows: (string | number)[][] }) {
  return (
    <dl className="finance-totals">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{rand(Number(value))}</dd>
        </div>
      ))}
    </dl>
  );
}
function ExportLink({
  kind,
  from,
  to,
}: {
  kind: string;
  from: string;
  to: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          void (async () => {
            try {
              const response = await fetch(
                `/api/admin/accounting?export=${kind}&from=${from}&to=${to}`,
                { credentials: "same-origin" },
              );
              if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if ([401, 403].includes(response.status))
                  window.dispatchEvent(new Event("viva-admin-expired"));
                throw new Error(
                  body.error || "The export could not be prepared.",
                );
              }
              const blob = URL.createObjectURL(await response.blob());
              const anchor = document.createElement("a");
              anchor.href = blob;
              anchor.download = `Viva-${kind}-${from}-${to}.csv`;
              anchor.click();
              window.setTimeout(() => URL.revokeObjectURL(blob), 1000);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "The export could not be downloaded.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <FileDown size={16} />
        {busy ? "Preparing CSV…" : "Download CSV"}
      </button>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
    </>
  );
}

function RunSummary({ result }: { result: Record<string, unknown> }) {
  const billing = result.billing as
    | { count?: number; seasonalSkip?: boolean }
    | undefined;
  const reminders = result.reminders as { count?: number } | undefined;
  return (
    <p>
      {Number(result.recognisedInvoices || 0)} earned-tuition records updated.{" "}
      {billing?.seasonalSkip
        ? "The following month is outside the tuition season."
        : billing
          ? `${billing.count || 0} invoices prepared.`
          : ""}{" "}
      {reminders
        ? `${reminders.count || 0} unpaid invoices checked for monthly reminders.`
        : ""}
      {result.rolledBack
        ? "This attempt was rolled back. No financial changes were kept."
        : ""}
    </p>
  );
}
