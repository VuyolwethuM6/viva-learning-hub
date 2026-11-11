# Milestone 2 engineering delivery report

Completed on the existing `work` branch, preserving `3f1ffee9029de1b28cbc2cef6f2c6f76b3f9c941` and `e8024b490863543002bb9c6b0ac874c76fb41c59`. Backend delivery is commit `2213d96`; the subsequent UI/documentation commit completes this report. The final delivery message records HEAD. No new development branch, push, main merge, deployment, production database mutation, live feature change or production Auth change occurred.

Milestone 2 is complete for code review and controlled target/hosting acceptance. It is not a production execution authorization. No applicant intake, CV upload, interview, hiring, onboarding, activation or compensation feature was started.

## Delivered functionality

- Tutor, administrator and support-staff vacancies, with exactly one employee/independent-contractor/volunteer engagement. Schedule and work arrangement are separate enums.
- Structured role content, responsibilities, qualifications, experience, skills, tutor-only subjects/grades, positions, opening/deadline timestamps, optional remuneration and future document/question descriptors. Incomplete drafts can be saved; complete submission is validated server-side and in PostgreSQL.
- Atomic owner creation of a new scope and vacancy, or creation within an existing authorized vacancy scope. Stable public references and neutral reference-based slugs never expose an unapproved draft title.
- Draft → submitted → approved → published → paused → closed, plus return, immutable revisions, owner republication and closed-only archival. Closed records cannot reopen. Working revisions remain private while the old approved published version stays public.
- Private Admin overview, searchable/filterable paginated listing, five-section wizard, saved drafts, full preview, owner review/approval/publication, officer assignments, version history and metadata audit history.
- Dynamic database-backed Careers cards/category filters/pagination, public vacancy details, clear availability/deadline states, useful empty/error/loading states and a future talent-pool area without registration or personal-data collection.
- Existing M1 password confirmation/session rotation, optional owner AAL2, scoped authority, stable request replay, revisions, audit and UUID-only reload recovery. Recovered publication reviews fetch authorized immutable vacancy context and fail closed if unavailable.

## Database changes

Canonical upgrade: `supabase/migrations/20261109050000_recruitment_vacancies.sql`.

SHA-256: `f5d99995c17fcfcf481e663e18ce09b496456cdd79c8b85c860e80a5a2abf1ab`.

New tables:

1. `recruitment_vacancies`: stable reference/slug/scope, revision, lifecycle/review state, exact draft/approved/published pointers and actor/time metadata.
2. `recruitment_vacancy_versions`: append-only typed JSONB snapshots; generated category/engagement columns and per-vacancy version numbers.
3. `recruitment_vacancy_approvals`: immutable owner approval of a specific vacancy/version.
4. `recruitment_vacancy_publications`: immutable publication evidence linked to an approved version.
5. `recruitment_vacancy_assignments`: explicit officer assignment in addition to scope membership.

Existing settings gain default-off `public_vacancies_enabled` and `public_vacancies_generation`. The migration adds a reference sequence, indexes, composite version/approval FKs, lifecycle/content checks and immutable-history triggers. Selected service-only RPCs extend existing M1 dispatchers; browser roles have no direct protected table/RPC grants. Existing M1 migration files are unchanged. The fresh schema and transactional upgrade bundle contain the exact canonical migration; populated-M1 upgrade tests preserve tutor bindings, owner/admin identities and journal/line snapshots.

No applicant/interview tables, Storage buckets, account identities, teaching assignments or accounting behavior are added or changed. Do not replay older M1-only setup bundles after later migrations; follow the migration history and current reviewed upgrade instructions.

## Screens and API routes

| Route | Implemented behavior |
| --- | --- |
| `/admin/recruitment` | Existing isolated staff authentication; Vacancy management and Security/governance workspaces |
| `/careers` | Published approved vacancy cards, category filters, pages, availability, empty/error states, informational future talent pool |
| `/careers/:slug` | Approved published details, deadlines and client-updated title/description/canonical/robots metadata |
| `GET /api/admin/recruitment?route=vacancies` | Authorized list/search/filter/page; selected vacancy and paginated version history via query parameters |
| Existing private `reauthenticate`, `mutate`, `recover` routes | Strict `vacancy_*` operations using existing proofs, assurance, revisions and request recovery |
| `GET /api/careers` | Whitelisted, paginated/category-filtered public projection |
| `GET /api/careers?slug=...` | Single authoritative published detail; unavailable records return404 |

