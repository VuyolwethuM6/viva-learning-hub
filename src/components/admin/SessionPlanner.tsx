import { useEffect, useState } from "react";
import { teachingFetch } from "@/lib/teaching-client";
import type { TeachingClass } from "@/lib/teaching-types";
type Preview = {
  slots: {
    id: string;
    starts_at: string;
    ends_at: string;
    issue: string | null;
  }[];
  dates: {
    day: string;
    startTime: string;
    endTime: string;
    issue: string | null;
  }[];
};
export function SessionPlanner({
  audience,
  classroom,
  today,
  exclude,
  allowSeries = false,
}: {
  audience: "admin" | "tutor";
  classroom: TeachingClass;
  today: string;
  exclude?: string;
  allowSeries?: boolean;
}) {
  const [day, setDay] = useState(today),
    [scope, setScope] = useState("once"),
    [slot, setSlot] = useState(""),
    [repeat, setRepeat] = useState(false),
    [until, setUntil] = useState(today),
    [result, setResult] = useState<Preview | null>(null),
    [checked, setChecked] = useState(""),
    [error, setError] = useState("");
  const key = `${day}/${slot}/${repeat ? until : ""}/${scope}`;
  useEffect(() => {
    let live = true;
    setResult(null);
    setChecked("");
    setError("");
    const q = new URLSearchParams({
      schedule: classroom.id,
      day,
      ...(slot ? { slot } : {}),
      ...(repeat ? { until } : {}),
      ...(exclude ? { exclude } : {}),
      ...(scope === "series" ? { series: "1" } : {}),
    });
    void teachingFetch(audience, "?" + q)
      .then((r) => r.json())
      .then((v: Preview) => {
        if (!live) return;
        setResult(v);
        setChecked(key);
        if (!slot && v.slots.some((s) => !s.issue))
          setSlot(v.slots.find((s) => !s.issue)!.id);
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error ? e.message : "Could not check availability.",
          );
      });
    return () => {
      live = false;
    };
  }, [audience, classroom.id, day, slot, repeat, until, exclude, key, scope]);
  const available =
    checked === key &&
    !!result?.dates.length &&
    result.dates.every((d) => !d.issue);
  return (
    <fieldset className="session-planner">
      <legend>Choose a day and its available time</legend>
      {allowSeries && (
        <label>
          Change which sessions?
          <select
            name="scope"
            aria-label="Change which sessions?"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setSlot("");
            }}
          >
            <option value="once">This session only</option>
            <option value="series">
              This and later sessions in this weekly series
            </option>
          </select>
        </label>
      )}
      <label>
        Session date · South Africa
        <input
          type="date"
          name="day"
          value={day}
          min={`${classroom.season}-02-01`}
          max={`${classroom.season}-11-30`}
          required
          onChange={(e) => {
            setDay(e.target.value);
            setSlot("");
          }}
        />
      </label>
      <label>
        Available time for this day
        <select
          name="slotId"
          aria-label="Available time for this day"
          required
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
        >
          <option value="">Choose a time</option>
          {result?.slots.map((s) => (
            <option key={s.id} value={s.id} disabled={!!s.issue}>
              {s.starts_at.slice(0, 5)}–{s.ends_at.slice(0, 5)}
              {s.issue ? ` · ${s.issue}` : ""}
            </option>
          ))}
        </select>
      </label>
      {result && !result.slots.length && (
        <p role="status">
          No saved slots for this day. Choose another day, or ask admin to
          configure the weekly timetable.
        </p>
      )}
      {!exclude && (
        <>
          <label>
            Repeat
            <select
              aria-label="Repeat session"
              value={repeat ? "weekly" : "once"}
              onChange={(e) => {
                setRepeat(e.target.value === "weekly");
                setUntil(day);
              }}
            >
              <option value="once">Once</option>
              <option value="weekly">
                Weekly on this day · up to 12 sessions
              </option>
            </select>
          </label>
          {repeat && (
            <label>
              Repeat until
              <input
                type="date"
                name="until"
                value={until}
                min={day}
                max={`${classroom.season}-11-30`}
                required
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
          )}
        </>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {result?.dates.map((d) => (
        <p key={d.day} className={d.issue ? "admin-error" : "admin-notice"}>
          {d.day} · {d.startTime.slice(0, 5)}–{d.endTime.slice(0, 5)} ·{" "}
          {d.issue || "Available"}
        </p>
      ))}
      {!result && !error && (
        <p role="status">Checking day-specific availability…</p>
      )}
      <input
        type="hidden"
        name="scheduleChecked"
        value={available ? "yes" : "no"}
      />
      <p>
        All listed dates must be available. Saving rechecks every date; no
        conflicting dates are silently skipped.
      </p>
    </fieldset>
  );
}
