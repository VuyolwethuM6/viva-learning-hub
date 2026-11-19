# Recruitment M4/M5 engineering delivery

## Result and release boundary

This extends the existing Viva Tutorials implementation on `work`, based on `a43264159ef549e1360005e14f5e21b0a166cd83`. It implements M4 selection, M5 engagement, shared M1–M5 administration navigation/layout, applicant continuation, scoped reporting, communications/worker extensions and incremental installation preparation. `main` remains the production branch.

No production SQL, hosted feature changes, real applicant communications, real staff activation, environment-variable configuration, push, merge or deployment was performed. M1–M3 installation and the Life Sciences vacancy were not reinstalled or altered. Historical production observations were not re-certified by local tests.

## Implementation commits

- `a9fcd7e4404230d8419b7a5473cea7f29127e8ce`: secure selection/engagement database and server implementation, integration/security tests.
- `641ff822971a18947a0d4c657f9657ec653dd745`: shared recruitment administration and applicant workflows, UI tests and compatible hosting routes/assets.
- The following documentation/acceptance-package commit completes the delivery; use `git log a432641..work` for its exact hash. No commit was pushed.

## Delivered functionality

M4 provides a scoped submitted-candidate inbox with body-only name/email search, vacancy/stage filters and bounded pagination. Candidate tabs expose submitted profiles, clean documents, screening evidence, human shortlisting, information requests, interviews, assessments, independent evaluations, recommendations, decisions, communications and history. Applicant-facing information requests use a separate message; private reasoning remains private. Interviews support multiple rounds, assigned interviewers, private meeting details, confirmations, reschedule requests, cancellation, completion and no-shows. Known booking conflicts are checked under transaction locks; no external calendar availability is claimed.

Assessment instructions and evaluator assignments are role-aware. Scorecards support configurable scales/weights, mandatory feedback, independent submissions and explicit corrections. Superseding an assessment requires owner AAL2 and retains prior evidence. Corrected scorecards invalidate stale recommendations for final approval. Scores never automatically rank, reject or hire. Final owner decisions require AAL2; unsuccessful outcomes use the existing six-month retention rule.

M5 provides immutable offer versions, employee/contractor/volunteer consistency, owner approval and issuance, secure applicant acceptance/decline, withdrawal/replacement and deadline expiry. Approved agreement/policy templates need a legal approval reference; no production legal wording is seeded or claimed enforceable. Applicant acceptance evidence pins the exact version. A branded authenticated PDF contains the immutable offer and agreement, candidate/vacancy context and agreement digest; it grants no access.

Onboarding supports role-specific requirements, explicit additional documents/declarations/checks, staff task assignment/due dates, approved policies, independent candidate acknowledgements and staff verification. Later uploads reuse the real existing PDF quarantine/scanning protocol. Mandatory clean evidence and verified checks precede separate owner activation.

Activation links a verified existing platform Auth identity to the authoritative tutor identity or approved existing Admin capability. It prevents duplicate active engagements and unintended privileged-account linkage. Approved tutor subjects/grades constrain class/session assignment for newly recruited tutors; legacy tutor records and history retain their existing behavior. Support staff receive no inferred portal privileges. Recruited administration-only viewers cannot read dedicated accounting snapshots/documents/exports; existing legacy viewers retain their previous permissions.

An authorised recruitment owner with existing accounting permission can prepare a bill for completed approved tutor sessions at the accepted rate through account `5000`. Durable session linkage prevents duplicate billing. This does not make a payment or implement a payroll service.

Personnel suspension and offboarding remain available to an assured owner even after applicant case expiry/withdrawal or rollout flags are paused. Offboarding records the approved effective date separately from the actual revocation time, handles class responsibility reassignment and blocks unresolved future sessions or unreconciled completed sessions. It disables authoritative operational access while preserving teaching/accounting history. Provider-level session revocation is a separate hosted acceptance item.

