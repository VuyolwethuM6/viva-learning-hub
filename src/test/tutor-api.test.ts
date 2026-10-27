// @vitest-environment node
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import handler from "../../api/admin/session";
import records from "../../api/admin/records";
import type { ApiRequest } from "../../api/_lib/http";
const actor = "33333333-3333-4333-8333-333333333333",
  id = "22222222-2222-4222-8222-222222222222";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function req(
  method = "GET",
  body?: object,
  query = "",
  headers: Record<string, string> = {},
) {
  return Object.assign(Readable.from([]), {
    method,
    body,
    url: "/api/tutor" + query,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      cookie: "viva_tutor=tutor-session; viva_tutor_refresh=tutor-refresh",
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
function upstream(
  options: {
    denied?: boolean;
    allowed?: boolean;
    fileDenied?: boolean;
    mutationDenied?: boolean;
  } = {},
) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user"))
        return json({
          id: actor,
          email: "tutor@example.test",
          email_confirmed_at: "2026-10-01",
        });
      if (url.endsWith("/tutor_assert") || url.endsWith("/tutor_bind"))
        return options.denied
          ? json({ code: "P0001", message: "Tutor access unavailable" }, 409)
          : json({ id, email: "tutor@example.test" });
      if (url.endsWith("/parent_rate_limit")) return json(true);
      if (url.endsWith("/tutor_signin_allowed"))
        return json(options.allowed !== false);
      if (url.includes("/auth/v1/otp?")) return json({});
      if (url.endsWith("/auth/v1/verify") || url.includes("/auth/v1/token?"))
        return json({
          access_token: "tutor-session",
          refresh_token: "rotated-tutor-refresh",
          expires_in: 3600,
        });
      if (url.endsWith("/teaching_snapshot"))
        return json({ classes: [], sessions: [] });
      if (url.endsWith("/teaching_mutate"))
        return options.mutationDenied
          ? json(
              {
                code: "P0001",
                message: "Only administrators can change teaching setup.",
              },
              409,
            )
          : json({ sessionId: id });
      if (url.endsWith("/teaching_file"))
        return options.fileDenied
          ? json(
              {
                code: "P0001",
                message: "This teaching file is not assigned to your classes.",
              },
              409,
            )
          : json({
              id,
              storage_path: id + "/worksheet.pdf",
              file_name: "worksheet.pdf",
              mime: "application/pdf",
              size_bytes: 5,
            });
      if (url.includes("/storage/v1/object/authenticated/teaching-materials/"))
        return new Response("%PDF-", {
          headers: { "Content-Type": "application/pdf" },
        });
      if (url.includes("/auth/v1/logout")) return json({});
      throw new Error("Unexpected upstream " + url + " " + String(init?.body));
    });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  vi.stubEnv("TUTOR_PORTAL_URL", "https://tutor.example.test");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("tutor API isolation and auth", () => {
  it("rejects parent/admin cookies as tutor authentication", async () => {
    const fetch = upstream(),
      out = res();
    await handler(
      req("GET", undefined, "", {
        cookie: "viva_parent=parent-session; viva_admin=admin-session",
      }),
      out,
    );
    expect(out.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses tutor grants and a trusted configured tutor callback", async () => {
    const fetch = upstream(),
      out = res();
    await handler(
      req("POST", {
        action: "request_link",
        email: "tutor@example.test",
        audience: "admin",
        redirectTo: "https://attacker.example",
      }),
      out,
    );
    expect(out.statusCode).toBe(200);
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).endsWith("tutor_signin_allowed"),
      ),
    ).toBe(true);
    const call = fetch.mock.calls.find(([url]) =>
      String(url).includes("/auth/v1/otp?"),
    );
    expect(String(call?.[0])).toContain(
      encodeURIComponent(
        "https://tutor.example.test/api/tutor?action=callback",
      ),
    );
  });
  it("does not send mail for an unauthorized tutor email", async () => {
    const fetch = upstream({ allowed: false }),
      out = res();
    await handler(
      req("POST", { action: "request_link", email: "unknown@example.test" }),
      out,
    );
    expect(out.statusCode).toBe(200);
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes("/auth/v1/otp")),
    ).toBe(false);
  });
  it("exchanges links into tutor-only HttpOnly cookies", async () => {
    upstream();
    vi.stubEnv("VERCEL_ENV", "preview");
    const out = res();
    await handler(
      req("GET", undefined, "?action=callback&token_hash=" + "a".repeat(64)),
      out,
    );
    expect(out.statusCode).toBe(303);
    expect(out.headers.Location).toBe("/tutor");
    const cookies = out.headers["Set-Cookie"] as string[];
    expect(
      cookies.every((c) =>
        c.includes("Path=/api/tutor; HttpOnly; SameSite=Strict; Secure"),
      ),
    ).toBe(true);
    expect(cookies.join(";")).not.toMatch(/viva_parent|viva_admin/);
  });
  it("binds reads to the verified actor and writes to the tutor audience despite client spoofing", async () => {
    const fetch = upstream(),
      out = res();
    await handler(req("GET", undefined, "?actorId=spoofed"), out);
    const snapshot = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("teaching_snapshot"),
    );
    expect(JSON.parse(String(snapshot?.[1]?.body))).toEqual({
      p_actor: actor,
      p_audience: "tutor",
    });
    const write = res();
    await handler(
      req("POST", {
        action: "teaching",
        audience: "admin",
        operation: "attendance",
        data: { requestId: id, sessionId: id, rows: [], actor: "spoofed" },
      }),
      write,
    );
    const mutation = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("teaching_mutate"),
    );
    expect(JSON.parse(String(mutation?.[1]?.body)).p_audience).toBe("tutor");
    expect(JSON.parse(String(mutation?.[1]?.body)).p_actor).toBe(actor);
  });
  it("rejects unauthorized setup operations and forged-class file access before Storage", async () => {
    const fetch = upstream({ mutationDenied: true, fileDenied: true }),
      out = res();
    await handler(
      req("POST", {
        action: "teaching",
        operation: "class_create",
        data: { requestId: id },
      }),
      out,
    );
    expect(out.statusCode).toBe(409);
    const file = res();
    await handler(req("GET", undefined, "?file=" + id), file);
    expect(file.statusCode).toBe(409);
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes("/storage/")),
    ).toBe(false);
  });
  it("downloads only a scoped verified file and blocks revoked tutor sessions", async () => {
    upstream();
    const out = res();
    await handler(req("GET", undefined, "?file=" + id), out);
    expect(out.statusCode).toBe(200);
    expect(Buffer.from(out.body as Uint8Array).toString()).toBe("%PDF-");
    vi.restoreAllMocks();
    upstream({ denied: true });
    const denied = res();
    await handler(req(), denied);
    expect(denied.statusCode).toBe(403);
  });
  it("requires same-origin tutor writes and real admin authorization for teaching setup", async () => {
    const fetch = upstream(),
      out = res();
    await handler(
      req(
        "POST",
        {
          action: "teaching",
          operation: "attendance",
          data: { requestId: id },
        },
        "",
        { origin: "https://attacker.example" },
      ),
      out,
    );
    expect(out.statusCode).toBe(403);
    const admin = res();
    await records(
      req("POST", {
        action: "teaching",
        operation: "class_create",
        data: { requestId: id },
      }),
      admin,
    );
    expect(admin.statusCode).toBe(401);
    expect(
      fetch.mock.calls.some(([url]) => String(url).endsWith("teaching_mutate")),
    ).toBe(false);
  });
  it("clears only tutor cookies on logout", async () => {
    upstream();
    const out = res();
    await handler(req("DELETE"), out);
    expect(out.statusCode).toBe(200);
    expect(
      (out.headers["Set-Cookie"] as string[]).every(
        (c) =>
          c.includes("viva_tutor") &&
          c.includes("Max-Age=0") &&
          !c.includes("viva_parent"),
      ),
    ).toBe(true);
  });
});
