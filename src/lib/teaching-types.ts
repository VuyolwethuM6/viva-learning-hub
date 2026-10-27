export type TeachingClass = {
  id: string;
  name: string;
  grade: string;
  subject: string;
  group_name: string;
  season: number;
  tutor_id: string;
  venue_id: string;
  weekdays: number[];
  starts_at: string;
  ends_at: string;
  archived: boolean;
  tutorName: string;
  venueName: string;
  mode: string;
};
export type TeachingSession = {
  series_id?: string | null;
  id: string;
  class_id: string;
  topic_id: string;
  topic_title: string;
  learning_goal: string;
  tutor_id: string;
  venue_name: string;
  venue_detail: string;
  mode: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "completed" | "cancelled";
  outcome: string | null;
  staff_note: string;
  cancel_reason: string | null;
  revision: number;
};
export type TeachingRoster = {
  session_id: string;
  application_id: string;
  learner_name: string;
  student_number: string;
  starting_mark: number | null;
  target_mark: number | null;
  included: boolean;
  attendance: string | null;
};
export type TeachingVersion = {
  id: string;
  material_id: string;
  version: number;
  file_name: string;
  mime: string;
  size_bytes: number;
  finalized_at: string | null;
};
export type TeachingMaterial = {
  id: string;
  title: string;
  grade: string;
  subject: string;
  kind: string;
  archived: boolean;
  owner_class_id?: string | null;
};
export type TeachingSnapshot = {
  today: string;
  now: string;
  audience: "admin" | "tutor";
  tutorName: string | null;
  slots: {
    id: string;
    class_id: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
    active: boolean;
  }[];
  programmes: { grade: string; weekdays: number[] }[];
  closures: { day: string; reason: string }[];
  tutors: {
    id: string;
    name: string;
    email: string;
    enabled: boolean;
    registered: boolean;
  }[];
  venues: {
    id: string;
    name: string;
    mode: string;
    detail: string;
    active: boolean;
    learner_visible?: boolean;
  }[];
  topics: {
    id: string;
    grade: string;
    subject: string;
    title: string;
    goal: string;
    active: boolean;
    learner_visible?: boolean;
  }[];
  learners: {
    id: string;
    name: string;
    studentNumber: string;
    learnerEmail: string;
    studentAccess: boolean;
    grade: string;
    subjects: string[];
  }[];
  classes: TeachingClass[];
  memberships: {
    id: string;
    class_id: string;
    application_id: string;
    joined_on: string;
    left_on: string | null;
    name: string;
    studentNumber: string;
    state: string;
    startingMark: number | null;
    targetMark: number | null;
  }[];
  sessions: TeachingSession[];
  roster: TeachingRoster[];
  materials: TeachingMaterial[];
  versions: TeachingVersion[];
  classMaterials: {
    class_id: string;
    version_id: string;
    active: boolean;
    learner_visible: boolean;
  }[];
  sessionMaterials: {
    session_id: string;
    version_id: string;
    active: boolean;
    learner_visible?: boolean;
  }[];
  history: {
    id: string;
    action: string;
    class_id: string | null;
    session_id: string | null;
    created_at: string;
    reason: string | null;
  }[];
  limited: boolean;
};
export type ParentTeaching = {
  records: {
    application_id: string;
    session_id: string;
    class_name: string;
    subject: string;
    topic_title: string;
    learning_goal: string;
    starts_at: string;
    ends_at: string;
    status: string;
    outcome: string | null;
    attendance: string | null;
    recorded_at: string | null;
  }[];
  upcoming: {
    application_id: string;
    class_name: string;
    subject: string;
    topic_title: string;
    starts_at: string;
    ends_at: string;
    mode: string;
    venue_name: string;
  }[];
  summary: {
    application_id: string;
    completed: number;
    attended: number;
    absent: number;
    excused: number;
    percentage: number | null;
  }[];
  limited: boolean;
};
export const TEACHING_SUBJECTS = [
  "Mathematics",
  "Natural Sciences",
  "Other academic support",
  "Mathematical Literacy",
  "Physical Sciences",
  "Life Sciences",
];
export const ATTENDANCE_OPTIONS = ["present", "late", "absent", "excused"];
export const TEACHING_TIMES = Array.from(
  { length: 65 },
  (_, i) =>
    `${String(6 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
);
