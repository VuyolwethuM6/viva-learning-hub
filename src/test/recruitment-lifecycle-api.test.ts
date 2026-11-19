/* eslint-disable @typescript-eslint/no-explicit-any -- Real SQL with bounded synthetic identity adapter. */
// @vitest-environment node
import { afterAll, beforeAll, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../api/_lib/http";
import handler from "../../api/recruitment";
import { fixture, owner, manager } from "./helpers/recruitment-m3";
let f: Awaited<ReturnType<typeof fixture>>, caseId: string, hash: string, actor = owner;
vi.mock("../../api/_lib/recruitment-auth", async (original) => ({ ...await original<object>(), requireRecruitment: vi.fn(async (req: ApiRequest) => { if (!req.headers.cookie)
        throw new Error("missing identity"); return { id: actor, email: actor === owner ? "owner@example.test" : "manager@example.test", role: actor === owner ? "owner" : "manager", aal: "aal2" }; }) }));
vi.mock("../../api/_lib/recruitment-case-service", async (original) => ({ ...await original<object>(), fresh: vi.fn(async (_req: unknown, _res: unknown, user: unknown, auth: any, callback: any) => { if (auth.password !== "synthetic-password")
        throw new Error("identity unconfirmed"); return callback(user, "a".repeat(64), "b".repeat(64)); }) }));
vi.mock("../../api/_lib/recruitment-intake", async (original) => {
    const actual = await original<any>();
    return { ...actual, applicantHash: () => hash, intakeLimit: async () => { }, intakeRpc: async (name: string, args: any) => { try {
            return await f.rpc(name, args);
        }
        catch (e) {
            const raw = (e as Error).message;
            const code = /Recruitment permission|staff console is disabled/.test(raw) ? "access_denied" : raw;
            throw new actual.IntakeError(/^[a-z_]+$/.test(code) ? code : "service_unavailable", code === "access_denied" ? 403 : code === "intake_disabled" ? 503 : 400);
        } } };
});
async function call(path: string, body?: object, extra: Record<string, string> = {}) {
    const req = Object.assign(Readable.from([]), { method: body ? "POST" : "GET", url: path, body, headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: "synthetic-staff", "content-type": "application/json", ...extra } }) as ApiRequest;
    const r = { statusCode: 200, body: "", headers: {} as Record<string, unknown>, setHeader(k: string, v: unknown) { this.headers[k] = v; }, end(v: unknown) { this.body = String(v || ""); } };
    await handler(req, r as unknown as ServerResponse);
    return { ...r, json: () => JSON.parse(r.body) };
}
beforeAll(async () => {
    f = await fixture();
    for (const n of ["15010000_recruitment_selection", "15020000_recruitment_engagement", "15025000_recruitment_onboarding_documents", "15030000_recruitment_lifecycle_workers"])
        await f.db.exec(readFileSync(`supabase/migrations/202611${n}.sql`, "utf8"));
    await f.enable();
    const v = await f.vacancy("tutor", false), s = await f.email(v.slug);
    hash = s.hash;
    let c = await f.rpc("recruitment_applicant_read", { p_hash: hash });
    await f.rpc("recruitment_applicant_mutate", { p_hash: hash, p_action: "save", p_data: { requestId: randomUUID(), expectedRevision: c.revision, formId: c.formId, answersPatch: f.answers }, p_digest: "f".repeat(64), p_key_version: 1 });
    c = await f.rpc("recruitment_applicant_read", { p_hash: hash });
    caseId = c.id;
    await f.rpc("recruitment_submit", { p_hash: hash, d: { requestId: randomUUID(), expectedRevision: c.revision, formId: c.formId, poolConsent: false, privacyAcknowledged: true }, p_digest: "e".repeat(64), p_key_version: 1 });
}, 60000);
afterAll(async () => { await f?.db.close(); });
it("routes new APIs privately and leaves selection disabled", async () => {
    const r = await call("/api/admin/recruitment?route=selection");
    expect(r.statusCode).toBe(200);
    expect(r.json().enabled).toBe(false);
    expect(r.headers["Cache-Control"]).toContain("no-store");
    const d = { requestId: randomUUID(), caseId, expectedRevision: 0, checks: [{ key: "qualification", complete: true, evidence: "Synthetic review" }], notes: "Reviewed original submission" };
    expect((await call("/api/admin/recruitment?route=selection", { operation: "screen", data: d, password: "synthetic-password" })).statusCode).toBe(503);
    await f.db.exec("update public.recruitment_settings set selection_enabled=true");
});
it("preserves CSRF checks and rejects malformed command data before SQL", async () => {
    const r = await call("/api/admin/recruitment?route=selection", { operation: "screen", data: {} }, { origin: "https://untrusted.test" });
    expect(r.statusCode).toBe(403);
    expect((await call("/api/admin/recruitment?route=selection", { operation: "screen", data: { caseId }, password: "synthetic-password" })).statusCode).toBe(400);
    expect((await call("/api/admin/recruitment?route=engagement", { operation: "activation_approve", data: { caseId }, password: "synthetic-password" })).statusCode).toBe(400);
});
it("uses real scope checks, avoids search URLs and recovers exact staff requests", async () => {
    const d = { requestId: randomUUID(), caseId, expectedRevision: 0, checks: [{ key: "qualification", complete: true, evidence: "Synthetic review" }], notes: "Reviewed original submission" };
    actor = manager;
    expect((await call("/api/admin/recruitment?route=selection", { operation: "screen", data: d, password: "synthetic-password" })).statusCode).toBe(403);
    actor = owner;
    expect((await call("/api/admin/recruitment?route=selection", { operation: "screen", data: d, password: "synthetic-password" })).statusCode).toBe(200);
    const replay = await call("/api/admin/recruitment?route=selection", { operation: "screen", data: d, password: "synthetic-password" });
    expect(replay.statusCode).toBe(200);
    const recovered = await call(`/api/admin/recruitment?route=selection&requestId=${d.requestId}`);
    expect(recovered.json().state).toBe("committed");
    const direct = await f.rpc("recruitment_selection_read", { p_actor: owner, p_search: "Synthetic", p_aal: "aal2" });
    expect(direct.items).toHaveLength(1);
    const searched = await call("/api/admin/recruitment?route=selection", { action: "list", search: "Synthetic", status: "", offset: 0 });
    expect(searched.statusCode, searched.body).toBe(200);
    expect(searched.json().items).toHaveLength(1);
    const changed = await call("/api/admin/recruitment?route=selection", { operation: "screen", data: { ...d, notes: "Changed request" }, password: "synthetic-password" });
    expect(changed.statusCode).toBeGreaterThanOrEqual(400);
});
it("never projects internal notes, scorecards, decisions or staff data to the applicant", async () => {
    const r = await call("/api/recruitment?route=selection");
    expect(r.statusCode).toBe(200);
    for (const k of ["screening", "evaluations", "recommendations", "history", "eligibleInterviewers"])
        expect(r.json()).not.toHaveProperty(k);
    expect(r.body).not.toContain("Reviewed original submission");
    const arbitrary = await call("/api/recruitment?route=selection", { requestId: randomUUID(), interviewId: randomUUID(), response: "confirmed" });
    expect(arbitrary.statusCode).toBeGreaterThanOrEqual(400);
});
