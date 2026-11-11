# Recruitment Milestone 3 implementation report

M3.2–M3.6 is implemented on `work`, based on accepted corrected M3.1 commit `3cf6af5c882305e2ea8777cf5a0646b8e970c0a5`. Database/services commit: `367d0caf1701cd68accf6d5bbb14aa039253e1f3`. The frontend/integration release commit is the commit containing this report; obtain its exact hash with `git log`. No push, merge, deployment, production SQL/Auth change, live applicant email or real applicant collection occurred. M4 is not implemented.

## Delivered

- Accountless verified-email beginnings/recovery, deliberate one-use proof exchange, dedicated case-scoped HttpOnly sessions, sign-out and current email-revision checks. No applicant Auth accounts or new provider.
- Owner-approved immutable tutor/administrator/support templates, approved vacancy/form/publication pins, dynamic approved role questions, explicit form rebasing, completeness-only checks and adult affirmation.
- Responsive four-step applicant workspace: personal information, role experience, private documents, review/submit. Draft saves use revision checks, append-only payloads, stable request IDs and status/tombstone recovery across reloads. Browser persistence contains only opaque UUID/operation metadata, never PII or credentials.
- Private bounded chunk transport, quarantine, provider-independent signed HTTP scanning, executable real ClamAV INSTREAM gateway, exact-byte SHA/generation/claim verification, immutable clean promotion, authenticated downloads, fail-closed scanner attestation and cleanup. No production mock-scanner selection exists.
- Atomic sealed submissions and receipt UUIDs, receipt status/printing, encrypted short-lived verification outbox, sanitized applicant/staff notifications and scoped clarification/replies without editing sealed answers.
- Recruitment application/talent-pool queues with body-only PII search, keyset pagination, current scope + explicit case assignments, human notes/recommendations, independent owner privacy controls and declared/matching conflicts. Private drafts and ended-case answers are not staff-readable. Notes/messages have bounded older-history pages.
- Affirmative pool consent/renewal, withdrawal, owner-authorized controlled reapplication, expiry, holds, finite review extensions, irreversible erasure barriers, object-before-PII deletion, late-write reconciliation and protected offline backup-erasure signing/restore tooling.
- Conditional Careers/talent-pool entry points based on current database eligibility, private noindex/no-store/CSP headers, analytics isolation and forced fresh-document entry when a public analytics instance exists.

## Routes and integrations

Public existing routes: `/careers`, `/careers/:slug`; Apply and pool links appear only when the server confirms approved binding, policy, readiness, publication/deadline and enabled flags. Disabled installation remains the existing read-only Careers experience.

Private applicant routes: `/recruitment/apply/:slug`, `/recruitment/verify`, `/recruitment/recover`, `/recruitment/application`, `/recruitment/talent-pool`. Navigation into private pages uses a full document; proof fragments are stripped before exchange and never placed in query strings or analytics.

Existing `/admin/recruitment` now includes Applications and talent pool, plus owner-only Forms and intake. Existing Vacancy management and Security and governance remain.

Node router `/api/recruitment?route=...`: form/policy GET; email POST begin/resend/recover/inspect/exchange; applicant GET/PATCH/POST/DELETE; documents POST reserve/chunk/finalize/discard and authorized GET parts; messages GET pages; separate bearer worker POST mail/scan/retention. Applicant actions: save/rebase/cancel_pending/submit/reply/withdraw/request_deletion/renew/reapply.

Existing staff router adds forms/applications/privacy/case-stage/case-reauthenticate/case-mutate/case-recover/case-documents/case-messages/case-step-up. Existing owner-confirmed M1 dispatcher adds only intake_policy/intake_form_approve/intake_form_bind governance metadata. Full methods, exact request/response structures, errors, limits, principals and RPC boundaries are in `runtime-contracts.md`.

The existing Supabase backend and dedicated recruitment staff Auth remain authoritative. Existing `teaching_tutors`, tutor binding/access, enrollment, teaching/academic APIs, ledger posting and general administrative identities are not replaced or activated.

## Database and migration impact

Apply the complete four-migration transaction bundle only after separately authorized target inspection. Corrected M3.1/M2 are prerequisites. `supabase/schema.sql` is a synchronized fresh-install snapshot, not the production upgrade instruction.

1. `20261111030000_recruitment_applicants.sql`: notices, temporary abuse counters, email challenges, hashed applicant sessions, encrypted outbox, draft/rebase/session and owner form/policy governance contracts.
2. `20261111040000_recruitment_documents_submissions.sql`: case documents, scan jobs, sealed submissions, two private buckets, quarantine/clean authorization and submission contracts.
3. `20261111050000_recruitment_case_operations.sql`: notes/replies, deletion jobs, retention runs, finite erasure evidence, case proofs/assignments/review/privacy, leased workers and protected operational attestation.
4. `20261111060000_recruitment_runtime_guards.sql`: lock/grace/retention guards, protected backup export/restore, conflict/read expiry enforcement, public eligibility, message pages, composite case/form/context checks and restrictive Storage isolation.