Detailed operation payloads and limits are in [API contracts](api-contract.md). Public routes cannot submit applications. Dynamic detail URLs are routed through the existing application, not a separate site. Existing general Admin navigation links to recruitment without granting shared permissions.

## Authorization and publication boundaries

Owners have organization-wide recruitment visibility and sole final approval/publication/return/pause/close/archive/public-flag authority. Managers operate only in active authorized scopes; officers also require an explicit active vacancy assignment. Owners introduce officer scope relationships; scoped managers may assign eligible officers. Revocation remains possible when a target can no longer authenticate. Self-assignment changes are prohibited.

Authorization is enforced in API and database functions. Mutation authorization and current owner AAL2 requirements are checked before replay; lifecycle/revision validation follows exact successful-request replay so completed operations remain safely repeatable. Immutable content/approval/publication links prevent draft edits from becoming public implicitly.

Public queries select only database-published records tied to immutable approved versions. A second API whitelist strips unknown/private fields, including nested document/question metadata. Scope/staff references, draft pointers, assignments and audits never appear publicly. Publication/visibility generation and time-derived availability feed the representation ETag. Mandatory database revalidation occurs before 304; failures use no-store with no stale fallback. Pause, closure and flag-off remove current public visibility.

Public flag installation remains OFF. All application, upload, interview, decision, onboarding, activation and compensation features remain unavailable. Retention constants do not imply a working applicant retention job.

## Verification results

| Check | Final result |
| --- | --- |
| `npm test` | **375 tests passed across 40 files; zero failed/skipped** |
| M2 database/migration tests | 16 passed, including scoped access, immutable snapshots, replay/concurrency, neutral slugs, pagination/history/resource bounds, ACLs, canonical consistency and populated-M1 preservation |
| New private vacancy API tests | 5 passed using real SQL and synthetic Auth |
| Public API tests | 9 passed, including projection/privacy, flags, ETags, closure, input/payload bounds and no stale error fallback |
| Public Careers UI tests | 7 passed |
| Vacancy Admin/wizard UI tests | 11 passed |
| Shared vacancy validation | 4 passed |
| Recovery/navigation regressions | 2 additional security-review tests and 1 new root-navigation test passed |
| Existing M1 recruitment, academic, teaching, enrollment, Admin and accounting regressions | Included in complete passing suite |
| Application TypeScript | Passed |
| Node/API TypeScript | Passed |
| ESLint | Exit 0; zero errors and only seven existing UI Fast Refresh warnings |
| Production build | Exit 0 ; 19 routes plus noindex 404 prerendered |
| Diff whitespace | Passed |
| Guarded repository review fixture | Smoke passed: default-off public API, actual owner session/private workspace; missing opt-in rejected |

Development verification exposed and corrected a SQL alias conflict, test adapter SQL-null serialization, list/detail state mixing, potential payload overflow, initial private-title slug exposure, stale navigation after completed recovery and missing recovered vacancy review context. Regression tests and browser reruns cover the fixes. Initial failures are not represented as passing results.

The existing Browserslist staleness and SSR `useLayoutEffect` warnings remain. The known prerender shutdown diagnostic `The build was canceled` still prints after successful route generation and exit 0. A concurrent local test process also caused a WebSocket-port warning during one build; it is not a production runtime certification. No application dependencies or lockfiles were changed.

## Browser and accessibility evidence

Chromium acceptance used the actual Node APIs and full in-memory PostgreSQL schema with an explicitly synthetic Auth adapter; outbound requests were blocked. It verified the full wizard/lifecycle, live-versus-draft separation, public flag, scoped staff denials, forced committed-response loss/reload without duplicate save, restored navigation, ETag invalidation, republication, immutable history, closure and archive.

No unexpected page errors occurred. Console output included expected unauthenticated 401s and the deliberately aborted response. Existing authentication limits were retained; the synthetic fixture reset rate-limit windows between independent long scenarios. This was not a production limit bypass.

No horizontal overflow was found at 320, 390, 768 and 1440px on public listing/details and Admin history. Six screenshots were saved under `/workspace/artifacts/viva-m2-acceptance`. Automated axe checks found zero WCAG 2 A/AA and 2.1 AA violations on the tested mobile Careers empty state, recruitment sign-in and vacancy Admin states; this is not a claim about every page/state. The pre-existing mobile telephone-link accessible name was corrected with one aria-label.

Portable summaries are committed as [browser acceptance](browser-acceptance.json) and [accessibility results](accessibility-results.json).

## Review instructions and remaining limits

