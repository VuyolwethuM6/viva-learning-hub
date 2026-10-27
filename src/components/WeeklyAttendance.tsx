import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  CalendarDays,
  Minus,
  RefreshCw,
} from "lucide-react";
import {
  attendanceDay,
  southAfricanDay,
  weekDays,
  type AttendanceSession,
} from "@/lib/portal-attendance";
import { teachingDate } from "@/lib/teaching-client";
import "./portal-design.css";

export function WeeklyAttendance({
  sessions,
  today,
  limited = false,
  onRefresh,
}: {
  sessions: AttendanceSession[];
  today: string;
  limited?: boolean;
  onRefresh?: () => void;
}) {
  const [offset, setOffset] = useState(0),
    [subject, setSubject] = useState(""),
    [selected, setSelected] = useState("");
  const days = weekDays(today, offset);
  const subjects = [...new Set(sessions.map((s) => s.subject))].sort();
  const filtered = sessions.filter((s) => !subject || s.subject === subject);
  const forDay = (day: string) =>
    filtered
      .filter((s) => southAfricanDay(s.startsAt) === day)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const range = (day: string) =>
    new Date(day + "T12:00:00Z").toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return (
    <section className="viva-attendance" aria-label="Weekly attendance">
      <div className="viva-section-heading">
        <div>
          <span className="viva-kicker">Attendance</span>
          <h2>Your week at a glance</h2>
        </div>
        {onRefresh ? (
          <button
            type="button"
            aria-label="Refresh attendance"
            onClick={onRefresh}
          >
            <RefreshCw size={18} />
          </button>
        ) : (
          <CalendarDays size={22} />
        )}
      </div>
      <div className="viva-week-controls">
        <button
          type="button"
          aria-label="Previous attendance week"
          onClick={() => {
            setOffset(offset - 1);
            setSelected("");
          }}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {range(days[0])} – {range(days[6])}
        </span>
        <button
          type="button"
          aria-label="Next attendance week"
          disabled={offset >= 0}
          onClick={() => {
            setOffset(offset + 1);
            setSelected("");
          }}
        >
          <ChevronRight size={18} />
        </button>
        {offset !== 0 && (
          <button
            type="button"
            onClick={() => {
              setOffset(0);
              setSelected("");
            }}
          >
            This week
          </button>
        )}
      </div>
      {subjects.length > 1 && (
        <label className="viva-subject-filter">
          <span>Subject</span>
          <select
            aria-label="Attendance subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="viva-week">
        {days.map((day, i) => {
          const items = forDay(day),
            state = attendanceDay(items);
          if (
            day < today &&
            items.length &&
            items.every((s) => s.status === "scheduled")
          ) {
            state.label = "Not recorded";
            state.tone = "neutral";
          }
          return (
            <button
              key={day}
              type="button"
              className={`viva-day ${state.tone} ${day === today ? "today" : ""}`}
              aria-pressed={selected === day}
              aria-label={`${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]} ${range(day)}: ${state.label}`}
              onClick={() => setSelected(selected === day ? "" : day)}
            >
              <span>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
              </span>
              <strong>
                {state.attended ? (
                  <Check size={18} />
                ) : state.absent ? (
                  "!"
                ) : items.length ? (
                  day.slice(8)
                ) : (
                  <Minus size={16} />
                )}
              </strong>
              <small aria-hidden="true">
                {state.attended || state.absent
                  ? `${state.attended}/${items.filter((s) => s.status !== "cancelled").length}`
                  : state.label === "Not recorded"
                    ? "?"
                    : state.label === "Excused"
                      ? "Exc."
                      : state.label === "Cancelled"
                        ? "Off"
                        : items.length
                          ? `${items.filter((s) => s.status === "scheduled").length} due`
                          : "—"}
              </small>
            </button>
          );
        })}
      </div>
      <p className="viva-caption">
        Attended / sessions. Tap a day for details.
      </p>
      {selected && (
        <div className="viva-day-details" aria-live="polite">
          <h3>{range(selected)}</h3>
          {forDay(selected).length ? (
            forDay(selected).map((s) => (
              <article key={s.id}>
                <div>
                  <strong>{s.subject}</strong>
                  <span>
                    {s.title} · {teachingDate(s.startsAt)}
                  </span>
                </div>
                <span
                  className={`viva-pill ${s.attendance === "absent" ? "warning" : ""}`}
                >
                  {s.status === "cancelled"
                    ? "Cancelled"
                    : s.status === "completed"
                      ? s.attendance || "Not recorded"
                      : "Scheduled"}
                </span>
              </article>
            ))
          ) : (
            <p>No sessions scheduled.</p>
          )}
        </div>
      )}
      {limited && (
        <p className="viva-caption">
          Recent records only. Older weeks may be incomplete.
        </p>
      )}
    </section>
  );
}
