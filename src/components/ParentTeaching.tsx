import { useEffect, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { parentRequest } from "@/lib/parent-client";
import type { ParentTeaching as Data } from "@/lib/teaching-types";
import { teachingDate } from "@/lib/teaching-client";
export function ParentTeaching({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    parentRequest<Data>(undefined, "?action=teaching")
      .then((value) => {
        if (active) {
          setData(value);
          setError("");
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Attendance could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [applicationId, attempt]);
  const records =
      data?.records.filter((r) => r.application_id === applicationId) || [],
    upcoming =
      data?.upcoming.filter((r) => r.application_id === applicationId) || [],
    summary = data?.summary.find((r) => r.application_id === applicationId);
  return (
    <section className="parent-card">
      <div className="parent-card-heading">
        <span className="parent-tile orange">
          <CalendarDays size={21} />
        </span>
        <h2>Classes & attendance</h2>
        <button
          className="parent-icon"
          aria-label="Refresh attendance"
          onClick={() => setAttempt((a) => a + 1)}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {error ? (
        <p className="parent-error" role="alert">
          Attendance is unavailable. Your financial account remains in
          Finances.{" "}
        </p>
      ) : !data ? (
        <p role="status">Loading teaching records…</p>
      ) : (
        <>
          {summary ? (
            <>
              <div className="parent-attendance-stats">
                <div>
                  <strong>{summary.attended}</strong>
                  <span>Attended</span>
                </div>
                <div>
                  <strong>{summary.absent}</strong>
                  <span>Absent</span>
                </div>
                <div>
                  <strong>{summary.excused}</strong>
                  <span>Excused</span>
                </div>
              </div>
              <p className="parent-muted">
                {summary.percentage === null
                  ? "No attendance percentage yet"
                  : `${summary.percentage}% attendance`}
                . Present and late count as attended; excused, cancelled and
                unconfirmed sessions are excluded from the rate.
              </p>
            </>
          ) : (
            <p className="parent-muted">
              No confirmed attendance yet. A scheduled session is not proof of
              attendance.
            </p>
          )}
          {upcoming.length > 0 && (
            <>
              <h3>Upcoming sessions</h3>
              <div className="parent-teaching-list">
                {upcoming.map((s, i) => (
                  <div className="parent-teaching-record" key={i}>
                    <strong>
                      {s.subject} · {s.topic_title}
                    </strong>
                    <small>
                      {teachingDate(s.starts_at)} · {s.mode} · {s.venue_name}
                    </small>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="parent-teaching-list">
            {records.map((s) => (
              <article className="parent-teaching-record" key={s.session_id}>
                <div>
                  <strong>
                    {s.subject} · {s.topic_title}
                  </strong>
                  <span
                    className={`parent-badge ${s.attendance === "absent" ? "overdue" : s.status === "cancelled" ? "pending" : "paid"}`}
                  >
                    {s.status === "cancelled" ? "Cancelled" : s.attendance}
                  </span>
                </div>
                <small>
                  {teachingDate(s.starts_at)} · {s.class_name}
                </small>
                <p>{s.learning_goal}</p>
                {s.outcome && <p>{s.outcome}</p>}
              </article>
            ))}
          </div>
          {data.limited && (
            <p className="parent-muted">
              Showing recent teaching history; attendance totals include all
              confirmed sessions.
            </p>
          )}
        </>
      )}
    </section>
  );
}
