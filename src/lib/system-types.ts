export type SystemTarget =
  | "Applications"
  | "Notifications"
  | "Finance"
  | "Classes"
  | "Materials"
  | "Assessments"
  | "Students"
  | "Tutors"
  | "Settings";
export type SystemCheck = {
  id: string;
  title: string;
  status: "ok" | "attention" | "unavailable" | "info";
  detail: string;
  target?: SystemTarget;
};
export type SystemConfiguration = {
  email: boolean;
  scheduler: boolean;
  bankConfirmed: boolean;
  environment: string;
  commit: string | null;
};
export type SystemJob = {
  id: string;
  source: "manual" | "scheduled";
  started_at: string;
  finished_at: string | null;
  state: "running" | "completed" | "failed";
  result: Record<string, unknown>;
};
export type BackupReview = {
  id: string;
  checked_on: string;
  method: "provider_review" | "export_review" | "restore_test";
  note: string;
  created_at: string;
};
export type EmailTest = {
  id: string;
  requested_at: string;
  finished_at: string | null;
  state: "pending" | "accepted" | "failed" | "uncertain";
};
export type SystemIssue = {
  id: string;
  kind: string;
  label: string;
  context: string;
  target: SystemTarget;
};
export type SystemSnapshot = {
  now: string;
  today: string;
  role: "owner" | "bookkeeper" | "viewer";
  revision: number;
  accounting: {
    books_start: string;
    closed_through: string | null;
    automation_enabled: boolean;
    auto_send: boolean;
    scheduler_valid: boolean;
  };
  programmes: { grade: string; label: string; weekdays: number[] }[];
  closures: { day: string; reason: string }[];
  admins: {
    id: string;
    email: string;
    enabled: boolean;
    role: "owner" | "bookkeeper" | "viewer";
  }[];
  candidates: { id: string; email: string }[];
  candidatesLimited: boolean;
  backups: BackupReview[];
  jobs: SystemJob[];
  scheduledJob: SystemJob | null;
  emailTests: EmailTest[];
  issues: SystemIssue[];
  health: {
    modules: Record<string, boolean>;
    integrity: Record<string, number>;
    queuedMessages: number;
    failedMessages: number;
    ambiguousMessages: number;
    enrollmentEmailErrors: number;
    missingReportRecords: number;
    missingStoredFiles: number;
    unfinishedUploads: number;
    unfinishedSessions: number;
    marksInReview: number;
    pendingApplications: number;
    access: {
      admins: number;
      parents: number;
      tutors: number;
      students: number;
    };
  };
};
export type SystemSettings = SystemSnapshot & {
  configuration: SystemConfiguration;
  bank: {
    bank: string;
    accountName: string;
    accountNumber: string;
    accountType: string;
    branchCode: string;
  };
};
export type SystemHealth = {
  role: SystemSnapshot["role"] | null;
  checkedAt: string;
  configuration: SystemConfiguration;
  checks: SystemCheck[];
  overviewAvailable: boolean;
  health: SystemSnapshot["health"] | null;
  issues: SystemIssue[];
  jobs: SystemJob[];
  emailTests: EmailTest[];
  backups: BackupReview[];
};
