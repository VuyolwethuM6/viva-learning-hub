import { RecruitmentCasesWorkspace } from "@/components/admin/recruitment/RecruitmentCasesWorkspace";
import { RecruitmentFormsWorkspace } from "@/components/admin/recruitment/RecruitmentFormsWorkspace";
import { RecruitmentDeploymentWorkspace } from "@/components/admin/recruitment/RecruitmentDeploymentWorkspace";
import { Link, useLocation } from "react-router-dom";
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
import "./recruitment-admin.css";

export default function RecruitmentAdmin() {
  const deployment = useLocation().pathname === "/admin/recruitment/deployment";
  const [pending, setPending] = useState(Boolean(pendingRecruitmentRequest()));
  const [workspace, setWorkspace] = useState<
    "vacancies" | "security" | "cases" | "forms"
  >(
    pendingRecruitmentRequest()
      ? "security"
      : pendingCaseRequest()
        ? "cases"
        : "vacancies",
  );
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
    <div className="recruitment-shell">
      <header>
        <a href="/">
          <img
            src="/viva-tutorials-logo.png"
            alt="Viva Tutorials"
            width="112"
            height="56"
          />
        </a>
        <span>Recruitment</span>
        {snapshot && (
          <Button
            ref={logoutTrigger}
            variant="outline"
            onClick={() => setLogout(true)}
          >
            Sign out
          </Button>
        )}
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className={snapshot ? "recruitment-main" : "recruitment-login"}
      >
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
            <div className="recruitment-title">
              <div>
                <p className="recruitment-eyebrow">
                  Recruitment administration
                </p>
                <h1>
                  {deployment
                    ? "Recruitment deployment"
                    : "Recruitment workspace"}
                </h1>
                <p>
                  {snapshot.user.email} · {snapshot.user.role}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setError("");
                  void reload().catch((e) => setError(e.message));
                }}
              >
                Refresh
              </Button>
            </div>
            {error && <p role="alert">{error}</p>}
            <nav
              aria-label="Recruitment workspace"
              className="flex flex-wrap gap-3 mb-5"
            >
              {deployment && (
                <Button asChild variant="outline">
                  <Link to="/admin/recruitment">Back to recruitment</Link>
                </Button>
              )}
              {!deployment && (
                <>
                  <Button
                    variant={workspace === "vacancies" ? "default" : "outline"}
                    disabled={pending && workspace !== "vacancies"}
                    onClick={() => setWorkspace("vacancies")}
                  >
                    Vacancy management
                  </Button>
                  <Button
                    variant={workspace === "security" ? "default" : "outline"}
                    disabled={pending && workspace !== "security"}
                    onClick={() => setWorkspace("security")}
                  >
                    Security and governance
                  </Button>
                  <Button
                    variant={workspace === "cases" ? "default" : "outline"}
                    disabled={pending && workspace !== "cases"}
                    onClick={() => setWorkspace("cases")}
                  >
                    Applications and talent pool
                  </Button>
                  {snapshot.user.role === "owner" && (
                    <Button
                      variant={workspace === "forms" ? "default" : "outline"}
                      disabled={pending && workspace !== "forms"}
                      onClick={() => setWorkspace("forms")}
                    >
                      Forms and intake
                    </Button>
                  )}
                  {snapshot.user.role === "owner" && (
                    <Button asChild variant="outline">
                      <Link to="/admin/recruitment/deployment">
                        Deployment dashboard
                      </Link>
                    </Button>
                  )}
                </>
              )}
            </nav>
            {deployment ? (
              snapshot.user.role === "owner" ? (
                <RecruitmentDeploymentWorkspace />
              ) : (
                <p role="alert">
                  Recruitment owner access is required for deployment
                  preparation.
                </p>
              )
            ) : workspace === "vacancies" ? (
              <RecruitmentVacancyWorkspace
                snapshot={snapshot}
                reload={reload}
              />
            ) : workspace === "cases" ? (
              <RecruitmentCasesWorkspace snapshot={snapshot} />
            ) : workspace === "forms" ? (
              <RecruitmentFormsWorkspace snapshot={snapshot} />
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
    </div>
  );
}
