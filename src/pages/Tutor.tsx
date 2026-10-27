import { AcademicStaff } from "@/components/AcademicStaff";
import { PortalDock, WhatsAppButton } from "@/components/PortalChrome";
import { useEffect, useState, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import {
  Loader2,
  LogOut,
  Mail,
  Home,
  CalendarDays,
  BookOpen,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { tutorRequest, TutorError } from "@/lib/tutor-client";
import { TeachingWorkspace } from "@/components/admin/TeachingWorkspace";
import { Dialog } from "@/components/admin/AdminPrimitives";
import "@fontsource/plus-jakarta-sans/latin-400.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "./admin.css";
import "@/components/admin/teaching.css";
export default function Tutor() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null),
    [loading, setLoading] = useState(true),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState(
      new URLSearchParams(window.location.search).get("signin") === "expired"
        ? "The link expired, was already used or access is unavailable. Request a new link."
        : "",
    ),
    [cooldown, setCooldown] = useState(0),
    [logout, setLogout] = useState(false);
  const [section, setSection] = useState("Home");
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    tutorRequest<{ user: { id: string; email: string } }>(
      undefined,
      "?action=session",
    )
      .then((body) => {
        if (active) setUser(body.user);
      })
      .catch((e) => {
        if (active && !(e instanceof TutorError && e.status === 401))
          setError(
            e instanceof Error ? e.message : "Tutor access is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const expired = useCallback(() => {
    setUser(null);
    setError(
      "Your tutor session is unavailable. Sign in again or contact Viva.",
    );
  }, []);
  async function send() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await tutorRequest({ action: "request_link", email });
      setSent(true);
      setCooldown(60);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The email could not be requested.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function signout() {
    setBusy(true);
    setError("");
    try {
      await tutorRequest(undefined, "", "DELETE");
      setUser(null);
      setLogout(false);
      setEmail("");
      setSent(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sign-out could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const meta = (
    <Helmet>
      <title>Tutor Portal | Viva Tutorials</title>
      <meta name="robots" content="noindex,nofollow" />
      <meta name="referrer" content="no-referrer" />
    </Helmet>
  );
  if (loading)
    return (
      <div className="admin-shell tutor-login">
        {meta}
        <div className="tutor-login-card">
          <Loader2 className="spin" />
          <p>Opening your teaching workspace…</p>
        </div>
      </div>
    );
  if (!user)
    return (
      <div className="admin-shell tutor-login">
        {meta}
        <main className="tutor-login-card" id="main-content">
          <img src="/viva-tutorials-logo.png" alt="Viva Tutorials" />
          <span className="eyebrow">A SPACE TO HELP LEARNERS GROW</span>
          <h1>{sent ? "Check your inbox" : "Welcome, tutor."}</h1>
          <p>
            {sent
              ? `If tutor access is enabled for ${email}, open the email and tap its sign-in button.`
              : "Use the tutor email authorized by Viva. We’ll email a sign-in link. No password or code to type."}
          </p>
          {!sent ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label>
                Tutor email
                <input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
              <button className="admin-primary" disabled={busy}>
                {busy ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <Mail size={18} />
                )}
                Email me a sign-in link
              </button>
            </form>
          ) : (
            <>
              <p className="admin-notice">
                Open the newest email to enter your tutor portal.
              </p>
              <button
                disabled={busy || cooldown > 0}
                onClick={() => void send()}
              >
                {cooldown
                  ? `Send another email in ${cooldown}s`
                  : "Send another email"}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setSent(false);
                  setError("");
                }}
              >
                Use a different email
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="admin-error">
              {error}
            </p>
          )}
          <small>
            Need access?{" "}
            <WhatsAppButton message="Hello Viva, I need help accessing the tutor portal." />
            . Sign-in does not grant administrator access.
          </small>
        </main>
      </div>
    );
  return (
    <div className="admin-shell tutor-shell">
      {meta}
      <header className="tutor-header">
        <a href="/tutor">
          <img src="/viva-tutorials-logo.png" alt="Viva Tutorials" />
          <span>Tutor</span>
        </a>
        <button onClick={() => setLogout(true)}>
          <LogOut size={18} />
          Sign out
        </button>
      </header>
      <main className="tutor-main" id="main-content">
        <section className="tutor-intro">
          <span className="eyebrow">
            PERSONAL SUPPORT. PURPOSEFUL LEARNING.
          </span>
          <h1>Make every session count.</h1>
          <p>
            Your assigned classes, saved teaching materials and attendance
            records. Use session completion to confirm teaching and share
            attendance with parents.
          </p>
        </section>
        <nav className="portal-desktop-tabs" aria-label="Tutor sections">
          {["Home", "Schedule", "Classes", "Materials", "Work", "More"].map(
            (name) => (
              <button
                key={name}
                aria-current={section === name ? "page" : undefined}
                onClick={() => setSection(name)}
              >
                {name}
              </button>
            ),
          )}
        </nav>
        {section === "More" ? (
          <section className="admin-card">
            <h1>Your teaching account</h1>
            <p>{user.email}</p>
            <p>
              You can plan sessions, manage attendance and share materials
              within your assigned classes. Open Work to assign activities,
              diagnostics and assessments, review confirmed submissions and
              submit marks for admin publication.
            </p>
            <WhatsAppButton message="Hello Viva, I need assistance with my tutor account or teaching schedule." />
            <p>
              <a href="/privacy-policy">Privacy</a>
            </p>
            <button onClick={() => setLogout(true)}>Sign out</button>
          </section>
        ) : section === "Work" ? (
          <AcademicStaff audience="tutor" />
        ) : (
          <TeachingWorkspace
            audience="tutor"
            section={section}
            onNavigate={setSection}
            onSessionExpired={expired}
          />
        )}
        {section !== "More" && (
          <div className="portal-support">
            <WhatsAppButton
              message={`Hello Viva, I need help with ${section.toLowerCase()} in my tutor portal.`}
            />
            <a href="/privacy-policy">Privacy</a>
          </div>
        )}
      </main>
      <PortalDock>
        <nav
          className="admin-bottom-nav tutor-bottom-nav"
          aria-label="Mobile tutor sections"
        >
          {[
            ["Home", Home],
            ["Schedule", CalendarDays],
            ["Classes", BookOpen],
            ["Materials", FileText],
            ["Work", FileText],
            ["More", MoreHorizontal],
          ].map(([name, Icon]) => {
            const Label = Icon as typeof Home;
            return (
              <button
                key={String(name)}
                aria-current={section === name ? "page" : undefined}
                onClick={() => {
                  setSection(String(name));
                  window.scrollTo({ top: 0 });
                }}
              >
                <span>
                  <Label size={21} />
                </span>
                {String(name)}
              </button>
            );
          })}
        </nav>
      </PortalDock>
      {logout && (
        <Dialog
          title="Sign out of the tutor portal?"
          variant="confirm"
          close={() => setLogout(false)}
          busy={busy}
        >
          <p>Your other Viva role sessions are separate.</p>
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
          <div className="confirm-actions">
            <button
              className="admin-primary"
              disabled={busy}
              onClick={() => void signout()}
            >
              Sign out
            </button>
            <button disabled={busy} onClick={() => setLogout(false)}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
