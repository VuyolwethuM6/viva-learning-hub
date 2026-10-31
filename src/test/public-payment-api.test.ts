// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import subject from "../../api/subject-request";
import checkout from "../../api/payfast/checkout";
import notify from "../../api/payfast/notify";
import adminAPI from "../../api/admin/accounting";
import { payfastSignature } from "../../api/_lib/payfast-protocol";
import type { ApiRequest } from "../../api/_lib/http";
let db: PGlite;
const actor = "11111111-1111-4111-8111-111111111111",
  viewer = "33333333-3333-4333-8333-333333333333";
let deliveries: { body: { to: string[]; html: string }; headers: Headers }[],
  mode: "accepted" | "uncertain" | "rejected" | "badValidation",
  authorized = actor;
const customer = {
  material: "Analytical Geometry Practice",
  firstName: "Test",
  lastName: "Buyer",
  email: "buyer@example.test",
  phone: "0712345678",
};
function req(
  body: unknown,
  parsed = true,
  path = "/api/payfast/checkout",
  form = false,
  headers: Record<string, string> = {},
) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return Object.assign(Readable.from(parsed ? [] : [raw]), {
    method: "POST",
    url: path,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      cookie: "viva_admin=test",
      "content-type": form
        ? "application/x-www-form-urlencoded"
        : "application/json",
      ...headers,
    },
    ...(parsed ? { body } : {}),
  }) as ApiRequest;
}
function res() {
  const r = {
    statusCode: 0,
    headers: {} as Record<string, unknown>,
    body: "",
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end(v: string) {
      this.body = String(v);
    },
  };
  return r as unknown as ServerResponse & typeof r;
}
async function val<T = unknown>(sql: string, args: unknown[] = []): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
async function start() {
  const r = res();
  await checkout(req({ ...customer, requestId: randomUUID() }), r);
  expect(r.statusCode).toBe(200);
  return JSON.parse(r.body).fields.m_payment_id as string;
}
function notification(
  order: string | null,
  extra: Record<string, string> = {},
) {
  const fields: Record<string, string> = {
    merchant_id: "audit-merchant",
    ...(order ? { m_payment_id: order } : {}),
    item_name: customer.material,
    amount_gross: "299.00",
    amount_fee: "-9.00",
    amount_net: "290.00",
    payment_status: "COMPLETE",
    pf_payment_id: "PAY-123",
    email_address: customer.email,
    name_first: customer.firstName,
    name_last: customer.lastName,
    cell_number: customer.phone,
    ...extra,
  };
  return { ...fields, signature: payfastSignature(fields) };
}
async function itn(fields: Record<string, string>, parsed = false) {
  const r = res();
  await notify(
    req(
      parsed ? fields : new URLSearchParams(fields).toString(),
      parsed,
      "/api/payfast/notify",
      true,
    ),
    r,
  );
  return r;
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
    "insert into auth.users values($1,'owner@example.test',now()),($2,'viewer@example.test',now())",
    [actor, viewer],
  );
  await db.query(
    "insert into public.admin_users(user_id,finance_role) values($1,'owner'),($2,'viewer')",
    [actor, viewer],
  );
}, 30000);
beforeEach(async () => {
  deliveries = [];
  mode = "accepted";
  authorized = actor;
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");
  vi.stubEnv("PUBLIC_SITE_URL", "https://example.test");
  vi.stubEnv("PAYFAST_MODE", "live");
  vi.stubEnv("PAYFAST_MERCHANT_ID", "audit-merchant");
  vi.stubEnv("PAYFAST_MERCHANT_KEY", "synthetic-key");
  vi.stubEnv("PAYFAST_PASSPHRASE", "synthetic-passphrase");
  vi.stubEnv("RESEND_API_KEY", "synthetic-email");
  vi.stubEnv("EMAIL_FROM", "Viva <sender@example.test>");
  vi.stubEnv("ADMIN_EMAIL", "admin@example.test");
  await db.exec(
    "truncate public.accounting_requests,public.payfast_orders,public.accounting_journals cascade;update public.payfast_settings set actor_id=null;update public.accounting_settings set books_start='2026-01-01',closed_through=null",
  );
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const path = String(url);
    if (path.endsWith("/auth/v1/user"))
      return new Response(
        JSON.stringify({ id: authorized, email: "owner@example.test" }),
      );
    if (path.includes("/rest/v1/admin_users?"))
      return new Response(JSON.stringify([{ user_id: authorized }]));
    if (path.includes("/rest/v1/rpc/")) {
      const fn = path.split("/").pop()!;
      if (!/^[a-z_]+$/.test(fn)) throw Error("Unexpected RPC");
      const p = Object.entries(JSON.parse(String(init?.body)));
      try {
        const result = await db.query<{ v: unknown }>(
          `select public.${fn}(${p.map(([k], i) => `${k}=>$${i + 1}`).join(",")}) v`,
          p.map(([, v]) =>
            v && typeof v === "object" ? JSON.stringify(v) : v,
          ),
        );
        return new Response(JSON.stringify(result.rows[0]?.v ?? null));
      } catch (e) {
        return new Response(
          JSON.stringify({ code: "P0001", message: (e as Error).message }),
          { status: 409 },
        );
      }
    }
    if (
      [
        "https://www.payfast.co.za/eng/query/validate",
        "https://sandbox.payfast.co.za/eng/query/validate",
      ].includes(path)
    )
      return new Response(mode === "badValidation" ? "INVALID" : "VALID");
    if (path === "https://api.resend.com/emails") {
      const body = JSON.parse(String(init?.body));
      deliveries.push({ body, headers: new Headers(init?.headers) });
      if (body.to.includes("buyer@example.test") && mode === "uncertain")
        throw new Error("Synthetic connection loss after provider acceptance");
      if (mode === "rejected") return new Response("{}", { status: 422 });
      return new Response(
        JSON.stringify({ id: "provider-" + deliveries.length }),
      );
    }
    throw Error("Unexpected real request blocked: " + path);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await db?.close();
});
describe("public runtime parsing and durable PDF purchases", () => {
  it.each([true, false])(
    "accepts subject JSON with parsed=%s",
    async (parsed) => {
      const r = res();
      await subject(
        req(
          { email: "test@example.test", subject: "Mathematics" },
          parsed,
          "/api/subject-request",
        ),
        r,
      );
      expect(r.statusCode).toBe(200);
      expect(deliveries).toHaveLength(1);
    },
  );
  it.each([true, false])(
    "accepts checkout JSON with parsed=%s and retains one signed order on retry",
    async (parsed) => {
      const body = { ...customer, requestId: randomUUID() };
      const a = res(),
        b = res();
      await checkout(req(body, parsed), a);
      await checkout(req(body, parsed), b);
      expect(a.statusCode).toBe(200);
      expect(JSON.parse(a.body).fields).toEqual(JSON.parse(b.body).fields);
      expect(
        await val("select count(*)::int v from public.payfast_orders"),
      ).toBe(1);
      expect(deliveries).toHaveLength(0);
    },
  );
  it.each([true, false])(
    "enforces size limits for parsed=%s before provider/DB side effects",
    async (parsed) => {
      const r = res();
      await subject(
        req(
          {
            name: "Test",
            email: "x@example.test",
            subject: "Test",
            message: "x".repeat(17000),
          },
          parsed,
        ),
        r,
      );
      expect(r.statusCode).toBe(413);
      expect(deliveries).toHaveLength(0);
    },
  );
  it("rejects malformed JSON, structured/repeated notification fields and wrong content types", async () => {
    let r = res();
    await subject(req("{broken", false), r);
    expect(r.statusCode).toBe(400);
    r = res();
    await notify(
      req({ signature: ["a", "b"] }, true, "/api/payfast/notify", true),
      r,
    );
    expect(r.statusCode).toBe(400);
    r = res();
    await notify(
      req("signature=a&signature=b", false, "/api/payfast/notify", true),
      r,
    );
    expect(r.statusCode).toBe(400);
    r = res();
    await notify(req({}), r);
    expect(r.statusCode).toBe(415);
  });
  it.each([true, false])(
    "validates and fulfills a real ledger-backed notification with parsed=%s",
    async (parsed) => {
      const order = await start();
      const r = await itn(notification(order), parsed);
      expect(r.statusCode).toBe(200);
      expect(deliveries).toHaveLength(2);
      expect(deliveries[0].body.to).toEqual(["buyer@example.test"]);
      expect(deliveries[0].body.html).toContain("Payment Received");
      expect(deliveries[0].headers.get("Idempotency-Key")).toMatch(
        /^viva-pdf-/,
      );
      expect(
        await val("select count(*)::int v from public.payfast_payments"),
      ).toBe(1);
    },
  );
  it("deduplicates concurrent callbacks and remains safe when the handler module is reloaded", async () => {
    const order = await start(),
      fields = notification(order);
    const results = await Promise.all([itn(fields), itn(fields)]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(deliveries).toHaveLength(2);
    vi.resetModules();
    const fresh = (await import("../../api/payfast/notify")).default;
    const r = res();
    await fresh(
      req(
        new URLSearchParams(fields).toString(),
        false,
        "/api/payfast/notify",
        true,
      ),
      r,
    );
    expect(r.statusCode).toBe(200);
    expect(deliveries).toHaveLength(2);
  });
  it("retains uncertain provider acceptance without automatically re-sending or claiming delivery", async () => {
    const order = await start();
    mode = "uncertain";
    expect((await itn(notification(order))).statusCode).toBe(200);
    expect(
      await val(
        "select state v from public.payfast_deliveries where kind='customer'",
      ),
    ).toBe("uncertain");
    mode = "accepted";
    await itn(notification(order));
    expect(
      deliveries.filter((d) => d.body.to.includes("buyer@example.test")),
    ).toHaveLength(1);
    expect(
      await val(
        "select state v from public.payfast_deliveries where kind='admin'",
      ),
    ).toBe("accepted");
  });
  it("retains explicit provider rejections for owner review rather than retrying on every callback", async () => {
    const order = await start();
    mode = "rejected";
    await itn(notification(order));
    await itn(notification(order));
    expect(deliveries).toHaveLength(2);
    expect(
      await val(
        "select count(*)::int v from public.payfast_deliveries where state='failed'",
      ),
    ).toBe(2);
  });
  it("stores legacy notifications for review without blind email duplication or automatic back-posting", async () => {
    const r = await itn(notification(null));
    expect(r.statusCode).toBe(200);
    expect(deliveries).toHaveLength(0);
    expect(
      await val("select count(*)::int v from public.payfast_payments"),
    ).toBe(1);
    expect(
      await val("select journal_id v from public.payfast_payments"),
    ).toBeNull();
  });
  it("rejects forged signatures, wrong amounts, unknown orders and failed provider validation before fulfillment", async () => {
    const order = await start();
    expect(
      (await itn({ ...notification(order), signature: "0".repeat(32) }))
        .statusCode,
    ).toBe(400);
    expect(
      (await itn(notification(order, { amount_gross: "299.001" }))).statusCode,
    ).toBe(400);
    expect((await itn(notification(randomUUID()))).statusCode).toBe(409);
    mode = "badValidation";
    expect((await itn(notification(order))).statusCode).toBe(400);
    expect(deliveries).toHaveLength(0);
    expect(
      await val("select count(*)::int v from public.payfast_payments"),
    ).toBe(0);
  });
  it("keeps a confirmed payment pending when email configuration is unavailable", async () => {
    const order = await start();
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await itn(notification(order))).statusCode).toBe(200);
    expect(
      await val("select count(*)::int v from public.payfast_payments"),
    ).toBe(1);
    expect(
      await val(
        "select count(*)::int v from public.payfast_deliveries where state='pending'",
      ),
    ).toBe(2);
    expect(deliveries).toHaveLength(0);
  });
  it("supports deliberate sandbox checkout and fails closed for live production without its security passphrase", async () => {
    vi.stubEnv("PAYFAST_MODE", "sandbox");
    let r = res();
    await checkout(req({ ...customer, requestId: randomUUID() }), r);
    expect(JSON.parse(r.body).endpoint).toBe(
      "https://sandbox.payfast.co.za/eng/process",
    );
    vi.stubEnv("PAYFAST_MODE", "live");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYFAST_PASSPHRASE", "");
    r = res();
    await checkout(req({ ...customer, requestId: randomUUID() }), r);
    expect(r.statusCode).toBe(503);
    expect(deliveries).toHaveLength(0);
  });
  it("uses sandbox verification with sandbox checkout and prevents new checkouts without delivery configuration", async () => {
    vi.stubEnv("PAYFAST_MODE", "sandbox");
    const order = await start();
    expect((await itn(notification(order))).statusCode).toBe(200);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url]) =>
            String(url) === "https://sandbox.payfast.co.za/eng/query/validate",
        ),
    ).toBe(true);
    vi.stubEnv("RESEND_API_KEY", "");
    const r = res();
    await checkout(req({ ...customer, requestId: randomUUID() }), r);
    expect(r.statusCode).toBe(503);
    expect(await val("select count(*)::int v from public.payfast_orders")).toBe(
      1,
    );
  });
  it("protects owner actions with same-origin and server-side role checks", async () => {
    let r = res();
    await adminAPI(
      req(
        {
          action: "payfast_authorize",
          requestId: randomUUID(),
          reason: "Authorize verified sales",
        },
        true,
        "/api/admin/accounting",
        false,
        { origin: "https://evil.example" },
      ),
      r,
    );
    expect(r.statusCode).toBe(403);
    authorized = viewer;
    r = res();
    await adminAPI(
      req(
        {
          action: "payfast_authorize",
          requestId: randomUUID(),
          reason: "Unauthorized attempted change",
        },
        true,
        "/api/admin/accounting",
      ),
      r,
    );
    expect(r.statusCode).toBe(409);
    expect(
      await val("select actor_id v from public.payfast_settings"),
    ).toBeNull();
  });
});
