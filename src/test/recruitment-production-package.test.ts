// @vitest-environment node
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const directory = "docs/recruitment/production-installation/";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
it("keeps every installation artifact and all eleven pinned migration bytes verifiable", () => {
  const manifest = JSON.parse(
    readFileSync(directory + "manifest.json", "utf8"),
  );
  const installer = readFileSync(
    directory + "01-install-m1-through-m3.sql",
    "utf8",
  );
  expect(manifest.sourceMigrations).toHaveLength(11);
  let offset = 0;
  for (const migration of manifest.sourceMigrations) {
    const bytes = execFileSync("git", [
      "show",
      `${manifest.sourceCommit}:${migration.path}`,
    ]);
    expect(sha(bytes)).toBe(migration.sha256);
    const position = installer.indexOf(bytes.toString("utf8"), offset);
    expect(position).toBeGreaterThanOrEqual(offset);
    offset = position + bytes.length;
  }
  for (const artifact of manifest.files) {
    const bytes = readFileSync(directory + artifact.path);
    expect(sha(bytes)).toBe(artifact.sha256);
    expect(bytes.length).toBe(artifact.bytes);
  }
  expect(manifest.productionSqlExecuted).toBe(false);
  expect(manifest.supabaseMigrationHistoryCreated).toBe(false);
});
it("regenerates deterministically without altering files in check mode", () => {
  expect(() =>
    execFileSync(
      process.execPath,
      ["scripts/recruitment-production-package.mjs", "--check"],
      { stdio: "pipe" },
    ),
  ).not.toThrow();
});
it("requires binding references and keeps installation separate from release SQL", () => {
  const installer = readFileSync(
    directory + "01-install-m1-through-m3.sql",
    "utf8",
  );
  expect(installer).toContain("__REQUIRED_INSTALL_APPROVAL__");
  expect(installer).toContain("recruitment_m31_intake_interlock");
  expect(installer).not.toContain(
    "drop constraint recruitment_m31_intake_interlock",
  );
  expect(installer).not.toMatch(/insert into supabase_migrations/i);
  const allowed = JSON.parse(
    readFileSync(directory + "expected-service-rpcs.json", "utf8"),
  );
  expect(allowed).toHaveLength(50);
  expect(allowed).not.toContain("public.recruitment_bootstrap(uuid)");
});
it("packages files server-side with an explicit private route and preserves accounting cron", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(config.functions["api/recruitment.ts"].includeFiles).toContain(
    "docs/recruitment/production-installation/**",
  );
  expect(config.rewrites).toContainEqual({
    source: "/admin/recruitment/deployment",
    destination: "/index.html",
  });
  expect(
    config.headers.find(
      (row: { source: string }) => row.source === "/admin/recruitment/:path*",
    ).headers,
  ).toContainEqual({ key: "Cache-Control", value: "no-store" });
  expect(config.crons).toEqual([
    { path: "/api/admin/accounting?task=scheduled", schedule: "5 6 * * *" },
  ]);
});
