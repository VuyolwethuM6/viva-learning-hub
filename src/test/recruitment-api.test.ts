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
import handler from "../../api/recruitment";
import admin from "../../api/admin/records";
import portal from "../../api/admin/session";
import type { ApiRequest } from "../../api/_lib/http";
let db: PGlite;
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
    "insert into auth.users values($1,'owner@example.test',now()),($2,'manager@example.test',now())",
    [owner, manager],
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
  await db.exec(
    "truncate public.recruitment_vacancy_publications,public.recruitment_vacancy_approvals,public.recruitment_vacancy_assignments,public.recruitment_vacancy_versions,public.recruitment_vacancies,public.recruitment_tutor_rebind_authorizations,public.recruitment_tutor_bindings,public.recruitment_operational_events,public.recruitment_events,public.recruitment_requests,public.recruitment_reauth_challenges,public.recruitment_staff_scopes,public.recruitment_scopes,public.recruitment_staff,public.recruitment_access_approvals,public.recruitment_auth_limits cascade;update public.recruitment_settings set bootstrapped_at=null,revision=0,staff_console_enabled=false,access_guards_enabled=false,access_guards_mandatory=false,owner_aal2_required=false;",
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
              : null;
      return id
        ? json({
            id,
            email: id === owner ? "owner@example.test" : "manager@example.test",
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
describe("recruitment API with real isolated SQL and synthetic Auth", () => {
  it("accepts only recruitment cookies and enforces separation in both directions", async () => {
    expect((await call("snapshot", undefined, "")).statusCode).toBe(401);
    expect(
      (
        await call("snapshot", undefined, "", "GET", {
          cookie: "viva_admin=owner-session; viva_tutor=owner-session",
        })
      ).statusCode,
    ).toBe(401);
    for (const endpoint of [admin, portal]) {
      const r = response();
      await endpoint(request("snapshot", undefined, "owner-session"), r);
      expect(r.statusCode).toBe(401);
    }
    expect((await call("snapshot")).statusCode).toBe(200);
  });
  it("issues only dedicated HttpOnly Secure scoped cookies and no admin membership", async () => {
    const r = await call(
      "session",
      { email: "owner@example.test", password: "test-password" },
      "",
    );
    expect(r.statusCode).toBe(200);
    const cookies = r.headers["Set-Cookie"] as string[];
    expect(cookies).toHaveLength(2);
    expect(
      cookies.every((x) =>
        x.includes(
          "Path=/api/admin/recruitment; HttpOnly; SameSite=Strict; Secure",
        ),
      ),
    ).toBe(true);
    expect(cookies.some((x) => x.startsWith("viva_admin="))).toBe(false);
    expect((await db.query("select * from public.admin_users")).rows).toEqual(
      [],
    );
  });
  it("persists an action-bound proof and concurrent retries perform one audited change", async () => {
    const payload = {
      operation: "scope_create",
      data: {
        requestId: randomUUID(),
        kind: "vacancy",
        label: "Synthetic scope",
      },
    };
    const auth = await call("reauthenticate", {
      ...payload,
      password: "test-password",
    });
    expect(auth.statusCode).toBe(200);
    const proof = JSON.parse(auth.body).proof;
    expect(
      (
        await call(
          "mutate",
          {
            ...payload,
            data: { ...payload.data, label: "tampered" },
            proof,
          },
          "owner-fresh",
        )
      ).statusCode,
    ).toBe(409);
    const both = await Promise.all([
      call("mutate", { ...payload, proof }, "owner-fresh"),
      call("mutate", { ...payload, proof }, "owner-fresh"),
    ]);
    expect(both.map((x) => x.statusCode)).toEqual([200, 200]);
    expect(both[0].body).toBe(both[1].body);
    const rows = (
      await db.query("select payload from public.recruitment_requests")
    ).rows;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("test-password");
    expect(
      requests
        .filter((x) => x.path.includes("/rpc/"))
        .every((x) => !JSON.stringify(x.body).includes("test-password")),
    ).toBe(true);
  });
  it("denies managers until rollout; later permits a scoped view without owner powers", async () => {
    await change("staff_grant", {
      userId: manager,
      role: "manager",
      enabled: true,
      expectedRevision: -1,
    });
    expect(
      (
        await call(
          "session",
          { email: "manager@example.test", password: "test-password" },
          "",
        )
      ).statusCode,
    ).toBe(403);
    await change("settings", {
      expectedRevision: 1,
      staffConsoleEnabled: true,
      accessGuardsEnabled: true,
      privacyPolicyVersion: "test-v1",
    });
    const s = await call("snapshot", undefined, "manager-session");
    expect(s.statusCode).toBe(200);
    expect(JSON.parse(s.body).events).toEqual([]);
    const denied = await call(
      "reauthenticate",
      {
        operation: "staff_grant",
        data: {
          requestId: randomUUID(),
          userId: owner,
          role: "officer",
          enabled: true,
          expectedRevision: 0,
        },
        password: "test-password",
      },
      "manager-session",
    );
    expect(denied.statusCode).toBe(403);
  });
  it("rejects unknown actions, future activation flags, forged fields, bad origins and oversized requests", async () => {
    expect((await call("bootstrap", {})).statusCode).toBe(404);
    expect(
      (
        await call("mutate", {
          operation: "activate",
          data: { requestId: randomUUID() },
          proof: "a".repeat(64),
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call("reauthenticate", {
          operation: "settings",
          data: {
            requestId: randomUUID(),
            expectedRevision: 1,
            staffConsoleEnabled: false,
            accessGuardsEnabled: false,
            privacyPolicyVersion: "",
            activation: true,
          },
          password: "test-password",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(
          "session",
          { email: "owner@example.test", password: "test-password" },
          "",
          undefined,
          { origin: "https://attacker.test" },
        )
      ).statusCode,
    ).toBe(403);
    expect((await call("mutate", { junk: "x".repeat(9000) })).statusCode).toBe(
      413,
    );
  });
  it("does not issue a proof after wrong-password reauthentication and rate limits repeated login attempts", async () => {
    const payload = {
      operation: "scope_create",
      data: { requestId: randomUUID(), kind: "vacancy", label: "Test" },
      password: "wrong",
    };
    expect((await call("reauthenticate", payload)).statusCode).toBe(401);
    expect(
      (await db.query("select * from public.recruitment_reauth_challenges"))
        .rows,
    ).toHaveLength(0);
    let status = 0;
    for (let i = 0; i < 9; i++)
      status = (
        await call(
          "session",
          { email: "unknown@example.test", password: "wrong" },
          "",
        )
      ).statusCode;
    expect(status).toBe(429);
  });
  it("refreshes only recruitment sessions and clears only recruitment cookies on logout", async () => {
    const r = await call("session", { action: "refresh" }, "", undefined, {
      cookie: "viva_recruitment_refresh=owner-refresh; viva_admin=other",
    });
    expect(r.statusCode).toBe(200);
    const out = await call("session", undefined, "owner-session", "DELETE");
    expect(out.statusCode).toBe(200);
    expect(
      (out.headers["Set-Cookie"] as string[]).every(
        (x) => x.startsWith("viva_recruitment") && x.includes("Max-Age=0"),
      ),
    ).toBe(true);
  });
  it("rotates password-confirmed sessions and binds proofs to the replacement cookie", async () => {
    const payload = {
      operation: "scope_create",
      data: {
        requestId: randomUUID(),
        kind: "vacancy",
        label: "Rotated session",
      },
      password: "test-password",
    };
    const proof = await call("reauthenticate", payload);
    expect(proof.statusCode).toBe(200);
    expect((proof.headers["Set-Cookie"] as string[])[0]).toContain(
      "viva_recruitment=owner-fresh;",
    );
    const mutation = {
      operation: payload.operation,
      data: payload.data,
      proof: JSON.parse(proof.body).proof,
    };
    expect((await call("mutate", mutation, "owner-session")).statusCode).toBe(
      409,
    );
    expect((await call("mutate", mutation, "owner-fresh")).statusCode).toBe(
      200,
    );
    expect(requests.some((r) => r.path === "/auth/v1/logout")).toBe(true);
  });
  it("requires real provider-validated AAL2 for owner writes when enabled and supports Supabase TOTP step-up", async () => {
    await db.exec(
      "select public.recruitment_operate('require_owner_mfa','operator-A','MFA-TEST','Isolated owner MFA acceptance setup')",
    );
    const payload = {
      operation: "scope_create",
      data: { requestId: randomUUID(), kind: "vacancy", label: "MFA secured" },
      password: "test-password",
    };
    expect((await call("reauthenticate", payload)).statusCode).toBe(403);
    expect(
      (await call("reauthenticate", { ...payload, factorId, code: "000000" }))
        .statusCode,
    ).toBe(401);
    expect(
      (await db.query("select * from public.recruitment_reauth_challenges"))
        .rows,
    ).toHaveLength(0);
    const result = await call("reauthenticate", {
      ...payload,
      factorId,
      code: "123456",
    });
    expect(result.statusCode).toBe(200);
    expect((result.headers["Set-Cookie"] as string[])[0]).toContain(
      `viva_recruitment=${aal2Token};`,
    );
    const body = {
      operation: payload.operation,
      data: payload.data,
      proof: JSON.parse(result.body).proof,
    };
    expect((await call("mutate", body, "owner-fresh")).statusCode).toBe(409);
    expect((await call("mutate", body, aal2Token)).statusCode).toBe(200);
    const state = await call("snapshot", undefined, aal2Token);
    expect(JSON.parse(state.body).user.aal).toBe("aal2");
    // Changing JWT claims is useless without provider validation of the exact token.
    const forged = aal2Token.slice(0, -1) + "x";
    expect((await call("snapshot", undefined, forged)).statusCode).toBe(401);
    expect(
      JSON.stringify(
        (await db.query("select payload from public.recruitment_requests"))
          .rows,
      ),
    ).not.toContain("123456");
  });
  it("takes assurance from refreshed provider tokens and logs out only the recruitment session", async () => {
    const refreshed = await call(
      "session",
      { action: "refresh" },
      "",
      undefined,
      {
        cookie:
          "viva_recruitment_refresh=owner-mfa-refresh; viva_admin=separate",
      },
    );
    expect(refreshed.statusCode).toBe(200);
    expect(JSON.parse(refreshed.body).user.aal).toBe("aal2");
    const downgraded = await call(
      "session",
      { action: "refresh" },
      "",
      undefined,
      { cookie: "viva_recruitment_refresh=owner-refresh" },
    );
    expect(JSON.parse(downgraded.body).user.aal).toBe("aal1");
    const out = await call("session", undefined, aal2Token, "DELETE");
    expect(out.statusCode).toBe(200);
    expect(
      (out.headers["Set-Cookie"] as string[]).every(
        (v) => v.startsWith("viva_recruitment") && v.includes("Max-Age=0"),
      ),
    ).toBe(true);
  });
  it("recovers by UUID only, denies unrelated actors and marks application errors without marking uncertain failures", async () => {
    const payload = {
      operation: "scope_create",
      data: { requestId: randomUUID(), kind: "vacancy", label: "Restorable" },
      password: "test-password",
    };
    await call("reauthenticate", payload);
    const restored = await call(
      "recover&requestId=" + payload.data.requestId,
      undefined,
      "owner-fresh",
    );
    expect(restored.statusCode).toBe(200);
    expect(JSON.parse(restored.body)).toMatchObject({
      data: payload.data,
      completed: false,
    });
    const denied = await call(
      "recover&requestId=" + payload.data.requestId,
      undefined,
      "manager-session",
    );
    expect(denied.statusCode).toBe(403);
    expect(denied.headers["X-Recruitment-Error"]).toBe("confirmed");
    expect(denied.body).not.toContain("Restorable");
    vi.mocked(fetch).mockRejectedValueOnce(
      new Error("Synthetic gateway failure"),
    );
    const unavailable = await call("snapshot");
    expect(unavailable.statusCode).toBe(502);
    expect(unavailable.headers["X-Recruitment-Error"]).toBeUndefined();
  });
});
