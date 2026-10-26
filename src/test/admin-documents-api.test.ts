// @vitest-environment node
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/admin/documents";
import type { ApiRequest } from "../../api/_lib/http";
const id = "11111111-1111-4111-8111-111111111111";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function req(kind = "invoice", cookie = "viva_admin=test-token") {
  return Object.assign(Readable.from([]), {
    method: "GET",
    url: `/api/admin/documents?kind=${kind}&id=${id}`,
    headers: { cookie },
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
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function mocks(reportMime = "application/pdf", reportSize = 16) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user"))
      return json({ id, email: "admin@example.test" });
    if (url.includes("/admin_users?")) return json([{ user_id: id }]);
    if (url.includes("/tuition_invoices?"))
      return json([
        {
          id,
          application_id: id,
          number: "VT-20261101",
          billing_month: "2026-11-01",
          period_start: "2026-11-15",
          period_end: "2026-11-30",
          due_date: "2026-11-15",
          monthly_fee: 800,
          teaching_days: 30,
          remaining_days: 16,
          amount_cents: 42667,
          created_at: "2026-10-26T12:00:00Z",
        },
      ]);
    if (url.includes("/applications?"))
      return json([
        {
          report_card_path: "VT-TEST/report.pdf",
          report_card_name: 'report "unsafe".pdf',
          learner_name: "Test Learner",
          guardian_email: "parent@example.test",
          learner_email: "learner@example.test",
          selected_subjects: ["Mathematics"],
        },
      ]);
    if (url.includes("/storage/v1/object/authenticated/"))
      return new Response(new Uint8Array(reportSize), {
        headers: { "Content-Type": reportMime },
      });
    if (url.includes("/learners?"))
      return json([{ student_number: "VT-2026-000001" }]);
    if (url.includes("/tuition_payments?id="))
      return json([
        {
          id,
          invoice_id: id,
          amount_cents: 10000,
          paid_on: "2026-10-26",
          method: "EFT",
          transaction_reference: "BANK-TEST-001",
        },
      ]);
    if (url.includes("/tuition_payments?invoice_id="))
      return json([{ amount_cents: 10000 }]);
    if (url.includes("/tuition_messages?"))
      return json([
        {
          payload: { balanceCents: 32667 },
          created_at: "2026-10-26T13:00:00Z",
        },
      ]);
    if (url.endsWith("/admin_log_document")) return json(null);
    throw new Error("Unexpected upstream call");
  });
}
describe("private document endpoints", () => {
  it.each(["invoice", "receipt", "report"])(
    "denies signed-out %s access before reading records",
    async (kind) => {
      const fetch = mocks(),
        out = res();
      await handler(req(kind, ""), out);
      expect(out.statusCode).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("streams a private report card as an authenticated download with a safe filename", async () => {
    const fetch = mocks(),
      out = res();
    await handler(req("report"), out);
    expect(out.statusCode).toBe(200);
    expect(out.headers["Content-Type"]).toBe("application/pdf");
    expect(out.headers["Cache-Control"]).toBe("no-store");
    expect(out.headers["Content-Disposition"]).toBe(
      'attachment; filename="report__unsafe_.pdf"',
    );
    expect(Buffer.from(out.body as Uint8Array).length).toBe(16);
    const request = fetch.mock.calls.find(([url]) =>
      String(url).includes("/storage/v1/object/authenticated/"),
    );
    expect(request?.[1]?.headers).toMatchObject({
      Authorization: "Bearer test",
    });
  });
  it.each([
    { mime: "text/html", size: 16, status: 409 },
    { mime: "application/pdf", size: 10485761, status: 413 },
  ])(
    "rejects an unsupported or oversized report ($status)",
    async ({ mime, size, status }) => {
      const fetch = mocks(mime, size),
        out = res();
      await handler(req("report"), out);
      expect(out.statusCode).toBe(status);
      expect(
        fetch.mock.calls.some(([url]) =>
          String(url).endsWith("/admin_log_document"),
        ),
      ).toBe(false);
    },
  );
  it.each(["invoice", "receipt"])(
    "returns a genuine private %s PDF and logs the document request",
    async (kind) => {
      const fetch = mocks(),
        out = res();
      await handler(req(kind), out);
      expect(out.statusCode).toBe(200);
      expect(out.headers["Content-Type"]).toBe("application/pdf");
      expect(out.headers["Cache-Control"]).toBe("no-store");
      expect(
        Buffer.from(out.body as Uint8Array)
          .subarray(0, 5)
          .toString(),
      ).toBe("%PDF-");
      expect(
        fetch.mock.calls.some(([url]) =>
          String(url).endsWith("/admin_log_document"),
        ),
      ).toBe(true);
    },
  );
  it("does not treat a file path or unknown kind as a document", async () => {
    mocks();
    const out = res();
    await handler(req("../private"), out);
    expect(out.statusCode).toBe(400);
  });
});