Follow [deployment and local review instructions](deployment-and-review.md). A guarded localhost-only fixture (`scripts/recruitment-acceptance-server.mjs`) makes the real APIs/schema reviewable without a live database change. It requires an explicit opt-in, rejects hosted/production execution, uses synthetic credentials/data only, blocks outbound fetches and loses all data on restart. It is not another application authentication provider or production database.

Remaining acceptance gates:

- Inspect the exact existing unified Supabase target schema, dependencies, function definitions/overloads/owners, inherited grants and migration state before any live execution approval. No live target inspection or migration was performed in this milestone.
- Confirm hosted Auth/MFA enrollment/recovery, session refresh/revocation/single-session behavior and effective browser/service privileges against the actual deployment. Local synthetic Auth does not certify these.
- Verify true parallel hosted database contention, deployment response limits, routing, cache revalidation and provider failure behavior. PGlite queues local concurrent requests; it is not a multi-connection hosted load test.
- Dynamic vacancy detail metadata is client-rendered after authoritative data loads and is noindex until then. There is no build-time production vacancy fetch or JobPosting JSON-LD while applications are unavailable. Validate deployed crawler behavior before an SEO launch decision.
- Public pages are 20 records; private lists/history are 50 records per page. Audit UI shows the newest 200 relevant events; full immutable evidence remains in the database. Content bounds are15 KB API/16 KB database, and all pagination cursors are bounded.
- UUID-only request recovery is per browser tab. Lost tabs or unavailable/unauthorized historical requests can require the documented M1 operator resolution. No credentials, proof, MFA code or choice payload is persisted locally.
- Existing per-action password reauthentication rate limits remain in effect; high-volume review sessions are subject to them. No limits were weakened for M2.

Readiness recommendation: approve M2 code review and controlled target/hosting acceptance next. The foundations support a separately authorized Milestone 3 design/implementation, but no applicant-facing launch should proceed until the relevant target/hosting checks and later intake/document security requirements pass. M3 was not started. Production migration, live flag changes, push/deployment and main merge each remain subject to separate explicit approval.

## Exact files created and modified

The following list covers this complete M2 delivery relative to `e8024b4`:

- `api/_lib/recruitment-input.ts`
- `api/_lib/recruitment-permissions.ts`
- `api/_lib/recruitment-security-service.ts`
- `api/admin/recruitment.ts`
- `api/careers.ts`
- `docs/recruitment/milestone-1-setup.md`
- `docs/recruitment/milestone-2/accessibility-results.json`
- `docs/recruitment/milestone-2/api-contract.md`
- `docs/recruitment/milestone-2/architecture.md`
- `docs/recruitment/milestone-2/browser-acceptance.json`
- `docs/recruitment/milestone-2/deployment-and-review.md`
- `docs/recruitment/milestone-2/implementation-report.md`
- `docs/recruitment/milestone-2/migration.sql`
- `scripts/recruitment-acceptance-server.mjs`
- `src/App.tsx`
- `src/components/Header.tsx`
- `src/components/RouteMetadata.tsx`
- `src/components/admin/recruitment/RecruitmentSecurityWorkspace.tsx`
- `src/components/admin/recruitment/RecruitmentVacancyWorkspace.tsx`
- `src/components/admin/recruitment/VacancyWizard.tsx`
- `src/components/admin/recruitment/vacancy-workspace.css`
- `src/components/careers/PublicVacancyContent.tsx`
- `src/lib/pageMetadata.json`
- `src/lib/public-careers.ts`
- `src/lib/recruitment-client.ts`
- `src/lib/recruitment-types.ts`
- `src/lib/recruitment-vacancies.ts`
- `src/pages/Careers.tsx`
- `src/pages/RecruitmentAdmin.tsx`
- `src/pages/VacancyDetail.tsx`
- `src/test/fixtures/public-vacancy.ts`
- `src/test/public-careers-api.test.ts`
- `src/test/public-careers-ui.test.tsx`
- `src/test/recruitment-admin-navigation.test.tsx`
- `src/test/recruitment-api.test.ts`
- `src/test/recruitment-migration.test.ts`
- `src/test/recruitment-security-ui.test.tsx`
- `src/test/recruitment-vacancies-database.test.ts`
- `src/test/recruitment-vacancies-ui.test.tsx`
- `src/test/recruitment-vacancy-api.test.ts`
- `src/test/recruitment-vacancy-validation.test.ts`
- `supabase/migrations/20261109050000_recruitment_vacancies.sql`
- `supabase/schema.sql`
- `vercel.json`
