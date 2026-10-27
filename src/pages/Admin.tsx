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
  Bell,
  ChevronRight,
  ArrowUpRight,
  ArrowDownToLine,
  FileText,
  Eye,
  EyeOff,
  GraduationCap,
  Search,
  CalendarDays,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock3,
  MoreHorizontal,
  CreditCard,
  Send,
  ChevronDown,
  FolderOpen,
  ArrowLeft,
} from "lucide-react";
import {
  firstInvoiceEstimate,
  invoiceBalance,
  invoiceCharge,
  learnerState,
  rand,
  type Application,
  type Invoice,
  type Snapshot,
  type Message,
} from "@/lib/admin-types";
import { ParentAccessControls } from "@/components/admin/ParentAccessControls";
import { FinanceWorkspace } from "@/components/admin/FinanceWorkspace";
import {
  LearnerAccountControls,
  InvoiceAccountingControls,
} from "@/components/admin/LearnerAccountControls";
import { randToCents } from "@/lib/accounting-input";
import { AuditTrail } from "@/components/admin/AuditTrail";
import { NotificationQueue } from "@/components/admin/NotificationQueue";
import { humanStatus, notificationName } from "@/lib/admin-format";
import {
  Avatar,
  Badge,
  Brand,
  ConfirmAction,
  Dialog,
  DocumentViewer,
  EmptyState,
  type ViewedDocument,
} from "@/components/admin/AdminPrimitives";
import "@fontsource/plus-jakarta-sans/latin-400.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
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
  const [viewer, setViewer] = useState<ViewedDocument | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: React.ReactNode;
    label: string;
    danger?: boolean;
    action: () => Promise<void>;
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [period, setPeriod] = useState("");
  const blobURLs = useRef(new Set<string>());
  useEffect(() => {
    const urls = blobURLs.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  const [start, setStart] = useState("");
  const [note, setNote] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [menu, setMenu] = useState(false);
  const clearSession = useCallback(() => {
    setUser(null);
    setData(null);
    setSelected(null);
    setInvoice(null);
    setViewer(null);
    setConfirmation(null);
    blobURLs.current.forEach((url) => URL.revokeObjectURL(url));
    blobURLs.current.clear();
  }, []);
  useEffect(() => {
    window.addEventListener("viva-admin-expired", clearSession);
    return () => window.removeEventListener("viva-admin-expired", clearSession);
  }, [clearSession]);
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
      setSelected((previous) =>
        previous
          ? snapshot.applications.find((a) => a.id === previous.id) || null
          : null,
      );
      setInvoice((previous) =>
        previous
          ? snapshot.invoices.find((i) => i.id === previous.id) || null
          : null,
      );
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
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      return true;
    } catch (e) {
      if (e instanceof ApiError && [401, 403].includes(e.status))
        clearSession();
      setError(
        e instanceof Error && !["TimeoutError", "AbortError"].includes(e.name)
          ? e.message
          : "The request timed out. Refresh and check the record before retrying.",
      );
      return false;
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
    setStart(data?.today || "");
    setNote("");
    setError("");
  }
  function openInvoice(item: Invoice) {
    setInvoice(item);
    setPaymentId(crypto.randomUUID());
    setError("");
  }
  const readOnly = data?.finance_role === "viewer";
  const apps = data?.applications || [];
  const invoices = data?.invoices || [];
  const payments = data?.payments || [];
  const appById = (id: string) => apps.find((a) => a.id === id);
  const invoiceStatus = (i: Invoice) =>
    invoiceCharge(i) <= 0
      ? "credited"
      : Number(i.paid_cents) >= invoiceCharge(i)
        ? "paid"
        : Number(i.paid_cents) > 0
          ? "part paid"
          : i.due_date < (data?.today || "")
            ? "overdue"
            : "unpaid";
  const sectionApps = apps.filter((a) =>
    tab === "Students"
      ? a.status === "active" ||
        ["suspended", "withdrawn"].includes(a.enrollment_state || "")
      : a.status !== "active" &&
        !["suspended", "withdrawn"].includes(a.enrollment_state || ""),
  );
  const visibleApps = sectionApps.filter(
    (a) =>
      (filter === "all" || learnerState(a) === filter) &&
      `${a.learner_name} ${a.student_number} ${a.guardian_email} ${a.application_number}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const programme = data?.programmes.find(
    (p) => p.grade === selected?.grade_level,
  );
  const estimate =
    selected &&
    programme &&
    Number(start.slice(5, 7)) >= 2 &&
    Number(start.slice(5, 7)) <= 11
      ? firstInvoiceEstimate(
          Number(selected.monthly_fee),
          start,
          (data?.closures || []).map((c) => c.day),
          programme.weekdays,
        )
      : null;
  const billingMonth = period || data?.today.slice(0, 7) || "";
  const monthInvoices = invoices.filter(
    (i) => i.billing_month.slice(0, 7) === billingMonth,
  );
  const billed = monthInvoices.reduce((n, i) => n + invoiceCharge(i), 0);
  const collected = monthInvoices.reduce((n, i) => n + Number(i.paid_cents), 0);
  const outstanding = monthInvoices.reduce((n, i) => n + invoiceBalance(i), 0);
  const overdue = invoices.filter(
    (i) => i.due_date < (data?.today || "") && invoiceBalance(i) > 0,
  );
  const queue = (data?.messages || []).filter(
    (m) => !["sent", "cancelled"].includes(m.state),
  );
  const periods = Array.from(
    new Set([
      data?.today.slice(0, 7) || "",
      ...invoices.map((i) => i.billing_month.slice(0, 7)),
    ]),
  )
    .filter(Boolean)
    .sort()
    .reverse();
  const periodSelect = (
    <label className="period-select">
      <span className="sr-only">Billing period</span>
      <CalendarDays size={15} />
      <select
        aria-label="Billing period"
        value={billingMonth}
        onChange={(e) => setPeriod(e.target.value)}
      >
        {periods.map((p) => (
          <option key={p} value={p}>
            {new Date(`${p}-01T12:00:00Z`).toLocaleDateString("en-ZA", {
              month: "long",
              year: "numeric",
            })}
          </option>
        ))}
      </select>
    </label>
  );
  const selectedInvoices = invoices.filter(
    (i) => i.application_id === selected?.id,
  );
  const firstInvoice =
    selectedInvoices.find((i) => i.id === selected?.activation_invoice_id) ||
    [...selectedInvoices]
      .filter((i) => invoiceCharge(i) > 0)
      .sort((a, b) => a.billing_month.localeCompare(b.billing_month))[0];
  const nextMonth = data
    ? new Date(`${data.today.slice(0, 7)}-01T12:00:00Z`)
    : null;
  nextMonth?.setUTCMonth(nextMonth.getUTCMonth() + 1);

  function navigate(name: string) {
    setTab(name);
    setMenu(false);
    setQuery("");
    setFilter("all");
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function ask(
    title: string,
    description: React.ReactNode,
    label: string,
    action: () => Promise<void>,
    danger = false,
  ) {
    setError("");
    setConfirmation({ title, description, label, action, danger });
  }
  async function reportCard(applicationId: string): Promise<ViewedDocument> {
    try {
      const result = await api<{
        url: string;
        mime?: string;
        fileName?: string;
      }>("records", { action: "document", applicationId });
      return {
        title: "Report card",
        url: result.url,
        mime: result.mime || "application/pdf",
        filename: result.fileName || "report-card.pdf",
        downloadUrl: `/api/admin/documents?kind=report&id=${applicationId}`,
        expiresAt: Date.now() + 55_000,
        refresh: () => reportCard(applicationId),
      };
    } catch (e) {
      if (e instanceof ApiError && [401, 403].includes(e.status))
        clearSession();
      throw e;
    }
  }
  async function openPDF(
    kind: string,
    id: string,
    title: string,
    range?: { from: string; to: string },
  ) {
    await run(async () => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 30000);
      try {
        const result = await fetch(
          `/api/admin/documents?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}${range ? `&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : ""}`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (!result.ok) {
          const body = await result.json().catch(() => ({}));
          throw new ApiError(
            body.error || "The PDF could not be loaded.",
            result.status,
          );
        }
        if (!result.headers.get("Content-Type")?.includes("application/pdf"))
          throw new Error(
            "The server did not return a PDF. Please refresh and try again.",
          );
        const url = URL.createObjectURL(await result.blob());
        blobURLs.current.add(url);
        const filename =
          result.headers
            .get("Content-Disposition")
            ?.match(/filename="([^"]+)"/)?.[1] || `${kind}.pdf`;
        setViewer({ title, url, mime: "application/pdf", filename });
      } finally {
        window.clearTimeout(timer);
      }
    });
  }
  function closeViewer() {
    if (viewer?.url.startsWith("blob:")) {
      URL.revokeObjectURL(viewer.url);
      blobURLs.current.delete(viewer.url);
    }
    setViewer(null);
  }
  function closeProfile() {
    if (busy) return;
    if (note.trim()) {
      ask(
        "Leave this review?",
        <p>Your unsaved review note will be discarded.</p>,
        "Discard note",
        async () => {
          setSelected(null);
          setNote("");
        },
      );
    } else setSelected(null);
  }
  const feedback = (
    <>
      {error && (
        <p role="alert" className="admin-error">
          <AlertCircle size={18} />
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="admin-notice">
          <CheckCircle2 size={18} />
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
  const dayLabel = data ? dateLabel(data.today) : "";
  const iconFor = (name: string) =>
    ({
      Overview: LayoutDashboard,
      Applications: ClipboardCheck,
      Students: Users,
      Finance: Wallet,
      Notifications: Bell,
      Audit: History,
      Classes: BookOpen,
      Materials: FolderOpen,
      Assessments: FileText,
      Academics: TrendingUp,
      Tutors: GraduationCap,
      "System health": ShieldCheck,
      Settings: Menu,
    })[name] || BookOpen;
  const navGroups = [
    { label: "Run the day", items: tabs.slice(0, 6) },
    {
      label: "Teaching",
      items: ["Classes", "Materials", "Assessments", "Academics", "Tutors"],
    },
    { label: "Oversight", items: ["System health", "Settings"] },
  ];
  const navButton = (name: string) => {
    const Icon = iconFor(name);
    const count =
      name === "Applications"
        ? apps.filter((a) => a.status === "pending_review").length
        : name === "Notifications"
          ? queue.length
          : 0;
    return (
      <button
        key={name}
        aria-label={name}
        aria-current={tab === name ? "page" : undefined}
        onClick={() => navigate(name)}
      >
        <Icon size={19} />
        <span>{name}</span>
        {count > 0 && (
          <span className="nav-count" aria-label={`${count} items`}>
            {count}
          </span>
        )}
      </button>
    );
  };
  const stage = (value: string) =>
    value === "part paid" ? "part_paid" : value;
  const invoiceCards = (
    <div className="admin-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Invoice / learner</th>
            <th>Billing period</th>
            <th>Due date</th>
            <th>Total</th>
            <th>Outstanding</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.id}>
              <td data-label="Invoice">
                <strong>{i.number}</strong>
                <small>
                  {appById(i.application_id)?.learner_name || "Learner record"}
                </small>
              </td>
              <td data-label="Period">{i.billing_month.slice(0, 7)}</td>
              <td data-label="Due">{dateLabel(i.due_date)}</td>
              <td data-label="Total">{rand(i.amount_cents)}</td>
              <td data-label="Outstanding">
                <strong>{rand(invoiceBalance(i))}</strong>
              </td>
              <td data-label="Status">
                <Badge value={stage(invoiceStatus(i))} />
              </td>
              <td>
                <button
                  className="compact-button"
                  onClick={() => openInvoice(i)}
                  aria-label={`View ${i.number}`}
                >
                  View invoice
                  <ChevronRight size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!invoices.length && (
        <EmptyState title="Your first invoice starts here">
          Review and approve an application to issue its first tuition invoice.
        </EmptyState>
      )}
    </div>
  );
  const history = (applicationId: string) =>
    data && user ? (
      <AuditTrail data={data} user={user} applicationId={applicationId} />
    ) : null;
  function sendNotification(message: Message) {
    ask(
      "Send this notification?",
      <>
        <p>
          <strong>{notificationName(message.kind)}</strong> for{" "}
          {message.payload?.learner || "the saved learner"}.
        </p>
        <p>
          Recipients:{" "}
          {message.payload?.recipients?.join(", ") ||
            "The learner and parent/guardian saved for this event"}
          .
        </p>
        {message.attempts > 0 && (
          <p>
            Check the email provider history before retrying this previously
            attempted message.
          </p>
        )}
        <p>
          Amounts and recipients were saved when this notification was prepared.
          Check the current invoice before sending an older notice.
        </p>
      </>,
      "Send notification",
      async () => {
        await api("messages", { id: message.id, action: "send" });
        await refresh();
        setNotice(
          "Notification processed. Review its status and delivery history.",
        );
      },
    );
  }
  if (loading)
    return (
      <main className="admin-shell admin-login">
        {metadata}
        <Brand />
        <div className="login-loading" role="status">
          <RefreshCw className="spin" size={25} />
          Opening your workspace…
        </div>
      </main>
    );
  if (!user)
    return (
      <main className="admin-shell admin-login">
        {metadata}
        <div className="login-orb orb-one" />
        <div className="login-orb orb-two" />
        <div className="login-layout">
          <section className="login-intro">
            <Brand />
            <span className="eyebrow">THE VIVA WORKSPACE</span>
            <h1>
              A little more clarity.
              <br />
              <em>A lot more possibility.</em>
            </h1>
            <p>
              Your learners, applications and tuition, brought together in one
              thoughtful space.
            </p>
            <div className="login-features">
              <span>
                <ClipboardCheck size={18} />
                Review with confidence
              </span>
              <span>
                <Wallet size={18} />
                Keep tuition on track
              </span>
              <span>
                <GraduationCap size={18} />
                Make room for learning
              </span>
            </div>
            <p className="login-signature">
              Personal support. Purposeful learning.
            </p>
          </section>
          <section className="login-card">
            <div className="login-card-brand">
              <Brand compact />
            </div>
            <div className="login-lock">
              <ShieldCheck size={23} />
            </div>
            <span className="eyebrow">ADMINISTRATOR ACCESS</span>
            <h2>Welcome back</h2>
            <p>Sign in to your Viva Tutorials workspace.</p>
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
                    setShowPassword(false);
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
                  placeholder="you@example.com"
                  required
                  disabled={busy}
                />
              </label>
              <label htmlFor="admin-password">Password</label>
              <div className="password-field">
                <input
                  id="admin-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  disabled={busy}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              <button className="admin-primary login-submit" disabled={busy}>
                {busy ? (
                  <>
                    <RefreshCw className="spin" size={18} />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowUpRight size={18} />
                  </>
                )}
              </button>
            </form>
            <p className="login-security">
              <ShieldCheck size={15} />
              For authorized administrators only.
            </p>
            <a className="back-link" href="/">
              <ArrowLeft size={16} />
              Back to Viva Tutorials
            </a>
            <p className="login-footnote">
              Need account help? Contact the owner of your Viva workspace.
            </p>
          </section>
        </div>
        <footer className="login-footer">
          Viva Tutorials · Mfuleni, Cape Town · Built around our learners
        </footer>
      </main>
    );
  return (
    <div className="admin-shell">
      {metadata}
      <aside className="admin-sidebar">
        <Brand />
        {navGroups.map((group) => (
          <section key={group.label}>
            <p className="admin-nav-label">{group.label}</p>
            <nav aria-label={`${group.label} sections`}>
              {group.items.map(navButton)}
            </nav>
          </section>
        ))}
        <div className="sidebar-note">
          <span className="sidebar-leaf">
            <GraduationCap size={19} />
          </span>
          <strong>Growing with Viva</strong>
          <p>
            Learning and teaching tools will join this workspace as they become
            available.
          </p>
        </div>
        <div className="sidebar-account">
          <span className="account-avatar">
            {user.email?.[0]?.toUpperCase() || "A"}
          </span>
          <div>
            <strong>Administrator</strong>
            <small>{user.email}</small>
          </div>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="topbar-mobile-brand">
            <Brand compact />
          </div>
          <div className="page-crumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{tab}</strong>
          </div>
          <div className="topbar-actions">
            <span className="private-pill">
              <ShieldCheck size={14} />
              Private workspace
            </span>
            <button
              className="icon-button"
              aria-label="Refresh records"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await refresh();
                  setNotice("Records refreshed.");
                })
              }
            >
              <RefreshCw size={18} className={busy ? "spin" : ""} />
            </button>
            <button
              className="icon-button notification-bell"
              aria-label={`Notifications${queue.length ? `, ${queue.length} waiting` : ""}`}
              onClick={() => navigate("Notifications")}
            >
              <Bell size={19} />
              {queue.length > 0 && <i>{queue.length}</i>}
            </button>
            <button
              className="icon-button signout-button"
              aria-label="Sign out"
              disabled={busy}
              onClick={() =>
                ask(
                  "Sign out of Viva?",
                  <p>
                    You’ll need to sign in again to access your learners and
                    financial records.
                  </p>,
                  "Sign out",
                  async () => {
                    await api("session", undefined, "DELETE");
                    clearSession();
                  },
                )
              }
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main id="main-content" className="admin-main" aria-busy={busy}>
          {!selected && !invoice && !confirmation && feedback}
          {!data ? (
            <section className="admin-card">
              <EmptyState title="Your records couldn’t load">
                Refresh to try again. If the problem continues, check the admin
                setup with your workspace owner.
              </EmptyState>
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
                    <div className="hero-glow" />
                    <span className="hero-date">
                      <CalendarDays size={15} />
                      {dayLabel}
                    </span>
                    <div className="hero-heading">
                      <div>
                        <p className="hero-hello">
                          Welcome to your Viva workspace
                        </p>
                        <h1>Your tuition operations</h1>
                        <p>Small steps today. Stronger futures tomorrow.</p>
                      </div>
                      <span className="hero-icon">
                        <GraduationCap size={45} />
                      </span>
                    </div>
                    <div className="admin-stats">
                      {[
                        [
                          "Active learners",
                          "active",
                          apps.filter((a) => learnerState(a) === "active")
                            .length,
                        ],
                        [
                          "Pending review",
                          "pending_review",
                          apps.filter((a) => a.status === "pending_review")
                            .length,
                        ],
                        [
                          "Awaiting payment",
                          "pending_payment",
                          apps.filter((a) => a.status === "pending_payment")
                            .length,
                        ],
                        [
                          "Rejected",
                          "rejected",
                          apps.filter((a) => a.status === "rejected").length,
                        ],
                      ].map(([name, status, value]) => (
                        <button
                          key={name}
                          onClick={() => {
                            navigate(
                              status === "active" ? "Students" : "Applications",
                            );
                            setFilter(
                              status === "active" ? "all" : String(status),
                            );
                          }}
                        >
                          <strong>{value}</strong>
                          <span>
                            <i className={`stat-dot dot-${status}`} />
                            {name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <div className="section-toolbar">
                    <div>
                      <span className="eyebrow">THE FINANCIAL PICTURE</span>
                      <p>Payments allocated to the selected billing period</p>
                    </div>
                    {periodSelect}
                  </div>
                  <div className="kpi-grid">
                    {[
                      {
                        title: "Invoiced",
                        value: rand(billed),
                        detail: `${monthInvoices.length} tuition invoice${monthInvoices.length === 1 ? "" : "s"}`,
                        icon: FileText,
                        tone: "purple",
                      },
                      {
                        title: "Verified payments",
                        value: rand(collected),
                        detail: "Allocated to this billing period",
                        icon: CheckCircle2,
                        tone: "green",
                      },
                      {
                        title: "Outstanding",
                        value: rand(outstanding),
                        detail: "Remaining for this billing period",
                        icon: Wallet,
                        tone: "orange",
                      },
                      {
                        title: "Overdue invoices",
                        value: String(overdue.length),
                        detail: "Across all billing periods",
                        icon: Clock3,
                        tone: "red",
                      },
                    ].map((k) => (
                      <button
                        className={`kpi-card kpi-${k.tone}`}
                        key={k.title}
                        onClick={() => navigate("Finance")}
                      >
                        <div>
                          <span>{k.title}</span>
                          <k.icon size={18} />
                        </div>
                        <strong>{k.value}</strong>
                        <small>{k.detail}</small>
                      </button>
                    ))}
                  </div>
                  <div className="overview-columns">
                    <section className="admin-card attention-card">
                      <div className="card-heading">
                        <div>
                          <h2>Needs attention today</h2>
                          <p>What deserves your next moment</p>
                        </div>
                        <span className="soft-icon">
                          <ClipboardCheck size={20} />
                        </span>
                      </div>
                      {[
                        {
                          count: apps.filter(
                            (a) => a.status === "pending_review",
                          ).length,
                          title: "Applications to review",
                          singular: "application to review",
                          detail: "Check details and report cards",
                          section: "Applications",
                          icon: ClipboardCheck,
                          tone: "purple",
                        },
                        {
                          count: overdue.length,
                          title: "Overdue tuition invoices",
                          singular: "overdue tuition invoice",
                          detail: "Review balances before following up",
                          section: "Finance",
                          icon: Clock3,
                          tone: "orange",
                        },
                        {
                          count: queue.length,
                          title: "Notifications to process",
                          singular: "notification to process",
                          detail: "Queued or unconfirmed email attempts",
                          section: "Notifications",
                          icon: Mail,
                          tone: "green",
                        },
                      ].map((item) => (
                        <button
                          key={item.title}
                          className="attention-row"
                          onClick={() => navigate(item.section)}
                        >
                          <span className={`action-icon tone-${item.tone}`}>
                            <item.icon size={20} />
                          </span>
                          <span>
                            <strong>
                              {item.count}{" "}
                              {item.count === 1
                                ? item.singular
                                : item.title.toLowerCase()}
                            </strong>
                            <small>{item.detail}</small>
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    </section>

                    <section className="admin-card">
                      <div className="card-heading">
                        <div>
                          <h2>Recent activity</h2>
                          <p>A clear trail of the work being done</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("Audit")}
                        >
                          View all
                          <ChevronRight size={15} />
                        </button>
                      </div>
                      <AuditTrail data={data} user={user} limit={5} />
                    </section>
                    <section className="admin-card">
                      <div className="card-heading">
                        <div>
                          <h2>Active learners by grade</h2>
                          <p>Current enrollment, drawn from your records</p>
                        </div>
                        <Users size={20} />
                      </div>
                      <div className="grade-breakdown">
                        {Array.from(
                          new Set(
                            apps
                              .filter((a) => learnerState(a) === "active")
                              .map((a) => a.grade_level),
                          ),
                        ).map((grade) => {
                          const count = apps.filter(
                            (a) =>
                              learnerState(a) === "active" &&
                              a.grade_level === grade,
                          ).length;
                          return (
                            <div key={grade}>
                              <span>{grade}</span>
                              <div>
                                <i
                                  style={{
                                    width: `${(count / Math.max(1, apps.filter((a) => learnerState(a) === "active").length)) * 100}%`,
                                  }}
                                />
                              </div>
                              <strong>{count}</strong>
                            </div>
                          );
                        })}
                        {!apps.some((a) => learnerState(a) === "active") && (
                          <p className="admin-muted">
                            No active learners yet. Approved learners join this
                            view after their first invoice is settled and
                            enrollment is activated.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                </>
              )}
              {["Applications", "Students"].includes(tab) && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        PEOPLE AT THE HEART OF VIVA
                      </span>
                      <h1>{tab}</h1>
                      <p>
                        {tab === "Applications"
                          ? "Review applications and follow approvals through first payment."
                          : "Enrolled learner accounts, including active, suspended and withdrawn learners."}
                      </p>
                    </div>
                    <span className="record-count">
                      {visibleApps.length} record
                      {visibleApps.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="admin-card search-card">
                    <label className="search-field">
                      <Search size={19} />
                      <span className="sr-only">Search</span>
                      <input
                        aria-label="Search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search learner, student number or parent email"
                      />
                    </label>
                    {
                      <label className="status-select">
                        <span>
                          {tab === "Applications"
                            ? "Application status"
                            : "Learner status"}
                        </span>
                        <select
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option value="all">All statuses</option>
                          {(tab === "Applications"
                            ? [
                                "draft",
                                "pending_review",
                                "pending_payment",
                                "rejected",
                                "archived",
                              ]
                            : ["active", "suspended", "withdrawn"]
                          ).map((status) => (
                            <option key={status} value={status}>
                              {humanStatus(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                    }
                  </div>
                  <div className="learner-grid">
                    {visibleApps.map((a) => (
                      <article className="learner-card" key={a.id}>
                        <div className="learner-top">
                          <Avatar name={a.learner_name} />
                          <Badge value={learnerState(a)} />
                        </div>
                        <h2>{a.learner_name}</h2>
                        <p className="student-id">
                          {a.student_number || "Student number pending"}
                        </p>
                        <div className="subject-chips">
                          {a.selected_subjects.map((subject) => (
                            <span key={subject}>{subject}</span>
                          ))}
                        </div>
                        <div className="learner-meta">
                          <span>
                            <GraduationCap size={15} />
                            {a.grade_level}
                          </span>
                          <strong>
                            {rand(Number(a.monthly_fee) * 100)}
                            <small>/month</small>
                          </strong>
                        </div>
                        <button
                          className="learner-open"
                          onClick={() => openApplication(a)}
                          aria-label={`Open ${a.learner_name}`}
                        >
                          {tab === "Applications"
                            ? "View application"
                            : "View student"}
                          <ChevronRight size={17} />
                        </button>
                      </article>
                    ))}
                  </div>
                  {!visibleApps.length && (
                    <section className="admin-card">
                      <EmptyState
                        title={
                          sectionApps.length
                            ? `No ${tab.toLowerCase()} match this view`
                            : tab === "Applications"
                              ? "No applications at the moment"
                              : "No active students yet"
                        }
                      >
                        {sectionApps.length
                          ? "Try another name or change the filter."
                          : tab === "Applications"
                            ? "New enrollment applications appear here. Activated learners are listed in Students."
                            : "Learners appear here after approval, full first-invoice payment and activation."}
                      </EmptyState>
                    </section>
                  )}
                </>
              )}
              {tab === "Finance" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">A SUSTAINABLE FUTURE</span>
                      <h1>Tuition invoices and payments</h1>
                      <p>
                        Clear charges. Verified payments. A reliable history.
                      </p>
                    </div>
                    <span className="soft-icon">
                      <Wallet size={25} />
                    </span>
                  </div>
                  <section
                    className="collection-card finance-collection"
                    aria-labelledby="finance-collection-title"
                  >
                    <div className="section-toolbar">
                      <h2 id="finance-collection-title">
                        Collection for this billing period
                      </h2>
                      {periodSelect}
                    </div>
                    <strong>{rand(collected)}</strong>
                    <p>of {rand(billed)} invoiced</p>
                    <div className="collection-track">
                      <span
                        style={{
                          width: `${billed ? Math.min(100, (collected / billed) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <div className="collection-bottom">
                      <div>
                        <strong>
                          {billed
                            ? `${Math.round((collected / billed) * 100)}%`
                            : "—"}
                        </strong>
                        <small>Collected</small>
                      </div>
                      <div>
                        <strong>{rand(outstanding)}</strong>
                        <small>Outstanding</small>
                      </div>
                    </div>
                  </section>
                  <FinanceWorkspace
                    snapshot={data}
                    changed={refresh}
                    onPDF={openPDF}
                    user={user}
                  >
                    <div className="finance-banner">
                      <CalendarDays size={22} />
                      <div>
                        <strong>Due on the 1st · Reminders from the 3rd</strong>
                        <p>
                          First payment is required before activation. Manage
                          scheduled billing and email dispatch in Finance
                          Controls.
                        </p>
                      </div>
                    </div>
                    <section className="admin-card">
                      <div className="card-heading">
                        <div>
                          <h2>Invoice register</h2>
                          <p>
                            Open an invoice to view documents or record verified
                            funds.
                          </p>
                        </div>
                      </div>
                      <div className="admin-toolbar">
                        <button
                          disabled={
                            busy || readOnly || Number(data.today.slice(8)) < 25
                          }
                          onClick={() =>
                            ask(
                              "Generate next month’s invoices?",
                              <p>
                                This creates one invoice per eligible active
                                learner for{" "}
                                {nextMonth!.toISOString().slice(0, 7)} and
                                queues the invoice emails. Existing invoices are
                                retained.
                              </p>,
                              "Generate invoices",
                              async () => {
                                await mutate("generate_month", {
                                  month: nextMonth!.toISOString().slice(0, 10),
                                });
                              },
                            )
                          }
                        >
                          <FileText size={16} />
                          Generate next month’s invoices
                        </button>
                        <button
                          disabled={
                            busy || readOnly || Number(data.today.slice(8)) < 3
                          }
                          onClick={() =>
                            ask(
                              "Queue payment reminders?",
                              <p>
                                This queues one monthly notice per invoice with
                                an unpaid balance. Review the queue before
                                sending.
                              </p>,
                              "Queue reminders",
                              async () => {
                                await mutate("queue_reminders", {});
                              },
                            )
                          }
                        >
                          <Bell size={16} />
                          Queue unpaid-balance reminders
                        </button>
                      </div>
                      {invoiceCards}
                    </section>
                  </FinanceWorkspace>
                </>
              )}
              {tab === "Notifications" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">KEEP FAMILIES IN THE LOOP</span>
                      <h1>Notification queue</h1>
                      <p>
                        Invoices, receipts and enrollment updates in one place.
                      </p>
                    </div>
                    <span className="record-count">
                      {queue.length} to process
                    </span>
                  </div>
                  <NotificationQueue
                    messages={data.messages}
                    invoices={invoices}
                    applications={apps}
                    busy={busy || readOnly}
                    error={error}
                    truncated={data.messages_truncated}
                    onSend={sendNotification}
                    onCancel={(message, reason, providerReviewed) =>
                      run(async () => {
                        await api("messages", {
                          action: "cancel",
                          id: message.id,
                          reason,
                          providerReviewed,
                        });
                        await refresh();
                        setNotice(
                          "Notification removed from the queue. Its history and financial records have been retained.",
                        );
                      })
                    }
                  />
                </>
              )}
              {tab === "Audit" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">ACCOUNTABILITY, BUILT IN</span>
                      <h1>Recent audit history</h1>
                      <p>
                        The latest 200 recorded events. Entries have no edit or
                        delete action.
                      </p>
                    </div>
                    <History size={27} />
                  </div>
                  <section className="admin-card">
                    <AuditTrail data={data} user={user} searchable />
                  </section>
                </>
              )}
              {!tabs.slice(0, 6).includes(tab) && (
                <section className="admin-card future-card">
                  <span className="future-icon">
                    <BookOpen size={32} />
                  </span>
                  <span className="eyebrow">GROWING WITH VIVA</span>
                  <h1>{tab}</h1>
                  <Badge value="coming_soon" />
                  <h2>Not available yet.</h2>
                  <p>
                    This space is reserved for the next stage of your Viva
                    system. Your current workspace supports application review,
                    tuition invoices, payment recording and activation.
                  </p>
                  {tab === "System health" && (
                    <p>Live monitoring and backup status are not connected.</p>
                  )}
                </section>
              )}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>Viva Tutorials</span>
          <span>Personal support. Purposeful learning.</span>
        </footer>
      </div>
      <nav className="admin-bottom-nav" aria-label="Mobile navigation">
        {["Overview", "Applications", "Students", "Finance"].map((name) => {
          const Icon = iconFor(name);
          return (
            <button
              key={name}
              aria-label={`Mobile ${name}`}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => navigate(name)}
            >
              <span>
                <Icon size={20} />
              </span>
              {name === "Overview" ? "Home" : name}
            </button>
          );
        })}
        <button
          aria-label="More sections"
          aria-expanded={menu}
          onClick={() => setMenu(true)}
        >
          <span>
            <MoreHorizontal size={22} />
          </span>
          More
        </button>
      </nav>
      {menu && (
        <Dialog
          title="Your workspace"
          subtitle="More from Viva Tutorials"
          close={() => setMenu(false)}
          variant="sheet"
        >
          <div className="more-sections">{tabs.slice(4).map(navButton)}</div>
        </Dialog>
      )}
      {selected && (
        <Dialog
          title={
            selected.status === "active"
              ? "Learner profile"
              : "Application details"
          }
          subtitle={selected.student_number}
          variant="drawer"
          close={closeProfile}
          busy={busy}
        >
          {!confirmation && !viewer && feedback}
          <section className="profile-hero">
            <Avatar name={selected.learner_name} />
            <Badge value={learnerState(selected)} />
            <h2>{selected.learner_name}</h2>
            <p>
              {selected.grade_level} · {selected.tutoring_mode}
            </p>
            <div className="profile-stats">
              <div>
                <strong>{rand(Number(selected.monthly_fee) * 100)}</strong>
                <small>Monthly tuition</small>
              </div>
              <div>
                <strong>{selectedInvoices.length}</strong>
                <small>Invoices</small>
              </div>
              <div>
                <strong>{selected.selected_subjects.length}</strong>
                <small>Subjects</small>
              </div>
            </div>
          </section>
          <details className="profile-section" open>
            <summary>
              <Users size={18} />
              Application details
              <ChevronDown size={17} />
            </summary>
            <dl>
              {[
                ["Application", selected.application_number],
                ["Learner email", selected.learner_email],
                ["Parent / guardian", selected.guardian_name],
                ["Parent email", selected.guardian_email],
                ["School", selected.learner?.school || "Not supplied"],
                ["Date of birth", selected.learner?.dob || "Not supplied"],
                ["Learner phone", selected.learner?.phone || "Not supplied"],
                ["Parent phone", selected.guardian?.phone || "Not supplied"],
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
            <h3>Selected subjects</h3>
            <div className="subject-chips">
              {selected.selected_subjects.map((subject) => (
                <span key={subject}>{subject}</span>
              ))}
            </div>
            <p className="admin-muted">{selected.selected_goals.join(" · ")}</p>
          </details>
          <details className="profile-section" open>
            <summary>
              <FolderOpen size={18} />
              Documents
              <ChevronDown size={17} />
            </summary>
            <button
              className="document-row"
              disabled={busy || selected.status === "draft"}
              onClick={() =>
                void run(async () => {
                  setViewer(await reportCard(selected.id));
                })
              }
            >
              <span className="document-icon">
                <FileText size={23} />
              </span>
              <span>
                <strong>Report card</strong>
                <small>Private application document</small>
              </span>
              <Eye size={18} />
            </button>
            <p className="admin-muted">
              The viewer uses a short-lived private link. Academic progress
              reports will appear when reporting is connected.
            </p>
          </details>
          <details className="profile-section" open>
            <summary>
              <TrendingUp size={18} />
              Marks and targets
              <ChevronDown size={17} />
            </summary>
            {selected.subject_marks?.map((mark) => (
              <div className="mark-row" key={mark.subject_name}>
                <div>
                  <strong>{mark.subject_name}</strong>
                  <span>
                    {mark.current_mark}%{" "}
                    <span className="admin-muted">
                      / target {mark.target_mark}%
                    </span>
                  </span>
                </div>
                <div className="mark-track">
                  <i
                    style={{
                      width: `${Math.min(100, Math.max(0, mark.current_mark))}%`,
                    }}
                  />
                  <b
                    style={{
                      left: `${Math.min(100, Math.max(0, mark.target_mark))}%`,
                    }}
                  />
                </div>
                <small>{mark.difficulties.join(" · ")}</small>
              </div>
            ))}
            {!selected.subject_marks?.length && (
              <p className="admin-muted">
                No subject marks were supplied with this application.
              </p>
            )}
          </details>
          <details className="profile-section" open>
            <summary>
              <ClipboardCheck size={18} />
              Application review
              <ChevronDown size={17} />
            </summary>
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
                  aria-label="Review note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  placeholder="Record your review or the reason for a decision…"
                  required
                />
              </label>
              <button disabled={busy}>Save review note</button>
            </form>
            {selected.status === "pending_review" && (
              <div className="approval-panel">
                <h3>Agree the first step</h3>
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
                    First invoice estimate:{" "}
                    <strong>{rand(estimate.cents)}</strong> ·{" "}
                    {estimate.remaining} of {estimate.total} programme days. Due
                    by the agreed start date.
                  </p>
                )}
                <p className="admin-muted">
                  {programme?.label ||
                    "A billing programme must be configured for this grade."}{" "}
                  Confirm availability with the family before approval.
                </p>
                <div className="profile-actions">
                  <button
                    className="admin-primary"
                    disabled={busy || readOnly || !estimate}
                    onClick={() =>
                      ask(
                        "Approve this application?",
                        <>
                          <p>
                            <strong>{selected.learner_name}</strong> will move
                            to awaiting payment.
                          </p>
                          <p>
                            Start date: {start}
                            <br />
                            First invoice estimate:{" "}
                            <strong>{estimate && rand(estimate.cents)}</strong>
                          </p>
                          <p>
                            The server calculates the final charge. An invoice
                            email will be queued; activation stays blocked until
                            payment is settled.
                          </p>
                        </>,
                        "Approve and issue invoice",
                        async () => {
                          await mutate("approve", {
                            applicationId: selected.id,
                            startDate: start,
                            note,
                          });
                        },
                      )
                    }
                  >
                    Approve and issue invoice
                  </button>
                  <button
                    className="admin-danger"
                    disabled={busy || readOnly || note.trim().length < 5}
                    onClick={() =>
                      ask(
                        "Reject this application?",
                        <>
                          <p>
                            Reject <strong>{selected.learner_name}</strong> with
                            this recorded reason:
                          </p>
                          <blockquote>{note}</blockquote>
                          <p>
                            Contact the family separately; this action does not
                            send a rejection email.
                          </p>
                        </>,
                        "Reject application",
                        async () => {
                          await mutate("reject", {
                            applicationId: selected.id,
                            note,
                          });
                        },
                        true,
                      )
                    }
                  >
                    Reject with reason
                  </button>
                </div>
              </div>
            )}
            {selected.status === "pending_payment" && (
              <div className="approval-panel">
                <h3>Ready for activation?</h3>
                <p>
                  Verify and allocate the first payment in Finance before
                  confirming enrollment.
                </p>
                <button
                  className="admin-primary"
                  disabled={
                    busy ||
                    readOnly ||
                    !firstInvoice ||
                    invoiceCharge(firstInvoice) <= 0 ||
                    invoiceBalance(firstInvoice) > 0
                  }
                  onClick={() =>
                    ask(
                      "Activate this learner?",
                      <p>
                        <strong>{selected.learner_name}</strong> has a fully
                        settled first invoice. Activation will be recorded and a
                        welcome email queued. Session arrangements still need
                        confirmation with your team.
                      </p>,
                      "Activate learner",
                      async () => {
                        await mutate("activate", {
                          applicationId: selected.id,
                        });
                      },
                    )
                  }
                >
                  Activate learner
                </button>
              </div>
            )}
          </details>
          <ParentAccessControls application={selected} role={data?.finance_role} />
          <LearnerAccountControls
            application={selected}
            today={data?.today || ""}
            role={data?.finance_role}
            changed={refresh}
            onStatement={() =>
              void openPDF("statement", selected.id, "Family account statement")
            }
          />
          <details className="profile-section" open>
            <summary>
              <Wallet size={18} />
              Invoices and receipts
              <ChevronDown size={17} />
            </summary>
            {selectedInvoices.map((item) => (
              <button
                className="document-row"
                key={item.id}
                onClick={() => openInvoice(item)}
              >
                <span className="document-icon">
                  <FileText size={22} />
                </span>
                <span>
                  <strong>{item.number}</strong>
                  <small>
                    {item.billing_month.slice(0, 7)} · {rand(item.amount_cents)}
                  </small>
                </span>
                <Badge value={stage(invoiceStatus(item))} />
              </button>
            ))}
            {!selectedInvoices.length && (
              <p className="admin-muted">
                The first invoice is issued after approval.
              </p>
            )}
          </details>
          <details className="profile-section" open>
            <summary>
              <History size={18} />
              Review history
              <ChevronDown size={17} />
            </summary>
            {history(selected.id)}
          </details>
        </Dialog>
      )}
      {invoice && (
        <Dialog
          title={`Invoice ${invoice.number}`}
          subtitle={appById(invoice.application_id)?.learner_name}
          variant="drawer"
          close={() => {
            if (!busy) setInvoice(null);
          }}
          busy={busy}
        >
          {!confirmation && !viewer && feedback}
          <section className="invoice-summary">
            <span className="eyebrow">
              TUITION · {invoice.billing_month.slice(0, 7)}
            </span>
            <Badge value={stage(invoiceStatus(invoice))} />
            <h2>{rand(invoice.amount_cents)}</h2>
            <p>
              Invoice total · {invoice.remaining_days} of{" "}
              {invoice.teaching_days} programme days
            </p>
            <div>
              <span>
                Verified payments
                <strong>{rand(Number(invoice.paid_cents))}</strong>
              </span>
              <span>
                Outstanding
                <strong>{rand(invoiceBalance(invoice))}</strong>
              </span>
            </div>
          </section>
          <section className="profile-section invoice-details">
            <h3>Invoice details</h3>
            <dl>
              {[
                [
                  "Student reference",
                  appById(invoice.application_id)?.student_number || "",
                ],
                [
                  "Covered dates",
                  `${invoice.period_start} to ${invoice.period_end}`,
                ],
                ["Due date", dateLabel(invoice.due_date)],
                ["Monthly package", rand(Number(invoice.monthly_fee) * 100)],
                ["Programme", invoice.programme_label || "Recorded programme"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <button
              className="document-row"
              disabled={busy}
              onClick={() =>
                void openPDF("invoice", invoice.id, `Invoice ${invoice.number}`)
              }
            >
              <span className="document-icon">
                <FileText size={23} />
              </span>
              <span>
                <strong>View branded invoice</strong>
                <small>PDF · open, download or print</small>
              </span>
              <Eye size={19} />
            </button>
          </section>
          <InvoiceAccountingControls
            invoice={invoice}
            role={data?.finance_role}
            changed={refresh}
            onPDF={openPDF}
          />
          <details className="profile-section" open>
            <summary>
              <CheckCircle2 size={18} />
              Verified payments and receipts
              <ChevronDown size={17} />
            </summary>
            {payments
              .filter((p) => p.invoice_id === invoice.id)
              .map((payment) => (
                <div className="payment-history" key={payment.id}>
                  <div>
                    <strong>{rand(payment.amount_cents)}</strong>
                    <Badge
                      value={
                        payment.receipt_reversed_at
                          ? "reversed"
                          : payment.net_cents !== undefined &&
                              payment.net_cents < payment.amount_cents
                            ? "adjusted"
                            : "paid"
                      }
                    />
                  </div>
                  <p>
                    {dateLabel(payment.paid_on)} · {payment.method}
                  </p>
                  <small>{payment.transaction_reference}</small>
                  {payment.net_cents !== undefined &&
                    payment.net_cents !== payment.amount_cents && (
                      <p>Currently allocated: {rand(payment.net_cents)}</p>
                    )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void openPDF(
                        "receipt",
                        payment.id,
                        `Receipt for ${invoice.number}`,
                      )
                    }
                  >
                    <FileText size={16} />
                    View receipt
                  </button>
                </div>
              ))}
            {!payments.some((p) => p.invoice_id === invoice.id) && (
              <p className="admin-muted">
                No payment allocations have been recorded yet.
              </p>
            )}
          </details>
          {invoiceBalance(invoice) > 0 && data?.finance_role !== "viewer" && (
            <section className="profile-section payment-section">
              <h3>Record verified payment</h3>
              <p className="admin-muted">
                Check the actual bank transaction or cash receipt first. A
                proof-of-payment upload alone does not verify funds.
              </p>
              <form
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const fields = new FormData(event.currentTarget);
                  const amount = String(fields.get("amount"));
                  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
                    setError(
                      "Enter an amount with at most two decimal places.",
                    );
                    return;
                  }
                  const payload = {
                    invoiceId: invoice.id,
                    paymentId,
                    amountCents: randToCents(amount),
                    paidOn: fields.get("paidOn"),
                    method: fields.get("method"),
                    reference: fields.get("reference"),
                    note: fields.get("note"),
                  };
                  ask(
                    "Confirm verified payment?",
                    <>
                      <p>
                        Record <strong>{rand(payload.amountCents)}</strong> for{" "}
                        <strong>
                          {appById(invoice.application_id)?.learner_name}
                        </strong>
                        .
                      </p>
                      <dl>
                        <div>
                          <dt>Invoice</dt>
                          <dd>{invoice.number}</dd>
                        </div>
                        <div>
                          <dt>Method</dt>
                          <dd>{String(payload.method)}</dd>
                        </div>
                        <div>
                          <dt>Transaction ID</dt>
                          <dd>{String(payload.reference)}</dd>
                        </div>
                      </dl>
                      <p>
                        A receipt email will be queued. This records verified
                        money; it does not initiate a charge.
                      </p>
                    </>,
                    "Record verified payment",
                    async () => {
                      await mutate("payment", payload);
                    },
                  );
                }}
              >
                <label>
                  Amount allocated (rand)
                  <input
                    name="amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    max={invoiceBalance(invoice) / 100}
                    required
                  />
                </label>
                <div className="form-columns">
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
                      {["EFT", "Cash"].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Unique bank transaction ID / cash receipt number
                  <input
                    name="reference"
                    minLength={3}
                    maxLength={120}
                    required
                    placeholder="Use the transaction ID, not the student number"
                  />
                </label>
                <label>
                  Verification note
                  <textarea
                    name="note"
                    minLength={5}
                    maxLength={2000}
                    required
                    placeholder="How was the payment verified?"
                  />
                </label>
                <label className="admin-check">
                  <input type="checkbox" required />I have verified funds
                  received and the invoice allocation.
                </label>
                <button className="admin-primary" disabled={busy}>
                  <CreditCard size={17} />
                  Record verified payment
                </button>
                <p className="admin-muted">
                  Partial allocations are supported. Reconcile excess or
                  multi-invoice transactions separately.
                </p>
              </form>
            </section>
          )}
        </Dialog>
      )}
      {confirmation && (
        <ConfirmAction
          title={confirmation.title}
          description={confirmation.description}
          label={confirmation.label}
          danger={confirmation.danger}
          busy={busy}
          error={error}
          close={() => {
            if (!busy) {
              setConfirmation(null);
              setError("");
            }
          }}
          confirm={() =>
            void run(async () => {
              await confirmation.action();
              setConfirmation(null);
            })
          }
        />
      )}
      {viewer && <DocumentViewer document={viewer} close={closeViewer} />}
    </div>
  );
}
