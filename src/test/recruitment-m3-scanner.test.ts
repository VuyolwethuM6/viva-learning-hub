// @vitest-environment node
import { it, expect, afterEach, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { SignedHttpScanner } from "../../api/_lib/recruitment-scanner";
import { sha256, seal, unseal, keyed } from "../../api/_lib/recruitment-intake";
import { validatePdf } from "../../api/_lib/recruitment-storage";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("authenticates signed verdict context and rejects forged, stale and unknown results", async () => {
  vi.stubEnv("RECRUITMENT_SCANNER_URL", "https://scanner.test");
  vi.stubEnv("RECRUITMENT_SCANNER_KEY", "synthetic-provider-key".repeat(3));
  const bytes = Buffer.from("%PDF-1.7\n%%EOF"),
    context = {
      jobId: randomUUID(),
      generation: randomUUID(),
      policy: "pdf-v1",
    };
  let mode = "clean";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u, init) => {
      const h = new Headers(init?.headers),
        data = {
          verdict: mode === "unknown" ? "unknown" : "clean",
          checksum: mode === "checksum" ? "0".repeat(64) : sha256(bytes),
          size: bytes.length,
          engine: "protocol-fixture",
          definitions: "synthetic",
          definitionDate: new Date(
            Date.now() - (mode === "stale" ? 72 : 0) * 3600000,
          ).toISOString(),
          policy: "pdf-v1",
          jobId: context.jobId,
          generation: mode === "generation" ? randomUUID() : context.generation,
          nonce: h.get("x-scan-nonce"),
          timestamp: Date.now(),
        };
      const body = JSON.stringify(data);
      return new Response(body, {
        headers: {
          "x-scan-signature":
            mode === "forged"
              ? "0".repeat(64)
              : createHmac("sha256", process.env.RECRUITMENT_SCANNER_KEY!)
                  .update(body)
                  .digest("hex"),
        },
      });
    }),
  );
  expect((await new SignedHttpScanner().scan(bytes, context)).verdict).toBe(
    "clean",
  );
  for (mode of ["unknown", "checksum", "stale", "generation", "forged"])
    await expect(
      new SignedHttpScanner().scan(bytes, context),
    ).rejects.toThrow();
});
it("rejects uninspectable PDFs before a provider call", () => {
  for (const text of [
    "fake file",
    "%PDF-1.7 /Encrypt\n%%EOF",
    "%PDF-1.7 no EOF",
  ])
    expect(() => validatePdf(Buffer.from(text))).toThrow();
});
it("encrypts delivery proofs and keeps prior HMAC and encryption keys available during rotation", () => {
  const first = Buffer.alloc(32, 1).toString("base64"),
    second = Buffer.alloc(32, 2).toString("base64");
  for (const name of ["RECRUITMENT_HMAC_KEYS", "RECRUITMENT_MAIL_KEYS"])
    vi.stubEnv(name, JSON.stringify({ current: 1, keys: { 1: first } }));
  const data = { email: "synthetic@example.test", proof: "synthetic-proof" },
    envelope = seal(data),
    digest = keyed("request", data);
  expect(JSON.stringify(envelope)).not.toContain(data.email);
  for (const name of ["RECRUITMENT_HMAC_KEYS", "RECRUITMENT_MAIL_KEYS"])
    vi.stubEnv(
      name,
      JSON.stringify({ current: 2, keys: { 1: first, 2: second } }),
    );
  expect(unseal(envelope)).toEqual(data);
  expect(keyed("request", data, 1)).toEqual(digest);
  expect(keyed("request", data).digest).not.toBe(digest.digest);
  expect(() => unseal({ ...envelope, data: "tampered" })).toThrow();
});
