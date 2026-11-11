import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { ServerResponse } from "node:http";
import { z } from "zod";
import { rpc, privateResponse } from "./admin.js";
import { HttpError, type ApiRequest } from "./http.js";

export class IntakeError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public confirmed = true,
  ) {
    super(code);
  }
}
const statuses: Record<string, number> = {
  verification_required: 401,
  invalid_proof: 401,
  access_denied: 403,
  case_unavailable: 404,
  form_unavailable: 404,
  revision_conflict: 409,
  requirements_changed: 409,
  request_conflict: 409,
  request_cancelled: 409,
  controlled_reapplication_required: 409,
  application_incomplete: 409,
  documents_not_clean: 409,
  upload_incomplete: 409,
  document_exists: 409,
  document_quota: 413,
  intake_disabled: 503,
  applications_closed: 409,
  scanner_unavailable: 503,
  privacy_policy_unapproved: 503,
  worker_lease_expired: 409,
};
export async function intakeRpc<T = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  try {
    return await rpc<T>(name, args);
  } catch (e) {
    if (
      e instanceof HttpError &&
      e.status === 409 &&
      e.message.includes("AAL2")
    )
      throw new IntakeError("mfa_required", 403);
    if (
      e instanceof HttpError &&
      e.status === 409 &&
      /Recruitment permission|staff console is disabled/.test(e.message)
    )
      throw new IntakeError("access_denied", 403);
    if (
      e instanceof HttpError &&
      e.status === 409 &&
      e.message.includes("Fresh action-specific")
    )
      throw new IntakeError("fresh_confirmation_required", 403);
    if (
      e instanceof HttpError &&
      e.status === 409 &&
      /^[a-z][a-z_]{1,79}$/.test(e.message)
    )
      throw new IntakeError(e.message, statuses[e.message] || 400);
    throw new IntakeError("service_unavailable", 503, false);
  }
}
export function intakeResponse(res: ServerResponse) {
  privateResponse(res);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'",
  );
}
export function intakeFailure(res: ServerResponse, error: unknown) {
  const failure =
    error instanceof IntakeError
      ? error
      : error instanceof z.ZodError
        ? new IntakeError("invalid_request")
        : error instanceof HttpError
          ? new IntakeError(
              error.status === 413 ? "answers_too_large" : "invalid_request",
              error.status,
            )
          : new IntakeError("service_unavailable", 503, false);
  if (failure.confirmed && failure.status < 500)
    res.setHeader("X-Recruitment-Error", "confirmed");
  if (failure.status === 429) res.setHeader("Retry-After", "60");
  res.statusCode = failure.status;
  res.setHeader("Content-Type", "application/json");
  return res.end(
    JSON.stringify({
      error: { code: failure.code, message: failure.code.replaceAll("_", " ") },
    }),
  );
}
export const sha256 = (input: string | Uint8Array) =>
  createHash("sha256").update(input).digest("hex");
