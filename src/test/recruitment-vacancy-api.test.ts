// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import handler from "../../api/admin/recruitment";
import { emptyVacancyContent } from "@/lib/recruitment-vacancies";

import type { ApiRequest } from "../../api/_lib/http";
let db: PGlite;
const officer = "44444444-4444-4444-8444-444444444444";
const owner = "11111111-1111-4111-8111-111111111111",
  manager = "33333333-3333-4333-8333-333333333333";
const factorId = "77777777-7777-4777-8777-777777777777";
let aal2Token: string;
let requests: { path: string; body: Record<string, unknown> }[];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function request(
  route = "snapshot",
  body?: object,
  token = "owner-session",
  method?: string,
  extra: Record<string, string> = {},
) {
  return Object.assign(Readable.from([]), {
    method: method || (body ? "POST" : "GET"),
    url: "/api/admin/recruitment?route=" + route,
    body,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
      cookie: token ? "viva_recruitment=" + token : "",
      ...extra,
    },
  }) as ApiRequest;
}
function response() {
  const r = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    body: "",
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end(v: unknown) {
      this.body = String(v);
    },
  };
  return r as unknown as ServerResponse & typeof r;
}
async function call(
  route: string,
  body?: object,
  token = "owner-session",
  method?: string,
  extra: Record<string, string> = {},
) {
  const r = response();
  await handler(request(route, body, token, method, extra), r);
  return r;
}
async function change(operation: string, data: object) {
  const payload = { operation, data: { requestId: randomUUID(), ...data } };
  const proof = await call("reauthenticate", {
    ...payload,
    password: "test-password",
  });
  expect(proof.statusCode).toBe(200);
  const r = await call(
    "mutate",
    {
      ...payload,
      proof: JSON.parse(proof.body).proof,
    },
    "owner-fresh",
  );
  expect(r.statusCode).toBe(200);
  return JSON.parse(r.body).result;
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
  await db.query(
    "insert into auth.users values($1,'owner@example.test',now()),($2,'manager@example.test',now()),($3,'officer@example.test',now())",
    [owner, manager, officer],
  );
}, 30000);
beforeEach(async () => {
  requests = [];
  aal2Token =
    "eyJhbGciOiJIUzI1NiJ9." +
    Buffer.from(
      JSON.stringify({
        sub: owner,
        aal: "aal2",
        session_id: randomUUID(),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url") +
    ".synthetic-signature";
  vi.stubEnv("SUPABASE_URL", "https://synthetic.supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-key");
  vi.stubEnv("VERCEL_ENV", "preview");
  const tables = (
    await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname='public' and tablename like 'recruitment_%' and tablename<>'recruitment_settings'",
    )
  ).rows;
  await db.exec(
    "truncate " +
      tables.map((t) => 'public."' + t.tablename + '"').join(",") +
      ";update public.recruitment_settings set bootstrapped_at=null,revision=0,staff_console_enabled=false,access_guards_enabled=false,access_guards_mandatory=false,owner_aal2_required=false,public_vacancies_enabled=false;",
  );
  await db.query(
    "select public.recruitment_bootstrap($1,'test-operator','TEST-APPROVAL-1','Authorized synthetic owner setup')",
    [owner],
  );
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const body = JSON.parse(String(init?.body || "{}"));
    requests.push({ path: url.pathname, body });
    if (url.origin !== "https://synthetic.supabase.test")
      throw Error("Real network blocked");
    if (url.pathname === "/auth/v1/user") {
      const token = new Headers(init?.headers).get("authorization") || "";
      const id =
        token === "Bearer " + aal2Token
          ? owner
          : token.includes("owner-")
            ? owner
            : token.includes("manager-")
              ? manager
              : token.includes("officer-")
                ? officer
                : null;
      return id
        ? json({
            id,
            email:
              id === owner
                ? "owner@example.test"
                : id === manager
                  ? "manager@example.test"
                  : "officer@example.test",
            email_confirmed_at: "2026-11-01",
            factors: [
              {
                id: factorId,
                factor_type: "totp",
                status: "verified",
                friendly_name: "Synthetic authenticator",
              },
            ],
          })
        : json({}, 401);
    }
    if (url.pathname === "/auth/v1/token") {
      if (url.searchParams.get("grant_type") === "refresh_token")
        return body.refresh_token === "owner-mfa-refresh"
          ? json({
              access_token: aal2Token,
              refresh_token: "owner-mfa-refresh",
              expires_in: 3600,
            })
          : body.refresh_token === "owner-refresh"
            ? json({
                access_token: "owner-session",
                refresh_token: "owner-refresh",
                expires_in: 3600,
              })
            : json({}, 401);
      if (body.password !== "test-password") return json({}, 400);
      const who =
        body.email === "owner@example.test"
          ? "owner"
          : body.email === "manager@example.test"
            ? "manager"
            : body.email === "officer@example.test"
              ? "officer"
              : null;
      return who
        ? json({
            access_token: who + "-fresh",
            refresh_token: who + "-refresh",
            expires_in: 3600,
          })
        : json({}, 400);
    }
    if (url.pathname === `/auth/v1/factors/${factorId}/challenge`)
      return json({ id: "88888888-8888-4888-8888-888888888888" });
    if (url.pathname === `/auth/v1/factors/${factorId}/verify`)
      return body.code === "123456"
        ? json({
            access_token: aal2Token,
            refresh_token: "owner-mfa-refresh",
            expires_in: 3600,
          })
        : json({}, 400);
    if (url.pathname === "/auth/v1/logout") return json({});
    const name = url.pathname.split("/").pop()!;
    if (
      url.pathname.startsWith("/rest/v1/rpc/") &&
      [
        "recruitment_context",
        "recruitment_snapshot",
        "recruitment_rate_limit",
        "recruitment_issue_challenge",
        "recruitment_mutate",
        "recruitment_recover_request",
        "recruitment_vacancy_workspace",
        "recruitment_public_vacancies",
      ].includes(name)
    ) {
      const entries = Object.entries(body);
      const args = entries.map(([, v]) =>
        v !== null && typeof v === "object" ? JSON.stringify(v) : v,
      );
      try {
        const result = await db.query<{ v: unknown }>(
          `select public.${name}(${entries.map(([k], i) => `${k}=>$${i + 1}`).join(",")}) v`,
          args,
        );
        return json(result.rows[0].v);
      } catch (error) {
        return json({ code: "P0001", message: (error as Error).message }, 409);
      }
    }
    throw Error("Unexpected external operation blocked: " + url.pathname);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await db?.close();
});
const content = () => ({
  ...emptyVacancyContent(),
  title: "Senior mathematics tutor",
  department: "Teaching",
  location: "Cape Town",
  summary: "Support learners with focused mathematics teaching.",
  responsibilities: ["Prepare and teach lessons"],
  minimumRequirements: ["Relevant qualification"],
  requiredExperience: "Experience supporting learners",
  skills: ["Communication"],
  subjects: ["Mathematics"],
  grades: ["10"],
  scheduleDetails: "Two afternoons per week",
  opensAt: new Date(Date.now() - 3600000).toISOString(),
  closesAt: new Date(Date.now() + 86400000 * 30).toISOString(),
});
async function create() {
  return change("vacancy_create", { scopeId: null, content: content() });
}
async function transition(
  operation: string,
  vacancyId: string,
  expectedRevision: number,
  reason = "",
) {
  return change(operation, { vacancyId, expectedRevision, reason });
}
async function staffFixtures() {
  await db.query(
    "insert into public.recruitment_staff(user_id,role,enabled,granted_by) values($1,'manager',true,$3),($2,'officer',true,$3)",
    [manager, officer, owner],
  );
  await db.exec(
    "update public.recruitment_settings set staff_console_enabled=true,access_guards_enabled=true",
  );
}
describe("vacancy API with real isolated SQL and synthetic Auth", () => {
  it("validates a draft, atomically creates vacancy/scope and returns a private authorized workspace", async () => {
    const rejected = await call("reauthenticate", {
      operation: "vacancy_create",
      data: {
        requestId: randomUUID(),
        scopeId: null,
        content: { ...content(), engagementType: "part_time" },
      },
      password: "test-password",
    });
    expect(rejected.statusCode).toBe(400);
    const created = await create();
    expect(created.saved).toBe(true);
    expect(created.vacancyId).toBeTruthy();
    const response = await call("vacancies");
    expect(response.statusCode).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    const workspace = JSON.parse(response.body);
    expect(workspace.vacancies).toHaveLength(1);
    expect(workspace.versions[0].content.title).toBe(content().title);
    expect(
      workspace.events.some(
        (e: { action: string }) => e.action === "owner_bootstrap",
      ),
    ).toBe(false);
    const scope = (
      await db.query(
        "select s.kind from public.recruitment_scopes s join public.recruitment_vacancies v on v.scope_id=s.id where v.id=$1",
        [created.vacancyId],
      )
    ).rows[0];
    expect(scope).toMatchObject({ kind: "vacancy" });
  });
  it("does not grant a manager/officer or a broad Admin session access to unrelated vacancies", async () => {
    await create();
    await staffFixtures();
    const unassigned = await call("vacancies", undefined, "manager-session");
    expect(unassigned.statusCode).toBe(200);
    expect(JSON.parse(unassigned.body).vacancies).toEqual([]);
    expect(
      (
        await call("vacancies", undefined, "", "GET", {
          cookie: "viva_admin=owner-session",
        })
      ).statusCode,
    ).toBe(401);
    const denied = await call(
      "reauthenticate",
      {
        operation: "vacancy_publish",
        data: {
          requestId: randomUUID(),
          vacancyId: randomUUID(),
          expectedRevision: 0,
          reason: "",
        },
        password: "test-password",
      },
      "officer-session",
    );
    expect(denied.statusCode).toBe(403);
    expect((await call("vacancies&offset=-1")).statusCode).toBe(400);
    expect((await call("vacancies&category=finance_owner")).statusCode).toBe(
      400,
    );
  });
  it("publishes only after owner approval and keeps unapproved revision content off the public projection", async () => {
    const { vacancyId } = await create();
    await transition("vacancy_submit", vacancyId, 0);
    await transition("vacancy_approve", vacancyId, 1);
    await transition("vacancy_publish", vacancyId, 2);
    await change("vacancy_settings", {
      expectedRevision: 1,
      publicVacanciesEnabled: true,
    });
    await transition("vacancy_revise", vacancyId, 3);
    await change("vacancy_save", {
      vacancyId,
      expectedRevision: 4,
      content: { ...content(), title: "Private working revision" },
    });
    const projection = (
      await db.query<{ v: unknown }>(
        "select public.recruitment_public_vacancies() v",
      )
    ).rows[0].v;
    expect(JSON.stringify(projection)).toContain("Senior mathematics tutor");
    expect(JSON.stringify(projection)).not.toContain(
      "Private working revision",
    );
    const workspace = JSON.parse((await call("vacancies")).body);
    expect(workspace.vacancies[0].status).toBe("published");
    expect(
      workspace.versions.some(
        (v: { content: { title: string } }) =>
          v.content.title === "Private working revision",
      ),
    ).toBe(true);
  });
  it("replays a response-lost create exactly once and recovers only the original actor's server-held choices", async () => {
    const payload = {
      operation: "vacancy_create",
      data: { requestId: randomUUID(), scopeId: null, content: content() },
      password: "test-password",
    };
    const proof = JSON.parse(
      (await call("reauthenticate", payload)).body,
    ).proof;
    const data = { operation: payload.operation, data: payload.data, proof };
    const responses = await Promise.all([
      call("mutate", data, "owner-fresh"),
      call("mutate", data, "owner-fresh"),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(responses[0].body).toBe(responses[1].body);
    expect(
      (await db.query("select * from public.recruitment_vacancies")).rows,
    ).toHaveLength(1);
    const recover = await call(
      "recover&requestId=" + payload.data.requestId,
      undefined,
      "owner-fresh",
    );
    expect(recover.statusCode).toBe(200);
    expect(JSON.parse(recover.body)).toMatchObject({
      completed: true,
      data: payload.data,
    });
    expect(
      JSON.stringify(
        (await db.query("select payload from public.recruitment_requests"))
          .rows,
      ),
    ).not.toContain("test-password");
  });
  it("refuses activation, upload and applicant operations while retaining strict old request bounds", async () => {
    expect(
      (
        await call("reauthenticate", {
          operation: "vacancy_activate",
          data: { requestId: randomUUID() },
          password: "test-password",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call("mutate", {
          operation: "upload",
          data: { requestId: randomUUID() },
        })
      ).statusCode,
    ).toBe(400);
    expect((await call("mutate", { junk: "x".repeat(9000) })).statusCode).toBe(
      413,
    );
    expect(
      (await call("mutate", { junk: "x".repeat(140000) })).statusCode,
    ).toBe(413);
    const s = JSON.parse((await call("snapshot")).body);
    expect(s.features.activation).toBe(false);
    expect(s.features.applications).toBe(false);
    expect(s.features.uploads).toBe(false);
  });
});
