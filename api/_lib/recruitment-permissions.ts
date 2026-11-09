import type { RecruitmentRole } from "../../src/lib/recruitment-types.js";
// Coarse API defense; SQL also rechecks the current role and scope after locking.
export const canChangeRecruitment = (
  role: RecruitmentRole,
  operation: string,
) => role === "owner" || (role === "manager" && operation === "scope_grant");
