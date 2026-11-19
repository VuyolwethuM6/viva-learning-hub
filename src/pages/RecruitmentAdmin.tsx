import { RecruitmentCasesWorkspace } from "@/components/admin/recruitment/RecruitmentCasesWorkspace";
import { RecruitmentFormsWorkspace } from "@/components/admin/recruitment/RecruitmentFormsWorkspace";
import { RecruitmentDeploymentWorkspace } from "@/components/admin/recruitment/RecruitmentDeploymentWorkspace";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Brand } from "@/components/admin/AdminPrimitives";
import { BriefcaseBusiness, Users, ShieldCheck, Settings2, Rocket, ClipboardCheck, UserCheck, LayoutDashboard, ChevronRight, RefreshCw, LogOut, BarChart3 } from "lucide-react";
import { RecruitmentSelectionWorkspace } from "@/components/admin/recruitment/RecruitmentSelectionWorkspace";
import { RecruitmentEngagementWorkspace } from "@/components/admin/recruitment/RecruitmentEngagementWorkspace";
import { useCallback, useEffect, useRef, useState } from "react";
import { RecruitmentVacancyWorkspace } from "@/components/admin/recruitment/RecruitmentVacancyWorkspace";
import {
  pendingRecruitmentRequest,
  pendingCaseRequest,
} from "@/lib/recruitment-client";
import { recruitmentRequest } from "@/lib/recruitment-client";
import type { RecruitmentSnapshot } from "@/lib/recruitment-types";
import { RecruitmentSecurityWorkspace } from "@/components/admin/recruitment/RecruitmentSecurityWorkspace";
import { Button } from "@/components/ui/button";
import { VivaLoader } from "@/components/VivaLoader";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import "@fontsource/plus-jakarta-sans/latin-400.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "./admin.css";
import "./recruitment-admin.css";

type Workspace = "overview" | "vacancies" | "security" | "cases" | "forms" | "selection" | "engagement" | "reports";
const sections = [
  { id: "overview", label: "Recruitment overview", icon: LayoutDashboard },
  { id: "vacancies", label: "Vacancy management", icon: BriefcaseBusiness },
  { id: "cases", label: "Applications and talent pool", icon: Users },
  { id: "selection", label: "Screening, interviews and decisions", icon: ClipboardCheck },
  { id: "engagement", label: "Offers, onboarding and staff", icon: UserCheck },
  { id: "reports", label: "Recruitment reports", icon: BarChart3 },
  { id: "security", label: "Security and governance", icon: ShieldCheck },
  { id: "forms", label: "Forms and intake", icon: Settings2, owner: true },
] as const;

