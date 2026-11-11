// ISOLATED SYNTHETIC ACCEPTANCE ONLY. No provider, Storage or Auth network traffic.
if (
  process.env.VIVA_RECRUITMENT_LOCAL_ACCEPTANCE !== "1" ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV === "production"
)
  throw Error("Isolated local acceptance opt-in required");
import { createServer as httpServer } from "node:http";
import { randomUUID, createHmac } from "node:crypto";
import { createServer } from "vite";
process.env.SUPABASE_URL = "https://synthetic.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-only";
process.env.RECRUITMENT_PUBLIC_ORIGIN = "http://localhost:4183";
for (const name of ["RECRUITMENT_HMAC_KEYS", "RECRUITMENT_MAIL_KEYS"])
  process.env[name] = JSON.stringify({
    current: 1,
    keys: { 1: Buffer.alloc(32, 7).toString("base64") },
  });
process.env.RECRUITMENT_ABUSE_KEY = Buffer.alloc(32, 8).toString("base64");
process.env.RECRUITMENT_WORKER_KEY = "synthetic-worker-key".repeat(3);
process.env.RECRUITMENT_SCANNER_URL = "https://scanner.test";
process.env.RECRUITMENT_SCANNER_KEY = "synthetic-scanner-key".repeat(3);
process.env.RESEND_API_KEY = "synthetic-only";
process.env.EMAIL_FROM = "synthetic@example.test";
const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  }),
  { fixture, owner, manager, officer } = await vite.ssrLoadModule(
    "/src/test/helpers/recruitment-m3.ts",
  ),
  f = await fixture();
await f.enable();
const vacancy = await f.vacancy();
const objects = new Map(),
  sessions = new Map(),
  sent = [];
const ids = { owner, manager, officer };
function issue(who) {
  const access_token = who + "-" + randomUUID(),
    refresh_token = who + "-" + randomUUID();
  sessions.set(access_token, who);
  sessions.set(refresh_token, who);
  return { access_token, refresh_token, expires_in: 3600 };
}
for (const [who, id] of Object.entries(ids))
  if (who !== "owner") {
    await f.change("staff_grant", {
      userId: id,
      role: who,
      enabled: true,
      expectedRevision: -1,
    });
    await f.change("scope_grant", {
      userId: id,
      scopeId: vacancy.scope_id,
      enabled: true,
      expectedRevision: -1,
    });
  }
