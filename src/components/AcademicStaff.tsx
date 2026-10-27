import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { RefreshCw, ClipboardList, FileText } from "lucide-react";
import {
  academicFetch,
  academicWrite,
  localAcademicTime,
  methodLabel,
} from "@/lib/academic-client";
import type {
  AcademicSnapshot,
  AcademicTask,
  AcademicAttempt,
} from "@/lib/academic-types";
import { teachingRequest, teachingDate } from "@/lib/teaching-client";
import type { TeachingSnapshot } from "@/lib/teaching-types";
import {
  Dialog,
  DocumentViewer,
  type ViewedDocument,
} from "./admin/AdminPrimitives";
import "./academic.css";
const text = (f: FormData, k: string) => String(f.get(k) || "").trim();
function Choice({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: string[];
  value?: string;
}) {
  return (
    <label>
      {label}
      <select
        name={name}
        aria-label={label}
        defaultValue={value || ""}
        required
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
function WorkFields({
  data,
  teaching,
  cid,
}: {
  data: AcademicSnapshot;
  teaching: TeachingSnapshot;
  cid: string;
}) {
  const [kind, setKind] = useState("homework"),
    [purpose, setPurpose] = useState("formative"),
    [late, setLate] = useState(false),
    [due, setDue] = useState(
      localAcademicTime(
        new Date(Date.parse(data.now) + 86400000).toISOString(),
      ),
    );
  const c = teaching.classes.find((c) => c.id === cid)!;
  const periods = data.periods.filter((p) => p.class_id === cid);
  return (
    <>
      <p>{c.name}</p>
      <label>
        Reporting period
        <select name="periodId" aria-label="Reporting period" required>
          <option value="">Choose…</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.starts_on}–{p.ends_on} · {methodLabel[p.method]}
            </option>
          ))}
        </select>
      </label>
      {!periods.length && (
        <p className="admin-notice">
          Admin must configure a reporting period and calculation method first.
        </p>
      )}
      <label>
        Work type
        <select
          name="kind"
          aria-label="Work type"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setLate(false);
          }}
        >
          <option value="activity">Session activity</option>
          <option value="homework">Homework</option>
          <option value="exam">Timed assessment</option>
        </select>
      </label>
      <label>
        Assessment purpose
        <select
          name="purpose"
          aria-label="Assessment purpose"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        >
          <option value="diagnostic">
            Diagnostic · identify learning gaps
          </option>
          <option value="formative">Formative · support learning</option>
          <option value="summative">Summative · evaluate achievement</option>
        </select>
      </label>
      <Choice
        name="format"
        label="Assessment format"
        options={[
          "Quiz",
          "Worksheet",
          "Homework",
          "Project",
          "Test",
          "Practical",
          "Exam",
        ]}
        value={kind === "exam" ? "Exam" : "Worksheet"}
      />
      <label>
        Topic and learning goal
        <select name="topicId" aria-label="Topic and learning goal" required>
          <option value="">Choose…</option>
          {teaching.topics
            .filter(
              (t) => t.grade === c.grade && t.subject === c.subject && t.active,
            )
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
        </select>
      </label>
      <label>
        Related session{kind !== "activity" && " · optional"}
        <select
          name="sessionId"
          aria-label="Related session"
          required={kind === "activity"}
        >
          <option value="">
            {kind === "activity" ? "Choose…" : "Standalone work"}
          </option>
          {teaching.sessions
            .filter((s) => s.class_id === cid && s.status !== "cancelled")
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.topic_title} · {teachingDate(s.starts_at)}
              </option>
            ))}
        </select>
      </label>
      <label>
        Instructions
        <textarea
          name="instructions"
          aria-label="Instructions"
          required
          minLength={5}
          maxLength={4000}
          rows={4}
          defaultValue="Complete every question. Show your working clearly, then review and submit your answer before the closing time."
        />
      </label>
      <Choice
        name="submissionMethod"
        label="Student response"
        options={["file", "text", "both"]}
        value="file"
      />
      <label>
        Opens · South Africa
        <input
          type="datetime-local"
          name="opensAt"
          defaultValue={localAcademicTime(data.now)}
          required
        />
      </label>
      <label>
        Due · South Africa
        <input
          type="datetime-local"
          name="dueAt"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          required
        />
      </label>
      {kind !== "exam" && (
        <label>
          <input
            type="checkbox"
            checked={late}
            onChange={(e) => setLate(e.target.checked)}
          />
          Allow late work until a separate hard closing time
        </label>
      )}
      {late ? (
        <label>
          Hard close · South Africa
          <input
            type="datetime-local"
            name="closesAt"
            min={due}
            defaultValue={due}
            required
          />
        </label>
      ) : (
        <input type="hidden" name="closesAt" value={due} />
      )}
      {kind === "exam" ? (
        <Choice
          name="durationMinutes"
          label="Time allowed after starting · minutes"
          options={["15", "30", "45", "60", "90", "120", "180", "240"]}
          value="60"
        />
      ) : (
        <input type="hidden" name="durationMinutes" value="" />
      )}
      <label>
        Maximum marks
        <input
          name="maxMarks"
          type="number"
          min="1"
          max="10000"
          step="1"
          defaultValue="20"
          required
        />
      </label>
      <Choice
        key={purpose}
        name="countsAverage"
        label="Include in formal average?"
        options={purpose === "diagnostic" ? ["No"] : ["No", "Yes"]}
        value="No"
      />
      <Choice
        name="weight"
        label="Assessment weight · used by weighted periods"
        options={["1", "2", "3", "5", "10", "20", "25", "50", "100"]}
        value="1"
      />
      {kind === "exam" ? (
        <input name="maxAttempts" type="hidden" value="1" />
      ) : (
        <Choice
          name="maxAttempts"
          label="Maximum attempts · staff must return work before another attempt"
          options={["1", "2", "3"]}
          value="1"
        />
      )}
      <fieldset>
        <legend>Saved resources · optional, up to 20</legend>
        <p>
          Question papers open with the task. Memoranda stay private until admin
          explicitly releases them after all closing times.
        </p>
        {teaching.versions
          .filter(
            (v) =>
              v.finalized_at &&
              teaching.materials.some(
                (m) =>
                  m.id === v.material_id &&
                  m.grade === c.grade &&
                  m.subject === c.subject &&
                  (teaching.audience === "admin" ||
                    m.owner_class_id === cid ||
                    teaching.classMaterials.some(
                      (cm) =>
                        cm.class_id === cid &&
                        cm.version_id === v.id &&
                        cm.active,
                    )),
              ),
          )
          .map((v) => (
            <label key={v.id}>
              {v.file_name} · v{v.version}
              <select name={`resource_${v.id}`}>
                <option value="">Not attached</option>
                <option value="instructions">
                  Learner instructions / question paper
                </option>
                <option value="memo">Private memorandum</option>
              </select>
            </label>
          ))}
      </fieldset>
    </>
  );
}
type Spec = {
  title: string;
  operation: string;
  fields: ReactNode;
  build: (f: FormData) => Record<string, unknown>;
};
function AcademicAction({
  spec,
  audience,
  close,
  saved,
  labels,
}: {
  spec: Spec;
  audience: "admin" | "tutor";
  close: () => void;
  saved: () => Promise<void>;
  labels: Record<string, string>;
}) {
  const id = useRef(crypto.randomUUID());
  const [review, setReview] = useState<Record<string, unknown> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function confirm() {
    if (!review || busy) return;
    setBusy(true);
    setError("");
    try {
      await academicWrite(audience, spec.operation, {
        ...review,
        requestId: id.current,
      });
      await saved();
      close();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Saving was not confirmed. Refresh before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={spec.title} variant="confirm" close={close} busy={busy}>
      {!review ? (
        <form
          className="academic-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setReview(spec.build(new FormData(e.currentTarget)));
              setError("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Check the choices");
            }
          }}
        >
          {spec.fields}
          <button className="admin-primary">Review choices</button>
        </form>
      ) : (
        <>
          <p>
            Confirm these details. The action and its author will be recorded.
          </p>
          <dl className="academic-review">
            {Object.entries(review)
              .filter(([k]) => !["fingerprint", "revision"].includes(k))
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
                  <dd>
                    {Array.isArray(v)
                      ? `${v.length} selected: ${v.map((item) => (typeof item === "string" ? labels[item] || item : item && typeof item === "object" && "versionId" in item ? `${labels[String(item.versionId)] || "Resource"} (${item.role})` : "Selection")).join(", ")}`
                      : typeof v === "boolean"
                        ? v
                          ? "Yes"
                          : "No"
                        : labels[String(v)] || String(v ?? "—")}
                  </dd>
                </div>
              ))}
          </dl>
          <div className="confirm-actions">
            <button
              className="admin-primary"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? "Saving…" : "Confirm and save"}
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
export function AcademicStaff({
  audience = "admin",
}: {
  audience?: "admin" | "tutor";
}) {
  const [data, setData] = useState<AcademicSnapshot | null>(null),
    [teaching, setTeaching] = useState<TeachingSnapshot | null>(null),
    [cid, setCid] = useState(""),
    [tid, setTid] = useState(""),
    [spec, setSpec] = useState<Spec | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [viewer, setViewer] = useState<ViewedDocument | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const t = await teachingRequest<TeachingSnapshot>(audience);
      const d: AcademicSnapshot = cid
        ? await (
            await academicFetch(
              audience,
              (tid ? "task=" + tid + "&" : "") + "class=" + cid,
            )
          ).json()
        : {
            now: t.now,
            audience,
            periods: [],
            tasks: [],
            recipients: [],
            attempts: [],
            uploads: [],
            grades: [],
            resources: [],
            progress: [],
            reports: [],
          };
      setData(d);
      setTeaching(t);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Academic records unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }, [audience, tid, cid]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(
    () => () => {
      if (viewer) URL.revokeObjectURL(viewer.url);
    },
    [viewer],
  );
  const show = (
    title: string,
    operation: string,
    fields: ReactNode,
    build: Spec["build"],
  ) => setSpec({ title, operation, fields, build });
  async function openFile(
    id: string,
    kind: string,
    name: string,
    mime = "application/pdf",
  ) {
    setBusy(true);
    try {
      const r = await academicFetch(
        audience,
        kind === "report" ? "report=" + id : `file=${id}&kind=${kind}`,
      );
      setViewer({
        title: name,
        url: URL.createObjectURL(await r.blob()),
        filename: name,
        mime,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "File unavailable");
    } finally {
      setBusy(false);
    }
  }
  if (!data || !teaching)
    return (
      <section className="admin-card">
        <h1>Assignments & assessments</h1>
        <p role={error ? "alert" : "status"}>
          {error || "Loading academic records…"}
        </p>
        {error && (
          <>
            <p>Run the academic setup migration before using this module.</p>
            <button onClick={() => void load()}>Retry</button>
          </>
        )}
      </section>
    );
  const ds = data,
    ts = teaching,
    c = ts.classes.find((c) => c.id === cid),
    task = ds.tasks.find((t) => t.id === tid),
    members = ts.memberships.filter((m) => m.class_id === cid);
  function createTask() {
    show(
      "Create assigned work",
      "task_create",
      <WorkFields data={ds} teaching={ts} cid={cid} />,
      (f) => ({
        classId: cid,
        periodId: text(f, "periodId"),
        topicId: text(f, "topicId"),
        ...(text(f, "sessionId") ? { sessionId: text(f, "sessionId") } : {}),
        kind: text(f, "kind"),
        purpose: text(f, "purpose"),
        format: text(f, "format"),
        instructions: text(f, "instructions"),
        submissionMethod: text(f, "submissionMethod"),
        opensAt: text(f, "opensAt"),
        dueAt: text(f, "dueAt"),
        closesAt: text(f, "closesAt"),
        durationMinutes: text(f, "durationMinutes"),
        maxMarks: Number(text(f, "maxMarks")),
        countsAverage: text(f, "countsAverage") === "Yes",
        weight: Number(text(f, "weight")),
        maxAttempts: Number(text(f, "maxAttempts")),
        resources: ts.versions
          .filter((v) => text(f, `resource_${v.id}`))
          .map((v) => ({ versionId: v.id, role: text(f, `resource_${v.id}`) })),
      }),
    );
  }
  function mark(att: AcademicAttempt) {
    const grades = ds.grades.filter(
      (g) =>
        g.task_id === att.task_id && g.application_id === att.application_id,
    );
    const latest = grades[0];
    show(
      "Mark learner submission",
      "grade_save",
      <>
        <p>
          {task!.title} ·{" "}
          {
            ds.recipients.find(
              (r) =>
                r.task_id === tid && r.application_id === att.application_id,
            )?.learner_name
          }
        </p>
        <label>
          Marks earned · out of {task!.max_marks}
          <input
            name="score"
            type="number"
            min="0"
            max={task!.max_marks}
            step="0.5"
            defaultValue={latest?.score ?? 0}
            required
          />
        </label>
        <label>
          Feedback visible after publication
          <textarea
            name="feedback"
            aria-label="Feedback visible after publication"
            required
            minLength={2}
            maxLength={4000}
            defaultValue={latest?.feedback || ""}
          />
        </label>
        <label>
          Private staff note
          <textarea
            aria-label="Private staff note"
            name="staffNote"
            maxLength={2000}
          />
        </label>
        {latest && (
          <label>
            Correction reason
            <textarea name="reason" required minLength={5} maxLength={500} />
          </label>
        )}
      </>,
      (f) => ({
        taskId: tid,
        attemptId: att.id,
        revision: latest?.revision || 0,
        score: Number(text(f, "score")),
        feedback: text(f, "feedback"),
        staffNote: text(f, "staffNote"),
        reason: text(f, "reason"),
      }),
    );
  }
  return (
    <div className="academic-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">LEARNING THAT CAN BE FOLLOWED</span>
          <h1>Assignments & assessments</h1>
          <p>
            Draft → assign → confirmed submission → mark → admin publication.
            South African times.
          </p>
        </div>
        <button
          disabled={busy}
          aria-label="Refresh academic records"
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
      <div className="academic-toolbar">
        <label>
          Teaching class
          <select
            aria-label="Teaching class"
            value={cid}
            onChange={(e) => {
              setBusy(true);
              setCid(e.target.value);
              setTid("");
            }}
          >
            <option value="">Choose…</option>
            {ts.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? " · Archived" : ""}
              </option>
            ))}
          </select>
        </label>
        {c && !c.archived && (
          <button
            className="admin-primary"
            disabled={busy || !ds.periods.some((p) => p.class_id === cid)}
            onClick={createTask}
          >
            Create work / diagnostic
          </button>
        )}
        {c && audience === "admin" && (
          <button
            onClick={() =>
              show(
                "Configure reporting period",
                "period_create",
                <>
                  <p>
                    Calculation policies cannot be edited after creation.
                    Missing/unmarked work is excluded and reported separately.
                  </p>
                  <label>
                    Period start
                    <input
                      type="date"
                      name="startsOn"
                      min={`${c.season}-02-01`}
                      max={`${c.season}-11-30`}
                      required
                    />
                  </label>
                  <label>
                    Period end
                    <input
                      type="date"
                      name="endsOn"
                      min={`${c.season}-02-01`}
                      max={`${c.season}-11-30`}
                      required
                    />
                  </label>
                  <label>
                    Calculation method
                    <select name="method" required>
                      <option value="">Choose…</option>
                      {Object.entries(methodLabel).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                </>,
                (f) => ({
                  classId: cid,
                  startsOn: text(f, "startsOn"),
                  endsOn: text(f, "endsOn"),
                  method: text(f, "method"),
                }),
              )
            }
          >
            Configure reporting period
          </button>
        )}
      </div>
      {c && !busy && !ds.periods.some((p) => p.class_id === cid) && (
        <p className="admin-notice">
          Admin must configure a reporting period before this class can receive
          work.
        </p>
      )}
      {!c ? (
        <p className="academic-empty">
          Choose a class to manage its work and reporting periods.
        </p>
      ) : (
        <>
          <div className="academic-grid">
            {ds.tasks
              .filter((t) => t.class_id === cid)
              .map((t) => (
                <button
                  key={t.id}
                  className={`admin-card academic-task-card ${tid === t.id ? "selected" : ""}`}
                  onClick={() => setTid(t.id)}
                >
                  <ClipboardList size={22} />
                  <strong>{t.title}</strong>
                  <small>
                    {t.purpose} · {t.kind} · {t.state}
                  </small>
                  <span>Due {teachingDate(t.due_at)}</span>
                </button>
              ))}
          </div>
          {!ds.tasks.some((t) => t.class_id === cid) && (
            <p className="academic-empty">
              No assigned work in this class yet.
            </p>
          )}
          {task && (
            <section className="admin-card academic-task-detail">
              <span className="eyebrow">
                {task.state.toUpperCase()} · {task.purpose.toUpperCase()}
              </span>
              <h2>{task.title}</h2>
              <p>{task.learning_goal}</p>
              <p className="academic-instructions">{task.instructions}</p>
              <p>
                Opens {teachingDate(task.opens_at)} · Due{" "}
                {teachingDate(task.due_at)} · Hard close{" "}
                {teachingDate(task.closes_at)}
              </p>
              <p>
                {task.max_marks} marks · {task.submission_method} response ·{" "}
                {task.duration_minutes
                  ? `${task.duration_minutes} minutes from start, capped by closing time`
                  : "No timed duration"}{" "}
                ·{" "}
                {task.counts_average
                  ? "Included in the period average"
                  : "Separate from formal average"}
              </p>
              <div className="teaching-actions">
                {task.state === "draft" && (
                  <button
                    className="admin-primary"
                    onClick={() =>
                      show(
                        "Assign work to learners",
                        "task_assign",
                        <fieldset>
                          <legend>
                            Eligible class learners · select recipients
                          </legend>
                          {members
                            .filter((m) => !m.left_on && m.state === "active")
                            .map((m) => (
                              <label key={m.id}>
                                <input
                                  type="checkbox"
                                  name="learners"
                                  value={m.application_id}
                                />
                                {m.name} · {m.studentNumber}
                              </label>
                            ))}
                        </fieldset>,
                        (f) => ({
                          taskId: tid,
                          revision: task.revision,
                          learners: f.getAll("learners").map(String),
                        }),
                      )
                    }
                  >
                    Assign to learners
                  </button>
                )}
                {task.state !== "cancelled" && (
                  <button
                    onClick={() =>
                      show(
                        "Cancel unused work",
                        "task_cancel",
                        <label>
                          Reason
                          <textarea name="reason" minLength={5} required />
                        </label>,
                        (f) => ({ taskId: tid, reason: text(f, "reason") }),
                      )
                    }
                  >
                    Cancel unused work
                  </button>
                )}
                {audience === "admin" &&
                  task.state === "assigned" &&
                  !task.memo_released && (
                    <button
                      onClick={() =>
                        show(
                          "Release memorandum",
                          "memo_release",
                          <>
                            <p>
                              Every learner's closing time must have passed. A
                              released memorandum prevents reopening this task.
                            </p>
                            <label>
                              Reason
                              <textarea name="reason" minLength={5} required />
                            </label>
                          </>,
                          (f) => ({ taskId: tid, reason: text(f, "reason") }),
                        )
                      }
                    >
                      Release memorandum after close
                    </button>
                  )}
              </div>
              <h3>Saved task resources</h3>
              {ds.resources
                .filter((r) => r.task_id === tid)
                .map((r) => (
                  <div key={r.version_id} className="academic-row">
                    <span>
                      {r.name} · v{r.version} · {r.role}
                    </span>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void openFile(r.version_id, "resource", r.name, r.mime)
                      }
                    >
                      Open resource
                    </button>
                  </div>
                ))}
              <h3>Learner submissions & marking</h3>
              {ds.recipients
                .filter((r) => r.task_id === tid)
                .map((r) => {
                  const attempts = ds.attempts.filter(
                      (a) =>
                        a.task_id === tid &&
                        a.application_id === r.application_id,
                    ),
                    latest = attempts[0],
                    grades = ds.grades.filter(
                      (g) =>
                        g.task_id === tid &&
                        g.application_id === r.application_id,
                    ),
                    g = grades[0];
                  return (
                    <article
                      key={r.application_id}
                      className="academic-learner"
                    >
                      <h3>{r.learner_name}</h3>
                      <p>
                        {r.student_number} · Starting {r.starting_mark ?? "—"}%
                        · Target {r.target_mark ?? "—"}%
                      </p>
                      <p>
                        {latest
                          ? `Attempt ${latest.attempt} · ${latest.state}${latest.late ? " · Late" : ""}`
                          : "No confirmed submission"}
                        {g
                          ? ` · Mark ${g.score}/${task.max_marks} · ${g.state}`
                          : ""}
                      </p>
                      {latest?.receipt && (
                        <p className="academic-receipt">
                          Receipt {latest.receipt} ·{" "}
                          {teachingDate(latest.submitted_at!)}
                        </p>
                      )}
                      {latest?.answer && (
                        <pre className="academic-answer">{latest.answer}</pre>
                      )}
                      {latest &&
                        ds.uploads
                          .filter(
                            (u) => u.attempt_id === latest.id && u.finalized_at,
                          )
                          .map((u) => (
                            <button
                              key={u.id}
                              disabled={busy}
                              onClick={() =>
                                void openFile(
                                  u.id,
                                  "submission",
                                  u.file_name,
                                  u.mime,
                                )
                              }
                            >
                              Open {u.file_name}
                            </button>
                          ))}
                      <div className="teaching-actions">
                        {latest?.state === "submitted" && (
                          <button
                            className="admin-primary"
                            onClick={() => mark(latest)}
                          >
                            Mark / revise feedback
                          </button>
                        )}
                        {latest?.state === "submitted" &&
                          !g &&
                          task.kind !== "exam" &&
                          latest.attempt < task.max_attempts && (
                            <button
                              onClick={() =>
                                show(
                                  "Return work for correction",
                                  "attempt_return",
                                  <label>
                                    Reason
                                    <textarea
                                      name="reason"
                                      minLength={5}
                                      required
                                    />
                                  </label>,
                                  (f) => ({
                                    attemptId: latest.id,
                                    reason: text(f, "reason"),
                                  }),
                                )
                              }
                            >
                              Return for correction
                            </button>
                          )}
                        {g?.state === "draft" && (
                          <button
                            onClick={() =>
                              show(
                                "Submit mark for admin review",
                                "grade_review",
                                <p>
                                  {r.learner_name} · {g.score}/{task.max_marks}.
                                  Feedback remains private until publication.
                                </p>,
                                () => ({ taskId: tid, gradeId: g.id }),
                              )
                            }
                          >
                            Submit mark for review
                          </button>
                        )}
                        {audience === "admin" && g?.state === "review" && (
                          <>
                            <button
                              className="admin-primary"
                              onClick={() =>
                                show(
                                  "Publish reviewed result",
                                  "grade_publish",
                                  <>
                                    <p>
                                      {r.learner_name} · {g.score}/
                                      {task.max_marks}
                                    </p>
                                    <p>{g.feedback}</p>
                                    <p>
                                      The student and their parent will see this
                                      revision. Earlier published marks remain
                                      in history.
                                    </p>
                                  </>,
                                  () => ({ taskId: tid, gradeId: g.id }),
                                )
                              }
                            >
                              Publish result
                            </button>
                            <button
                              onClick={() =>
                                show(
                                  "Return marking to tutor",
                                  "grade_reject",
                                  <label>
                                    Review reason
                                    <textarea
                                      name="reason"
                                      minLength={5}
                                      required
                                    />
                                  </label>,
                                  (f) => ({
                                    taskId: tid,
                                    gradeId: g.id,
                                    reason: text(f, "reason"),
                                  }),
                                )
                              }
                            >
                              Return marking
                            </button>
                          </>
                        )}
                        {task.state === "assigned" && (
                          <button
                            onClick={() =>
                              show(
                                "Authorize learner extension",
                                "extension",
                                <>
                                  <p>
                                    Extend only this learner. Timed work also
                                    needs additional minutes when its duration
                                    has expired. Submitted attempts remain
                                    final.
                                  </p>
                                  <label>
                                    New hard close · South Africa
                                    <input
                                      type="datetime-local"
                                      name="closesAt"
                                      min={localAcademicTime(
                                        r.extended_closes_at || task.closes_at,
                                      )}
                                      required
                                    />
                                  </label>
                                  <Choice
                                    name="extraMinutes"
                                    label="Total extra duration minutes"
                                    options={[
                                      "0",
                                      "15",
                                      "30",
                                      "45",
                                      "60",
                                      "90",
                                      "120",
                                      "180",
                                      "240",
                                      "360",
                                    ]}
                                    value={String(r.extra_minutes)}
                                  />
                                  <label>
                                    Extension reason
                                    <textarea
                                      name="reason"
                                      minLength={5}
                                      required
                                    />
                                  </label>
                                </>,
                                (f) => ({
                                  taskId: tid,
                                  applicationId: r.application_id,
                                  closesAt: text(f, "closesAt"),
                                  extraMinutes: Number(text(f, "extraMinutes")),
                                  reason: text(f, "reason"),
                                }),
                              )
                            }
                          >
                            Authorize extension
                          </button>
                        )}
                      </div>
                      {g && (
                        <details>
                          <summary>Marking history & feedback</summary>
                          {grades.map((g) => (
                            <div key={g.id} className="academic-mark-history">
                              <strong>
                                Revision {g.revision} · {g.score}/
                                {task.max_marks} · {g.state}
                              </strong>
                              <p>{g.feedback}</p>
                              {g.staff_note && (
                                <p>Private staff note: {g.staff_note}</p>
                              )}
                              {g.reason && <p>Reason: {g.reason}</p>}
                            </div>
                          ))}
                        </details>
                      )}
                      {attempts.length > 1 && (
                        <details>
                          <summary>Earlier submission receipts</summary>
                          {attempts.slice(1).map((a) => (
                            <p key={a.id}>
                              Attempt {a.attempt} · {a.state} · {a.receipt} ·{" "}
                              {a.return_reason}
                            </p>
                          ))}
                        </details>
                      )}
                    </article>
                  );
                })}
            </section>
          )}
          <section className="admin-card">
            <h2>Current assessed progress</h2>
            <div className="academic-grid">
              {ds.progress
                .filter((p) =>
                  ds.periods.some(
                    (period) =>
                      period.id === p.periodId && period.class_id === cid,
                  ),
                )
                .map((p) => (
                  <article
                    className="learning-card"
                    key={`${p.periodId}/${p.applicationId}`}
                  >
                    <h3>{p.learnerName}</h3>
                    <strong>
                      {p.average === null
                        ? "No eligible published average"
                        : `${p.average}%`}
                    </strong>
                    <p>
                      {p.startsOn}–{p.endsOn} · Target {p.targetMark ?? "—"}%
                    </p>
                    <p>
                      {methodLabel[p.method]} · {p.assessmentCount} included ·{" "}
                      {p.missingCount} awaiting result
                    </p>
                    <details>
                      <summary>Results and diagnostic baseline</summary>
                      {p.marks.map((m, i) => (
                        <p key={i}>
                          {m.title} · {m.percentage}% · {m.purpose} ·{" "}
                          {m.countsAverage ? "Included" : "Separate"} · Weight{" "}
                          {m.weight}
                        </p>
                      ))}
                    </details>
                  </article>
                ))}
            </div>
            <h2>Reporting periods & frozen progress reports</h2>
            {ds.periods
              .filter((p) => p.class_id === cid)
              .map((p) => (
                <div className="academic-row" key={p.id}>
                  <div>
                    <strong>
                      {p.starts_on}–{p.ends_on}
                    </strong>
                    <p>
                      {methodLabel[p.method]} · Missing/unmarked excluded and
                      counted separately
                    </p>
                  </div>
                  {audience === "admin" && (
                    <button
                      onClick={() =>
                        show(
                          "Publish learner progress report",
                          "report_publish",
                          <>
                            <label>
                              Learner
                              <select
                                name="applicationId"
                                aria-label="Learner"
                                required
                              >
                                <option value="">Choose…</option>
                                {members
                                  .filter(
                                    (m, i, all) =>
                                      all.findIndex(
                                        (x) =>
                                          x.application_id === m.application_id,
                                      ) === i,
                                  )
                                  .map((m) => (
                                    <option
                                      key={m.application_id}
                                      value={m.application_id}
                                    >
                                      {m.name} · {m.studentNumber}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              Publication reason
                              <textarea
                                name="reason"
                                required
                                minLength={5}
                                defaultValue="Period progress reviewed and published"
                              />
                            </label>
                            <p>
                              This saves a frozen report of published marks and
                              the period calculation. Later corrections require
                              a new report.
                            </p>
                          </>,
                          (f) => ({
                            classId: cid,
                            periodId: p.id,
                            applicationId: text(f, "applicationId"),
                            fingerprint: ds.progress.find(
                              (x) =>
                                x.periodId === p.id &&
                                x.applicationId === text(f, "applicationId"),
                            )?.fingerprint,
                            reason: text(f, "reason"),
                          }),
                        )
                      }
                    >
                      Publish learner report
                    </button>
                  )}
                </div>
              ))}
            {ds.reports
              .filter((r) =>
                ds.periods.some(
                  (p) => p.id === r.period_id && p.class_id === cid,
                ),
              )
              .map((r) => (
                <div className="academic-row" key={r.id}>
                  <span>
                    {r.content.learnerName} · {r.content.subject} ·{" "}
                    {r.content.average ?? "—"}% · {teachingDate(r.created_at)}
                  </span>
                  <button
                    onClick={() =>
                      void openFile(r.id, "report", "Viva-progress-report.pdf")
                    }
                  >
                    View report PDF
                  </button>
                </div>
              ))}
          </section>
        </>
      )}
      {spec && (
        <AcademicAction
          key={spec.title}
          spec={spec}
          audience={audience}
          close={() => setSpec(null)}
          saved={load}
          labels={Object.fromEntries([
            ...ts.classes.map((c) => [c.id, c.name]),
            ...ts.memberships.map((m) => [m.application_id, m.name]),
            ...ts.versions.map((v) => [v.id, `${v.file_name} · v${v.version}`]),
            ...ts.topics.map((t) => [t.id, t.title]),
            ...ds.tasks.map((t) => [t.id, t.title]),
            ...ds.periods.map((p) => [p.id, `${p.starts_on}–${p.ends_on}`]),
            ...ds.recipients.map((r) => [r.application_id, r.learner_name]),
            ...ts.sessions.map((s) => [
              s.id,
              s.topic_title + " · " + teachingDate(s.starts_at),
            ]),
          ])}
        />
      )}{" "}
      {viewer && (
        <DocumentViewer document={viewer} close={() => setViewer(null)} />
      )}
    </div>
  );
}
