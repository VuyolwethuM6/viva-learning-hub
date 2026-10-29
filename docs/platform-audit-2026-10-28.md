# Viva Tutorials platform audit — 28 October 2026

Audit date: **28 October 2026, South African time**.

Production branch reviewed: `main`, merge commit `a6230e84e24bcfff8d137f8e71af3c005a294f64`.
Implementation commit: `45b78c1fe376ca74eb0712b961271de3fbdaa8e9`.
The local implementation and remote main commit have identical Git trees.
Both production Vercel deployment statuses were successful when checked.

## Remediation update — 29 October 2026

F01–F04 have implementation fixes and regression coverage in the recovery release. See [setup, behavior and acceptance checks](high-priority-recovery.md). The original findings below retain the audit evidence. Production resolution still requires applying the two new migrations, deploying the release and completing live acceptance; no live database/provider configuration was changed by the coding task. The remaining findings and withdrawal-policy question are outside this release.

## Assessment

The core platform is substantially implemented and its existing regression suite passes. Enrollment review, manual EFT/cash accounting, controlled portal access, session records, academic submissions, marking and published reports have working foundations.

**Four high-priority findings need attention:** missed-month billing, hosting compatibility of older public handlers, durable paid-PDF fulfillment, and development-server environment-file protection. Further findings concern permission consistency, long-session submissions, enrollment recovery/email reliability, abuse prevention, dependencies, accessibility and release checks.

Continue controlled testing. Address the billing recovery issue before relying on unattended monthly collection, and address the purchase findings before relying on paid study-material delivery. Development previews containing real credentials need the file protection fix immediately.

This is a source, isolated-database, API, browser and read-only production audit. It is not a certification that every production configuration or external provider behavior is correct. No authenticated live Supabase access, service credentials, provider dashboard or real bank statement was available. No live applications, payments, emails, access grants or database migrations were created by this audit.

## Verification performed

| Check | Result and scope |
| --- | --- |
| Existing tests | **238 passed across 25 test files.** Includes database, API, UI, finance, documents and academic permission/workflow cases. |
| TypeScript | App and Node configurations passed. |
| Lint | Zero errors; seven existing Fast Refresh warnings. |
| Production build | Exit code 0; 19 routes and a noindex 404 prerendered. Existing SSR warnings and the final shutdown “build was canceled” log remain noisy; neither prevented the successful build/deployments. |
| Fresh database permission audit | 68 public application tables have RLS enabled; `anon` and `authenticated` have no direct table privileges. No public security-definer business RPC is executable by these browser roles. The exposed `set_updated_at()` is an invoker trigger function, not a business data endpoint. All audited security-definer functions set an explicit search path. |
| Fresh storage configuration | Four expected buckets are private, restricted to PDF/JPEG/PNG and capped at 10 MiB. This verifies the schema configuration, not live bucket contents or arbitrary pre-existing live policies. |
| Production GET crawl | All **41 targets returned HTTP 200**: 19 public pages and 22 additional linked page/file/image targets. Titles were present on checked HTML. No live form submissions were made. |
| Production unauthenticated access | `/api/admin/records` and `/api/parent?action=session` returned 401 with no-store responses. Admin HTML had no-store, DENY and frame-ancestors protection; sampled production responses used HSTS. |
| Portal browser flows | Real local SQL/API with synthetic external Auth/Storage/email: settings changes, closure conflict rejection, owner/viewer restrictions, cron observations, academic assignment → learner draft/upload/final receipt → marking/review/publication → parent read-only result and report PDF passed. |
| Loader/browser behavior | Opening loaders centred in all four portals; section/button alignment, reduced motion and retaining records during refresh passed. |
| Responsive/accessibility sample | Five public pages, four login pages and four authenticated home views checked at 320/390/1440 px: no horizontal document overflow or normal-load JavaScript errors. Automated WCAG checks found 21 repeated rule/node instances across three rule categories; these are not 21 distinct defects or a complete accessibility certification. |
| Dependency audit | npm reported 65 affected package entries: 6 low, 23 moderate, 34 high, 2 critical. With dev dependencies omitted: 27 entries, including 14 high and no critical. Entries include transitive and build-tool dependencies, not necessarily reachable deployed vulnerabilities. |
| Secret hygiene | No actual committed secret was identified by the limited credential-pattern scan; only `.env.example` was tracked as an environment file. This was not an exhaustive historical secret scan. GitGuardian passed on the merged change. |

