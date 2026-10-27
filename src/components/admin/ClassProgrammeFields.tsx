import { useState } from "react";
import { TEACHING_SUBJECTS, TEACHING_TIMES } from "@/lib/teaching-types";
export function ClassProgrammeFields({ grades }: { grades: string[] }) {
  const [grade, setGrade] = useState("Grade 12"),
    [subject, setSubject] = useState("Mathematics");
  const rewrite = grade === "Matric Rewrite";
  const times = TEACHING_TIMES.filter(
    (t) =>
      t >= (rewrite ? "09:00" : "16:00") && t <= (rewrite ? "12:00" : "19:00"),
  );
  const defaultDays = rewrite
    ? subject === "Mathematics" || subject === "Mathematical Literacy"
      ? [1, 3, 5]
      : [2, 4, 5]
    : [1, 2, 3, 4, 5];
  return (
    <>
      <label>
        Grade / programme
        <select
          name="grade"
          aria-label="Grade / programme"
          value={grade}
          onChange={(e) => {
            setGrade(e.target.value);
            if (
              e.target.value === "Matric Rewrite" &&
              ![
                "Mathematics",
                "Mathematical Literacy",
                "Physical Sciences",
                "Life Sciences",
              ].includes(subject)
            )
              setSubject("Mathematics");
          }}
        >
          {grades.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
      <label>
        Subject
        <select
          name="subject"
          aria-label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          {TEACHING_SUBJECTS.filter(
            (s) =>
              !rewrite ||
              [
                "Mathematics",
                "Mathematical Literacy",
                "Physical Sciences",
                "Life Sciences",
              ].includes(s),
          ).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <fieldset key={`${grade}/${subject}`}>
        <legend>Programme days</legend>
        <div className="teaching-checks">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
            (day, i) =>
              (rewrite ? i < 5 : grade === "Grade 12" || i < 6) && (
                <label key={day}>
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={i + 1}
                    defaultChecked={defaultDays.includes(i + 1)}
                  />
                  {day}
                </label>
              ),
          )}
        </div>
      </fieldset>
      <label key={`start/${grade}`}>
        Initial start time · South Africa
        <select
          name="startTime"
          aria-label="Start time · South Africa"
          defaultValue={rewrite ? "09:00" : "16:00"}
        >
          {times.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label key={`end/${grade}`}>
        Initial end time · South Africa
        <select
          name="endTime"
          aria-label="End time · South Africa"
          defaultValue={rewrite ? "10:00" : "17:00"}
        >
          {times.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <p>
        These initial times create a slot on each selected day. After saving,
        use Weekly timetable to configure different times for individual days.
        Sunday is Grade 12 online feedback.
      </p>
    </>
  );
}
