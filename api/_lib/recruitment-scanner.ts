import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { IntakeError, secret, sha256 } from "./recruitment-intake.js";
import {
  boundedBytes,
  FILE_BYTES,
  validatePdf,
} from "./recruitment-storage.js";

export type ScanContext = { jobId: string; generation: string; policy: string };
export type ScanResult = {
  verdict: "clean" | "infected" | "error";
  checksum: string;
  size: number;
  engine: string;
  definitions: string;
  policy: string;
};
export interface MalwareScanner {
  health(): Promise<{ policy: string; engine: string }>;
  scan(bytes: Buffer, context: ScanContext): Promise<ScanResult>;
}
const verdictSchema = z
  .object({
    verdict: z.enum(["clean", "infected", "error"]),
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().min(1).max(FILE_BYTES),
    engine: z.string().min(1).max(160),
    definitions: z.string().min(1).max(160),
    definitionDate: z.string().datetime(),
    policy: z.string().min(1).max(120),
    jobId: z.string().uuid(),
    generation: z.string().uuid(),
    nonce: z.string().regex(/^[0-9a-f]{64}$/),
    timestamp: z.number().int(),
  })
  .strict();
function configuration() {
  try {
    const url = new URL(process.env.RECRUITMENT_SCANNER_URL || ""),
      token = process.env.RECRUITMENT_SCANNER_KEY || "";
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname) &&
        process.env.NODE_ENV !== "production"
      )
    )
      throw new Error();
    if (
      token.length < 32 ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    return { url: url.toString().replace(/\/$/, ""), token };
  } catch {
    throw new IntakeError("scanner_unavailable", 503);
  }
}
export class SignedHttpScanner implements MalwareScanner {
  async health() {
    const cfg = configuration(),
      nonce = secret();
    const r = await fetch(`${cfg.url}/health`, {
      headers: { Authorization: `Bearer ${cfg.token}`, "X-Scan-Nonce": nonce },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    const data = (await this.verified(r, cfg.token)) as Record<string, unknown>;
    if (
      data.nonce !== nonce ||
      typeof data.policy !== "string" ||
      typeof data.engine !== "string" ||
      !fresh(data.definitionDate)
    )
      throw new IntakeError("scanner_unavailable", 503);
    return { policy: data.policy, engine: data.engine };
  }
  async verified(r: Response, token: string): Promise<unknown> {
    if (!r.ok) throw new IntakeError("scanner_unavailable", 503);
    const bytes = await boundedBytes(r, 8192),
      expected = createHmac("sha256", token).update(bytes).digest("hex"),
      got = r.headers.get("x-scan-signature") || "";
    if (
      !/^[0-9a-f]{64}$/.test(got) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(got))
    )
      throw new IntakeError("scanner_signature_invalid", 503);
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new IntakeError("scanner_unavailable", 503);
    }
  }
  async scan(bytes: Buffer, context: ScanContext) {
    validatePdf(bytes);
    const cfg = configuration(),
      nonce = secret(),
      timestamp = Date.now();
    const r = await fetch(`${cfg.url}/scan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/pdf",
        "X-Scan-Nonce": nonce,
        "X-Scan-Job": context.jobId,
        "X-Scan-Generation": context.generation,
        "X-Scan-Policy": context.policy,
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(45000),
      redirect: "error",
    });
    const parsed = verdictSchema.safeParse(await this.verified(r, cfg.token));
    if (!parsed.success) throw new IntakeError("scanner_result_invalid", 503);
    const v = parsed.data;
    if (
      v.jobId !== context.jobId ||
      v.generation !== context.generation ||
      v.policy !== context.policy ||
      v.nonce !== nonce ||
      v.checksum !== sha256(bytes) ||
      v.size !== bytes.length ||
      Math.abs(Date.now() - v.timestamp) > 60000 ||
      v.timestamp < timestamp - 5000 ||
      !fresh(v.definitionDate)
    )
      throw new IntakeError("scanner_result_invalid", 503);
    return {
      verdict: v.verdict,
      checksum: v.checksum,
      size: v.size,
      engine: v.engine,
      definitions: v.definitions,
      policy: v.policy,
    };
  }
}
function fresh(value: unknown) {
  if (typeof value !== "string") return false;
  const date = Date.parse(value),
    age = Date.now() - date;
  return Number.isFinite(date) && age >= -300000 && age <= 48 * 3600000;
}
export function scanner(): MalwareScanner {
  return new SignedHttpScanner();
}
