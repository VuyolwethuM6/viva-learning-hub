// @vitest-environment node
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/admin/accounting";
import type { ApiRequest } from "../../api/_lib/http";
const actor = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function req(
  method = "GET",
  body?: object,
  url = "/api/admin/accounting",
  headers: Record<string, string> = {},
) {
  return Object.assign(Readable.from([]), {
    method,
    body,
    url,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      cookie: "viva_admin=test-token",
      "content-type": "application/json",
      ...headers,
    },
  }) as ApiRequest;
}
function res() {
  const out = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    body: undefined as unknown,
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end(v: unknown) {
      this.body = v;
    },
  };
  return out as unknown as ServerResponse & typeof out;
}
const mutation = {
  action: "receipt",
  requestId: id,
  applicationId: id,
  amountCents: 10000,
  paidOn: "2026-10-27",
  method: "Cash",
  reference: "CASH-001",
  note: "Cash was counted and verified",
  allocations: [],
};
function upstream() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user"))
        return json({ id: actor, email: "admin@example.test" });
      if (url.includes("/admin_users?")) return json([{ user_id: actor }]);
      if (url.endsWith("/accounting_mutate")) return json({ receiptId: id });
      if (url.endsWith("/accounting_snapshot"))
        return json({ accounts: [], journals: [], reports: {}, limits: {} });
      throw new Error("Unexpected upstream operation " + url);
    });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service");
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("accounting API authorization and financial boundaries", () => {
  it("denies signed-out access before reading accounting records", async () => {
    const fetch = upstream(),
      out = res();
    await handler(req("GET", undefined, undefined, { cookie: "" }), out);
    expect(out.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects cross-origin financial writes", async () => {
    const fetch = upstream(),
      out = res();
    await handler(
      req("POST", mutation, undefined, { origin: "https://attacker.example" }),
      out,
    );
    expect(out.statusCode).toBe(403);
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).endsWith("accounting_mutate"),
      ),
    ).toBe(false);
  });
  it("uses the authenticated actor and requires stable request IDs and integer cents", async () => {
    const fetch = upstream(),
      out = res();
    await handler(req("POST", { ...mutation, actor: "spoofed" }), out);
    expect(out.statusCode).toBe(200);
    const call = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("accounting_mutate"),
    );
    expect(JSON.parse(String(call?.[1]?.body)).p_actor).toBe(actor);
    for (const body of [
      { ...mutation, amountCents: 0.5 },
      { ...mutation, requestId: undefined },
    ]) {
      const invalid = res();
      await handler(req("POST", body), invalid);
      expect(invalid.statusCode).toBe(400);
    }
  });
  it("reparses bank CSV and computes its own fingerprint instead of trusting client rows", async () => {
    const fetch = upstream(),
      out = res();
    await handler(
      req("POST", {
        action: "bank_import",
        requestId: id,
        fromDate: "2026-10-01",
        toDate: "2026-10-27",
        openingCents: 0,
        closingCents: 500,
        name: "statement.csv",
        rows: [{ amountCents: 999999 }],
        fingerprint: "attacker",
        csv: "transaction_id,date,description,amount\nBANK-001,2026-10-27,Deposit,5.00\n",
      }),
      out,
    );
    expect(out.statusCode).toBe(200);
    const call = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("accounting_mutate"),
    );
    const data = JSON.parse(String(call?.[1]?.body)).p_data;
    expect(data.rows[0].amountCents).toBe(500);
    expect(data.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(data.csv).toBeUndefined();
  });
  it("rejects invalid scheduler authorization before any upstream request", async () => {
    const fetch = upstream(),
      out = res();
    await handler(
      req("GET", undefined, "/api/admin/accounting?task=scheduled", {
        cookie: "",
        authorization: "Bearer wrong",
      }),
      out,
    );
    expect(out.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps scheduled work disabled until an owner configures it", async () => {
    const fetch = upstream();
    fetch.mockResolvedValue(json({ enabled: false }));
    const out = res();
    await handler(
      req("GET", undefined, "/api/admin/accounting?task=scheduled", {
        cookie: "",
        authorization: "Bearer test-cron-secret",
      }),
      out,
    );
    expect(out.statusCode).toBe(200);
    expect(JSON.parse(String(out.body))).toEqual({ disabled: true });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("refuses scheduled finance work when its configured actor is no longer an enabled owner", async () => {
    const fetch = upstream();
    fetch.mockResolvedValue(json({ enabled: true, actor, validActor: false }));
    const out = res();
    await handler(
      req("GET", undefined, "/api/admin/accounting?task=scheduled", {
        cookie: "",
        authorization: "Bearer test-cron-secret",
      }),
      out,
    );
    expect(out.statusCode).toBe(503);
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).endsWith("accounting_run_schedule"),
      ),
    ).toBe(false);
  });
});
