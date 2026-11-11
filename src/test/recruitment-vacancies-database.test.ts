// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import {
  emptyVacancyContent,
  type VacancyContent,
  type VacancyWorkspace,
  type PublicVacancyResponse,
} from "@/lib/recruitment-vacancies";
const owner = "11111111-1111-4111-8111-111111111111",
  manager = "22222222-2222-4222-8222-222222222222",
  officer = "33333333-3333-4333-8333-333333333333",
  unrelated = "44444444-4444-4444-8444-444444444444";
const migration = readFileSync(
  "supabase/migrations/20261109050000_recruitment_vacancies.sql",
  "utf8",
);
let db: PGlite;
const json = (data: unknown) => JSON.stringify(data);
const content = (overrides: Partial<VacancyContent> = {}): VacancyContent => ({
  ...emptyVacancyContent(),
  title: "Mathematics tutor",
  department: "Teaching",
  location: "Cape Town",
  summary: "Help learners develop their confidence in mathematics.",
  responsibilities: ["Teach engaging lessons."],
  minimumRequirements: ["Relevant subject knowledge."],
  requiredExperience: "Experience supporting learners.",
  skills: ["Communication"],
  subjects: ["Mathematics"],
  grades: ["10", "11", "12"],
  scheduleDetails: "Two afternoons per week.",
  opensAt: new Date(Date.now() - 86400000).toISOString(),
  closesAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  ...overrides,
});
async function val<T = unknown>(sql: string, args: unknown[] = []): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
async function prepare(
  operation: string,
  data: Record<string, unknown>,
  actor = owner,
) {
  const payload: Record<string, unknown> & { requestId: string } = {
      requestId: randomUUID(),
      ...data,
    },
    proof = randomUUID().replaceAll("-", "").repeat(2);
  await db.query("select public.recruitment_issue_challenge($1,$2,$3,$4,$5)", [
    actor,
    "a".repeat(64),
    operation,
    json(payload),
    proof,
  ]);
  return { payload, proof, operation, actor };
}
async function execute(p: Awaited<ReturnType<typeof prepare>>) {
  return val<{
    saved: boolean;
    vacancyId: string;
    scopeId: string;
    revision: number;
  }>("select public.recruitment_mutate($1,$2,$3,$4,$5) v", [
    p.actor,
    p.operation,
    json(p.payload),
    "a".repeat(64),
    p.proof,
  ]);
}
async function change(
  operation: string,
  data: Record<string, unknown>,
  actor = owner,
) {
  return execute(await prepare(operation, data, actor));
}
const workspace = (
  actor = owner,
  vacancy: string | null = null,
  offset = 0,
  before: number | null = null,
  search = "",
  status = "",
  category = "",
) =>
  val<
    VacancyWorkspace & {
      total: number;
      nextOffset: number | null;
      historyBefore: number | null;
      versionsHasMore: boolean;
    }
  >("select public.recruitment_vacancy_workspace($1,$2,$3,$4,$5,$6,$7) v", [
    actor,
    vacancy,
    offset,
    before,
    search,
    status,
    category,
  ]);
const publicList = (slug: string | null = null) =>
  val<PublicVacancyResponse>(
    "select public.recruitment_public_vacancies($1) v",
    [slug],
  );
const create = (c = content(), scopeId: string | null = null, actor = owner) =>
  change("vacancy_create", { scopeId, content: c }, actor);
