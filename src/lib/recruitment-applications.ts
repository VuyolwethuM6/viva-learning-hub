import { z } from "zod";
import {
  engagementTypes,
  vacancyCategories,
  vacancyContentSchema,
  type VacancyContent,
} from "./recruitment-vacancies";

/** Immutable reviewed M3.1 template, reused by the gated M3 intake runtime. */
export const intakeTemplateVersion = "m3.1-v1" as const;
export const documentPolicy = {
  mimeTypes: ["application/pdf"],
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 8,
  maxCaseBytes: 40 * 1024 * 1024,
  cleanRequired: true,
} as const;
export type IntakePurpose = "vacancy" | "talent_pool";
export type IntakeCategory = VacancyContent["category"];
export type IntakeField = {
  key: string;
  type: "text" | "boolean" | "multi_select";
  required: boolean;
  maxLength: number | null;
  options: string[];
};
export type IntakeDefinition = {
  templateVersion: typeof intakeTemplateVersion;
  purpose: IntakePurpose;
  category: IntakeCategory | null;
  fields: IntakeField[];
  questions: VacancyContent["questions"];
  requiredDocuments: VacancyContent["requiredDocuments"];
  documentPolicy: typeof documentPolicy;
};
const field = (
  key: string,
  type: IntakeField["type"] = "text",
  required = true,
  maxLength: number | null = 2000,
  options: string[] = [],
): IntakeField => ({ key, type, required, maxLength, options });

/** Only reviewed code templates and the exact approved vacancy content are used. */
export function createIntakeDefinition(
  purpose: IntakePurpose,
  category: IntakeCategory | null,
  content?: VacancyContent,
): IntakeDefinition {
  if (
    (purpose !== "vacancy" && purpose !== "talent_pool") ||
    (purpose === "vacancy" && (!content || content.category !== category)) ||
    (purpose === "talent_pool" && (category !== null || content !== undefined))
  )
    throw new Error("intake_purpose_mismatch");
  if (content) {
    vacancyContentSchema.parse(content);
    if (!content.department.trim() || !content.location.trim() || content.summary.trim().length < 20 ||
      !content.requiredExperience.trim() || !content.scheduleDetails.trim() ||
      !content.responsibilities.length || !content.minimumRequirements.length ||
      !content.opensAt || !content.closesAt ||
      (category === "tutor" && (!content.subjects.length || !content.grades.length)))
      throw new Error("incomplete_vacancy_requirements");
  }
  if (content && content.requiredDocuments.length > documentPolicy.maxFiles)
    throw new Error("incompatible_document_requirements");
  const fields: IntakeField[] = [
    field("firstName", "text", true, 100),
    field("lastName", "text", true, 100),
    field("phone", "text", false, 40),
    field("location", "text", true, 160),
    field("availability"),
    field("adultConfirmed", "boolean", true, null),
    field("privacyAcknowledged", "boolean", true, null),
  ];
  if (category === "tutor")
    fields.push(
      field("subjects", "multi_select", true, null, [...content!.subjects]),
      field("grades", "multi_select", true, null, [...content!.grades]),
      field("qualifications"),
      field("teachingExperience", "text", true, 4000),
    );
  if (category === "administrator")
    fields.push(
      field("administrativeExperience", "text", true, 4000),
      field("administrativeSkills"),
    );
  if (category === "support_staff")
    fields.push(
      field("supportExperience", "text", true, 4000),
      field("supportSkills"),
    );
  if (purpose === "talent_pool")
    fields.push(
      field("categoryInterests", "multi_select", true, null, [...vacancyCategories]),
      field("engagementInterests", "multi_select", true, null, [...engagementTypes]),
      field("experience", "text", true, 4000),
      field("skills"),
    );
  return {
    templateVersion: intakeTemplateVersion,
    purpose,
    category,
    fields,
    questions: content ? structuredClone(content.questions) : [],
    requiredDocuments: content ? structuredClone(content.requiredDocuments) : [],
    documentPolicy,
  };
}

/** Definitions are trusted only after immutable database approval, not from a browser. */
export function intakeAnswersSchema(definition: IntakeDefinition, complete = false) {
  const fields: Record<string, z.ZodTypeAny> = {};
  const questions: Record<string, z.ZodTypeAny> = {};
  for (const f of definition.fields) {
    let schema: z.ZodTypeAny;
    if (f.type === "boolean") schema = complete ? z.literal(true) : z.boolean();
    else if (f.type === "multi_select")
      schema = z.array(z.string().refine((x) => f.options.includes(x)))
        .max(f.options.length)
        .refine((x) => new Set(x).size === x.length)
        .refine((x) => !complete || !f.required || x.length > 0);
    else schema = z.string().max(f.maxLength!).transform((x) => x.trim())
      .refine((x) => !complete || !f.required || x.length > 0);
    fields[f.key] = complete && f.required ? schema : schema.optional();
  }
  for (const q of definition.questions) {
    let schema: z.ZodTypeAny = q.type === "text"
      ? z.string().max(4000).transform((x) => x.trim()).refine((x) => !complete || !q.required || x.length > 0)
      : q.type === "yes_no" ? z.boolean() : z.number().finite();
    if (!complete || !q.required) schema = schema.optional();
    questions[q.key] = schema;
  }
  return z.object({ fields: z.object(fields).strict(), questions: z.object(questions).strict() })
    .strict().superRefine((value, ctx) => {
      if (new TextEncoder().encode(JSON.stringify(value)).length > 65536)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "answers_too_large" });
    });
}

export const caseStates = [
  "draft", "submitted", "under_review", "recommendation_recorded",
  "withdrawn", "expired", "deletion_pending", "purged",
] as const;
export const caseActions = [
  "read", "document", "review", "assign", "revoke_assignment", "hold", "extend_retention", "resolve_conflict",
] as const;
export type CaseAction = (typeof caseActions)[number];

/** Stable error contract for later handlers; messages never contain supplied PII. */
export const intakeErrors = {
  invalid_request: 400,
  verification_required: 401,
  access_denied: 403,
  case_unavailable: 404,
  revision_conflict: 409,
  requirements_changed: 409,
  request_conflict: 409,
  incompatible_document_requirements: 409,
  answers_too_large: 413,
  rate_limited: 429,
  intake_disabled: 503,
  scanner_unavailable: 503,
} as const;
