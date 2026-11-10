import { z } from "zod";

export const vacancyCategories = [
  "tutor",
  "administrator",
  "support_staff",
] as const;
export const engagementTypes = [
  "employee",
  "independent_contractor",
  "volunteer",
] as const;
export const vacancyStatuses = [
  "draft",
  "submitted",
  "approved",
  "published",
  "paused",
  "closed",
  "archived",
] as const;
export type VacancyStatus = (typeof vacancyStatuses)[number];
export type VacancyContent = {
  title: string;
  category: (typeof vacancyCategories)[number];
  engagementType: (typeof engagementTypes)[number];
  department: string;
  location: string;
  workArrangement: "onsite" | "remote" | "hybrid";
  summary: string;
  responsibilities: string[];
  minimumRequirements: string[];
  preferredQualifications: string[];
  requiredExperience: string;
  skills: string[];
  subjects: string[];
  grades: string[];
  scheduleType: "full_time" | "part_time" | "flexible";
  scheduleDetails: string;
  positions: number;
  opensAt: string | null;
  closesAt: string | null;
  remuneration: string;
  requiredDocuments: { key: string; label: string; required: boolean }[];
  questions: {
    key: string;
    label: string;
    type: "text" | "yes_no" | "number";
    required: boolean;
  }[];
};
const lines = (max = 1000) =>
  z.array(z.string().trim().min(1).max(max)).max(50);
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/);
export const vacancyContentSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    category: z.enum(vacancyCategories),
    engagementType: z.enum(engagementTypes),
    department: z.string().trim().max(160),
    location: z.string().trim().max(160),
    workArrangement: z.enum(["onsite", "remote", "hybrid"]),
    summary: z.string().trim().max(4000),
    responsibilities: lines(),
    minimumRequirements: lines(),
    preferredQualifications: lines(),
    requiredExperience: z.string().trim().max(2000),
    skills: lines(),
    subjects: lines(80),
    grades: lines(80),
    scheduleType: z.enum(["full_time", "part_time", "flexible"]),
    scheduleDetails: z.string().trim().max(2000),
    positions: z.number().int().min(1).max(1000),
    opensAt: z.string().datetime({ offset: true }).nullable(),
    closesAt: z.string().datetime({ offset: true }).nullable(),
    remuneration: z.string().trim().max(1000),
    requiredDocuments: z
      .array(
        z
          .object({
            key,
            label: z.string().trim().min(1).max(160),
            required: z.boolean(),
          })
          .strict(),
      )
      .max(20),
    questions: z
      .array(
        z
          .object({
            key,
            label: z.string().trim().min(1).max(500),
            type: z.enum(["text", "yes_no", "number"]),
            required: z.boolean(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(c)).length > 15000)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Keep vacancy content below 15 KB.",
      });
    if (c.category !== "tutor" && (c.subjects.length || c.grades.length))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subjects"],
        message:
          "Subject specialization and grades apply only to tutor vacancies.",
      });
    if (
      c.opensAt &&
      c.closesAt &&
      Date.parse(c.closesAt) <= Date.parse(c.opensAt)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closesAt"],
        message: "Closing date must follow opening date.",
      });
    for (const field of ["requiredDocuments", "questions"] as const)
      if (new Set(c[field].map((x) => x.key)).size !== c[field].length)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "Use unique question and document keys.",
        });
  });
export function emptyVacancyContent(): VacancyContent {
  return {
    title: "",
    category: "tutor",
    engagementType: "independent_contractor",
    department: "",
    location: "",
    workArrangement: "onsite",
    summary: "",
    responsibilities: [],
    minimumRequirements: [],
    preferredQualifications: [],
    requiredExperience: "",
    skills: [],
    subjects: [],
    grades: [],
    scheduleType: "flexible",
    scheduleDetails: "",
    positions: 1,
    opensAt: null,
    closesAt: null,
    remuneration: "",
    requiredDocuments: [],
    questions: [],
  };
}
export function validateVacancyContent(
  content: VacancyContent,
  complete = false,
): string[] {
  const parsed = vacancyContentSchema.safeParse(content);
  if (!parsed.success)
    return parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  if (!complete) return [];
  const errors: string[] = [];
  for (const [field, label] of [
    ["department", "Department"],
    ["location", "Location"],
    ["requiredExperience", "Required experience"],
    ["scheduleDetails", "Working schedule"],
  ] as const)
    if (!content[field].trim())
      errors.push(`${label} is required before submission.`);
  if (content.summary.trim().length < 20)
    errors.push("Provide a summary of at least 20 characters.");
  if (!content.responsibilities.length || !content.minimumRequirements.length)
    errors.push("Provide responsibilities and minimum requirements.");
  if (
    content.category === "tutor" &&
    (!content.subjects.length || !content.grades.length)
  )
    errors.push("Tutor vacancies require subjects and applicable grades.");
  if (!content.opensAt || !content.closesAt)
    errors.push("Opening and closing dates are required before submission.");
  else if (Date.parse(content.closesAt) <= Date.now())
    errors.push("Closing date must be in the future.");
  return errors;
}
export type RecruitmentVacancy = {
  id: string;
  reference: string;
  slug: string;
  scopeId: string;
  revision: number;
  status: VacancyStatus;
  reviewState: "draft" | "submitted" | "approved" | "revision_requested";
  draftVersionId: string;
  approvedVersionId: string | null;
  publishedVersionId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};
export type VacancyVersion = {
  id: string;
  vacancyId: string;
  number: number;
  content: VacancyContent;
  createdBy: string;
  createdAt: string;
};
export type VacancyAssignment = {
  vacancyId: string;
  userId: string;
  enabled: boolean;
};
export type VacancyEvent = {
  id: string;
  actor_id: string;
  action: string;
  target_id: string | null;
  request_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};
export type VacancyWorkspace = {
  vacancies: RecruitmentVacancy[];
  versions: VacancyVersion[];
  events: VacancyEvent[];
  assignments: VacancyAssignment[];
  publicVacanciesEnabled: boolean;
  settingsRevision: number;
  total: number;
  nextOffset: number | null;
  historyBefore: number | null;
  versionsHasMore: boolean;
};
export type PublicVacancy = {
  id: string;
  reference: string;
  slug: string;
  content: VacancyContent;
  version: number;
  publishedAt: string;
  availability: "opening_soon" | "open" | "closed";
  acceptingApplications: false;
};
export type PublicVacancyResponse = {
  enabled: boolean;
  generation: number;
  vacancies: PublicVacancy[];
  total: number;
  nextOffset: number | null;
};
export const vacancyOperations = [
  "vacancy_create",
  "vacancy_save",
  "vacancy_submit",
  "vacancy_return",
  "vacancy_approve",
  "vacancy_publish",
  "vacancy_pause",
  "vacancy_close",
  "vacancy_archive",
  "vacancy_revise",
  "vacancy_assign",
  "vacancy_settings",
] as const;
export type VacancyOperation = (typeof vacancyOperations)[number];
