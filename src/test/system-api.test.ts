// @vitest-environment node
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import handler from "../../api/admin/records";
import accounting from "../../api/admin/accounting";
import type { ApiRequest } from "../../api/_lib/http";
import { systemActor as actor, systemFixture } from "./system-fixture";
const id = "22222222-2222-4222-8222-222222222222";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function request(
  method = "GET",
  body?: object,
  headers: Record<string, string> = {},
  path = "/api/admin/records?system=health",
) {
  return Object.assign(Readable.from([]), {
    method,
    url: path,
    body,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      cookie: "viva_admin=test-session",
      "content-type": "application/json",
      ...headers,
    },
  }) as ApiRequest;
}
function response() {
  const out = {
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
  return out as unknown as ServerResponse & typeof out;
}
function upstream() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user"))
        return json({ id: actor, email: "owner@example.test" });
      if (url.includes("/rest/v1/admin_users?"))
        return json([{ user_id: actor }]);
      if (url.endsWith("/system_snapshot")) return json(systemFixture());
      if (url.endsWith("/storage/v1/bucket"))
        return json(
          [
            "learner-documents",
            "accounting-documents",
            "teaching-materials",
            "academic-submissions",
          ].map((id) => ({ id, public: false })),
        );
      if (url.endsWith("/auth/v1/settings"))
        return json({
          external: { email: true },
          secret: "must-never-be-returned",
        });
      if (url.endsWith("/system_mutate"))
        return json({ success: true, revision: 3 });
      if (url.endsWith("/system_email_test_claim"))
        return json({
          send: true,
          id,
          to: "owner@example.test",
          state: "pending",
        });
      if (
        url.endsWith("/system_email_test_finish") ||
        url.endsWith("/system_job_record")
      )
        return json(null);
      if (url === "https://api.resend.com/emails")
        return json({ id: "synthetic-provider-id" });
      if (url.endsWith("/accounting_scheduler_context"))
        return json({
          enabled: true,
          validActor: true,
          actor,
          autoSend: false,
        });
      if (url.endsWith("/accounting_run_schedule"))
        return json({ success: true });
      throw new Error("Unexpected upstream operation " + url);
    });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "never-show-service-key");
  vi.stubEnv("RESEND_API_KEY", "never-show-email-key");
  vi.stubEnv("EMAIL_FROM", "Viva <sender@example.test>");
  vi.stubEnv("ADMIN_EMAIL", "office@example.test");
  vi.stubEnv("CRON_SECRET", "never-show-cron-secret");
  vi.stubEnv("TUITION_BANK_DETAILS_CONFIRMED", "true");
  vi.stubEnv("VERCEL_ENV", "preview");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("admin system health and settings API", () => {
  it("checks real dependencies, stays private and never returns environment secrets or raw Auth configuration", async () => {
    const fetch = upstream(),
      out = response();
    await handler(request(), out);
    expect(out.statusCode).toBe(200);
    const body = JSON.parse(out.body);
    expect(
      body.checks.find((c: { id: string }) => c.id === "storage").status,
    ).toBe("ok");
    expect(
      body.checks.find((c: { id: string }) => c.id === "queue").status,
    ).toBe("attention");
    expect(
      body.checks.find((c: { id: string }) => c.id === "email").status,
    ).toBe("info");
    expect(
      body.checks.find((c: { id: string }) => c.id === "backups").status,
    ).toBe("info");
    expect(out.headers["Cache-Control"]).toBe("no-store");
    for (const secret of [
      "never-show-service-key",
      "never-show-email-key",
      "never-show-cron-secret",
      "must-never-be-returned",
    ])
      expect(out.body).not.toContain(secret);
    expect(
      fetch.mock.calls.filter(([url]) =>
        String(url).startsWith("https://api.resend.com"),
      ),
    ).toHaveLength(0);
  });
  it("reports missing data as unavailable rather than empty healthy totals", async () => {
    const fetch = upstream(),
      original = fetch.getMockImplementation()!;
    fetch.mockImplementation((url, init) =>
      String(url).endsWith("/system_snapshot")
        ? Promise.resolve(json({ error: "unknown" }, 404))
        : original(url, init),
    );
    const out = response();
    await handler(request(), out);
    expect(out.statusCode).toBe(200);
    const body = JSON.parse(out.body);
    expect(body.overviewAvailable).toBe(false);
    expect(body.health).toBeNull();
    expect(
      body.checks.find((c: { id: string }) => c.id === "database").status,
    ).toBe("unavailable");
    expect(body.checks.some((c: { id: string }) => c.id === "ledger")).toBe(
      false,
    );
  });
  it("flags a public or missing bucket instead of a green storage check", async () => {
    const fetch = upstream(),
      original = fetch.getMockImplementation()!;
    fetch.mockImplementation((url, init) =>
      String(url).endsWith("/storage/v1/bucket")
        ? Promise.resolve(json([{ id: "learner-documents", public: true }]))
        : original(url, init),
    );
    const out = response();
    await handler(request(), out);
    expect(
      JSON.parse(out.body).checks.find(
        (c: { id: string }) => c.id === "storage",
      ),
    ).toMatchObject({ status: "attention" });
  });
  it("rejects unauthorised staff before loading system or storage information", async () => {
    const fetch = upstream(),
      original = fetch.getMockImplementation()!;
    fetch.mockImplementation((url, init) =>
      String(url).includes("/admin_users?")
        ? Promise.resolve(json([]))
        : original(url, init),
    );
    const out = response();
    await handler(request(), out);
    expect(out.statusCode).toBe(403);
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).includes("/system_snapshot"),
      ),
    ).toBe(false);
  });
  it("enforces same-origin writes before executing any settings mutation", async () => {
    const fetch = upstream(),
      out = response();
    await handler(
      request(
        "POST",
        {
          action: "system",
          operation: "closure_add",
          data: {
            requestId: id,
            revision: 2,
            day: "2027-03-01",
            reason: "Public holiday",
          },
        },
        { origin: "https://foreign.example" },
      ),
      out,
    );
    expect(out.statusCode).toBe(403);
    expect(
      fetch.mock.calls.some(([url]) => String(url).endsWith("/system_mutate")),
    ).toBe(false);
  });
  it("uses the verified actor and rejects malformed dates and revisions", async () => {
    const fetch = upstream(),
      out = response();
    await handler(
      request("POST", {
        action: "system",
        operation: "closure_add",
        actor: "forged",
        data: {
          requestId: id,
          revision: 2,
          day: "2027-03-01",
          reason: "Public holiday",
        },
      }),
      out,
    );
    expect(out.statusCode).toBe(200);
    const call = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/system_mutate"),
    )!;
    expect(JSON.parse(String(call[1]?.body)).p_actor).toBe(actor);
    const invalid = response();
    await handler(
      request("POST", {
        action: "system",
        operation: "closure_add",
        data: {
          requestId: id,
          revision: 2,
          day: "2027-02-30",
          reason: "Public holiday",
        },
      }),
      invalid,
    );
    expect(invalid.statusCode).toBe(400);
  });
  it("sends one test to the DB-authorised owner email with an idempotency key, ignoring recipient injection", async () => {
    const fetch = upstream(),
      out = response();
    await handler(
      request("POST", {
        action: "system",
        operation: "test_email",
        data: { requestId: id, to: "stranger@example.test" },
      }),
      out,
    );
    expect(out.statusCode).toBe(200);
    expect(JSON.parse(out.body).state).toBe("accepted");
    const send = fetch.mock.calls.find(
      ([url]) => String(url) === "https://api.resend.com/emails",
    )!;
    expect(JSON.parse(String(send[1]?.body)).to).toEqual([
      "owner@example.test",
    ]);
    expect(send[1]?.headers).toMatchObject({
      "Idempotency-Key": "viva-system-test-" + id,
    });
  });
  it("does not resend an already claimed request", async () => {
    const fetch = upstream(),
      original = fetch.getMockImplementation()!;
    fetch.mockImplementation((url, init) =>
      String(url).endsWith("/system_email_test_claim")
        ? Promise.resolve(json({ send: false, id, state: "uncertain" }))
        : original(url, init),
    );
    const out = response();
    await handler(
      request("POST", {
        action: "system",
        operation: "test_email",
        data: { requestId: id },
      }),
      out,
    );
    expect(JSON.parse(out.body)).toMatchObject({
      replayed: true,
      state: "uncertain",
    });
    expect(
      fetch.mock.calls.some(
        ([url]) => String(url) === "https://api.resend.com/emails",
      ),
    ).toBe(false);
  });
  it("retains ambiguous provider failures for review rather than claiming delivery", async () => {
    const fetch = upstream(),
      original = fetch.getMockImplementation()!;
    fetch.mockImplementation((url, init) =>
      String(url) === "https://api.resend.com/emails"
        ? Promise.resolve(json({ error: "provider internal details" }, 503))
        : original(url, init),
    );
    const out = response();
    await handler(
      request("POST", {
        action: "system",
        operation: "test_email",
        data: { requestId: id },
      }),
      out,
    );
    expect(JSON.parse(out.body).state).toBe("uncertain");
    expect(out.body).not.toContain("provider internal details");
    const finish = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/system_email_test_finish"),
    )!;
    expect(JSON.parse(String(finish[1]?.body)).p_state).toBe("uncertain");
  });
  it("records scheduled heartbeat start and outcome only after cron authorisation", async () => {
    const fetch = upstream(),
      out = response();
    await accounting(
      request(
        "GET",
        undefined,
        { authorization: "Bearer never-show-cron-secret" },
        "/api/admin/accounting?task=scheduled",
      ),
      out,
    );
    expect(out.statusCode).toBe(200);
    const events = fetch.mock.calls
      .filter(([url]) => String(url).endsWith("/system_job_record"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      p_source: "scheduled",
      p_state: "running",
    });
    expect(events[1]).toMatchObject({
      p_source: "scheduled",
      p_state: "completed",
    });
    expect(events[0].p_id).toBe(events[1].p_id);
  });
  it("does not block accounting when the optional observation migration is not installed", async () => {
    const fetch = upstream(),
      original = fetch.getMockImplementation()!;
    fetch.mockImplementation((url, init) =>
      String(url).endsWith("/system_job_record")
        ? Promise.resolve(json({}, 404))
        : original(url, init),
    );
    const out = response();
    await accounting(
      request(
        "GET",
        undefined,
        { authorization: "Bearer never-show-cron-secret" },
        "/api/admin/accounting?task=scheduled",
      ),
      out,
    );
    expect(out.statusCode).toBe(200);
    expect(JSON.parse(out.body).success).toBe(true);
  });
  it("requires scheduler readiness before enabling automation in Settings", async () => {
    const fetch = upstream();
    vi.stubEnv("CRON_SECRET", "");
    const out = response();
    await handler(
      request("POST", {
        action: "system",
        operation: "automation",
        data: {
          requestId: id,
          revision: 2,
          expectedAutomationEnabled: false,
          expectedAutoSend: false,
          automationEnabled: true,
          autoSend: false,
          reason: "Enable configured scheduled accounting",
        },
      }),
      out,
    );
    expect(out.statusCode).toBe(503);
    expect(
      fetch.mock.calls.some(([url]) => String(url).endsWith("/system_mutate")),
    ).toBe(false);
  });
});
