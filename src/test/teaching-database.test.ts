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
    "truncate public.teaching_requests,public.teaching_events,public.teaching_tutors,public.teaching_venues,public.teaching_topics,public.teaching_classes,public.applications,public.accounting_journals,public.accounting_requests,public.parent_accounts,storage.objects,public.tuition_closures cascade;create or replace function public.teaching_now() returns timestamptz language sql stable as $$select timestamptz '2026-10-27 12:00:00+02'$$;",
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
    expect(files).toHaveLength(3);
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
