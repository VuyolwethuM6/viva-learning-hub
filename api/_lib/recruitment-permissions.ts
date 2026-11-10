import type { RecruitmentRole } from "../../src/lib/recruitment-types.js";
// Coarse API defense; SQL also rechecks the current role and scope after locking.
export const canChangeRecruitment = (
  role: RecruitmentRole,
  operation: string,
) => {
  if (role === "owner") return true;
  if (operation === "scope_grant") return role === "manager";
  if (["vacancy_save", "vacancy_submit", "vacancy_revise"].includes(operation))
    return true;
  return (
    role === "manager" &&
    ["vacancy_create", "vacancy_assign"].includes(operation)
  );
};