## Findings

P1 means fix before the affected workflow is relied on in live operation. P2 means a meaningful reliability, security, accessibility or maintenance issue. P3 means lower-priority alignment work. These are platform priorities, separate from a dependency advisory's severity label.

### F01 — P1: scheduled billing cannot recover a missed tuition month

**Evidence:** [accounting_run_schedule](../supabase/schema.sql#L2056) only generates the following month when today's day is at least 25. [generate_month](../supabase/schema.sql#L1805) only accepts that following month. The job has no current-month recovery branch.

**Reproduced:** an active learner had an October invoice, then the next run occurred on 3 November after the October generation window was missed. The real SQL returned `success: true` and queued an October reminder. The only invoice remained October; November was absent.

This also affects activation after the preceding generation window. A successful run and a balanced ledger do not detect an invoice that was never created. Current System Health does not check expected invoice coverage.

**Action:** retain normal issuance from the 25th, detect eligible missing current-month invoices, and provide a controlled, audited catch-up process. Historical eligibility and agreed charges need review before back-billing. Preserve unique learner/month invoices, February–November billing, stored grade programmes and closure snapshots. Add missing-invoice coverage to monitoring.

**Acceptance:** skip a complete generation window and resume on the 1st/3rd; activate a learner after that window; rerun and confirm exactly one appropriate invoice per billable learner/month, with no December/January routine charges.

### F02 — P1: four older public handlers ignore already-parsed request bodies

**Evidence:** [contact](../api/contact.ts#L3), [subject requests](../api/subject-request.ts#L3), [PayFast checkout](../api/payfast/checkout.ts#L35) and [PayFast notifications](../api/payfast/notify.ts#L319) read only the incoming stream. They do not use the shared request-body handling that was added for the Vercel parsing issue in enrollment.

**Reproduced:** valid synthetic contact, subject-request and checkout inputs returned 200 as raw streams, then 400 when supplied as `request.body` with an already-consumed stream. A parsed valid payment notification returned 400 `Invalid purchase`.

This establishes a deployment compatibility defect for the pre-parsed runtime shape. Live POST behavior was not tested, because it could send messages or create a payment interaction.

**Action:** use bounded JSON parsing for JSON endpoints and an explicitly supported raw/form parsing strategy for the payment webhook, preserving the exact provider signature contract. Add both raw-stream and pre-parsed runtime tests.

**Acceptance:** both supported hosting request shapes work; malformed/oversized bodies fail clearly; signed ITN verification remains correct. Do not fix the webhook by skipping signature or provider validation.

### F03 — P1: paid PDF fulfillment has no durable purchase/delivery record

**Evidence:** [PayFast notifier](../api/payfast/notify.ts#L25) tracks delivery in an in-memory Set, checks it before sending, and marks it only after both customer/admin emails complete ([delivery](../api/payfast/notify.ts#L428)). The mail requests have no provider idempotency key. This handler creates no database purchase, fulfillment or accounting entry.

**Reproduced:** two concurrent valid callbacks for one synthetic payment both returned 200 and made **four** provider email requests. A cold function instance also loses the Set. A customer email can succeed while the admin email fails, causing the customer's delivery to repeat on retry.

Purchase receipts in email are therefore the only existing sales trail for this flow. PayFast PDF sales are not automatically included in the finance ledger or its reports. This finding concerns study-material sales; manually recorded EFT/cash tuition has a separate durable ledger/outbox.

**Action:** persist orders, verified payment events and per-recipient fulfillment states; atomically claim each payment; use stable provider keys and an explicit uncertain outcome. Connect sales, fees and reconciliation to accounting, or document a reviewed manual posting procedure until integration exists.

**Acceptance:** concurrent callbacks, cold restarts, provider timeout after acceptance, partial delivery failure and webhook replay produce one durable sale and a controlled delivery history, with no duplicate money posting or uncontrolled re-send.

### F04 — P1, development: the Vite deny list exposes environment files

**Evidence:** [vite.config.ts](../vite.config.ts#L12) replaces `server.fs.deny` with only `**/private/**`, dropping Vite's usual environment/key/Git protections. The development server binds to `::`.

**Reproduced safely:** a temporary `.env.audit-canary.local` containing only `AUDIT_CANARY=synthetic-not-a-secret` was readable with HTTP 200 through both its direct URL and `/@fs/...` on the local development server. The canary was removed. No real secret file was read.

This applies where a development preview is reachable and sensitive files exist. It does **not** demonstrate that production Vercel serves environment files or that any actual credential has leaked.

**Action:** restore the default sensitive-file deny patterns alongside `private/**`; restrict development-server exposure appropriately. Review access history and rotate credentials if a real secret-bearing preview was accessible to unintended users.

**Acceptance:** environment files, private keys, Git internals and paid private files are rejected through direct, `/@fs/` and raw/import URL forms; normal public images and PDFs continue to work.

### F05 — P2: Finance permissions bypass Settings safeguards

**Evidence:** [Finance role UI](../src/components/admin/FinanceWorkspace.tsx#L2199) calls the existing [accounting role operation](../supabase/schema.sql#L1740). It protects the last owner but does not enforce Settings' own-account restriction or protect the configured scheduled-run owner. It also bypasses the System Settings revision mechanism.

**Reproduced:** with two owners, the configured scheduler owner demoted themselves through Finance. The change succeeded; `accounting_scheduler_context()` then reported automation enabled with `validActor: false`. Subsequent scheduled requests reject that actor.

**Action:** centralize staff/role changes and enforce the same rules from both routes. Route the old UI to Staff access or make its SQL operation delegate to the guarded policy. Ensure all permission paths invalidate stale review state and preserve a valid scheduled owner.

**Acceptance:** own-account and scheduler-owner changes have consistent outcomes through either endpoint, including concurrent/stale changes; ordinary changes remain audited.

### F06 — P2: session expiry interrupts student saves and timed submissions

**Evidence:** [portal cookies](../api/_lib/parent-auth.ts#L42) last at most one hour. [studentFetch](../src/lib/student-client.ts#L37) and the tutor equivalent refresh after 401 only for reads, while assessments can last up to 360 minutes. The selected-task timer runs locally; it does not renew authentication. [AcademicLearner.run](../src/components/AcademicLearner.tsx#L109) displays a failed write without performing that read refresh.

**Reproduced:** a student submission receiving 401 made one POST and no refresh request. A manual read/refresh is needed before another attempt. Near a hard deadline this can prevent an otherwise timely submission. Existing deadline enforcement correctly rejects genuinely late writes.

**Action:** renew authentication before long-lived work expires, or handle a verified 401 by refreshing and retrying the same stable request once. Preserve unsaved work and the original request identity. Never blindly replay a write after an ambiguous network error or bypass the assessment deadline.

**Acceptance:** simulate expiry during a 90/120-minute assessment, draft save, final submit and upload. Valid in-time work succeeds once; revoked access and expired deadlines remain rejected.

### F07 — P2, known limit: initial enrollment has no durable retry identity or reload recovery

**Evidence:** [enrollment creation](../api/enrollment.ts#L161) generates a new application reference for every request and [submit_enrollment](../supabase/schema.sql#L213) inserts a new application. Pending upload/recovery state lives in component memory ([form state](../src/pages/Enrollment.tsx#L207)).

The form correctly blocks double clicks and warns after an uncertain response. Those protections end after a reload/new tab. A saved initial response that never reaches the browser can leave a draft without a recoverable reference; submitting again can create another application for the same learner. Guardian email must remain shareable between siblings.

**Action:** add a stable submission key with payload validation and an opaque resume mechanism; retain only the minimum recovery data and allow the original file to be reselected. Add a reviewed abandoned-draft retention process.

**Acceptance:** response loss after commit, reload during upload, expired upload link and repeated initial requests recover the same application. Distinct siblings and legitimate later applications remain supported.

### F08 — P2, known limit: enrollment email claims do not provide exactly-once delivery

**Evidence:** [sendOnce](../api/_lib/enrollment-emails.ts#L251) releases a claim for every send exception. The [email helper](../api/_lib/email.ts#L29) has no provider idempotency key or timeout. Claims are stamped before provider acceptance, and completion awaits these sends.

**Reproduced:** simulated provider acceptance followed by connection loss released the receipt claim. A later completion attempt made a second receipt request; both lacked idempotency keys. Conversely, a process ending after claim and before send can leave a timestamp that suppresses an email that never went out.

**Action:** use durable pending/accepted/failed/uncertain states and stable provider keys. Investigate ambiguous outcomes before re-sending. Bound external calls and let verified application receipt complete independently of notification delivery. The existing tuition outbox provides a useful model.

**Acceptance:** concurrent completion, crash after claim, timeout after provider acceptance, explicit rejection and completion retries never falsely mark an unsent message delivered or automatically duplicate an uncertain one.

### F09 — P2: anonymous intake/message endpoints lack application-level abuse controls

**Evidence:** the public enrollment, contact, subject-request and checkout handlers have no application-level rate limit, challenge or equivalent admission control. Enrollment can create durable drafts and signed upload links; message endpoints can repeatedly call the email provider. Several older/public external fetches also lack explicit deadlines.

Portal email-link requests do have a database-backed limiter; that control does not cover these public endpoints. Provider/hosting controls may exist but were not verified.

**Action:** add appropriate per-source limits and escalation/challenge behavior, bounded field/body sizes and external-request deadlines. Use shared durable limits across function instances, with usable errors and exemptions for valid recovery attempts.

**Acceptance:** controlled synthetic burst tests in a test environment are limited before repeated DB/provider work, while a normal enrollment and its upload recovery complete. No live flood testing was performed.

### F10 — P2: dependency advisories need a controlled upgrade pass

The lockfile audit reported the counts above. Examples include React Router 6.30.1, Lodash 4.17.21, Zod 3.25.76 and Vite 5.4.19. Development/test dependencies Vitest 3.2.4 and Tinypool 1.1.1 carry critical advisory labels in the registry result.

Those labels do not establish a critical website exploit: the Vitest UI-server advisory requires that server to be listening, and the existing test command uses `vitest run`. Some entries in the production dependency tree are CSS/build tooling through peer dependencies. Actual application reachability needs to guide urgency.

**Action:** triage advisory conditions, upgrade direct packages and lockfile deliberately, remove unused dependencies, and run the full checks and portal/public browser journeys. Preserve the separate Vite configuration fix in F04. Do not apply unreviewed forced major upgrades.

**Acceptance:** resolve or explicitly document the remaining advisories and their reachability. Representative advisories: [Vitest](https://github.com/advisories/GHSA-5xrq-8626-4rwp), [Tinypool](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [React Router](https://github.com/advisories/GHSA-9jcx-v3wj-wh4m).

### F11 — P2: confirmed accessibility issues across public pages and portals

The sampled screens fit the tested widths, but automated WCAG checks found:

- The mobile [TopBar phone link](../src/components/Header.tsx#L38) has an icon and hidden phone text, with no accessible name. It appeared on all five sampled public pages.
- [Enrollment progress](../src/pages/Enrollment.tsx#L604) uses `aria-label` on a generic `div` without a permitted role. Use a semantic progress indicator with its actual value.
- Text contrast failures include white text on the orange “Most Popular” badge (2.61:1), the Admin role badge and some attendance/summary labels. Preserve brand identity while adjusting text/background combinations. Other results close to the threshold should be rechecked after transitions settle.

**Action/acceptance:** fix names and semantics, adjust functional text contrast, then rerun automated checks and manually test keyboard navigation, dialog focus/return, form errors, zoom and a screen reader. Automated passing alone would not establish complete accessibility.

### F12 — P2: failed lazy route downloads leave a blank screen

**Evidence:** [App routing](../src/App.tsx#L64) wraps lazy page imports in Suspense without an error boundary/recovery UI.

**Reproduced:** aborting the student page module request produced an empty body, JavaScript import errors and zero retry/reload actions. A similar failure can happen when a connection fails or an older open tab requests a chunk removed by deployment. Normal page loads in the sample had no JavaScript errors.

**Action:** provide an error boundary with a clear retry/reload path, preserve recoverable form/work state, and report the failure without learner data. Suspense's loader covers pending imports, not rejected imports.

**Acceptance:** failed route/chunk requests show a usable recovery state and recover after connectivity returns; they do not loop on automatic reloads or discard submissions silently.

### F13 — P2: no repository CI runs the regression checks automatically

**Evidence:** no tracked `.github` workflow directory; GitHub's workflows API reported zero workflows. The merged change's checks include Vercel deployment and GitGuardian, but no test, lint or TypeScript workflow. The package build transpiles TypeScript without running the two `tsc` checks.

**Action:** add required PR checks for reproducible install, tests, both TypeScript configurations, lint and build. Include the newly reproduced failure paths, especially billing rollover, role consistency, pre-parsed public requests and expired write sessions. Maintain browser acceptance checks in a repeatable test harness using synthetic external services.

**Acceptance:** an intentional failing test/type error blocks merging in a test PR; no live credentials or transactions are needed for those checks.

### F14 — P3: public policy and data-handling descriptions need alignment

**Evidence:** [Privacy Policy](../src/pages/PrivacyPolicy.tsx#L84) still specifically describes Google Sheets/Apps Script administrative records. The current application stores learner, financial and academic records through Supabase and uses Vercel/Resend. The payment description does not clearly distinguish EFT/cash tuition from PayFast study-material sales.

The policy describes retention generally; the application has no complete operational workflow for retention, privacy requests and operator-approved deletion/de-identification. Analytics initializes when configured, without an implemented consent/preference UI; whether prior consent is required must be assessed for the actual deployment and lawful basis.

**Action:** verify any continuing Google workflows, describe the actual service providers/data categories, clarify payment scopes, and document practical retention/privacy-request handling and any required analytics preference behavior. Obtain appropriate policy review; this audit makes no finding of legal noncompliance.

## Policy decision surfaced: withdrawal access versus final billing date

This behavior is confirmed, but its desired outcome needs a business decision rather than being assumed to be a bug.

[Withdrawal](../supabase/schema.sql#L1706) immediately sets `enrollment_state='withdrawn'`, while the [student access check](../supabase/schema.sql#L3173) requires `active`. In an isolated test, notice recorded on 3 November with a final billing date of 30 November immediately blocked student access. The UI describes the date as a **final billing date**, not a separately scheduled access end date.

If notice should allow teaching and submissions through the agreed leaving date, introduce an effective withdrawal/access end date and apply it consistently to sign-in, membership, sessions, assignments and billing. If access should end immediately while charges continue through notice, state that clearly before staff confirm the withdrawal. Parents' financial/academic read access has its own rules and should remain explicit.

## Platform coverage and remaining product scope

| Area | Current evidence | Remaining boundary |
| --- | --- | --- |
| Public website | Public routes, metadata and linked resources responded; sampled mobile layouts fit. | Accessibility/policy fixes; marketing testimonials/statistics are static editorial content and were not independently substantiated. |
| Enrollment | Server package prices, private document metadata verification, pending review and confirmation behavior have regression coverage. | Initial idempotency/reload recovery, abuse protection and notification reliability. |
| Admin | Review, document viewing, activation gates, audit/queue controls, Health and Settings implemented and tested locally. | Permission controls need consolidation; live oversight migration/configuration not independently inspected. |
| Finance | Durable EFT/cash receipts, allocations, credits/refunds, expenses, reconciliation, period controls and reports covered by tests. | Billing catch-up and full paid-material sales integration. No live reconciliation against bank/provider statements was performed. |
| Parent portal | Email-link access, explicit grants, family scope, documents, attendance and published academic visibility covered. | Live SMTP/callback delivery, second guardian invitation and financial-family transfer policies need their separate acceptance/configuration. |
| Tutor portal | Assigned class/session access, planning, attendance, materials and human marking workflow covered. | Long-session write recovery and ongoing physical-device/accessibility checks. |
| Student portal | Independent access, assigned work, uploads, receipts, time enforcement, published averages/targets and report PDFs covered. | Expiry-safe submissions and the withdrawal access decision. |
| Teaching/academics | Confirmed session/attendance history, diagnostics/formative/summative purposes, timed work, reviewed marks and frozen reports covered. | Structured question banks, automatic marking, proctoring and richer curriculum/AI features remain future scope. |
| Materials | Private class/session teaching library is implemented; existing public catalogue remains static. | **Admin Materials does not yet edit `/study-materials`.** Public publication, paid order entitlements and finance integration need a separate connected catalogue release. |
| Operations | Build/deployment checks, cron observations and owner-reported backup reviews exist. | Continuous alerting, real backup/restore verification, Storage file recovery, retention and automatic regression gates need operational follow-through. |

## Live checks still required

The source-level tests cannot establish the following production facts. Verify them with the authorized owner on the intended deployment/project:

1. Applied migrations and actual RPC definitions match the reviewed schema, including document finalization and system oversight.
2. Real storage buckets/policies are private; file access and revocation work for two unrelated families and two tutors. Test real upload size/type behavior with dummy files.
3. Supabase email-link SMTP, redirect allowlists and parent/tutor/student URLs work in the intended environment with controlled inboxes.
4. Resend accepts the configured sender; owner tests, enrollment notifications and tuition messages actually reach the controlled inboxes. Provider acceptance alone is insufficient.
5. A real authorized Vercel Cron observation appears on schedule; automation owner, bank confirmation and dispatch flags match intended test/live behavior. Manual runs are not evidence of cron delivery.
6. Provider backups and private Storage file bytes can be restored together into an isolated environment; document the acceptable recovery point/time and access ownership.
7. Opening balances, business account mapping and reconciliations agree with real records before live books begin. Preserve the configured no-VAT, ZAR, EFT/cash and February–November tuition rules.
8. Separate test/live configuration, intended production domain/project, staff ownership and emergency access/revocation are documented. MFA for financial owners should be considered with the actual Auth policy; this audit did not inspect its live setting.

## Recommended repair sequence

1. Restore development file protection and fix the older request parsers, with synthetic regression cases.
2. Add billing recovery/coverage checks; consolidate role safeguards; make long student sessions safe for writes before assessing timed exams operationally.
3. Make enrollment creation/recovery and enrollment/PDF notification outcomes durable and retry-safe. Record paid-material sales in the books when that sales workflow is enabled.
4. Add automatic regression gates, triage dependency upgrades, and fix the confirmed accessibility/route-recovery issues.
5. Resolve the withdrawal access policy, update public/data-handling guidance, then complete the live acceptance checks. Build public Materials management as the next distinct feature release.

## Audit artifacts and reproducibility

Application implementation was left unchanged. This document is the repository audit deliverable. Temporary probes and synthetic fixtures were run outside the checkout; the one development canary was removed.

Core commands: `npm test`, `npm run lint`, `npm run build`, `npx tsc --noEmit -p tsconfig.app.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npm audit --json`, `npm audit --omit=dev --json`.

Additional audit probes exercised the real schema in PGlite with stub Auth/Storage schemas, and real handlers with synthetic upstream responses. Browser checks used Chromium/Playwright and axe-core in a temporary harness; they are not currently part of repository CI (F13).

Temporary evidence in this workspace session:

- `/tmp/viva-audit-tests.log`, `/tmp/viva-audit-build.log`, `/tmp/viva-audit-lint.log` and app/node type-check logs.
- `/tmp/viva-audit-dependencies.json`, `/tmp/viva-audit-production-dependencies.json`.
- `/tmp/viva-audit-sql-results.log`, `/tmp/viva-audit-billing-repro.log`, `/tmp/viva-audit-role-repro.log`, `/tmp/viva-audit-withdraw-repro.log`.
- `/tmp/viva-audit-api-repro.log`, `/tmp/viva-audit-email-repro.log`, `/tmp/viva-audit-route-failure.log`.
- `/tmp/viva-audit-ui.json`, `/tmp/viva-audit-public-site.json`, `/tmp/viva-audit-system-browser.log`, `/tmp/viva-audit-academic-browser.log`, `/tmp/viva-audit-loaders-browser.log`.

Temporary files are session-local evidence, not permanent hosted monitoring or guaranteed future test infrastructure. Retest relevant findings after each fix and repeat the live acceptance checks before live operation.
