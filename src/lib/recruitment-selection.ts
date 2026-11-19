import { z } from "zod";

export const selectionStages = ["screening", "shortlisted", "not_shortlisted", "information_requested", "interview", "evaluation", "recommended", "approved_for_offer", "unsuccessful"] as const;
const uuid = z.string().uuid();
const reason = z.string().trim().min(3).max(4000);
const base = { requestId: uuid, caseId: uuid, expectedRevision: z.number().int().nonnegative() };
export const selectionCommands = {
  screen: z.object({ ...base, checks: z.array(z.object({ key: z.string().trim().min(1).max(100), complete: z.boolean(), evidence: z.string().trim().max(1000) }).strict()).min(1).max(30), notes: reason }).strict(),
  shortlist: z.object({ ...base, outcome: z.enum(["shortlisted", "not_shortlisted", "information_requested", "screening"]), reason, applicantMessage: reason.optional() }).strict().refine(d => d.outcome !== "information_requested" || !!d.applicantMessage, "An applicant-facing information request is required"),
  interview_schedule: z.object({ ...base, interviewId: uuid.optional(), round: z.number().int().min(1).max(20), type: z.string().trim().min(2).max(100), startsAt: z.string().datetime({ offset: true }), durationMinutes: z.number().int().min(10).max(480), location: z.string().trim().min(3).max(1000), interviewerIds: z.array(uuid).min(1).max(10), reason }).strict(),
  interview_update: z.object({ ...base, interviewId: uuid, status: z.enum(["cancelled", "completed", "no_show"]), reason }).strict(),
  evaluate: z.object({ ...base, interviewId: uuid, templateName: z.string().trim().min(3).max(160), criteria: z.array(z.object({ key: z.string().trim().min(1).max(100), score: z.number().min(0).max(100), maximum: z.number().positive().max(100), weight: z.number().positive().max(100), feedback: reason }).strict().refine(c => c.score <= c.maximum, "Score exceeds maximum")).min(1).max(30), comments: reason, replacesId: uuid.optional(), correctionReason: reason.optional() }).strict().refine(d => !d.replacesId || !!d.correctionReason, "Corrections require a reason"),
  assessment_create: z.object({ ...base, supersedesId: uuid.optional(), title: z.string().trim().min(3).max(160), instructions: reason, dueAt: z.string().datetime({offset:true}), evaluatorIds: z.array(uuid).min(1).max(10), criteria: z.array(z.string().trim().min(1).max(200)).min(1).max(30), evidenceRequired: z.boolean() }).strict(),
  assessment_complete: z.object({ ...base, assessmentId: uuid, result: z.enum(["completed","not_completed"]), feedback: reason, evidenceRef: z.string().trim().min(3).max(1000).optional() }).strict(),
  recommend: z.object({ ...base, outcome: z.enum(["recommended", "not_recommended", "further_assessment"]), reason, evaluationIds: z.array(uuid).max(30) }).strict(),
  decide: z.object({ ...base, outcome: z.enum(["approved_for_offer", "unsuccessful", "further_assessment"]), reason, recommendationId: uuid }).strict(),
};
export type SelectionOperation = keyof typeof selectionCommands;
export type SelectionRecord = { case_id: string; revision: number; stage: string; decision: string | null };
export type SelectionInterview = { id: string; case_id: string; round: number; type: string; starts_at: string; ends_at: string; location: string; interviewer_ids: string[]; status: string; candidate_response: string | null };
export type SelectionEvaluation = { id: string; interview_id: string; evaluator_id: string; template_name: string; criteria: {key:string;score:number;maximum:number;weight:number;feedback:string}[]; comments: string; total_score: number; replaces_id: string | null; created_at: string };
export type SelectionWorkspace = {
  enabled: boolean;
  eligibleInterviewers?:{id:string;email:string;role:string}[];
  items?: { id:string; reference:string; vacancy_id:string; submitted_at:string; stage:string; revision:number; document_ready:boolean; name:string }[];
  hasMore?:boolean;
  selection?:SelectionRecord;
  assessments?:{id:string;supersedes_id?:string|null;title:string;instructions:string;due_at:string;evaluator_ids:string[];criteria:string[];evidence_required:boolean;state:string;results:{evaluator_id:string;result:string;feedback:string;evidence_ref:string|null}[]}[];
  screening?:{id:string;checks:{key:string;complete:boolean;evidence:string}[];notes:string;created_at:string}[];
  interviews?:SelectionInterview[];
  evaluations?:SelectionEvaluation[];
  recommendations?:{id:string;outcome:string;reason:string;evaluation_ids:string[];created_at:string}[];
  decisions?:{id:string;outcome:string;reason:string;created_at:string}[];
  history?:{id:string;action:string;actor_id:string;previous_stage:string;new_stage:string;created_at:string}[];
};

export const selectionAssessmentPresets = {
 tutor:["Subject knowledge","CAPS curriculum understanding","Demonstration lesson","Lesson planning","Teaching methodology","Communication","Classroom management"],
 administrator:["Computer literacy","Administrative accuracy","Communication","Organisation","Data management","Problem-solving","Confidentiality"],
 support_staff:["Role knowledge","Communication","Professional conduct"],
} as const;
