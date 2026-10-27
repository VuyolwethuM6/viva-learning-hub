// @vitest-environment node
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import records from "../../api/admin/records";
import session from "../../api/admin/session";
import messages from "../../api/admin/messages";
import type { ApiRequest } from "../../api/_lib/http";
const actor = "11111111-1111-4111-8111-111111111111";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function req(
  method: string,
  body?: object,
  headers: Record<string, string> = {},
) {
  return Object.assign(Readable.from([]), {
    method,
    body,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
      cookie: "viva_admin=access-token",
      ...headers,
    },
  }) as ApiRequest;
}
function res() {
  const response = {
    statusCode: 0,
    headers: {} as Record<string, unknown>,
    body: "",
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end(v: string) {
      this.body = v;
    },
  };
  return response as unknown as ServerResponse & typeof response;
}
function authorizedFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user"))
      return json({ id: actor, email: "admin@example.test" });
    if (url.includes("/rest/v1/admin_users?"))
      return json([{ user_id: actor }]);
    if (url.endsWith("/rest/v1/rpc/admin_snapshot"))
      return json({ applications: [], invoices: [] });
    if (url.endsWith("/rest/v1/rpc/admin_mutate")) return json({});
    if (url.endsWith("/rest/v1/rpc/accounting_write_ready")) return json(null);
    throw new Error("Unexpected external operation");
  });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("admin API authorization and boundaries", () => {
  it("cancels a notification using the verified actor without requiring or calling an email provider", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetch = authorizedFetch();
    const original = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (input, init) =>
      String(input).endsWith("admin_cancel_message")
        ? json({ cancelled: true })
        : original(input),
    );
    const response = res();
    await messages(
      req("POST", {
        action: "cancel",
        id: actor,
        actor: "spoofed",
        reason: "No longer needed after contacting the family",
        providerReviewed: false,
      }),
      response,
    );
    expect(response.statusCode).toBe(200);
    const call = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("admin_cancel_message"),
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      p_actor: actor,
      p_id: actor,
      p_reason: "No longer needed after contacting the family",
      p_provider_reviewed: false,
    });
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes("resend.com")),
    ).toBe(false);
  });
  it("denies cross-origin notification cancellation before calling the database function", async () => {
    const fetch = authorizedFetch(),
      response = res();
    await messages(
      req(
        "POST",
        {
          action: "cancel",
          id: actor,
          reason: "Not needed",
          providerReviewed: false,
        },
        { origin: "https://attacker.example" },
      ),
      response,
    );
    expect(response.statusCode).toBe(403);
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).endsWith("admin_cancel_message"),
      ),
    ).toBe(false);
  });
  it("rejects missing sessions before reading any records", async () => {
    const fetch = authorizedFetch();
    const response = res();
    await records(req("GET", undefined, { cookie: "" }), response);
    expect(response.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(response.headers["Cache-Control"]).toBe("no-store");
  });
  it("rechecks enabled admin membership and rejects ordinary authenticated users", async () => {
    const fetch = authorizedFetch();
    fetch.mockImplementation(async (input) =>
      String(input).endsWith("/auth/v1/user") ? json({ id: actor }) : json([]),
    );
    const response = res();
    await records(req("GET"), response);
    expect(response.statusCode).toBe(403);
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes("admin_snapshot")),
    ).toBe(false);
  });
  it("rejects cross-origin writes even with a valid admin session", async () => {
    const fetch = authorizedFetch();
    const response = res();
    await records(
      req(
        "POST",
        { action: "activate", applicationId: actor },
        { origin: "https://attacker.example" },
      ),
      response,
    );
    expect(response.statusCode).toBe(403);
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes("admin_mutate")),
    ).toBe(false);
  });
  it("uses the verified actor rather than a client-supplied actor", async () => {
    const fetch = authorizedFetch();
    const response = res();
    await records(
      req("POST", {
        action: "note",
        actor: "attacker",
        applicationId: actor,
        note: "Reviewed",
      }),
      response,
    );
    expect(response.statusCode).toBe(200);
    const call = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("admin_mutate"),
    );
    expect(JSON.parse(String(call?.[1]?.body)).p_actor).toBe(actor);
  });
  it("sets an HttpOnly, secure production cookie only after admin authorization", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fetch = authorizedFetch();
    fetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/auth/v1/token"))
        return json({ access_token: "fresh-token", expires_in: 3600 });
      if (url.endsWith("/auth/v1/user")) return json({ id: actor });
      return json([{ user_id: actor }]);
    });
    const response = res();
    await session(
      req("POST", { email: "admin@example.test", password: "test-password" }),
      response,
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers["Set-Cookie"]).toContain(
      "HttpOnly; SameSite=Strict",
    );
    expect(response.headers["Set-Cookie"]).toContain("; Secure");
    expect(response.body).not.toContain("fresh-token");
  });
  it("does not authorize a non-admin by signing in", async () => {
    const fetch = authorizedFetch();
    fetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/auth/v1/token"))
        return json({ access_token: "token", expires_in: 3600 });
      if (url.endsWith("/auth/v1/user")) return json({ id: actor });
      return json([]);
    });
    const response = res();
    await session(
      req("POST", {
        email: "ordinary@example.test",
        password: "test-password",
      }),
      response,
    );
    expect(response.statusCode).toBe(403);
    expect(response.headers["Set-Cookie"]).toBeUndefined();
  });
  it("does not leak internal database errors", async () => {
    const fetch = authorizedFetch();
    fetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return json({ id: actor });
      if (url.includes("/admin_users?")) return json([{ user_id: actor }]);
      return json({ code: "42P01", message: "internal database details" }, 500);
    });
    const response = res();
    await records(req("GET"), response);
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain("internal database details");
  });
  it("uses stable provider idempotency keys and acknowledges the database claim", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "test@example.test");
    vi.stubEnv("ADMIN_EMAIL", "admin@example.test");
    const fetch = authorizedFetch();
    fetch.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return json({ id: actor });
      if (url.includes("/admin_users?")) return json([{ user_id: actor }]);
      if (url.endsWith("admin_claim_message"))
        return json({
          id: actor,
          claim_token: actor,
          invoice_id: actor,
          created_at: "2026-10-26T10:00:00Z",
          kind: "receipt",
          payload: {
            learner: "Test",
            studentNumber: "VT-TEST",
            invoiceNumber: "VT-T-1",
            month: "2026-11-01",
            recipients: ["parent@example.test"],
            amountCents: 100,
            dueDate: "2026-11-01",
            paidOn: "2026-10-26",
            method: "EFT",
            paymentId: actor,
            teachingDays: 20,
            remainingDays: 20,
            paidCents: 100,
            balanceCents: 0,
          },
        });
      if (url.includes("/rest/v1/tuition_invoices?"))
        return json([
          {
            period_start: "2026-11-01",
            period_end: "2026-11-30",
            monthly_fee: 500,
          },
        ]);
      if (url.includes("/rest/v1/tuition_payments?"))
        return json([{ transaction_reference: "BANK-TEST-001" }]);
      if (url === "https://api.resend.com/emails") {
        expect(init?.headers).toMatchObject({
          "Idempotency-Key": `tuition-${actor}`,
        });
        const payload = JSON.parse(String(init?.body));
        expect(payload.attachments).toHaveLength(1);
        expect(
          Buffer.from(payload.attachments[0].content, "base64")
            .subarray(0, 5)
            .toString(),
        ).toBe("%PDF-");
        return json({ id: "provider-id" });
      }
      if (url.endsWith("admin_finish_message")) {
        expect(JSON.parse(String(init?.body)).p_success).toBe(true);
        return json(null);
      }
      throw new Error("Unexpected URL");
    });
    const response = res();
    await messages(req("POST", { id: actor }), response);
    expect(response.statusCode).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(7);
  });
});
