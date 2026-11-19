// @vitest-environment node
import { it, expect } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { matchesGlob, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

it("keeps every deployment document and PDF asset bundled within Vercel's pattern limit", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  const pattern = config.functions["api/recruitment.ts"].includeFiles;
  expect(pattern.length).toBeLessThanOrEqual(256);
  const directory = "docs/recruitment/production-installation";
  const manifest = JSON.parse(readFileSync(`${directory}/manifest.json`, "utf8"));
  const required = [
    `${directory}/manifest.json`,
    ...manifest.files.map((file: { path: string }) => `${directory}/${file.path}`),
    "docs/recruitment/owner-recovery-runbook.md",
    "docs/recruitment/milestone-3/operations.md",
    "docs/recruitment/milestone-3/api-and-security.md",
    "docs/recruitment/milestone-3/implementation-report.md",
    "public/viva-tutorials-logo.png",
    "private/fonts/PlusJakartaSans-Regular.ttf",
    "private/fonts/PlusJakartaSans-Bold.ttf",
  ];
  for (const file of required) expect(matchesGlob(file, pattern), file).toBe(true);
  expect(matchesGlob("private/materials/unrelated-resource.pdf", pattern)).toBe(false);
  expect(matchesGlob("docs/recruitment/milestone-4-5/visual/admin-1440.png", pattern)).toBe(false);
});

it("rejects an oversized includeFiles value before TypeScript or deployment packaging", () => {
  const directory = mkdtempSync(join(tmpdir(), "viva-vercel-schema-"));
  try {
    writeFileSync(join(directory, "vercel.json"), JSON.stringify({functions:{"api/recruitment.ts":{includeFiles:"x".repeat(257)}}}));
    const result = spawnSync(process.execPath, [resolve("scripts/check-vercel-api.mjs")], {cwd:directory,encoding:"utf8"});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("functions.api/recruitment.ts.includeFiles exceeds Vercel's 256-character limit (257)");
  } finally { rmSync(directory, {recursive:true,force:true}); }
});
