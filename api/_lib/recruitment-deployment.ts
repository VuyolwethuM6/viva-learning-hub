import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ServerResponse } from "node:http";
import { rpc } from "./admin.js";
import { HttpError, sendJson, type ApiRequest } from "./http.js";
import type { RecruitmentUser } from "../../src/lib/recruitment-types.js";

const directory = "docs/recruitment/production-installation";
const supplementary = [
  "docs/recruitment/owner-recovery-runbook.md",
  "docs/recruitment/milestone-3/operations.md",
  "docs/recruitment/milestone-3/api-and-security.md",
  "docs/recruitment/milestone-3/implementation-report.md",
];
type Artifact = { path: string; sha256: string; bytes: number };
type Manifest = {
  sourceCommit: string;
  sourceSetSha256: string;
  sourceMigrations: (Artifact & { order: number })[];
  files: Artifact[];
};
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
async function inventory() {
  const manifest: Manifest = JSON.parse(
    await readFile(resolve(process.cwd(), directory, "manifest.json"), "utf8"),
  );
  if (
    manifest.sourceMigrations.length !== 11 ||
    !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) ||
    !/^[a-f0-9]{64}$/.test(manifest.sourceSetSha256) ||
    !manifest.files.every(
      (f) =>
        /^[a-zA-Z0-9_@.-]+(?:\/[a-zA-Z0-9_@.-]+)*$/.test(f.path) &&
        !f.path.includes("..") &&
        /^[a-f0-9]{64}$/.test(f.sha256) &&
        Number.isSafeInteger(f.bytes) &&
        f.bytes > 0 &&
        f.bytes < 1_000_000,
    )
  )
    throw Error("Invalid deployment artifact manifest");
  return manifest;
}

/** Static, reviewed repository files only. No SQL runner, shell or operational journal. */
export async function handleRecruitmentDeployment(
  req: ApiRequest,
  res: ServerResponse,
  user: RecruitmentUser,
  url: URL,
) {
  // Authentication is checked by the router; recheck current database authority
  // before any filesystem read, including when the console is disabled.
  if (user.role !== "owner")
    throw new HttpError(403, "Recruitment owner access is required.");
  const authority = await rpc<{ role: string }>("recruitment_context", {
    p_actor: user.id,
  });
  if (authority.role !== "owner")
    throw new HttpError(403, "Recruitment owner access is required.");
  if (req.method !== "GET")
    throw new HttpError(405, "Deployment preparation is read-only.");
  const manifest = await inventory();
  const document = url.searchParams.get("document");
  if (document !== null) {
    const artifact = manifest.files.find((f) => f.path === document);
    const extra = supplementary.includes(document);
    if (!artifact && !extra)
      throw new HttpError(404, "Deployment document unavailable.");
    const bytes = await readFile(
      resolve(process.cwd(), extra ? document : `${directory}/${document}`),
    );
    if (
      bytes.length > 1_000_000 ||
      (artifact &&
        (hash(bytes) !== artifact.sha256 || bytes.length !== artifact.bytes))
    )
      throw new HttpError(503, "Deployment artifact integrity check failed.");
    if (url.searchParams.get("download") === "1") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${document.split("/").pop()}"`,
      );
      res.statusCode = 200;
      return res.end(bytes);
    }
    return sendJson(res, 200, {
      path: document,
      sha256: hash(bytes),
      content: bytes.toString("utf8"),
    });
  }
  const snapshot = await rpc<{ settings: Record<string, unknown> }>(
    "recruitment_snapshot",
    { p_actor: user.id },
  );
  const settings = snapshot.settings;
  const flags = Object.fromEntries(
    [
      "staff_console_enabled",
      "access_guards_enabled",
      "access_guards_mandatory",
      "owner_aal2_required",
      "public_vacancies_enabled",
      "vacancy_intake_enabled",
      "talent_pool_intake_enabled",
      "applicant_email_enabled",
      "document_uploads_enabled",
      "case_processing_enabled",
    ].map((key) => [key, settings[key] === true]),
  );
  // Presence is deliberately separate from operational acceptance. Never return values.
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RECRUITMENT_PUBLIC_ORIGIN",
    "RECRUITMENT_HMAC_KEYS",
    "RECRUITMENT_MAIL_KEYS",
    "RECRUITMENT_ABUSE_KEY",
    "RECRUITMENT_WORKER_KEY",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "RECRUITMENT_SCANNER_URL",
    "RECRUITMENT_SCANNER_KEY",
  ];
  return sendJson(res, 200, {
    sourceCommit: manifest.sourceCommit,
    sourceSetSha256: manifest.sourceSetSha256,
    migrations: manifest.sourceMigrations,
    documents: [...manifest.files, ...supplementary.map((path) => ({ path }))],
    flags,
    approvals: {
      privacy: Boolean(settings.intake_policy_approved_at),
      operations: Boolean(settings.intake_operations_approved_at),
      scanner: Boolean(settings.scanner_attested_at),
      evidenceRetention:
        settings.case_evidence_days !== null &&
        settings.case_evidence_days !== undefined,
      backupRetention:
        settings.backup_retention_days !== null &&
        settings.backup_retention_days !== undefined,
    },
    environment: required.map((name) => ({
      name,
      present: Boolean(process.env[name]),
    })),
    databaseVerification:
      "Owner authentication verified. Run the post-installation SQL to verify all 42 tables, grants, buckets and migration evidence. This screen does not execute SQL or attest external services.",
  });
}
