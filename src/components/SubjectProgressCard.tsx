import { Target } from "lucide-react";
import type { AcademicProgress } from "@/lib/academic-types";
import { methodLabel } from "@/lib/academic-client";
export function SubjectProgressCard({
  progress: p,
  compact = false,
}: {
  progress: AcademicProgress;
  compact?: boolean;
}) {
  const percent = (n: number | null) => (n === null ? "Not set" : `${n}%`);
  return (
    <article className="learning-card viva-subject-progress">
      <div className="viva-section-heading">
        <div>
          <span className="viva-kicker">{p.className}</span>
          <h3>{p.subject}</h3>
        </div>
        <Target size={23} />
      </div>
      <span className="viva-caption">
        {p.startsOn} – {p.endsOn}
      </span>
      <div className="viva-score">
        <strong>{p.average === null ? "—" : `${p.average}%`}</strong>
        <span>
          {p.average === null
            ? "No published average yet"
            : "Published average"}
        </span>
      </div>
      {p.average !== null && (
        <div
          className="viva-target-bar"
          role="img"
          aria-label={`Published average ${p.average} percent. Target ${percent(p.targetMark)}`}
        >
          <span
            style={{ width: `${Math.min(100, Math.max(0, p.average))}%` }}
          />
          {p.targetMark !== null && (
            <i
              style={{ left: `${Math.min(99, Math.max(0, p.targetMark))}%` }}
            />
          )}
        </div>
      )}
      <div className="viva-target-line">
        <span>Starting {percent(p.startingMark)}</span>
        <strong>Target {percent(p.targetMark)}</strong>
      </div>
      {p.gapToTarget !== null && (
        <span className={`viva-pill ${p.gapToTarget > 0 ? "warning" : ""}`}>
          {p.gapToTarget > 0
            ? `${p.gapToTarget} points to target`
            : p.gapToTarget === 0
              ? "At target"
              : `${Math.abs(p.gapToTarget)} points above target`}
        </span>
      )}
      {!compact && (
        <details className="viva-result-details">
          <summary>Results & calculation details</summary>
          <p>
            {methodLabel[p.method]} · {p.assessmentCount} included ·{" "}
            {p.missingCount} awaiting a published result.
          </p>
          <p>Missing and unmarked work is excluded from the average.</p>
          {p.diagnostics.map((d, i) => (
            <p key={i}>
              Diagnostic: {d.title} · {d.percentage}% · Separate baseline
            </p>
          ))}
          {p.marks.map((m, i) => (
            <div key={i} className="academic-row">
              <div>
                <strong>{m.title}</strong>
                <p>
                  {m.score}/{m.maxMarks} · {m.percentage}% ·{" "}
                  {m.countsAverage ? "Included" : "Separate"} · Weight{" "}
                  {m.weight}
                </p>
                {m.feedback && <p>{m.feedback}</p>}
              </div>
            </div>
          ))}
        </details>
      )}
    </article>
  );
}
