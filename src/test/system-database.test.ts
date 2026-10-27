// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { SystemSnapshot } from "@/lib/system-types";
let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111",
  other = "33333333-3333-4333-8333-333333333333",
  viewer = "44444444-4444-4444-8444-444444444444";
async function value<T = unknown>(
  sql: string,
  args: unknown[] = [],
): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0].v;
}
const snapshot = (actor = owner) =>
  value<SystemSnapshot>("select public.system_snapshot($1) v", [actor]);
const change = (operation: string, data: object, actor = owner) =>
  value("select public.system_mutate($1,$2,$3) v", [
    actor,
    operation,
    JSON.stringify(data),
  ]);
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
    [owner, "owner@example.test"],
    [other, "staff@example.test"],
    [viewer, "viewer@example.test"],
  ])
    await db.query("insert into auth.users values($1,$2,now())", [id, email]);
  await db.query(
    "insert into public.admin_users(user_id,finance_role) values($1,'owner'),($2,'viewer')",
    [owner, viewer],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("real system oversight SQL", () => {
  it("reports full zero-state counts and restricts staff identity data to owners", async () => {
    const s = await snapshot();
    expect(s.health.integrity).toEqual({
      receivableDifference: 0,
      creditDifference: 0,
      deferredDifference: 0,
      payableDifference: 0,
      trialBalance: 0,
    });
    expect(s.candidates).toEqual([{ id: other, email: "staff@example.test" }]);
    expect(s.health.access.admins).toBe(2);
    expect(s.scheduledJob).toBeNull();
    expect((await snapshot(viewer)).admins).toEqual([]);
    expect((await snapshot(viewer)).candidates).toEqual([]);
    await expect(snapshot(other)).rejects.toThrow("Admin access");
  });
  it("allows an owner change, audits it once, replays exact requests and rejects stale or conflicting edits", async () => {
    const s = await snapshot(),
      request = {
        requestId: randomUUID(),
        revision: s.revision,
        userId: other,
        enabled: true,
        role: "bookkeeper",
        reason: "Grant operational access",
      };
    const first = await change("admin_access", request);
    expect(await change("admin_access", request)).toEqual(first);
    expect((await snapshot()).admins.find((a) => a.id === other)?.role).toBe(
      "bookkeeper",
    );
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from public.admin_audit where action='system_admin_access'",
        )
      ).rows[0].n,
    ).toBe(1);
    await expect(
      change("admin_access", { ...request, role: "viewer" }),
    ).rejects.toThrow("different change");
    await expect(
      change("admin_access", { ...request, requestId: randomUUID() }),
    ).rejects.toThrow("Settings changed");
  });
  it("blocks non-owners, self-permission changes and revocation of the active scheduler owner", async () => {
    const revision = (await snapshot()).revision;
    await expect(
      change(
        "admin_access",
        {
          requestId: randomUUID(),
          revision,
          userId: other,
          enabled: false,
          role: "viewer",
          reason: "Staff access no longer required",
        },
        viewer,
      ),
    ).rejects.toThrow("finance role");
    await expect(
      change("admin_access", {
        requestId: randomUUID(),
        revision,
        userId: owner,
        enabled: false,
        role: "owner",
        reason: "Review own permissions",
      }),
    ).rejects.toThrow("Another owner");
    await db.query(
      "update public.admin_users set finance_role='owner' where user_id=$1",
      [other],
    );
    await db.query(
      "update public.accounting_settings set automation_enabled=true,scheduler_actor=$1",
      [other],
    );
    await expect(
      change("admin_access", {
        requestId: randomUUID(),
        revision,
        userId: other,
        enabled: false,
        role: "owner",
        reason: "Staff access no longer required",
      }),
    ).rejects.toThrow("scheduled-run owner");
    await db.exec(
      "update public.accounting_settings set automation_enabled=false",
    );
  });
  it("records future closures, removes them with history, and rejects past dates", async () => {
    const today = (await snapshot()).today;
    const date = new Date(today + "T12:00:00Z");
    date.setUTCFullYear(date.getUTCFullYear() + 1);
    date.setUTCMonth(2, 10);
    const day = date.toISOString().slice(0, 10);
    let revision = (await snapshot()).revision;
    await change("closure_add", {
      requestId: randomUUID(),
      revision,
      day,
      reason: "Staff training",
    });
    expect((await snapshot()).closures).toContainEqual({
      day,
      reason: "Staff training",
    });
    revision = (await snapshot()).revision;
    await change("closure_remove", {
      requestId: randomUUID(),
      revision,
      day,
      reason: "Closure no longer needed",
    });
    expect((await snapshot()).closures.some((c) => c.day === day)).toBe(false);
    await expect(
      change("closure_add", {
        requestId: randomUUID(),
        revision: (await snapshot()).revision,
        day: "2000-02-01",
        reason: "Wrong past date",
      }),
    ).rejects.toThrow("future teaching date");
  });
  it("records an owner-reported backup review without claiming an automatic backup", async () => {
    const s = await snapshot();
    await change("backup_review", {
      requestId: randomUUID(),
      revision: s.revision,
      checkedOn: s.today,
      method: "provider_review",
      reason: "Backup shown in Supabase dashboard",
    });
    expect((await snapshot()).backups[0]).toMatchObject({
      checked_on: s.today,
      method: "provider_review",
      note: "Backup shown in Supabase dashboard",
    });
  });
  it("claims only one test send and rate-limits new requests even after a provider result", async () => {
    const id = randomUUID();
    const first = await value<{ send: boolean; to: string }>(
      "select public.system_email_test_claim($1,$2) v",
      [owner, id],
    );
    expect(first).toMatchObject({ send: true, to: "owner@example.test" });
    expect(
      await value("select public.system_email_test_claim($1,$2) v", [
        owner,
        id,
      ]),
    ).toMatchObject({ send: false, state: "pending" });
    await value(
      "select public.system_email_test_finish($1,$2,'accepted','provider-test') v",
      [owner, id],
    );
    expect(
      await value("select public.system_email_test_claim($1,$2) v", [
        owner,
        id,
      ]),
    ).toMatchObject({ send: false, state: "accepted" });
    await expect(
      value("select public.system_email_test_claim($1,$2) v", [
        owner,
        randomUUID(),
      ]),
    ).rejects.toThrow("Wait one minute");
  });
  it("records scheduled and manual observations independently and preserves latest scheduled heartbeat", async () => {
    const id = randomUUID();
    await value(
      "select public.system_job_record($1,$2,'scheduled','running') v",
      [owner, id],
    );
    await value(
      "select public.system_job_record($1,$2,'scheduled','completed','{\"sent\":0}') v",
      [owner, id],
    );
    for (let i = 0; i < 21; i++)
      await value(
        "select public.system_job_record($1,$2,'manual','running') v",
        [owner, randomUUID()],
      );
    const s = await snapshot();
    expect(s.jobs).toHaveLength(20);
    expect((await snapshot(viewer)).scheduledJob).not.toHaveProperty("actor_id");
    expect(s.scheduledJob).toMatchObject({
      id,
      state: "completed",
      source: "scheduled",
    });
  });
  it("applies automation through the accounting engine and rejects stale external settings", async () => {
    let snap = await snapshot();
    const data = {
      requestId: randomUUID(),
      revision: snap.revision,
      expectedAutomationEnabled: false,
      expectedAutoSend: false,
      automationEnabled: true,
      autoSend: false,
      reason: "Enable configured scheduled accounting",
    };
    await change("automation", data);
    expect((await snapshot()).accounting).toMatchObject({
      automation_enabled: true,
      auto_send: false,
      scheduler_valid: true,
    });
    expect(
      (
        await db.query<{ scheduler_actor: string }>(
          "select scheduler_actor from public.accounting_settings",
        )
      ).rows[0].scheduler_actor,
    ).toBe(owner);
    snap = await snapshot();
    await db.exec("update public.accounting_settings set auto_send=true");
    await expect(
      change("automation", {
        ...data,
        requestId: randomUUID(),
        revision: snap.revision,
        expectedAutomationEnabled: true,
      }),
    ).rejects.toThrow("Automation changed");
    await db.exec(
      "update public.accounting_settings set automation_enabled=false,auto_send=false",
    );
  });
  it("finds a verified staff email exactly and can disable an existing unverified account", async () => {
    await change("admin_access", {
      requestId: randomUUID(),
      revision: (await snapshot()).revision,
      userEmail: "STAFF@example.test",
      enabled: true,
      role: "bookkeeper",
      reason: "Change responsibilities",
    });
    expect((await snapshot()).admins.find((a) => a.id === other)?.role).toBe(
      "bookkeeper",
    );
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [other],
    );
    await change("admin_access", {
      requestId: randomUUID(),
      revision: (await snapshot()).revision,
      userId: other,
      enabled: false,
      role: "viewer",
      reason: "Staff access no longer required",
    });
    expect((await snapshot()).admins.find((a) => a.id === other)?.enabled).toBe(
      false,
    );
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [other],
    );
  });
  it("prevents a closure over a real session and rejects sessions scheduled into an existing closure", async () => {
    const op = (operation: string, data: object) =>
      value<{ id: string }>(
        "select public.teaching_mutate($1,'admin',$2,$3) v",
        [
          owner,
          operation,
          JSON.stringify({ ...data, requestId: randomUUID() }),
        ],
      );
    const year = Number((await snapshot()).today.slice(0, 4)) + 1,
      day = year + "-03-15";
    const tutor = await op("tutor_save", {
      name: "Calendar Tutor",
      email: "calendar@example.test",
    });
    const venue = await op("venue_create", {
      name: "Calendar room",
      mode: "Online",
      detail: "https://example.test/room",
    });
    const topic = await op("topic_create", {
      grade: "Grade 12",
      subject: "Mathematics",
      title: "Calendar topic",
      goal: "Review mathematical methods",
    });
    const cl = await op("class_create", {
      grade: "Grade 12",
      subject: "Mathematics",
      group: "A",
      season: year,
      tutorId: tutor.id,
      venueId: venue.id,
      weekdays: [1],
      startTime: "16:00",
      endTime: "17:00",
    });
    const create = () =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('viva.teaching_actor',$1,true)", [
          owner,
        ]);
        return tx.query<{ id: string }>(
          "insert into public.teaching_sessions(class_id,topic_id,topic_title,learning_goal,tutor_id,venue_name,venue_detail,mode,starts_at,ends_at) values($1,$2,'Calendar topic','Review mathematical methods',$3,'Calendar room','https://example.test/room','Online',$4,$5) returning id",
          [
            cl.id,
            topic.id,
            tutor.id,
            day + "T16:00:00+02:00",
            day + "T17:00:00+02:00",
          ],
        );
      });
    const first = await create();
    await expect(
      change("closure_add", {
        requestId: randomUUID(),
        revision: (await snapshot()).revision,
        day,
        reason: "Public holiday",
      }),
    ).rejects.toThrow("Cancel or reschedule");
    await db.transaction(async (tx) => {
      await tx.query("select set_config('viva.teaching_actor',$1,true)", [
        owner,
      ]);
      await tx.query(
        "update public.teaching_sessions set status='cancelled' where id=$1",
        [first.rows[0].id],
      );
    });
    await change("closure_add", {
      requestId: randomUUID(),
      revision: (await snapshot()).revision,
      day,
      reason: "Public holiday",
    });
    await expect(create()).rejects.toThrow("teaching closure");
  });
  it("keeps all new tables and RPCs closed to browser database roles and safely reruns the migration", async () => {
    for (const role of ["anon", "authenticated"])
      expect(
        await value(
          "select has_function_privilege($1,'public.system_mutate(uuid,text,jsonb)','EXECUTE') v",
          [role],
        ),
      ).toBe(false);
    const before = (await snapshot()).revision;
    await db.exec(readFileSync("docs/system-setup.sql", "utf8"));
    expect((await snapshot()).revision).toBe(before);
    expect((await snapshot()).backups.length).toBe(1);
  });
});