const json = (v, status = 200) => new Response(JSON.stringify(v), { status });
globalThis.fetch = async (input, init) => {
  const u = new URL(String(input)),
    h = new Headers(init?.headers),
    body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  if (u.origin === "https://synthetic.supabase.test") {
    if (u.pathname === "/auth/v1/user") {
      const who = sessions.get(
        (h.get("authorization") || "").replace("Bearer ", ""),
      );
      return who
        ? json({
            id: ids[who],
            email: who + "@example.test",
            email_confirmed_at: "2026-11-01",
            factors: [],
          })
        : json({}, 401);
    }
    if (u.pathname === "/auth/v1/token") {
      const who =
        u.searchParams.get("grant_type") === "refresh_token"
          ? sessions.get(body.refresh_token)
          : String(body.email || "").split("@")[0];
      return ids[who] &&
        (body.refresh_token || body.password === "synthetic-password")
        ? json(issue(who))
        : json({}, 401);
    }
    if (u.pathname === "/auth/v1/logout") {
      sessions.delete((h.get("authorization") || "").replace("Bearer ", ""));
      return json({});
    }
    if (u.pathname.startsWith("/rest/v1/rpc/")) {
      const name = u.pathname.split("/").pop();
      if (!/^recruitment_[a-z_]+$/.test(name)) throw Error("Unexpected RPC");
      try {
        return json(await f.rpc(name, body));
      } catch (e) {
        return json({ code: e.code || "P0001", message: e.message }, 400);
      }
    }
    if (u.pathname.startsWith("/storage/v1/object/list/")) {
      const bucket = u.pathname.split("/").pop();
      return json(
        [...objects.keys()]
          .filter((k) => k.startsWith(bucket + "/" + body.prefix + "/"))
          .map((k) => ({ name: k.split("/").at(-1), id: randomUUID() })),
      );
    }
    if (u.pathname.startsWith("/storage/v1/object/")) {
      const path = u.pathname.slice("/storage/v1/object/".length);
      if (init?.method === "POST") {
        if (objects.has(path)) return json({}, 409);
        objects.set(path, Buffer.from(init.body));
        return json({});
      }
      if (init?.method === "DELETE") {
        for (const p of body.prefixes) objects.delete(path + "/" + p);
        return json({});
      }
      return objects.has(path)
        ? new Response(new Uint8Array(objects.get(path)))
        : json({}, 404);
    }
  }
  if (u.origin === "https://scanner.test") {
    const { sha256 } = await vite.ssrLoadModule(
        "/api/_lib/recruitment-intake.ts",
      ),
      bytes = init?.body ? Buffer.from(init.body) : null;
    const data = bytes
      ? {
          verdict: "clean",
          checksum: sha256(bytes),
          size: bytes.length,
          engine: "protocol-fixture",
          definitions: "synthetic-only",
          definitionDate: new Date().toISOString(),
          policy: "pdf-v1",
          jobId: h.get("x-scan-job"),
          generation: h.get("x-scan-generation"),
          nonce: h.get("x-scan-nonce"),
          timestamp: Date.now(),
        }
      : {
          policy: "pdf-v1",
          engine: "protocol-fixture",
          definitionDate: new Date().toISOString(),
          nonce: h.get("x-scan-nonce"),
        };
    const text = JSON.stringify(data);
    return new Response(text, {
      headers: {
        "x-scan-signature": createHmac(
          "sha256",
          process.env.RECRUITMENT_SCANNER_KEY,
        )
          .update(text)
          .digest("hex"),
      },
    });
  }
  if (u.origin === "https://api.resend.com") {
    sent.push(body);
    return json({ id: "synthetic-message" });
  }
  throw Error("Live network blocked");
};
const { default: applicant } = await vite.ssrLoadModule("/api/recruitment.ts"),
  { default: admin } = await vite.ssrLoadModule("/api/admin/recruitment.ts"),
  { default: careers } = await vite.ssrLoadModule("/api/careers.ts");
const server = httpServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/recruitment")) return applicant(req, res);
    if (req.url.startsWith("/api/admin/recruitment")) return admin(req, res);
    if (req.url.startsWith("/api/careers")) return careers(req, res);
    if (req.url === "/__synthetic/link") {
      const row = (
        await f.db.query(
          "select envelope from public.recruitment_email_outbox where template='verify' and envelope is not null order by created_at desc limit 1",
        )
      ).rows[0];
      const { unseal } = await vite.ssrLoadModule(
        "/api/_lib/recruitment-intake.ts",
      );
      const e = row ? unseal(row.envelope) : null;
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          link: e
            ? `/recruitment/verify#intent=${e.intent}&proof=${e.proof}`
            : null,
          slug: vacancy.slug,
        }),
      );
    }
    if (req.url === "/__synthetic/scan") {
      const { recruitmentScan } = await vite.ssrLoadModule(
        "/api/_lib/recruitment-worker.ts",
      );
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(await recruitmentScan()));
    }
    if (req.url.startsWith("/api/")) {
      res.writeHead(404);
      return res.end();
    }
    vite.middlewares(req, res, async () => {
      const { readFileSync } = await import("node:fs");
      const html = await vite.transformIndexHtml(
        req.url,
        readFileSync("index.html", "utf8"),
      );
      res.setHeader("Content-Type", "text/html");
      res.end(html);
    });
  } catch {
    res.writeHead(500);
    res.end("Synthetic acceptance failure");
  }
});
server.listen(4183, "127.0.0.1", () =>
  console.log(
    "Synthetic M3 acceptance at http://localhost:4183; no live services",
  ),
);
process.on("SIGINT", async () => {
  server.close();
  await vite.close();
  await f.db.close();
  process.exit(0);
});