The existing outbox/mail worker is extended with generic selection/engagement notices. A bounded lifecycle worker queues interview, offer and onboarding reminders and expires issued offers. Durable deduplication survives outbox pruning; source status, recipient, privacy and flags are rechecked before delivery. No confidential evaluations, meeting links or offer terms enter email bodies.

Lost responses can be checked by opaque request UUID. Cancellation either confirms the original committed action or records a durable tombstone that blocks delayed preparation/mutation. Only current staff authority or the existing applicant capability can cancel that caller's own request. Browser storage contains opaque request metadata, never credentials, proofs or applicant answers.

## Database changes and authorization

Five ordered migrations add 25 RLS-protected tables to the reported 42-table M3 baseline (67 recruitment tables after this release). Groups cover selection, assessment/results, interview/history, screenings, evaluations, recommendations/decisions, immutable offers/agreements, onboarding/tasks/document links, staff engagements, tutor-session bills, requests/events, reminder deduplication and cancellation tombstones. The exact inventory, source hashes and service RPC allowlist are in `production/manifest.json`. The final allowlist contains 67 recruitment service RPCs (including preserved baseline entrypoints).

All new tables deny direct browser and service-role table writes. Only explicitly allowed server RPCs have service execution. Security-definer functions fix `search_path`; internal helpers remain ungranted. Current scope, assignment, conflict, case capability, assurance, revision, lifecycle and rollout controls are enforced in SQL and the server. Owner-only approvals are not frontend-only restrictions. Immutable evidence remains private and participates in lawful retention/erasure; applicant headers can complete finite erasure without deleting authoritative teaching or financial history.

Existing functions replaced by the incremental package have baseline-body drift guards, including three accounting read functions. Existing privacy/retention, draft upload, Storage and academic/accounting behavior is preserved. The canonical `supabase/schema.sql` remains the documented M1–M3 baseline; local fresh M4/M5 setup applies the five additive migrations in order. Do not load that full schema onto production.

New `selection_enabled`, `onboarding_enabled` and `activation_enabled` controls default false. Existing controls retain their values. The recruitment snapshot now reports authoritative switches instead of historical hard-coded M2 unavailability; recorded configuration does not prove external operational readiness.

## Screens and routes

- `/admin/recruitment/overview`: shared module overview.
- `/admin/recruitment/vacancies`: existing M2 workspace within the common shell.
- `/admin/recruitment/cases` and `/admin/recruitment/applications`: existing case assignments, notes and privacy controls.
- `/admin/recruitment/selection`: screening, interviews, assessments, evaluations and decisions.
- `/admin/recruitment/engagement`: offers, agreements, onboarding, activation, payment preparation and owner personnel safety view.
- `/admin/recruitment/reports`: permission-filtered vacancy/stage, screening/interview, offer, onboarding, activation and processing-time summaries.
- `/admin/recruitment/security`, `/admin/recruitment/forms`, `/admin/recruitment/deployment`: existing governance surfaces preserved; Forms and deployment remain owner-only.
- `/recruitment/application`: accountless interview responses, safe assessment instructions, offers/PDFs, agreement/policy acceptance and onboarding continuation.

All private administration pages reuse the Admin Dashboard brand, shell conventions, typography, tokens, tables/forms and responsive patterns. Public Careers/applicant views retain public branding without the private sidebar. Wildcard hosting rewrites support direct private deep links. Shared recruitment function packaging includes the existing official logo/fonts for PDF generation.

## APIs

No new independently deployed function was added. Existing multiplexing and cookie/authentication boundaries remain:

