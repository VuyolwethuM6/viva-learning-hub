import { useEffect, useState } from "react";
import { parentRequest } from "@/lib/parent-client";
import type { ParentTeaching as Data } from "@/lib/teaching-types";
import { teachingDate } from "@/lib/teaching-client";
import { WeeklyAttendance } from "./WeeklyAttendance";
import { southAfricanDay } from "@/lib/portal-attendance";
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
    upcoming = (
      data?.upcoming.filter((r) => r.application_id === applicationId) || []
    ).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    summary = data?.summary.find((r) => r.application_id === applicationId);
  const sessions = [
    ...records.map((r) => ({
      id: r.session_id,
      subject: r.subject,
      title: r.topic_title,
      startsAt: r.starts_at,
      status: r.status,
      attendance: r.attendance,
    })),
    ...upcoming.map((r, i) => ({
      id: `upcoming-${i}`,
      subject: r.subject,
      title: r.topic_title,
      startsAt: r.starts_at,
      status: "scheduled",
      attendance: null,
    })),
  ];
  return (
    <section className="parent-card parent-learning-block">
      {error ? (
        <p className="parent-error" role="alert">
          {error}
          <button onClick={() => setAttempt((a) => a + 1)}>Try again</button>
        </p>
      ) : !data ? (
        <p role="status">Loading teaching records…</p>
      ) : (
        <>
          <WeeklyAttendance
            sessions={sessions}
            today={southAfricanDay(new Date().toISOString())}
            limited={data.limited}
            onRefresh={() => setAttempt((a) => a + 1)}
          />
          {summary && (
            <div className="parent-attendance-stats">
              <div>
                <strong>
                  {summary.percentage === null ? "—" : `${summary.percentage}%`}
                </strong>
                <span>Overall attendance</span>
              </div>
              <div>
                <strong>{summary.attended}</strong>
                <span>Attended</span>
              </div>
              <div>
                <strong>{summary.absent}</strong>
                <span>Absent</span>
              </div>
            </div>
          )}
          <h3>Next session</h3>
          {upcoming[0] ? (
            <article className="parent-teaching-record">
              <strong>
                {upcoming[0].subject} · {upcoming[0].topic_title}
              </strong>
              <small>
                {teachingDate(upcoming[0].starts_at)} · {upcoming[0].mode} ·{" "}
                {upcoming[0].venue_name}
              </small>
            </article>
          ) : (
            <p className="parent-muted">No upcoming sessions scheduled.</p>
          )}
          <details className="parent-teaching-history">
            <summary>All sessions & attendance history</summary>
            <p className="viva-caption">
              Times are South African. Excused, cancelled and unconfirmed
              sessions are excluded from the overall rate.
            </p>
            <div className="parent-teaching-list">
              {upcoming.slice(1).map((s, i) => (
                <article className="parent-teaching-record" key={`next-${i}`}>
                  <strong>
                    {s.subject} · {s.topic_title}
                  </strong>
                  <small>{teachingDate(s.starts_at)} · Scheduled</small>
                </article>
              ))}
              {records.map((s) => (
                <article className="parent-teaching-record" key={s.session_id}>
                  <div>
                    <strong>
                      {s.subject} · {s.topic_title}
                    </strong>
                    <span
                      className={`parent-badge ${s.attendance === "absent" ? "overdue" : s.status === "cancelled" ? "pending" : "paid"}`}
                    >
                      {s.status === "cancelled"
                        ? "Cancelled"
                        : s.attendance || "Not recorded"}
                    </span>
                  </div>
                  <small>
                    {teachingDate(s.starts_at)} · {s.class_name}
                  </small>
                  <p>{s.learning_goal}</p>
                  {s.outcome && <p>{s.outcome}</p>}
                </article>
              ))}
              {!records.length && <p>No confirmed sessions yet.</p>}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
