import { AcademicLearner } from "./AcademicLearner";
import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  RefreshCw,
  Target,
  FileText,
  CheckCircle2,
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
import "./student-workspace.css";
export function StudentWorkspace({
  section = "Home",
  application,
  onExpired,
}: {
  section?: string;
  application?: string;
  onExpired?: () => void;
}) {
  const [data, setData] = useState<StudentSnapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [viewer, setViewer] = useState<ViewedDocument | null>(null),
    [cid, setCid] = useState("");
  const read = useCallback(
    (extra = "") =>
      application
        ? parentFetch(`?action=student&application=${application}${extra}`)
        : studentFetch(extra ? "?" + extra.slice(1) : ""),
    [application],
  );
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await (await read()).json());
    } catch (e) {
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
      setBusy(false);
    }
  }, [read, onExpired]);
  useEffect(() => {
    void load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load, section]);
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
  const history = data.sessions.filter((s) => s.status !== "scheduled");
  const a = data.attendance;
  const sessions = (items: StudentSnapshot["sessions"]) =>
    items.length ? (
      items.map((s) => (
        <article className="learning-card" key={s.id}>
          <span className="learning-eyebrow">
            {data.classes.find((c) => c.id === s.class_id)?.name}
          </span>
          <h3>{s.topic_title}</h3>
          <p>{s.learning_goal}</p>
          <p>
            <CalendarDays size={16} /> {teachingDate(s.starts_at)}–
            {teachingDate(s.ends_at)}
          </p>
          <span className={`teaching-status ${s.status}`}>
            {s.status}
            {s.attendance ? ` · ${s.attendance}` : ""}
          </span>
          {s.outcome && <p>{s.outcome}</p>}
          {s.room &&
            (s.mode === "Online" ? (
              <a
                className="learning-action"
                href={s.room}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open online room
              </a>
            ) : (
              <p>
                {s.venue_name} · {s.room}
              </p>
            ))}
        </article>
      ))
    ) : (
      <p className="learning-empty">No sessions in this view yet.</p>
    );
  return (
    <div className="student-workspace">
      <div className="learning-page-heading">
        <div>
          <span className="learning-eyebrow">
            {data.assisted
              ? "PARENT-ASSISTED LEARNING"
              : "YOUR VIVA LEARNING SPACE"}
          </span>
          <h2>
            {section === "Home"
              ? `Hello, ${data.learner.name.split(" ")[0]}.`
              : section}
          </h2>
          <p>
            {data.learner.grade} · {data.learner.studentNumber} · All times
            South African
          </p>
        </div>
        <button
          disabled={busy}
          aria-label="Refresh learning records"
          onClick={() => void load()}
        >
          <RefreshCw size={19} />
        </button>
      </div>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {data.limited && (
        <p>
          Showing your latest 1,000 sessions. Attendance totals include all
          confirmed sessions.
        </p>
      )}
      {section === "Home" && !application && (
        <>
          <section className="learning-hero">
            <BookOpen size={30} />
            <h1>Your next step starts here.</h1>
            <p>
              Find your classes, prepare for your next session and keep your
              targets in sight.
            </p>
          </section>
          <div className="learning-stats">
            <article>
              <strong>{upcoming.length}</strong>
              <span>Scheduled sessions shown</span>
            </article>
            <article>
              <strong>
                {a.percentage === null ? "—" : `${a.percentage}%`}
              </strong>
              <span>Confirmed attendance</span>
            </article>
            <article>
              <strong>{data.materials.length}</strong>
              <span>Released resources</span>
            </article>
          </div>
          <h3>Coming up next</h3>
          <div className="learning-grid">{sessions(upcoming.slice(0, 3))}</div>
          <h3>Your subject targets</h3>
          <div className="learning-grid">
            {data.subjects.map((s) => (
              <article className="learning-card" key={s.name}>
                <Target size={23} />
                <h3>{s.name}</h3>
                <p>
                  Enrollment starting mark:{" "}
                  {s.startingMark === null
                    ? "Not recorded"
                    : `${s.startingMark}%`}
                </p>
                <strong>
                  Target:{" "}
                  {s.targetMark === null ? "Not recorded" : `${s.targetMark}%`}
                </strong>
              </article>
            ))}
          </div>
        </>
      )}
      {(section === "Classes" || application) && (
        <>
          <h3>Your classrooms & timetable</h3>
          <div className="learning-grid">
            {data.classes.map((c) => (
              <button
                className={`learning-card learning-class ${cid === c.id ? "selected" : ""}`}
                key={c.id}
                onClick={() => setCid(cid === c.id ? "" : c.id)}
              >
                <BookOpen size={23} />
                <strong>{c.name}</strong>
                <span>
                  {c.tutorName} · {c.mode}
                  {c.archived ? " · Archived" : ""}
                </span>
                {data.slots
                  .filter((s) => s.class_id === c.id)
                  .map((s) => (
                    <small key={s.id}>
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
                    </small>
                  ))}
              </button>
            ))}
          </div>
          {!data.classes.length && (
            <p className="learning-empty">
              No classes assigned yet. Viva will add your enrolled classes here.
            </p>
          )}
          <h3>Upcoming sessions</h3>
          <div className="learning-grid">
            {sessions(upcoming.filter((s) => !cid || s.class_id === cid))}
          </div>
          <h3>Past sessions & confirmed attendance</h3>
          <div className="learning-grid">
            {sessions(history.filter((s) => !cid || s.class_id === cid))}
          </div>
        </>
      )}
      {(section === "Learn" || application) && (
        <>
          <h3>Materials for your learning</h3>
          <div className="learning-grid">
            {data.materials.map((m) => (
              <article key={m.id} className="learning-card">
                <FileText size={24} />
                <h3>{m.title}</h3>
                <p>
                  {m.subject} · {m.kind} · Version {m.version}
                </p>
                <button disabled={busy} onClick={() => void file(m)}>
                  Open resource
                </button>
              </article>
            ))}
          </div>
          {!data.materials.length && (
            <p className="learning-empty">
              No resources released yet. Your tutor will share materials here.
            </p>
          )}
          {!application && (
            <p className="learning-empty">
              Curriculum lessons, topic practice and quizzes will be added in
              the next teaching phase.
            </p>
          )}
        </>
      )}
      {section === "Progress" && (
        <>
          <div className="learning-stats">
            <article>
              <CheckCircle2 />
              <strong>{a.attended}</strong>
              <span>Sessions attended</span>
            </article>
            <article>
              <strong>{a.absent}</strong>
              <span>Absent</span>
            </article>
            <article>
              <strong>{a.excused}</strong>
              <span>Excused</span>
            </article>
          </div>
          <h3>Starting marks & targets</h3>
          <div className="learning-grid">
            {data.subjects.map((s) => (
              <article key={s.name} className="learning-card">
                <h3>{s.name}</h3>
                <p>
                  Starting:{" "}
                  {s.startingMark === null
                    ? "Not recorded"
                    : `${s.startingMark}%`}{" "}
                  · Target:{" "}
                  {s.targetMark === null ? "Not recorded" : `${s.targetMark}%`}
                </p>
                <p>
                  Enrollment marks are starting points. Your published
                  assessment progress appears below.
                </p>
              </article>
            ))}
          </div>
          <h3>Confirmed teaching history</h3>
          <div className="learning-grid">{sessions(history)}</div>
        </>
      )}
      {section === "More" && (
        <>
          <article className="learning-card">
            <h3>Your profile</h3>
            <p>{data.learner.name}</p>
            <p>
              {data.learner.grade} · {data.learner.studentNumber}
            </p>
            <p>
              Your grade, enrolled subjects and official learning history are
              maintained by Viva. Contact us if a detail needs correcting.
            </p>
          </article>
          <article className="learning-card">
            <h3>What is coming next?</h3>
            <p>
              Open Work for activities, submissions, timed assessments and
              feedback. Progress shows published averages and reports. Practice,
              study plans, badges and Ask Vito remain later releases.
            </p>
          </article>
        </>
      )}
      {!application && section === "Progress" && (
        <AcademicLearner progressOnly />
      )}
      {!application && section === "Home" && <AcademicLearner summary />}
      {!application && (
        <div className="portal-support">
          <WhatsAppButton
            message={`Hello Viva, I need ${section === "Learn" ? "help with learning materials" : section === "Classes" ? "help with my class schedule" : "student portal assistance"}. Learner reference: ${data.learner.studentNumber}.`}
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
