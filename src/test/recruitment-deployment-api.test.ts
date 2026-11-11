// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../api/_lib/http";
import handler from "../../api/recruitment";
import { fixture, owner, manager, officer } from "./helpers/recruitment-m3";
let f: Awaited<ReturnType<typeof fixture>>;
let verified = true;
const calls: string[] = [];
const identities: Record<string, string> = { owner, manager, officer };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
async function call(
  query = "",
  identity = "owner",
  method = "GET",
  path = "/api/admin/recruitment",
  cookie?: string,
) {
  const req = Object.assign(Readable.from([]), {
    url: path + "?route=deployment" + query,
    method,
    headers: {
      cookie: cookie ?? `viva_recruitment=${identity}`,
      origin: "http://localhost",
      host: "localhost",
      "content-type": "application/json",
    },
  }) as ApiRequest;
  const r = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    body: "",
    setHeader(key: string, value: unknown) {
      this.headers[key] = value;
    },
    end(value: unknown) {
      this.body = String(value);
    },
  };
  await handler(req, r as unknown as ServerResponse);
  return r;
}
beforeAll(async () => {
  f = await fixture();
  for (const [id, role] of [
    [manager, "manager"],
    [officer, "officer"],
  ])
    await f.change("staff_grant", {
      userId: id,
      role,
      enabled: true,
      expectedRevision: -1,
    });
  vi.stubEnv("SUPABASE_URL", "https://synthetic.supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "DO-NOT-EXPOSE-SERVICE-SECRET");
  vi.stubEnv("RECRUITMENT_SCANNER_KEY", "DO-NOT-EXPOSE-SCANNER-SECRET");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const u = new URL(String(input));
      if (u.pathname === "/auth/v1/user") {
        const who =
          new Headers(init?.headers)
            .get("authorization")
            ?.replace("Bearer ", "") || "";
        return identities[who]
          ? json({
              id: identities[who],
              email: `${who}@example.test`,
              email_confirmed_at: verified ? "2026-11-01" : null,
            })
          : json({}, 401);
      }
      if (u.pathname.startsWith("/rest/v1/rpc/")) {
        const name = u.pathname.split("/").pop()!;
        calls.push(name);
        try {
          return json(
            await f.rpc(name, JSON.parse(String(init?.body || "{}"))),
          );
        } catch (e) {
          return json({ code: "P0001", message: (e as Error).message }, 400);
        }
      }
      throw Error("Unexpected external service");
    }),
  );
}, 30000);
beforeEach(() => {
  verified = true;
  calls.length = 0;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await f.db.close();
});

it("requires a recruitment session and rejects general Admin cookies", async () => {
  expect((await call("", "invalid")).statusCode).toBe(401);
  expect(
    (await call("&document=01-install-m1-through-m3.sql", "")).statusCode,
  ).toBe(401);
  expect(calls).toEqual([]);
});
it.each(["manager", "officer"])(
  "denies %s inventory, source and downloads",
  async (who) => {
    for (const query of [
      "",
      "&document=01-install-m1-through-m3.sql",
      "&document=01-install-m1-through-m3.sql&download=1",
    ])
      expect((await call(query, who)).statusCode).toBe(403);
    expect(calls.every((name) => name === "recruitment_context")).toBe(true);
  },
);
it("denies unverified owners and currently revoked staff", async () => {
  verified = false;
  expect((await call()).statusCode).toBe(401);
  verified = true;
  await f.change("staff_grant", {
    userId: officer,
    role: "officer",
    enabled: false,
    expectedRevision: 0,
  });
  expect((await call("", "officer")).statusCode).toBe(403);
});
it("exposes safe status, eleven migrations and filenames without secrets or private records", async () => {
  const r = await call();
  expect(r.statusCode).toBe(200);
  const data = JSON.parse(r.body);
  expect(data.migrations).toHaveLength(11);
  expect(
    data.environment.find(
      (item: { name: string }) => item.name === "RECRUITMENT_SCANNER_KEY",
    ).present,
  ).toBe(true);
  expect(r.body).not.toMatch(
    /DO-NOT-EXPOSE|owner@example|operator_reference|staff:|email_confirmed_at/,
  );
  expect(data.flags.vacancy_intake_enabled).toBe(false);
  expect(data.databaseVerification).toContain("Run the post-installation SQL");
  expect(r.headers["Cache-Control"]).toBe("no-store");
  expect(r.headers["X-Robots-Tag"]).toBe("noindex, nofollow");
  expect(
    calls.every((name) =>
      ["recruitment_context", "recruitment_snapshot"].includes(name),
    ),
  ).toBe(true);
});
it("serves full exact SQL and authenticated attachments with SHA-256", async () => {
  const source = readFileSync(
    "docs/recruitment/production-installation/01-install-m1-through-m3.sql",
    "utf8",
  );
  const data = JSON.parse(
    (await call("&document=01-install-m1-through-m3.sql")).body,
  );
  expect(data.content).toBe(source);
  expect(data.sha256).toBe(createHash("sha256").update(source).digest("hex"));
  const download = await call(
    "&document=01-install-m1-through-m3.sql&download=1",
  );
  expect(download.body).toBe(source);
  expect(download.headers["Content-Disposition"]).toBe(
    'attachment; filename="01-install-m1-through-m3.sql"',
  );
  expect(download.headers["X-Content-Type-Options"]).toBe("nosniff");
});
it.each([
  "../../.env",
  "%2Fetc%2Fpasswd",
  "manifest.json",
  "supabase/schema.sql",
  "operations/private.log",
])("rejects nonallowlisted path %s", async (path) => {
  expect((await call("&document=" + encodeURIComponent(path))).statusCode).toBe(
    404,
  );
});
it("offers no write or execution method", async () => {
  expect((await call("", "owner", "POST")).statusCode).toBe(405);
  expect((await call("", "owner", "DELETE")).statusCode).toBe(405);
  expect((await call("", "owner", "PUT")).statusCode).toBe(405);
  expect(calls.every((name) => name === "recruitment_context")).toBe(true);
});
it("preserves owner-only SQL access through the physical function rewrite", async () => {
  const query =
    "&__viva_recruitment=staff&document=01-install-m1-through-m3.sql";
  expect(
    (await call(query, "owner", "GET", "/api/recruitment")).statusCode,
  ).toBe(200);
  for (const role of ["manager", "officer"])
    expect(
      (await call(query, role, "GET", "/api/recruitment")).statusCode,
    ).toBe(403);
  expect(
    (
      await call(
        query,
        "",
        "GET",
        "/api/recruitment",
        "viva_admin=owner; viva_recruitment_applicant=owner",
      )
    ).statusCode,
  ).toBe(401);
});
it("serves every listed template and guide through the exact allowlist", async () => {
  const inventory = JSON.parse((await call()).body);
  for (const document of inventory.documents) {
    const result = await call("&document=" + encodeURIComponent(document.path));
    expect(result.statusCode, document.path).toBe(200);
    const data = JSON.parse(result.body);
    expect(createHash("sha256").update(data.content).digest("hex")).toBe(
      data.sha256,
    );
  }
});
