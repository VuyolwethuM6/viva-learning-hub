import { VivaLoader } from "@/components/VivaLoader";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CalendarDays,
  Database,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Users,
  Mail,
  ArrowRight,
  Info,
} from "lucide-react";
import { systemRequest } from "@/lib/system-client";
import { auditTime } from "@/lib/admin-format";
import { rand } from "@/lib/admin-types";
import type {
  SystemHealth,
  SystemSettings,
  SystemTarget,
} from "@/lib/system-types";
import { Dialog } from "./AdminPrimitives";
import "./system-workspace.css";

type Spec = {
  title: string;
  operation: string;
  fields: ReactNode;
  build: (f: FormData) => Record<string, unknown>;
};
const text = (f: FormData, key: string) => String(f.get(key) || "").trim();
const roleName = (role: string) =>
  ({ owner: "Owner", bookkeeper: "Bookkeeper", viewer: "Finance viewer" })[
    role
  ] || role;
const backupName = (method: string) =>
  ({
    provider_review: "Provider backup review",
    export_review: "Export review",
    restore_test: "Restore test",
  })[method] || method;
function Reason({
  options = [
    "Grant operational access",
    "Change responsibilities",
    "Staff access no longer required",
    "Correction after review",
  ],
}: {
  options?: string[];
}) {
  return (
    <label>
      Reason
      <select name="reason" aria-label="Reason" required>
        {options.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}
function StaffAccountPicker({
  accounts,
}: {
  accounts: SystemSettings["candidates"];
}) {
  const [choice, setChoice] = useState(accounts.length ? "" : "email");
  return (
    <>
      <label>
        Verified staff account
        <select
          aria-label="Verified staff account"
          name="userId"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          required
        >
          <option value="" disabled>
            Choose an account…
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.email}
            </option>
          ))}
          <option value="email">Look up a verified email instead</option>
        </select>
      </label>
      {choice === "email" && (
        <label>
          Verified staff email
          <input
            name="userEmail"
            type="email"
            maxLength={254}
            autoComplete="off"
            required
          />
        </label>
      )}
      <p className="admin-muted">
        Create and verify the staff Auth account in Supabase first. Granting
        admin access does not create a password.
      </p>
    </>
  );
}
function ChangeDialog({
  spec,
  data,
  close,
  saved,
  notice,
}: {
  spec: Spec;
  data: SystemSettings | null;
  close: () => void;
  saved: () => Promise<void>;
  notice: (message: string) => void;
}) {
  const [review, setReview] = useState<Record<string, unknown> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const labels: Record<string, string> = {
    userId: "Staff account",
    userEmail: "Staff email",
    enabled: "Admin access",
    role: "Finance role",
    reason: "Reason / review note",
    day: "Closure date",
    checkedOn: "Date checked",
    method: "What was checked",
    automationEnabled: "Scheduled accounting",
    autoSend: "Automatic email dispatch",
    booksStart: "Books start date",
  };
  async function save() {
    if (!review || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await systemRequest<{ state?: string }>("settings", {
        operation: spec.operation,
        data: review,
      });
      await saved();
      if ("state" in result && result.state !== "accepted") {
        setError(
          result.state === "failed"
            ? "The provider rejected the test. Check sender configuration in Vercel and Resend."
            : "The request is pending or uncertain. Check Resend before starting another test. This request will not be resent automatically.",
        );
        return;
      }
      notice(
        "state" in result
          ? result.state === "accepted"
            ? "Resend accepted the test. Check your own inbox; acceptance is not delivery confirmation."
            : result.state === "failed"
              ? "The provider rejected the test. Check the sender configuration in Vercel and Resend."
              : "The test is pending or uncertain. Check Resend before requesting another email."
          : "Settings saved and recorded in Audit.",
      );
      close();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The change could not be confirmed. Refresh before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  const display = (key: string, value: unknown) => {
    if (key === "userId")
      return (
        [...(data?.admins || []), ...(data?.candidates || [])].find(
          (a) => a.id === value,
        )?.email || "Selected staff account"
      );
    if (key === "role") return roleName(String(value));
    if (key === "method") return backupName(String(value));
    return typeof value === "boolean"
      ? value
        ? "Enabled"
        : "Disabled"
      : String(value);
  };
  return (
    <Dialog title={spec.title} variant="confirm" close={close} busy={busy}>
      {!review ? (
        <form
          className="finance-form oversight-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            try {
              const payload = spec.build(new FormData(e.currentTarget));
              setReview({
                ...payload,
                ...(spec.operation !== "test_email"
                  ? { revision: data?.revision }
                  : {}),
                requestId: crypto.randomUUID(),
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Review your choices.");
            }
          }}
        >
          {spec.fields}
          <button className="admin-primary" type="submit">
            Review choices <ArrowRight size={16} />
          </button>
        </form>
      ) : (
        <>
          <p className="admin-muted">Confirm the change before saving.</p>
          <dl className="oversight-review">
            {Object.entries(review)
              .filter(
                ([key]) =>
                  !["requestId", "revision"].includes(key) &&
                  !key.startsWith("expected"),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{labels[key] || key}</dt>
                  <dd>{display(key, value)}</dd>
                </div>
              ))}
          </dl>
          <div className="confirm-actions">
            <button
              className="admin-primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy && <VivaLoader size="button" decorative />}
              {busy
                ? "Saving…"
                : spec.operation === "test_email"
                  ? "Send test to my email"
                  : "Confirm and save"}
            </button>
            <button disabled={busy} onClick={() => setReview(null)}>
              Back
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
function RunHistory({ data }: { data: SystemHealth | SystemSettings }) {
  return (
    <div className="oversight-grid">
      <section className="admin-card">
        <h2>
          <Clock size={20} /> Accounting run history
        </h2>
        <p className="admin-muted">
          Latest 20 observations from this release. Scheduled and manual runs
          are labelled separately.
        </p>
        <div className="oversight-records">
          {data.jobs.map((j) => (
            <article key={j.id}>
              <div>
                <strong>
                  {j.source === "scheduled" ? "Scheduled run" : "Manual run"}
                </strong>
                <span
                  className={`oversight-status ${j.state === "failed" ? "attention" : j.state === "completed" ? "ok" : "info"}`}
                >
                  {j.state}
                </span>
              </div>
              <p>
                {auditTime(j.started_at)}
                {j.finished_at ? ` · Finished ${auditTime(j.finished_at)}` : ""}
              </p>
              {j.state !== "running" && (
                <small>
                  {Number(j.result.sent || 0)} emails processed
                  {j.result.failed ? ` · ${j.result.failed} failed` : ""}
                  {j.result.stale ? ` · ${j.result.stale} balance reviews` : ""}
                  {j.result.dispatch === "disabled"
                    ? " · Email dispatch disabled"
                    : ""}
                </small>
              )}
            </article>
          ))}
        </div>
        {!data.jobs.length && (
          <p className="oversight-empty">
            No run observations yet. Existing accounting run details remain in
            Finance Controls.
          </p>
        )}
      </section>
      <section className="admin-card">
        <h2>
          <Mail size={20} /> Email service checks
        </h2>
        <p className="admin-muted">
          Owner-requested Resend tests. These do not test Supabase sign-in
          email.
        </p>
        <div className="oversight-records">
          {data.emailTests.map((t) => (
            <article key={t.id}>
              <strong>
                {t.state === "accepted"
                  ? "Accepted by provider"
                  : t.state === "uncertain"
                    ? "Provider result uncertain"
                    : t.state === "failed"
                      ? "Rejected by provider"
                      : "Request pending"}
              </strong>
              <p>{auditTime(t.requested_at)}</p>
            </article>
          ))}
        </div>
        {!data.emailTests.length && (
          <p className="oversight-empty">No email tests recorded.</p>
        )}
      </section>
    </div>
  );
}
export function SystemWorkspace({
  section,
  user,
  onNavigate,
  changed,
}: {
  section: "System health" | "Settings";
  user: { id: string; email: string };
  onNavigate: (target: SystemTarget) => void;
  changed: () => Promise<unknown>;
}) {
  const [health, setHealth] = useState<SystemHealth | null>(null),
    [settings, setSettings] = useState<SystemSettings | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("Overview"),
    [filter, setFilter] = useState("All checks"),
    [spec, setSpec] = useState<Spec | null>(null);
  const mode = section === "Settings" ? "settings" : "health";
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (mode === "settings")
        setSettings(await systemRequest<SystemSettings>("settings"));
      else setHealth(await systemRequest<SystemHealth>("health"));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "System information could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, [mode]);
  useEffect(() => {
    void load();
  }, [load]);
  const data = mode === "health" ? health : settings;
  const owner = data && ("role" in data ? data.role === "owner" : false);
  const refresh = async () => {
    await load();
    await changed();
  };
  const configureAutomation = () => {
    if (!settings) return;
    setSpec({
      title: "Configure accounting automation",
      operation: "automation",
      fields: (
        <>
          <p>
            Changes use the same accounting settings as Finance Controls. The
            scheduled task runs daily at 08:05 South African time.
          </p>
          <label className="admin-check">
            <input
              type="checkbox"
              name="automationEnabled"
              defaultChecked={settings.accounting.automation_enabled}
            />
            Enable scheduled accounting
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              name="autoSend"
              defaultChecked={settings.accounting.auto_send}
            />
            Automatically dispatch never-attempted queued emails
          </label>
          <p className="admin-muted">
            Enabling requires the server scheduler secret. Email dispatch also
            requires the sender configuration and confirmed bank details.
            Previously attempted messages require manual review.
          </p>
          <Reason
            options={[
              "Automation configuration reviewed",
              "Pause automated work for review",
              "Enable configured scheduled accounting",
            ]}
          />
        </>
      ),
      build: (f) => ({
        expectedAutomationEnabled: settings.accounting.automation_enabled,
        expectedAutoSend: settings.accounting.auto_send,
        automationEnabled: f.get("automationEnabled") === "on",
        autoSend: f.get("autoSend") === "on",
        reason: text(f, "reason"),
      }),
    });
  };
  const testEmail = () =>
    setSpec({
      title: "Test the application email service",
      operation: "test_email",
      fields: (
        <>
          <p>
            Send one test to <strong>{user.email}</strong>. Check your inbox
            after the provider accepts it.
          </p>
          <p className="admin-muted">
            This checks Resend, not Supabase sign-in email. Wait at least one
            minute between tests. An uncertain response will not be resent
            automatically.
          </p>
        </>
      ),
      build: () => ({}),
    });
  function accessSpec(account?: SystemSettings["admins"][number]) {
    if (!settings) return;
    setSpec({
      title: account ? "Review staff access" : "Grant staff admin access",
      operation: "admin_access",
      fields: (
        <>
          {account ? (
            <p>
              <strong>{account.email}</strong>
            </p>
          ) : (
            <StaffAccountPicker accounts={settings.candidates} />
          )}
          <p className="admin-notice">
            All admins can oversee applications and teaching. The finance role
            controls financial changes. Only owners may change system settings
            or other staff permissions.
          </p>
          <label>
            Admin access
            <select
              aria-label="Admin access"
              name="enabled"
              defaultValue={account?.enabled === false ? "no" : "yes"}
            >
              <option value="yes">Enabled</option>
              {account && <option value="no">Disabled</option>}
            </select>
          </label>
          <label>
            Finance role
            <select
              aria-label="Finance role"
              name="role"
              defaultValue={account?.role || "viewer"}
            >
              <option value="viewer">
                Finance viewer · read financial records
              </option>
              <option value="bookkeeper">
                Bookkeeper · record financial operations
              </option>
              <option value="owner">
                Owner · control finance and staff permissions
              </option>
            </select>
          </label>
          <Reason />
        </>
      ),
      build: (f) => {
        const selected = account?.id || text(f, "userId");
        return {
          ...(selected === "email"
            ? { userEmail: text(f, "userEmail") }
            : { userId: selected }),
          enabled: text(f, "enabled") === "yes",
          role: text(f, "role"),
          reason: text(f, "reason"),
        };
      },
    });
  }
  return (
    <div className="oversight-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Admin oversight</span>
          <h1>{section === "System health" ? "System health" : "Settings"}</h1>
          <p>
            {mode === "health"
              ? "Real checks, recent activity and issues to follow up."
              : "Control operations, access and the teaching calendar."}
          </p>
        </div>
        <button
          aria-label={`Refresh ${mode}`}
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? (
            <VivaLoader size="button" decorative />
          ) : (
            <RefreshCw size={18} />
          )}
        </button>
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error}{" "}
          <button disabled={loading} onClick={() => void load()}>
            Try again
          </button>
        </p>
      )}
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      {!data ? (
        <section className="admin-card">
          {loading ? (
            <VivaLoader label="Loading system information…" />
          ) : (
            <h2>System setup needed</h2>
          )}
          {!loading && (
            <>
              <p>
                Apply the complete system-setup.sql file in Supabase, then
                refresh this screen.
              </p>
              <a
                href="https://github.com/VuyolwethuM6/viva-learning-hub/blob/work/docs/system-health-and-settings.md"
                target="_blank"
                rel="noreferrer"
              >
                Open setup and testing guide
              </a>
            </>
          )}
        </section>
      ) : (
        <>
          <nav
            className="viva-detail-tabs"
            aria-label={mode === "health" ? "Health views" : "Settings views"}
          >
            {(mode === "health"
              ? ["Overview", "Record issues", "Run history"]
              : [
                  "Overview",
                  "Automation",
                  "Calendar",
                  "Staff access",
                  "Backups",
                ]
            ).map((t) => (
              <button
                key={t}
                aria-current={tab === t ? "page" : undefined}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          {mode === "health" && health && (
            <>
              {tab === "Overview" && (
                <>
                  <section className="oversight-summary">
                    <div className="oversight-summary-icon">
                      <Activity size={27} />
                    </div>
                    <div>
                      <span className="eyebrow">Latest check</span>
                      <h2>
                        {health.checks.some((c) =>
                          ["attention", "unavailable"].includes(c.status),
                        )
                          ? "Some checks need attention"
                          : "No monitored issues found"}
                      </h2>
                      <p>
                        {auditTime(health.checkedAt)} ·{" "}
                        {health.configuration.environment}
                        {health.configuration.commit
                          ? ` · ${health.configuration.commit.slice(0, 7)}`
                          : ""}
                      </p>
                    </div>
                    <div className="oversight-summary-count">
                      <strong>
                        {
                          health.checks.filter((c) =>
                            ["attention", "unavailable"].includes(c.status),
                          ).length
                        }
                      </strong>
                      <span>to review</span>
                    </div>
                  </section>
                  <div className="oversight-actions">
                    <div
                      className="viva-chips"
                      aria-label="Health check filter"
                    >
                      {["All checks", "Needs attention"].map((f) => (
                        <button
                          key={f}
                          aria-pressed={filter === f}
                          onClick={() => setFilter(f)}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <button
                      disabled={
                        !owner || !health.configuration.email || loading
                      }
                      onClick={testEmail}
                    >
                      Test email to me
                    </button>
                  </div>
                  <div className="oversight-grid">
                    {health.checks
                      .filter(
                        (c) =>
                          filter === "All checks" ||
                          ["attention", "unavailable"].includes(c.status),
                      )
                      .map((c) => (
                        <article
                          className="admin-card oversight-check"
                          key={c.id}
                        >
                          <div className="oversight-check-heading">
                            {c.status === "ok" ? (
                              <CheckCircle2 size={22} />
                            ) : c.status === "info" ? (
                              <Info size={22} />
                            ) : (
                              <AlertTriangle size={22} />
                            )}
                            <span className={`oversight-status ${c.status}`}>
                              {
                                {
                                  ok: "Checked",
                                  info: "Information",
                                  attention: "Review needed",
                                  unavailable: "Not verified",
                                }[c.status]
                              }
                            </span>
                          </div>
                          <h2>{c.title}</h2>
                          <p>{c.detail}</p>
                          {c.target && (
                            <button onClick={() => onNavigate(c.target!)}>
                              Open {c.target} <ArrowRight size={15} />
                            </button>
                          )}
                        </article>
                      ))}
                  </div>
                  {filter === "Needs attention" &&
                    !health.checks.some((c) =>
                      ["attention", "unavailable"].includes(c.status),
                    ) && (
                      <p className="oversight-empty">
                        No issues in the checks that ran. Email delivery and
                        backup recovery still need their own verification.
                      </p>
                    )}
                  {health.health && (
                    <section className="admin-card oversight-operational">
                      <h2>Operational follow-up</h2>
                      <div className="oversight-follow-up">
                        {[
                          [
                            "Applications",
                            health.health.pendingApplications,
                            "Applications awaiting review",
                          ],
                          [
                            "Classes",
                            health.health.unfinishedSessions,
                            "Ended sessions not completed",
                          ],
                          [
                            "Assessments",
                            health.health.marksInReview,
                            "Marks awaiting review",
                          ],
                        ].map(([target, count, label]) => (
                          <button
                            key={String(target)}
                            onClick={() => onNavigate(target as SystemTarget)}
                          >
                            <strong>{count}</strong>
                            <span>{label}</span>
                            <ArrowRight size={16} />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {!health.overviewAvailable && (
                    <p className="admin-notice">
                      Only service checks ran. Database counts and integrity are
                      unavailable; they are not being reported as zero.
                    </p>
                  )}
                  <p className="admin-muted oversight-footnote">
                    Checks are refreshed on demand. A successful request is not
                    an uptime guarantee. Supabase, Resend and Vercel retain
                    their own detailed logs.
                  </p>
                </>
              )}
              {tab === "Record issues" && (
                <section className="admin-card">
                  <h2>Records needing attention</h2>
                  <p className="admin-muted">
                    Up to 100 file and application items. Summary counts include
                    all matching records. No records are deleted or repaired
                    automatically.
                  </p>
                  <div className="oversight-records">
                    {health.issues.map((i) => (
                      <article key={`${i.kind}-${i.id}`}>
                        <strong>{i.label}</strong>
                        <p>{i.context}</p>
                        <button onClick={() => onNavigate(i.target)}>
                          Open {i.target} <ArrowRight size={15} />
                        </button>
                      </article>
                    ))}
                  </div>
                  {!health.issues.length && (
                    <p className="oversight-empty">
                      {health.overviewAvailable
                        ? "No file or application metadata issues found."
                        : "Record checks are unavailable until system setup can be verified."}
                    </p>
                  )}
                </section>
              )}
              {tab === "Run history" && <RunHistory data={health} />}
            </>
          )}
          {mode === "settings" && settings && (
            <>
              {!owner && (
                <p className="admin-notice">
                  You can view these settings. An enabled owner must approve
                  changes.
                </p>
              )}
              {tab === "Overview" && (
                <div className="oversight-grid">
                  <section className="admin-card">
                    <h2>
                      <Settings2 size={20} /> Current operating policies
                    </h2>
                    <dl className="oversight-review">
                      <div>
                        <dt>Currency / tax</dt>
                        <dd>ZAR · No VAT</dd>
                      </div>
                      <div>
                        <dt>Tuition collection</dt>
                        <dd>EFT or cash, manually verified</dd>
                      </div>
                      <div>
                        <dt>Teaching & routine billing</dt>
                        <dd>February–November</dd>
                      </div>
                      <div>
                        <dt>Monthly invoice / due date</dt>
                        <dd>Issued from the 25th · Due on the 1st</dd>
                      </div>
                      <div>
                        <dt>Unpaid reminders</dt>
                        <dd>From the 3rd</dd>
                      </div>
                      <div>
                        <dt>Activation</dt>
                        <dd>First invoice settled, then admin activation</dd>
                      </div>
                      <div>
                        <dt>Books start / closed through</dt>
                        <dd>
                          {settings.accounting.books_start} /{" "}
                          {settings.accounting.closed_through ||
                            "No period closed"}
                        </dd>
                      </div>
                    </dl>
                    <p className="admin-muted">
                      Issued invoices and historical marks retain their original
                      records. Financial corrections and period controls remain
                      in Finance.
                    </p>
                    <button onClick={() => onNavigate("Finance")}>
                      Open Finance Controls
                    </button>
                  </section>
                  <section className="admin-card">
                    <h2>
                      <Database size={20} /> Deployment configuration
                    </h2>
                    <dl className="oversight-review">
                      <div>
                        <dt>Environment</dt>
                        <dd>{settings.configuration.environment}</dd>
                      </div>
                      <div>
                        <dt>Resend sender</dt>
                        <dd>
                          {settings.configuration.email
                            ? "Configured · delivery not verified"
                            : "Not configured"}
                        </dd>
                      </div>
                      <div>
                        <dt>Scheduler secret</dt>
                        <dd>
                          {settings.configuration.scheduler
                            ? "Configured"
                            : "Missing"}
                        </dd>
                      </div>
                      <div>
                        <dt>Bank confirmation</dt>
                        <dd>
                          {settings.configuration.bankConfirmed
                            ? "Configured confirmation"
                            : "Not confirmed"}
                        </dd>
                      </div>
                    </dl>
                    <p className="admin-muted">
                      API keys and SMTP credentials stay in Vercel or Supabase.
                      They cannot be viewed or edited here.
                    </p>
                    <details>
                      <summary>Where to configure services</summary>
                      <p>
                        Vercel: RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAIL and
                        CRON_SECRET. Confirm the beneficiary before setting
                        TUITION_BANK_DETAILS_CONFIRMED=true.
                      </p>
                      <p>
                        Supabase: Email provider, SMTP, exact portal callback
                        URLs and backups.
                      </p>
                      <div className="oversight-actions">
                        <a
                          href="https://vercel.com/dashboard"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Vercel dashboard ↗
                        </a>
                        <a
                          href="https://supabase.com/dashboard"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Supabase dashboard ↗
                        </a>
                      </div>
                    </details>
                  </section>
                  <section className="admin-card">
                    <h2>Tuition banking details</h2>
                    <dl className="oversight-review">
                      {Object.entries(settings.bank).map(([key, value]) => (
                        <div key={key}>
                          <dt>
                            {
                              {
                                bank: "Bank",
                                accountName: "Account name",
                                accountNumber: "Account number",
                                accountType: "Account type",
                                branchCode: "Branch code",
                              }[key]
                            }
                          </dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="admin-muted">
                      This is the beneficiary used by the application. Changes
                      require updating payment-details.ts and redeploying so
                      emails, PDFs and the parent portal agree.
                    </p>
                  </section>
                  <section className="admin-card">
                    <h2>
                      <Users size={20} /> Portal access
                    </h2>
                    <div className="oversight-access-counts">
                      {Object.entries(settings.health.access).map(
                        ([name, count]) => (
                          <div key={name}>
                            <strong>{count}</strong>
                            <span>{name} enabled</span>
                          </div>
                        ),
                      )}
                    </div>
                    <div className="oversight-actions">
                      <button onClick={() => setTab("Staff access")}>
                        Admin accounts
                      </button>
                      <button onClick={() => onNavigate("Tutors")}>
                        Tutor access
                      </button>
                      <button onClick={() => onNavigate("Students")}>
                        Learner & parent access
                      </button>
                    </div>
                  </section>
                </div>
              )}
              {tab === "Automation" && (
                <>
                  <section className="admin-card">
                    <h2>Billing & email automation</h2>
                    <div className="oversight-access-counts">
                      <div>
                        <strong>
                          {settings.accounting.automation_enabled
                            ? "On"
                            : "Off"}
                        </strong>
                        <span>Scheduled accounting</span>
                      </div>
                      <div>
                        <strong>
                          {settings.accounting.auto_send ? "On" : "Off"}
                        </strong>
                        <span>Automatic email dispatch</span>
                      </div>
                    </div>
                    <p>
                      Daily schedule: 08:05 South African time. Routine tuition
                      skips December and January. Failed or previously attempted
                      messages need manual review.
                    </p>
                    <div className="oversight-actions">
                      <button
                        className="admin-primary"
                        disabled={!owner || loading}
                        onClick={configureAutomation}
                      >
                        Configure automation
                      </button>
                      <button onClick={() => onNavigate("Finance")}>
                        Finance Controls & manual run
                      </button>
                      <button onClick={() => onNavigate("Notifications")}>
                        Review notification queue
                      </button>
                    </div>
                  </section>
                  <RunHistory data={settings} />
                </>
              )}
              {tab === "Calendar" && (
                <div className="oversight-grid">
                  <section className="admin-card">
                    <div className="teaching-section-heading">
                      <h2>
                        <CalendarDays size={20} /> Teaching closures
                      </h2>
                      <button
                        disabled={!owner || loading}
                        onClick={() =>
                          setSpec({
                            title: "Add a teaching closure",
                            operation: "closure_add",
                            fields: (
                              <>
                                <p>
                                  Cancel or reschedule sessions on this date
                                  first. This affects future scheduling and
                                  newly calculated invoices; issued invoice
                                  calendars stay unchanged.
                                </p>
                                <label>
                                  Closure date
                                  <input
                                    name="day"
                                    type="date"
                                    min={settings.today}
                                    required
                                  />
                                </label>
                                <Reason
                                  options={[
                                    "Public holiday",
                                    "School break",
                                    "Weather disruption",
                                    "Staff training",
                                    "Other planned closure",
                                  ]}
                                />
                              </>
                            ),
                            build: (f) => ({
                              day: text(f, "day"),
                              reason: text(f, "reason"),
                            }),
                          })
                        }
                      >
                        Add closure
                      </button>
                    </div>
                    <div className="oversight-records">
                      {settings.closures
                        .filter((c) => c.day >= settings.today)
                        .map((c) => (
                          <article key={c.day}>
                            <div>
                              <strong>{c.day}</strong>
                              <button
                                disabled={!owner || loading}
                                onClick={() =>
                                  setSpec({
                                    title: "Remove a future closure",
                                    operation: "closure_remove",
                                    fields: (
                                      <>
                                        <p>
                                          {c.day} · {c.reason}
                                        </p>
                                        <p>
                                          Existing invoices and teaching history
                                          will not be rewritten.
                                        </p>
                                        <Reason
                                          options={[
                                            "Closure no longer needed",
                                            "Date entered incorrectly",
                                            "Replaced by another closure",
                                          ]}
                                        />
                                      </>
                                    ),
                                    build: (f) => ({
                                      day: c.day,
                                      reason: text(f, "reason"),
                                    }),
                                  })
                                }
                              >
                                Remove
                              </button>
                            </div>
                            <p>{c.reason}</p>
                          </article>
                        ))}
                    </div>
                    {!settings.closures.some(
                      (c) => c.day >= settings.today,
                    ) && (
                      <p className="oversight-empty">
                        No upcoming closures configured.
                      </p>
                    )}
                    <details>
                      <summary>Past closures</summary>
                      {settings.closures
                        .filter((c) => c.day < settings.today)
                        .map((c) => (
                          <p key={c.day}>
                            {c.day} · {c.reason}
                          </p>
                        ))}
                    </details>
                  </section>
                  <section className="admin-card">
                    <h2>Grade programme days</h2>
                    {settings.programmes.map((p) => (
                      <article key={p.grade} className="oversight-programme">
                        <strong>{p.grade}</strong>
                        <p>
                          {p.weekdays
                            .map(
                              (d) =>
                                [
                                  "",
                                  "Mon",
                                  "Tue",
                                  "Wed",
                                  "Thu",
                                  "Fri",
                                  "Sat",
                                  "Sun",
                                ][d],
                            )
                            .join(" · ")}
                        </p>
                      </article>
                    ))}
                    <p className="admin-muted">
                      These programme days drive proration. Actual class times
                      remain in each class timetable. Programme policy changes
                      require a reviewed migration.
                    </p>
                    <button onClick={() => onNavigate("Classes")}>
                      Open class timetables
                    </button>
                  </section>
                </div>
              )}
              {tab === "Staff access" && (
                <section className="admin-card">
                  <div className="teaching-section-heading">
                    <h2>
                      <ShieldCheck size={20} /> Administrator accounts
                    </h2>
                    <button
                      disabled={!owner || loading}
                      className="admin-primary"
                      onClick={() => accessSpec()}
                    >
                      Grant staff access
                    </button>
                  </div>
                  <p>
                    Keep at least one enabled owner. Another owner must change
                    your own permissions. A scheduled-run owner must be replaced
                    before their access is removed.
                  </p>
                  {!owner ? (
                    <p className="oversight-empty">
                      Staff identity and permission details are visible to
                      owners only.
                    </p>
                  ) : (
                    <div className="oversight-records">
                      {settings.admins.map((a) => (
                        <article key={a.id}>
                          <div>
                            <strong>
                              {a.email}
                              {a.id === user.id ? " · You" : ""}
                            </strong>
                            <span
                              className={`oversight-status ${a.enabled ? "ok" : "info"}`}
                            >
                              {a.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <p>{roleName(a.role)}</p>
                          <button
                            disabled={a.id === user.id || loading}
                            onClick={() => accessSpec(a)}
                          >
                            Review access
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                  {settings.candidatesLimited && (
                    <p className="admin-muted">
                      The picker lists the first 100 verified accounts. Use the
                      verified email option to find another staff account.
                    </p>
                  )}
                </section>
              )}
              {tab === "Backups" && (
                <section className="admin-card">
                  <div className="teaching-section-heading">
                    <h2>Backups & recovery reviews</h2>
                    <button
                      disabled={!owner || loading}
                      onClick={() =>
                        setSpec({
                          title: "Record a completed backup review",
                          operation: "backup_review",
                          fields: (
                            <>
                              <p>
                                This records an owner review. It does not
                                create, download or restore a backup. Check both
                                database records and private Storage files in
                                your recovery plan.
                              </p>
                              <label>
                                Date actually checked
                                <input
                                  name="checkedOn"
                                  type="date"
                                  max={settings.today}
                                  defaultValue={settings.today}
                                  required
                                />
                              </label>
                              <label>
                                What was checked
                                <select
                                  aria-label="What was checked"
                                  name="method"
                                >
                                  <option value="provider_review">
                                    Inspected the provider backup
                                  </option>
                                  <option value="export_review">
                                    Checked a downloaded export
                                  </option>
                                  <option value="restore_test">
                                    Completed an isolated restore test
                                  </option>
                                </select>
                              </label>
                              <label>
                                What did you verify?
                                <textarea
                                  name="reason"
                                  minLength={5}
                                  maxLength={1000}
                                  rows={3}
                                  required
                                />
                              </label>
                            </>
                          ),
                          build: (f) => ({
                            checkedOn: text(f, "checkedOn"),
                            method: text(f, "method"),
                            reason: text(f, "reason"),
                          }),
                        })
                      }
                    >
                      Record review
                    </button>
                  </div>
                  <p className="admin-notice">
                    Automatic backup status and retention are not connected.
                    Supabase database backups do not replace a recovery plan for
                    Storage file contents.
                  </p>
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Review backups in Supabase ↗
                  </a>
                  <div className="oversight-records">
                    {settings.backups.map((b) => (
                      <article key={b.id}>
                        <div>
                          <strong>{backupName(b.method)}</strong>
                          <span className="oversight-status info">
                            Owner-reported
                          </span>
                        </div>
                        <p>
                          {b.checked_on} · {b.note}
                        </p>
                        <small>Recorded {auditTime(b.created_at)}</small>
                      </article>
                    ))}
                  </div>
                  {!settings.backups.length && (
                    <p className="oversight-empty">
                      No backup reviews recorded.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
      {spec && (
        <ChangeDialog
          key={spec.title}
          spec={spec}
          data={settings}
          close={() => setSpec(null)}
          saved={refresh}
          notice={setNotice}
        />
      )}
    </div>
  );
}
