import { randomUUID } from "node:crypto";
import {
  IntakeError,
  intakeRpc,
  publicOrigin,
  sha256,
  unseal,
} from "./recruitment-intake.js";
import { scanner } from "./recruitment-scanner.js";
import {
  CHUNK_BYTES,
  storageDeleteFile,
  storageDeletePrefix,
  storageRead,
  storageWrite,
  validatePdf,
} from "./recruitment-storage.js";
import { escapeHtml } from "./email.js";

type MailJob = {
  id: string;
  template: string;
  envelope: unknown;
  to: string | null;
  data: { receipt?: string; submittedAt?: string };
  key: string;
};
type ScanJob = {
  jobId: string;
  documentId: string;
  generation: string;
  prefix: string;
  chunks: Record<string, { size: number; checksum: string }>;
  size: number;
  checksum: string;
  cleanPath: string;
};
export async function recruitmentMail(limit = 5) {
  const key = process.env.RESEND_API_KEY,
    from = process.env.EMAIL_FROM;
  if (!key || !from) throw new IntakeError("mail_unavailable", 503);
  let sent = 0,
    deferred = 0;
  for (let i = 0; i < Math.min(limit, 10); i++) {
    const claim = randomUUID(),
      job = await intakeRpc<MailJob | null>("recruitment_mail_claim", {
        p_claim: claim,
      });
    if (!job) break;
    let accepted = false,
      provider = "";
    try {
      let to = job.to,
        text: string;
      if (job.template === "verify") {
        const e = unseal(job.envelope);
        if (
          typeof e.to !== "string" ||
          typeof e.intent !== "string" ||
          typeof e.proof !== "string" ||
          !/^[0-9a-f]{64}$/.test(e.proof) ||
          !/^[0-9a-f-]{36}$/.test(e.intent)
        )
          throw new IntakeError("delivery_envelope_invalid", 503);
        to = e.to;
        text = `Confirm your email for Viva Tutorials recruitment. Open this link, check the purpose and confirm your address. The link expires after 15 minutes.\n\n${publicOrigin()}/recruitment/verify#intent=${e.intent}&proof=${e.proof}\n\nIf you did not request this, ignore this email.`;
      } else if (job.template === "receipt")
        text = `Viva Tutorials received your application. Receipt: ${job.data.receipt}. Submitted: ${job.data.submittedAt}. This is confirmation of receipt, not a hiring decision. Recover your application at ${publicOrigin()}/recruitment/recover.`;
      else if (job.template.startsWith("staff_"))
        text = `A recruitment case requires your attention. Sign in to the private recruitment workspace: ${publicOrigin()}/admin/recruitment`;
      else
        text = `A recruitment clarification is available. Verify your email to read and respond: ${publicOrigin()}/recruitment/recover`;
      if (!to) throw new IntakeError("recipient_unavailable", 503);
      // Current case/recipient/flag authorization is rechecked immediately before dispatch.
      const allowed = await intakeRpc<boolean>("recruitment_mail_authorize", {
        p_id: job.id,
        p_claim: claim,
      });
      if (!allowed) {
        deferred++;
        continue;
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": job.key,
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject:
            job.template === "verify"
              ? "Your Viva Tutorials recruitment link"
              : "Viva Tutorials recruitment update",
          text,
          html: `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>`,
        }),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      accepted = response.ok;
      if (accepted) {
        const body = (await response.json().catch(() => ({}))) as {
          id?: string;
        };
        provider = /^[A-Za-z0-9_-]{1,160}$/.test(body.id || "") ? body.id! : "";
      }
    } catch {
      /* Never log envelopes, recipients, provider bodies or proofs. */
    }
    await intakeRpc("recruitment_mail_complete", {
      p_id: job.id,
      p_claim: claim,
      p_sent: accepted,
      p_provider_ref: provider || null,
    });
    if (accepted) sent++;
    else deferred++;
  }
  return { sent, deferred };
}
export async function recruitmentScan() {
  const cfg = await intakeRpc<{
    policy: string | null;
    uploads: boolean;
    ready: boolean;
  }>("recruitment_worker_settings", {});
  if (!cfg.uploads || !cfg.ready) return { scanned: 0 };
  const adapter = scanner(),
    health = await adapter.health();
  if (!cfg.policy || cfg.policy !== health.policy)
    throw new IntakeError("scanner_unavailable", 503);
  const claim = randomUUID(),
    job = await intakeRpc<ScanJob | null>("recruitment_scan_claim", {
      p_claim: claim,
    });
  if (!job) return { scanned: 0 };
  const began = Date.now();
  let cleanWritten = false;
  try {
    const parts: Buffer[] = [];
    for (let index = 0; index < Math.ceil(job.size / CHUNK_BYTES); index++) {
      const bytes = await storageRead(
        "recruitment-quarantine",
        `${job.prefix}/${index}`,
        CHUNK_BYTES,
      );
      if (
        bytes.length !== job.chunks[index]?.size ||
        sha256(bytes) !== job.chunks[index]?.checksum
      )
        throw new IntakeError("upload_integrity_failure", 400);
      parts.push(bytes);
    }
    const bytes = Buffer.concat(parts);
    validatePdf(bytes);
    if (bytes.length !== job.size || sha256(bytes) !== job.checksum)
      throw new IntakeError("upload_integrity_failure", 400);
    const result = await adapter.scan(bytes, {
      jobId: job.jobId,
      generation: job.generation,
      policy: cfg.policy,
    });
    if (result.verdict === "clean") {
      if (
        Date.now() - began > 240000 ||
        !(await intakeRpc<boolean>("recruitment_scan_promote", {
          p_job: job.jobId,
          p_claim: claim,
        }))
      )
        throw new IntakeError("worker_lease_expired", 409);
      await storageWrite(
        "recruitment-documents",
        job.cleanPath,
        bytes,
        "application/pdf",
      );
      cleanWritten = true;
    }
    const done = await intakeRpc<{ accepted: boolean }>(
      "recruitment_scan_complete",
      {
        p_job: job.jobId,
        p_claim: claim,
        d: {
          ...result,
          cleanPath: result.verdict === "clean" ? job.cleanPath : "",
        },
      },
    );
    if (!done.accepted && cleanWritten)
      await storageDeleteFile("recruitment-documents", job.cleanPath);
    return { scanned: done.accepted ? 1 : 0 };
  } catch (e) {
    // A clean promotion with an uncertain DB response must not be deleted: it may be committed.
    if (!cleanWritten)
      await intakeRpc("recruitment_scan_complete", {
        p_job: job.jobId,
        p_claim: claim,
        d: {
          verdict:
            e instanceof IntakeError && e.status === 400 ? "infected" : "error",
          checksum: job.checksum,
          size: job.size,
          engine: "validation-or-provider",
          definitions: "unavailable",
          policy: cfg.policy,
          cleanPath: "",
        },
      }).catch(() => undefined);
    return { scanned: 0, deferred: 1 };
  }
}
type ErasureJob = {
  jobId: string;
  caseId: string;
  prefixes: { quarantine: string; cleanPrefix: string }[];
};
export async function recruitmentRetention() {
  const schedule = await intakeRpc("recruitment_retention_schedule", {}),
    claim = randomUUID();
  const job = await intakeRpc<ErasureJob | null>("recruitment_deletion_claim", {
    p_claim: claim,
  });
  let erased = false;
  if (job) {
    let verified = true;
    try {
      for (const path of job.prefixes) {
        verified =
          (await storageDeletePrefix(
            "recruitment-quarantine",
            path.quarantine,
          )) && verified;
        verified =
          (await storageDeletePrefix(
            "recruitment-documents",
            path.cleanPrefix,
          )) && verified;
      }
    } catch {
      verified = false;
    }
    const result = await intakeRpc<{ complete: boolean }>(
      "recruitment_deletion_complete",
      { p_job: job.jobId, p_claim: claim, p_objects_verified: verified },
    );
    erased = result.complete;
  }
  // Reconcile late writes using the finite erasure manifest; no email survives here.
  const evidence = await intakeRpc<
    { caseId: string; prefixes: ErasureJob["prefixes"] }[]
  >("recruitment_erasure_manifest", {});
  for (const record of evidence) {
    let verified = true;
    for (const path of record.prefixes) {
      verified =
        (await storageDeletePrefix(
          "recruitment-quarantine",
          path.quarantine,
        )) && verified;
      verified =
        (await storageDeletePrefix(
          "recruitment-documents",
          path.cleanPrefix,
        )) && verified;
    }
    if (verified)
      await intakeRpc("recruitment_erasure_checked", { p_case: record.caseId });
  }
  await intakeRpc("recruitment_retention_prune", {});
  const discarded = await intakeRpc<
    { id: string; prefix: string; cleanPrefix: string }[]
  >("recruitment_discarded_documents", {});
  for (const doc of discarded) {
    const verified =
      (await storageDeletePrefix("recruitment-quarantine", doc.prefix)) &&
      (await storageDeletePrefix("recruitment-documents", doc.cleanPrefix));
    if (verified)
      await intakeRpc("recruitment_discard_complete", { p_id: doc.id });
  }
  return { ...schedule, erased };
}
