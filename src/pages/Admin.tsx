import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Helmet } from "react-helmet-async";
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Wallet,
  History,
  BookOpen,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Mail,
  X,
  Menu,
} from "lucide-react";
import {
  firstInvoiceEstimate,
  rand,
  type Application,
  type Invoice,
  type Snapshot,
} from "@/lib/admin-types";
import "./admin.css";

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api<T>(
  path: string,
  data?: object,
  method?: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  let body: { error?: string } & T;
  try {
    response = await fetch(`/api/admin/${path}`, {
      method: method || (data ? "POST" : "GET"),
      credentials: "same-origin",
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });
    body = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return {};
    });
  } finally {
    window.clearTimeout(timer);
  }

  if (!response.ok)
    throw new ApiError(
      body.error ||
        "The request failed. Refresh and check the record before retrying.",
      response.status,
    );
  return body;
}
const tabs = [
  "Overview",
  "Applications",
  "Students",
  "Finance",
  "Notifications",
  "Audit",
  "Classes",
  "Materials",
  "Assessments",
  "Academics",
  "Tutors",
  "System health",
  "Settings",
];
const icons = [LayoutDashboard, ClipboardCheck, Users, Wallet, Mail, History];
const label = (value: string) => value.replaceAll("_", " ");
const dateLabel = (value: string) =>
  new Date(
    value.length === 10 ? `${value}T12:00:00Z` : value,
  ).toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="admin-modal"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      aria-labelledby="admin-dialog-title"
    >
      <header>
        <h2 id="admin-dialog-title">{title}</h2>
        <button aria-label="Close details" onClick={close}>
          <X size={22} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export default function Admin() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("Overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Application | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [documentUrl, setDocumentUrl] = useState("");
  const [start, setStart] = useState("");
  const [note, setNote] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [menu, setMenu] = useState(false);
  const clearSession = useCallback(() => {
    setUser(null);
    setData(null);
    setSelected(null);
    setInvoice(null);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const snapshot = await api<Snapshot>("records");
      if (
        ![
          "applications",
          "invoices",
          "payments",
          "audit",
          "messages",
          "closures",
          "programmes",
        ].every((key) => Array.isArray(snapshot[key as keyof Snapshot])) ||
        typeof snapshot.today !== "string"
      )
        throw new Error(
          "The admin response was incomplete. Check migrations and refresh.",
        );
      setData(snapshot);
      return snapshot;
    } catch (e) {
      if (e instanceof ApiError && [401, 403].includes(e.status))
        clearSession();
      throw e;
    }
  }, [clearSession]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await api<{ user: { id: string; email: string } }>(
          "session",
        );
        if (active) {
          setUser(session.user);
          await refresh();
        }
      } catch (e) {
        if (active && (!(e instanceof ApiError) || e.status !== 401))
          setError(e instanceof Error ? e.message : "Unable to load admin.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  async function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      if (e instanceof ApiError && [401, 403].includes(e.status))
        clearSession();
      setError(
        e instanceof Error && !["TimeoutError", "AbortError"].includes(e.name)
          ? e.message
          : "The request timed out. Refresh and check the record before retrying.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function mutate(action: string, payload: Record<string, unknown>) {
    const result = await api<{ result: unknown }>("records", {
      action,
      ...payload,
    });
    await refresh();
    setSelected(null);
    setInvoice(null);
    setNotice("Saved. Review Notifications to send any queued email.");
    return result;
  }
  function openApplication(app: Application) {
    setSelected(app);
    setDocumentUrl("");
    setStart(data?.today || "");
    setNote("");
    setError("");
  }
  function openInvoice(item: Invoice) {
    setInvoice(item);
    setPaymentId(crypto.randomUUID());
    setError("");
  }
  const apps = data?.applications || [];
  const invoices = data?.invoices || [];
  const payments = data?.payments || [];
  const appById = (id: string) => apps.find((a) => a.id === id);
  const invoiceStatus = (i: Invoice) =>
    Number(i.paid_cents) >= i.amount_cents
      ? "paid"
      : Number(i.paid_cents) > 0
        ? "part paid"
        : i.due_date < (data?.today || "")
          ? "overdue"
          : "unpaid";
  const visibleApps = apps.filter(
    (a) =>
      (filter === "all" || a.status === filter) &&
      `${a.learner_name} ${a.student_number} ${a.guardian_email} ${a.application_number}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const programme = data?.programmes.find(
    (p) => p.grade === selected?.grade_level,
  );
  const estimate =
    selected && programme
      ? firstInvoiceEstimate(
          Number(selected.monthly_fee),
          start,
          (data?.closures || []).map((c) => c.day),
          programme.weekdays,
        )
      : null;
  const selectedInvoices = invoices.filter(
    (i) => i.application_id === selected?.id,
  );
  const firstInvoice = [...selectedInvoices].sort((a, b) =>
    a.billing_month.localeCompare(b.billing_month),
  )[0];
  const nextMonth = data
    ? new Date(`${data.today.slice(0, 7)}-01T12:00:00Z`)
    : null;
  nextMonth?.setUTCMonth(nextMonth.getUTCMonth() + 1);

  const feedback = (
    <>
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
    </>
  );
  const metadata = (
    <Helmet>
      <title>Admin | Viva Tutorials</title>
      <meta name="robots" content="noindex,nofollow" />
      <meta name="referrer" content="no-referrer" />
    </Helmet>
  );
  if (loading)
    return (
      <main className="admin-shell admin-login">
        {metadata}
        <p role="status">Loading secure admin…</p>
      </main>
    );
  if (!user)
    return (
      <main className="admin-shell admin-login">
        {metadata}
        <section className="admin-card">
          <ShieldCheck size={34} />
          <h1>Viva Tutorials Admin</h1>
          <p>Sign in with your authorized administrator account.</p>
          {feedback}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const fields = new FormData(form);
              void run(async () => {
                try {
                  const result = await api<{
                    user: { id: string; email: string };
                  }>("session", {
                    email: fields.get("email"),
                    password: fields.get("password"),
                  });
                  setUser(result.user);
                  await refresh();
                } finally {
                  form.reset();
                }
              });
            }}
          >
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="admin-primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="admin-muted">
            Admin access is granted separately from having an account. Your
            session expires after at most one hour.
          </p>
          <a href="/">Return to website</a>
        </section>
      </main>
    );

  const detailError = error && (
    <p role="alert" className="admin-error">
      {error}
    </p>
  );
  return (
    <div className="admin-shell">
      {metadata}
      <aside className={`admin-sidebar ${menu ? "is-open" : ""}`}>
        <a href="/admin" className="admin-brand">
          Viva<span>Tutorials · Admin</span>
        </a>
        <p className="admin-nav-label">Run the day</p>
        <nav aria-label="Admin sections">
          {tabs.map((name, index) => {
            const Icon = icons[index] || BookOpen;
            return (
              <button
                key={name}
                aria-current={tab === name ? "page" : undefined}
                onClick={() => {
                  setTab(name);
                  setQuery("");
                  setFilter("all");
                  setMenu(false);
                }}
              >
                <Icon size={18} />
                {name}
              </button>
            );
          })}
        </nav>
        <p className="admin-muted">
          Teaching tools are planned. No sample figures are shown.
        </p>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            className="admin-menu"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <strong>{tab}</strong>
          <span>{user.email}</span>
          <button
            aria-label="Refresh records"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await refresh();
                setNotice("Records refreshed.");
              })
            }
          >
            <RefreshCw size={18} />
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api("session", undefined, "DELETE");
                clearSession();
              })
            }
          >
            <LogOut size={17} />
            Sign out
          </button>
        </header>
        <main id="main-content" className="admin-main" aria-busy={busy}>
          {!selected && !invoice && feedback}
          {!data ? (
            <section className="admin-card">
              <h1>Unable to load records</h1>
              <p>
                Check that the admin migration and account permissions are
                configured, then refresh.
              </p>
            </section>
          ) : (
            <>
              {data.truncated && (
                <p role="alert" className="admin-error">
                  The record limit was reached. These totals are incomplete; use
                  database reporting until pagination is added.
                </p>
              )}
              {tab === "Overview" && (
                <>
                  <section className="admin-hero">
                    <p>
                      {dateLabel(data.today)} · Grade-specific weekly programmes
                    </p>
                    <h1>Your tuition operations</h1>
                    <p>
                      Review applications, verify payments and confirm
                      enrollment.
                    </p>
                    <div className="admin-stats">
                      {[
                        [
                          "Pending review",
                          apps.filter((a) => a.status === "pending_review")
                            .length,
                        ],
                        [
                          "Awaiting first payment",
                          apps.filter((a) => a.status === "pending_payment")
                            .length,
                        ],
                        [
                          "Active learners",
                          apps.filter((a) => a.status === "active").length,
                        ],
                        [
                          "Rejected",
                          apps.filter((a) => a.status === "rejected").length,
                        ],
                      ].map(([name, value]) => (
                        <div key={name}>
                          <strong>{value}</strong>
                          <span>{name}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="admin-grid">
                    <section className="admin-card">
                      <h2>Needs attention</h2>
                      <p>
                        {
                          apps.filter((a) => a.status === "pending_review")
                            .length
                        }{" "}
                        applications await review.
                      </p>
                      <button
                        onClick={() => {
                          setTab("Applications");
                          setFilter("pending_review");
                        }}
                      >
                        Review applications
                      </button>
                      <p>
                        {
                          invoices.filter(
                            (i) => i.amount_cents > Number(i.paid_cents),
                          ).length
                        }{" "}
                        invoices have outstanding balances.
                      </p>
                      <button onClick={() => setTab("Finance")}>
                        Review finance
                      </button>
                      <p>
                        {data.messages.filter((m) => m.state !== "sent").length}{" "}
                        notifications are pending or need investigation.
                      </p>
                      <button onClick={() => setTab("Notifications")}>
                        Review notifications
                      </button>
                    </section>
                    <section className="admin-card">
                      <h2>Recorded tuition totals</h2>
                      <p>All loaded billing periods · excludes PDF purchases</p>
                      <dl>
                        <div>
                          <dt>Invoiced</dt>
                          <dd>
                            {rand(
                              invoices.reduce((n, i) => n + i.amount_cents, 0),
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Verified allocations</dt>
                          <dd>
                            {rand(
                              invoices.reduce(
                                (n, i) => n + Number(i.paid_cents),
                                0,
                              ),
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Outstanding</dt>
                          <dd>
                            {rand(
                              invoices.reduce(
                                (n, i) =>
                                  n + i.amount_cents - Number(i.paid_cents),
                                0,
                              ),
                            )}
                          </dd>
                        </div>
                      </dl>
                    </section>
                  </div>
                </>
              )}
              {["Applications", "Students"].includes(tab) && (
                <section className="admin-card">
                  <h1>{tab}</h1>
                  <p>
                    Open a record to review details, documents and its financial
                    history.
                  </p>
                  <div className="admin-toolbar">
                    <label>
                      Search
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Learner, number or parent email"
                      />
                    </label>
                    <label>
                      Status
                      <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="all">All statuses</option>
                        {[
                          "draft",
                          "pending_review",
                          "pending_payment",
                          "active",
                          "rejected",
                          "archived",
                        ].map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Learner</th>
                          <th>Student number</th>
                          <th>Grade</th>
                          <th>Monthly fee</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleApps.map((a) => (
                          <tr key={a.id}>
                            <td>{a.learner_name}</td>
                            <td>{a.student_number || "Not assigned"}</td>
                            <td>{a.grade_level}</td>
                            <td>{rand(Number(a.monthly_fee) * 100)}</td>
                            <td>
                              <span className="admin-badge">
                                {label(a.status)}
                              </span>
                            </td>
                            <td>
                              <button onClick={() => openApplication(a)}>
                                Open {a.learner_name}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!visibleApps.length && (
                    <p className="admin-empty">No matching applications.</p>
                  )}
                </section>
              )}
              {tab === "Finance" && (
                <section className="admin-card">
                  <h1>Tuition invoices and payments</h1>
                  <p>
                    Due on the 1st. Remind unpaid balances from the 3rd. Verify
                    funds before recording payment.
                  </p>
                  <div className="admin-toolbar">
                    <button
                      disabled={busy || Number(data.today.slice(8)) < 25}
                      onClick={() =>
                        void run(async () => {
                          await mutate("generate_month", {
                            month: nextMonth!.toISOString().slice(0, 10),
                          });
                        })
                      }
                    >
                      Generate next month’s invoices
                    </button>
                    <button
                      disabled={busy || Number(data.today.slice(8)) < 3}
                      onClick={() =>
                        void run(async () => {
                          await mutate("queue_reminders", {});
                        })
                      }
                    >
                      Queue unpaid-balance reminders
                    </button>
                  </div>
                  <p className="admin-muted">
                    Manual controls for testing. No scheduled job or automatic
                    tuition collection is running.
                  </p>
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Learner</th>
                          <th>Period</th>
                          <th>Due</th>
                          <th>Total</th>
                          <th>Balance</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((i) => (
                          <tr key={i.id}>
                            <td>{i.number}</td>
                            <td>
                              {appById(i.application_id)?.learner_name ||
                                i.application_id}
                            </td>
                            <td>{i.billing_month.slice(0, 7)}</td>
                            <td>{dateLabel(i.due_date)}</td>
                            <td>{rand(i.amount_cents)}</td>
                            <td>
                              {rand(i.amount_cents - Number(i.paid_cents))}
                            </td>
                            <td>
                              <span className="admin-badge">
                                {invoiceStatus(i)}
                              </span>
                            </td>
                            <td>
                              <button onClick={() => openInvoice(i)}>
                                View {i.number}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!invoices.length && (
                    <p className="admin-empty">
                      No invoices yet. Approve a reviewed application to issue
                      its first invoice.
                    </p>
                  )}
                </section>
              )}
              {tab === "Notifications" && (
                <section className="admin-card">
                  <h1>Notification queue</h1>
                  <p>
                    “Sent” means accepted by the email provider, not inbox
                    delivery. Financial changes are saved even if email fails.
                    Check provider history before retrying an uncertain send.
                  </p>
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Invoice</th>
                          <th>State</th>
                          <th>Attempts</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.messages.map((m) => (
                          <tr key={m.id}>
                            <td>{m.kind}</td>
                            <td>
                              {invoices.find((i) => i.id === m.invoice_id)
                                ?.number || m.invoice_id}
                            </td>
                            <td>
                              {m.state}
                              {m.last_error && <p>{m.last_error}</p>}
                            </td>
                            <td>{m.attempts}</td>
                            <td>
                              {m.state !== "sent" && (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      await api("messages", { id: m.id });
                                      await refresh();
                                      setNotice(
                                        "Notification processed. Check its status and provider delivery history.",
                                      );
                                    })
                                  }
                                >
                                  Send {m.kind}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!data.messages.length && (
                    <p className="admin-empty">No notifications queued.</p>
                  )}
                </section>
              )}
              {tab === "Audit" && (
                <section className="admin-card">
                  <h1>Recent audit history</h1>
                  <p>
                    Latest 200 events. No edit or delete controls are exposed.
                  </p>
                  {data.audit.map((a) => (
                    <article key={a.id} className="admin-audit">
                      <strong>{label(a.action)}</strong>
                      <span>
                        {new Date(a.created_at).toLocaleString("en-ZA", {
                          timeZone: "Africa/Johannesburg",
                        })}
                      </span>
                      <p>Actor: {a.actor_id}</p>
                      {a.application_id && (
                        <p>
                          Learner:{" "}
                          {appById(a.application_id)?.learner_name ||
                            a.application_id}
                        </p>
                      )}
                      <pre>{JSON.stringify(a.details, null, 2)}</pre>
                    </article>
                  ))}
                  {!data.audit.length && (
                    <p className="admin-empty">No admin activity recorded.</p>
                  )}
                </section>
              )}
              {!tabs.slice(0, 6).includes(tab) && (
                <section className="admin-card admin-empty">
                  <BookOpen size={34} />
                  <h1>{tab}</h1>
                  <p>Not available yet.</p>
                  <p>
                    Application review, tuition invoices and verified payment
                    recording are the current milestone.
                  </p>
                  {tab === "System health" && (
                    <p>
                      Monitoring, backups and scheduled-job health are not
                      configured by this dashboard.
                    </p>
                  )}
                  {tab === "Settings" && (
                    <p>
                      Billing policies and deployment setup are documented in
                      docs/admin-workflow.md. Closure dates are configured in
                      the database before invoices are issued.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
      {selected && (
        <Modal
          title={selected.learner_name}
          close={() => {
            if (!busy) setSelected(null);
          }}
        >
          {detailError}
          <p>
            <span className="admin-badge">{label(selected.status)}</span> ·{" "}
            {selected.student_number}
          </p>
          <dl>
            {[
              ["Application", selected.application_number],
              ["Grade", selected.grade_level],
              ["Subjects", selected.selected_subjects.join(", ")],
              ["Format", selected.tutoring_mode],
              ["Monthly fee", rand(Number(selected.monthly_fee) * 100)],
              ["Learner email", selected.learner_email],
              [
                "Parent/guardian",
                `${selected.guardian_name} · ${selected.guardian_email}`,
              ],
              ["Goals", selected.selected_goals.join(", ")],
              ["School", selected.learner?.school || "Not supplied"],
              ["Date of birth", selected.learner?.dob || "Not supplied"],
              ["Learner phone", selected.learner?.phone || "Not supplied"],
              [
                "Parent/guardian phone",
                selected.guardian?.phone || "Not supplied",
              ],
              ["Terms accepted", selected.terms_accepted ? "Yes" : "No"],
              [
                "Promotional photo consent",
                selected.photo_consent ? "Yes" : "No",
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <button
            disabled={busy || selected.status === "draft"}
            onClick={() =>
              void run(async () => {
                const result = await api<{ url: string }>("records", {
                  action: "document",
                  applicationId: selected.id,
                });
                setDocumentUrl(result.url);
              })
            }
          >
            Open private report card
          </button>
          <p className="admin-muted">
            Generate a private link, then open it below. Links expire after 60
            seconds.
          </p>
          {documentUrl && (
            <a
              href={documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-document-link"
            >
              View report card · expires in 60 seconds
            </a>
          )}
          <h3>Marks and targets</h3>
          {selected.subject_marks?.map((s) => (
            <p key={s.subject_name}>
              {s.subject_name}: {s.current_mark}% → {s.target_mark}% ·{" "}
              {s.difficulties.join(", ")}
            </p>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await mutate("note", { applicationId: selected.id, note });
              });
            }}
          >
            <label>
              Review note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                required
              />
            </label>
            <button disabled={busy}>Save review note</button>
          </form>
          {selected.status === "pending_review" && (
            <>
              <h3>Approve and issue first invoice</h3>
              <label>
                Agreed start date
                <input
                  type="date"
                  min={data?.today}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </label>
              {estimate && (
                <p className="admin-notice">
                  Estimated first charge: {rand(estimate.cents)} ·{" "}
                  {estimate.remaining} of {estimate.total} scheduled programme
                  days. {programme?.label}. The database recalculates this.
                  First payment is due by the agreed start date.
                </p>
              )}
              <p>
                Confirm subject availability and start date with the family
                before approving.
              </p>
              <div className="admin-toolbar">
                <button
                  className="admin-primary"
                  disabled={busy || !estimate}
                  onClick={() =>
                    void run(async () => {
                      await mutate("approve", {
                        applicationId: selected.id,
                        startDate: start,
                        note,
                      });
                    })
                  }
                >
                  Approve and issue invoice
                </button>
                <button
                  className="admin-danger"
                  disabled={busy || note.trim().length < 5}
                  onClick={() =>
                    void run(async () => {
                      await mutate("reject", {
                        applicationId: selected.id,
                        note,
                      });
                    })
                  }
                >
                  Reject with reason
                </button>
              </div>
            </>
          )}
          {selected.status === "pending_payment" && (
            <>
              <h3>Activation</h3>
              <p>
                Approval is complete. Verify and allocate the first payment in
                Finance before activation. No portal or class access is
                provisioned in this milestone.
              </p>
              <button
                className="admin-primary"
                disabled={
                  busy ||
                  !firstInvoice ||
                  firstInvoice.amount_cents > Number(firstInvoice.paid_cents)
                }
                onClick={() =>
                  void run(async () => {
                    await mutate("activate", { applicationId: selected.id });
                  })
                }
              >
                Activate learner
              </button>
            </>
          )}
          <h3>Invoice history</h3>
          {selectedInvoices.map((i) => (
            <p key={i.id}>
              {i.number} · {i.billing_month.slice(0, 7)} ·{" "}
              {rand(i.amount_cents)} · {invoiceStatus(i)}
            </p>
          ))}
          <h3>Review history</h3>
          {data?.audit
            .filter((a) => a.application_id === selected.id)
            .map((a) => (
              <p key={a.id}>
                {label(a.action)} · {dateLabel(a.created_at)}
                {typeof a.details.note === "string" && ` · ${a.details.note}`}
              </p>
            ))}
        </Modal>
      )}
      {invoice && (
        <Modal
          title={`Invoice ${invoice.number}`}
          close={() => {
            if (!busy) setInvoice(null);
          }}
        >
          {detailError}
          <div className="admin-print-invoice">
            <h2>Viva Tutorials · Tuition invoice</h2>
            <dl>
              {[
                ["Invoice number", invoice.number],
                [
                  "Learner",
                  appById(invoice.application_id)?.learner_name || "",
                ],
                [
                  "Student reference",
                  appById(invoice.application_id)?.student_number || "",
                ],
                ["Period", `${invoice.period_start} to ${invoice.period_end}`],
                ["Due date", invoice.due_date],
                ["Monthly fee", rand(Number(invoice.monthly_fee) * 100)],
                [
                  "Teaching days",
                  `${invoice.remaining_days} / ${invoice.teaching_days}`,
                ],
                ["Programme", invoice.programme_label || "Recorded programme"],
                ["Invoice total", rand(invoice.amount_cents)],
                ["Verified payments", rand(Number(invoice.paid_cents))],
                [
                  "Outstanding",
                  rand(invoice.amount_cents - Number(invoice.paid_cents)),
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <h3>Verified payment history</h3>
            {payments
              .filter((p) => p.invoice_id === invoice.id)
              .map((p) => (
                <p key={p.id}>
                  {p.paid_on} · {rand(p.amount_cents)} · {p.method} ·{" "}
                  {p.transaction_reference}
                </p>
              ))}
          </div>
          <button onClick={() => window.print()}>
            Print invoice and payment history
          </button>
          {invoice.amount_cents > Number(invoice.paid_cents) && (
            <form
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const fields = new FormData(event.currentTarget);
                const amount = String(fields.get("amount"));
                if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
                  setError("Enter an amount with at most two decimal places.");
                  return;
                }
                void run(async () => {
                  await mutate("payment", {
                    invoiceId: invoice.id,
                    paymentId,
                    amountCents: Math.round(Number(amount) * 100),
                    paidOn: fields.get("paidOn"),
                    method: fields.get("method"),
                    reference: fields.get("reference"),
                    note: fields.get("note"),
                  });
                });
              }}
            >
              <h3>Record a verified payment allocation</h3>
              <p>
                Check the bank transaction or cash receipt first. Uploaded proof
                alone is not verification. Use a unique transaction ID, not the
                learner’s recurring payment reference.
              </p>
              <label>
                Amount allocated (rand)
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={
                    (invoice.amount_cents - Number(invoice.paid_cents)) / 100
                  }
                  required
                />
              </label>
              <label>
                Payment date
                <input
                  name="paidOn"
                  type="date"
                  max={data?.today}
                  defaultValue={data?.today}
                  required
                />
              </label>
              <label>
                Method
                <select name="method">
                  {["EFT", "Cash", "Card", "SnapScan"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Unique bank transaction ID / cash receipt number
                <input
                  name="reference"
                  minLength={3}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                Verification note
                <textarea name="note" maxLength={2000} required />
              </label>
              <label className="admin-check">
                <input type="checkbox" required />I have verified funds received
                and the invoice allocation.
              </label>
              <button className="admin-primary" disabled={busy}>
                Record verified payment
              </button>
              <p className="admin-muted">
                Partial payments are supported. Excess/unallocated money
                requires separate reconciliation; it cannot be recorded above
                this invoice’s balance.
              </p>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