There are 12 new tables plus the 13 accepted foundation tables: 25 total. Existing foundation tables receive additive fields/constraints; no table is deleted/renamed, no applicant/interview/offer/activation entity outside this milestone is added. Approved versions/payloads remain immutable. All recruitment data tables deny direct browser/service table privileges and use RLS; narrow service-role RPCs revalidate capabilities or current staff authority. Operational attestation/backup export/restore remain database-owner-only with operator/session_user/approval audit records.

The five existing intake flags remain NOT NULL false, and `recruitment_m31_intake_interlock` is preserved. No UI or new RPC enables them. No actual privacy notice/evidence retention, backup horizon or scanner attestation is seeded. There is no approved or default 90-day proof policy. Production enablement requires a later explicitly approved interlock/rollout change.

Canonical SHA-256 values and the transaction-bundle checksum are recorded in `release-manifest.json`. `node scripts/recruitment-m3-sync.mjs --check` verifies schema/bundle identity without accessing any database.

## Verification

Local PostgreSQL execution uses PGlite; API/provider adapters and browser fixtures contain only synthetic `.test` identities and block live network services. These are not hosted Supabase acceptance results.

- Full Vitest regression: **448 tests passed in 48 files**, no failed/skipped automated tests. This includes the original 411 tests and 37 new M3 tests.
- TypeScript application and Node/API projects: passed (`npx tsc --noEmit -p tsconfig.app.json`, `...tsconfig.node.json`).
- Lint: passed, zero errors; seven existing Fast Refresh warnings in shared UI components.
- Production build: exit 0; 19 public routes and noindex 404 prerendered. Existing Browserslist/chunk/SSR-prerender diagnostics remain, including the post-prerender “The build was canceled” shutdown message; this is not reported as a warning-free build.
- Chromium synthetic acceptance: 390×844 applicant verification → role form → draft saves → quarantine upload → signed scan → sealed receipt; 1440×900 staff sign-in → queue → fresh-confirmed private note. No page errors, no mobile horizontal overflow, no applicant analytics initialization. Expected unauthenticated staff snapshot 401 occurs before login.
- Real HTTP scanning gateway + actual TCP INSTREAM framing tested against a **synthetic protocol peer**, including clean/infected/error results. Signed provider context, forged/stale/unknown verdicts and envelope/key rotation tested. No actual malware-engine detection or hosted mail/Storage acceptance is claimed.
- Database/API regressions exercise case/capability/generation isolation, 40 MiB quota, approved role forms, revisions and competing commands, replay/key versions, unknown-response recovery, cancellation tombstones, immutable evidence, publication checks, staff scope/assignment/conflicts, direct grants, restrictive Storage alongside permissive legacy policies, applicant-only messages, affirmative pool consent, privacy holds/barriers, verified deletion, late writes and final evidence expiry.
- Existing recruitment MFA/session/security, academic, teaching, enrollment, parent, accounting and public Careers regression suites passed. No ledger or academic implementation change was required.

Material defects caught during integration were corrected: SQL variable ambiguity, upload-client reservation metadata leaking into strict chunk requests, stale revision use after document finalization in tests, poisoned outbox rows blocking later deliveries, unsafe pre-existing bucket configuration, incomplete erasure sweep/final-check fairness, message response bounds, PII query-string search, and uncertain-request UI command recovery after later errors/status refresh.

## Remaining operational dependencies and risks

**High release blockers:** actual privacy/retention/notice approval (including minimal consent/audit proof lifetime), accepted real scanner with maintained definitions/coverage, approved provider/sender configuration and scheduler, durable external erasure-ledger storage and demonstrated offline restore. Public intake/uploads/pool stay disabled until separately authorized.

**Medium hosted acceptance:** real Supabase Auth refresh/TOTP/cookies and Storage/RLS, PostgREST signatures/grants, independent PostgreSQL connections and deadlock/race behavior, trusted client-IP headers/edge abuse protection, 10 MiB chunked transport across actual hosting limits, real email deliverability/no tracking and provider idempotency, worker interruption/late writes and full backup reconciliation. PGlite competing mutations do not prove multi-connection PostgreSQL locking behavior.

