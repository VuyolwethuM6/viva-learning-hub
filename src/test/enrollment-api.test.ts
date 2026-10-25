import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import enrollmentHandler from "../../api/enrollment";

function makeRequest(body: unknown, preParsed = false) {
  return Object.assign(Readable.from(preParsed ? [] : [JSON.stringify(body)]), {
    method: "POST",
    headers: {},
    ...(preParsed ? { body } : {}),
  }) as IncomingMessage;
}

function makeResponse() {
  const response = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(value: string) {
      this.body = value;
    },
  };
  return response as unknown as ServerResponse & typeof response;
}

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    student: {
      name: "Test Learner",
      dob: "2010-05-05",
      gender: "Prefer not to say",
      email: "learner@example.test",
      phone: "0821234567",
      school: "Test School",
    },
    guardian: {
      name: "Test Guardian",
      email: "guardian@example.test",
      phone: "0827654321",
    },
    grade: "Grade 10",
    selectedSubjects: ["Mathematics", "Physical Sciences"],
    mode: "Online (Google Meet)",
    goals: ["Improve my marks"],
    marks: {
      Mathematics: { current: "65", target: "85", difficulties: ["Algebra"] },
      "Physical Sciences": { current: "70", target: "90", difficulties: ["Electricity"] },
    },
    monthlyFee: 1,
    reportCardName: "sample.pdf",
    reportCardSize: 1024,
    reportCardMimeType: "application/pdf",
    termsAccepted: true,
    photoConsent: false,
    ...overrides,
  };
}

describe("enrollment API", () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    vi.restoreAllMocks();
  });

  it("uses a server-calculated fee and atomically submits the application", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/rest/v1/rpc/submit_enrollment")) {
        const body = JSON.parse(String(init?.body)) as { p_payload: { application_number: string } };
        return new Response(JSON.stringify({
          id: "app-id",
          application_number: body.p_payload.application_number,
          student_number: "VT-2026-000001",
          storage_path: `VT-2026-000001/${body.p_payload.application_number}/report-card.pdf`,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        url: "/object/upload/sign/learner-documents/test?token=signed-token",
        token: "signed-token",
      }), { status: 200 });
    });
    const response = makeResponse();

    await enrollmentHandler(makeRequest(makePayload(), true), response);

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({
      success: true,
      monthlyFee: 800,
      studentNumber: "VT-2026-000001",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://project.supabase.co/rest/v1/rpc/submit_enrollment");
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.p_payload.monthly_fee).toBe(800);
    expect(request.p_payload.monthly_fee).not.toBe(1);
    expect(request.p_payload.subjects).toHaveLength(2);
    expect(request.p_payload.report_card_extension).toBe("pdf");
    expect(fetchMock.mock.calls[1][0]).toContain("/storage/v1/object/upload/sign/learner-documents/");
  });

  it("rejects invalid grade and subject combinations without contacting Supabase", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = makeResponse();

    await enrollmentHandler(
      makeRequest(makePayload({ grade: "Grade 8", selectedSubjects: ["Mathematics", "Physical Sciences"] })),
      response,
    );

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("identifies missing required fields in the request", async () => {
    const response = makeResponse();

    await enrollmentHandler(makeRequest(makePayload({ goals: [] })), response);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).missingFields).toEqual(["goals"]);
  });

  it("rejects an empty request body instead of treating it as an empty enrollment", async () => {
    const request = Object.assign(Readable.from([]), { method: "POST", headers: {} }) as IncomingMessage;
    const response = makeResponse();

    await enrollmentHandler(request, response);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe("Request body is empty.");
  });

  it("does not report success when Supabase rejects the write", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("database error", { status: 500 }));
    const response = makeResponse();

    await enrollmentHandler(makeRequest(makePayload()), response);

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body).success).not.toBe(true);
  });
});
