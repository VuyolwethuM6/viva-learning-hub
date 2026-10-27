import { AcademicLearner } from "./AcademicLearner";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  RefreshCw,
  Target,
  FileText,
  ChevronLeft,
  ArrowRight,
} from "lucide-react";
import { studentFetch } from "@/lib/student-client";
import { parentFetch } from "@/lib/parent-client";
import { teachingDate } from "@/lib/teaching-client";
import type { StudentSnapshot } from "@/lib/student-types";
import {
  DocumentViewer,
  type ViewedDocument,
} from "@/components/admin/AdminPrimitives";
import { WhatsAppButton } from "./PortalChrome";
import { WeeklyAttendance } from "./WeeklyAttendance";
import "./student-workspace.css";
export function StudentWorkspace({
  section = "Home",
  application,
  onExpired,
  onNavigate,
}: {
  section?: string;
  application?: string;
  onExpired?: () => void;
  onNavigate?: (section: string) => void;
}) {
  const [data, setData] = useState<StudentSnapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [viewer, setViewer] = useState<ViewedDocument | null>(null),
    [cid, setCid] = useState(""),
    [tab, setTab] = useState("Sessions");
  const generation = useRef(0);
  const read = useCallback(
    (extra = "") =>
      application
        ? parentFetch(`?action=student&application=${application}${extra}`)
        : studentFetch(extra ? "?" + extra.slice(1) : ""),
    [application],
  );
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const load = useCallback(async () => {
    const gen = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const snapshot = await (await read()).json();
      if (gen !== generation.current) return;
      setData(snapshot);
    } catch (e) {
      if (gen !== generation.current) return;
      setError(
        e instanceof Error
          ? e.message
          : "Learning records could not be loaded.",
      );
      if (
        e &&
        typeof e === "object" &&
        "status" in e &&
        [401, 403].includes(Number(e.status))
      )
        onExpired?.();
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  }, [read, onExpired]);
  useEffect(() => {
    void load();
    window.addEventListener("focus", load);
    return () => {
      invalidate();
      window.removeEventListener("focus", load);
    };
  }, [load, section, invalidate]);
  useEffect(
    () => () => {
      if (viewer) URL.revokeObjectURL(viewer.url);
    },
    [viewer],
  );
  async function file(m: StudentSnapshot["materials"][number]) {
    setBusy(true);
    setError("");
    try {
      const r = await read("&file=" + m.id);
      setViewer({
        title: m.title,
        url: URL.createObjectURL(await r.blob()),
        filename: m.file_name,
        mime: m.mime,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The file could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="learning-card">
        <h2>Your learning space</h2>
        <p role={error ? "alert" : "status"}>
          {error || "Loading your learning records…"}
        </p>
        {error && <button onClick={() => void load()}>Try again</button>}
      </section>
    );
  const upcoming = data.sessions
    .filter((s) => s.status === "scheduled" && s.ends_at >= data.now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const history = data.sessions
    .filter((s) => s.status !== "scheduled")
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const a = data.attendance;
  const selectedClass = data.classes.find((c) => c.id === cid);
  const learning = section === "Learning" || !!application;
  const attendance = data.sessions.map((s) => ({
    id: s.id,
    subject: data.classes.find((c) => c.id === s.class_id)?.subject || "Class",
    title: s.topic_title,
    startsAt: s.starts_at,
    status: s.status,
    attendance: s.attendance,
  }));
  const sessions = (items: StudentSnapshot["sessions"]) =>
    items.length ? (
      items.map((s) => (
        <article className="learning-card" key={s.id}>
          <span className="viva-kicker">
            {data.classes.find((c) => c.id === s.class_id)?.subject}
          </span>
          <h3>{s.topic_title}</h3>
          <p>
            <CalendarDays size={16} /> {teachingDate(s.starts_at)}
          </p>
          <span
            className={`viva-pill ${s.attendance === "absent" ? "warning" : ""}`}
          >
            {s.status}
            {s.attendance ? ` · ${s.attendance}` : ""}
          </span>
          {s.learning_goal && <p>{s.learning_goal}</p>}
          {s.outcome && <p>{s.outcome}</p>}
          {s.room &&
            (s.mode === "Online" ? (
              <a
                className="learning-action"
                href={s.room}
                target="_blank"
                rel="noopener noreferrer"
              >
                Join online session <ArrowRight size={16} />
              </a>
            ) : (
              <p>
                {s.venue_name} · {s.room}
              </p>
            ))}
        </article>
      ))
    ) : (
      <p className="learning-empty">No sessions in this view.</p>
    );
  const targets = (
    <div className="learning-grid">
      {data.subjects.map((s) => (
        <article className="learning-card" key={s.name}>
          <Target size={22} />
          <h3>{s.name}</h3>
          <div className="viva-target-line">
            <span>
              Starting {s.startingMark === null ? "—" : `${s.startingMark}%`}
            </span>
            <strong>
              Target {s.targetMark === null ? "—" : `${s.targetMark}%`}
            </strong>
          </div>
          {s.startingMark !== null && (
            <div
              className="viva-target-bar"
              role="img"
              aria-label={`Starting mark ${s.startingMark} percent`}
            >
              <span
                style={{
                  width: `${Math.min(100, Math.max(0, s.startingMark))}%`,
                }}
              />
            </div>
          )}
        </article>
      ))}
    </div>
  );
  return (
    <div className="student-workspace">
      {(section !== "Home" || application) && (
        <div className="learning-page-heading">
          <div>
            <span className="viva-kicker">
              {application ? "Parent-assisted view" : "Student portal"}
            </span>
            <h2>
              {section === "Home"
                ? "My dashboard"
                : learning
                  ? "My learning"
                  : section === "More"
                    ? "My account"
                    : section}
            </h2>
          </div>
          <button
            disabled={busy}
            aria-label="Refresh learning records"
            onClick={() => void load()}
          >
            <RefreshCw size={19} />
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {section === "Home" && !application && (
        <>
          <section className="viva-profile viva-student-profile">
            <button
              className="viva-profile-refresh"
              disabled={busy}
              aria-label="Refresh learning records"
              onClick={() => void load()}
            >
              <RefreshCw size={17} />
            </button>
            <div className="viva-profile-top">
              <span className="viva-avatar" aria-hidden="true">
                {data.learner.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <span className="viva-kicker">Welcome back</span>
                <h1>{data.learner.name}</h1>
                <p>
                  {data.learner.grade} · {data.learner.studentNumber}
                </p>
              </div>
            </div>
            <div className="viva-profile-metrics">
              <div>
                <strong>
                  {a.percentage === null ? "—" : `${a.percentage}%`}
                </strong>
                <span>Overall attendance</span>
              </div>
              <div>
                <strong>{data.subjects.length}</strong>
                <span>Subjects</span>
              </div>
              <div>
                <strong>{a.attended}</strong>
                <span>Sessions attended</span>
              </div>
            </div>
          </section>
          <div className="viva-student-home-grid">
            <WeeklyAttendance
              sessions={attendance}
              today={data.today}
              limited={data.limited}
            />
            <section className="viva-up-next">
              <div className="viva-section-heading">
                <h2>Next session</h2>
                <button onClick={() => onNavigate?.("Learning")}>
                  My learning <ArrowRight size={16} />
                </button>
              </div>
              <div className="viva-session-list">
                {sessions(upcoming.slice(0, 1))}
              </div>
              <AcademicLearner
                summary
                onProgress={() => onNavigate?.("Progress")}
                onNavigate={() => {
                  setTab("Work");
                  setCid("");
                  onNavigate?.("Learning");
                }}
              />
            </section>
            <div className="viva-targets">
              <h2>My subject targets</h2>
              {targets}
            </div>
          </div>
        </>
      )}
      {learning && (
        <>
          {!selectedClass ? (
            <>
              <div className="learning-grid">
                {data.classes.map((c) => (
                  <button
                    className="learning-card learning-class"
                    key={c.id}
                    onClick={() => {
                      setCid(c.id);
                      setTab("Sessions");
                    }}
                  >
                    <BookOpen size={24} />
                    <span className="viva-kicker">{c.subject}</span>
                    <strong>{c.name}</strong>
                    <span>
                      {c.tutorName} · {c.mode}
                      {c.archived ? " · Archived" : ""}
                    </span>
                    <span>Open classroom →</span>
                  </button>
                ))}
              </div>
              {!data.classes.length && (
                <p className="learning-empty">No classes assigned yet.</p>
              )}
              <div className="viva-detail-tabs" aria-label="Learning views">
                {["Sessions", "Work", "Materials"].map((t) => (
                  <button
                    key={t}
                    aria-current={tab === t ? "page" : undefined}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button className="viva-back" onClick={() => setCid("")}>
                <ChevronLeft size={16} /> All classrooms
              </button>
              <section className="viva-profile">
                <span className="viva-kicker">{selectedClass.subject}</span>
                <h1>{selectedClass.name}</h1>
                <p>
                  {selectedClass.tutorName} · {selectedClass.mode}
                </p>
              </section>
              <div className="viva-detail-tabs" aria-label="Classroom views">
                {["Sessions", "Work", "Materials"].map((t) => (
                  <button
                    key={t}
                    aria-current={tab === t ? "page" : undefined}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === "Sessions" && (
            <>
              {selectedClass && (
                <details className="learning-card">
                  <summary>Weekly class times · South Africa</summary>
                  {data.slots
                    .filter((s) => s.class_id === cid)
                    .map((s) => (
                      <p key={s.id}>
                        {
                          [
                            "",
                            "Monday",
                            "Tuesday",
                            "Wednesday",
                            "Thursday",
                            "Friday",
                            "Saturday",
                            "Sunday",
                          ][s.weekday]
                        }{" "}
                        {s.starts_at.slice(0, 5)}–{s.ends_at.slice(0, 5)}
                      </p>
                    ))}
                </details>
              )}
              <h3>Upcoming sessions · South Africa</h3>
              <div className="learning-grid">
                {sessions(
                  upcoming.filter((s) => !selectedClass || s.class_id === cid),
                )}
              </div>
              <details className="learning-card">
                <summary>Past sessions & attendance</summary>
                <div className="learning-grid">
                  {sessions(
                    history.filter((s) => !selectedClass || s.class_id === cid),
                  )}
                </div>
                {data.limited && (
                  <p className="viva-caption">Recent history only.</p>
                )}
              </details>
            </>
          )}
          {tab === "Work" && (
            <AcademicLearner
              key={cid || "all"}
              application={application}
              classId={selectedClass?.id}
            />
          )}
          {tab === "Materials" && (
            <>
              <h3>Learning materials</h3>
              {selectedClass &&
                data.classes.filter((c) => c.subject === selectedClass.subject)
                  .length > 1 && (
                  <p className="viva-caption">
                    Materials shared across your {selectedClass.subject}{" "}
                    classes.
                  </p>
                )}
              <div className="learning-grid">
                {data.materials
                  .filter(
                    (m) =>
                      !selectedClass || m.subject === selectedClass.subject,
                  )
                  .map((m) => (
                    <article key={m.id} className="learning-card">
                      <FileText size={24} />
                      <h3>{m.title}</h3>
                      <p>
                        {m.subject} · {m.kind}
                      </p>
                      <button disabled={busy} onClick={() => void file(m)}>
                        Open resource
                      </button>
                    </article>
                  ))}
              </div>
              {!data.materials.some(
                (m) => !selectedClass || m.subject === selectedClass.subject,
              ) && <p className="learning-empty">No materials shared yet.</p>}
            </>
          )}
        </>
      )}
      {section === "Progress" && (
        <>
          <AcademicLearner progressOnly />
          <details className="learning-card">
            <summary>Starting marks & targets</summary>
            {targets}
          </details>
          <details className="learning-card">
            <summary>Attendance history</summary>
            <p className="viva-caption">
              {a.attended} attended · {a.absent} absent · {a.excused} excused.
              Overall rate excludes excused, cancelled and unconfirmed sessions.
            </p>
            <div className="learning-grid">{sessions(history)}</div>
          </details>
        </>
      )}
      {section === "More" && (
        <article className="learning-card">
          <span className="viva-avatar">
            <BookOpen />
          </span>
          <h2>{data.learner.name}</h2>
          <p>
            {data.learner.grade} · {data.learner.studentNumber}
          </p>
          <h3>My subjects</h3>
          <div className="viva-chips">
            {data.subjects.map((s) => (
              <span className="viva-pill" key={s.name}>
                {s.name}
              </span>
            ))}
          </div>
          <p>Need a correction to your details? Send Viva a message.</p>
        </article>
      )}
      {!application && (
        <div className="portal-support">
          <WhatsAppButton
            message={`Hello Viva, I need help with ${section === "Learning" ? "my classes or learning materials" : section === "Progress" ? "my learning progress" : "my student account"}. Learner reference: ${data.learner.studentNumber}.`}
          />
          <a href="/privacy-policy">Privacy</a>
        </div>
      )}
      {viewer && (
        <DocumentViewer document={viewer} close={() => setViewer(null)} />
      )}
    </div>
  );
}