| Endpoint | New behavior |
| --- | --- |
| `/api/admin/recruitment?route=selection` | GET list/detail/recovery or `report=summary`; POST bounded search or validated fresh-confirmed screening/interview/assessment/evaluation/recommendation/decision command; cancellation of own pending request. |
| `/api/admin/recruitment?route=engagement` | GET case/recovery or owner `view=personnel`; POST template/offer/onboarding/activation/payment/offboarding commands and own pending cancellation. |
| `/api/recruitment?route=selection` | GET capability-scoped public stage/interview/assessment/recovery; POST attendance or reschedule response and own pending cancellation. |
| `/api/recruitment?route=engagement` | GET issued applicant projection/recovery or authenticated `document=offer&offerId=...` PDF; POST acceptance/decline/agreement/declaration or own pending cancellation. |
| `/api/recruitment?route=documents` | Existing bounded reserve/chunk/finalize/discard/download contract, narrowly extended to eligible onboarding tasks. |
| `/api/recruitment?route=worker` | Existing authenticated worker accepts `action:lifecycle` in addition to mail/scan/retention. |

Recruitment communications remain email-only. The existing accounting cron and twelve-function Hobby budget are preserved.

## Verification

Final command outcomes are recorded below after the stable-tree acceptance run. Earlier interrupted runs are not represented as successful results.

| Check | Actual result |
| --- | --- |
| `npm test -- --maxWorkers=1` | **594 passed across 69 files; zero failed/skipped**. Includes existing enrollment, Admin, learner/parent, academic/teaching, accounting, M1–M3 recruitment and new M4/M5 regressions. |
| `tsc --noEmit -p tsconfig.app.json` | Passed. |
| `tsc --noEmit -p tsconfig.node.json` | Passed. |
| `npm run lint` | Exit 0; zero errors, seven existing shared-UI Fast Refresh warnings. |
| `npm run build` | Exit 0; root API check confirms **12/12** deployed function entries and zero diagnostics; Vite build and 20 prerendered routes plus noindex 404 completed. |
| `node scripts/recruitment-m45-package.mjs --check` | Passed; five exact migrations, 25 new RLS tables, 13 guarded baseline functions. |
| Incremental package rehearsal | Nine passing tests within the complete suite; populated baseline preservation, drift/approval/ACL checks, transactional rollback and repeat-install safety. |
| Full SQL tutor journey | Passed: verified application → human selection/interview/evaluation → owner decision → approved issued offer → acceptance/policies/onboarding → tutor activation → offboarding. |
| Browser/visual evidence | 36 matching Admin/recruitment route/viewport checks and 10 connected functional journey steps (21 fixture operations) passed; no browser exceptions or fixture errors. |
| `git diff --check` | Passed. |

Existing warnings remain: Browserslist data age, React Router future notices, server-rendered `useLayoutEffect` warnings and the prerender shutdown diagnostic `The build was canceled` after successful generation and exit 0. These are reported, not interpreted as failed tests. The first sandboxed broad run could not open required sockets/subprocesses; it was rerun with approved local execution access. Earlier test failures were investigated and corrected before this stable-tree acceptance run.

Database tests use actual disposable PGlite PostgreSQL with synthetic identities/data. They exercise state machines, grants, negative authorization, sealed submissions, immutable evidence, request replay/cancellation, quotas, scan-verdict integrity, concurrent queued mutations, financial linkage, full tutor lifecycle and erasure. PGlite serializes a single local SQL executor; these tests do not certify hosted multi-connection contention.

The installation rehearsal starts from populated M3 and preserves existing records, Auth rows, Storage buckets, settings, audit events and vacancy numbering. It tests missing approvals, changed function bodies, partial prior installation, unsafe grants, full-DDL postflight rollback, successful installation and repeat-install refusal. Failed postflight work rolls back atomically.

Browser evidence is deliberately separated from backend tests. `visual/evidence.json` records 36 Admin/recruitment comparisons across 1440/768/375/320 widths; `visual/functional/evidence.json` records the connected staff/applicant journeys using mutable intercepted synthetic API fixtures. Those browser fixtures verify actual UI/client payload behavior, not hosted Auth, SQL, scanning, delivery or real provisioning. Screenshots and manually inspected mobile fixes are retained. Unit/UI tests include keyboard, validation, permission visibility, exact acknowledgements, upload recovery, clean-document restrictions and body-only private searches.

