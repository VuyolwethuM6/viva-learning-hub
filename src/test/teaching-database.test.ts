// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
let db: PGlite;
const admin = "11111111-1111-4111-8111-111111111111",
  teacher = "33333333-3333-4333-8333-333333333333",
  parent = "44444444-4444-4444-8444-444444444444",
  app = "22222222-2222-4222-8222-222222222222";
async function val<T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
): Promise<T> {
  return (await db.query<{ value: T }>(sql, args)).rows[0].value;
}
const op = (
  operation: string,
  data: Record<string, unknown> = {},
  audience = "admin",
  actor = admin,
) =>
  val("select public.teaching_mutate($1,$2,$3,$4) value", [
    actor,
    audience,
    operation,
    JSON.stringify({ requestId: randomUUID(), ...data }),
  ]);
let cid: string, tid: string, topicId: string;
async function session(day = "2026-10-26") {
  return String(
    (await op("session_create", { classId: cid, topicId, day })).sessionId,
  );
}
async function mark(
  sid: string,
  revision = 0,
  status = "present",
  reason = "",
) {
  return op(
    "attendance",
    {
      sessionId: sid,
      revision,
      reason,
      rows: [{ applicationId: app, status }],
    },
    "tutor",
    teacher,
  );
}
async function finish(sid: string, revision = 1) {
  return op(
    "session_finish",
    {
      sessionId: sid,
      revision,
      status: "completed",
      outcome: "Objective covered",
      staffNote: "Private tutor notes",
    },
    "tutor",
    teacher,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create schema storage;create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  await db.exec(
    readFileSync("supabase/schema.sql", "utf8").replace(
      'create extension if not exists "pgcrypto";',
      "",
    ),
  );
  for (const [id, email] of [
    [admin, "admin@example.test"],
    [teacher, "tutor@example.test"],
    [parent, "parent@example.test"],
  ])
    await db.query("insert into auth.users values($1,$2,'2026-10-01')", [
      id,
      email,
    ]);
  await db.query("insert into public.admin_users(user_id) values($1)", [admin]);
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "truncate public.teaching_requests,public.teaching_events,public.teaching_tutors,public.teaching_venues,public.teaching_topics,public.teaching_classes,public.applications,public.accounting_journals,public.accounting_requests,public.parent_accounts,storage.objects,public.tuition_closures cascade;create or replace function public.teaching_now() returns timestamptz language sql stable as $$select timestamptz '2026-10-27 12:00:00+02'$$;create or replace function public.academic_now() returns timestamptz language sql volatile as $$select public.teaching_now()$$;",
  );
  await db.query(
    "insert into public.applications(id,application_number,learner_name,learner_email,guardian_name,guardian_email,grade_level,tutoring_mode,selected_subjects,monthly_fee,status,enrollment_state,reviewed_at,reviewed_by) values($1,'VT-TEST','Alex Learner','learner@example.test','Parent','parent@example.test','Grade 12','Online',array['Mathematics'],500,'active','active',now(),$2)",
    [app, admin],
  );
  await db.query(
    "insert into public.learners(application_id,student_number,full_name,email) values($1,'ST-TEST','Alex Learner','learner@example.test')",
    [app],
  );
  await db.query(
    "insert into public.application_subjects(application_id,subject_name,current_mark,target_mark) values($1,'Mathematics',45,75)",
    [app],
  );
  tid = String(
    (
      await op("tutor_save", {
        name: "Test Tutor",
        email: "tutor@example.test",
      })
    ).id,
  );
  const venue = await op("venue_create", {
    name: "Online test room",
    mode: "Online",
    detail: "https://example.test/class",
  });
  topicId = String(
    (
      await op("topic_create", {
        grade: "Grade 12",
        subject: "Mathematics",
        title: "Linear equations",
        goal: "Solve and check linear equations",
      })
    ).id,
  );
  cid = String(
    (
      await op("class_create", {
        grade: "Grade 12",
        subject: "Mathematics",
        group: "A",
        season: 2026,
        tutorId: tid,
        venueId: venue.id,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        startTime: "16:00",
        endTime: "17:00",
      })
    ).id,
  );
  await op("membership", {
    classId: cid,
    day: "2026-10-26",
    change: "add",
    learners: [app],
  });
  await val("select public.tutor_bind($1) value", [teacher]);
});
describe("teaching foundation real PostgreSQL boundaries", () => {
  it("keeps the SQL Editor bundle identical to its canonical migration sources", () => {
    const files = readdirSync("supabase/migrations")
      .filter((n) => n.startsWith("2026102716"))
      .sort();
    expect(files).toHaveLength(5);
    const source = files
      .map((n) => readFileSync("supabase/migrations/" + n, "utf8"))
      .join("\n\n");
    expect(readFileSync("docs/teaching-setup.sql", "utf8")).toContain(source);
    expect(readFileSync("supabase/schema.sql", "utf8")).toContain(source);
  });
  it("publishes confirmed attendance only on session completion and excludes private notes from parents", async () => {
    await val(
      "select public.admin_parent_access($1,$2,true,'Guardian verified for teaching tests') value",
      [admin, app],
    );
    await val("select public.parent_bind($1) value", [parent]);
    const sid = await session();
    await mark(sid);
    const before = await val<{ records: unknown[] }>(
      "select public.teaching_parent_snapshot($1) value",
      [parent],
    );
    expect(before.records).toHaveLength(0);
    await finish(sid);
    const data = await val<{
      records: Record<string, unknown>[];
      summary: { percentage: number }[];
    }>("select public.teaching_parent_snapshot($1) value", [parent]);
    expect(data.records[0].attendance).toBe("present");
    expect(data.summary[0].percentage).toBe(100);
    expect(JSON.stringify(data)).not.toContain("Private tutor notes");
  });
  it("preserves enrollment targets and resource snapshots on historical session records", async () => {
    const sid = await session();
    await db.query(
      "update public.application_subjects set target_mark=90 where application_id=$1",
      [app],
    );
    expect(
      await val<number>(
        "select target_mark::float value from public.teaching_session_roster where session_id=$1",
        [sid],
      ),
    ).toBe(75);
    expect(
      await val<number>(
        "select starting_mark::float value from public.teaching_session_roster where session_id=$1",
        [sid],
      ),
    ).toBe(45);
  });
  it("rejects future attendance, unfinished registers, stale revisions and missing correction reasons", async () => {
    const sid = await session("2026-10-27");
    await expect(mark(sid)).rejects.toThrow("after");
    const past = await session();
    await expect(finish(past, 0)).rejects.toThrow("every");
    await mark(past);
    await expect(mark(past)).rejects.toThrow("changed");
    await finish(past);
    await expect(mark(past, 2, "late")).rejects.toThrow("reason");
    await mark(past, 2, "late", "Verified arrival time");
    expect(
      await val<number>(
        "select count(*)::integer value from public.teaching_events where action='teaching_session_roster:update'",
      ),
    ).toBe(2);
  });
  it("checks seasons, closures and tutor/class scheduling conflicts", async () => {
    await expect(session("2026-12-01")).rejects.toThrow("teaching season");
    await db.exec(
      "insert into public.tuition_closures values('2026-10-26','Test closure')",
    );
    await expect(session()).rejects.toThrow("closure");
    await db.exec("truncate public.tuition_closures");
    await session();
    await expect(session()).rejects.toThrow("overlaps");
  });
  it("never treats cancellations as attendance and keeps cancellation history", async () => {
    const sid = await session();
    await op("session_finish", {
      sessionId: sid,
      revision: 0,
      status: "cancelled",
      reason: "Tutor unavailable",
    });
    await expect(mark(sid, 1)).rejects.toThrow("non-cancelled");
    expect(
      await val<string>(
        "select status value from public.teaching_sessions where id=$1",
        [sid],
      ),
    ).toBe("cancelled");
    await expect(
      db.query("delete from public.teaching_sessions where id=$1", [sid]),
    ).rejects.toThrow();
  });
  it("enforces assigned tutor access and blocks finance or unrelated learner disclosure", async () => {
    const snap = await val<{
      classes: unknown[];
      learners: unknown[];
      tutors: unknown[];
    }>("select public.teaching_snapshot($1,'tutor') value", [teacher]);
    expect(snap.classes).toHaveLength(1);
    expect(snap.learners).toHaveLength(0);
    expect(snap.tutors).toHaveLength(0);
    expect(JSON.stringify(snap)).not.toMatch(
      /guardian_email|monthly_fee|bank|report_card_path/,
    );
    await expect(
      op("topic_create", { grade: "Grade 12" }, "tutor", teacher),
    ).rejects.toThrow("administrators");
    await op("tutor_save", {
      id: tid,
      enabled: false,
      reason: "Access removed for test",
    });
    await expect(
      val("select public.teaching_snapshot($1,'tutor') value", [teacher]),
    ).rejects.toThrow("Tutor access");
  });
  it("uses stable request IDs to prevent duplicate sessions and rejects changed retries", async () => {
    const data = {
      requestId: randomUUID(),
      classId: cid,
      topicId,
      day: "2026-10-26",
    };
    const first = await op("session_create", data);
    expect(await op("session_create", data)).toEqual(first);
    await expect(
      op("session_create", { ...data, day: "2026-10-27" }),
    ).rejects.toThrow("already used");
  });
  it("validates private uploaded file metadata, versions and tutor access", async () => {
    const id = randomUUID();
    const upload = await op("material_prepare", {
      id,
      title: "Equation worksheet",
      grade: "Grade 12",
      subject: "Mathematics",
      kind: "Worksheet",
      name: "worksheet.pdf",
      mime: "application/pdf",
      size: 100,
    });
    await expect(op("material_finalize", { versionId: id })).rejects.toThrow(
      "verified",
    );
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('teaching-materials',$1,$2)",
      [
        upload.storage_path,
        JSON.stringify({ size: 100, mimetype: "application/pdf" }),
      ],
    );
    await op("material_finalize", { versionId: id });
    await expect(
      val("select public.teaching_file($1,'tutor',$2) value", [teacher, id]),
    ).rejects.toThrow("not assigned");
    await op("class_material", { classId: cid, versionId: id });
    expect(
      (
        await val("select public.teaching_file($1,'tutor',$2) value", [
          teacher,
          id,
        ])
      ).size_bytes,
    ).toBe(100);
    const sid = await session();
    expect(
      await val<number>(
        "select count(*)::integer value from public.teaching_session_materials where session_id=$1",
        [sid],
      ),
    ).toBe(1);
    await op("class_material", { classId: cid, versionId: id, active: false });
    expect(
      (
        await val("select public.teaching_file($1,'tutor',$2) value", [
          teacher,
          id,
        ])
      ).size_bytes,
    ).toBe(100);
  });
  it("requires active grade/subject membership and preserves a removed learner historical attendance", async () => {
    const sid = await session();
    await mark(sid);
    await finish(sid);
    const future = await session("2026-10-28");
    await op("membership", {
      classId: cid,
      day: "2026-10-27",
      change: "remove",
      applicationId: app,
      reason: "Learner changing class",
    });
    expect(
      await val<number>(
        "select count(*)::integer value from public.teaching_session_roster where session_id=$1 and included",
        [sid],
      ),
    ).toBe(1);
    await op("membership", {
      classId: cid,
      day: "2026-10-28",
      change: "add",
      learners: [app],
    });
    expect(
      await val<number>(
        "select count(*)::integer value from public.teaching_memberships where class_id=$1",
        [cid],
      ),
    ).toBe(2);
    expect(
      await val<boolean>(
        "select included value from public.teaching_session_roster where session_id=$1",
        [future],
      ),
    ).toBe(true);
    expect(
      await val<number>(
        "select count(*)::integer value from public.teaching_session_roster where session_id=$1 and included",
        [sid],
      ),
    ).toBe(1);
  });
  it("preserves posted teaching history and private settings when the complete upgrade is rerun", async () => {
    const sid = await session();
    await mark(sid);
    await finish(sid);
    const count = await val<number>(
      "select count(*)::integer value from public.teaching_events",
    );
    await db.exec(readFileSync("docs/teaching-setup.sql", "utf8"));
    expect(
      await val<number>(
        "select count(*)::integer value from public.teaching_events",
      ),
    ).toBe(count);
    expect(
      await val<string>(
        "select status value from public.teaching_sessions where id=$1",
        [sid],
      ),
    ).toBe("completed");
    expect(
      await val<boolean>(
        "select public value from storage.buckets where id='teaching-materials'",
      ),
    ).toBe(false);
    expect(
      await val<number>(
        "select count(*)::integer value from public.accounting_journals",
      ),
    ).toBe(0);
  });
  it("blocks learner clashes when adding membership to a pre-scheduled class and retains archived sessions", async () => {
    const other = await op("tutor_save", {
      name: "Other Tutor",
      email: "other-tutor@example.test",
    });
    const room = await op("venue_create", {
      name: "Other room",
      mode: "Online",
      detail: "https://example.test/other-room",
    });
    const otherClass = await op("class_create", {
      grade: "Grade 12",
      subject: "Mathematics",
      group: "B",
      season: 2026,
      tutorId: other.id,
      venueId: room.id,
      weekdays: [1, 2, 3, 4, 5],
      startTime: "16:00",
      endTime: "17:00",
    });
    await session("2026-10-28");
    await op("session_create", {
      classId: otherClass.id,
      topicId,
      day: "2026-10-28",
    });
    await expect(
      op("membership", {
        classId: otherClass.id,
        day: "2026-10-26",
        change: "add",
        learners: [app],
      }),
    ).rejects.toThrow("overlapping");
    await expect(
      op("class_update", {
        classId: cid,
        tutorId: other.id,
        reason: "New teaching assignment",
      }),
    ).rejects.toThrow("conflicting");
    await op("class_update", {
      classId: cid,
      archived: true,
      reason: "Class programme finished",
    });
    expect(
      await val<number>(
        "select count(*)::integer value from public.teaching_sessions where class_id=$1 and status='cancelled'",
        [cid],
      ),
    ).toBe(1);
    await expect(
      val("select public.teaching_snapshot($1,'tutor') value", [teacher]),
    ).resolves.toHaveProperty("classes", []);
  });
  it("keeps request/audit records immutable and browser roles away from private tables and RPCs", async () => {
    await expect(
      db.exec("update public.teaching_events set action='changed'"),
    ).rejects.toThrow("immutable");
    await db.exec("set role authenticated");
    try {
      await expect(
        db.exec("select * from public.teaching_session_roster"),
      ).rejects.toThrow("permission denied");
      await expect(
        val(
          "select public.teaching_mutate($1,'admin','tutor_save','{}') value",
          [teacher],
        ),
      ).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("connected student portals and day-specific scheduling", () => {
  const student = "55555555-5555-4555-8555-555555555555";
  async function bindStudent() {
    await db.query(
      "insert into auth.users values($1,'learner@example.test','2026-10-01') on conflict(id) do nothing",
      [student],
    );
    await op("student_access", {
      applicationId: app,
      enabled: true,
      reason: "Learner email verified",
    });
    await val("select public.student_bind($1) value", [student]);
  }
  async function studentSnapshot() {
    return val<{
      learner: { id: string };
      sessions: { id: string; attendance: string | null }[];
      materials: { id: string }[];
      attendance: { percentage: number | null };
    }>("select public.student_snapshot($1,'student') value", [student]);
  }
  it("allows an authorized tutor to plan within their class, but not manage student grants or other classes", async () => {
    const topic = await op(
      "topic_create",
      {
        classId: cid,
        grade: "Grade 12",
        subject: "Mathematics",
        title: "Tutor topic",
        goal: "Solve equations independently",
      },
      "tutor",
      teacher,
    );
    const result = await op(
      "session_create",
      { classId: cid, topicId: topic.id, day: "2026-10-26" },
      "tutor",
      teacher,
    );
    expect(result.sessionId).toBeTruthy();
    await expect(
      op(
        "student_access",
        { applicationId: app, enabled: true, reason: "Not authorized" },
        "tutor",
        teacher,
      ),
    ).rejects.toThrow("administrators");
    await expect(
      op(
        "topic_create",
        {
          classId: cid,
          grade: "Grade 11",
          subject: "Mathematics",
          title: "Wrong grade",
          goal: "Not in this class",
        },
        "tutor",
        teacher,
      ),
    ).rejects.toThrow("class grade");
  });
  it("offers different Monday and Tuesday times and rejects selecting a Monday slot on Tuesday", async () => {
    const snap = await val<{ slots: { id: string; weekday: number }[] }>(
      "select public.teaching_snapshot($1,'admin') value",
      [admin],
    );
    const monday = snap.slots.find((s) => s.weekday === 1)!,
      tuesday = snap.slots.find((s) => s.weekday === 2)!;
    await op("slot_save", {
      classId: cid,
      id: tuesday.id,
      reason: "Teaching timetable updated",
    });
    await op("slot_save", {
      classId: cid,
      weekday: 2,
      startTime: "17:00",
      endTime: "18:00",
      reason: "Teaching timetable updated",
    });
    const preview = await val<{ slots: { starts_at: string }[] }>(
      "select public.teaching_schedule($1,'tutor',$2,'2026-10-27') value",
      [teacher, cid],
    );
    expect(preview.slots.map((s) => s.starts_at)).toEqual(["17:00:00"]);
    await expect(
      op("session_create", {
        classId: cid,
        topicId,
        day: "2026-10-27",
        slotId: monday.id,
      }),
    ).rejects.toThrow("saved time slot");
  });
  it("creates a weekly series exactly once and rolls back the entire series on a conflict", async () => {
    const requestId = randomUUID();
    const args = {
      requestId,
      classId: cid,
      topicId,
      day: "2026-10-26",
      until: "2026-11-09",
    };
    const result = await op("session_create", args);
    expect((result.sessions as unknown[]).length).toBe(3);
    expect(await op("session_create", args)).toEqual(result);
    await expect(
      op("session_create", {
        classId: cid,
        topicId,
        day: "2026-11-02",
        until: "2026-11-16",
      }),
    ).rejects.toThrow("overlaps");
    expect(
      await val<number>(
        "select count(*)::integer value from public.teaching_sessions",
      ),
    ).toBe(3);
    await expect(
      op("session_create", {
        classId: cid,
        topicId,
        day: "2026-10-26",
        until: "2027-03-01",
      }),
    ).rejects.toThrow("twelve");
  });
  it("reschedules only a future unchanged session and keeps the original cancelled with its audit trail", async () => {
    const sid = await session("2026-10-28");
    const snap = await val<{ slots: { id: string; weekday: number }[] }>(
      "select public.teaching_snapshot($1,'admin') value",
      [admin],
    );
    const result = await op(
      "session_reschedule",
      {
        classId: cid,
        sessionId: sid,
        revision: 0,
        day: "2026-10-29",
        slotId: snap.slots.find((s) => s.weekday === 4)!.id,
        reason: "Class rescheduled",
      },
      "tutor",
      teacher,
    );
    expect(result.replaces).toBe(sid);
    expect(result.sessionId).not.toBe(sid);
    expect(
      await val<string>(
        "select status value from public.teaching_sessions where id=$1",
        [sid],
      ),
    ).toBe("cancelled");
    const past = await session();
    await expect(
      op("session_reschedule", {
        classId: cid,
        sessionId: past,
        revision: 0,
        day: "2026-10-29",
        slotId: snap.slots.find((s) => s.weekday === 4)!.id,
        reason: "Class rescheduled",
      }),
    ).rejects.toThrow("future");
  });
  it("previews and atomically shifts remaining future weekly sessions while retaining originals", async () => {
    const made = await op("session_create", {
      classId: cid,
      topicId,
      day: "2026-11-02",
      until: "2026-11-16",
    });
    const first = String(made.sessionId);
    const snap = await val<{ slots: { id: string; weekday: number }[] }>(
      "select public.teaching_snapshot($1,'admin') value",
      [admin],
    );
    const slot = snap.slots.find((s) => s.weekday === 3)!.id;
    const preview = await val<{
      dates: { day: string; issue: string | null }[];
    }>(
      "select public.teaching_series_preview($1,'tutor',$2,'2026-11-04',$3) value",
      [teacher, first, slot],
    );
    expect(preview.dates.map((d) => d.day)).toEqual([
      "2026-11-04",
      "2026-11-11",
      "2026-11-18",
    ]);
    expect(preview.dates.every((d) => d.issue === null)).toBe(true);
    const requestId = randomUUID(),
      args = {
        requestId,
        classId: cid,
        sessionId: first,
        scope: "series",
        revision: 0,
        day: "2026-11-04",
        slotId: slot,
        reason: "Class rescheduled",
      };
    const result = await op("session_reschedule", args, "tutor", teacher);
    expect((result.sessions as unknown[]).length).toBe(3);
    expect(await op("session_reschedule", args, "tutor", teacher)).toEqual(
      result,
    );
    expect(
      await val<number>(
        "select count(*)::integer value from public.teaching_sessions where status='cancelled'",
      ),
    ).toBe(3);
    expect(
      await val<number>(
        "select count(distinct series_id)::integer value from public.teaching_sessions where status='scheduled'",
      ),
    ).toBe(1);
  });
  it("shows only the student's own sanitized records and publishes attendance after completion", async () => {
    await bindStudent();
    const sid = await session();
    await mark(sid);
    let snap = await studentSnapshot();
    expect(snap.learner.id).toBe(app);
    expect(snap.sessions[0].attendance).toBeNull();
    await finish(sid);
    snap = await studentSnapshot();
    expect(snap.sessions[0].attendance).toBe("present");
    expect(snap.attendance.percentage).toBe(100);
    expect(JSON.stringify(snap)).not.toMatch(
      /staff_note|guardian_email|monthly_fee|storage_path|Private tutor notes/,
    );
    await expect(
      val("select public.student_snapshot($1,'student',$2) value", [
        student,
        randomUUID(),
      ]),
    ).rejects.toThrow("not available");
    await op("student_access", {
      applicationId: app,
      enabled: false,
      reason: "Access removed after review",
    });
    await expect(studentSnapshot()).rejects.toThrow("Student access");
  });
  it("keeps tutor uploads private until an explicit release and revokes learner file access when unshared", async () => {
    await bindStudent();
    const id = randomUUID();
    const up = await op(
      "material_prepare",
      {
        id,
        classId: cid,
        title: "Private memo",
        kind: "Memorandum",
        name: "memo.pdf",
        mime: "application/pdf",
        size: 5,
      },
      "tutor",
      teacher,
    );
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('teaching-materials',$1,$2)",
      [
        up.storage_path,
        JSON.stringify({ size: 5, mimetype: "application/pdf" }),
      ],
    );
    await op(
      "material_finalize",
      { classId: cid, versionId: id },
      "tutor",
      teacher,
    );
    await op(
      "class_material",
      { classId: cid, versionId: id },
      "tutor",
      teacher,
    );
    expect((await studentSnapshot()).materials).toHaveLength(0);
    await expect(
      val("select public.student_file($1,'student',$2) value", [student, id]),
    ).rejects.toThrow("not released");
    await op(
      "material_release",
      { classId: cid, versionId: id, visible: true },
      "tutor",
      teacher,
    );
    expect((await studentSnapshot()).materials[0].id).toBe(id);
    expect(
      (
        await val("select public.student_file($1,'student',$2) value", [
          student,
          id,
        ])
      ).size_bytes,
    ).toBe(5);
    await op(
      "material_release",
      { classId: cid, versionId: id, visible: false },
      "tutor",
      teacher,
    );
    await expect(
      val("select public.student_file($1,'student',$2) value", [student, id]),
    ).rejects.toThrow("not released");
  });
  it("authorizes family-assisted reads through parent scope without granting a student identity", async () => {
    await val(
      "select public.admin_parent_access($1,$2,true,'Guardian verified for assisted learning') value",
      [admin, app],
    );
    await val("select public.parent_bind($1) value", [parent]);
    expect(
      (
        await val("select public.student_snapshot($1,'parent',$2) value", [
          parent,
          app,
        ])
      ).assisted,
    ).toBe(true);
    await expect(
      val("select public.student_snapshot($1,'parent',$2) value", [
        parent,
        randomUUID(),
      ]),
    ).rejects.toThrow("family");
    await db.query(
      "update public.applications set learner_email=guardian_email where id=$1",
      [app],
    );
    await expect(
      op("student_access", {
        applicationId: app,
        enabled: true,
        reason: "Shared email reviewed",
      }),
    ).rejects.toThrow("parent-assisted");
  });
  it("blocks browser roles from new tables and helpers and preserves retired slots on rerun", async () => {
    const snap = await val<{ slots: { id: string }[] }>(
      "select public.teaching_snapshot($1,'admin') value",
      [admin],
    );
    await op("slot_save", {
      classId: cid,
      id: snap.slots[0].id,
      reason: "Old slot retired",
    });
    await db.exec(readFileSync("docs/teaching-setup.sql", "utf8"));
    expect(
      await val<boolean>(
        "select active value from public.teaching_slots where id=$1",
        [snap.slots[0].id],
      ),
    ).toBe(false);
    for (const role of ["anon", "authenticated"]) {
      expect(
        await val<boolean>(
          "select has_table_privilege($1,'public.student_accounts','SELECT') value",
          [role],
        ),
      ).toBe(false);
      expect(
        await val<boolean>(
          "select has_function_privilege($1,'public.student_snapshot(uuid,text,uuid)','EXECUTE') value",
          [role],
        ),
      ).toBe(false);
    }
  });
});

describe("academic assignments, submissions, review, exams and progress", () => {
  const student = "55555555-5555-4555-8555-555555555555";
  const academic = (
    operation: string,
    data: Record<string, unknown> = {},
    audience = "tutor",
    actor = teacher,
  ) =>
    val("select public.academic_mutate($1,$2,$3,$4) value", [
      actor,
      audience,
      operation,
      JSON.stringify({ requestId: randomUUID(), ...data }),
    ]);
  async function setup(extra: Record<string, unknown> = {}) {
    await db.query(
      "insert into auth.users values($1,'learner@example.test','2026-10-01') on conflict(id) do nothing",
      [student],
    );
    await op("student_access", {
      applicationId: app,
      enabled: true,
      reason: "Learner email verified",
    });
    await val("select public.student_bind($1) value", [student]);
    const period = await academic(
      "period_create",
      {
        classId: cid,
        startsOn: "2026-10-01",
        endsOn: "2026-11-30",
        method: String(extra.periodMethod || "total_marks"),
      },
      "admin",
      admin,
    );
    const task = await academic("task_create", {
      classId: cid,
      periodId: period.id,
      topicId,
      kind: "homework",
      purpose: "formative",
      format: "Worksheet",
      instructions: "Complete the worksheet and explain your answers.",
      submissionMethod: "text",
      opensAt: "2026-10-27T10:00",
      dueAt: "2026-10-28T16:00",
      closesAt: "2026-10-28T16:00",
      maxMarks: 20,
      countsAverage: true,
      weight: 1,
      maxAttempts: 2,
      ...extra,
    });
    await academic("task_assign", {
      taskId: task.taskId,
      revision: 0,
      learners: [app],
    });
    return { tid: task.taskId, pid: period.id };
  }
  const start = (tid: unknown) =>
    academic("attempt_start", { taskId: tid }, "student", student);
  const snap = (audience = "student", actor = student, application?: string) =>
    val<{
      tasks: Record<string, unknown>[];
      attempts: Record<string, unknown>[];
      grades: Record<string, unknown>[];
      progress: Record<string, unknown>[];
      resources: unknown[];
      reports: Record<string, unknown>[];
    }>("select public.academic_snapshot($1,$2,$3) value", [
      actor,
      audience,
      application || null,
    ]);
  async function submit(tid: unknown, answer = "My confirmed answer") {
    const attempt = await start(tid);
    const result = await academic(
      "submit",
      { attemptId: attempt.attemptId, revision: 0, answer },
      "student",
      student,
    );
    return { id: attempt.attemptId, receipt: result.receipt, ...result };
  }
  async function grade(tid: unknown, attemptId: unknown, score = 15) {
    const result = await academic("grade_save", {
      taskId: tid,
      attemptId,
      revision: 0,
      score,
      feedback: "Good understanding; revise the last step.",
      staffNote: "Private marking note",
    });
    await academic("grade_review", { taskId: tid, gradeId: result.gradeId });
    return result.gradeId;
  }
  it("assigns class-scoped work and keeps all draft marks private until admin publication", async () => {
    const { tid } = await setup();
    const attempt = await submit(tid);
    const gradeId = await grade(tid, attempt.id);
    expect((await snap()).grades).toHaveLength(0);
    await expect(
      academic("grade_publish", { taskId: tid, gradeId }),
    ).rejects.toThrow("Administrator");
    await academic("grade_publish", { taskId: tid, gradeId }, "admin", admin);
    const data = await snap();
    expect(data.grades[0].score).toBe(15);
    expect(JSON.stringify(data)).not.toContain("Private marking note");
    expect(data.progress[0].average).toBe(75);
  });
  it("saves drafts but confirms submission only once with an immutable receipt", async () => {
    const { tid } = await setup();
    const attempt = await start(tid);
    await academic(
      "draft_save",
      { attemptId: attempt.attemptId, revision: 0, answer: "Draft answer" },
      "student",
      student,
    );
    const data = await snap();
    expect(data.attempts[0].receipt).toBeNull();
    expect((await snap("tutor", teacher)).attempts).toHaveLength(0);
    await expect(
      academic(
        "submit",
        { attemptId: attempt.attemptId, revision: 0, answer: "Stale" },
        "student",
        student,
      ),
    ).rejects.toThrow("changed");
    const requestId = randomUUID(),
      args = {
        requestId,
        attemptId: attempt.attemptId,
        revision: 1,
        answer: "Final answer",
      };
    const first = await academic("submit", args, "student", student);
    expect(first.receipt).toBeTruthy();
    expect(await academic("submit", args, "student", student)).toEqual(first);
    await expect(
      academic(
        "draft_save",
        {
          attemptId: attempt.attemptId,
          revision: 2,
          answer: "Changed afterwards",
        },
        "student",
        student,
      ),
    ).rejects.toThrow("unsubmitted");
  });
  it("enforces exam opening, exact closing, duration and preserves expired drafts", async () => {
    const { tid } = await setup({
      kind: "exam",
      purpose: "summative",
      format: "Exam",
      maxAttempts: 1,
      opensAt: "2026-10-27T12:01",
      dueAt: "2026-10-27T13:00",
      closesAt: "2026-10-27T13:00",
      durationMinutes: 15,
    });
    await expect(start(tid)).rejects.toThrow("not open");
    await db.exec(
      "create or replace function public.teaching_now() returns timestamptz language sql stable as $$select timestamptz '2026-10-27 12:01:00+02'$$",
    );
    const attempt = await start(tid);
    await db.exec(
      "create or replace function public.teaching_now() returns timestamptz language sql stable as $$select timestamptz '2026-10-27 12:16:00+02'$$",
    );
    await expect(
      academic(
        "submit",
        { attemptId: attempt.attemptId, revision: 0, answer: "Too late" },
        "student",
        student,
      ),
    ).rejects.toThrow("deadline");
    expect((await snap()).attempts[0].state).toBe("draft");
    await academic("extension", {
      taskId: tid,
      applicationId: app,
      closesAt: "2026-10-27T14:00",
      extraMinutes: 30,
      reason: "Authorized additional assessment time",
    });
    const result = await academic(
      "submit",
      { attemptId: attempt.attemptId, revision: 0, answer: "Within extension" },
      "student",
      student,
    );
    expect(result.receipt).toBeTruthy();
    await expect(start(tid)).rejects.toThrow("already submitted");
  });
  it("requires verified uploaded files and rejects finalization/submission after the hard close", async () => {
    const { tid } = await setup({ submissionMethod: "file" });
    const attempt = await start(tid);
    const id = randomUUID();
    const up = await academic(
      "upload_prepare",
      {
        attemptId: attempt.attemptId,
        id,
        name: "work.pdf",
        mime: "application/pdf",
        size: 5,
      },
      "student",
      student,
    );
    await expect(
      academic(
        "submit",
        { attemptId: attempt.attemptId, revision: 0 },
        "student",
        student,
      ),
    ).rejects.toThrow("verify");
    await expect(
      academic(
        "upload_finalize",
        { attemptId: attempt.attemptId, id },
        "student",
        student,
      ),
    ).rejects.toThrow("verified");
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('academic-submissions',$1,$2)",
      [
        up.storage_path,
        JSON.stringify({ size: 5, mimetype: "application/pdf" }),
      ],
    );
    await academic(
      "upload_finalize",
      { attemptId: attempt.attemptId, id },
      "student",
      student,
    );
    await academic(
      "submit",
      { attemptId: attempt.attemptId, revision: 0 },
      "student",
      student,
    );
    expect(
      (
        await val(
          "select public.academic_file($1,'tutor',$2,'submission') value",
          [teacher, id],
        )
      ).bucket,
    ).toBe("academic-submissions");
    await expect(
      val("select public.academic_file($1,'parent',$2,'submission',$3) value", [
        parent,
        id,
        app,
      ]),
    ).rejects.toThrow();
  });
  it("excludes diagnostic results and unmarked work from averages, with missing counts shown", async () => {
    const { tid, pid } = await setup({
      purpose: "diagnostic",
      countsAverage: false,
    });
    const attempt = await submit(tid);
    const gid = await grade(tid, attempt.id, 8);
    await academic(
      "grade_publish",
      { taskId: tid, gradeId: gid },
      "admin",
      admin,
    );
    const t2 = await academic("task_create", {
      classId: cid,
      periodId: pid,
      topicId,
      kind: "homework",
      purpose: "summative",
      format: "Test",
      instructions: "Answer every question carefully.",
      submissionMethod: "text",
      opensAt: "2026-10-27T10:00",
      dueAt: "2026-10-28T16:00",
      closesAt: "2026-10-28T16:00",
      maxMarks: 20,
      countsAverage: true,
      weight: 1,
      maxAttempts: 1,
    });
    await academic("task_assign", {
      taskId: t2.taskId,
      revision: 0,
      learners: [app],
    });
    const data = await snap();
    expect(data.progress[0].average).toBeNull();
    expect(data.progress[0].missingCount).toBe(1);
    expect((data.progress[0].diagnostics as unknown[]).length).toBe(1);
  });
  it("retains published mark corrections and frozen report versions", async () => {
    const { tid, pid } = await setup();
    const attempt = await submit(tid);
    const gid = await grade(tid, attempt.id);
    await academic(
      "grade_publish",
      { taskId: tid, gradeId: gid },
      "admin",
      admin,
    );
    const report = await academic(
      "report_publish",
      {
        classId: cid,
        periodId: pid,
        applicationId: app,
        fingerprint: (await snap()).progress[0].fingerprint,
        reason: "Period progress reviewed and published",
      },
      "admin",
      admin,
    );
    const correction = await academic("grade_save", {
      taskId: tid,
      attemptId: attempt.id,
      revision: 1,
      score: 18,
      feedback: "Rechecked working; additional marks awarded.",
      reason: "Mark reviewed against memorandum",
    });
    expect((await snap()).progress[0].average).toBe(75);
    await academic("grade_review", {
      taskId: tid,
      gradeId: correction.gradeId,
    });
    await academic(
      "grade_publish",
      { taskId: tid, gradeId: correction.gradeId },
      "admin",
      admin,
    );
    const data = await snap();
    expect(data.progress[0].average).toBe(90);
    expect((data.reports[0].content as Record<string, unknown>).average).toBe(
      75,
    );
    await expect(
      db.query(
        "update public.academic_reports set reason='erase' where id=$1",
        [report.reportId],
      ),
    ).rejects.toThrow("immutable");
  });
  it("lets parents read only their children and rejects all parent writes", async () => {
    await setup();
    await val(
      "select public.admin_parent_access($1,$2,true,'Guardian verified for academic reads') value",
      [admin, app],
    );
    await val("select public.parent_bind($1) value", [parent]);
    expect((await snap("parent", parent, app)).tasks).toHaveLength(1);
    await expect(snap("parent", parent, randomUUID())).rejects.toThrow(
      "family",
    );
    await expect(
      academic("attempt_start", {}, "parent", parent),
    ).rejects.toThrow("read-only");
  });
  it("blocks student ownership spoofing, staff role escalation and browser access", async () => {
    const { tid } = await setup();
    await expect(
      academic("period_create", { classId: cid }, "student", student),
    ).rejects.toThrow("staff");
    await expect(
      academic("task_create", { classId: randomUUID() }),
    ).rejects.toThrow("not assigned");
    for (const role of ["anon", "authenticated"]) {
      expect(
        await val<boolean>(
          "select has_table_privilege($1,'public.academic_grades','SELECT') value",
          [role],
        ),
      ).toBe(false);
      expect(
        await val<boolean>(
          "select has_function_privilege($1,'public.academic_mutate(uuid,text,text,jsonb)','EXECUTE') value",
          [role],
        ),
      ).toBe(false);
    }
    await expect(
      academic("attempt_start", { taskId: randomUUID() }, "student", student),
    ).rejects.toThrow("not found");
    expect(tid).toBeTruthy();
  });
  it("supports returned homework attempts without rewriting the earlier submission", async () => {
    const { tid } = await setup();
    const first = await submit(tid);
    await academic("attempt_return", {
      attemptId: first.id,
      reason: "Please include the missing working",
    });
    const second = await start(tid);
    expect(second.attemptId).not.toBe(first.id);
    const data = await snap();
    expect(data.attempts.find((a) => a.id === first.id)?.receipt).toBe(
      first.receipt,
    );
    expect(data.attempts.find((a) => a.id === first.id)?.state).toBe(
      "returned",
    );
  });
  it.each([
    ["total_marks", 45.83],
    ["equal_weight", 57.5],
    ["weighted", 48.75],
  ])(
    "calculates %s averages from published results with explicit weights",
    async (method, expected) => {
      const { tid, pid } = await setup({ periodMethod: method, weight: 1 });
      const first = await submit(tid);
      const g1 = await grade(tid, first.id, 15);
      await academic(
        "grade_publish",
        { taskId: tid, gradeId: g1 },
        "admin",
        admin,
      );
      const second = await academic("task_create", {
        classId: cid,
        periodId: pid,
        topicId,
        kind: "homework",
        purpose: "summative",
        format: "Test",
        instructions: "Complete this independently and show working.",
        submissionMethod: "text",
        opensAt: "2026-10-27T10:00",
        dueAt: "2026-10-28T16:00",
        closesAt: "2026-10-28T16:00",
        maxMarks: 100,
        countsAverage: true,
        weight: 3,
        maxAttempts: 1,
      });
      await academic("task_assign", {
        taskId: second.taskId,
        revision: 0,
        learners: [app],
      });
      const attempt = await submit(second.taskId);
      const g2 = await grade(second.taskId, attempt.id, 40);
      await academic(
        "grade_publish",
        { taskId: second.taskId, gradeId: g2 },
        "admin",
        admin,
      );
      const progress = (await snap()).progress[0];
      expect(progress.average).toBe(expected);
      expect(progress.assessmentCount).toBe(2);
      expect(progress.missingCount).toBe(0);
    },
  );
  it("records pending upload recovery, discard and exact hard-close rejection without a false receipt", async () => {
    const { tid } = await setup({ submissionMethod: "file" });
    const attempt = await start(tid),
      id = randomUUID();
    const args = {
      attemptId: attempt.attemptId,
      id,
      name: "answer.pdf",
      mime: "application/pdf",
      size: 5,
    };
    const upload = await academic("upload_prepare", args, "student", student);
    await expect(
      academic("upload_resume", { ...args, size: 9 }, "student", student),
    ).rejects.toThrow("original");
    expect(
      (await academic("upload_resume", args, "student", student)).storage_path,
    ).toBe(upload.storage_path);
    await academic(
      "upload_discard",
      { attemptId: attempt.attemptId, id },
      "student",
      student,
    );
    const next = randomUUID();
    const prepared = await academic(
      "upload_prepare",
      { ...args, id: next },
      "student",
      student,
    );
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('academic-submissions',$1,$2)",
      [
        prepared.storage_path,
        JSON.stringify({ size: 5, mimetype: "application/pdf" }),
      ],
    );
    await db.exec(
      "create or replace function public.teaching_now() returns timestamptz language sql stable as $$select timestamptz '2026-10-28 16:00:00+02'$$",
    );
    await expect(
      academic(
        "upload_finalize",
        { attemptId: attempt.attemptId, id: next },
        "student",
        student,
      ),
    ).rejects.toThrow("deadline");
    await expect(
      academic(
        "submit",
        { attemptId: attempt.attemptId, revision: 0 },
        "student",
        student,
      ),
    ).rejects.toThrow("deadline");
    expect((await snap()).attempts[0].receipt).toBeNull();
  });
  it("hides questions before opening, keeps memoranda private through extensions, and blocks new access after revocation", async () => {
    const { pid } = await setup();
    const id = randomUUID();
    const material = await op("material_prepare", {
      id,
      title: "Private diagnostic",
      grade: "Grade 12",
      subject: "Mathematics",
      kind: "Question paper",
      name: "diagnostic.pdf",
      mime: "application/pdf",
      size: 5,
    });
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('teaching-materials',$1,$2)",
      [
        material.storage_path,
        JSON.stringify({ size: 5, mimetype: "application/pdf" }),
      ],
    );
    await op("material_finalize", { versionId: id });
    const task = await academic(
      "task_create",
      {
        classId: cid,
        periodId: pid,
        topicId,
        kind: "exam",
        purpose: "diagnostic",
        format: "Test",
        instructions: "Private questions must not appear before opening.",
        submissionMethod: "text",
        opensAt: "2026-10-27T13:00",
        dueAt: "2026-10-27T14:00",
        closesAt: "2026-10-27T14:00",
        durationMinutes: 30,
        maxMarks: 20,
        countsAverage: false,
        weight: 1,
        maxAttempts: 1,
        resources: [{ versionId: id, role: "memo" }],
      },
      "admin",
      admin,
    );
    await academic("task_assign", {
      taskId: task.taskId,
      revision: 0,
      learners: [app],
    });
    expect(JSON.stringify(await snap())).not.toContain(
      "Private questions must not appear",
    );
    await expect(
      val("select public.academic_file($1,'student',$2,'resource') value", [
        student,
        id,
      ]),
    ).rejects.toThrow("not released");
    await academic("extension", {
      taskId: task.taskId,
      applicationId: app,
      closesAt: "2026-10-27T15:00",
      extraMinutes: 30,
      reason: "Additional time approved",
    });
    await db.exec(
      "create or replace function public.teaching_now() returns timestamptz language sql stable as $$select timestamptz '2026-10-27 14:00:00+02'$$",
    );
    await expect(
      academic(
        "memo_release",
        { taskId: task.taskId, reason: "Assessment closed" },
        "admin",
        admin,
      ),
    ).rejects.toThrow("every learner");
    await db.exec(
      "create or replace function public.teaching_now() returns timestamptz language sql stable as $$select timestamptz '2026-10-27 15:00:00+02'$$",
    );
    await academic(
      "memo_release",
      { taskId: task.taskId, reason: "All assessment windows closed" },
      "admin",
      admin,
    );
    expect(
      (
        await val(
          "select public.academic_file($1,'student',$2,'resource') value",
          [student, id],
        )
      ).bucket,
    ).toBe("teaching-materials");
    await expect(
      academic("extension", {
        taskId: task.taskId,
        applicationId: app,
        closesAt: "2026-10-27T16:00",
        extraMinutes: 60,
        reason: "Cannot reopen after memo",
      }),
    ).rejects.toThrow("memorandum");
    await op("student_access", {
      applicationId: app,
      enabled: false,
      reason: "Learner access revoked",
    });
    await expect(snap()).rejects.toThrow("Student access");
  });
  it("preserves academic marks, frozen reports, private storage and accounting when the full setup is rerun", async () => {
    const { tid, pid } = await setup();
    const attempt = await submit(tid);
    const gradeId = await grade(tid, attempt.id);
    await academic("grade_publish", { taskId: tid, gradeId }, "admin", admin);
    const progress = (await snap()).progress[0];
    await academic(
      "report_publish",
      {
        classId: cid,
        periodId: pid,
        applicationId: app,
        fingerprint: progress.fingerprint,
        reason: "Report reviewed before upgrade rerun",
      },
      "admin",
      admin,
    );
    const count = await val<number>(
      "select count(*)::integer value from public.teaching_events",
    );
    await db.exec(readFileSync("docs/teaching-setup.sql", "utf8"));
    const data = await snap();
    expect(data.grades).toHaveLength(1);
    expect(data.reports).toHaveLength(1);
    expect((data.reports[0].content as Record<string, unknown>).average).toBe(
      75,
    );
    expect(
      await val<number>(
        "select count(*)::integer value from public.teaching_events",
      ),
    ).toBe(count);
    expect(
      await val<boolean>(
        "select public value from storage.buckets where id='academic-submissions'",
      ),
    ).toBe(false);
    expect(
      await val<number>(
        "select count(*)::integer value from public.accounting_journals",
      ),
    ).toBe(0);
  });
  it("blocks class/session release from bypassing academic paper and memorandum privacy", async () => {
    const { pid } = await setup();
    const id = randomUUID();
    const resource = await op("material_prepare", {
      id,
      title: "Unreleased exam paper",
      grade: "Grade 12",
      subject: "Mathematics",
      kind: "Question paper",
      name: "paper.pdf",
      mime: "application/pdf",
      size: 5,
    });
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('teaching-materials',$1,$2)",
      [
        resource.storage_path,
        JSON.stringify({ size: 5, mimetype: "application/pdf" }),
      ],
    );
    await op("material_finalize", { versionId: id });
    await academic(
      "task_create",
      {
        classId: cid,
        periodId: pid,
        topicId,
        kind: "exam",
        purpose: "summative",
        format: "Exam",
        instructions: "Unreleased timed assessment questions.",
        submissionMethod: "text",
        opensAt: "2026-10-27T13:00",
        dueAt: "2026-10-27T14:00",
        closesAt: "2026-10-27T14:00",
        durationMinutes: 30,
        maxMarks: 20,
        countsAverage: true,
        weight: 1,
        maxAttempts: 1,
        resources: [{ versionId: id, role: "instructions" }],
      },
      "admin",
      admin,
    );
    await op("class_material", { classId: cid, versionId: id });
    await expect(
      op("material_release", { classId: cid, versionId: id, visible: true }),
    ).rejects.toThrow("protected by an academic task");
    const sid = await session();
    await expect(
      op("material_release", {
        classId: cid,
        sessionId: sid,
        versionId: id,
        visible: true,
      }),
    ).rejects.toThrow("protected by an academic task");
  });
  it("uses wall time inside a waiting transaction rather than its start time for deadlines", async () => {
    await db.exec(
      "create or replace function public.academic_now() returns timestamptz language sql volatile set search_path='' as $$select clock_timestamp()$$;begin;",
    );
    try {
      const first = await val<string>(
        "select public.academic_now()::text value",
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(
        await val<number>(
          "select extract(epoch from (public.academic_now()-$1::timestamptz))::float value",
          [first],
        ),
      ).toBeGreaterThan(0.02);
    } finally {
      await db.exec("rollback");
    }
  });
});
