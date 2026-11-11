// @vitest-environment node
import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
it("signs an offline erasure manifest, prepares protected restore SQL and rejects tampering without connecting to a database", () => {
  const dir = mkdtempSync(join(tmpdir(), "viva-erasure-test-"));
  try {
    const raw = join(dir, "export.json"),
      signed = join(dir, "signed.json"),
      sql = join(dir, "restore.sql");
    writeFileSync(raw, "[]");
    const env = {
      ...process.env,
      RECRUITMENT_ERASURE_MANIFEST_KEY: "synthetic-offline-key".repeat(3),
      RECRUITMENT_OPERATOR_REFERENCE: "SYNTHETIC-OPERATOR",
      RECRUITMENT_APPROVAL_REFERENCE: "SYNTHETIC-RECOVERY",
    };
    execFileSync(
      process.execPath,
      ["scripts/recruitment-erasure-manifest.mjs", "sign", raw, signed],
      { env, stdio: "pipe", timeout: 5000 },
    );
    execFileSync(
      process.execPath,
      ["scripts/recruitment-erasure-manifest.mjs", "restore-sql", signed, sql],
      { env, stdio: "pipe", timeout: 5000 },
    );
    expect(readFileSync(sql, "utf8")).toContain(
      "select public.recruitment_erasure_restore('[]'::jsonb,'SYNTHETIC-OPERATOR','SYNTHETIC-RECOVERY')",
    );
    const packet = JSON.parse(readFileSync(signed, "utf8"));
    packet.payload += " ";
    writeFileSync(signed, JSON.stringify(packet));
    expect(() =>
      execFileSync(
        process.execPath,
        [
          "scripts/recruitment-erasure-manifest.mjs",
          "restore-sql",
          signed,
          join(dir, "bad.sql"),
        ],
        { env, stdio: "pipe", timeout: 5000 },
      ),
    ).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
