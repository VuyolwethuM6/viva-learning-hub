import { studentFetch } from "./student-client";
import { tutorFetch } from "./tutor-client";
import { parentFetch } from "./parent-client";
export type AcademicAudience = "admin" | "tutor" | "student" | "parent";
export async function academicFetch(
  audience: AcademicAudience,
  query = "",
  body?: object,
  application?: string,
) {
  const suffix =
    "?academic=1" +
    (application ? "&application=" + application : "") +
    (query ? "&" + query.replace(/^\?/, "") : "");
  if (audience === "student") return studentFetch(suffix, body);
  if (audience === "tutor") return tutorFetch(suffix, body);
  if (audience === "parent") return parentFetch(suffix, body);
  const response = await fetch("/api/admin/records" + suffix, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const b = await response.json().catch(() => ({}));
    if ([401, 403].includes(response.status))
      window.dispatchEvent(new Event("viva-admin-expired"));
    throw new Error(b.error || "Academic records could not be loaded.");
  }
  return response;
}
export async function academicWrite(
  audience: Exclude<AcademicAudience, "parent">,
  operation: string,
  data: Record<string, unknown>,
) {
  return (
    await academicFetch(audience, "", { action: "academic", operation, data })
  ).json() as Promise<{ result: Record<string, unknown>; url?: string }>;
}
export const localAcademicTime = (value: string) =>
  new Date(value)
    .toLocaleString("sv-SE", { timeZone: "Africa/Johannesburg" })
    .slice(0, 16)
    .replace(" ", "T");
export const methodLabel: Record<string, string> = {
  total_marks: "Total earned marks / total possible marks",
  equal_weight: "Equal weight per assessment",
  weighted: "Weighted assessment percentages",
};