export default function RecruitmentAdmin() {
  const location = useLocation();
  const navigate = useNavigate();
  const deployment = location.pathname === "/admin/recruitment/deployment";
  const pathSection = location.pathname.split("/")[3];
  const routeSection = pathSection === "applications" ? "cases" : pathSection;
  const [pending, setPending] = useState(Boolean(pendingRecruitmentRequest()));
  const [workspace, setWorkspace] = useState<Workspace>(
    pendingRecruitmentRequest()
      ? "security"
      : pendingCaseRequest()
        ? "cases"
        : "vacancies",
  );
  useEffect(() => {
    if (sections.some((section) => section.id === routeSection) && !pendingRecruitmentRequest() && !pendingCaseRequest()) {
      setWorkspace(routeSection as Workspace);
    }
  }, [routeSection]);
  function selectWorkspace(next: Workspace) {
    setWorkspace(next);
    navigate(`/admin/recruitment/${next}`);
  }
  const [snapshot, setSnapshot] = useState<RecruitmentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [logout, setLogout] = useState(false);
  const logoutTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const changed = () => setPending(Boolean(pendingRecruitmentRequest()));
    window.addEventListener("recruitment-pending-changed", changed);
    return () =>
      window.removeEventListener("recruitment-pending-changed", changed);
  }, []);
  const reload = useCallback(async () => {
    setSnapshot(await recruitmentRequest<RecruitmentSnapshot>("snapshot"));
  }, []);
  useEffect(() => {
    let active = true;
    recruitmentRequest<RecruitmentSnapshot>("snapshot")
      .then((s) => {
        if (active) setSnapshot(s);
      })
      .catch(() => {
        /* No broad Admin fallback. */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await recruitmentRequest("session", { email, password });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await recruitmentRequest("session", undefined, "DELETE");
      setSnapshot(null);
      setLogout(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-out failed.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <VivaLoader size="page" label="Opening recruitment…" />;
  return (
    <div className={`recruitment-shell ${snapshot ? "admin-shell recruitment-admin-shell" : ""}`}>
      {snapshot && (
        <aside className="admin-sidebar">
          <Brand />
          <section>
            <p className="admin-nav-label">Recruitment</p>
            <nav aria-label="Recruitment workspace">
              {sections.filter((section) => !("owner" in section) || snapshot.user.role === "owner").map(({ id, label, icon: Icon }) => (
                <button key={id} aria-current={!deployment && workspace === id ? "page" : undefined} disabled={pending && workspace !== id} onClick={() => selectWorkspace(id)}>
                  <Icon size={19} aria-hidden="true" /><span>{label}</span>
                </button>
              ))}
              {snapshot.user.role === "owner" && <Link className="admin-button recruitment-nav-link" aria-current={deployment ? "page" : undefined} to="/admin/recruitment/deployment"><Rocket size={19} aria-hidden="true" /><span>Deployment dashboard</span></Link>}
            </nav>
          </section>
          <section>
            <p className="admin-nav-label">Viva Tutorials</p>
            <nav aria-label="Platform navigation"><a className="admin-button recruitment-nav-link" href="/admin"><LayoutDashboard size={19} aria-hidden="true" /><span>Admin Dashboard</span></a></nav>
          </section>
          <div className="sidebar-account">
            <span className="account-avatar" aria-hidden="true">{snapshot.user.email[0]?.toUpperCase()}</span>
            <div><strong>Recruitment {snapshot.user.role}</strong><small>{snapshot.user.email}</small></div>
          </div>
        </aside>
      )}
      <div className={snapshot ? "admin-workspace" : undefined}>
      <header className={snapshot ? "admin-topbar" : "recruitment-login-header"}>
        <div className={snapshot ? "topbar-mobile-brand" : undefined}><Brand compact={Boolean(snapshot)} /></div>
        {snapshot ? <div className="page-crumb"><span>Recruitment</span><ChevronRight size={13} aria-hidden="true" /><strong>{deployment ? "Deployment readiness" : sections.find((section) => section.id === workspace)?.label}</strong></div> : <span>Recruitment staff access</span>}
        {snapshot && <div className="topbar-actions"><span className="private-pill"><ShieldCheck size={14} aria-hidden="true" />Private workspace</span><button className="icon-button" aria-label="Refresh recruitment" disabled={busy} onClick={() => { setError(""); void reload().catch((e) => setError(e.message)); }}><RefreshCw size={18} aria-hidden="true" /></button><button ref={logoutTrigger} className="icon-button" aria-label="Sign out" disabled={busy} onClick={() => setLogout(true)}><LogOut size={18} aria-hidden="true" /></button></div>}
      </header>
      {snapshot && <nav className="recruitment-mobile-navigation" aria-label="Mobile recruitment navigation"><label htmlFor="recruitment-section">Recruitment section</label><select id="recruitment-section" value={deployment ? "deployment" : workspace} disabled={pending} onChange={(event) => { if(event.target.value === "deployment") navigate("/admin/recruitment/deployment"); else selectWorkspace(event.target.value as Workspace); }}>{sections.filter((section) => !("owner" in section) || snapshot.user.role === "owner").map(({id,label}) => <option key={id} value={id}>{label}</option>)}{snapshot.user.role === "owner" && <option value="deployment">Deployment dashboard</option>}</select></nav>}
      <main id="main-content" tabIndex={-1} className={snapshot ? "admin-main recruitment-main" : "recruitment-login"}>
        {!snapshot ? (
          <section className="recruitment-card">
            <p className="recruitment-eyebrow">Authorized staff only</p>
            <h1>Recruitment staff sign-in</h1>
            <p>
              Use your verified staff email and password. Recruitment
              permissions are separate from general Admin and teaching access.
            </p>
            <form onSubmit={login}>
              <label>
                Staff email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={1024}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </label>
              {error && <p role="alert">{error}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? <VivaLoader size="button" decorative /> : "Sign in"}
              </Button>
            </form>
            <p className="recruitment-note">
              Access must be explicitly granted. This screen does not create
              accounts or send invitations.
            </p>
            <a href="/privacy-policy">Privacy</a>
          </section>
        ) : (
          <>
            <div className="page-heading recruitment-title">
              <div><span className="eyebrow">Viva Tutorials · Recruitment</span><h1>{deployment ? "Deployment readiness" : sections.find((section) => section.id === workspace)?.label}</h1><p>{snapshot.user.email} · {snapshot.user.role}</p></div>
              {deployment && <Button asChild variant="outline"><Link to="/admin/recruitment">Back to recruitment</Link></Button>}
            </div>
            {error && <p role="alert" className="admin-error">{error}</p>}
            {deployment ? (
              snapshot.user.role === "owner" ? (
                <RecruitmentDeploymentWorkspace />
              ) : (
                <p role="alert">
                  Recruitment owner access is required for deployment
                  preparation.
                </p>
              )
            ) : workspace === "overview" ? (
              <section className="recruitment-card" aria-labelledby="recruitment-overview-heading">
                <h2 id="recruitment-overview-heading">Your recruitment workspace</h2>
                <p>Manage vacancies and follow candidates through screening, offers and onboarding. Access is limited to your authorised scopes.</p>
                <dl className="recruitment-overview-facts">
                  <div><dt>Recruitment role</dt><dd>{snapshot.user.role}</dd></div>
                  <div><dt>Visible recruitment scopes</dt><dd>{snapshot.scopes.length}</dd></div>
                  <div><dt>Public vacancy visibility</dt><dd>{snapshot.settings.public_vacancies_enabled === true ? "Enabled" : snapshot.settings.public_vacancies_enabled === false ? "Disabled" : "Not verified"}</dd></div>
                </dl>
                <p className="recruitment-note">Public visibility and application intake have separate controls. Intake remains subject to privacy, form, security and operational approvals.</p>
                <div className="vacancy-actions"><Button onClick={() => selectWorkspace("vacancies")}>Open vacancies</Button><Button variant="outline" onClick={() => selectWorkspace("cases")}>Open applications</Button></div>
              </section>
            ) : workspace === "reports" ? (
              <RecruitmentSelectionWorkspace snapshot={snapshot} section="reports" />
            ) : workspace === "selection" ? (
              <RecruitmentSelectionWorkspace snapshot={snapshot} />
            ) : workspace === "engagement" ? (
              <RecruitmentEngagementWorkspace snapshot={snapshot} />
            ) : workspace === "vacancies" ? (
              <RecruitmentVacancyWorkspace
                snapshot={snapshot}
                reload={reload}
              />
            ) : workspace === "cases" ? (
              <RecruitmentCasesWorkspace snapshot={snapshot} />
            ) : workspace === "forms" ? (
              snapshot.user.role === "owner" ? <RecruitmentFormsWorkspace snapshot={snapshot} /> : <p role="alert" className="admin-error">Recruitment owner access is required for forms and intake settings.</p>
            ) : (
              <RecruitmentSecurityWorkspace
                snapshot={snapshot}
                reload={reload}
              />
            )}
            <Dialog
              open={logout}
              onOpenChange={(open) => {
                if (!busy) setLogout(open);
              }}
            >
              <DialogContent
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  logoutTrigger.current?.focus();
                }}
              >
                <DialogTitle>Sign out of recruitment?</DialogTitle>
                <DialogDescription>
                  Your other portal sessions are separate.
                </DialogDescription>
                {error && <p role="alert">{error}</p>}
                <Button disabled={busy} onClick={() => void signOut()}>
                  Confirm sign out
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setLogout(false)}
                >
                  Cancel
                </Button>
              </DialogContent>
            </Dialog>
          </>
        )}
      </main>
      {snapshot && <footer className="workspace-footer"><span>Viva Tutorials</span><span>Recruitment permissions are separate from other platform access.</span></footer>}
      </div>
    </div>
  );
}
