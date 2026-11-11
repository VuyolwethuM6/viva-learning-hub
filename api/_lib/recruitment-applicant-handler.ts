import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sameOrigin } from "./admin.js";
import { readJsonBody, sendJson, type ApiRequest } from "./http.js";
import {
  applicantCookie,
  applicantHash,
  applicantInput,
  abuseKey,
  clientAddress,
  configured,
  emailInput,
  id,
  IntakeError,
  intakeFailure,
  intakeLimit,
  intakeResponse,
  intakeRpc,
  keyed,
  publicOrigin,
  seal,
  secret,
  sha256,
  workerAuthorized,
} from "./recruitment-intake.js";
import {
  CHUNK_BYTES,
  storageRead,
  storageWrite,
} from "./recruitment-storage.js";
import { scanner } from "./recruitment-scanner.js";
import {
  recruitmentMail,
  recruitmentRetention,
  recruitmentScan,
} from "./recruitment-worker.js";

const docId = { documentId: id, generation: id };
const documentInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("reserve"),
      requestId: id,
      requirementKey: z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/),
      name: z.string().min(1).max(200),
      size: z.number().int().min(1).max(10485760),
      checksum: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("chunk"),
      ...docId,
      index: z.number().int().min(0).max(4),
      data: z
        .string()
        .min(1)
        .max(2796204)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    })
    .strict(),
  z.object({ action: z.enum(["finalize", "discard"]), ...docId }).strict(),
]);
export default async function handler(req: ApiRequest, res: ServerResponse) {
  intakeResponse(res);
  try {
    if ((req.url || "").length > 2048) throw new IntakeError("invalid_request");
    const url = new URL(req.url || "", "http://localhost"),
      route = url.searchParams.get("route") || "applicant";
    if (
      ![
        "form",
        "policy",
        "email",
        "applicant",
        "documents",
        "messages",
        "worker",
      ].includes(route)
    )
      throw new IntakeError("case_unavailable", 404);
    if (route === "worker") {
      if (req.method !== "POST")
        throw new IntakeError("method_not_allowed", 405);
      workerAuthorized(req);
      const body = z
        .object({
          action: z.enum(["mail", "scan", "retention"]),
          limit: z.number().int().min(1).max(10).default(5),
        })
        .strict()
        .parse(await readJsonBody(req, 1024, "Recruitment worker"));
      return sendJson(
        res,
        200,
        body.action === "mail"
          ? await recruitmentMail(body.limit)
          : body.action === "scan"
            ? await recruitmentScan()
            : await recruitmentRetention(),
      );
    }
    if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method || ""))
      throw new IntakeError("method_not_allowed", 405);
    if (req.method !== "GET") sameOrigin(req);
    await intakeLimit(req, "public-ip", 120, 60);
    if (route === "policy" && req.method === "GET") {
      if (!configured()) throw new IntakeError("intake_disabled", 503);
      return sendJson(res, 200, await intakeRpc("recruitment_policy_read", {}));
    }
    if (route === "form" && req.method === "GET") {
      if (!configured()) throw new IntakeError("intake_disabled", 503);
      const purpose = z
          .enum(["vacancy", "talent_pool"])
          .parse(url.searchParams.get("purpose") || "vacancy"),
        slug = url.searchParams.get("slug");
      if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
        throw new IntakeError("invalid_request");
      return sendJson(
        res,
        200,
        await intakeRpc("recruitment_form_read", {
          p_purpose: purpose,
          p_slug: slug,
        }),
      );
    }
    if (route === "email" && req.method === "POST") {
      if (!configured()) throw new IntakeError("intake_disabled", 503);
      const body = emailInput.parse(
        await readJsonBody(req, 4096, "Recruitment email"),
      );
      if (body.action === "inspect")
        return sendJson(
          res,
          200,
          await intakeRpc("recruitment_email_inspect", {
            p_id: body.intentReference,
            p_hash: sha256(body.proof),
          }),
        );
      if (body.action === "exchange") {
        const token = secret();
        const result = await intakeRpc("recruitment_email_exchange", {
          p_id: body.intentReference,
          p_proof_hash: sha256(body.proof),
          p_email: body.confirmedEmail,
          p_session_hash: sha256(token),
        });
        applicantCookie(res, token);
        return sendJson(res, 200, result);
      }
      const proof = secret(),
        intent = randomUUID(),
        lookup = keyed("lookup", {
          purpose: body.purpose,
          slug: body.slug,
          email: body.email,
        });
      publicOrigin();
      const result = await intakeRpc("recruitment_email_request", {
        p_data: body,
        p_id: intent,
        p_proof_hash: sha256(proof),
        p_email_hmac: lookup.digest,
        p_key_version: lookup.version,
        p_envelope: seal({ to: body.email, proof, intent }),
        p_ip_key: abuseKey("mail-ip", clientAddress(req)),
        p_email_key: abuseKey(
          "mail-email",
          `${body.purpose}:${body.slug}:${body.email}`,
        ),
        p_daily_key: abuseKey("mail-daily", "global"),
      });
      return sendJson(res, 202, result);
    }
    const hash = applicantHash(req);
    if (route === "messages" && req.method === "GET")
      return sendJson(
        res,
        200,
        await intakeRpc("recruitment_messages_page", {
          p_hash: hash,
          p_actor: null,
          p_case: null,
          p_before: z
            .string()
            .datetime({ offset: true })
            .parse(url.searchParams.get("before")),
          p_before_id: id.parse(url.searchParams.get("beforeId")),
        }),
      );
    if (route === "applicant") {
      if (req.method === "DELETE") {
        await intakeRpc("recruitment_applicant_logout", { p_hash: hash });
        applicantCookie(res);
        return sendJson(res, 200, { loggedOut: true });
      }
      if (req.method === "GET") {
        const pending = url.searchParams.get("requestId");
        if (pending) id.parse(pending);
        const result = await intakeRpc("recruitment_applicant_read", {
          p_hash: hash,
          p_request: pending,
        });
        const [documents, receipt, messages] = await Promise.all([
          intakeRpc("recruitment_applicant_documents", { p_hash: hash }),
          intakeRpc("recruitment_receipt", { p_hash: hash }),
          intakeRpc<{ items: unknown[]; hasMore: boolean }>(
            "recruitment_messages_page",
            { p_hash: hash, p_actor: null, p_case: null },
          ),
        ]);
        return sendJson(res, 200, {
          ...result,
          documents,
          receipt,
          messages: messages.items,
          messagesHasMore: messages.hasMore,
        });
      }
      if (!["POST", "PATCH"].includes(req.method || ""))
        throw new IntakeError("method_not_allowed", 405);
      const body = applicantInput.parse(
        await readJsonBody(req, 71680, "Recruitment draft"),
      );
      if (req.method === "PATCH" && body.action !== "save")
        throw new IntakeError("invalid_request");
      const context = await intakeRpc<{
        id: string;
        request?: { digestKeyVersion: number };
      }>("recruitment_applicant_read", {
        p_hash: hash,
        p_request: body.requestId,
      });
      const { action, ...data } = body,
        signed = keyed(
          "request",
          { caseId: context.id, operation: action, data },
          context.request?.digestKeyVersion,
        );
      await intakeLimit(req, "draft-case", 300, 3600, context.id);
      const args = {
        p_hash: hash,
        d: data,
        p_digest: signed.digest,
        p_key_version: signed.version,
      };
      if (action === "reapply") {
        const token = secret(),
          result = await intakeRpc("recruitment_reapply", {
            ...args,
            p_new_session: sha256(token),
          });
        if (result.issued === true) applicantCookie(res, token);
        return sendJson(res, 200, result);
      }
      const result =
        action === "submit"
          ? await intakeRpc("recruitment_submit", args)
          : action === "reply"
            ? await intakeRpc("recruitment_applicant_reply", args)
            : ["withdraw", "request_deletion", "renew"].includes(action)
              ? await intakeRpc("recruitment_privacy_command", {
                  ...args,
                  p_action: action,
                })
              : await intakeRpc("recruitment_applicant_mutate", {
                  p_hash: hash,
                  p_action: action,
                  p_data: data,
                  p_digest: signed.digest,
                  p_key_version: signed.version,
                });
      return sendJson(res, 200, result);
    }
    if (route === "documents") {
      if (req.method === "GET") {
        const documentId = id.parse(url.searchParams.get("documentId")),
          part = z.coerce
            .number()
            .int()
            .min(0)
            .max(4)
            .parse(url.searchParams.get("part") || "0");
        const access = await intakeRpc<{
          path: string;
          checksum: string;
          size: number;
        }>("recruitment_document_access", {
          p_hash: hash,
          p_actor: null,
          p_document: documentId,
        });
        const bytes = await storageRead("recruitment-documents", access.path);
        if (bytes.length !== access.size || sha256(bytes) !== access.checksum)
          throw new IntakeError("storage_integrity_failure", 503);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="document.part"',
        );
        res.setHeader("X-Document-Size", String(bytes.length));
        return res.end(
          bytes.subarray(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES),
        );
      }
      if (req.method !== "POST")
        throw new IntakeError("method_not_allowed", 405);
      const body = documentInput.parse(
        await readJsonBody(req, 2800000, "Recruitment document"),
      );
      if (body.action === "reserve") {
        const readiness = await intakeRpc<{ policy: string }>(
          "recruitment_document_mutate",
          {
            p_hash: hash,
            p_action: "readiness",
            d: {},
            p_digest: "0".repeat(64),
            p_key_version: 1,
          },
        );
        const health = await scanner().health();
        if (health.policy !== readiness.policy)
          throw new IntakeError("scanner_unavailable", 503);
        const { action, ...data } = body;
        const context = await intakeRpc<{
          id: string;
          request?: { digestKeyVersion: number };
        }>("recruitment_applicant_read", {
          p_hash: hash,
          p_request: body.requestId,
        });
        const signed = keyed(
          "request",
          { caseId: context.id, operation: "reserve", data },
          context.request?.digestKeyVersion,
        );
        return sendJson(
          res,
          200,
          await intakeRpc("recruitment_document_mutate", {
            p_hash: hash,
            p_action: "reserve",
            d: data,
            p_digest: signed.digest,
            p_key_version: signed.version,
          }),
        );
      }
      if (body.action === "chunk") {
        const bytes = Buffer.from(body.data, "base64");
        if (
          !bytes.length ||
          bytes.length > CHUNK_BYTES ||
          bytes.toString("base64") !== body.data
        )
          throw new IntakeError("invalid_chunk");
        const data = {
          documentId: body.documentId,
          generation: body.generation,
          index: body.index,
          size: bytes.length,
          checksum: sha256(bytes),
        };
        const path = await intakeRpc<{ path: string }>(
          "recruitment_document_mutate",
          {
            p_hash: hash,
            p_action: "chunk_plan",
            d: data,
            p_digest: "0".repeat(64),
            p_key_version: 1,
          },
        );
        await storageWrite(
          "recruitment-quarantine",
          path.path,
          bytes,
          "application/octet-stream",
        );
        await intakeRpc("recruitment_document_mutate", {
          p_hash: hash,
          p_action: "chunk_commit",
          d: data,
          p_digest: "0".repeat(64),
          p_key_version: 1,
        });
        return sendJson(res, 200, { saved: true, index: body.index });
      }
      const { action, ...data } = body;
      return sendJson(
        res,
        200,
        await intakeRpc("recruitment_document_mutate", {
          p_hash: hash,
          p_action: action,
          d: data,
          p_digest: "0".repeat(64),
          p_key_version: 1,
        }),
      );
    }
    throw new IntakeError("method_not_allowed", 405);
  } catch (error) {
    return intakeFailure(res, error);
  }
}
