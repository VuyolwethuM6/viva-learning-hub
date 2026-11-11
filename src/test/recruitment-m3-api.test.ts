/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic SQL/HTTP fixture validates heterogeneous JSON at runtime. */
// @vitest-environment node
import { afterAll, beforeAll, it, expect, vi } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../api/_lib/http";
import handler from "../../api/recruitment";
import { fixture } from "./helpers/recruitment-m3";
import { sha256, unseal } from "../../api/_lib/recruitment-intake";
let f: Awaited<ReturnType<typeof fixture>>,
  slug: string,
  cookie = "",
  proof = "",
  intent = "";
const objects = new Map<string, Buffer>(),
  emails: Record<string, any>[] = [];
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status });
function response() {
  const r = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    body: Buffer.alloc(0),
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end(v: unknown) {
      this.body = Buffer.isBuffer(v) ? v : Buffer.from(String(v || ""));
    },
  };
  return r as typeof r & ServerResponse;
}
async function call(
  route: string,
  body?: object,
  method?: string,
  query = "",
  auth = "",
) {
  const req = Object.assign(Readable.from([]), {
    method: method || (body ? "POST" : "GET"),
    url: "/api/recruitment?route=" + route + query,
    body,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
      cookie,
      authorization: auth,
    },
  }) as ApiRequest;
  const res = response();
  await handler(req, res);
  if (res.headers["Set-Cookie"])
    cookie = String(res.headers["Set-Cookie"]).split(";")[0];
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.body.toString(),
    json: () => JSON.parse(res.body.toString()),
  };
}
beforeAll(async () => {
  f = await fixture();
  await f.enable();
  slug = (await f.vacancy()).slug;
  vi.stubEnv("SUPABASE_URL", "https://synthetic.supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-only");
  vi.stubEnv("RECRUITMENT_PUBLIC_ORIGIN", "http://localhost:3000");
  for (const k of ["RECRUITMENT_HMAC_KEYS", "RECRUITMENT_MAIL_KEYS"])
    vi.stubEnv(
      k,
      JSON.stringify({
        current: 1,
        keys: { 1: Buffer.alloc(32, 7).toString("base64") },
      }),
    );
  vi.stubEnv("RECRUITMENT_ABUSE_KEY", Buffer.alloc(32, 8).toString("base64"));
  vi.stubEnv("RECRUITMENT_WORKER_KEY", "synthetic-worker-key".repeat(3));
  vi.stubEnv("RECRUITMENT_SCANNER_URL", "https://scanner.test");
  vi.stubEnv("RECRUITMENT_SCANNER_KEY", "synthetic-scanner-key".repeat(3));
  vi.stubEnv("RESEND_API_KEY", "synthetic");
  vi.stubEnv("EMAIL_FROM", "synthetic@example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const u = new URL(String(input)),
        h = new Headers(init?.headers);
      if (u.origin === "https://synthetic.supabase.test") {
        if (u.pathname.startsWith("/rest/v1/rpc/")) {
          const n = u.pathname.split("/").pop()!;
          if (!/^recruitment_[a-z_]+$/.test(n)) throw Error("Unexpected RPC");
          try {
            return json(await f.rpc(n, JSON.parse(String(init?.body || "{}"))));
          } catch (e) {
            return json(
              {
                code: (e as any).code || "P0001",
                message: (e as Error).message,
              },
              400,
            );
          }
        }
        if (u.pathname.startsWith("/storage/v1/object/list/")) {
          const bucket = u.pathname.split("/").pop(),
            b = JSON.parse(String(init?.body));
          return json(
            [...objects.keys()]
              .filter((k) => k.startsWith(bucket + "/" + b.prefix + "/"))
              .map((k) => ({ name: k.split("/").at(-1), id: randomUUID() })),
          );
        }
        if (u.pathname.startsWith("/storage/v1/object/")) {
          const path = u.pathname.slice("/storage/v1/object/".length);
          if (init?.method === "POST") {
            if (objects.has(path)) return json({}, 409);
            objects.set(path, Buffer.from(init.body as Uint8Array));
            return json({});
          }
          if (init?.method === "DELETE") {
            for (const p of JSON.parse(String(init.body)).prefixes)
              objects.delete(path + "/" + p);
            return json({});
          }
          return objects.has(path)
            ? new Response(new Uint8Array(objects.get(path)!))
            : json({}, 404);
        }
      }
      if (u.origin === "https://scanner.test") {
        const bytes = init?.body ? Buffer.from(init.body as Uint8Array) : null;
        const b = bytes
          ? {
              verdict: "clean",
              checksum: sha256(bytes),
              size: bytes.length,
              engine: "signed-protocol-fixture",
              definitions: "synthetic-only",
              definitionDate: new Date().toISOString(),
              policy: "pdf-v1",
              jobId: h.get("x-scan-job"),
              generation: h.get("x-scan-generation"),
              nonce: h.get("x-scan-nonce"),
              timestamp: Date.now(),
            }
          : {
              policy: "pdf-v1",
              engine: "signed-protocol-fixture",
              definitionDate: new Date().toISOString(),
              nonce: h.get("x-scan-nonce"),
            };
        const text = JSON.stringify(b);
        return new Response(text, {
          headers: {
            "x-scan-signature": createHmac(
              "sha256",
              process.env.RECRUITMENT_SCANNER_KEY!,
            )
              .update(text)
              .digest("hex"),
          },
        });
      }
      if (u.origin === "https://api.resend.com") {
        emails.push(JSON.parse(String(init?.body)));
        return json({ id: "synthetic-message" });
      }
      throw Error("Live network forbidden in acceptance tests");
    }),
  );
}, 60000);
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await f?.db.close();
});
it("verifies email, uploads through private quarantine, scans exact bytes, seals submission and sends sanitized receipts", async () => {
  expect((await call("form", undefined, "GET", "&slug=" + slug)).status).toBe(
    200,
  );
  const form = (await call("form", undefined, "GET", "&slug=" + slug)).json();
  const begin = await call("email", {
    action: "begin",
    requestId: randomUUID(),
    purpose: "vacancy",
    slug,
    email: "journey@example.test",
    noticeVersion: form.privacyNoticeVersion,
    privacyAcknowledged: true,
    adultConfirmed: true,
    caseReference: "",
  });
  expect(begin.status).toBe(202);
  const out = await f.db.query<any>(
    "select envelope from public.recruitment_email_outbox where template='verify' order by created_at desc limit 1",
  );
  const envelope = unseal(out.rows[0].envelope);
  proof = String(envelope.proof);
  intent = String(envelope.intent);
  expect(
    (
      await call("email", {
        action: "exchange",
        intentReference: intent,
        proof,
        confirmedEmail: "wrong@example.test",
        confirmation: true,
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await call("email", {
        action: "exchange",
        intentReference: intent,
        proof,
        confirmedEmail: "journey@example.test",
        confirmation: true,
      })
    ).status,
  ).toBe(200);
  expect(cookie).toMatch(/^viva_recruitment_applicant=/);
  expect(
    (
      await call("email", {
        action: "exchange",
        intentReference: intent,
        proof,
        confirmedEmail: "journey@example.test",
        confirmation: true,
      })
    ).status,
  ).toBe(401);
  let c = (await call("applicant")).json();
  expect(c.state).toBe("draft");
  const req = {
    action: "save",
    requestId: randomUUID(),
    expectedRevision: c.revision,
    formId: c.formId,
    answersPatch: f.answers,
  };
  expect((await call("applicant", req)).status).toBe(200);
  expect((await call("applicant", req)).json().replayed).toBe(true);
  c = (await call("applicant")).json();
  const bytes = Buffer.from(
      "%PDF-1.7\nSynthetic protocol document only\n%%EOF",
    ),
    reserve = await call("documents", {
      action: "reserve",
      requestId: randomUUID(),
      requirementKey: "cv",
      name: "cv.pdf",
      size: bytes.length,
      checksum: sha256(bytes),
    });
  expect(reserve.status, reserve.body).toBe(200);
  const d = reserve.json();
  expect(
    (await call("documents", undefined, "GET", "&documentId=" + d.documentId))
      .status,
  ).toBe(404);
  expect(
    (
      await call("documents", {
        action: "chunk",
        documentId: d.documentId,
        generation: d.generation,
        index: 0,
        data: bytes.toString("base64"),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call("documents", {
        action: "finalize",
        documentId: d.documentId,
        generation: d.generation,
      })
    ).status,
  ).toBe(200);
  c = (await call("applicant")).json();
  const submit = {
    action: "submit",
    requestId: randomUUID(),
    expectedRevision: c.revision,
    formId: c.formId,
    privacyAcknowledged: true,
    poolConsent: false,
  };
  expect((await call("applicant", submit)).json().error.code).toBe(
    "documents_not_clean",
  );
  const scanned = await call(
    "worker",
    { action: "scan" },
    "POST",
    "",
    `Bearer ${process.env.RECRUITMENT_WORKER_KEY}`,
  );
  expect(scanned.status, scanned.body).toBe(200);
  expect(scanned.json().scanned).toBe(1);
  const result = await call("applicant", submit);
  expect(result.status, result.body).toBe(200);
  expect(result.json().receipt).toBeTruthy();
  expect((await call("applicant", submit)).json().replayed).toBe(true);
  const download = await call(
    "documents",
    undefined,
    "GET",
    "&documentId=" + d.documentId,
  );
  expect(download.body).toBe(bytes.toString());
  expect(download.headers["Content-Disposition"]).toContain("attachment");
  const mail = await call(
    "worker",
    { action: "mail" },
    "POST",
    "",
    `Bearer ${process.env.RECRUITMENT_WORKER_KEY}`,
  );
  expect(mail.status, mail.body).toBe(200);
  expect(emails.some((e) => e.text.includes("Synthetic Applicant"))).toBe(
    false,
  );
  expect(emails.some((e) => e.text.includes("Receipt:"))).toBe(true);
}, 30000);
it("rejects cross-origin mutations, malformed inputs, unauthenticated workers and unsafe scanner configuration", async () => {
  expect((await call("worker", { action: "scan" })).status).toBe(403);
  const bad = await call("email", {
    action: "begin",
    email: "bad",
    unexpected: "pii",
  });
  expect(bad.status).toBe(400);
  expect(bad.body).not.toContain("pii");
  vi.stubEnv("RECRUITMENT_SCANNER_URL", "");
  const r = await call(
    "worker",
    { action: "scan" },
    "POST",
    "",
    `Bearer ${process.env.RECRUITMENT_WORKER_KEY}`,
  );
  expect(r.status).toBe(503);
});

it("erases verified objects and PII, then reconciles a late Storage write before evidence expiry", async () => {
  let c = (await call("applicant")).json();
  const deletion = await call("applicant", {
    action: "request_deletion",
    requestId: randomUUID(),
    expectedRevision: c.revision,
    formId: null,
    noticeVersion: "",
    consent: false,
  });
  expect(deletion.status, deletion.body).toBe(200);
  const paths = [...objects.keys()];
  expect(paths.length).toBeGreaterThan(0);
  const worker = () =>
    call(
      "worker",
      { action: "retention" },
      "POST",
      "",
      `Bearer ${process.env.RECRUITMENT_WORKER_KEY}`,
    );
  expect((await worker()).status).toBe(200);
  await f.db.exec(
    "alter table public.recruitment_cases disable trigger recruitment_case_guard",
  );
  await f.db.query(
    "update public.recruitment_cases set deletion_barrier_at=clock_timestamp()-interval '7 minutes' where id=$1",
    [c.id],
  );
  await f.db.exec(
    "alter table public.recruitment_cases enable trigger recruitment_case_guard",
  );
  await f.db.query(
    "update public.recruitment_deletion_jobs set available_at=clock_timestamp() where case_id=$1",
    [c.id],
  );
  const erased = await worker();
  expect(erased.status, erased.body).toBe(200);
  expect(erased.json().erased).toBe(true);
  expect(objects.size).toBe(0);
  objects.set(paths[0], Buffer.from("synthetic delayed write"));
  expect((await worker()).status).toBe(200);
  expect(objects.size).toBe(0);
  c = (await call("applicant")).json();
  expect(c.state).toBe("purged");
  expect(c.answers).toBeNull();
  await f.db.query(
    "update public.recruitment_erasure_evidence set expires_at=clock_timestamp()-interval '1 second',verified_at=null where case_id=$1",
    [c.id],
  );
  await f.rpc("recruitment_retention_prune");
  expect(
    (
      await f.db.query<{ n: number }>(
        "select count(*)::int n from public.recruitment_cases where id=$1",
        [c.id],
      )
    ).rows[0].n,
  ).toBe(1);
  await f.rpc("recruitment_erasure_checked", { p_case: c.id });
  await f.rpc("recruitment_retention_prune");
  expect(
    (
      await f.db.query<{ n: number }>(
        "select count(*)::int n from public.recruitment_cases where id=$1",
        [c.id],
      )
    ).rows[0].n,
  ).toBe(0);
});
