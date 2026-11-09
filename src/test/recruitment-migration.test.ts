// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import type { RecruitmentSnapshot } from "@/lib/recruitment-types";
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  manager = "33333333-3333-4333-8333-333333333333",
  officer = "44444444-4444-4444-8444-444444444444",
  finance = "55555555-5555-4555-8555-555555555555";
const migrations = [
  "20261109010000_recruitment_foundations.sql",
  "20261109020000_recruitment_security_operations.sql",
  "20261109030000_recruitment_access_guards.sql",
  "20261109040000_recruitment_security_remediation.sql",
].map((n) => readFileSync("supabase/migrations/" + n, "utf8"));
let db: PGlite;
async function v<T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
const json = (data: object) => JSON.stringify(data);
async function change(
  operation: string,
  input: object,
  actor = owner,
  requestId = randomUUID(),
) {
  const data = { requestId, ...input },
    proof = randomUUID().replaceAll("-", "").repeat(2);
  await db.query("select public.recruitment_issue_challenge($1,$2,$3,$4,$5)", [
    actor,
    "a".repeat(64),
    operation,
    json(data),
    proof,
  ]);
  return v("select public.recruitment_mutate($1,$2,$3,$4,$5) v", [
    actor,
    operation,
    json(data),
    "a".repeat(64),
    proof,
  ]);
}
const snapshot = (actor = owner) =>
  v<RecruitmentSnapshot>("select public.recruitment_snapshot($1) v", [actor]);
