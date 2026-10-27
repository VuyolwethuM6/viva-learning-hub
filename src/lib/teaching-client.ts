import { tutorFetch } from "./tutor-client";
export async function teachingFetch(
  audience: "admin" | "tutor",
  query = "",
  data?: object,
) {
  if (audience === "tutor") return tutorFetch(query, data);
  const response = await fetch(
    "/api/admin/records?teaching=1" + (query ? "&" + query.slice(1) : ""),
    {
      method: data ? "POST" : "GET",
      credentials: "same-origin",
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if ([401, 403].includes(response.status))
      window.dispatchEvent(new Event("viva-admin-expired"));
    throw new Error(body.error || "Teaching records could not be loaded.");
  }
  return response;
}
export async function teachingRequest<T>(
  audience: "admin" | "tutor",
  operation?: string,
  data?: object,
): Promise<T> {
  if (
    operation === "attendance" &&
    data &&
    "rows" in data &&
    Array.isArray(data.rows)
  ) {
    data = {
      ...data,
      rows: data.rows.map((row: { applicationId: string; status: string }) => ({
        applicationId: row.applicationId,
        status: row.status,
      })),
    };
  }
  return (
    await teachingFetch(
      audience,
      "",
      operation ? { action: "teaching", operation, data } : undefined,
    )
  ).json();
}
export const teachingDate = (date: string) =>
  new Date(date).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function teachingEventLabel(
  action: string,
  details: Record<string, unknown> = {},
) {
  const before = details.before as Record<string, unknown> | null,
    after = details.after as Record<string, unknown> | null;
  if (action === "teaching_session_roster:update")
    return before?.attendance ? "Attendance corrected" : "Attendance recorded";
  if (action === "teaching_sessions:update" && after?.status !== before?.status)
    return after?.status === "completed"
      ? "Session completed"
      : after?.status === "cancelled"
        ? "Session cancelled"
        : "Session status changed";
  const labels: Record<string, string> = {
    "teaching_sessions:insert": "Session scheduled",
    "teaching_sessions:update": "Session details updated",
    "teaching_session_roster:insert": "Learner added to session",
    "teaching_session_materials:insert": "Resource version attached",
    "teaching_session_materials:update": "Resource attachment changed",
    session_create: "Scheduling confirmed",
    session_finish: "Teaching status confirmed",
    attendance: "Register saved",
  };
  return labels[action] || action.replaceAll("_", " ").replaceAll(":", " · ");
}
