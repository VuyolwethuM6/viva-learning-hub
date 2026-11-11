// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
import { webcrypto } from "node:crypto";
import {
  uploadApplicant,
  applicantPending,
  applicantRequest,
} from "../lib/recruitment-applicant-client";
afterEach(() => {
  vi.unstubAllGlobals();
});
it("uploads only explicit document identifiers after a verbose reservation response", async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => values.get(k) || null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  vi.stubGlobal("crypto", webcrypto);
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return new Response(
        JSON.stringify(
          body.action === "reserve"
            ? {
                documentId: "11111111-1111-4111-8111-111111111111",
                generation: "22222222-2222-4222-8222-222222222222",
                chunks: {},
                size: 30,
              }
            : { saved: true },
        ),
      );
    }),
  );
  await uploadApplicant(
    new File(["%PDF-1.7\n%%EOF"], "test.pdf", { type: "application/pdf" }),
    "cv",
    () => undefined,
  );
  expect(calls.map((c) => c.action)).toEqual(["reserve", "chunk", "finalize"]);
  expect(Object.keys(calls[1]).sort()).toEqual([
    "action",
    "data",
    "documentId",
    "generation",
    "index",
  ]);
  expect(Object.keys(calls[2]).sort()).toEqual([
    "action",
    "documentId",
    "generation",
  ]);
  expect(applicantPending()).toBeNull();
  expect([...values.values()]).toEqual([]);
});
it("treats HTML gateway failures and malformed success responses as uncertain", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response("<html>Bad Gateway</html>", { status: 502 }),
    ),
  );
  await expect(
    applicantRequest("applicant", { action: "submit" }),
  ).rejects.toMatchObject({ code: "outcome_uncertain", confirmed: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("")),
  );
  await expect(applicantRequest("applicant")).rejects.toMatchObject({
    code: "outcome_uncertain",
    confirmed: false,
  });
});
