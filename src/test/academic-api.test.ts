// @vitest-environment node
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import handler from "../../api/admin/session";
import records from "../../api/admin/records";
import type { ApiRequest } from "../../api/_lib/http";
const actor = "55555555-5555-4555-8555-555555555555",
  id = "22222222-2222-4222-8222-222222222222";
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status });
function req(
  method = "GET",
  body?: object,
  query = "",
  role = "student",
  headers: Record<string, string> = {},
) {
  return Object.assign(Readable.from([]), {
    method,
    body,
    url: `/api/${role}?academic=1${query}`,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      cookie: `viva_${role}=synthetic-session`,
      "content-type": "application/json",
      ...headers,
    },
  }) as ApiRequest;
}
function res() {
  const x = {
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
  return x as unknown as ServerResponse & typeof x;
}
function upstream({
  denied = false,
  fileDenied = false,
  foreign = false,
}: { denied?: boolean; fileDenied?: boolean; foreign?: boolean } = {}) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const u = String(input);
      if (u.endsWith("/auth/v1/user"))
        return json({
          id: actor,
          email: "learner@example.test",
          email_confirmed_at: "2026-10-01",
        });
      if (u.endsWith("/student_assert") || u.endsWith("/parent_assert"))
        return denied
          ? json({ code: "P0001", message: "Access unavailable" }, 409)
          : json({ id: actor });
      if (u.endsWith("/academic_snapshot"))
        return foreign
          ? json(
              {
                code: "P0001",
                message: "This learner is not available to your family.",
              },
              409,
            )
          : json({ tasks: [], attempts: [], progress: [] });
      if (u.endsWith("/academic_mutate")) return json({ receipt: id });
      if (u.endsWith("/academic_file"))
        return fileDenied
          ? json(
              {
                code: "P0001",
                message:
                  "This submission file is not available to your account.",
              },
              409,
            )
          : json({
              id,
              bucket: "academic-submissions",
              storage_path: id + "/answer.pdf",
              file_name: "answer.pdf",
              mime: "application/pdf",
              size_bytes: 5,
            });
      if (u.includes("/storage/v1/object/authenticated/academic-submissions/"))
        return new Response("%PDF-", {
          headers: { "Content-Type": "application/pdf" },
        });
      if (u.endsWith("/academic_report"))
        return json({
          id,
          created_at: "2026-10-27T10:00:00Z",
          content: {
            learnerName: "Alex Learner",
            studentNumber: "ST-TEST",
            className: "Grade 12 Mathematics",
            subject: "Mathematics",
            startsOn: "2026-10-01",
            endsOn: "2026-11-30",
            startingMark: 45,
            targetMark: 75,
            average: 75,
            method: "total_marks",
            assessmentCount: 1,
            missingCount: 0,
            marks: [
              {
                title: "Worksheet",
                score: 15,
                maxMarks: 20,
                percentage: 75,
                purpose: "formative",
                weight: 1,
                countsAverage: true,
              },
            ],
          },
        });
      throw new Error("Unexpected upstream " + u + " " + String(init?.body));
    });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("academic HTTP authorization and private outputs", () => {
  it("uses verified actor and server-selected audience for learner mutations despite spoofing", async () => {
    const fetch = upstream(),
      out = res();
    await handler(
      req("POST", {
        action: "academic",
        audience: "admin",
        actor: "forged",
        operation: "submit",
        data: {
          requestId: id,
          attemptId: id,
          revision: 0,
          answer: "My answer",
        },
      }),
      out,
    );
    expect(out.statusCode).toBe(200);
    const call = fetch.mock.calls.find(([u]) =>
      String(u).endsWith("/academic_mutate"),
    );
    const b = JSON.parse(String(call?.[1]?.body));
    expect(b.p_actor).toBe(actor);
    expect(b.p_audience).toBe("student");
    expect(b.p_operation).toBe("submit");
  });
  it("binds parent reads to verified family scope and rejects parent academic writes", async () => {
    const fetch = upstream(),
      out = res();
    await handler(req("GET", undefined, "&application=" + id, "parent"), out);
    const call = fetch.mock.calls.find(([u]) =>
      String(u).endsWith("/academic_snapshot"),
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      p_actor: actor,
      p_audience: "parent",
      p_application: id,
      p_task: null,
    });
    const write = res();
    await handler(
      req(
        "POST",
        {
          action: "academic",
          operation: "submit",
          data: { requestId: id, attemptId: id },
        },
        "",
        "parent",
      ),
      write,
    );
    expect(write.statusCode).toBe(400);
    expect(
      fetch.mock.calls.some(([u]) => String(u).endsWith("/academic_mutate")),
    ).toBe(false);
  });
  it("rejects a foreign parent learner and blocks files before contacting Storage", async () => {
    const fetch = upstream({ foreign: true, fileDenied: true }),
      out = res();
    await handler(req("GET", undefined, "&application=" + id, "parent"), out);
    expect(out.statusCode).toBe(409);
    const file = res();
    await handler(req("GET", undefined, "&file=" + id), file);
    expect(file.statusCode).toBe(409);
    expect(
      fetch.mock.calls.some(([u]) => String(u).includes("/storage/")),
    ).toBe(false);
  });
  it("checks authorization before loading report contents and renders an actual branded PDF", async () => {
    const fetch = upstream(),
      out = res();
    await handler(req("GET", undefined, "&report=" + id), out);
    expect(out.statusCode).toBe(200);
    expect(
      Buffer.from(out.body as Uint8Array)
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
    expect(
      fetch.mock.calls.some(([u]) => String(u).endsWith("/academic_report")),
    ).toBe(true);
    expect(out.headers["Cache-Control"]).toBe("no-store");
  });
  it("serves only bounded verified submission bytes after the ownership RPC", async () => {
    const fetch = upstream(),
      out = res();
    await handler(
      req("GET", undefined, "&file=" + id + "&kind=submission"),
      out,
    );
    expect(out.statusCode).toBe(200);
    expect(Buffer.from(out.body as Uint8Array).toString()).toBe("%PDF-");
    expect(
      String(
        fetch.mock.calls.find(([u]) =>
          String(u).endsWith("/academic_file"),
        )?.[1]?.body,
      ),
    ).toContain('"p_audience":"student"');
  });
  it("rejects cross-origin writes before any academic mutation", async () => {
    const fetch = upstream(),
      out = res();
    await handler(
      req(
        "POST",
        { action: "academic", operation: "submit", data: { requestId: id } },
        "",
        "student",
        { origin: "https://attacker.example" },
      ),
      out,
    );
    expect(out.statusCode).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("blocks revoked student access before academic reads", async () => {
    const fetch = upstream({ denied: true }),
      out = res();
    await handler(req(), out);
    expect(out.statusCode).toBe(403);
    expect(
      fetch.mock.calls.some(([u]) => String(u).includes("/academic_")),
    ).toBe(false);
  });
  it("does not accept student cookies as admin academic authorization", async () => {
    const fetch = upstream(),
      out = res();
    await records(
      req("POST", {
        action: "academic",
        operation: "grade_publish",
        data: { requestId: id, gradeId: id },
      }),
      out,
    );
    expect(out.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