export const secret = () => randomBytes(32).toString("hex");
type Ring = { current: number; keys: Record<string, string> };
function ring(name: string): Ring {
  try {
    const r = JSON.parse(process.env[name] || "") as Ring;
    if (
      !Number.isInteger(r.current) ||
      r.current < 1 ||
      !r.keys ||
      Buffer.from(r.keys[r.current] || "", "base64").length !== 32
    )
      throw new Error();
    return r;
  } catch {
    throw new IntakeError("service_not_configured", 503);
  }
}
function key(name: string, version?: number) {
  const r = ring(name),
    v = version || r.current,
    value = Buffer.from(r.keys[v] || "", "base64");
  if (value.length !== 32)
    throw new IntakeError("key_version_unavailable", 503);
  return { key: value, version: v };
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
    )
    .join(",")}}`;
}
export function keyed(domain: string, value: unknown, version?: number) {
  const selected = key("RECRUITMENT_HMAC_KEYS", version);
  const derived = createHmac("sha256", selected.key)
    .update(`viva:recruitment:${domain}`)
    .digest();
  return {
    digest: createHmac("sha256", derived)
      .update(canonical(value))
      .digest("hex"),
    version: selected.version,
  };
}
export function seal(value: unknown) {
  const selected = key("RECRUITMENT_MAIL_KEYS"),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", selected.key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    version: selected.version,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}
export function unseal(envelope: unknown): Record<string, unknown> {
  try {
    const e = z
      .object({
        version: z.number().int().positive(),
        iv: z.string().max(32),
        tag: z.string().max(32),
        data: z.string().max(65536),
      })
      .strict()
      .parse(envelope);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key("RECRUITMENT_MAIL_KEYS", e.version).key,
      Buffer.from(e.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(e.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(e.data, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new IntakeError("delivery_envelope_invalid", 503);
  }
}
export function configured() {
  try {
    ring("RECRUITMENT_HMAC_KEYS");
    ring("RECRUITMENT_MAIL_KEYS");
    return Boolean(
      process.env.RECRUITMENT_ABUSE_KEY &&
      process.env.RESEND_API_KEY &&
      process.env.EMAIL_FROM &&
      process.env.RECRUITMENT_WORKER_KEY &&
      process.env.RECRUITMENT_PUBLIC_ORIGIN,
    );
  } catch {
    return false;
  }
}
export function abuseKey(domain: string, value: string) {
  const k = process.env.RECRUITMENT_ABUSE_KEY;
  if (!k || Buffer.from(k, "base64").length !== 32)
    throw new IntakeError("service_not_configured", 503);
  return createHmac("sha256", Buffer.from(k, "base64"))
    .update(`${domain}:${value}`)
    .digest("hex");
}
export function clientAddress(req: ApiRequest) {
  return String(
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
  )
    .split(",")[0]
    .trim();
}
export async function intakeLimit(
  req: ApiRequest,
  action: string,
  count = 60,
  window = 60,
  identity?: string,
) {
  const allowed = await intakeRpc<boolean>("recruitment_intake_count", {
    p_key: abuseKey(action, identity || clientAddress(req)),
    p_window: window,
    p_limit: count,
  });
  if (!allowed) throw new IntakeError("rate_limited", 429);
}
const hosted = () =>
  process.env.NODE_ENV === "production" ||
  ["production", "preview"].includes(process.env.VERCEL_ENV || "");
export const applicantCookieName = () =>
  hosted()
    ? "__Secure-viva_recruitment_applicant"
    : "viva_recruitment_applicant";
export function applicantToken(req: ApiRequest) {
  const prefix = `${applicantCookieName()}=`;
  const token =
    (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(prefix))
      ?.slice(prefix.length) || "";
  return /^[0-9a-f]{64}$/.test(token) ? token : "";
}
export function applicantHash(req: ApiRequest) {
  const token = applicantToken(req);
  if (!token) throw new IntakeError("verification_required", 401);
  return sha256(token);
}
export function applicantCookie(res: ServerResponse, token?: string) {
  res.setHeader(
    "Set-Cookie",
    `${applicantCookieName()}=${token || ""}; Path=/api/recruitment; HttpOnly; SameSite=Strict; Max-Age=${token ? 86400 : 0}${hosted() ? "; Secure" : ""}`,
  );
}
export function workerAuthorized(req: ApiRequest) {
  const expected = process.env.RECRUITMENT_WORKER_KEY || "",
    got = String(req.headers.authorization || "").replace(/^Bearer /, "");
  if (expected.length < 32) throw new IntakeError("worker_not_configured", 503);
  if (
    got.length !== expected.length ||
    !timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  )
    throw new IntakeError("access_denied", 403);
}
export function publicOrigin() {
  try {
    const u = new URL(process.env.RECRUITMENT_PUBLIC_ORIGIN || "");
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname) &&
        !hosted()
      )
    )
      throw new Error();
    if (u.username || u.password || u.pathname !== "/" || u.search || u.hash)
      throw new Error();
    return u.origin;
  } catch {
    throw new IntakeError("service_not_configured", 503);
  }
}
export const id = z.string().uuid(),
  revision = z.number().int().min(0).max(2147483646);
export const intakeEmail = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const emailInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.enum(["begin", "resend", "recover"]),
      requestId: id,
      purpose: z.enum(["vacancy", "talent_pool"]),
      slug: z.string().max(180).default(""),
      email: intakeEmail,
      noticeVersion: z.string().min(1).max(120),
      privacyAcknowledged: z.literal(true),
      adultConfirmed: z.literal(true),
      caseReference: z.union([id, z.literal("")]).default(""),
    })
    .strict(),
  z
    .object({
      action: z.literal("inspect"),
      intentReference: id,
      proof: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("exchange"),
      intentReference: id,
      proof: z.string().regex(/^[0-9a-f]{64}$/),
      confirmedEmail: intakeEmail,
      confirmation: z.literal(true),
    })
    .strict(),
]);
export const applicantInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("save"),
      requestId: id,
      expectedRevision: revision,
      formId: id,
      answersPatch: z
        .object({
          fields: z.record(z.unknown()),
          questions: z.record(z.unknown()),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("rebase"),
      requestId: id,
      expectedRevision: revision,
      formId: id,
      noticeVersion: z.string().min(1).max(120),
      privacyAcknowledged: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel_pending"),
      requestId: id,
      pendingRequestId: id,
      operation: z.enum([
        "save",
        "rebase",
        "submit",
        "withdraw",
        "request_deletion",
        "renew",
        "reserve",
        "reply",
        "reapply",
      ]),
    })
    .strict(),
  z
    .object({
      action: z.literal("submit"),
      requestId: id,
      expectedRevision: revision,
      formId: id,
      privacyAcknowledged: z.literal(true),
      poolConsent: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["withdraw", "request_deletion", "renew"]),
      requestId: id,
      expectedRevision: revision,
      formId: id.nullable().default(null),
      noticeVersion: z.string().max(120).default(""),
      consent: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.literal("reapply"),
      requestId: id,
      expectedRevision: revision,
      formId: id,
      noticeVersion: z.string().min(1).max(120),
      consent: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("reply"),
      requestId: id,
      expectedRevision: revision,
      replyTo: id,
      text: z.string().trim().min(1).max(4000),
    })
    .strict(),
]);
