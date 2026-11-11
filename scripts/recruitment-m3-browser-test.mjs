// Run only against the opt-in synthetic acceptance server. No hosted URL is accepted.
const modulePath = process.env.PLAYWRIGHT_CORE_PATH || "playwright-core";
const { chromium } = await import(modulePath);
const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  }),
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
let errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const base = "http://localhost:4183";
page.on("response", async (r) => {
  if (r.url().includes("/api/") && r.status() >= 400)
    console.log("API error", r.status(), await r.text().catch(() => ""));
});
const fixture = await (
  await page.request.get(base + "/__synthetic/link")
).json();
await page.goto(base + "/recruitment/apply/" + fixture.slug);
await page.getByLabel("Email address").fill("browser-final@example.test");
await page.getByLabel("I confirm that I am 18 or older.").check();
await page.getByLabel("I have read the recruitment privacy notice.").check();
await page.getByRole("button", { name: "Send verification link" }).click();
await page
  .getByText("If your request is eligible,", { exact: false })
  .waitFor();
const link = (await (await page.request.get(base + "/__synthetic/link")).json())
  .link;
await page.goto(base + link);
await page.getByLabel("Email address").fill("browser-final@example.test");
await page
  .getByRole("button", { name: "Confirm this email and continue" })
  .click();
await page.getByRole("heading", { name: "Your application" }).waitFor();
for (const [key, value] of [
  ["First Name *", "Synthetic"],
  ["Last Name *", "Browser"],
  ["Location *", "Cape Town"],
  ["Availability *", "Afternoons"],
])
  await page.getByLabel(key, { exact: true }).fill(value);
await page.getByRole("button", { name: "Save draft and continue" }).click();
await page
  .getByLabel("Subjects", { exact: true })
  .selectOption(["Mathematics"]);
await page.getByLabel("Grades", { exact: true }).selectOption(["12"]);
await page
  .getByLabel("Qualifications *", { exact: true })
  .fill("Relevant synthetic qualification");
await page
  .getByLabel("Teaching Experience *", { exact: true })
  .fill("Relevant teaching experience");
await page.getByRole("button", { name: "Save draft and continue" }).click();
await page
  .getByLabel("Choose PDF")
  .setInputFiles({
    name: "synthetic.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nSynthetic acceptance only\n%%EOF"),
  });
await page
  .getByText("Uploaded. Security scanning is pending.")
  .waitFor({ timeout: 10000 })
  .catch(async (e) => {
    console.log((await page.locator("main").innerText()).slice(-1800));
    await page.screenshot({
      path: "/tmp/viva-m3-browser-failure.png",
      fullPage: true,
    });
    throw e;
  });
console.log(
  "scan",
  await (await page.request.get(base + "/__synthetic/scan")).json(),
);
await page.getByRole("button", { name: "Refresh status" }).click();
await page.getByText("synthetic.pdf · Clean").waitFor();
await page.getByRole("button", { name: "4. Review" }).click();
await page.getByLabel("I confirm that I am 18 or older.").check();
await page.getByLabel("I have read the privacy notice.").check();
await page
  .getByRole("button", { name: "Validate and save final answers" })
  .click();
await page
  .getByText("Draft saved. Review the saved answers, then confirm submission.")
  .waitFor();
await page
  .getByRole("button", { name: "Confirm and submit saved application" })
  .click();
await page.getByRole("heading", { name: "Application received" }).waitFor();
await page.screenshot({
  path: "/tmp/viva-m3-applicant-mobile.png",
  fullPage: true,
});
if (
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
)
  throw Error("Mobile horizontal overflow");
if (await page.evaluate(() => Boolean(window.gtag)))
  throw Error("Private route analytics initialized");
await page.goto(base + "/admin/recruitment");
await page.getByLabel("Staff email").fill("owner@example.test");
await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page
  .getByRole("button", { name: "Applications and talent pool", exact: true })
  .click();
await page.getByRole("button", { name: /Synthetic Browser/ }).click();
await page
  .getByLabel("Private review note")
  .fill("Synthetic browser review note");
await page.getByRole("button", { name: "Review this change" }).click();
await page
  .getByRole("dialog")
  .getByLabel("Password", { exact: true })
  .fill("synthetic-password");
await page.getByRole("button", { name: "Confirm exact change" }).click();
await page
  .getByText("Synthetic browser review note", { exact: true })
  .waitFor();
await page.getByRole("dialog").waitFor({ state: "hidden" });
await page.setViewportSize({ width: 1440, height: 900 });
await page.screenshot({
  path: "/tmp/viva-m3-staff-desktop.png",
  fullPage: true,
});
console.log(
  JSON.stringify({
    mobileApplicant: "passed",
    desktopStaffReview: "passed",
    pageErrors: errors,
  }),
);
await browser.close();
if (errors.length) process.exitCode = 1;
