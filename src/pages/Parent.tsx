import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Helmet } from "react-helmet-async";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CreditCard,
  FileText,
  GraduationCap,
  Home,
  Landmark,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { parentFetch, parentRequest, ParentError } from "@/lib/parent-client";
import type {
  ParentChild,
  ParentInvoice,
  ParentSnapshot,
} from "@/lib/parent-types";
import { rand } from "@/lib/admin-types";
import "@fontsource/plus-jakarta-sans/latin-400.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "./parent.css";

const date = (value: string) =>
  new Date(
    value.length === 10 ? `${value}T12:00:00Z` : value,
  ).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  });
const month = (value: string) =>
  new Date(`${value.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
  });
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((v) => v[0])
    .join("")
    .toUpperCase();
const statusLabels: Record<string, string> = {
  active: "Active learner",
  pending_payment: "Awaiting first payment",
  suspended: "Tuition paused",
  withdrawn: "Withdrawn",
  archived: "Archived",
};
const childStatus = (child: ParentChild) =>
  child.status === "pending_payment" && child.readyForActivation
    ? "Awaiting Viva activation"
    : statusLabels[child.status] || child.status;
function Logo() {
  return (
    <a
      className="parent-brand"
      href="/parent"
      aria-label="Viva Tutorials parent portal"
    >
      <img src="/viva-tutorials-logo.png" alt="Viva Tutorials" />
      <span>Parent</span>
    </a>
  );
}
function ParentModal({
  title,
  close,
  children,
  busy = false,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const origin = document.activeElement as HTMLElement | null,
      previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
      origin?.focus();
    };
  }, []);
  return (
    <dialog
      className={`parent-modal ${wide ? "parent-document-modal" : ""}`}
      ref={ref}
      aria-labelledby={id}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <button
          className="parent-icon"
          disabled={busy}
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={21} />
        </button>
      </header>
      <div className="parent-modal-body">{children}</div>
    </dialog>
  );
}
function Empty({
  title,
  children,
  icon = <BookOpen size={25} />,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="parent-empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function InvoiceStatus({
  invoice,
  today,
}: {
  invoice: ParentInvoice;
  today: string;
}) {
  const kind =
    invoice.balance_cents === 0
      ? "paid"
      : invoice.due_date < today
        ? "overdue"
        : "pending";
  return (
    <span className={`parent-badge ${kind}`}>
      {kind === "paid"
        ? invoice.credited_cents === invoice.amount_cents
          ? "Credited"
          : "Settled"
        : kind === "overdue"
          ? "Overdue"
          : "Awaiting payment"}
    </span>
  );
}

export default function Parent() {
  const [data, setData] = useState<ParentSnapshot | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loginError, setLoginError] = useState(
      new URLSearchParams(window.location.search).get("signin") === "expired"
        ? "This sign-in link has expired or was already used. Enter your email below for a new link."
        : "",
    );
  const [email, setEmail] = useState(""),
    [linkSent, setLinkSent] = useState(false),
    [cooldown, setCooldown] = useState(0);
  const [selected, setSelected] = useState(""),
    [panel, setPanel] = useState<"home" | "finance" | "help">("home"),
    [selector, setSelector] = useState(false),
    [logout, setLogout] = useState(false);
  const [document, setDocument] = useState<{
      url: string;
      title: string;
      name: string;
    } | null>(null),
    [opening, setOpening] = useState("");
  const lock = useRef(false),
    alive = useRef(true);
  const revokeDocument = useCallback(
    () =>
      setDocument((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return null;
      }),
    [],
  );
  const expire = useCallback(
    (e: unknown) => {
      if (e instanceof ParentError && [401, 403].includes(e.status)) {
        setData(null);
        revokeDocument();
        setSelected("");
        setSelector(false);
        setLogout(false);
      }
      return e instanceof Error
        ? e.message
        : "The portal could not be loaded. Please try again.";
    },
    [revokeDocument],
  );
  const refresh = useCallback(
    async (initial = false) => {
      try {
        const snapshot = await parentRequest<ParentSnapshot>();
        if (!alive.current) return;
        setData(snapshot);
        setSelected((current) =>
          snapshot.children.some((c) => c.id === current)
            ? current
            : snapshot.children.length === 1
              ? snapshot.children[0].id
              : "",
        );
        setError("");
      } catch (e) {
        if (!alive.current) return;
        const message = expire(e);
        if (initial && e instanceof ParentError && e.status === 401) return;
        setError(message);
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [expire],
  );
  useEffect(() => {
    alive.current = true;
    void refresh(true);
    return () => {
      alive.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    if (!data) return;
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [data, refresh]);
  useEffect(() => {
    const url = document?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [document]);
  async function sendLink() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setLoginError("");
    try {
      await parentRequest({ action: "request_link", email });
      setLinkSent(true);
      setCooldown(60);
    } catch (e) {
      setLoginError(
        e instanceof Error ? e.message : "The email could not be requested.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function signOut() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setLoginError("");
    try {
      await parentRequest(undefined, "", "DELETE");
      setData(null);
      setSelected("");
      setEmail("");
      setLinkSent(false);
      setError("");
      setLogout(false);
      revokeDocument();
    } catch (e) {
      setLoginError(
        e instanceof Error ? e.message : "Sign-out could not be confirmed.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function openDocument(kind: string, id: string, title: string) {
    if (opening) return;
    setOpening(id + kind);
    setError("");
    try {
      const response = await parentFetch(
        `?action=document&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
      );
      if (!response.headers.get("Content-Type")?.startsWith("application/pdf"))
        throw new Error("The document could not be opened.");
      const blob = await response.blob();
      revokeDocument();
      setDocument({
        url: URL.createObjectURL(blob),
        title,
        name: title.replace(/[^a-zA-Z0-9_-]/g, "_") + ".pdf",
      });
    } catch (e) {
      setError(expire(e));
    } finally {
      setOpening("");
    }
  }
  const child = data?.children.find((c) => c.id === selected);
  const choose = (c: ParentChild) => {
    setSelected(c.id);
    setSelector(false);
    setPanel("home");
    setError("");
    revokeDocument();
    window.scrollTo({ top: 0 });
  };
  const go = (value: typeof panel) => {
    setPanel(value);
    window.scrollTo({ top: 0 });
  };
  const metadata = (
    <Helmet>
      <title>Parent Portal | Viva Tutorials</title>
      <meta name="robots" content="noindex,nofollow" />
      <meta
        name="description"
        content="Your secure Viva Tutorials family account."
      />
    </Helmet>
  );
  if (loading)
    return (
      <div className="parent-app parent-loading">
        {metadata}
        <Logo />
        <Loader2 className="parent-spin" size={30} />
        <p>Opening your parent portal…</p>
      </div>
    );
  if (!data)
    return (
      <div className="parent-app parent-login">
        {metadata}
        <div className="parent-login-story">
          <Logo />
          <span className="parent-eyebrow">Together, we help them grow.</span>
          <h1>
            A little closer to
            <br />
            their next big step.
          </h1>
          <p>
            Your child’s Viva journey, account and important documents. All in
            one place.
          </p>
          <div>
            <GraduationCap size={22} />
            <span>
              Personal support.
              <br />
              <strong>Purposeful learning.</strong>
            </span>
          </div>
        </div>
        <main className="parent-login-card" id="main-content">
          <a href="/" className="parent-back">
            <ArrowLeft size={16} /> Back to Viva Tutorials
          </a>
          <span className="parent-login-symbol">
            <Users size={27} />
          </span>
          <p className="parent-eyebrow">Your family, connected</p>
          <h2>{linkSent ? "Check your inbox" : "Welcome, parent."}</h2>
          <p>
            {linkSent ? (
              <>
                If access is enabled for{" "}
                <strong>{email.trim().toLowerCase()}</strong>, you’ll receive an
                email. Open it and tap “Open my parent portal”.
              </>
            ) : (
              "Sign in with the guardian email on your enrollment. We’ll email you a sign-in link."
            )}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendLink();
            }}
          >
            {!linkSent && (
              <label>
                Guardian email
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  maxLength={254}
                  required
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            )}
            {linkSent && (
              <div className="parent-link-sent" role="status">
                <Mail size={32} />
                <h3>One tap and you’re in.</h3>
                <p>
                  Open the email from Viva Tutorials, then tap{" "}
                  <strong>Open my parent portal</strong>. You don’t need to type
                  a code.
                </p>
              </div>
            )}
            {(loginError || error) && (
              <p role="alert" className="parent-error">
                {loginError || error}
              </p>
            )}
            {!linkSent && (
              <button className="parent-primary" disabled={busy}>
                {busy ? <Loader2 className="parent-spin" size={18} /> : null}
                Email me a sign-in link
                <ArrowRight size={18} />
              </button>
            )}
          </form>
          {linkSent && (
            <div className="parent-login-actions">
              <button
                disabled={busy || cooldown > 0}
                onClick={() => void sendLink()}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Send another email"}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setLinkSent(false);
                  setLoginError("");
                }}
              >
                Use a different email
              </button>
            </div>
          )}
          <div className="parent-trust">
            <ShieldCheck size={18} />
            <p>
              No password or PIN to remember. Access must first be enabled by
              Viva for your guardian email.
            </p>
          </div>
          <p className="parent-login-help">
            Need access or changed your email?
            <br />
            <a href="mailto:info@vivatutorials.co.za">
              Contact Viva Tutorials <ArrowUpRight size={14} />
            </a>
          </p>
        </main>
      </div>
    );
  if (!child || selector)
    return (
      <div className="parent-app parent-family-select">
        {metadata}
        <header>
          <Logo />
          <button className="parent-ghost" onClick={() => setLogout(true)}>
            <LogOut size={17} /> Sign out
          </button>
        </header>
        <main id="main-content">
          <p className="parent-eyebrow">
            Welcome back, {data.parent.name.split(" ")[0]}
          </p>
          <h1>
            Who are we checking
            <br />
            in on today?
          </h1>
          <p>Choose a learner to open their Viva journey.</p>
          <div className="parent-child-grid">
            {data.children.map((c) => (
              <button
                key={c.id}
                className="parent-child-card"
                onClick={() => choose(c)}
              >
                <span className="parent-avatar">{initials(c.name)}</span>
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {c.grade} · {c.mode}
                  </small>
                  <span
                    className={`parent-badge ${c.status === "active" ? "paid" : "pending"}`}
                  >
                    {childStatus(c)}
                  </span>
                </span>
                <ChevronRight size={23} />
              </button>
            ))}
          </div>
          <p className="parent-select-help">
            A learner missing? Contact{" "}
            <a href="mailto:info@vivatutorials.co.za">
              info@vivatutorials.co.za
            </a>{" "}
            so we can check your guardian details.
          </p>
        </main>
        {logout && (
          <ParentModal
            title="Sign out of Viva?"
            close={() => setLogout(false)}
            busy={busy}
          >
            <p>
              Your family details will close on this device. You can sign in
              again with a sign-in link.
            </p>
            {loginError && (
              <p className="parent-error" role="alert">
                {loginError}
              </p>
            )}
            <div className="parent-modal-actions">
              <button
                className="parent-danger"
                disabled={busy}
                onClick={() => void signOut()}
              >
                Sign out
              </button>
              <button disabled={busy} onClick={() => setLogout(false)}>
                Stay signed in
              </button>
            </div>
          </ParentModal>
        )}
      </div>
    );
  const invoices = data.invoices.filter((i) => i.application_id === child.id),
    outstanding = child.outstandingCents;
  return (
    <div className="parent-app parent-workspace">
      {metadata}
      <aside className="parent-sidebar">
        <Logo />
        <div className="parent-sidebar-family">
          <span className="parent-avatar">{initials(data.parent.name)}</span>
          <div>
            <strong>{data.parent.name}</strong>
            <small>Family workspace</small>
          </div>
        </div>
        <p className="parent-eyebrow">Your portal</p>
        <nav aria-label="Parent sections">
          {(
            [
              ["home", Home, "Learner home"],
              ["finance", Wallet, "Family finances"],
              ["help", CircleHelp, "Help & contact"],
            ] as const
          ).map(([key, Icon, title]) => (
            <button
              aria-current={panel === key ? "page" : undefined}
              key={key}
              className={panel === key ? "active" : ""}
              onClick={() => go(key)}
            >
              <Icon size={21} />
              {title}
              <ChevronRight size={15} />
            </button>
          ))}
        </nav>
        <div className="parent-sidebar-bottom">
          <div>
            <ShieldCheck size={20} />
            <p>
              A secure space
              <br />
              for your family.
            </p>
          </div>
          <button onClick={() => setLogout(true)}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>
      <div className="parent-workspace-body">
        <header className="parent-header">
          <div className="parent-mobile-brand">
            <Logo />
          </div>
          <div className="parent-desktop-breadcrumb">
            Parent portal <ChevronRight size={14} />
            <strong>
              {panel === "home"
                ? "Learner home"
                : panel === "finance"
                  ? "Family finances"
                  : "Help & contact"}
            </strong>
          </div>
          <div className="parent-header-actions">
            <button
              className="parent-icon"
              title="Refresh account"
              aria-label="Refresh account"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void refresh().finally(() => setBusy(false));
              }}
            >
              <RefreshCw size={18} className={busy ? "parent-spin" : ""} />
            </button>
            {data.children.length > 1 && (
              <button
                className="parent-switch"
                aria-label="Switch learner"
                onClick={() => setSelector(true)}
              >
                <Users size={17} />
                <span>Switch learner</span>
                <ChevronDown size={15} />
              </button>
            )}
            <button
              className="parent-icon"
              aria-label="Sign out"
              onClick={() => setLogout(true)}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main id="main-content" className="parent-main">
          {error && (
            <div role="alert" className="parent-error parent-page-error">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={17} />
              </button>
            </div>
          )}
          {panel === "home" && (
            <>
              <section className="parent-hero">
                <div>
                  <p className="parent-eyebrow">Every step matters</p>
                  <div className="parent-learner-heading">
                    <span className="parent-avatar">
                      {initials(child.name)}
                    </span>
                    <div>
                      <h1>{child.name}</h1>
                      <p>
                        {child.grade} <span>·</span> {child.mode} <span>·</span>{" "}
                        {child.studentNumber}
                      </p>
                    </div>
                  </div>
                  <span className="parent-status">
                    <span />
                    {childStatus(child)}
                  </span>
                </div>
                <div className="parent-hero-note">
                  <GraduationCap size={38} />
                  <p>
                    Small steps today.
                    <br />
                    <strong>Brighter possibilities tomorrow.</strong>
                  </p>
                </div>
                <div className="parent-hero-stats">
                  <div>
                    <span>Subjects</span>
                    <strong>{child.subjects.length}</strong>
                  </div>
                  <div>
                    <span>Monthly tuition</span>
                    <strong>{rand(child.monthlyFeeCents)}</strong>
                  </div>
                  <div>
                    <span>Programme starts</span>
                    <strong>
                      {child.startDate
                        ? date(child.startDate)
                        : "To be confirmed"}
                    </strong>
                  </div>
                </div>
              </section>
              <div className="parent-home-grid">
                <section className="parent-card parent-account-callout">
                  <div className="parent-card-heading">
                    <span className="parent-tile">
                      <Wallet size={21} />
                    </span>
                    <div>
                      <p className="parent-eyebrow">
                        {child.name.split(" ")[0]}’s tuition
                      </p>
                      <h2>
                        {outstanding > 0
                          ? "A quick account check-in"
                          : "You’re up to date"}
                      </h2>
                    </div>
                  </div>
                  <div className="parent-account-amount">
                    {rand(outstanding)}
                    <span>outstanding for this learner</span>
                  </div>
                  <p>
                    {child.status === "pending_payment"
                      ? child.readyForActivation
                        ? "Your first invoice is settled. Viva will confirm activation."
                        : "The first invoice must be settled before Viva activates the learner."
                      : "Your family’s payments, credit and documents are always available in Finances."}
                  </p>
                  {child.arrangementUntil && (
                    <p className="parent-notice">
                      A payment arrangement is recorded until{" "}
                      {date(child.arrangementUntil)}. Your agreed due dates and
                      balance still apply.
                    </p>
                  )}
                  <button
                    className="parent-link-button"
                    onClick={() => go("finance")}
                  >
                    View family finances <ArrowRight size={17} />
                  </button>
                </section>
                <section className="parent-card">
                  <div className="parent-card-heading">
                    <span className="parent-tile orange">
                      <CalendarDays size={21} />
                    </span>
                    <div>
                      <p className="parent-eyebrow">Make room for learning</p>
                      <h2>Weekly programme</h2>
                    </div>
                  </div>
                  <p>{child.programme || "Your agreed learning programme"}</p>
                  <div className="parent-week">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (day, index) => (
                        <div
                          key={day}
                          className={
                            child.schedule?.includes(index + 1)
                              ? "scheduled"
                              : ""
                          }
                        >
                          <span>{day}</span>
                          <span>
                            {child.schedule?.includes(index + 1) ? (
                              <CheckCircle2 size={18} />
                            ) : (
                              "—"
                            )}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                  <p className="parent-muted">
                    Programme days from your enrollment, February–November. Viva
                    confirms class times and any closures separately. This is
                    not an attendance record.
                  </p>
                  {child.billingEndDate && (
                    <p className="parent-notice">
                      Final billing date: {date(child.billingEndDate)}.
                    </p>
                  )}
                </section>
                <section className="parent-card parent-subjects">
                  <div className="parent-card-heading">
                    <span className="parent-tile">
                      <BookOpen size={21} />
                    </span>
                    <div>
                      <p className="parent-eyebrow">Their learning journey</p>
                      <h2>Enrolled subjects</h2>
                    </div>
                  </div>
                  {child.subjects.length ? (
                    <div className="parent-subject-chips">
                      {child.subjects.map((subject) => (
                        <span key={subject}>{subject}</span>
                      ))}
                    </div>
                  ) : (
                    <p>
                      No subjects are listed. Contact Viva to confirm the
                      programme.
                    </p>
                  )}
                  {child.school && (
                    <p className="parent-muted">School: {child.school}</p>
                  )}
                </section>
                <section className="parent-card">
                  <h2>Attendance</h2>
                  <Empty
                    title="Attendance tracking is coming"
                    icon={<CalendarDays size={25} />}
                  >
                    Class attendance has not been connected to this portal yet.
                    Contact Viva for a current attendance update.
                  </Empty>
                </section>
                <section className="parent-card">
                  <h2>Results & progress</h2>
                  <Empty title="Their next chapter starts here">
                    Tutor assessments and progress reports will appear once the
                    academic tools are connected. Enrollment marks are not shown
                    as current results.
                  </Empty>
                </section>
                <section className="parent-card parent-contact-card">
                  <Mail size={25} />
                  <h2>A conversation can make a difference.</h2>
                  <p>
                    Questions about tuition or your child’s learning? We’re here
                    to help.
                  </p>
                  <a
                    className="parent-primary"
                    href={`mailto:info@vivatutorials.co.za?subject=${encodeURIComponent("Parent enquiry · " + child.studentNumber)}`}
                  >
                    Contact Viva <ArrowUpRight size={18} />
                  </a>
                </section>
              </div>
            </>
          )}
          {panel === "finance" && (
            <>
              <section className="parent-finance-hero">
                <p className="parent-eyebrow">Clarity for your family</p>
                <h1>Your family finances.</h1>
                <p>
                  One account for the reviewed learners linked to your guardian
                  email.
                </p>
                <div className="parent-finance-stats">
                  <div>
                    <span>Outstanding tuition</span>
                    <strong>{rand(data.totals.outstandingCents)}</strong>
                  </div>
                  <div>
                    <span>Overdue tuition</span>
                    <strong>{rand(data.totals.overdueCents)}</strong>
                  </div>
                  <div>
                    <span>Available family credit</span>
                    <strong>{rand(data.totals.availableCreditCents)}</strong>
                  </div>
                </div>
                <button
                  className="parent-ghost"
                  disabled={!!opening}
                  onClick={() =>
                    void openDocument(
                      "statement",
                      child.id,
                      "Family account statement",
                    )
                  }
                >
                  <FileText size={17} />
                  {opening === child.id + "statement"
                    ? "Preparing…"
                    : "View family statement"}
                </button>
              </section>
              <div className="parent-finance-grid">
                <div className="parent-finance-history">
                  <section className="parent-card">
                    <div className="parent-card-heading">
                      <span className="parent-tile">
                        <FileText size={21} />
                      </span>
                      <div>
                        <p className="parent-eyebrow">{child.name}</p>
                        <h2>Invoices</h2>
                      </div>
                    </div>
                    <p>
                      Invoices below belong to the selected learner. Receipts
                      and available credit cover your family account.
                    </p>
                    {data.historyLimited && (
                      <p className="parent-notice">
                        Showing recent history only. Totals include all records.
                        Contact Viva for an extended statement.
                      </p>
                    )}
                    {invoices.length ? (
                      invoices.map((invoice) => (
                        <article className="parent-invoice" key={invoice.id}>
                          <div>
                            <div>
                              <h3>{month(invoice.billing_month)}</h3>
                              <small>{invoice.number}</small>
                            </div>
                            <strong>
                              {rand(
                                invoice.amount_cents - invoice.credited_cents,
                              )}
                            </strong>
                          </div>
                          <p>
                            {date(invoice.period_start)} –{" "}
                            {date(invoice.period_end)}
                          </p>
                          <div>
                            <InvoiceStatus
                              invoice={invoice}
                              today={data.today}
                            />
                            <span>Due {date(invoice.due_date)}</span>
                          </div>
                          {invoice.credited_cents > 0 && (
                            <p>
                              Original charge {rand(invoice.amount_cents)} ·
                              Credits {rand(invoice.credited_cents)}
                            </p>
                          )}
                          <div className="parent-invoice-bottom">
                            <strong>
                              {rand(invoice.balance_cents)} outstanding
                            </strong>
                            <button
                              disabled={!!opening}
                              onClick={() =>
                                void openDocument(
                                  "invoice",
                                  invoice.id,
                                  `Invoice ${invoice.number}`,
                                )
                              }
                            >
                              <FileText size={15} />
                              {opening === invoice.id + "invoice"
                                ? "Preparing…"
                                : "View invoice"}
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <Empty
                        title="No invoices yet"
                        icon={<FileText size={25} />}
                      >
                        Viva will issue the first invoice after reviewing the
                        application.
                      </Empty>
                    )}
                  </section>
                  <section className="parent-card">
                    <div className="parent-card-heading">
                      <span className="parent-tile green">
                        <CreditCard size={21} />
                      </span>
                      <div>
                        <p className="parent-eyebrow">Money received by Viva</p>
                        <h2>Family receipts</h2>
                      </div>
                    </div>
                    {data.receipts.length ? (
                      data.receipts.map((receipt) => (
                        <article className="parent-invoice" key={receipt.id}>
                          <div>
                            <div>
                              <h3>{receipt.number}</h3>
                              <small>
                                {date(receipt.paid_on)} · {receipt.method}
                              </small>
                            </div>
                            <strong>{rand(receipt.amount_cents)}</strong>
                          </div>
                          <p className="parent-reference">
                            Reference: {receipt.reference}
                          </p>
                          {receipt.reversed_at ? (
                            <p className="parent-notice">
                              Reversed — retained for your records.
                            </p>
                          ) : (
                            <>
                              <div className="parent-allocation-list">
                                {receipt.allocations.map(
                                  (allocation, index) => (
                                    <p key={index}>
                                      <span>
                                        {allocation.learner}
                                        <small>
                                          {allocation.invoiceNumber}
                                        </small>
                                      </span>
                                      <strong>
                                        {rand(allocation.amountCents)}
                                      </strong>
                                    </p>
                                  ),
                                )}
                              </div>
                              <p>
                                Available credit from this payment:{" "}
                                <strong>{rand(receipt.available_cents)}</strong>
                              </p>
                            </>
                          )}
                          <button
                            disabled={!!opening}
                            onClick={() =>
                              void openDocument(
                                "account_receipt",
                                receipt.id,
                                `Receipt ${receipt.number}`,
                              )
                            }
                          >
                            <FileText size={15} />
                            {opening === receipt.id + "account_receipt"
                              ? "Preparing…"
                              : "View receipt"}
                          </button>
                        </article>
                      ))
                    ) : (
                      <Empty
                        title="No payments recorded yet"
                        icon={<Wallet size={25} />}
                      >
                        Verified EFT and cash payments will appear here after
                        Viva records them.
                      </Empty>
                    )}
                  </section>
                  {(data.creditNotes.length > 0 || data.refunds.length > 0) && (
                    <section className="parent-card">
                      <h2>Credits & refunds</h2>
                      {data.creditNotes.map((credit) => (
                        <article className="parent-adjustment" key={credit.id}>
                          <div>
                            <strong>{credit.number}</strong>
                            <small>
                              Credit against {credit.invoice_number} ·{" "}
                              {date(credit.issued_on)}
                              {credit.reversed_at ? " · Reversed" : ""}
                            </small>
                          </div>
                          <strong>{rand(credit.amount_cents)}</strong>
                          <button
                            disabled={!!opening}
                            onClick={() =>
                              void openDocument(
                                "credit_note",
                                credit.id,
                                `Credit note ${credit.number}`,
                              )
                            }
                          >
                            View credit note
                          </button>
                        </article>
                      ))}
                      {data.refunds.map((refund) => (
                        <article className="parent-adjustment" key={refund.id}>
                          <div>
                            <strong>{refund.number}</strong>
                            <small>
                              Refund · {date(refund.paid_on)} · {refund.method}
                              {refund.reversed_at ? " · Reversed" : ""}
                            </small>
                          </div>
                          <strong>{rand(refund.amount_cents)}</strong>
                          <button
                            disabled={!!opening}
                            onClick={() =>
                              void openDocument(
                                "refund",
                                refund.id,
                                `Refund ${refund.number}`,
                              )
                            }
                          >
                            View refund
                          </button>
                        </article>
                      ))}
                    </section>
                  )}
                </div>
                <aside className="parent-payment-aside">
                  <section className="parent-card">
                    <div className="parent-card-heading">
                      <span className="parent-tile orange">
                        <Landmark size={21} />
                      </span>
                      <h2>How to pay</h2>
                    </div>
                    <p>
                      We accept EFT or cash. Monthly tuition is due on the{" "}
                      <strong>1st</strong>; unpaid reminders begin on the{" "}
                      <strong>3rd</strong>.
                    </p>
                    {data.paymentDetails ? (
                      <dl className="parent-bank-details">
                        {[
                          ["Account name", data.paymentDetails.accountName],
                          ["Bank", data.paymentDetails.bank],
                          ["Account type", data.paymentDetails.accountType],
                          ["Account number", data.paymentDetails.accountNumber],
                          ["Branch code", data.paymentDetails.branchCode],
                          ["Payment reference", child.studentNumber],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="parent-notice">
                        Contact Viva for confirmed banking details before making
                        an EFT.
                      </p>
                    )}
                    <p>
                      Use the selected learner’s student number as your EFT
                      reference. For a payment covering siblings, tell Viva how
                      you want it allocated.
                    </p>
                    <div className="parent-trust">
                      <ShieldCheck size={20} />
                      <p>
                        Payments appear after Viva verifies the funds. This
                        portal does not initiate a bank transfer or record a
                        payment automatically.
                      </p>
                    </div>
                    <a
                      className="parent-primary"
                      href={`mailto:info@vivatutorials.co.za?subject=${encodeURIComponent("Tuition payment · " + child.studentNumber)}`}
                    >
                      Ask about a payment <ArrowUpRight size={17} />
                    </a>
                  </section>
                  <section className="parent-card parent-finance-note">
                    <CalendarDays size={22} />
                    <h3>A little planning helps.</h3>
                    <p>
                      Teaching and routine tuition billing run
                      February–November. Existing unpaid balances remain payable
                      during December and January.
                    </p>
                    <p>
                      Available credit must be allocated by Viva; it does not
                      automatically settle an invoice.
                    </p>
                  </section>
                </aside>
              </div>
            </>
          )}
          {panel === "help" && (
            <>
              <section className="parent-page-heading">
                <p className="parent-eyebrow">We’re here for your family</p>
                <h1>Let’s stay in touch.</h1>
                <p>
                  Quote {child.studentNumber} when contacting us about{" "}
                  {child.name}.
                </p>
              </section>
              <div className="parent-help-grid">
                <section className="parent-card">
                  <Mail size={26} />
                  <h2>Talk to Viva</h2>
                  <p>
                    For learning support, class times, tuition questions and
                    changes to your contact details.
                  </p>
                  <a
                    className="parent-primary"
                    href={`mailto:info@vivatutorials.co.za?subject=${encodeURIComponent("Parent enquiry · " + child.studentNumber)}`}
                  >
                    Email Viva Tutorials <ArrowUpRight size={17} />
                  </a>
                  <a className="parent-contact-link" href="tel:+27733913206">
                    Call +27 73 391 3206
                  </a>
                </section>
                <section className="parent-card">
                  <ShieldCheck size={26} />
                  <h2>Your account, protected</h2>
                  <p>
                    Signed in as <strong>{data.parent.email}</strong>. Keep your
                    email account secure and never share sign-in links.
                  </p>
                  <p>
                    To change a guardian email or resolve a missing learner,
                    contact Viva so staff can verify and update the correct
                    family record.
                  </p>
                  <button
                    className="parent-link-button"
                    onClick={() => setLogout(true)}
                  >
                    Sign out on this device <LogOut size={17} />
                  </button>
                </section>
                <section className="parent-card">
                  <h2>Payment questions</h2>
                  <details>
                    <summary>Why is an EFT not showing yet?</summary>
                    <p>
                      Viva records a payment once the funds are verified. If it
                      is missing, contact the team with your payment date,
                      amount and reference.
                    </p>
                  </details>
                  <details>
                    <summary>What does available credit mean?</summary>
                    <p>
                      Money received that has not been allocated to an invoice
                      or refunded. Contact Viva to request an allocation.
                      Invoice balances and credit are shown separately.
                    </p>
                  </details>
                  <details>
                    <summary>What if we need a payment arrangement?</summary>
                    <p>
                      Contact Viva to agree terms. A recorded arrangement pauses
                      unpaid reminders and unpaid-tuition suspension until its
                      end date; it does not erase tuition owed.
                    </p>
                  </details>
                </section>
              </div>
            </>
          )}
          <footer className="parent-footer">
            <span>Viva Tutorials</span>
            <p>Personal support. Purposeful learning.</p>
            <a href="/privacy-policy">Privacy</a>
          </footer>
        </main>
      </div>
      <nav className="parent-bottom-nav" aria-label="Mobile parent sections">
        {(
          [
            ["home", Home, "Home"],
            ["finance", Wallet, "Finances"],
            ["help", CircleHelp, "Help"],
          ] as const
        ).map(([key, Icon, title]) => (
          <button
            key={key}
            aria-current={panel === key ? "page" : undefined}
            className={panel === key ? "active" : ""}
            onClick={() => go(key)}
          >
            <span>
              <Icon size={22} />
            </span>
            {title}
          </button>
        ))}
        <button onClick={() => setLogout(true)}>
          <span>
            <LogOut size={22} />
          </span>
          Sign out
        </button>
      </nav>
      {logout && (
        <ParentModal
          title="Sign out of Viva?"
          close={() => setLogout(false)}
          busy={busy}
        >
          <span className="parent-signout-icon">
            <LogOut size={30} />
          </span>
          <p>
            Your family details will close on this device. Sign in again with a
            new sign-in link whenever you need to.
          </p>
          {loginError && (
            <p className="parent-error" role="alert">
              {loginError}
            </p>
          )}
          <div className="parent-modal-actions">
            <button
              className="parent-danger"
              disabled={busy}
              onClick={() => void signOut()}
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
            <button disabled={busy} onClick={() => setLogout(false)}>
              Stay signed in
            </button>
          </div>
        </ParentModal>
      )}
      {document && (
        <ParentModal title={document.title} close={revokeDocument} wide>
          <div className="parent-document-toolbar">
            <p>
              Your private document. Download it if the preview is unavailable.
            </p>
            <a href={document.url} download={document.name}>
              <ArrowDownToLine size={17} /> Download PDF
            </a>
          </div>
          <iframe title={document.title} src={document.url} />
          <p className="parent-muted">
            Keep downloaded documents private, especially on shared devices.
          </p>
        </ParentModal>
      )}
    </div>
  );
}
