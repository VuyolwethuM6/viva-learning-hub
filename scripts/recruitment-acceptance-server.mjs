// LOCAL ACCEPTANCE FIXTURE ONLY. Never imported by application/production routes.
// Runs real migrations and real Node APIs against an in-memory PostgreSQL test fixture.
// The synthetic Auth adapter exists only here; the deployed application uses unified Supabase Auth.
if (
  process.env.VIVA_RECRUITMENT_LOCAL_ACCEPTANCE !== "1" ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV === "production"
) {
  throw new Error(
    "Local acceptance only: set VIVA_RECRUITMENT_LOCAL_ACCEPTANCE=1 outside a hosted/production runtime.",
  );
}
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { createServer as httpServer } from "node:http";
import { resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(resolve(root, "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const { createServer } = require("vite");
process.env.SUPABASE_URL = "https://synthetic.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-only-m2";
process.env.VERCEL_ENV = "development";
process.env.NODE_ENV = "development";
const ids = {
  owner: "11111111-1111-4111-8111-111111111111",
  manager: "33333333-3333-4333-8333-333333333333",
  officer: "44444444-4444-4444-8444-444444444444",
};
const db = new PGlite();
await db.exec(
  "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create schema storage;create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
);
await db.exec(
  readFileSync(root + "/supabase/schema.sql", "utf8").replace(
    'create extension if not exists "pgcrypto";',
    "",
  ),
);
if (
  !(await db.query("select to_regclass('public.recruitment_vacancies') v"))
    .rows[0].v
)
  throw new Error("M2 schema not integrated yet; refuse old foundation test.");
for (const [name, id] of Object.entries(ids))
  await db.query("insert into auth.users values($1,$2,now())", [
    id,
    name + "@example.test",
  ]);
await db.query(
  "select public.recruitment_bootstrap($1,'browser-test-operator','M2-SYNTHETIC-APPROVAL','Isolated browser acceptance owner setup')",
  [ids.owner],
);
async function change(operation, input, actor = ids.owner) {
  const data = { requestId: randomUUID(), ...input };
  const proof = randomUUID().replaceAll("-", "").repeat(2);
  await db.query("select public.recruitment_issue_challenge($1,$2,$3,$4,$5)", [
    actor,
    "a".repeat(64),
    operation,
    JSON.stringify(data),
    proof,
  ]);
  return (
    await db.query("select public.recruitment_mutate($1,$2,$3,$4,$5) v", [
      actor,
      operation,
      JSON.stringify(data),
      "a".repeat(64),
      proof,
    ])
  ).rows[0].v;
}
for (const role of ["manager", "officer"])
  await change("staff_grant", {
    userId: ids[role],
    role,
    enabled: true,
    expectedRevision: -1,
  });
await change("settings", {
  expectedRevision: 1,
  staffConsoleEnabled: true,
  accessGuardsEnabled: true,
  privacyPolicyVersion: "synthetic-browser-m2",
});
const commonScope = await change("scope_create", {
  kind: "vacancy",
  label: "Synthetic scoped recruitment",
});
for (const role of ["manager", "officer"])
  await change("scope_grant", {
    userId: ids[role],
    scopeId: commonScope.scopeId,
    enabled: true,
    expectedRevision: -1,
  });
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
const sessions = new Map();
function issue(who) {
  const access = who + "-" + randomUUID(),
    refresh = who + "-refresh-" + randomUUID();
  sessions.set(access, who);
  sessions.set(refresh, who);
  return { access_token: access, refresh_token: refresh, expires_in: 3600 };
}
const rpcNames = new Set([
  "recruitment_context",
  "recruitment_snapshot",
  "recruitment_rate_limit",
  "recruitment_issue_challenge",
  "recruitment_mutate",
  "recruitment_recover_request",
  "recruitment_vacancy_workspace",
  "recruitment_public_vacancies",
]);
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== "https://synthetic.supabase.test")
    throw Error("Unexpected external network operation blocked");
  const body = JSON.parse(String(init?.body || "{}"));
  const bearer = (
    new Headers(init?.headers).get("authorization") || ""
  ).replace(/^Bearer /, "");
  if (url.pathname === "/auth/v1/user") {
    const who = sessions.get(bearer);
    return who
      ? json({
          id: ids[who],
          email: who + "@example.test",
          email_confirmed_at: "2026-11-01",
          factors: [],
        })
      : json({}, 401);
  }
  if (url.pathname === "/auth/v1/token") {
    const refresh = url.searchParams.get("grant_type") === "refresh_token";
    const who = refresh
      ? sessions.get(body.refresh_token)
      : String(body.email || "").split("@")[0];
    if (!ids[who] || (!refresh && body.password !== "synthetic-password"))
      return json({}, 401);
    return json(issue(who));
  }
  if (url.pathname === "/auth/v1/logout") {
    sessions.delete(bearer);
    return json({});
  }
  const name = url.pathname.split("/").pop();
  if (!url.pathname.startsWith("/rest/v1/rpc/") || !rpcNames.has(name))
    throw Error("Unexpected RPC blocked: " + name);
  try {
    const entries = Object.entries(body);
    const r = await db.query(
      `select public.${name}(${entries.map(([k], i) => `${k}=>$${i + 1}`).join(",")}) v`,
      entries.map(([, v]) =>
        v !== null && typeof v === "object" ? JSON.stringify(v) : v,
      ),
    );
    return json(r.rows[0].v);
  } catch (e) {
    return json({ code: "P0001", message: e.message }, 409);
  }
};
const vite = await createServer({
  root,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const { default: recruitment } = await vite.ssrLoadModule(
  "/api/recruitment.ts",
);
const { default: careers } = await vite.ssrLoadModule("/api/recruitment.ts");
const server = httpServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/admin/recruitment"))
      return recruitment(req, res);
    if (req.url.startsWith("/api/careers")) return careers(req, res);
    if (req.url.startsWith("/api/")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(
        '{"error":"No other API exists in this isolated harness"}',
      );
    }
    if (req.url === "/__test/reset-auth-limits") {
      await db.exec("truncate public.recruitment_auth_limits");
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end('{"reset":true}');
    }
    if (req.url === "/__test/state") {
      const counts = (
        await db.query(
          "select action,count(*)::int n from public.recruitment_events group by action",
        )
      ).rows;
      const vacancies = (
        await db.query("select * from public.recruitment_vacancies")
      ).rows;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          counts,
          vacancies,
          ids,
          commonScope: commonScope.scopeId,
        }),
      );
    }
    if (req.url.startsWith("/__test/assign/")) {
      const id = req.url.split("/").pop(),
        v = (
          await db.query(
            "select scope_id,revision from public.recruitment_vacancies where id=$1",
            [id],
          )
        ).rows[0];
      if (!v) throw Error("Unknown synthetic vacancy");
      for (const who of ["manager", "officer"]) {
        const old = (
          await db.query(
            "select revision from public.recruitment_staff_scopes where user_id=$1 and scope_id=$2",
            [ids[who], v.scope_id],
          )
        ).rows[0];
        await change("scope_grant", {
          userId: ids[who],
          scopeId: v.scope_id,
          enabled: true,
          expectedRevision: old?.revision ?? -1,
        });
      }
      const current = (
        await db.query(
          "select revision from public.recruitment_vacancies where id=$1",
          [id],
        )
      ).rows[0];
      await change("vacancy_assign", {
        vacancyId: id,
        expectedRevision: current.revision,
        userId: ids.officer,
        enabled: true,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end('{"assigned":true}');
    }
    const path = new URL(req.url, "http://localhost").pathname;
    let file = resolve(root + "/dist", "." + decodeURIComponent(path));
    if (!file.startsWith(root + "/dist/")) file = root + "/dist/index.html";
    if (!extname(file) || !existsSync(file)) file = root + "/dist/index.html";
    const mime =
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".json": "application/json",
      }[extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(readFileSync(file));
  } catch (e) {
    console.error("Synthetic harness failure:", e.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});
server.listen(8095, "127.0.0.1", () =>
  console.log(
    "LOCAL TEST FIXTURE: http://127.0.0.1:8095 — synthetic owner@example.test / synthetic-password; all data resets on restart. No external requests allowed.",
  ),
);
process.on("SIGINT", async () => {
  server.close();
  await vite.close();
  await db.close();
  process.exit(0);
});