**Low/known limitations:** PDF-only documents; interrupted file transfers can require removal/reselection rather than persisted local file recovery; existing lint/build/test-console warnings; deployment-scale queue/search/scan load acceptance not performed. Opaque erasure manifests currently require explicit batch review above 10,000 records. Age eligibility is affirmative 18+ declaration, not additional sensitive identity collection. No known unaddressed material defect remains in exercised local paths; this is not a substitute for independent hosted security acceptance.

## Review and release prerequisites

For safe local review:

```sh
VIVA_RECRUITMENT_LOCAL_ACCEPTANCE=1 node scripts/recruitment-m3-acceptance-server.mjs
```

This starts an opt-in in-memory synthetic environment at `http://localhost:4183`, creates no hosted project and blocks live provider calls. Synthetic owner/manager/officer logins use their role at `example.test` with the clearly synthetic test password in the harness. The synthetic link/scan helpers are test-server-only and are never imported into deployed routes. Optionally run `PLAYWRIGHT_CORE_PATH=/absolute/path/to/playwright-core/index.mjs node scripts/recruitment-m3-browser-test.mjs`; use an existing local Playwright installation and Chromium. Screenshots are local synthetic artifacts, not applicant data.

Before a production migration: inspect the actual target with the read-only preflight; verify prerequisite/checksums and Storage policy ownership; review all additive SQL/impact and backup/forward-recovery plan; obtain explicit execution approval for the exact bundle. Before rollout: complete operational/security/legal acceptance, configure separate keys/real providers/workers, approve/bind actual owner-reviewed forms and notices, then separately review interlock replacement and staged flags. Do not execute the synthetic fixture’s interlock removal on production. `operations.md` gives executable operator, hold, erasure, restore and incident procedures. M1 owner loss/recovery remains `docs/recruitment/owner-recovery-runbook.md`.

Recommendation: M3 is ready for code review and **M4 development against these gated contracts**. It is **not authorized for production intake or operational launch**. Interviews, hiring/rejection decisions, offers, onboarding, compensation and access activation remain outside this delivery.

## Exact changed-file inventory

```text
api/_lib/recruitment-case-service.ts
api/_lib/recruitment-input.ts
api/_lib/recruitment-intake.ts
api/_lib/recruitment-scanner.ts
api/_lib/recruitment-security-service.ts
api/_lib/recruitment-storage.ts
api/_lib/recruitment-worker.ts
api/admin/recruitment.ts
api/careers.ts
api/recruitment.ts
docs/recruitment/milestone-3/api-and-security.md
docs/recruitment/milestone-3/implementation-plan.md
docs/recruitment/milestone-3/implementation-report.md
docs/recruitment/milestone-3/m3.2-implementation-plan.md
docs/recruitment/milestone-3/migration-plan.md
docs/recruitment/milestone-3/migration.sql
docs/recruitment/milestone-3/operations.md
docs/recruitment/milestone-3/preflight.sql
docs/recruitment/milestone-3/release-manifest.json
docs/recruitment/milestone-3/runtime-contracts.md
docs/recruitment/milestone-3/technical-design.md
scripts/recruitment-clamav-gateway.mjs
scripts/recruitment-erasure-manifest.mjs
scripts/recruitment-m3-acceptance-server.mjs
scripts/recruitment-m3-browser-test.mjs
scripts/recruitment-m3-sync.mjs
src/App.tsx
src/components/Analytics.tsx
src/components/RecruitmentPrivacyBoundary.tsx
src/components/admin/recruitment/RecruitmentCasesWorkspace.tsx
src/components/admin/recruitment/RecruitmentFormsWorkspace.tsx
src/lib/analytics.ts
src/lib/recruitment-applicant-client.ts
src/lib/recruitment-applications.ts
src/lib/recruitment-client.ts
src/lib/recruitment-types.ts
src/lib/recruitment-vacancies.ts
src/pages/Careers.tsx
src/pages/RecruitmentAdmin.tsx
src/pages/RecruitmentApplicant.tsx
src/pages/VacancyDetail.tsx
src/pages/recruitment-admin.css
src/test/helpers/recruitment-m3.ts
src/test/recruitment-m3-api.test.ts
src/test/recruitment-m3-client.test.ts
src/test/recruitment-m3-gateway.test.ts
src/test/recruitment-m3-recovery.test.ts
src/test/recruitment-m3-runtime.test.ts
src/test/recruitment-m3-scanner.test.ts
src/test/recruitment-m3-ui.test.tsx
supabase/migrations/20261111030000_recruitment_applicants.sql
supabase/migrations/20261111040000_recruitment_documents_submissions.sql
supabase/migrations/20261111050000_recruitment_case_operations.sql
supabase/migrations/20261111060000_recruitment_runtime_guards.sql
supabase/schema.sql
vercel.json
```