Initial validation exposed and corrected a selection-row/SQL-alias ambiguity, missing default revision projection, rollout flag gaps, stale recommendations after corrections, blocked finite header erasure, overbroad finance reads, offboarding date loss, candidate date-field mismatches, stale personnel status, lost pending-action display and package test injection escaping. Regression tests cover the corrections.

## Operational limits and production prerequisites

No hosted credentials/services are available in this workspace. Before production execution, inspect the actual target schema and dependencies, review the exact incremental SQL/hash and non-destructive impact, confirm current backups and rehearsed recovery, and obtain separate execution approval. Code deployment and business activation also require separate approval. The old fresh-install package must never be rerun on populated production.

M3 public intake remains closed until its existing operational acceptance is completed: owner MFA/recovery, independent-owner governance, approved privacy notice/minimal evidence lifetime/form binding, real email delivery, private Storage, actual malware scanner/TLS/definitions, worker scheduling, backups and erasure reconciliation. No 90-day evidence policy is invented. The sole-owner bootstrap does not waive the two-independent-owner release requirement; the proposed alternative in `production/README.md` requires a separately approved policy revision.

Legal review must approve actual South African employment/contractor/volunteer terms and electronic acceptance. No legal enforceability is inferred from a checkbox. Activated personnel require explicit lawful retention/review evidence. Raw banking/emergency-contact collection is not enabled by default; role-specific necessary evidence can use approved private requirements. Existing verified Auth identities must be supplied through the approved account setup/recovery process; no real accounts are created in development.

Support-staff portal capabilities beyond the existing platform's actual permission model are not invented. Existing coarse administration access requires explicit approval; recruitment, finance writes and owner authority are never inferred. Tutor bill preparation does not pay funds. Manual interview scheduling does not claim external calendar integration. Provider-wide token revocation, real deliveries/scanning, restore drills and multi-connection hosted concurrency remain unverified.

The PDF limits remain eight files/40 MiB total and 10 MiB per file across application and onboarding. Already pinned documents cannot be replaced to evade the quota. If all slots are occupied, reuse suitable clean evidence or obtain a reviewed policy change; no silent quota expansion occurs.

## Review instructions and recommendation

Start with `review-guide.md`, `ui-standardisation.md` and `onboarding-documents.md`. Use the isolated tests/browser scripts to review enabled flows without production configuration. The guide includes navigation, setup, actions, expected results and negative checks. The incremental execution package is `production/migration.sql`; `production/preflight.sql`, `verify.sql`, `manifest.json` and `README.md` provide the exact review/recovery boundary. Source-file inventory is in `changed-files.txt`.

Engineering readiness and live acceptance are separate. Recommend controlled owner review of this implementation and incremental package, followed by target-specific operational acceptance and explicit approvals. Do not enable intake, promote code, run production migrations or activate real staff based solely on passing local tests.


## Code-promotion configuration handover

The owner subsequently requested merging to main and end-to-end configuration instructions. `production/end-to-end-configuration.md` and the four-action `worker-invoke.mjs.example` provide the concrete handover without executing production configuration. The configuration additions change no application API or database source; the original 594-test application verification remains the implementation baseline. Publishing/merge status must be confirmed separately in the task response.


## Vercel schema correction after initial promotion

The hosted build rejected the recruitment function includeFiles string because it exceeded Vercel's 256-character schema limit. The asset pattern is now an equivalent nested brace glob of 220 characters. Tests check every required deployment artifact and supplementary document plus the official logo/regular/bold fonts remain matched, and unrelated materials/screenshots remain excluded. The local prebuild check now rejects oversized includeFiles values before compiling APIs. The deployment manifest was regenerated without changing SQL or live settings. Verification: 36 focused tests passed across five files; application TypeScript passed, lint passed with the seven existing warnings, and production build/root API check passed with 12/12 functions. External deployment acceptance is recorded separately in the task response.
