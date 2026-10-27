export type AttendanceSession = {
  id: string;
  subject: string;
  title: string;
  startsAt: string;
  status: string;
  attendance: string | null;
};

/** Calendar dates are always South African, regardless of the device timezone. */
export function southAfricanDay(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function addCalendarDays(day: string, amount: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function weekDays(today: string, offset = 0) {
  const weekday = new Date(today + "T12:00:00Z").getUTCDay() || 7;
  const monday = addCalendarDays(today, 1 - weekday + offset * 7);
  return Array.from({ length: 7 }, (_, i) => addCalendarDays(monday, i));
}
export function attendanceDay(items: AttendanceSession[]) {
  const confirmed = items.filter(
    (s) => s.status === "completed" && s.attendance,
  );
  const attended = confirmed.filter((s) =>
    ["present", "late"].includes(s.attendance!),
  ).length;
  const absent = confirmed.filter((s) => s.attendance === "absent").length;
  const scheduled = items.filter((s) => s.status === "scheduled").length;
  const allExcused =
    confirmed.length === items.filter((s) => s.status !== "cancelled").length &&
    confirmed.length > 0 &&
    confirmed.every((s) => s.attendance === "excused");
  const label = !items.length
    ? "No session"
    : allExcused
      ? "Excused"
      : confirmed.length
        ? `${attended} of ${items.filter((s) => s.status !== "cancelled").length} attended`
        : scheduled
          ? `${scheduled} scheduled`
          : items.every((s) => s.status === "cancelled")
            ? "Cancelled"
            : "Not recorded";
  return {
    attended,
    absent,
    label,
    tone: absent
      ? "missed"
      : attended
        ? "attended"
        : scheduled
          ? "scheduled"
          : "neutral",
  };
}
