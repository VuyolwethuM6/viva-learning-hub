import { z } from "zod";
const id = z.string().uuid();
const reference = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$/);
const text = z.string().trim().min(1).max(4000);
export const engagementTypes = ["employee", "independent_contractor", "volunteer"] as const;
export const offerTermsSchema = z.object({
  positionTitle: z.string().trim().min(2).max(180), engagementType: z.enum(engagementTypes),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), workArrangement: text,
  reportingArrangements: text, compensationTerms: text,
  sessionRateCents: z.number().int().min(0).max(100000000),
  expiresAt: z.string().datetime({ offset: true }), conditions: z.string().max(4000),
  agreementTemplateId: id,
}).strict();
const base = { requestId: id, caseId: id, expectedRevision: z.number().int().nonnegative() };
const offer = { ...base, offerId: id };
export const engagementCommands = {
  template_approve: z.object({ ...base, agreementType: z.enum(["employment", "independent_contractor", "volunteer", "confidentiality", "code_of_conduct", "role_policy"]), engagementType: z.enum(engagementTypes), title: z.string().trim().min(2).max(180), body: z.string().trim().min(20).max(24000), legalApprovalReference: reference }).strict(),
  offer_create: z.object({ ...base, terms: offerTermsSchema, engagementChangeApprovalReference: reference.optional() }).strict(),
  offer_approve: z.object(offer).strict(), offer_issue: z.object(offer).strict(),
  offer_withdraw: z.object({ ...offer, reason: text }).strict(),
  onboarding_start: z.object(offer).strict(),
  policy_require: z.object({ ...base, templateId: id }).strict(),
  task_require: z.object({ ...base, key: z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/), label: z.string().trim().min(2).max(180), kind: z.enum(["document", "declaration", "required_check"]), required: z.boolean(), dueAt: z.string().datetime({ offset: true }) }).strict(),
  task_assign: z.object({ ...base, taskId: id, userId: id, dueAt: z.string().datetime({ offset: true }) }).strict(),
  task_verify: z.object({ ...base, taskId: id, documentId: id.nullable(), evidenceReference: reference }).strict(),
  session_payment_prepare: z.object({ ...base, sessionIds: z.array(id).min(1).max(100), issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), approvalReference: reference }).strict(),
  activation_approve: z.object({ ...base, userId: id, tutorId: id.nullable(), displayName: z.string().trim().min(2).max(120), subjects: z.array(z.string().trim().min(1).max(100)).max(20), grades: z.array(z.string().trim().min(1).max(40)).max(10), permissions: z.array(z.enum(["administration"])).max(1), evidenceReference: reference, personnelRetentionReviewAt: z.string().datetime({ offset: true }) }).strict(),
  access_suspend: z.object({ ...base, reason: text }).strict(),
  access_resume: z.object({ ...base, reason: text }).strict(),
  offboard: z.object({ ...base, effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), replacementTutorId: id.nullable(), reconciliationReference: reference, reason: text }).strict(),
} as const;
export const applicantEngagementCommands = {
  offer_accept: z.object({ requestId: id, expectedRevision: z.number().int().nonnegative(), offerId: id, acknowledged: z.literal(true) }).strict(),
  offer_decline: z.object({ requestId: id, expectedRevision: z.number().int().nonnegative(), offerId: id }).strict(),
  agreement_accept: z.object({ requestId: id, expectedRevision: z.number().int().nonnegative(), templateId: id, acknowledged: z.literal(true) }).strict(),
  task_complete: z.object({ requestId: id, expectedRevision: z.number().int().nonnegative(), taskId: id, acknowledged: z.literal(true) }).strict(),
} as const;
export type EngagementOperation = keyof typeof engagementCommands;
export type ApplicantEngagementOperation = keyof typeof applicantEngagementCommands;
export type OfferTerms = z.infer<typeof offerTermsSchema>;
export type EngagementOffer = { id: string; version: number; terms: OfferTerms; status: "draft" | "approved" | "issued" | "accepted" | "declined" | "withdrawn" | "expired"; approved_by: string | null; issued_at: string | null; accepted_at: string | null };
export type EngagementTask = { id: string; key: string; label: string; kind: string; required: boolean; status: "pending" | "submitted" | "verified"; evidence_reference?: string | null; document_id?: string | null; template_id?: string | null; assigned_to?: string | null; due_at?: string | null };
export type EngagementTemplate = { id: string; agreement_type: string; engagement_type: string; title: string; body: string; legal_approval_reference?: string };
export type StaffEngagement = { case_id: string; status: "active" | "suspended" | "ended"; user_id: string; tutor_id: string | null; subjects: string[]; grades: string[]; permissions: string[]; activated_at: string; ended_at: string | null; ended_effective_on: string | null };
export type EngagementSnapshot = { caseId: string; caseReference?: string; vacancyReference?: string; candidateName?: string; revision: number; category: string; offers: EngagementOffer[]; templates: EngagementTemplate[]; tasks: EngagementTask[]; acceptedTemplateIds: string[]; activation: StaffEngagement | null; events: { action: string; created_at: string; actor_id: string }[] };
export function engagementInput(operation: unknown, data: unknown) {
  if (typeof operation !== "string" || !Object.hasOwn(engagementCommands, operation)) throw new Error("invalid_request");
  const result = engagementCommands[operation as EngagementOperation].safeParse(data);
  if (!result.success) throw new Error("invalid_request");
  return { operation: operation as EngagementOperation, data: result.data };
}
export function applicantEngagementInput(operation: unknown, data: unknown) {
  if (typeof operation !== "string" || !Object.hasOwn(applicantEngagementCommands, operation)) throw new Error("invalid_request");
  const result = applicantEngagementCommands[operation as ApplicantEngagementOperation].safeParse(data);
  if (!result.success) throw new Error("invalid_request");
  return { operation: operation as ApplicantEngagementOperation, data: result.data };
}
