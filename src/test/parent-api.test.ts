// @vitest-environment node
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/admin/session";
import type { ApiRequest } from "../../api/_lib/http";
const parent = "33333333-3333-4333-8333-333333333333",
  id = "22222222-2222-4222-8222-222222222222",
  hash = "a".repeat(64);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function req(
  method = "GET",
  body?: object,
  query = "",
  headers: Record<string, string> = {},
) {
  return Object.assign(Readable.from([]), {
    method,
    body,
    url: "/api/admin/session?portal=parent" + query,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
      cookie: "viva_parent=parent-token; viva_parent_refresh=refresh-token",
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
function upstream(
  options: {
    allowed?: boolean;
    confirmed?: boolean;
    revoked?: boolean;
    foreign?: boolean;
    expired?: boolean;
    limited?: boolean;
    deliveryFailure?: boolean;
  } = {},
) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user"))
        return options.expired
          ? json({}, 401)
          : json({
              id: parent,
              email: "parent@example.test",
              email_confirmed_at:
                options.confirmed === false ? null : "2026-10-01",
            });
      if (url.endsWith("/parent_assert") || url.endsWith("/parent_bind"))
        return options.revoked
          ? json({ code: "P0001", message: "Parent access unavailable" }, 409)
          : json({ email: "parent@example.test" });
      if (url.endsWith("/parent_rate_limit")) return json(!options.limited);
      if (url.endsWith("/parent_signin_allowed"))
        return json(options.allowed !== false);
      if (url.includes("/auth/v1/otp?"))
        return json({}, options.deliveryFailure ? 429 : 200);
      if (url.endsWith("/auth/v1/verify") || url.includes("/auth/v1/token?"))
        return json({
          access_token: "parent-token",
          refresh_token: "rotated-refresh",
          expires_in: 3600,
        });
      if (url.endsWith("/parent_snapshot"))
        return json({
          parent: { email: "parent@example.test" },
          children: [],
          invoices: [],
          totals: { outstandingCents: 0 },
        });
      if (url.endsWith("/parent_document"))
        return options.foreign
          ? json(
              {
                code: "P0001",
                message: "Document unavailable for this account.",
              },
              409,
            )
          : json({
              documentKind: "account_receipt",
              documentId: id,
              documentNumber: "RC-TEST",
              title: "Payment receipt",
              payer: "Parent",
              learner: "Alex",
              recipients: ["parent@example.test"],
              issuedOn: "2026-10-27",
              items: [{ description: "Tuition", cents: 80000 }],
              totalCents: 80000,
            });
      if (url.includes("/auth/v1/logout")) return json({});
      throw new Error("Unexpected upstream " + url + " " + String(init?.body));
    });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  vi.stubEnv("PUBLIC_SITE_URL", "https://www.vivatutorials.co.za");
  vi.stubEnv("PARENT_PORTAL_URL", "https://work.example.test");
  vi.stubEnv("TUITION_BANK_DETAILS_CONFIRMED", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("passwordless parent API", () => {
  it("does not accept an admin cookie as a parent session", async () => {
    const fetch = upstream(),
      out = res();
    const request = req("GET", undefined, "", {
      cookie: "viva_admin=admin-token",
    });
    request.url = "/api/parent";
    await handler(request, out);
    expect(out.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("binds snapshots to the verified identity and hides unconfirmed banking details", async () => {
    const fetch = upstream(),
      out = res();
    await handler(
      req("GET", undefined, "&userId=spoofed&email=other@example.test"),
      out,
    );
    expect(out.statusCode).toBe(200);
    expect(JSON.parse(String(out.body)).paymentDetails).toBeNull();
    const call = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("parent_snapshot"),
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ p_user: parent });
    expect(out.headers["Cache-Control"]).toBe("no-store");
  });
  it("sends only enabled guardians an email link and uses a configured callback, not client input", async () => {
    const fetch = upstream(),
      out = res();
    await handler(
      req("POST", {
        action: "request_link",
        email: " PARENT@example.test ",
        redirectTo: "https://attacker.example",
      }),
      out,
    );
    expect(out.statusCode).toBe(200);
    const call = fetch.mock.calls.find(([url]) =>
      String(url).includes("/auth/v1/otp?"),
    );
    expect(String(call?.[0])).toContain(
      encodeURIComponent(
        "https://work.example.test/api/parent?action=callback",
      ),
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      email: "parent@example.test",
      create_user: true,
    });
    expect(out.headers["Set-Cookie"]).toBeUndefined();
  });
  it("returns the same request message for unknown emails without calling Auth", async () => {
    const fetch = upstream({ allowed: false }),
      out = res();
    await handler(
      req("POST", { action: "request_link", email: "unknown@example.test" }),
      out,
    );
    expect(out.statusCode).toBe(200);
    expect(JSON.parse(String(out.body)).message).toContain(
      "If parent access is enabled",
    );
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes("/auth/v1/otp")),
    ).toBe(false);
  });
  it("enforces durable rate limits and same-origin requests before sending mail", async () => {
    const fetch = upstream({ limited: true }),
      out = res();
    await handler(
      req("POST", { action: "request_link", email: "parent@example.test" }),
      out,
    );
    expect(out.statusCode).toBe(429);
    const cross = res();
    await handler(
      req(
        "POST",
        { action: "request_link", email: "parent@example.test" },
        "",
        { origin: "https://attacker.example" },
      ),
      cross,
    );
    expect(cross.statusCode).toBe(403);
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes("/auth/v1/otp")),
    ).toBe(false);
  });
  it("exchanges a one-use email link on the server and sets separate HttpOnly cookies", async () => {
    const fetch = upstream(),
      out = res();
    vi.stubEnv("VERCEL_ENV", "preview");
    await handler(
      req("GET", undefined, "&action=callback&token_hash=" + hash, {
        cookie: "",
      }),
      out,
    );
    expect(out.statusCode).toBe(303);
    expect(out.headers.Location).toBe("/parent");
    const cookies = out.headers["Set-Cookie"] as string[];
    expect(cookies).toHaveLength(2);
    expect(
      cookies.every((v) =>
        v.includes("Path=/api/parent; HttpOnly; SameSite=Strict; Secure"),
      ),
    ).toBe(true);
    expect(cookies.join(";")).not.toContain("viva_admin");
    expect(String(out.body)).not.toContain("parent-token");
    const verify = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/auth/v1/verify"),
    );
    expect(JSON.parse(String(verify?.[1]?.body))).toEqual({
      token_hash: hash,
      type: "email",
    });
  });
  it("rejects expired links, unconfirmed email identities and revoked parent accounts", async () => {
    for (const options of [
      { expired: true },
      { confirmed: false },
      { revoked: true },
    ]) {
      vi.restoreAllMocks();
      upstream(options);
      const out = res();
      await handler(
        req("GET", undefined, "&action=callback&token_hash=" + hash),
        out,
      );
      expect(out.headers.Location).toBe("/parent?signin=expired");
      expect(out.headers["Set-Cookie"]).toBeUndefined();
    }
  });
  it("rotates refresh tokens server-side without exposing them to browser JavaScript", async () => {
    const fetch = upstream(),
      out = res();
    await handler(req("POST", { action: "refresh", userId: "spoofed" }), out);
    expect(out.statusCode).toBe(200);
    expect(JSON.parse(String(out.body))).toEqual({
      user: { id: parent, email: "parent@example.test" },
    });
    expect(String(out.body)).not.toContain("rotated-refresh");
    expect((out.headers["Set-Cookie"] as string[]).join(";")).toContain(
      "rotated-refresh",
    );
    expect(
      fetch.mock.calls.some(([url]) => String(url).endsWith("parent_bind")),
    ).toBe(true);
  });
  it("checks document ownership before loading PDF data and rejects admin-only document types", async () => {
    const fetch = upstream({ foreign: true }),
      out = res();
    await handler(
      req("GET", undefined, "&action=document&kind=invoice&id=" + id),
      out,
    );
    expect(out.statusCode).toBe(409);
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).includes("/tuition_invoices?"),
      ),
    ).toBe(false);
    const report = res();
    await handler(
      req("GET", undefined, "&action=document&kind=financial_report&id=" + id),
      report,
    );
    expect(report.statusCode).toBe(404);
  });
  it("returns a real private receipt PDF and blocks revoked users", async () => {
    upstream();
    const out = res();
    await handler(
      req("GET", undefined, "&action=document&kind=account_receipt&id=" + id),
      out,
    );
    expect(out.statusCode).toBe(200);
    expect(out.headers["Content-Type"]).toBe("application/pdf");
    expect(
      Buffer.from(out.body as Uint8Array)
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
    vi.restoreAllMocks();
    upstream({ revoked: true });
    const denied = res();
    await handler(req(), denied);
    expect(denied.statusCode).toBe(403);
  });
  it("signs out only the parent session and clears both cookies", async () => {
    upstream();
    const out = res();
    await handler(req("DELETE"), out);
    expect(out.statusCode).toBe(200);
    expect(
      (out.headers["Set-Cookie"] as string[]).every(
        (v) => v.includes("Max-Age=0") && !v.includes("viva_admin"),
      ),
    ).toBe(true);
  });
});
