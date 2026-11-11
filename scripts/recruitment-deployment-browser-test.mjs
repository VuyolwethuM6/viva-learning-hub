// Only the opt-in loopback synthetic acceptance server is supported.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_CORE_PATH || "playwright-core"
);
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const base = "http://localhost:4183";
const output = "/workspace/artifacts/recruitment-deployment";
mkdirSync(output, { recursive: true });
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: base,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Browser exception:", error.message);
  });
  page.on("response", (response) => {
    if (response.status() >= 500)
      console.error(
        "Browser request failed:",
        response.status(),
        response.url(),
      );
  });
  const unauthenticated = await page.request.get(
    base + "/api/admin/recruitment?route=deployment",
  );
  assert.equal(unauthenticated.status(), 401);
  await page.goto(base + "/admin/recruitment/deployment");
  await page.screenshot({
    path: output + "/deployment-initial.png",
    fullPage: true,
  });
  await page.getByLabel("Staff email").fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "Production deployment dashboard" })
    .waitFor();
  await page.getByRole("button", { name: "Copy SQL" }).waitFor();
  const source = readFileSync(
    "docs/recruitment/production-installation/01-install-m1-through-m3.sql",
    "utf8",
  );
  assert.equal(
    await page.getByLabel("Repository script content").textContent(),
    source,
  );
  await page.getByRole("button", { name: "Copy SQL" }).click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    source,
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download SQL" }).click();
  const download = await downloading;
  await download.saveAs(output + "/downloaded-installation.sql");
  assert.equal(
    readFileSync(output + "/downloaded-installation.sql", "utf8"),
    source,
  );
  const status = await (
    await page.request.get(base + "/api/admin/recruitment?route=deployment")
  ).json();
  assert.equal(status.migrations.length, 11);
  await page.screenshot({
    path: output + "/deployment-owner-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: output + "/deployment-owner-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Mobile must not overflow horizontally",
  );
  assert.equal(
    await page.evaluate(() => Boolean(window.gtag)),
    false,
    "Private deployment route must not initialize analytics",
  );
  await page
    .getByLabel("Choose a script or guide")
    .selectOption("02-post-installation-read-only.sql");
  await page
    .getByLabel("Repository script content")
    .filter({ hasText: "Result 12" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Repository script content").textContent(),
    readFileSync(
      "docs/recruitment/production-installation/02-post-installation-read-only.sql",
      "utf8",
    ),
  );
  for (const who of ["manager", "officer"]) {
    const restricted = await browser.newContext();
    const p = await restricted.newPage();
    await p.goto(base + "/admin/recruitment/deployment");
    await p.getByLabel("Staff email").fill(who + "@example.test");
    await p.getByLabel("Password", { exact: true }).fill("synthetic-password");
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await p
      .getByRole("alert")
      .filter({ hasText: "Recruitment owner access is required" })
      .waitFor();
    assert.equal(
      (
        await p.request.get(
          base +
            "/api/admin/recruitment?route=deployment&document=01-install-m1-through-m3.sql&download=1",
        )
      ).status(),
      403,
    );
    assert.equal(await p.getByRole("button", { name: "Copy SQL" }).count(), 0);
    await p.screenshot({
      path: output + `/deployment-${who}-denied.png`,
      fullPage: true,
    });
    await restricted.close();
  }
  assert.deepEqual(errors, []);
  const evidence = {
    ownerDesktop: "passed",
    ownerMobile: "passed",
    unauthenticated: 401,
    managerAndOfficer: 403,
    exactSqlCopyAndDownload: "passed",
    postInstallationViewer: "passed",
    sourceMigrations: 11,
    installationSha256: createHash("sha256").update(source).digest("hex"),
    privateAnalyticsAbsent: true,
    pageErrors: errors,
    environment:
      "Loopback synthetic Auth/provider fixture with real application handlers and SQL; no hosted-service acceptance",
  };
  writeFileSync(
    output + "/browser-evidence.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