async function transition(op: string, id: string, reason = "", actor = owner) {
  const v = (await workspace(actor, id)).vacancies[0];
  return change(
    op,
    { vacancyId: id, expectedRevision: v.revision, reason },
    actor,
  );
}
async function publish(id: string) {
  await transition("vacancy_submit", id);
  await transition("vacancy_approve", id);
  await transition("vacancy_publish", id);
}
async function togglePublic(enabled: boolean) {
  const w = await workspace();
  return change("vacancy_settings", {
    expectedRevision: w.settingsRevision,
    publicVacanciesEnabled: enabled,
  });
}
async function staff(userId: string, role: string) {
  await change("staff_grant", {
    userId,
    role,
    enabled: true,
    expectedRevision: -1,
  });
}
async function scoped(userId: string, scopeId: string) {
  await change("scope_grant", {
    userId,
    scopeId,
    enabled: true,
    expectedRevision: -1,
  });
}
async function consoleOn() {
  await change("settings", {
    expectedRevision: 1,
    staffConsoleEnabled: true,
    accessGuardsEnabled: true,
    privacyPolicyVersion: "synthetic-policy",
  });
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
  await db.exec(migration);
  for (const id of [owner, manager, officer, unrelated])
    await db.query("insert into auth.users values($1,$2,now())", [
      id,
      id.slice(0, 4) + "@example.test",
    ]);
}, 30000);
beforeEach(async () => {
  await db.exec(
    "truncate public.recruitment_vacancies,public.recruitment_staff,public.recruitment_scopes,public.recruitment_events,public.recruitment_requests,public.recruitment_reauth_challenges,public.recruitment_auth_limits,public.recruitment_operational_events cascade;update public.recruitment_settings set bootstrapped_at=null,revision=0,staff_console_enabled=false,access_guards_enabled=false,access_guards_mandatory=false,owner_aal2_required=false,public_vacancies_enabled=false,public_vacancies_generation=0;",
  );
  await db.exec("update auth.users set email_confirmed_at=now()");
  await db.query(
    "select public.recruitment_bootstrap($1,'test-operator','M2-APPROVAL','Authorized isolated vacancy tests')",
    [owner],
  );
});
afterAll(async () => {
  await db?.close();
});
describe("Milestone 2 vacancy SQL security and lifecycle", () => {
  it("creates vacancy, immutable first version and new scope atomically while public features default off", async () => {
    const result = await create();
    const w = await workspace();
    expect(result.saved).toBe(true);
    expect(w.vacancies).toHaveLength(1);
    expect(w.versions).toHaveLength(1);
    expect(w.vacancies[0]).toMatchObject({
      id: result.vacancyId,
      scopeId: result.scopeId,
      status: "draft",
      reviewState: "draft",
      revision: 0,
    });
    expect(w.vacancies[0].reference).toMatch(/^VIVA-\d{4}-\d{6,}$/);
    expect(w.vacancies[0].slug).toMatch(/^vacancy-\d{4}-\d+$/);
    expect(
      await val("select kind v from public.recruitment_scopes where id=$1", [
        result.scopeId,
      ]),
    ).toBe("vacancy");
    expect(await publicList()).toMatchObject({ enabled: false, vacancies: [] });
  });
  it("validates required fields, enum/null values, document/question schema and role-specific fields independently in SQL", async () => {
    const base = content();
    for (const bad of [
      { ...base, title: "x" },
      { ...base, workArrangement: null },
      { ...base, engagementType: "part_time" },
      { ...base, category: "administrator" },
      { ...base, positions: 0 },
      {
        ...base,
        requiredDocuments: [
          { key: "cv", label: "CV", required: true },
          { key: "cv", label: "CV again", required: false },
        ],
      },
      {
        ...base,
        questions: [
          { key: "unsafe", label: "Question", type: "file", required: true },
        ],
      },
      { ...base, closesAt: "tomorrow" },
      { ...base, opensAt: base.closesAt, closesAt: base.opensAt },
      { ...base, extra: "unreleased" },
    ]) {
      expect(
        await val(
          "select public.recruitment_vacancy_content_valid($1,false) v",
          [json(bad)],
        ),
      ).toBe(false);
      await expect(create(bad as VacancyContent)).rejects.toThrow(
        "valid vacancy content",
      );
    }
    expect((await workspace()).vacancies).toHaveLength(0);
    expect(
      await val("select count(*)::int v from public.recruitment_scopes"),
    ).toBe(0);
    for (const category of ["administrator", "support_staff"] as const)
      await create(content({ category, subjects: [], grades: [] }));
    expect((await workspace()).vacancies).toHaveLength(2);
  });
  it("permits partial drafts but rejects incomplete/expired submissions", async () => {
    const c = { ...emptyVacancyContent(), title: "Draft opportunity" };
    const x = await create(c);
    await expect(transition("vacancy_submit", x.vacancyId)).rejects.toThrow(
      "Complete all required",
    );
    const expired = await create(
      content({
        opensAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        closesAt: new Date(Date.now() - 86400000).toISOString(),
      }),
    );
    await expect(
      transition("vacancy_submit", expired.vacancyId),
    ).rejects.toThrow("future dates");
  });
  it("restricts creation to owners or scoped managers and requires explicit officer assignment", async () => {
    await consoleOn();
    await staff(manager, "manager");
    await staff(officer, "officer");
    await staff(unrelated, "officer");
    await expect(create(content(), null, manager)).rejects.toThrow(
      "authorized existing",
    );
    await expect(create(content(), null, officer)).rejects.toThrow(
      "cannot create",
    );
    const x = await create();
    await scoped(manager, x.scopeId);
    await scoped(officer, x.scopeId);
    const managerCreated = await create(
      content({ title: "Scoped manager role" }),
      x.scopeId,
      manager,
    );
    expect(managerCreated.scopeId).toBe(x.scopeId);
    await expect(workspace(officer, x.vacancyId)).rejects.toThrow(
      "authorized vacancy",
    );
    await change(
      "vacancy_assign",
      {
        vacancyId: x.vacancyId,
        expectedRevision: 0,
        userId: officer,
        enabled: true,
      },
      manager,
    );
    expect((await workspace(officer)).vacancies.map((v) => v.id)).toEqual([
      x.vacancyId,
    ]);
    expect((await workspace(unrelated)).vacancies).toEqual([]);
    const v = (await workspace(officer, x.vacancyId)).vacancies[0];
    await change(
      "vacancy_save",
      {
        vacancyId: x.vacancyId,
        expectedRevision: v.revision,
        content: content({ title: "Officer edited draft" }),
      },
      officer,
    );
    await transition("vacancy_submit", x.vacancyId, "", officer);
    for (const op of [
      "vacancy_approve",
      "vacancy_publish",
      "vacancy_close",
      "vacancy_return",
    ])
      await expect(
        transition(op, x.vacancyId, "Unauthorized attempt", officer),
      ).rejects.toThrow("owner permission");
  });
  it("requires owner approval/publication, keeps all snapshots immutable and returns submitted drafts for revision", async () => {
    const x = await create();
    await transition("vacancy_submit", x.vacancyId);
    await expect(transition("vacancy_publish", x.vacancyId)).rejects.toThrow(
      "owner-approved",
    );
    await transition(
      "vacancy_return",
      x.vacancyId,
      "Clarify the working schedule",
    );
    expect((await workspace()).vacancies[0].reviewState).toBe(
      "revision_requested",
    );
    await transition("vacancy_submit", x.vacancyId);
    await transition("vacancy_approve", x.vacancyId);
    await expect(
      db.exec(
        'update public.recruitment_vacancy_versions set content=content||\'{"title":"Forged"}\'::jsonb',
      ),
    ).rejects.toThrow("append-only");
    await expect(
      db.exec("delete from public.recruitment_vacancy_approvals"),
    ).rejects.toThrow("append-only");
    const approved = (await workspace()).vacancies[0];
    await expect(
      change("vacancy_save", {
        vacancyId: x.vacancyId,
        expectedRevision: approved.revision,
        content: content({ title: "Unreviewed edit" }),
      }),
    ).rejects.toThrow("revision");
    await transition("vacancy_publish", x.vacancyId);
    await expect(
      db.exec("delete from public.recruitment_vacancy_publications"),
    ).rejects.toThrow("append-only");
  });
  it("publishes only approved immutable content while an approved revision waits for owner republication", async () => {
    const x = await create();
    await publish(x.vacancyId);
    await togglePublic(true);
    const original = (await publicList()).vacancies[0];
    await transition("vacancy_revise", x.vacancyId);
    const v = (await workspace()).vacancies[0];
    await change("vacancy_save", {
      vacancyId: x.vacancyId,
      expectedRevision: v.revision,
      content: content({ title: "Revised approved title" }),
    });
    expect((await publicList()).vacancies[0]).toEqual(original);
    await expect(transition("vacancy_publish", x.vacancyId)).rejects.toThrow(
      "current owner-approved",
    );
    await transition("vacancy_submit", x.vacancyId);
    await transition("vacancy_approve", x.vacancyId);
    expect((await publicList()).vacancies[0]).toEqual(original);
    const generation = (await publicList()).generation;
    await transition("vacancy_publish", x.vacancyId);
    const current = await publicList();
    expect(current.generation).toBeGreaterThan(generation);
    expect(current.vacancies[0].content.title).toBe("Revised approved title");
    expect(current.vacancies[0].acceptingApplications).toBe(false);
    expect(
      await val(
        "select count(*)::int v from public.recruitment_vacancy_approvals",
      ),
    ).toBe(2);
    expect(
      await val(
        "select count(*)::int v from public.recruitment_vacancy_publications",
      ),
    ).toBe(2);
  });
  it("pauses, owner-republishes, closes and archives without reopening or accepting applications", async () => {
    const x = await create();
    await publish(x.vacancyId);
    await togglePublic(true);
    const slug = (await workspace()).vacancies[0].slug;
    expect((await publicList(slug)).vacancies).toHaveLength(1);
    await transition("vacancy_pause", x.vacancyId, "Pause recruitment");
    expect((await publicList()).vacancies).toEqual([]);
    await transition("vacancy_publish", x.vacancyId);
    expect((await publicList()).vacancies).toHaveLength(1);
    await transition("vacancy_close", x.vacancyId, "Position filled");
    expect((await publicList(slug)).vacancies).toEqual([]);
    await expect(transition("vacancy_publish", x.vacancyId)).rejects.toThrow(
      "cannot be reopened",
    );
    await transition(
      "vacancy_archive",
      x.vacancyId,
      "Retain historical vacancy",
    );
    expect((await workspace()).vacancies[0].status).toBe("archived");
  });
  it("invalidates publication visibility through generation and exposes no private staff/audit/working drafts", async () => {
    const draft = await create(
      content({ title: "Private draft unique phrase" }),
    );
    const live = await create();
    await publish(live.vacancyId);
    await togglePublic(true);
    const result = await publicList();
    expect(result.vacancies).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(draft.vacancyId);
    expect(JSON.stringify(result)).not.toContain("Private draft unique phrase");
    const publicFields = Object.keys(result.vacancies[0]).sort();
    expect(publicFields).toEqual(
      [
        "id",
        "reference",
        "slug",
        "content",
        "version",
        "publishedAt",
        "availability",
        "acceptingApplications",
      ].sort(),
    );
    expect(JSON.stringify(result)).not.toContain(owner);
    expect(JSON.stringify(result)).not.toContain("requestId");
    await togglePublic(false);
    const disabled = await publicList();
    expect(disabled.generation).toBeGreaterThan(result.generation);
    expect(disabled.vacancies).toEqual([]);
  });
  it("serializes competing mutations, replays identical requests once and rejects conflicting ID reuse", async () => {
    const x = await create();
    const initial = (await workspace()).vacancies[0];
    const first = await prepare("vacancy_save", {
      vacancyId: x.vacancyId,
      expectedRevision: initial.revision,
      content: content({ title: "First competing save" }),
    });
    const second = await prepare("vacancy_save", {
      vacancyId: x.vacancyId,
      expectedRevision: initial.revision,
      content: content({ title: "Second competing save" }),
    });
    const outcomes = await Promise.allSettled([
      execute(first),
      execute(second),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const winner = outcomes[0].status === "fulfilled" ? first : second;
    const replay = await execute(winner);
    expect(replay.saved).toBe(true);
    expect(
      await val(
        "select count(*)::int v from public.recruitment_events where request_id=$1",
        [winner.payload.requestId],
      ),
    ).toBe(1);
    await expect(
      execute({
        ...winner,
        payload: {
          ...winner.payload,
          content: content({ title: "Changed request" }),
        },
      }),
    ).rejects.toThrow("conflicts");
    expect((await workspace()).versions).toHaveLength(1); // list projects only current pointers
    expect((await workspace(owner, x.vacancyId)).versions).toHaveLength(2);
  });
  it("rechecks staff/scope revocation and owner AAL2 before replay", async () => {
    await consoleOn();
    await staff(manager, "manager");
    const x = await create();
    await scoped(manager, x.scopeId);
    const v = (await workspace()).vacancies[0];
    const prepared = await prepare(
      "vacancy_save",
      {
        vacancyId: x.vacancyId,
        expectedRevision: v.revision,
        content: content({ title: "Scoped edit" }),
      },
      manager,
    );
    await execute(prepared);
    await change("staff_grant", {
      userId: manager,
      role: "manager",
      enabled: false,
      expectedRevision: 0,
    });
    await expect(execute(prepared)).rejects.toThrow("permission");
    const ownerChange = await prepare("vacancy_settings", {
      expectedRevision: (await workspace()).settingsRevision,
      publicVacanciesEnabled: true,
    });
    await db.exec(
      "select public.recruitment_operate('require_owner_mfa','operator','MFA-APPROVAL','Authorized synthetic MFA enforcement')",
    );
    await expect(execute(ownerChange)).rejects.toThrow("AAL2");
  });
  it("keeps assignment revocation possible when the target becomes unverified or disabled", async () => {
    await consoleOn();
    await staff(officer, "officer");
    const x = await create();
    await scoped(officer, x.scopeId);
    await change("vacancy_assign", {
      vacancyId: x.vacancyId,
      expectedRevision: 0,
      userId: officer,
      enabled: true,
    });
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [officer],
    );
    await change("staff_grant", {
      userId: officer,
      role: "officer",
      enabled: false,
      expectedRevision: 0,
    });
    await change("vacancy_assign", {
      vacancyId: x.vacancyId,
      expectedRevision: 1,
      userId: officer,
      enabled: false,
    });
    expect((await workspace()).assignments[0].enabled).toBe(false);
  });
  it("bounds and filters authorized listings, paginates history, and prevents public direct table/RPC access", async () => {
    const first = await create();
    const admin = await create(
      content({
        title: "Administration coordinator",
        category: "administrator",
        subjects: [],
        grades: [],
      }),
    );
    const filtered = await workspace(
      owner,
      null,
      0,
      null,
      "coordinator",
      "draft",
      "administrator",
    );
    expect(filtered.total).toBe(1);
    expect(filtered.vacancies[0].id).toBe(admin.vacancyId);
    await expect(
      workspace(owner, null, 0, null, "", "invalid"),
    ).rejects.toThrow("valid vacancy/history page");
    const details = await workspace(owner, first.vacancyId);
    expect(details.versionsHasMore).toBe(false);
    expect(details.historyBefore).toBe(null);
    expect(
      await val(
        "select has_function_privilege('service_role','public.recruitment_vacancy_mutate(uuid,text,jsonb,text,text,text)','execute') v",
      ),
    ).toBe(false);
    expect(
      await val(
        "select has_function_privilege('anon','public.recruitment_public_vacancies(text,integer,text)','execute') v",
      ),
    ).toBe(false);
    expect(
      await val(
        "select count(*)::int v from pg_class c where c.relnamespace='public'::regnamespace and c.relname like 'recruitment_vacanc%' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'))",
      ),
    ).toBe(0);
    const before = (await workspace()).vacancies;
    await db.exec(migration);
    expect((await workspace()).vacancies).toEqual(before);
  });
  it("does not leak an unapproved initial title through the stable public URL", async () => {
    const draft = await create(
      content({ title: "Confidential replacement search" }),
    );
    await change("vacancy_save", {
      vacancyId: draft.vacancyId,
      expectedRevision: 0,
      content: content({ title: "Approved public opportunity" }),
    });
    await publish(draft.vacancyId);
    await togglePublic(true);
    const serialized = JSON.stringify(await publicList()).toLowerCase();
    expect(serialized).not.toContain("confidential");
    expect(serialized).not.toContain("replacement search");
    expect(serialized).toContain("approved public opportunity");
  });
  it("keeps the canonical migration identical in the fresh schema and reviewed upgrade bundle", () => {
    const block = readFileSync("supabase/schema.sql", "utf8")
      .split("-- BEGIN RECRUITMENT MILESTONE 2\n")[1]
      .split("-- END RECRUITMENT MILESTONE 2")[0];
    expect(block.trim()).toBe(migration.trim());
    expect(
      readFileSync("docs/recruitment/milestone-2/migration.sql", "utf8"),
    ).toContain(migration);
  });
  it("bounds content, paginates complete private/public listings and loads earlier immutable history without skipping versions", async () => {
    const oversized = content({
      summary: "x".repeat(4000),
      requiredExperience: "y".repeat(2000),
      scheduleDetails: "z".repeat(2000),
      responsibilities: Array.from(
        { length: 12 },
        (_, i) => `${i} ${"r".repeat(998)}`,
      ),
    });
    expect(
      await val("select public.recruitment_vacancy_content_valid($1,false) v", [
        json(oversized),
      ]),
    ).toBe(false);
    await expect(create(oversized)).rejects.toThrow("valid vacancy content");
    const first = await create();
    // Bulk synthetic records isolate pagination behavior from already-covered transition authorization.
    await db.query(
      "with seed as(select gen_random_uuid() id,gen_random_uuid() version_id,n from generate_series(1,50) n),inserted as(insert into public.recruitment_vacancies(id,reference,slug,scope_id,draft_version_id,created_by,updated_by) select id,'PAGE-'||n,'page-'||n,$1,version_id,$2,$2 from seed returning id,draft_version_id) insert into public.recruitment_vacancy_versions(id,vacancy_id,number,content,created_by) select draft_version_id,id,1,$3,$2 from inserted",
      [first.scopeId, owner, json(content())],
    );
    await create(
      content({
        title: "Administrator pagination fixture",
        category: "administrator",
        subjects: [],
        grades: [],
      }),
    );
    const page1 = await workspace(),
      page2 = await workspace(owner, null, page1.nextOffset!);
    expect(page1.total).toBe(52);
    expect(page1.vacancies).toHaveLength(50);
    expect(page1.nextOffset).toBe(50);
    expect(page2.vacancies).toHaveLength(2);
    expect(page2.nextOffset).toBe(null);
    expect(
      new Set([...page1.vacancies, ...page2.vacancies].map((v) => v.id)).size,
    ).toBe(52);
    for (let i = 0; i < 55; i++)
      await change("vacancy_save", {
        vacancyId: first.vacancyId,
        expectedRevision: i,
        content: content({ title: `History version ${i + 1}` }),
      });
    const newest = await workspace(owner, first.vacancyId),
      earlier = await workspace(
        owner,
        first.vacancyId,
        0,
        newest.historyBefore!,
      );
    expect(newest.versionsHasMore).toBe(true);
    expect(newest.historyBefore).toBe(7);
    expect(earlier.versionsHasMore).toBe(false);
    expect(earlier.historyBefore).toBe(null);
    expect(
      new Set([...newest.versions, ...earlier.versions].map((v) => v.number))
        .size,
    ).toBe(56);
    await db.query(
      "insert into public.recruitment_vacancy_approvals(vacancy_id,version_id,owner_id,request_id) select id,draft_version_id,$1,gen_random_uuid() from public.recruitment_vacancies",
      [owner],
    );
    await db.query(
      "update public.recruitment_vacancies set status='published',review_state='approved',approved_version_id=draft_version_id,published_version_id=draft_version_id,approved_by=$1,published_by=$1,approved_at=now(),published_at=now()",
      [owner],
    );
    await db.query(
      "insert into public.recruitment_vacancy_publications(vacancy_id,version_id,owner_id,request_id) select id,draft_version_id,$1,gen_random_uuid() from public.recruitment_vacancies",
      [owner],
    );
    await togglePublic(true);
    const pub1 = await val<PublicVacancyResponse>(
      "select public.recruitment_public_vacancies(null,0,'') v",
    );
    const pub2 = await val<PublicVacancyResponse>(
      "select public.recruitment_public_vacancies(null,$1,'') v",
      [pub1.nextOffset],
    );
    const pub3 = await val<PublicVacancyResponse>(
      "select public.recruitment_public_vacancies(null,$1,'') v",
      [pub2.nextOffset],
    );
    expect(pub1.total).toBe(52);
    expect(pub1.vacancies).toHaveLength(20);
    expect(pub2.vacancies).toHaveLength(20);
    expect(pub3.vacancies).toHaveLength(12);
    expect(pub3.nextOffset).toBe(null);
    expect(
      new Set(
        [...pub1.vacancies, ...pub2.vacancies, ...pub3.vacancies].map(
          (v) => v.id,
        ),
      ).size,
    ).toBe(52);
    const filtered = await val<PublicVacancyResponse>(
      "select public.recruitment_public_vacancies(null,0,'administrator') v",
    );
    expect(filtered.total).toBe(1);
    expect(filtered.vacancies).toHaveLength(1);
    expect(
      (await workspace(owner, first.vacancyId)).events.every(
        (e) => !Object.hasOwn(e.details.choices as object, "content"),
      ),
    ).toBe(true);
  }, 20000);
  it("upgrades populated M1 without changing tutor identities, owner authority or accounting ledger rows", async () => {
    const upgrade = new PGlite();
    try {
      await upgrade.exec(
        "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create schema storage;create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
      );
      await upgrade.exec(
        readFileSync("supabase/schema.sql", "utf8")
          .split("-- BEGIN RECRUITMENT MILESTONE 2")[0]
          .replace('create extension if not exists "pgcrypto";', ""),
      );
      await upgrade.query(
        "insert into auth.users values($1,'upgrade@example.test',now())",
        [owner],
      );
      await upgrade.query(
        "insert into public.admin_users(user_id,finance_role) values($1,'owner')",
        [owner],
      );
      await upgrade.query(
        "select public.recruitment_bootstrap($1,'test-operator','UPGRADE-APPROVAL','Authorized populated M1 upgrade fixture')",
        [owner],
      );
      await upgrade.query("select set_config('viva.teaching_actor',$1,false)", [
        owner,
      ]);
      await upgrade.query(
        "insert into public.teaching_tutors(name,email,user_id) values('Preserved synthetic tutor','upgrade@example.test',$1)",
        [owner],
      );
      await upgrade.query(
        'select public.accounting_post($1,\'m2-synthetic-opening\',public.tuition_today(),\'Synthetic opening capital\',\'manual\',null,\'[{"account":"1000","cents":10000},{"account":"3000","cents":-10000}]\')',
        [owner],
      );
      const capture = async () => ({
        tutors: (
          await upgrade.query(
            "select * from public.teaching_tutors order by id",
          )
        ).rows,
        bindings: (
          await upgrade.query(
            "select * from public.recruitment_tutor_bindings order by tutor_id",
          )
        ).rows,
        staff: (
          await upgrade.query(
            "select * from public.recruitment_staff order by user_id",
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
      await upgrade.exec(migration);
      expect(await capture()).toEqual(before);
      expect(
        (
          await upgrade.query<{ n: number }>(
            "select count(*)::int n from public.recruitment_vacancies",
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await upgrade.query<{ public_vacancies_enabled: boolean }>(
            "select public_vacancies_enabled from public.recruitment_settings",
          )
        ).rows[0].public_vacancies_enabled,
      ).toBe(false);
    } finally {
      await upgrade.close();
    }
  }, 30000);
});