async function enable() {
  await change("settings", {
    expectedRevision: 1,
    staffConsoleEnabled: true,
    accessGuardsEnabled: true,
    privacyPolicyVersion: "reviewed-test-v1",
  });
}
async function grant(userId: string, role: string) {
  return change("staff_grant", {
    userId,
    role,
    enabled: true,
    expectedRevision: -1,
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create schema storage; create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb); create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  await db.exec(
    readFileSync("supabase/schema.sql", "utf8").replace(
      'create extension if not exists "pgcrypto";',
      "",
    ),
  );
  for (const id of [owner, other, manager, officer, finance])
    await db.query("insert into auth.users values($1,$2,now())", [
      id,
      id.slice(0, 4) + "@example.test",
    ]);
  await db.query(
    "insert into public.admin_users(user_id,finance_role) values($1,'owner')",
    [finance],
  );
}, 30000);
beforeEach(async () => {
  await db.exec(
    "truncate public.recruitment_tutor_rebind_authorizations,public.recruitment_tutor_bindings,public.recruitment_operational_events,public.recruitment_requests,public.recruitment_events,public.recruitment_reauth_challenges,public.recruitment_staff_scopes,public.recruitment_scopes,public.recruitment_staff,public.recruitment_access_approvals,public.recruitment_auth_limits; update public.recruitment_settings set bootstrapped_at=null,revision=0,staff_console_enabled=false,access_guards_enabled=false,access_guards_mandatory=false,owner_aal2_required=false,privacy_policy_version='';",
  );
  for (const id of [owner, other, manager, officer, finance])
    await db.query(
      "insert into auth.users values($1,$2,now()) on conflict(id) do update set email_confirmed_at=now()",
      [id, id.slice(0, 4) + "@example.test"],
    );
  await db.query(
    "select public.recruitment_bootstrap($1,'test-operator','TEST-APPROVAL-1','Authorized synthetic owner setup')",
    [owner],
  );
});
afterAll(async () => {
  await db?.close();
});
describe("isolated PostgreSQL recruitment foundations", () => {
  it("returns reviewable business errors for duplicate pool scopes and invalid delegation targets", async () => {
    await change("scope_create", { kind: "talent_pool", label: "Talent pool" });
    await expect(
      change("scope_create", { kind: "talent_pool", label: "Another pool" }),
    ).rejects.toThrow("already exists");
    await expect(
      change("scope_grant", {
        userId: officer,
        scopeId: randomUUID(),
        enabled: true,
        expectedRevision: -1,
      }),
    ).rejects.toThrow("existing recruitment");
  });
  it("keeps canonical migrations identical to the fresh-schema block", () => {
    const block = readFileSync("supabase/schema.sql", "utf8")
      .split("-- BEGIN RECRUITMENT MILESTONE 1\n")[1]
      .split("-- END RECRUITMENT MILESTONE 1")[0];
    expect(block).toBe(migrations.map((s) => s + "\n").join(""));
    expect(
      readFileSync("docs/recruitment/milestone-1-setup.sql", "utf8"),
    ).toContain(block);
  });
  it("upgrades a populated audited baseline without changing existing identity or ledger rows", async () => {
    const upgrade = new PGlite();
    try {
      await upgrade.exec(
        "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create schema storage;create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
      );
      await upgrade.exec(
        readFileSync("supabase/schema.sql", "utf8")
          .split("-- BEGIN RECRUITMENT MILESTONE 1")[0]
          .replace('create extension if not exists "pgcrypto";', ""),
      );
      await upgrade.query(
        "insert into auth.users values($1,'upgrade@example.test',now());",
        [owner],
      );
      await upgrade.query(
        "insert into public.admin_users(user_id) values($1)",
        [owner],
      );
      await upgrade.exec(
        "select set_config('viva.teaching_actor','11111111-1111-4111-8111-111111111111',false)",
      );
      await upgrade.exec(
        "insert into public.teaching_tutors(name,email) values('Preserved synthetic tutor','preserve@example.test')",
      );
      await upgrade.query(
        'select public.accounting_post($1,\'synthetic-opening\',public.tuition_today(),\'Synthetic opening capital\',\'manual\',null,\'[{"account":"1000","cents":10000},{"account":"3000","cents":-10000}]\')',
        [owner],
      );
      await upgrade.query(
        "insert into public.teaching_tutors(name,email,user_id) values('Historical binding','historical@example.test',$1)",
        [owner],
      );
      await upgrade.exec(
        "update public.teaching_tutors set user_id=null where email='historical@example.test';insert into public.teaching_tutors(name,email,last_signed_in_at) values('Unresolved history','unresolved@example.test',now())",
      );
      const capture = async () => ({
        tutors: (
          await upgrade.query(
            "select * from public.teaching_tutors order by id",
          )
        ).rows,
        admins: (
          await upgrade.query(
            "select * from public.admin_users order by user_id",
          )
        ).rows,
        journals: (
          await upgrade.query(
            "select * from public.accounting_journals order by id",
          )
        ).rows,
        lines: (
          await upgrade.query(
            "select * from public.accounting_lines order by id",
          )
        ).rows,
      });
      const before = await capture();
      for (const sql of migrations.slice(0, 3)) await upgrade.exec(sql);
      expect(await capture()).toEqual(before);
      await upgrade.query("select public.recruitment_bootstrap($1)", [owner]); // original installed M1 signature
      await upgrade.exec(migrations[3]);
      expect(await capture()).toEqual(before);
      expect(
        (
          await upgrade.query<{ established_user_id: string }>(
            "select b.established_user_id from public.recruitment_tutor_bindings b join public.teaching_tutors t on t.id=b.tutor_id where t.email='historical@example.test'",
          )
        ).rows[0].established_user_id,
      ).toBe(owner);
      expect(
        (
          await upgrade.query<{ history_unresolved: boolean }>(
            "select b.history_unresolved from public.recruitment_tutor_bindings b join public.teaching_tutors t on t.id=b.tutor_id where t.email='unresolved@example.test'",
          )
        ).rows[0].history_unresolved,
      ).toBe(true);
      await expect(
        upgrade.query(
          "update public.teaching_tutors set user_id=$1 where email='unresolved@example.test'",
          [owner],
        ),
      ).rejects.toThrow("owner-approved");
      expect(
        (
          await upgrade.query(
            "select role,enabled from public.recruitment_staff where user_id=$1",
            [owner],
          )
        ).rows[0],
      ).toEqual({ role: "owner", enabled: true });
      expect(
        (
          await upgrade.query(
            "select owner_aal2_required,access_guards_mandatory from public.recruitment_settings",
          )
        ).rows[0],
      ).toEqual({ owner_aal2_required: false, access_guards_mandatory: false });
    } finally {
      await upgrade.close();
    }
  }, 30000);
  it("serializes competing owner revocations and retains one usable authority", async () => {
    await grant(other, "owner");
    const choices = [
      { actor: owner, target: other },
      { actor: other, target: owner },
    ];
    const prepared = await Promise.all(
      choices.map(async (c) => {
        const data = {
            requestId: randomUUID(),
            userId: c.target,
            role: "owner",
            enabled: false,
            expectedRevision: 0,
          },
          proof = randomUUID().replaceAll("-", "").repeat(2);
        await db.query(
          "select public.recruitment_issue_challenge($1,$2,$3,$4,$5)",
          [c.actor, "a".repeat(64), "staff_grant", json(data), proof],
        );
        return { ...c, data, proof };
      }),
    );
    const outcomes = await Promise.allSettled(
      prepared.map((c) =>
        db.query("select public.recruitment_mutate($1,$2,$3,$4,$5)", [
          c.actor,
          "staff_grant",
          json(c.data),
          "a".repeat(64),
          c.proof,
        ]),
      ),
    );
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      await v(
        "select count(*)::int v from public.recruitment_staff where role='owner' and enabled",
      ),
    ).toBe(1);
  });
  it("bootstraps only once, independently of finance and without exposing a bootstrap RPC", async () => {
    expect((await snapshot()).user.role).toBe("owner");
    expect(
      await v(
        "select count(*)::int v from public.admin_users where user_id=$1",
        [owner],
      ),
    ).toBe(0);
    await expect(snapshot(finance)).rejects.toThrow("permission");
    await expect(
      db.query(
        "select public.recruitment_bootstrap($1,'test-operator','TEST-APPROVAL-1','Authorized synthetic owner setup')",
        [other],
      ),
    ).rejects.toThrow("already");
    expect(
      await v(
        "select has_function_privilege('service_role','public.recruitment_bootstrap(uuid,text,text,text)','execute') v",
      ),
    ).toBe(false);
    expect(
      Object.values((await snapshot()).features).every((x) => x === false),
    ).toBe(true);
  });
  it("denies missing, reusable, expired, wrong-session and changed-payload authentication proofs", async () => {
    const data = {
      requestId: randomUUID(),
      kind: "vacancy",
      label: "Synthetic scope",
    };
    const mutate = (session = "a".repeat(64), input = data) =>
      db.query("select public.recruitment_mutate($1,$2,$3,$4,$5)", [
        owner,
        "scope_create",
        json(input),
        session,
        "b".repeat(64),
      ]);
    await expect(mutate()).rejects.toThrow("Fresh");
    await db.query(
      "select public.recruitment_issue_challenge($1,$2,$3,$4,$5)",
      [owner, "a".repeat(64), "scope_create", json(data), "b".repeat(64)],
    );
    await expect(mutate("c".repeat(64))).rejects.toThrow("Fresh");
    await expect(
      mutate("a".repeat(64), { ...data, label: "Changed" }),
    ).rejects.toThrow("Fresh");
    await db.exec(
      "update public.recruitment_reauth_challenges set expires_at=now()-interval '1 second'",
    );
    await expect(mutate()).rejects.toThrow("Fresh");
  });
  it("replays an identical request once, rejects conflicting reuse, and records one audit event", async () => {
    const data = {
      requestId: randomUUID(),
      kind: "vacancy",
      label: "Idempotent scope",
    };
    const first = await change("scope_create", data);
    const second = await v(
      "select public.recruitment_mutate($1,$2,$3,$4,$5) v",
      [owner, "scope_create", json(data), "wrong", "wrong"],
    );
    expect(second).toEqual(first);
    expect(
      await v(
        "select count(*)::int v from public.recruitment_events where request_id=$1",
        [data.requestId],
      ),
    ).toBe(1);
    await expect(
      db.query("select public.recruitment_mutate($1,$2,$3,$4,$5)", [
        owner,
        "scope_create",
        json({ ...data, label: "Changed" }),
        "wrong",
        "wrong",
      ]),
    ).rejects.toThrow("conflicts");
    await expect(
      db.exec("update public.recruitment_events set action='forged'"),
    ).rejects.toThrow("append-only");
    await expect(
      db.exec("delete from public.recruitment_requests"),
    ).rejects.toThrow("append-only");
  });
  it("enforces self-grant, role, strict field and stale-revision boundaries", async () => {
    await expect(
      change("staff_grant", {
        userId: owner,
        role: "officer",
        enabled: true,
        expectedRevision: 0,
      }),
    ).rejects.toThrow("own");
    await grant(manager, "manager");
    await enable();
    await expect(
      grant(officer, "owner").then(() =>
        change(
          "settings",
          {
            expectedRevision: 2,
            staffConsoleEnabled: true,
            accessGuardsEnabled: true,
            privacyPolicyVersion: "x",
          },
          manager,
        ),
      ),
    ).rejects.toThrow("permission");
    await expect(
      change("staff_grant", {
        userId: manager,
        role: "manager",
        enabled: true,
        expectedRevision: -1,
      }),
    ).rejects.toThrow("changed");
    await expect(
      change("scope_create", {
        kind: "vacancy",
        label: "Test",
        activation: true,
      }),
    ).rejects.toThrow("fields");
    await expect(change("grade_publish", {})).rejects.toThrow(
      "not been released",
    );
  });
  it("requires console opt-in and bounds manager delegation to their own scopes and enabled officers", async () => {
    await grant(manager, "manager");
    await grant(officer, "officer");
    await expect(snapshot(manager)).rejects.toThrow("disabled");
    await enable();
    const a = await change("scope_create", {
        kind: "vacancy",
        label: "Allowed scope",
      }),
      b = await change("scope_create", {
        kind: "vacancy",
        label: "Forbidden scope",
      });
    await change("scope_grant", {
      userId: manager,
      scopeId: a.scopeId,
      enabled: true,
      expectedRevision: -1,
    });
    await change("scope_grant", {
      userId: officer,
      scopeId: a.scopeId,
      enabled: false,
      expectedRevision: -1,
    });
    await change(
      "scope_grant",
      {
        userId: officer,
        scopeId: a.scopeId,
        enabled: true,
        expectedRevision: 0,
      },
      manager,
    );
    await expect(
      change(
        "scope_grant",
        {
          userId: officer,
          scopeId: b.scopeId,
          enabled: true,
          expectedRevision: -1,
        },
        manager,
      ),
    ).rejects.toThrow("delegation");
    await expect(
      change(
        "scope_grant",
        {
          userId: manager,
          scopeId: a.scopeId,
          enabled: true,
          expectedRevision: 0,
        },
        manager,
      ),
    ).rejects.toThrow();
    expect((await snapshot(officer)).scopes.map((x) => x.id)).toEqual([
      a.scopeId,
    ]);
    expect((await snapshot(officer)).staff).toEqual([]);
    expect((await snapshot(manager)).events).toEqual([]);
  });
  it("rechecks revocation before replay, and grants no general Admin identity", async () => {
    await grant(manager, "manager");
    await grant(officer, "officer");
    await enable();
    const scope = await change("scope_create", {
      kind: "vacancy",
      label: "Scope",
    });
    await change("scope_grant", {
      userId: manager,
      scopeId: scope.scopeId,
      enabled: true,
      expectedRevision: -1,
    });
    await change("scope_grant", {
      userId: officer,
      scopeId: scope.scopeId,
      enabled: false,
      expectedRevision: -1,
    });
    const data = {
      requestId: randomUUID(),
      userId: officer,
      scopeId: scope.scopeId,
      enabled: true,
      expectedRevision: 0,
    };
    await change("scope_grant", data, manager);
    await change("staff_grant", {
      userId: manager,
      role: "manager",
      enabled: false,
      expectedRevision: 0,
    });
    await expect(
      db.query("select public.recruitment_mutate($1,$2,$3,$4,$5)", [
        manager,
        "scope_grant",
        json(data),
        "a".repeat(64),
        "b".repeat(64),
      ]),
    ).rejects.toThrow("permission");
    expect(
      await v(
        "select count(*)::int v from public.admin_users where user_id=$1",
        [officer],
      ),
    ).toBe(0);
  });
  it("fences legacy grants only after owner opt-in; existing access, login binding and finance data remain intact", async () => {
    await db.exec(
      "select set_config('viva.teaching_actor','11111111-1111-4111-8111-111111111111',false)",
    );
    const id = await v(
      "insert into public.teaching_tutors(name,email) values('Existing synthetic tutor','existing@example.test') returning id v",
    );
    await enable();
    expect(
      await v("select enabled v from public.teaching_tutors where id=$1", [id]),
    ).toBe(true);
    await db.query("update public.teaching_tutors set user_id=$1 where id=$2", [
      other,
      id,
    ]);
    expect(
      await v(
        "insert into public.teaching_tutors(name,email) values('New synthetic tutor','new@example.test') returning enabled v",
      ),
    ).toBe(false);
    await expect(
      db.exec(
        "update public.teaching_tutors set enabled=true where email='new@example.test'",
      ),
    ).rejects.toThrow("not released");
    await expect(
      db.query("insert into public.admin_users(user_id) values($1)", [manager]),
    ).rejects.toThrow("owner activation");
    await db.query(
      "update public.admin_users set finance_role='viewer' where user_id=$1",
      [finance],
    );
    await expect(
      db.query(
        "update public.admin_users set finance_role='bookkeeper' where user_id=$1",
        [finance],
      ),
    ).rejects.toThrow("owner activation");
    expect(
      await v("select count(*)::int v from public.accounting_journals"),
    ).toBe(0);
    await db.query(
      "update public.admin_users set enabled=false where user_id=$1",
      [finance],
    );
    await db
      .query("update public.admin_users set enabled=true where user_id=$1", [
        finance,
      ])
      .catch(() => undefined);
    await db.exec("select set_config('viva.teaching_actor','',false)");
  });
  it("keeps browser/table grants closed and schema reruns preserve owner state and rollout settings", async () => {
    await enable();
    for (const sql of migrations) await db.exec(sql);
    expect((await snapshot()).settings.staff_console_enabled).toBe(true);
    expect(
      await v(
        "select count(*)::int v from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'recruitment_%' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE'))",
      ),
    ).toBe(0);
    expect(
      await v(
        "select count(*)::int v from pg_proc where pronamespace='public'::regnamespace and proname like 'recruitment_%' and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute'))",
      ),
    ).toBe(0);
    expect(
      await v(
        "select count(*)::int v from pg_proc where pronamespace='public'::regnamespace and proname like 'recruitment_%' and prosecdef and not coalesce(proconfig,'{}') @> array['search_path=\"\"']",
      ),
    ).toBe(0);
  });
  it("revokes unverified staff permanently across email reverification and permits reductions but not elevation", async () => {
    await grant(manager, "manager");
    await enable();
    const scope = await change("scope_create", {
      kind: "vacancy",
      label: "Revocable scope",
    });
    await change("scope_grant", {
      userId: manager,
      scopeId: scope.scopeId,
      enabled: true,
      expectedRevision: -1,
    });
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [manager],
    );
    await expect(snapshot(manager)).rejects.toThrow("permission");
    await change("scope_grant", {
      userId: manager,
      scopeId: scope.scopeId,
      enabled: false,
      expectedRevision: 0,
    });
    await expect(
      change("scope_grant", {
        userId: manager,
        scopeId: scope.scopeId,
        enabled: true,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("verified");
    await change("staff_grant", {
      userId: manager,
      role: "officer",
      enabled: true,
      expectedRevision: 0,
    });
    await expect(
      change("staff_grant", {
        userId: manager,
        role: "manager",
        enabled: true,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("verified");
    await change("staff_grant", {
      userId: manager,
      role: "officer",
      enabled: false,
      expectedRevision: 1,
    });
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [manager],
    );
    await expect(snapshot(manager)).rejects.toThrow("permission");
    expect(
      await v(
        "select enabled v from public.recruitment_staff where user_id=$1",
        [manager],
      ),
    ).toBe(false);
  });
  it("serializes concurrent revocations of an unverified target and rejects unauthorized revocation", async () => {
    await grant(other, "owner");
    await grant(officer, "officer");
    await grant(manager, "manager");
    await enable();
    const data = {
      requestId: randomUUID(),
      userId: officer,
      role: "officer",
      enabled: false,
      expectedRevision: 0,
    };
    const prepared = await Promise.all(
      [owner, other].map(async (actor) => {
        const payload = { ...data, requestId: randomUUID() },
          proof = randomUUID().replaceAll("-", "").repeat(2);
        await db.query(
          "select public.recruitment_issue_challenge($1,$2,$3,$4,$5)",
          [actor, "a".repeat(64), "staff_grant", json(payload), proof],
        );
        return { actor, payload, proof };
      }),
    );
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [officer],
    );
    for (const actor of [manager, officer, finance])
      await expect(change("staff_grant", data, actor)).rejects.toThrow(
        "permission",
      );
    const results = await Promise.allSettled(
      prepared.map((p) =>
        db.query("select public.recruitment_mutate($1,$2,$3,$4,$5)", [
          p.actor,
          "staff_grant",
          json(p.payload),
          "a".repeat(64),
          p.proof,
        ]),
      ),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      await v(
        "select revision v from public.recruitment_staff where user_id=$1",
        [officer],
      ),
    ).toBe(1);
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [officer],
    );
    await expect(snapshot(officer)).rejects.toThrow("permission");
  });
  it("locks mandatory safeguards outside normal flags and records exceptional disablement", async () => {
    const operate = (action: string) =>
      v(
        "select public.recruitment_operate($1,'operator-A','APPROVAL-22','Independent operational approval') v",
        [action],
      );
    await enable();
    // Ordinary disabled/enabled states remain available before production lock.
    await change("settings", {
      expectedRevision: 2,
      staffConsoleEnabled: false,
      accessGuardsEnabled: false,
      privacyPolicyVersion: "test",
    });
    await operate("lock_safeguards");
    await expect(
      change("settings", {
        expectedRevision: 4,
        staffConsoleEnabled: false,
        accessGuardsEnabled: false,
        privacyPolicyVersion: "test",
      }),
    ).rejects.toThrow("separately approved");
    await operate("exception_disable_safeguards");
    const settings = (await snapshot()).settings;
    expect(settings.access_guards_enabled).toBe(false);
    expect(settings.access_guards_mandatory).toBe(true);
    expect(settings.staff_console_enabled).toBe(false);
    expect(
      await v(
        "select count(*)::int v from public.recruitment_operational_events where action='exception_disable_safeguards'",
      ),
    ).toBe(1);
    await operate("restore_safeguards");
    expect((await snapshot()).settings.access_guards_enabled).toBe(true);
    await expect(
      db.exec("delete from public.recruitment_operational_events"),
    ).rejects.toThrow("append-only");
    expect(
      await v(
        "select has_function_privilege('service_role','public.recruitment_operate(text,text,text,text,uuid,uuid,uuid)','execute') v",
      ),
    ).toBe(false);
  });
  it("enforces opt-in AAL2 at both proof issuance and mutation, including proofs created before enforcement", async () => {
    const data = {
        requestId: randomUUID(),
        kind: "vacancy",
        label: "MFA scope",
      },
      proof = "e".repeat(64);
    await db.query(
      "select public.recruitment_issue_challenge($1,$2,$3,$4,$5)",
      [owner, "a".repeat(64), "scope_create", json(data), proof],
    );
    await db.exec(
      "select public.recruitment_operate('require_owner_mfa','operator-A','MFA-APPROVAL','Hosted enrollment and recovery accepted')",
    );
    await expect(
      db.query("select public.recruitment_mutate($1,$2,$3,$4,$5)", [
        owner,
        "scope_create",
        json(data),
        "a".repeat(64),
        proof,
      ]),
    ).rejects.toThrow("AAL2");
    await expect(
      change("scope_create", { kind: "vacancy", label: "Denied AAL1" }),
    ).rejects.toThrow("AAL2");
    await db.query("select public.recruitment_mutate($1,$2,$3,$4,$5,'aal2')", [
      owner,
      "scope_create",
      json(data),
      "a".repeat(64),
      proof,
    ]);
    expect(
      await v(
        "select count(*)::int v from public.recruitment_requests where id=$1",
        [data.requestId],
      ),
    ).toBe(1);
    expect(
      await v(
        "select to_regprocedure('public.recruitment_mutate(uuid,text,jsonb,text,text)') is null v",
      ),
    ).toBe(true);
  });
  it("restores only the authorized actor's exact request without credentials and rechecks current scopes", async () => {
    const data = {
      requestId: randomUUID(),
      kind: "vacancy",
      label: "Server-only choices",
    };
    await db.query(
      "select public.recruitment_issue_challenge($1,$2,$3,$4,$5)",
      [owner, "a".repeat(64), "scope_create", json(data), "f".repeat(64)],
    );
    const restore = () =>
      v<{ data: object; completed: boolean }>(
        "select public.recruitment_recover_request($1,$2) v",
        [owner, data.requestId],
      );
    expect(await restore()).toMatchObject({ data, completed: false });
    await grant(other, "owner");
    await expect(
      v("select public.recruitment_recover_request($1,$2) v", [
        other,
        data.requestId,
      ]),
    ).rejects.toThrow("No recoverable");
    await change("scope_create", data);
    expect(await restore()).toMatchObject({ data, completed: true });
  });
  it("limits manager directories and delegation to owner-introduced staff in shared authorized scopes", async () => {
    await grant(manager, "manager");
    await grant(officer, "officer");
    await grant(other, "officer");
    await enable();
    const scope = await change("scope_create", {
      kind: "vacancy",
      label: "Manager scope",
    });
    expect((await snapshot(manager)).staff).toEqual([]);
    await change("scope_grant", {
      userId: manager,
      scopeId: scope.scopeId,
      enabled: true,
      expectedRevision: -1,
    });
    expect((await snapshot(manager)).staff).toEqual([]);
    await expect(
      change(
        "scope_grant",
        {
          userId: other,
          scopeId: scope.scopeId,
          enabled: true,
          expectedRevision: -1,
        },
        manager,
      ),
    ).rejects.toThrow("delegation");
    await change("scope_grant", {
      userId: officer,
      scopeId: scope.scopeId,
      enabled: false,
      expectedRevision: -1,
    });
    expect((await snapshot(manager)).staff.map((x) => x.user_id)).toEqual([
      officer,
    ]);
    await change(
      "scope_grant",
      {
        userId: officer,
        scopeId: scope.scopeId,
        enabled: true,
        expectedRevision: 0,
      },
      manager,
    );
    expect((await snapshot()).staff).toHaveLength(4);
  });
  it("preserves first binding, denies inherited replacement after Auth deletion and consumes owner-approved authorization once", async () => {
    const original = randomUUID(),
      replacement = randomUUID(),
      first = randomUUID();
    await db.query(
      "insert into auth.users values($1,'binding-old@example.test',now()),($2,'binding-new@example.test',now()),($3,'binding-first@example.test',now())",
      [original, replacement, first],
    );
    await db.exec(
      "select set_config('viva.teaching_actor','11111111-1111-4111-8111-111111111111',false)",
    );
    // Established identity populated by an operator before first sign-in; no historical Auth actor prevents deletion.
    const tutor = await v<string>(
      "insert into public.teaching_tutors(name,email,user_id) values('Binding test','binding-old@example.test',$1) returning id v",
      [original],
    );
    await expect(
      db.query("update public.teaching_tutors set user_id=$1 where id=$2", [
        replacement,
        tutor,
      ]),
    ).rejects.toThrow("owner-approved");
    await db.exec(
      "insert into public.teaching_tutors(name,email) values('First binding test','binding-first@example.test')",
    );
    await enable();
    await db.query("select public.tutor_bind($1)", [first]);
    await db.query("select public.tutor_bind($1)", [first]);
    await db.exec(
      "select set_config('viva.teaching_actor','11111111-1111-4111-8111-111111111111',false)",
    );
    expect(
      await v(
        "select established_user_id v from public.recruitment_tutor_bindings where tutor_id=$1",
        [tutor],
      ),
    ).toBe(original);
    await db.query("delete from auth.users where id=$1", [original]);
    expect(
      await v("select user_id v from public.teaching_tutors where id=$1", [
        tutor,
      ]),
    ).toBe(null);
    await db.query(
      "update auth.users set email='binding-old@example.test' where id=$1",
      [replacement],
    );
    await expect(
      db.query("select public.tutor_bind($1)", [replacement]),
    ).rejects.toThrow("owner-approved");
    await expect(
      db.query(
        "select public.recruitment_operate('authorize_tutor_rebind','operator-A','REBIND-1','Approved replacement identity',$1,$1,$2)",
        [replacement, tutor],
      ),
    ).rejects.toThrow("permission");
    await db.query(
      "select public.recruitment_operate('authorize_tutor_rebind','operator-A','REBIND-1','Independent owner approved replacement',$1,$2,$3)",
      [replacement, owner, tutor],
    );
    await db.query("select public.tutor_bind($1)", [replacement]);
    await db.query("select public.tutor_bind($1)", [replacement]); // normal repeat sign-in, no new authorization
    expect(
      await v(
        "select established_user_id v from public.recruitment_tutor_bindings where tutor_id=$1",
        [tutor],
      ),
    ).toBe(replacement);
    expect(
      await v(
        "select count(*)::int v from public.recruitment_tutor_rebind_authorizations where tutor_id=$1 and consumed_at is not null",
        [tutor],
      ),
    ).toBe(1);
    expect(
      await v("select enabled v from public.teaching_tutors where id=$1", [
        tutor,
      ]),
    ).toBe(true);
    await db.query(
      "update auth.users set email='3333@example.test' where id=$1",
      [replacement],
    );
  });
  it("records actual database operator attribution and supports an explicitly approved all-owner recovery", async () => {
    const first = await db.query<{
      database_actor: string;
      operator_reference: string;
      approval_reference: string;
    }>(
      "select * from public.recruitment_operational_events where action='bootstrap_owner'",
    );
    expect(first.rows[0]).toMatchObject({
      operator_reference: "test-operator",
      approval_reference: "TEST-APPROVAL-1",
    });
    expect(first.rows[0].database_actor).toBe(await v("select session_user v"));
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [owner],
    );
    await expect(snapshot()).rejects.toThrow("permission");
    await expect(
      db.exec(
        "select public.recruitment_operate('recover_owner','','','',null)",
      ),
    ).rejects.toThrow("required");
    await db.query(
      "select public.recruitment_operate('recover_owner','verified-operator','RECOVERY-APPROVAL','Independent business owner identity verified',$1)",
      [other],
    );
    expect((await snapshot(other)).user.role).toBe("owner");
    expect(
      await v(
        "select count(*)::int v from public.recruitment_operational_events where action='recover_owner'",
      ),
    ).toBe(1);
    await db.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [owner],
    );
  });
});
