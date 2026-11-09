import { z } from "zod";
import { HttpError } from "./http.js";
import type {
  RecruitmentOperation,
  RecruitmentChoices,
} from "../../src/lib/recruitment-types.js";
const base = { requestId: z.string().uuid() };
const revision = z.number().int().min(-1).max(2147483646);
const schemas = {
  staff_grant: z
    .object({
      ...base,
      userId: z.string().uuid(),
      role: z.enum(["owner", "manager", "officer"]),
      enabled: z.boolean(),
      expectedRevision: revision,
    })
    .strict(),
  scope_create: z
    .object({
      ...base,
      kind: z.enum(["vacancy", "talent_pool"]),
      label: z.string().trim().min(2).max(120),
    })
    .strict(),
  scope_grant: z
    .object({
      ...base,
      userId: z.string().uuid(),
      scopeId: z.string().uuid(),
      enabled: z.boolean(),
      expectedRevision: revision,
    })
    .strict(),
  settings: z
    .object({
      ...base,
      expectedRevision: z.number().int().min(0).max(2147483646),
      staffConsoleEnabled: z.boolean(),
      accessGuardsEnabled: z.boolean(),
      privacyPolicyVersion: z.string().trim().max(120),
    })
    .strict(),
};
export function recruitmentInput(
  operation: unknown,
  data: unknown,
): { operation: RecruitmentOperation; data: RecruitmentChoices } {
  if (typeof operation !== "string" || !Object.hasOwn(schemas, operation))
    throw new HttpError(
      400,
      "This recruitment operation has not been released.",
    );
  const parsed = schemas[operation as RecruitmentOperation].safeParse(data);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Choose valid recruitment details and refresh stale records.",
    );
  // The app's non-strict TS config makes Zod-required keys appear optional.
  // safeParse has already enforced every required key and the primitive value types.
  return {
    operation: operation as RecruitmentOperation,
    data: parsed.data as RecruitmentChoices,
  };
}
