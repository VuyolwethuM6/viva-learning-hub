export type RecruitmentRole = "owner" | "manager" | "officer";
export type RecruitmentUser = {
  id: string;
  email: string;
  role: RecruitmentRole;
  revision: number;
};
export type RecruitmentStaff = {
  user_id: string;
  email: string;
  role: RecruitmentRole;
  enabled: boolean;
  revision?: number;
};
export type RecruitmentScope = {
  id: string;
  kind: "vacancy" | "talent_pool";
  label: string;
};
export type RecruitmentGrant = {
  user_id: string;
  scope_id: string;
  enabled: boolean;
  revision: number;
};
export type RecruitmentSnapshot = {
  user: RecruitmentUser;
  settings: {
    revision: number;
    staff_console_enabled: boolean;
    access_guards_enabled: boolean;
    privacy_policy_version: string;
    draft_days: number;
    unsuccessful_months: number;
    talent_pool_months: number;
  };
  features: Record<string, boolean>;
  staff: RecruitmentStaff[];
  scopes: RecruitmentScope[];
  grants: RecruitmentGrant[];
  events: {
    id: string;
    actor_id: string;
    action: string;
    target_id: string | null;
    request_id: string | null;
    details: Record<string, unknown>;
    created_at: string;
  }[];
};
export type RecruitmentOperation =
  "staff_grant" | "scope_create" | "scope_grant" | "settings";
export type RecruitmentChoices = Record<string, string | boolean | number> & {
  requestId: string;
};
