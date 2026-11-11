import type { ServerResponse } from "node:http";
import { z } from "zod";
import { readJsonBody, sendJson, type ApiRequest } from "./http.js";
import {
  recruitmentAuth,
  recruitmentCookies,
  recruitmentIdentity,
  recruitmentSession,
  recruitmentToken,
  digest,
  limitRecruitment,
} from "./recruitment-auth.js";
import {
  id,
  revision,
  IntakeError,
  intakeFailure,
  intakeLimit,
  intakeRpc,
  keyed,
  secret,
  sha256,
} from "./recruitment-intake.js";
import { CHUNK_BYTES, storageRead } from "./recruitment-storage.js";
import type { RecruitmentUser } from "../../src/lib/recruitment-types.js";

const evidence = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$/);
const base = { requestId: id, caseId: id, expectedRevision: revision };
const commands = {
  declare_conflict: z.object(base).strict(),
  assign: z.object({ ...base, userId: id }).strict(),
  revoke_assignment: z.object({ ...base, userId: id }).strict(),
  note: z
    .object({
      ...base,
      changeId: id,
      payloadDigest: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  clarify: z
    .object({
      ...base,
      changeId: id,
      payloadDigest: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  recommend: z
    .object({
      ...base,
      changeId: id,
      payloadDigest: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  hold: z
    .object({
      ...base,
      holdId: id.nullable(),
      release: z.boolean(),
      evidenceRef: evidence,
      reasonCode: z.enum(["legal_obligation", "dispute", "rights_request"]),
      reviewAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  extend_retention: z
    .object({
      ...base,
      until: z.string().datetime({ offset: true }),
      approvalReference: evidence,
    })
    .strict(),
  resolve_conflict: z
    .object({ ...base, userId: id, approvalReference: evidence })
    .strict(),
  reapply: z
    .object({
      ...base,
      until: z.string().datetime({ offset: true }),
      approvalReference: evidence,
    })
    .strict(),
};
const credentials = z.object({
  password: z.string().min(1).max(1024),
  factorId: id.optional(),
  code: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
/** Same provider/password/TOTP/session-rotation semantics as M1; no new identity provider. */
async function fresh<T>(
  req: ApiRequest,
  res: ServerResponse,
  user: RecruitmentUser,
  authInput: z.infer<typeof credentials>,
  callback: (
    verified: RecruitmentUser,
    newHash: string,
    oldHash: string,
  ) => Promise<T>,
) {
  await limitRecruitment(req, user.id);
  let session = await recruitmentSession(
    await recruitmentAuth("token?grant_type=password", {
      email: user.email,
      password: authInput.password,
    }),
  );
  let retained = false;
  try {
    let verified = await recruitmentIdentity(session.access_token);
    if (verified.id !== user.id) throw new IntakeError("access_denied", 403);
    if (verified.role === "owner" && verified.ownerAal2Required) {
      if (
        !authInput.factorId ||
        !authInput.code ||
        !verified.mfaFactors?.some((f) => f.id === authInput.factorId)
      )
        throw new IntakeError("mfa_required", 403);
      const challenge = await recruitmentAuth(
        `factors/${authInput.factorId}/challenge`,
        {},
        session.access_token,
      );
      if (!challenge.ok) throw new IntakeError("mfa_required", 403);
      const data = (await challenge.json()) as { id?: string };
      id.parse(data.id);
      session = await recruitmentSession(
        await recruitmentAuth(
          `factors/${authInput.factorId}/verify`,
          { challenge_id: data.id, code: authInput.code },
          session.access_token,
        ),
      );
      verified = await recruitmentIdentity(session.access_token);
      if (verified.id !== user.id || verified.aal !== "aal2")
        throw new IntakeError("mfa_required", 403);
    }
    const result = await callback(
      verified,
      digest(session.access_token),
      digest(recruitmentToken(req)),
    );
    recruitmentCookies(res, session);
    retained = true;
    if (recruitmentToken(req) !== session.access_token)
      await recruitmentAuth(
        "logout?scope=local",
        {},
        recruitmentToken(req),
      ).catch(() => undefined);
    return result;
  } finally {
    if (!retained)
      await recruitmentAuth(
        "logout?scope=local",
        {},
        session.access_token,
      ).catch(() => undefined);
  }
}
export async function handleRecruitmentCases(
  req: ApiRequest,
  res: ServerResponse,
  user: RecruitmentUser,
  route: string,
  url: URL,
) {
  try {
    if (req.method === "GET") {
      if (route === "forms")
        return sendJson(
          res,
          200,
          await intakeRpc("recruitment_intake_workspace", { p_actor: user.id }),
        );
      if (route === "privacy")
        return sendJson(
          res,
          200,
          await intakeRpc("recruitment_privacy_read", {
            p_actor: user.id,
            p_reference: id.parse(url.searchParams.get("reference")),
            p_aal: user.aal || "aal1",
          }),
        );
      if (route === "applications") {
        if (url.searchParams.has("search"))
          throw new IntakeError("invalid_request");
        const caseId = url.searchParams.get("caseId"),
          after = url.searchParams.get("after"),
          afterId = url.searchParams.get("afterId");
        return sendJson(
          res,
          200,
          await intakeRpc("recruitment_cases_read", {
            p_actor: user.id,
            p_case: caseId ? id.parse(caseId) : null,
            p_kind: z
              .enum(["", "vacancy", "talent_pool"])
              .parse(url.searchParams.get("kind") || ""),
            p_search: z
              .string()
              .max(160)
              .parse(url.searchParams.get("search") || ""),
            p_after: after
              ? z.string().datetime({ offset: true }).parse(after)
              : null,
            p_after_id: afterId ? id.parse(afterId) : null,
            p_aal: user.aal || "aal1",
          }),
        );
      }
      if (route === "case-messages")
        return sendJson(
          res,
          200,
          await intakeRpc("recruitment_messages_page", {
            p_hash: "",
            p_actor: user.id,
            p_case: id.parse(url.searchParams.get("caseId")),
            p_before: z
              .string()
              .datetime({ offset: true })
              .parse(url.searchParams.get("before")),
            p_before_id: id.parse(url.searchParams.get("beforeId")),
            p_aal: user.aal || "aal1",
          }),
        );
      if (route === "case-recover")
        return sendJson(
          res,
          200,
          await intakeRpc("recruitment_case_recover", {
            p_actor: user.id,
            p_request: id.parse(url.searchParams.get("requestId")),
          }),
        );
      if (route === "case-documents") {
        const access = await intakeRpc<{
          path: string;
          size: number;
          checksum: string;
        }>("recruitment_document_access", {
          p_hash: "",
          p_actor: user.id,
          p_document: id.parse(url.searchParams.get("documentId")),
          p_aal: user.aal || "aal1",
        });
        const part = z.coerce
            .number()
            .int()
            .min(0)
            .max(4)
            .parse(url.searchParams.get("part") || "0"),
          bytes = await storageRead("recruitment-documents", access.path);
        if (sha256(bytes) !== access.checksum || bytes.length !== access.size)
          throw new IntakeError("storage_integrity_failure", 503);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="document.part"',
        );
        res.setHeader("X-Document-Size", String(bytes.length));
        res.statusCode = 200;
        return res.end(
          bytes.subarray(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES),
        );
      }
      throw new IntakeError("method_not_allowed", 405);
    }
    if (req.method !== "POST") throw new IntakeError("method_not_allowed", 405);
    const input = await readJsonBody(req, 16384, "Recruitment case");
    if (route === "applications") {
      const body = z
        .object({
          search: z.string().max(160).default(""),
          kind: z.enum(["", "vacancy", "talent_pool"]).default(""),
          after: z.string().datetime({ offset: true }).optional(),
          afterId: id.optional(),
        })
        .strict()
        .parse(input);
      await intakeLimit(req, "staff-case-search", 60, 60, user.id);
      return sendJson(
        res,
        200,
        await intakeRpc("recruitment_cases_read", {
          p_actor: user.id,
          p_case: null,
          p_kind: body.kind,
          p_search: body.search,
          p_after: body.after || null,
          p_after_id: body.afterId || null,
          p_aal: user.aal || "aal1",
        }),
      );
    }
    if (route === "case-step-up") {
      const auth = credentials.strict().parse(input);
      return sendJson(
        res,
        200,
        await fresh(req, res, user, auth, async () => ({ confirmed: true })),
      );
    }
    if (route === "case-stage") {
      const body = z
        .object({
          caseId: id,
          expectedRevision: revision,
          operation: z.enum(["note", "clarify", "recommend"]),
          payload: z
            .object({
              text: z.string().trim().min(1).max(4000),
              recommendation: z.enum([
                "",
                "progress",
                "do_not_progress",
                "hold",
              ]),
            })
            .strict(),
        })
        .strict()
        .parse(input);
      if (
        (body.operation === "recommend" && !body.payload.recommendation) ||
        Buffer.byteLength(JSON.stringify(body.payload)) > 8192
      )
        throw new IntakeError("invalid_request");
      await intakeLimit(req, "staff-stage", 20, 60, user.id);
      const signed = keyed("case-payload", body);
      return sendJson(
        res,
        200,
        await intakeRpc("recruitment_case_stage", {
          p_actor: user.id,
          p_session: digest(recruitmentToken(req)),
          p_case: body.caseId,
          p_revision: body.expectedRevision,
          p_operation: body.operation,
          p_payload: body.payload,
          p_digest: signed.digest,
        }),
      );
    }
    if (!["case-reauthenticate", "case-mutate"].includes(route))
      throw new IntakeError("method_not_allowed", 405);
    const body = z
      .object({
        operation: z.enum([
          "assign",
          "revoke_assignment",
          "note",
          "clarify",
          "recommend",
          "hold",
          "extend_retention",
          "resolve_conflict",
          "reapply",
          "declare_conflict",
        ]),
        data: z.record(z.unknown()),
        keyVersion: z.number().int().positive().optional(),
        proof: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional(),
        password: z.string().min(1).max(1024).optional(),
        factorId: id.optional(),
        code: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
      })
      .strict()
      .parse(input);
    const data = commands[body.operation].parse(body.data) as Record<
        string,
        unknown
      > & { requestId: string },
      normalized = { ...data };
    delete normalized.changeId;
    const signed = keyed(
      "case-command",
      { operation: body.operation, data: normalized },
      body.keyVersion,
    );
    if (route === "case-reauthenticate") {
      const auth = credentials.parse(body),
        proof = secret();
      const prepared = await fresh(
        req,
        res,
        user,
        auth,
        (verified, newHash, oldHash) =>
          intakeRpc("recruitment_case_prepare", {
            p_actor: verified.id,
            p_old_session: oldHash,
            p_new_session: newHash,
            p_operation: body.operation,
            d: data,
            p_secret: sha256(proof),
            p_digest: signed.digest,
            p_aal: verified.aal || "aal1",
          }),
      );
      return sendJson(res, 200, {
        ...prepared,
        proof,
        keyVersion: signed.version,
      });
    }
    if (!body.proof) throw new IntakeError("fresh_confirmation_required", 403);
    const result = await intakeRpc("recruitment_case_mutate", {
      p_actor: user.id,
      p_session: digest(recruitmentToken(req)),
      p_operation: body.operation,
      d: data,
      p_proof: sha256(body.proof),
      p_digest: signed.digest,
      p_key_version: signed.version,
      p_aal: user.aal || "aal1",
    });
    if (result.saved !== true)
      throw new IntakeError("outcome_uncertain", 503, false);
    return sendJson(res, 200, { result });
  } catch (error) {
    return intakeFailure(res, error);
  }
}
