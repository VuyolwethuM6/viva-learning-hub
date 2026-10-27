import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  FileText,
  GraduationCap,
  Loader2,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  Dialog,
  DocumentViewer,
  EmptyState,
  type ViewedDocument,
} from "./AdminPrimitives";
import {
  teachingRequest,
  teachingFetch,
  teachingDate,
  teachingEventLabel,
} from "@/lib/teaching-client";
import {
  ATTENDANCE_OPTIONS,
  TEACHING_SUBJECTS,
  TEACHING_TIMES,
  type TeachingSnapshot,
  type TeachingSession,
  type TeachingVersion,
} from "@/lib/teaching-types";
import "./teaching.css";
const text = (f: FormData, k: string) => String(f.get(k) || "").trim();
function Select({
  name,
  label,
  options,
  value,
  change,
  required = true,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  value?: string;
  change?: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <select
        name={name}
        aria-label={label}
        defaultValue={value || ""}
        onChange={(e) => change?.(e.target.value)}
        required={required}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
const choices = (items: string[]) =>
  items.map((value) => ({ value, label: value }));
function Day({
  value,
  label = "Effective date",
  name = "day",
  season,
}: {
  value: string;
  label?: string;
  name?: string;
  season?: number;
}) {
  return (
    <label>
      {label}
      <input
        type="date"
        name={name}
        defaultValue={value}
        min={season ? `${season}-02-01` : undefined}
        max={season ? `${season}-11-30` : undefined}
        required
      />
    </label>
  );
}
function Reason({ correction = false }: { correction?: boolean }) {
  return (
    <Select
      name="reason"
      label={correction ? "Correction reason" : "Reason"}
      options={choices(
        correction
          ? [
              "Register verified with tutor",
              "Arrival time confirmed",
              "Recording error corrected",
              "Verified learner absence",
            ]
          : [
              "Teaching assignment updated",
              "Learner changing class",
              "Tutor unavailable",
              "School event or closure",
              "Class programme finished",
              "Class rescheduled",
              "Access reviewed by Viva",
            ],
      )}
    />
  );
}
type FormSpec = {
  title: string;
  operation: string;
  fields: ReactNode;
  build: (f: FormData) => Record<string, unknown>;
  upload?: boolean;
};
function TeachingForm({
  spec,
  audience,
  close,
  changed,
  labels,
}: {
  spec: FormSpec;
  audience: "admin" | "tutor";
  close: () => void;
  changed: () => Promise<void>;
  labels: Record<string, string>;
}) {
  const requestId = useRef(crypto.randomUUID()),
    versionId = useRef(crypto.randomUUID());
  const [review, setReview] = useState<Record<string, unknown> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const file = useRef<File | null>(null);
  async function save() {
    if (!review || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await teachingRequest<{
        result: Record<string, unknown>;
        url?: string;
      }>(audience, spec.operation, {
        ...review,
        requestId: requestId.current,
        ...(spec.operation === "material_prepare"
          ? { id: versionId.current }
          : {}),
      });
      if (spec.upload && file.current) {
        if (!result.url)
          throw new Error(
            "The pending upload was saved. Refresh Materials to resume it.",
          );
        const upload = await fetch(result.url, {
          method: "PUT",
          headers: { "Content-Type": file.current.type, "x-upsert": "false" },
          body: file.current,
          signal: AbortSignal.timeout(60000),
        });
        if (!upload.ok)
          throw new Error(
            "The upload was not confirmed. Check Materials and use Verify upload or Resume upload before creating another version.",
          );
        await teachingRequest(audience, "material_finalize", {
          versionId: result.result.id,
          requestId: crypto.randomUUID(),
        });
      }
      await changed();
      close();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Saving could not be confirmed. Refresh before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={spec.title} close={close} variant="confirm" busy={busy}>
      <form
        className="finance-form teaching-form"
        hidden={!!review}
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          try {
            const form = new FormData(event.currentTarget);
            let data = spec.build(form);
            if (spec.upload) {
              const f = form.get("file");
              if (
                !(f instanceof File) ||
                !f.size ||
                f.size > 10485760 ||
                !["application/pdf", "image/jpeg", "image/png"].includes(f.type)
              )
                throw new Error("Choose a PDF, JPEG or PNG file up to 10 MB.");
              file.current = f;
              data = {
                ...data,
                name: f.name,
                size: f.size,
                mime: f.type,
                title: data.title || f.name.replace(/\.[^.]+$/, ""),
              };
            }
            setReview(data);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Check the choices.");
          }
        }}
      >
        {spec.fields}
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <button className="admin-primary">Review choices</button>
      </form>
      {review && (
        <div className="teaching-review">
          <h3>Confirm these choices</h3>
          <p>
            Review the selected options before saving. Changes and corrections
            are recorded in history.
          </p>
          <dl>
            {Object.entries(review)
              .filter(([key]) => !["revision", "staffNote", "id"].includes(key))
              .map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {key === "rows"
                      ? "Attendance"
                      : key === "learners"
                        ? "Selected learners"
                        : key.replace(/([A-Z])/g, " $1")}
                  </dt>
                  <dd>
                    {key === "rows" ? (
                      <ul>
                        {(
                          value as {
                            applicationId: string;
                            status: string;
                            name?: string;
                          }[]
                        ).map((row) => (
                          <li key={row.applicationId}>
                            {row.name || "Learner"}: {row.status}
                          </li>
                        ))}
                      </ul>
                    ) : Array.isArray(value) ? (
                      (value as string[]).map((v) => labels[v] || v).join(", ")
                    ) : (
                      labels[String(value)] || String(value)
                    )}
                  </dd>
                </div>
              ))}
          </dl>
          {review.staffNote ? (
            <p>Private note: {String(review.staffNote)}</p>
          ) : null}
          {error && (
            <p role="alert" className="admin-error">
              {error}
            </p>
          )}
          <div className="confirm-actions">
            <button
              className="admin-primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? <Loader2 className="spin" size={17} /> : null}Confirm and
              save
            </button>
            <button disabled={busy} onClick={() => setReview(null)}>
              Change choices
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
function SessionHistory({
  sessionId,
  audience,
}: {
  sessionId: string;
  audience: "admin" | "tutor";
}) {
  const [events, setEvents] = useState<
      | {
          id: string;
          action: string;
          created_at: string;
          actor: string;
          details: Record<string, unknown>;
        }[]
      | null
    >(null),
    [error, setError] = useState("");
  async function read() {
    try {
      const response = await teachingFetch(audience, "?history=" + sessionId);
      const data = await response.json();
      setEvents(data.events);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "History could not be loaded.");
    }
  }
  return (
    <details
      className="teaching-history"
      onToggle={(e) => {
        if (e.currentTarget.open && !events && !error) void read();
      }}
    >
      <summary>Recorded session changes</summary>
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => void read()}>Retry history</button>
        </p>
      )}
      {!events && !error && <p>Loading saved changes…</p>}
      {events?.map((e) => {
        const before = e.details.before as Record<string, unknown> | null,
          after = e.details.after as Record<string, unknown> | null;
        return (
          <article key={e.id}>
            <strong>
              {e.actor} · {teachingEventLabel(e.action, e.details)}
            </strong>
            <small>{teachingDate(e.created_at)}</small>
            {before?.attendance !== undefined && (
              <p>
                Attendance: {String(before.attendance || "not recorded")} →{" "}
                {String(after?.attendance || "not recorded")}
              </p>
            )}
            {e.details.reason ? (
              <p>Reason: {String(e.details.reason)}</p>
            ) : null}
            <details>
              <summary>Saved record details</summary>
              <pre>{JSON.stringify(e.details, null, 2)}</pre>
            </details>
          </article>
        );
      })}
    </details>
  );
}
export function TeachingWorkspace({
  audience = "admin",
  section = "Classes",
  onSessionExpired,
}: {
  audience?: "admin" | "tutor";
  section?: string;
  onSessionExpired?: () => void;
}) {
  const [data, setData] = useState<TeachingSnapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [cid, setCid] = useState(""),
    [sid, setSid] = useState(""),
    [form, setForm] = useState<FormSpec | null>(null),
    [viewer, setViewer] = useState<ViewedDocument | null>(null),
    [opening, setOpening] = useState("");
  const [grade, setGrade] = useState("Grade 12"),
    [subject, setSubject] = useState("Mathematics"),
    [mode, setMode] = useState("Online");
  const live = useRef(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await teachingRequest<TeachingSnapshot>(audience);
      if (live.current) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (live.current) {
        setError(e instanceof Error ? e.message : "Teaching is unavailable.");
        if (
          e &&
          typeof e === "object" &&
          "status" in e &&
          [401, 403].includes(Number(e.status))
        )
          onSessionExpired?.();
      }
    } finally {
      if (live.current) setLoading(false);
    }
  }, [audience, onSessionExpired]);
  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);
  useEffect(() => {
    setSid("");
  }, [cid]);
  useEffect(() => {
    setForm(null);
  }, [section]);
  useEffect(
    () => () => {
      if (viewer) URL.revokeObjectURL(viewer.url);
    },
    [viewer],
  );
  const c = data?.classes.find((c) => c.id === cid),
    session = data?.sessions.find((s) => s.id === sid);
  const admin = audience === "admin";
  const show = (
    title: string,
    operation: string,
    fields: ReactNode,
    build: FormSpec["build"],
    upload = false,
  ) => setForm({ title, operation, fields, build, upload });
  async function file(version: TeachingVersion) {
    setOpening(version.id);
    setError("");
    try {
      const response = await teachingFetch(audience, "?file=" + version.id);
      const blob = await response.blob();
      setViewer({
        title: version.file_name,
        url: URL.createObjectURL(blob),
        mime: version.mime,
        filename: version.file_name,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The file could not be opened.",
      );
    } finally {
      setOpening("");
    }
  }
  if (!data)
    return (
      <section className="admin-card teaching-workspace">
        <h1>Teaching workspace</h1>
        {loading ? (
          <p role="status">Loading teaching records…</p>
        ) : (
          <>
            <p role="alert" className="admin-error">
              {error}
            </p>
            <p>Apply the teaching setup SQL before using this release.</p>
            <button onClick={() => void load()}>Retry</button>
          </>
        )}
      </section>
    );
  const ds = data;
  const grades = ds.programmes.map((p) => p.grade);
  const subjectSelect = (
    <Select
      name="subject"
      label="Subject"
      value={subject}
      change={setSubject}
      options={choices(TEACHING_SUBJECTS)}
    />
  );
  const gradeSelect = (
    <Select
      name="grade"
      label="Grade / programme"
      value={grade}
      change={setGrade}
      options={choices(grades)}
    />
  );
  const classMembers = ds.memberships.filter((m) => m.class_id === cid),
    sessions = ds.sessions
      .filter((s) => s.class_id === cid)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const readyVersions = ds.versions.filter(
    (v) =>
      v.finalized_at &&
      ds.materials.some(
        (m) =>
          m.id === v.material_id &&
          !m.archived &&
          (!c || (m.grade === c.grade && m.subject === c.subject)),
      ),
  );
  const versionOptions = (versions: TeachingVersion[]) =>
    versions.map((v) => ({
      value: v.id,
      label: `${ds.materials.find((m) => m.id === v.material_id)?.title} · v${v.version}`,
    }));
  function addClass() {
    show(
      "Create a class",
      "class_create",
      <>
        {gradeSelect}
        {subjectSelect}
        <Select
          name="group"
          label="Class group"
          options={choices("ABCDEFGHIJKL".split(""))}
          value="A"
        />
        <Select
          name="season"
          label="Teaching year"
          options={choices([
            ds.today.slice(0, 4),
            String(Number(ds.today.slice(0, 4)) + 1),
          ])}
          value={ds.today.slice(0, 4)}
        />
        <Select
          name="tutorId"
          label="Tutor"
          options={ds.tutors
            .filter((t) => t.enabled)
            .map((t) => ({ value: t.id, label: t.name }))}
        />
        <Select
          name="venueId"
          label="Saved classroom / online room"
          options={ds.venues
            .filter((v) => v.active)
            .map((v) => ({ value: v.id, label: `${v.name} · ${v.mode}` }))}
        />
        <fieldset>
          <legend>Programme days</legend>
          <div className="teaching-checks">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
              (label, index) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={index + 1}
                    defaultChecked={index < 5}
                  />
                  {label}
                </label>
              ),
            )}
          </div>
        </fieldset>
        <Select
          name="startTime"
          label="Start time · South Africa"
          value="16:00"
          options={choices(TEACHING_TIMES)}
        />
        <Select
          name="endTime"
          label="End time · South Africa"
          value="17:00"
          options={choices(TEACHING_TIMES)}
        />
        <p>
          Class names are generated from these choices. Days must belong to the
          selected grade programme.
        </p>
      </>,
      (f) => ({
        grade: text(f, "grade"),
        subject: text(f, "subject"),
        group: text(f, "group"),
        season: Number(text(f, "season")),
        tutorId: text(f, "tutorId"),
        venueId: text(f, "venueId"),
        weekdays: f.getAll("weekdays").map(Number),
        startTime: text(f, "startTime"),
        endTime: text(f, "endTime"),
      }),
    );
  }
  function addTopic() {
    show(
      "Add a reusable learning topic",
      "topic_create",
      <>
        <Select
          name="grade"
          label="Grade / programme"
          value={c?.grade || grade}
          options={choices(grades)}
        />
        <Select
          name="subject"
          label="Subject"
          value={c?.subject || subject}
          options={choices(TEACHING_SUBJECTS)}
        />
        <label>
          Topic name
          <input name="title" minLength={2} maxLength={160} required />
        </label>
        <label>
          Learning goal
          <textarea
            name="goal"
            minLength={5}
            maxLength={600}
            rows={3}
            required
          />
        </label>
        <p>Create this once, then select it for future sessions.</p>
      </>,
      (f) => ({
        grade: text(f, "grade"),
        subject: text(f, "subject"),
        title: text(f, "title"),
        goal: text(f, "goal"),
      }),
    );
  }
  function addVenue() {
    show(
      "Add a saved teaching room",
      "venue_create",
      <>
        <Select
          name="mode"
          label="Delivery mode"
          value={mode}
          change={setMode}
          options={choices(["Online", "In-person"])}
        />
        <label>
          Room name
          <input name="name" minLength={2} maxLength={120} required />
        </label>
        <label>
          Meeting link or classroom address
          <input name="detail" minLength={3} maxLength={1000} required />
        </label>
        <p>
          Online rooms require an HTTPS meeting link. Save it once, then select
          it when creating classes.
        </p>
      </>,
      (f) => ({
        name: text(f, "name"),
        mode: text(f, "mode"),
        detail: text(f, "detail"),
      }),
    );
  }
  function addSession() {
    if (!c) return;
    show(
      "Schedule a teaching session",
      "session_create",
      <>
        <p>{c.name}</p>
        <Select
          name="topicId"
          label="Learning topic and goal"
          options={ds.topics
            .filter(
              (t) => t.active && t.grade === c.grade && t.subject === c.subject,
            )
            .map((t) => ({ value: t.id, label: t.title }))}
        />
        <Day value={ds.today} season={c.season} label="Session date" />
        <Select
          name="startTime"
          label="Start time · South Africa"
          value={c.starts_at.slice(0, 5)}
          options={choices(TEACHING_TIMES)}
        />
        <Select
          name="endTime"
          label="End time · South Africa"
          value={c.ends_at.slice(0, 5)}
          options={choices(TEACHING_TIMES)}
        />
        <p>
          The current class roster and resource versions are saved with this
          session. Closures and timing clashes are checked.
        </p>
      </>,
      (f) => ({
        classId: c.id,
        topicId: text(f, "topicId"),
        day: text(f, "day"),
        startTime: text(f, "startTime"),
        endTime: text(f, "endTime"),
      }),
    );
  }
  function enrol() {
    if (!c) return;
    const available = ds.learners.filter(
      (l) =>
        l.grade === c.grade &&
        l.subjects.includes(c.subject) &&
        !classMembers.some((m) => m.application_id === l.id && !m.left_on),
    );
    show(
      "Add learners to this class",
      "membership",
      <>
        <p>{c.name}</p>
        <Day value={ds.today} season={c.season} />
        <fieldset>
          <legend>Active learners in this grade and subject</legend>
          <div className="teaching-choice-list">
            {available.map((l) => (
              <label key={l.id}>
                <input type="checkbox" name="learners" value={l.id} />
                <span>
                  {l.name}
                  <small>{l.studentNumber}</small>
                </span>
              </label>
            ))}
            {!available.length && <p>No eligible learners to add.</p>}
          </div>
        </fieldset>
      </>,
      (f) => {
        const learners = f.getAll("learners").map(String);
        if (!learners.length) throw new Error("Select at least one learner.");
        return { classId: c.id, day: text(f, "day"), change: "add", learners };
      },
    );
  }
  function upload(existing?: TeachingVersion) {
    show(
      existing
        ? "Resume private file upload"
        : "Upload private teaching material",
      existing ? "material_resume" : "material_prepare",
      <>
        {existing ? (
          <p>
            Choose the same file: {existing.file_name} · {existing.size_bytes}{" "}
            bytes.
          </p>
        ) : (
          <>
            <Select
              name="materialId"
              label="Resource / new version"
              required={false}
              options={ds.materials
                .filter((m) => !m.archived)
                .map((m) => ({
                  value: m.id,
                  label: `New version of ${m.title}`,
                }))}
            />
            <p>
              Leave resource unselected to create a new resource from the
              filename.
            </p>
            {gradeSelect}
            {subjectSelect}
            <Select
              name="kind"
              label="Resource type"
              value="Notes"
              options={choices([
                "Notes",
                "Worksheet",
                "Presentation",
                "Question paper",
                "Memorandum",
                "Revision",
              ])}
            />
          </>
        )}
        <label>
          Select file · PDF, JPEG or PNG, up to 10 MB
          <input
            type="file"
            name="file"
            accept="application/pdf,image/jpeg,image/png"
            required
          />
        </label>
        <p>
          Files stay private. Uploading does not publish on the website or share
          with a class.
        </p>
      </>,
      (f) =>
        existing
          ? { versionId: existing.id }
          : {
              ...(text(f, "materialId")
                ? { materialId: text(f, "materialId") }
                : {
                    grade: text(f, "grade"),
                    subject: text(f, "subject"),
                    kind: text(f, "kind"),
                  }),
            },
      true,
    );
  }
  function attach(toSession = false) {
    if (!c) return;
    const list =
      toSession && !admin
        ? readyVersions.filter((v) =>
            ds.classMaterials.some(
              (l) => l.class_id === cid && l.version_id === v.id && l.active,
            ),
          )
        : readyVersions;
    show(
      toSession ? "Attach a session resource" : "Assign a class resource",
      toSession ? "session_material" : "class_material",
      <>
        <p>
          {c.name}
          {toSession && session ? ` · ${session.topic_title}` : ""}
        </p>
        <Select
          name="versionId"
          label="Verified resource version"
          options={versionOptions(list)}
        />
        <p>
          Existing sessions retain their saved versions. These files are visible
          only to authorized teaching staff.
        </p>
      </>,
      (f) => ({
        classId: c.id,
        ...(toSession ? { sessionId: session?.id } : {}),
        versionId: text(f, "versionId"),
      }),
    );
  }
  function register(s: TeachingSession) {
    const roster = ds.roster.filter((r) => r.session_id === s.id && r.included);
    show(
      s.status === "completed" ? "Correct attendance" : "Record attendance",
      "attendance",
      <>
        <p>
          {s.topic_title} · {teachingDate(s.starts_at)}
        </p>
        {roster.map((r) => (
          <Select
            key={r.application_id}
            name={"attendance_" + r.application_id}
            label={r.learner_name}
            value={r.attendance || ""}
            options={choices(ATTENDANCE_OPTIONS)}
          />
        ))}
        {ds.roster.some(
          (r) => r.session_id === s.id && r.attendance !== null,
        ) && <Reason correction />}
        <p>
          Attendance is shared with parents when the session is completed. No
          learner is marked present automatically.
        </p>
      </>,
      (f) => ({
        sessionId: s.id,
        revision: s.revision,
        reason: text(f, "reason"),
        rows: roster.map((r) => ({
          applicationId: r.application_id,
          name: r.learner_name,
          status: text(f, "attendance_" + r.application_id),
        })),
      }),
    );
  }
  function complete(s: TeachingSession) {
    show(
      "Complete and publish attendance",
      "session_finish",
      <>
        <p>
          {s.topic_title} · {teachingDate(s.starts_at)}
        </p>
        <Select
          name="outcome"
          label="Teaching outcome"
          options={choices([
            "Objective covered",
            "More practice needed",
            "Follow-up planned",
          ])}
        />
        <label>
          Private staff note · optional
          <textarea name="staffNote" maxLength={2000} rows={3} />
        </label>
        <p>
          Confirm the session took place. Its attendance and teaching outcome
          will become visible to the correct parents. Private notes remain with
          staff.
        </p>
      </>,
      (f) => ({
        sessionId: s.id,
        revision: s.revision,
        status: "completed",
        outcome: text(f, "outcome"),
        staffNote: text(f, "staffNote"),
      }),
    );
  }
  return (
    <div className="teaching-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">TEACHING WITH PURPOSE</span>
          <h1>
            {admin ? section : `${ds.tutorName || "Your"} teaching workspace`}
          </h1>
          <p>
            Real sessions. Saved resources. A lasting learning record. All times
            are South African.
          </p>
        </div>
        <button
          disabled={loading}
          onClick={() => void load()}
          aria-label="Refresh teaching records"
        >
          <RefreshCw size={18} className={loading ? "spin" : ""} />
        </button>
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {ds.limited && (
        <p className="admin-notice">
          Showing the latest 1,000 sessions. Historical totals in parent
          attendance cover all confirmed sessions.
        </p>
      )}
      {section === "Tutors" && admin ? (
        <>
          <div className="teaching-toolbar">
            <button
              className="admin-primary"
              onClick={() =>
                show(
                  "Authorize a tutor",
                  "tutor_save",
                  <>
                    <label>
                      Tutor name
                      <input
                        name="name"
                        required
                        minLength={2}
                        maxLength={120}
                      />
                    </label>
                    <label>
                      Tutor email
                      <input
                        type="email"
                        name="email"
                        required
                        maxLength={254}
                      />
                    </label>
                    <p>
                      Verify this tutor email. They use an email link at /tutor;
                      authorization does not send an invitation automatically.
                    </p>
                  </>,
                  (f) => ({ name: text(f, "name"), email: text(f, "email") }),
                )
              }
            >
              <Plus size={17} />
              Add tutor
            </button>
            <a
              className="admin-button"
              href="/tutor"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open tutor sign-in
            </a>
          </div>
          <div className="teaching-grid">
            {ds.tutors.map((t) => (
              <article className="admin-card teaching-card" key={t.id}>
                <GraduationCap size={24} />
                <h2>{t.name}</h2>
                <p>{t.email}</p>
                <span
                  className={`teaching-status ${t.enabled ? "completed" : "cancelled"}`}
                >
                  {t.enabled ? "Access enabled" : "Access disabled"}
                </span>
                <p>
                  {t.registered ? "Has signed in" : "Has not signed in yet"}
                </p>
                <button
                  onClick={() =>
                    show(
                      t.enabled
                        ? "Disable tutor access"
                        : "Enable tutor access",
                      "tutor_save",
                      <>
                        <p>
                          {t.name} · {t.email}
                        </p>
                        <Reason />
                      </>,
                      (f) => ({
                        id: t.id,
                        enabled: !t.enabled,
                        reason: text(f, "reason"),
                      }),
                    )
                  }
                >
                  {t.enabled ? "Disable access" : "Enable access"}
                </button>
              </article>
            ))}
            {!ds.tutors.length && (
              <EmptyState title="No tutors yet">
                Authorize a verified tutor email to begin.
              </EmptyState>
            )}
          </div>
        </>
      ) : section === "Materials" && admin ? (
        <>
          <div className="teaching-toolbar">
            <button className="admin-primary" onClick={() => upload()}>
              <Plus size={17} />
              Upload teaching material
            </button>
          </div>
          <p className="admin-muted">
            Private teaching library. The public study-materials catalog is
            managed separately.
          </p>
          <div className="teaching-grid">
            {ds.materials.map((m) => (
              <article key={m.id} className="admin-card teaching-card">
                <FileText size={24} />
                <h2>{m.title}</h2>
                <p>
                  {m.grade} · {m.subject} · {m.kind}
                </p>
                {ds.versions
                  .filter((v) => v.material_id === m.id)
                  .map((v) => (
                    <div className="teaching-version" key={v.id}>
                      <strong>Version {v.version}</strong>
                      <small>
                        {v.file_name} · {(v.size_bytes / 1024).toFixed(0)} KB
                      </small>
                      {v.finalized_at ? (
                        <button
                          disabled={!!opening}
                          onClick={() => void file(v)}
                        >
                          {opening === v.id ? "Opening…" : "View private file"}
                        </button>
                      ) : (
                        <>
                          <span className="teaching-status">
                            Upload pending verification
                          </span>
                          <button
                            onClick={() =>
                              show(
                                "Verify an uploaded file",
                                "material_finalize",
                                <p>
                                  {v.file_name}. The stored size and MIME type
                                  will be checked.
                                </p>,
                                () => ({ versionId: v.id }),
                              )
                            }
                          >
                            Verify upload
                          </button>
                          <button onClick={() => upload(v)}>
                            Resume upload
                          </button>
                        </>
                      )}
                    </div>
                  ))}
              </article>
            ))}
            {!ds.materials.length && (
              <EmptyState title="No teaching materials yet">
                Upload a file, then assign its verified version to a class.
              </EmptyState>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="teaching-toolbar">
            {admin && (
              <>
                <button className="admin-primary" onClick={addClass}>
                  <Plus size={17} />
                  Create class
                </button>
                <button onClick={addTopic}>Add topic & goal</button>
                <button onClick={addVenue}>Add teaching room</button>
              </>
            )}
            <Select
              key={cid}
              name="selectedClass"
              label="Choose class"
              value={cid}
              change={(value) => {
                setCid(value);
              }}
              options={ds.classes.map((c) => ({
                value: c.id,
                label: c.name + (c.archived ? " · Archived" : ""),
              }))}
              required={false}
            />
          </div>
          {!c ? (
            <div className="teaching-grid">
              {ds.classes.map((cl) => (
                <button
                  className="admin-card teaching-class-card"
                  key={cl.id}
                  onClick={() => setCid(cl.id)}
                >
                  <span className="teaching-class-icon">
                    <BookOpen size={24} />
                  </span>
                  <strong>{cl.name}</strong>
                  <small>
                    {cl.season} · {cl.tutorName} · {cl.mode}
                  </small>
                  <span>
                    {cl.archived ? "View archived records" : "Open class"} →
                  </span>
                </button>
              ))}
              {!ds.classes.length && (
                <EmptyState
                  title={admin ? "No classes yet" : "No classes assigned"}
                >
                  {admin
                    ? "Add a tutor and a saved room, then create your first class."
                    : "Viva will assign your teaching classes here."}
                </EmptyState>
              )}
            </div>
          ) : (
            <>
              <section className="admin-card teaching-class-header">
                <div>
                  <span className="eyebrow">
                    {c.season} ·{" "}
                    {c.archived ? "ARCHIVED CLASS" : "CLASS WORKSPACE"}
                  </span>
                  <h2>{c.name}</h2>
                  <p>
                    {c.tutorName} · {c.venueName} · {c.starts_at.slice(0, 5)}–
                    {c.ends_at.slice(0, 5)}
                  </p>
                </div>
                {admin && (
                  <div className="teaching-actions">
                    {!c.archived && (
                      <button
                        onClick={() =>
                          show(
                            "Change class tutor",
                            "class_update",
                            <>
                              <Select
                                name="tutorId"
                                label="New assigned tutor"
                                options={ds.tutors
                                  .filter((t) => t.enabled)
                                  .map((t) => ({ value: t.id, label: t.name }))}
                              />
                              <Reason />
                            </>,
                            (f) => ({
                              classId: c.id,
                              tutorId: text(f, "tutorId"),
                              reason: text(f, "reason"),
                            }),
                          )
                        }
                      >
                        Change tutor
                      </button>
                    )}
                    <button
                      onClick={() =>
                        show(
                          c.archived ? "Reopen class" : "Archive class",
                          "class_update",
                          <>
                            <p>
                              Past sessions and attendance are retained.
                              Archiving cancels unstarted scheduled sessions.
                            </p>
                            <Reason />
                          </>,
                          (f) => ({
                            classId: c.id,
                            archived: !c.archived,
                            reason: text(f, "reason"),
                          }),
                        )
                      }
                    >
                      {c.archived ? "Reopen class" : "Archive class"}
                    </button>
                  </div>
                )}
              </section>
              <div className="teaching-columns">
                <section className="admin-card">
                  <div className="teaching-section-heading">
                    <h2>
                      <Users size={18} />
                      Learners & enrollment targets
                    </h2>
                    {admin && !c.archived && (
                      <button onClick={enrol}>Add learners</button>
                    )}
                  </div>
                  <p className="admin-muted">
                    These starting marks and targets come from enrollment. They
                    are separate from tutor-assessed results.
                  </p>
                  {classMembers.length ? (
                    <div className="teaching-members">
                      {classMembers.map((m) => (
                        <div key={m.id}>
                          <strong>{m.name}</strong>
                          <small>
                            {m.studentNumber} ·{" "}
                            {m.left_on ? `Left ${m.left_on}` : m.state}
                          </small>
                          <span>
                            Starting{" "}
                            {m.startingMark === null
                              ? "not set"
                              : `${m.startingMark}%`}{" "}
                            · Target{" "}
                            {m.targetMark === null
                              ? "not set"
                              : `${m.targetMark}%`}
                          </span>
                          {admin && !c.archived && !m.left_on && (
                            <button
                              onClick={() =>
                                show(
                                  "End class membership",
                                  "membership",
                                  <>
                                    <p>
                                      {m.name}. Past registers remain intact.
                                    </p>
                                    <Day value={ds.today} season={c.season} />
                                    <Reason />
                                  </>,
                                  (f) => ({
                                    classId: c.id,
                                    applicationId: m.application_id,
                                    day: text(f, "day"),
                                    change: "remove",
                                    reason: text(f, "reason"),
                                  }),
                                )
                              }
                            >
                              End membership
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No learners in this class">
                      Add eligible active learners before teaching.
                    </EmptyState>
                  )}
                </section>
                <section className="admin-card">
                  <div className="teaching-section-heading">
                    <h2>
                      <FileText size={18} />
                      Class resources
                    </h2>
                    {admin && !c.archived && (
                      <button onClick={() => attach()}>Assign resource</button>
                    )}
                  </div>
                  <p className="admin-muted">
                    Specific versions are copied into new sessions. Changing a
                    class resource does not rewrite past sessions.
                  </p>
                  {ds.classMaterials
                    .filter((l) => l.class_id === cid && l.active)
                    .map((l) => {
                      const v = ds.versions.find((v) => v.id === l.version_id);
                      return v ? (
                        <div className="teaching-resource-row" key={v.id}>
                          <div>
                            <strong>
                              {
                                ds.materials.find((m) => m.id === v.material_id)
                                  ?.title
                              }
                            </strong>
                            <small>Version {v.version}</small>
                          </div>
                          <button
                            disabled={!!opening}
                            onClick={() => void file(v)}
                          >
                            View
                          </button>
                          {admin && !c.archived && (
                            <button
                              onClick={() =>
                                show(
                                  "Remove default class resource",
                                  "class_material",
                                  <p>
                                    Existing session attachments are retained.
                                  </p>,
                                  () => ({
                                    classId: cid,
                                    versionId: v.id,
                                    active: false,
                                  }),
                                )
                              }
                            >
                              Remove default
                            </button>
                          )}
                        </div>
                      ) : null;
                    })}
                </section>
              </div>
              <section className="admin-card">
                <div className="teaching-section-heading">
                  <h2>
                    <CalendarDays size={18} />
                    Sessions & retained history
                  </h2>
                  {admin && !c.archived && (
                    <button className="admin-primary" onClick={addSession}>
                      Schedule session
                    </button>
                  )}
                </div>
                <div className="teaching-sessions">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      className={sid === s.id ? "selected" : ""}
                      onClick={() => setSid(s.id)}
                    >
                      <span>
                        <strong>{s.topic_title}</strong>
                        <small>
                          {teachingDate(s.starts_at)} –{" "}
                          {teachingDate(s.ends_at)}
                        </small>
                      </span>
                      <span className={`teaching-status ${s.status}`}>
                        {s.status}
                      </span>
                    </button>
                  ))}
                </div>
                {!sessions.length && (
                  <EmptyState title="No sessions yet">
                    Choose a topic and an actual date to schedule teaching.
                  </EmptyState>
                )}
              </section>
              {session && (
                <section className="admin-card teaching-session-detail">
                  <span className="eyebrow">
                    SESSION RECORD · {session.status}
                  </span>
                  <h2>{session.topic_title}</h2>
                  <p>{session.learning_goal}</p>
                  <p>
                    {teachingDate(session.starts_at)} –{" "}
                    {teachingDate(session.ends_at)} · {session.venue_name}
                  </p>
                  {session.mode === "Online" ? (
                    <a
                      href={session.venue_detail}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open saved online room
                    </a>
                  ) : (
                    <p>{session.venue_detail}</p>
                  )}
                  <div className="teaching-actions">
                    {!c.archived && session.status !== "cancelled" && (
                      <button onClick={() => register(session)}>
                        {session.status === "completed"
                          ? "Correct attendance"
                          : "Record attendance"}
                      </button>
                    )}
                    {!c.archived && session.status === "scheduled" && (
                      <>
                        <button
                          className="admin-primary"
                          onClick={() => complete(session)}
                        >
                          Complete session
                        </button>
                        <button onClick={() => attach(true)}>
                          Attach resource
                        </button>
                        <button
                          onClick={() =>
                            show(
                              "Cancel this session",
                              "session_finish",
                              <>
                                <p>
                                  {session.topic_title}. This retains the record
                                  and does not create attendance.
                                </p>
                                <Reason />
                              </>,
                              (f) => ({
                                sessionId: session.id,
                                revision: session.revision,
                                status: "cancelled",
                                reason: text(f, "reason"),
                              }),
                            )
                          }
                        >
                          Cancel session
                        </button>
                      </>
                    )}
                  </div>
                  <div className="teaching-register">
                    {ds.roster
                      .filter((r) => r.session_id === sid)
                      .map((r) => (
                        <div key={r.application_id}>
                          <span>
                            <strong>{r.learner_name}</strong>
                            <small>
                              {r.student_number} · Target at scheduling:{" "}
                              {r.target_mark === null
                                ? "not set"
                                : r.target_mark + "%"}
                            </small>
                          </span>
                          <span
                            className={`teaching-status ${r.attendance || ""}`}
                          >
                            {!r.included
                              ? "Membership ended"
                              : r.attendance || "Not recorded"}
                          </span>
                        </div>
                      ))}
                  </div>
                  <h3>Saved session materials</h3>
                  {ds.sessionMaterials
                    .filter((m) => m.session_id === sid && m.active)
                    .map((m) => {
                      const v = ds.versions.find((v) => v.id === m.version_id);
                      return v ? (
                        <div className="teaching-resource-row" key={v.id}>
                          <span>
                            {
                              ds.materials.find((m) => m.id === v.material_id)
                                ?.title
                            }{" "}
                            · v{v.version}
                          </span>
                          <button
                            disabled={!!opening}
                            onClick={() => void file(v)}
                          >
                            View file
                          </button>
                        </div>
                      ) : null;
                    })}
                  {session.outcome && (
                    <p>
                      <CheckCircle2 size={17} /> Outcome: {session.outcome}
                    </p>
                  )}
                  {session.staff_note && (
                    <p className="teaching-private-note">
                      Private staff note: {session.staff_note}
                    </p>
                  )}
                  {session.cancel_reason && (
                    <p>Cancellation reason: {session.cancel_reason}</p>
                  )}
                  <SessionHistory
                    key={session.id}
                    sessionId={session.id}
                    audience={audience}
                  />
                </section>
              )}
            </>
          )}
        </>
      )}
      {form && (
        <TeachingForm
          key={form.title}
          spec={form}
          audience={audience}
          close={() => setForm(null)}
          changed={load}
          labels={Object.fromEntries([
            ...ds.classes.map((c) => [c.id, c.name]),
            ...ds.tutors.map((t) => [t.id, t.name]),
            ...ds.topics.map((t) => [t.id, t.title]),
            ...ds.venues.map((v) => [v.id, v.name]),
            ...ds.learners.map((l) => [l.id, l.name]),
            ...ds.sessions.map((s) => [
              s.id,
              s.topic_title + " · " + teachingDate(s.starts_at),
            ]),
            ...ds.versions.map((v) => [v.id, v.file_name + " · v" + v.version]),
          ])}
        />
      )}
      {viewer && (
        <DocumentViewer document={viewer} close={() => setViewer(null)} />
      )}
    </div>
  );
}
