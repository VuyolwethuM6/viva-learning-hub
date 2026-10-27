import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { WeeklyAttendance } from "@/components/WeeklyAttendance";
import { StudentWorkspace } from "@/components/StudentWorkspace";
import {
  attendanceDay,
  southAfricanDay,
  weekDays,
  type AttendanceSession,
} from "@/lib/portal-attendance";
import type { StudentSnapshot } from "@/lib/student-types";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const session = (
  id: string,
  subject: string,
  status: string,
  attendance: string | null,
): AttendanceSession => ({
  id,
  subject,
  title: `${subject} lesson`,
  startsAt: "2026-10-26T14:00:00Z",
  status,
  attendance,
});
describe("weekly attendance across subjects", () => {
  it("uses South African dates across UTC midnight and month boundaries", () => {
    expect(southAfricanDay("2026-10-25T22:30:00Z")).toBe("2026-10-26");
    expect(weekDays("2026-11-01")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(weekDays("2026-10-27", -1)[0]).toBe("2026-10-19");
  });
  it("counts sessions separately, treats late as attended and leaves unconfirmed attendance neutral", () => {
    expect(
      attendanceDay([
        session("a", "Maths", "completed", "late"),
        session("b", "Science", "completed", "absent"),
      ]),
    ).toMatchObject({
      attended: 1,
      absent: 1,
      label: "1 of 2 attended",
      tone: "missed",
    });
    expect(
      attendanceDay([session("a", "Maths", "completed", null)]),
    ).toMatchObject({ label: "Not recorded", tone: "neutral" });
    expect(
      attendanceDay([session("a", "Maths", "completed", "excused")]),
    ).toMatchObject({ label: "Excused", tone: "neutral" });
    expect(
      attendanceDay([session("a", "Maths", "cancelled", null)]),
    ).toMatchObject({ label: "Cancelled", absent: 0 });
    expect(attendanceDay([])).toMatchObject({ label: "No session", absent: 0 });
  });
  it("opens both sessions for a day and filters by subject without merging their attendance", () => {
    render(
      <WeeklyAttendance
        today="2026-10-27"
        sessions={[
          session("a", "Mathematics", "completed", "present"),
          session("b", "Physical Sciences", "completed", "absent"),
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Monday 26 Oct: 1 of 2 attended/ }),
    );
    expect(
      screen.getByText("Mathematics lesson", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Physical Sciences lesson", { exact: false }),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Attendance subject" }),
      { target: { value: "Mathematics" } },
    );
    expect(
      screen.getByRole("button", { name: /Monday 26 Oct: 1 of 1 attended/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Physical Sciences lesson", { exact: false }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Previous attendance week" }),
    );
    expect(screen.getAllByRole("button", { name: /No session/ })).toHaveLength(
      7,
    );
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(
      screen.getByRole("button", { name: "Next attendance week" }),
    ).toBeDisabled();
  });
  it("labels an unfinished past session as not recorded, not absent", () => {
    render(
      <WeeklyAttendance
        today="2026-10-27"
        sessions={[session("a", "Maths", "scheduled", null)]}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Monday 26 Oct: Not recorded/ }),
    ).toBeInTheDocument();
  });
});
const snapshot: StudentSnapshot = {
  today: "2026-10-27",
  now: "2026-10-27T10:00:00Z",
  assisted: false,
  limited: false,
  learner: {
    id: "learner",
    name: "Alex Learner",
    grade: "Grade 12",
    studentNumber: "ST-TEST",
  },
  subjects: [
    { name: "Mathematics", startingMark: 45, targetMark: 75 },
    { name: "Physical Sciences", startingMark: 50, targetMark: 80 },
  ],
  classes: [
    {
      id: "maths",
      name: "Maths A",
      subject: "Mathematics",
      tutorName: "Taylor",
      archived: false,
      mode: "Online",
    },
    {
      id: "science",
      name: "Science A",
      subject: "Physical Sciences",
      tutorName: "Sam",
      archived: false,
      mode: "Online",
    },
  ],
  slots: [],
  sessions: [
    {
      id: "math-session",
      class_id: "maths",
      topic_title: "Equations",
      learning_goal: "Solve equations",
      starts_at: "2026-10-28T14:00:00Z",
      ends_at: "2026-10-28T15:00:00Z",
      mode: "Online",
      venue_name: "Maths room",
      room: "https://example.test/maths",
      status: "scheduled",
      attendance: null,
      outcome: null,
    },
    {
      id: "science-session",
      class_id: "science",
      topic_title: "Forces",
      learning_goal: "Explain forces",
      starts_at: "2026-10-28T15:00:00Z",
      ends_at: "2026-10-28T16:00:00Z",
      mode: "Online",
      venue_name: "Science room",
      room: "https://example.test/science",
      status: "scheduled",
      attendance: null,
      outcome: null,
    },
  ],
  materials: [
    {
      id: "math-resource",
      title: "Algebra notes",
      subject: "Mathematics",
      kind: "Notes",
      version: 1,
      file_name: "algebra.pdf",
      mime: "application/pdf",
      size_bytes: 10,
    },
    {
      id: "science-resource",
      title: "Mechanics notes",
      subject: "Physical Sciences",
      kind: "Notes",
      version: 1,
      file_name: "mechanics.pdf",
      mime: "application/pdf",
      size_bytes: 10,
    },
  ],
  attendance: {
    completed: 0,
    attended: 0,
    absent: 0,
    excused: 0,
    percentage: null,
  },
};
describe("student classroom navigation", () => {
  it("keeps the two subjects’ sessions, resources and assigned work in their classroom", async () => {
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes("academic=1")
              ? {
                  now: snapshot.now,
                  audience: "student",
                  tasks: [],
                  attempts: [],
                  grades: [],
                  resources: [],
                  recipients: [],
                  uploads: [],
                  reports: [],
                  progress: [],
                  periods: [],
                }
              : snapshot,
          ),
          { status: 200 },
        ),
    );
    render(<StudentWorkspace section="Learning" />);
    fireEvent.click(await screen.findByRole("button", { name: /Maths A/ }));
    expect(
      screen.getByRole("heading", { name: "Equations" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Forces" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Join online session/ }),
    ).toHaveAttribute("href", "https://example.test/maths");
    fireEvent.click(
      within(screen.getByLabelText("Classroom views")).getByRole("button", {
        name: "Materials",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Algebra notes" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Mechanics notes" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    expect(
      await screen.findByText("No work shared for this classroom yet."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All classrooms" }));
    fireEvent.click(screen.getByRole("button", { name: /Science A/ }));
    expect(screen.getByRole("heading", { name: "Forces" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Equations" }),
    ).not.toBeInTheDocument();
    expect(
      fetch.mock.calls.every(
        ([, options]) => !options?.method || options.method === "GET",
      ),
    ).toBe(true);
  });
});
