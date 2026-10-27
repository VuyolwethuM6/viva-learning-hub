export type StudentSnapshot = {
  today: string;
  now: string;
  assisted: boolean;
  limited: boolean;
  learner: { id: string; name: string; grade: string; studentNumber: string };
  subjects: {
    name: string;
    startingMark: number | null;
    targetMark: number | null;
  }[];
  classes: {
    id: string;
    name: string;
    subject: string;
    tutorName: string;
    archived: boolean;
    mode: string;
  }[];
  slots: {
    id: string;
    class_id: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
  }[];
  sessions: {
    id: string;
    class_id: string;
    topic_title: string;
    learning_goal: string;
    starts_at: string;
    ends_at: string;
    mode: string;
    venue_name: string;
    room: string | null;
    status: string;
    attendance: string | null;
    outcome: string | null;
  }[];
  materials: {
    id: string;
    title: string;
    subject: string;
    kind: string;
    version: number;
    file_name: string;
    mime: string;
    size_bytes: number;
  }[];
  attendance: {
    completed: number;
    attended: number;
    absent: number;
    excused: number;
    percentage: number | null;
  };
};
