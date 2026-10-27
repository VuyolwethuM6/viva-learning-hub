import { VivaLoader } from "@/components/VivaLoader";
import { SubjectProgressCard } from "./SubjectProgressCard";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, ClipboardList, Clock, Target } from "lucide-react";
import {
  academicFetch,
  academicWrite,
  type AcademicAudience,
} from "@/lib/academic-client";
import type { AcademicSnapshot } from "@/lib/academic-types";
import { teachingDate } from "@/lib/teaching-client";
import {
  Dialog,
  DocumentViewer,
  type ViewedDocument,
} from "./admin/AdminPrimitives";
import "../pages/admin.css";
import "./academic.css";
export function AcademicLearner({
  application,
  progressOnly = false,
  summary = false,
  classId,
  onNavigate,
  onProgress,
}: {
  application?: string;
  progressOnly?: boolean;
  summary?: boolean;
  classId?: string;
  onNavigate?: () => void;
  onProgress?: () => void;
}) {
  const audience: AcademicAudience = application ? "parent" : "student";
  const [data, setData] = useState<AcademicSnapshot | null>(null),
    [tid, setTid] = useState(""),
    [filter, setFilter] = useState("To do"),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [viewer, setViewer] = useState<ViewedDocument | null>(null),
    [intent, setIntent] = useState<{
      title: string;
      operation: string;
      data: Record<string, unknown>;
    } | null>(null),
    [tick, setTick] = useState(Date.now());
  const offset = useRef(0),
    lastRequest = useRef<{ key: string; id: string }>(),
    lock = useRef(false),
    generation = useRef(0);
  const load = useCallback(async () => {
    const gen = ++generation.current;
    setLoading(true);
    try {
      const d = (await (
        await academicFetch(
          audience,
          tid ? "task=" + tid : "",
          undefined,
          application,
        )
      ).json()) as AcademicSnapshot;
      if (gen !== generation.current) return;
      const receivedAt = Date.now();
      offset.current = Date.parse(d.now) - receivedAt;
      setTick(receivedAt);
      setData(d);
      setError("");
    } catch (e) {
      if (gen === generation.current)
        setError(
          e instanceof Error ? e.message : "Academic work could not be loaded.",
        );
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [audience, tid, application]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!tid || progressOnly || summary) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [tid, progressOnly, summary]);
  useEffect(
    () => () => {
      if (viewer) URL.revokeObjectURL(viewer.url);
    },
    [viewer],
  );
  const task = data?.tasks.find((t) => t.id === tid),
    attempt = data?.attempts.find((a) => a.task_id === tid);
  useEffect(() => {
    setAnswer(attempt?.answer || "");
  }, [attempt?.id, attempt?.revision, attempt?.answer]);
  async function run(operation: string, input: Record<string, unknown>) {
    if (application || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const key = JSON.stringify({ operation, input });
    if (lastRequest.current?.key !== key)
      lastRequest.current = { key, id: crypto.randomUUID() };
    try {
      const result = await academicWrite("student", operation, {
        ...input,
        requestId: lastRequest.current!.id,
      });
      lastRequest.current = undefined;
      await load();
      setIntent(null);
      setNotice(
        result.result.receipt
          ? `Submission confirmed. Receipt: ${result.result.receipt}`
          : operation === "draft_save"
            ? "Draft saved. This is not a final submission."
            : "Your work record was updated.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The action was not confirmed. Refresh before retrying.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function upload(file: File, existingId?: string) {
    if (!attempt || application || lock.current) return;
    if (
      !file.size ||
      file.size > 10485760 ||
      !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
    ) {
      setError("Choose a PDF, JPEG or PNG up to 10 MB.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    let uploadError = "";
    try {
      const id = existingId || crypto.randomUUID();
      const prepared = await academicWrite(
        "student",
        existingId ? "upload_resume" : "upload_prepare",
        {
          attemptId: attempt.id,
          id,
          name: file.name,
          mime: file.type,
          size: file.size,
          requestId: crypto.randomUUID(),
        },
      );
      if (!prepared.url)
        throw new Error(
          "Upload link unavailable. Refresh and resume the saved pending file.",
        );
      const response = await fetch(prepared.url, {
        method: "PUT",
        headers: { "Content-Type": file.type, "x-upsert": "false" },
        body: file,
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok)
        throw new Error(
          "Upload was not confirmed. Use Verify upload if the object exists, or resume the original pending file.",
        );
      await academicWrite("student", "upload_finalize", {
        attemptId: attempt.id,
        id,
        requestId: crypto.randomUUID(),
      });
      setNotice(
        "File uploaded and verified. Review and submit to receive a submission receipt.",
      );
    } catch (e) {
      uploadError = e instanceof Error ? e.message : "Upload not confirmed.";
    } finally {
      await load();
      if (uploadError) setError(uploadError);
      setBusy(false);
      lock.current = false;
    }
  }
  async function open(
    id: string,
    kind: string,
    name: string,
    mime = "application/pdf",
  ) {
    setBusy(true);
    setError("");
    try {
      const r = await academicFetch(
        audience,
        kind === "report" ? "report=" + id : `file=${id}&kind=${kind}`,
        undefined,
        application,
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
  if (!data)
    return (
      <section className="academic-panel">
        <h3>Assigned work & progress</h3>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <VivaLoader label="Loading academic records…" />
        )}
        {error && <button onClick={() => void load()}>Try again</button>}
      </section>
    );
  const ds = data,
    now = tick + offset.current;
  const recipient = ds.recipients.find((r) => r.task_id === tid);
  const closes = recipient?.extended_closes_at || task?.closes_at;
  const deadline = attempt?.deadline || closes;
  const expired = !!deadline && now >= Date.parse(deadline);
  const opened = !!task && now >= Date.parse(task.opens_at);
  const editable =
    !application &&
    task?.state === "assigned" &&
    !task.class_archived &&
    attempt?.state === "draft" &&
    !expired &&
    opened;
  const uploads = ds.uploads.filter(
      (u) => u.attempt_id === attempt?.id && !u.discarded,
    ),
    pub = ds.grades.filter((g) => g.task_id === tid);
  const remaining = deadline
    ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000))
    : 0;
  const visibleTasks = ds.tasks.filter(
    (t) => !classId || t.class_id === classId,
  );
  const filteredTasks = visibleTasks.filter((t) => {
    const submitted = ds.attempts.some(
      (a) => a.task_id === t.id && a.state === "submitted",
    );
    const result = ds.grades.some((g) => g.task_id === t.id);
    return (
      filter === "All" ||
      (filter === "Results"
        ? result
        : filter === "Submitted"
          ? submitted
          : t.state === "assigned" && !submitted)
    );
  });
  const pending = visibleTasks.filter(
    (t) =>
      t.state === "assigned" &&
      !ds.attempts.some((a) => a.task_id === t.id && a.state === "submitted"),
  ).length;
  return (
    <div
      className={`academic-workspace ${application ? "academic-family" : ""}`}
    >
      <div className="academic-heading">
        <div>
          <span className="learning-eyebrow">
            {application
              ? "YOUR CHILD’S LEARNING RECORD"
              : "YOUR ASSIGNED WORK"}
          </span>
          <h2>
            {summary
              ? application
                ? "Subject progress"
                : "My work"
              : progressOnly
                ? "Progress & reports"
                : "Assigned work"}
          </h2>
        </div>
        <button
          disabled={busy || loading}
          aria-label="Refresh assigned work"
          onClick={() => void load()}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      {summary ? (
        <>
          {application && !ds.progress.length && (
            <p className="viva-caption">No results published yet.</p>
          )}
          {application && (
            <div className="academic-grid">
              {ds.progress
                .filter(
                  (p) =>
                    !ds.progress.some(
                      (other) =>
                        other.className === p.className &&
                        other.subject === p.subject &&
                        other.startsOn > p.startsOn,
                    ),
                )
                .map((p) => (
                  <SubjectProgressCard key={p.periodId} progress={p} compact />
                ))}
            </div>
          )}
          <p>
            {pending
              ? `${pending} item${pending === 1 ? "" : "s"} awaiting submission`
              : "No work awaiting submission."}
          </p>
          {visibleTasks
            .filter(
              (t) =>
                t.state === "assigned" &&
                !ds.attempts.some(
                  (a) => a.task_id === t.id && a.state === "submitted",
                ),
            )
            .sort((a, b) => a.due_at.localeCompare(b.due_at))
            .slice(0, 2)
            .map((t) => (
              <div className="academic-row" key={t.id}>
                <div>
                  <strong>{t.title}</strong>
                  <p>Due {teachingDate(t.due_at)}</p>
                </div>
                <span className="viva-pill">{t.kind}</span>
              </div>
            ))}
          {onNavigate && (
            <button onClick={onNavigate}>Open assigned work →</button>
          )}
          {!application && ds.grades.some((g) => g.state === "published") && (
            <>
              <h3>Recent results</h3>
              {[...ds.grades]
                .filter((g) => g.state === "published")
                .sort((a, b) =>
                  (b.published_at || "").localeCompare(a.published_at || ""),
                )
                .slice(0, 3)
                .map((g) => (
                  <div className="academic-row" key={g.id}>
                    <strong>
                      {ds.tasks.find((t) => t.id === g.task_id)?.title ||
                        "Assessment"}
                    </strong>
                    <span className="viva-pill">
                      {g.score}/
                      {ds.tasks.find((t) => t.id === g.task_id)?.max_marks}
                    </span>
                  </div>
                ))}
              {onProgress && (
                <button onClick={onProgress}>View my progress →</button>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {!progressOnly && (
            <>
              {!task && (
                <>
                  <div className="viva-chips" aria-label="Assigned work views">
                    {["To do", "Submitted", "Results", "All"].map((f) => (
                      <button
                        key={f}
                        aria-pressed={filter === f}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="academic-grid">
                    {filteredTasks.map((t) => {
                      const a = ds.attempts.find((a) => a.task_id === t.id),
                        g = ds.grades.find((g) => g.task_id === t.id);
                      return (
                        <button
                          className={`academic-task-card learning-card ${t.id === tid ? "selected" : ""}`}
                          key={t.id}
                          onClick={() => {
                            setTid(t.id);
                            setNotice("");
                          }}
                        >
                          <ClipboardList size={22} />
                          <strong>{t.title}</strong>
                          <span>
                            {t.purpose} · {t.kind}
                          </span>
                          <small>
                            {t.state === "cancelled"
                              ? "Cancelled"
                              : a?.state === "returned"
                                ? "Returned for correction"
                                : a?.state === "draft"
                                  ? "Draft — not submitted"
                                  : g
                                    ? "Result published"
                                    : a?.state === "submitted"
                                      ? "Submitted — awaiting published feedback"
                                      : "Not started"}
                          </small>
                          <small>Due {teachingDate(t.due_at)}</small>
                        </button>
                      );
                    })}
                  </div>
                  {!filteredTasks.length && (
                    <p className="academic-empty">
                      {visibleTasks.length
                        ? "No work in this view."
                        : "No work shared for this classroom yet."}
                    </p>
                  )}
                </>
              )}
              {task && (
                <section className="learning-card academic-task-detail">
                  <button
                    className="viva-back"
                    disabled={busy || loading}
                    onClick={() => {
                      setTid("");
                      setNotice("");
                    }}
                  >
                    ← All assigned work
                  </button>
                  <h2>{task.title}</h2>
                  <p>{task.learning_goal}</p>
                  <p className="academic-instructions">{task.instructions}</p>
                  <p>
                    Opens {teachingDate(task.opens_at)} · Due{" "}
                    {teachingDate(task.due_at)}
                  </p>
                  <p>
                    Hard close {teachingDate(closes!)} · {task.max_marks} marks
                    · {task.submission_method} response
                  </p>
                  <p>
                    {task.purpose === "diagnostic"
                      ? "Diagnostic: separate from your formal average."
                      : task.counts_average
                        ? "Included in your formal average after publication."
                        : "Feedback is separate from your formal average."}
                  </p>
                  {task.state === "cancelled" ? (
                    <p className="academic-empty">
                      This work was cancelled. It does not become a zero mark.
                    </p>
                  ) : (
                    <>
                      {task.duration_minutes && opened && !application && (
                        <p className="academic-countdown">
                          <Clock size={18} />
                          {attempt
                            ? expired
                              ? "Time ended — no new submission is accepted."
                              : `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m ${remaining % 60}s remaining`
                            : `${task.duration_minutes} minutes after you start, capped by the closing time.`}
                        </p>
                      )}
                      {ds.resources
                        .filter((r) => r.task_id === tid)
                        .map((r) => (
                          <div key={r.version_id} className="academic-row">
                            <span>
                              {r.name} ·{" "}
                              {r.role === "memo"
                                ? "Released memorandum"
                                : "Task resource"}
                            </span>
                            <button
                              disabled={busy || loading}
                              onClick={() =>
                                void open(
                                  r.version_id,
                                  "resource",
                                  r.name,
                                  r.mime,
                                )
                              }
                            >
                              Open resource
                            </button>
                          </div>
                        ))}
                      {application && (
                        <p className="academic-empty">
                          Parent view: submission status and published feedback.
                          Starting or submitting work requires the student’s own
                          authorised sign-in.
                        </p>
                      )}
                      {!application &&
                        !task.class_archived &&
                        (!attempt || attempt.state === "returned") &&
                        opened &&
                        !expired && (
                          <button
                            className="admin-primary"
                            disabled={busy || loading}
                            onClick={() =>
                              setIntent({
                                title:
                                  task.kind === "exam"
                                    ? "Start timed assessment?"
                                    : "Start your work?",
                                operation: "attempt_start",
                                data: { taskId: tid },
                              })
                            }
                          >
                            {" "}
                            {task.kind === "exam"
                              ? "Start timed assessment"
                              : "Start / continue work"}
                          </button>
                        )}
                      {task.class_archived && (
                        <p className="academic-empty">
                          This class is archived. Published records remain
                          available; new work cannot be submitted.
                        </p>
                      )}
                      {!opened && (
                        <p className="academic-empty">
                          This task has not opened yet.
                        </p>
                      )}
                      {attempt && (
                        <>
                          <p>
                            Attempt {attempt.attempt} · {attempt.state}
                            {attempt.late ? " · Submitted late" : ""}
                          </p>
                          {attempt.receipt && (
                            <p className="academic-receipt">
                              Submission confirmed: {attempt.receipt}
                              <br />
                              {teachingDate(attempt.submitted_at!)} · Your
                              submitted record is retained.
                            </p>
                          )}
                          {attempt.return_reason && (
                            <p>Returned: {attempt.return_reason}</p>
                          )}
                          {task.submission_method !== "file" &&
                            (editable ? (
                              <label className="academic-answer-input">
                                Your answer
                                <textarea
                                  aria-label="Your answer"
                                  value={answer}
                                  maxLength={6000}
                                  rows={8}
                                  onChange={(e) => setAnswer(e.target.value)}
                                  disabled={busy || loading}
                                />
                                <small>
                                  {answer !== attempt.answer
                                    ? "Unsaved changes. Save draft or submit to save your current answer."
                                    : "Saved draft. A draft is not a confirmed submission."}
                                </small>
                              </label>
                            ) : (
                              <pre className="academic-answer">
                                {attempt.answer || "No written answer saved."}
                              </pre>
                            ))}
                          {uploads.map((u) => (
                            <div className="academic-upload" key={u.id}>
                              <strong>{u.file_name}</strong>
                              <span>
                                {u.finalized_at
                                  ? "Verified upload"
                                  : "Pending verification — not submitted"}
                              </span>
                              {u.finalized_at && (
                                <button
                                  disabled={busy || loading}
                                  onClick={() =>
                                    void open(
                                      u.id,
                                      "submission",
                                      u.file_name,
                                      u.mime,
                                    )
                                  }
                                >
                                  Open your file
                                </button>
                              )}
                              {editable && !u.finalized_at && (
                                <>
                                  <button
                                    disabled={busy || loading}
                                    onClick={() =>
                                      void run("upload_finalize", {
                                        attemptId: attempt.id,
                                        id: u.id,
                                      })
                                    }
                                  >
                                    Verify upload
                                  </button>
                                  <label>
                                    Resume original file
                                    <input
                                      type="file"
                                      accept="application/pdf,image/jpeg,image/png"
                                      disabled={busy || loading}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void upload(file, u.id);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                </>
                              )}
                              {editable && (
                                <button
                                  disabled={busy || loading}
                                  onClick={() =>
                                    setIntent({
                                      title: "Remove file from this draft?",
                                      operation: "upload_discard",
                                      data: { attemptId: attempt.id, id: u.id },
                                    })
                                  }
                                >
                                  Remove from draft
                                </button>
                              )}
                            </div>
                          ))}
                          {editable && (
                            <>
                              {task.submission_method !== "text" &&
                                uploads.length < 3 && (
                                  <label>
                                    Upload answer file · PDF/photo up to 10 MB,
                                    maximum three files
                                    <input
                                      aria-label="Upload answer file"
                                      type="file"
                                      accept="application/pdf,image/jpeg,image/png"
                                      disabled={busy || loading}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void upload(file);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                )}
                              <div className="teaching-actions">
                                <button
                                  disabled={busy || loading}
                                  onClick={() =>
                                    void run("draft_save", {
                                      attemptId: attempt.id,
                                      revision: attempt.revision,
                                      answer,
                                    })
                                  }
                                >
                                  Save draft
                                </button>
                                <button
                                  className="admin-primary"
                                  disabled={
                                    busy ||
                                    loading ||
                                    uploads.some((u) => !u.finalized_at)
                                  }
                                  onClick={() =>
                                    setIntent({
                                      title: "Review and submit your work",
                                      operation: "submit",
                                      data: {
                                        attemptId: attempt.id,
                                        revision: attempt.revision,
                                        answer,
                                      },
                                    })
                                  }
                                >
                                  Review & submit
                                </button>
                              </div>
                            </>
                          )}
                          {expired && attempt.state === "draft" && (
                            <p role="status" className="academic-empty">
                              The deadline has passed. Your draft is retained
                              but has not been submitted. Contact your tutor if
                              an authorised extension is needed.
                            </p>
                          )}
                        </>
                      )}
                      {pub.length > 0 && (
                        <section className="academic-published">
                          <h3>Published feedback</h3>
                          <strong>
                            {pub[0].score}/{task.max_marks} ·{" "}
                            {Math.round((100 * pub[0].score) / task.max_marks)}%
                          </strong>
                          <p>{pub[0].feedback}</p>
                          <p>
                            Revision {pub[0].revision} · Published{" "}
                            {teachingDate(pub[0].published_at!)}
                          </p>
                          {pub.length > 1 && (
                            <details>
                              <summary>Earlier published revisions</summary>
                              {pub.slice(1).map((g) => (
                                <p key={g.id}>
                                  Revision {g.revision}: {g.score}/
                                  {task.max_marks} · {g.feedback}
                                </p>
                              ))}
                            </details>
                          )}
                        </section>
                      )}
                    </>
                  )}
                </section>
              )}
            </>
          )}
          {progressOnly && (
            <>
              <div className="academic-grid">
                {ds.progress.map((p) => (
                  <SubjectProgressCard key={p.periodId} progress={p} />
                ))}
              </div>
              {!ds.progress.length && (
                <p className="academic-empty">
                  No assessment reporting period is available for this learner
                  yet.
                </p>
              )}
              <h3>Published progress reports</h3>
              {ds.reports.map((r) => (
                <article className="learning-card academic-row" key={r.id}>
                  <div>
                    <strong>
                      {r.content.subject} · {r.content.startsOn}–
                      {r.content.endsOn}
                    </strong>
                    <p>
                      {r.content.average === null
                        ? "No eligible assessed average"
                        : `${r.content.average}%`}{" "}
                      · Published {teachingDate(r.created_at)}
                    </p>
                  </div>
                  <button
                    disabled={busy || loading}
                    onClick={() =>
                      void open(r.id, "report", "Viva-progress-report.pdf")
                    }
                  >
                    Open report PDF
                  </button>
                </article>
              ))}
              {!ds.reports.length && <p>No progress reports published yet.</p>}
            </>
          )}
        </>
      )}
      {intent && (
        <Dialog
          title={intent.title}
          variant="confirm"
          close={() => setIntent(null)}
          busy={busy}
        >
          <p>
            {intent.operation === "attempt_start" && task?.kind === "exam"
              ? "The timer starts when you confirm. There is one final attempt, and the server enforces your closing time."
              : intent.operation === "submit"
                ? "Check that every required answer and file is included. Submission becomes final only when the server returns your receipt. Uploading or saving a draft alone does not submit work."
                : "The original record is retained in history."}
          </p>
          {intent.operation === "submit" && (
            <>
              <p>
                Written answer:{" "}
                {answer ? `${answer.length} characters` : "None"}
              </p>
              {uploads.map((u) => (
                <p key={u.id}>
                  {u.file_name} · {u.finalized_at ? "Verified" : "Not verified"}
                </p>
              ))}
              <p>Closes {deadline && teachingDate(deadline)}</p>
            </>
          )}
          <div className="confirm-actions">
            <button
              className="admin-primary"
              disabled={busy || loading}
              onClick={() => void run(intent.operation, intent.data)}
            >
              {busy
                ? "Confirming…"
                : intent.operation === "submit"
                  ? "Submit now"
                  : "Confirm"}
            </button>
            <button disabled={busy || loading} onClick={() => setIntent(null)}>
              Back
            </button>
          </div>
          {error && (
            <p role="alert" className="admin-error">
              {error}
            </p>
          )}
        </Dialog>
      )}
      {viewer && (
        <div className="admin-shell academic-document-scope">
          <DocumentViewer document={viewer} close={() => setViewer(null)} />
        </div>
      )}
    </div>
  );
}
export function ParentAcademics({ application }: { application: string }) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState("Results");
  return (
    <section className="parent-card academic-parent">
      <div className="viva-section-heading">
        <div>
          <span className="viva-kicker">Learning progress</span>
          <h2>Results & assigned work</h2>
        </div>
        <Target size={22} />
      </div>
      <div className="viva-chips" aria-label="Child learning views">
        {["Results", "Assigned work"].map((v) => (
          <button
            key={v}
            aria-pressed={view === v}
            onClick={() => {
              setView(v);
              setOpen(true);
            }}
          >
            {v}
          </button>
        ))}
      </div>
      {!open && <AcademicLearner application={application} summary />}
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          {open ? "Close learning details" : "View learning details"}
        </summary>
        {open && (
          <AcademicLearner
            key={view}
            application={application}
            progressOnly={view === "Results"}
          />
        )}
      </details>
    </section>
  );
}
