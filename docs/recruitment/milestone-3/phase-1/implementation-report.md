# Milestone 3.1 implementation report

Date: 2026-11-11. Branch: `work`. Baseline: `dbe7152`.
Scope: database/authorization foundation only; stop before M3.2 for review.
No push, merge, deployment, live SQL, Auth setting, mail, Storage or production
feature change was performed. All database execution used isolated PGlite fixtures.

## Delivered

- Additive thirteen-table foundation and identical fresh-schema/transaction copies.
- Immutable owner-approved role/pool form definitions linked to exact M2 approvals;
  publication/form/case composite relationships; incompatible document sets rejected.
- Shared reviewed form/answer schemas for all three roles, separate pool interests,
  adult affirmation and partial/complete validation. No applicant UI or HTTP intake.
- Scoped case authorization: non-conflicted owner; active scope plus explicit case
  assignment for managers/officers; manager allocation only; no finance/Admin fallback.
- Sticky known identity conflicts captured on contacts/staff/Auth email changes,
  independent owner resolution and no current self-identity clearance.
- Active email/vacancy uniqueness independent of HMAC key rotation, separate pool
  uniqueness, and retained-case reapplication approval evidence.
- Retention calculations for 14-day drafts, 12-calendar-month review/pool,
  30-day withdrawal and reserved 6-calendar-month future unsuccessful closure.
  Finite independent-owner review extension evidence; withdrawal overrides extensions.
- Deletable PII separate from coded case audit/proofs/idempotency; immutable submitted
  answers to normal updates, controlled erasure possible without disabling M1 triggers.
- Hold/case locks, irreversible barrier protection, preliminary live-PII absence checks
  before purged state; full Storage/job verification remains a dependent phase.
- Strict stable request identity, immutable committed results, staged-PII/action-proof
  binding and one-way proof/buffer consumption; no callable mutation/recovery RPC yet.
- All new tables RLS-enabled; direct table and function privileges revoked from PUBLIC,
  anon, authenticated and service_role. No new worker grants or identities.
- Five new flags default OFF and named database interlock prevents ordinary enablement.
  No M1/M2 function definitions, existing safeguard/MFA controls or public contracts changed.

See architecture-and-contracts.md for the complete implemented schema/permission contract
and privacy-and-recovery.md for evidence, holds, deletion and restore procedures.

## Exact file changes

Created:

1. `supabase/migrations/20261111010000_recruitment_intake_foundation.sql`
2. `src/lib/recruitment-applications.ts`
3. `src/test/recruitment-intake-foundation.test.ts`
4. `docs/recruitment/milestone-3/phase-1/architecture-and-contracts.md`
5. `docs/recruitment/milestone-3/phase-1/privacy-and-recovery.md`
6. `docs/recruitment/milestone-3/phase-1/migration.sql`
7. `docs/recruitment/milestone-3/phase-1/implementation-report.md`

Modified:

1. `supabase/schema.sql` — append canonical M3.1 block; earlier blocks unchanged.
2. `src/test/accounting-database.test.ts` — realistic Auth fixture email_confirmed_at.
3. `src/test/admin-database.test.ts` — same fixture correction.
4. `src/test/recruitment-api.test.ts` — include new FK dependants in isolated cleanup.
5. `src/test/recruitment-migration.test.ts` — same cleanup correction.
6. `docs/recruitment/milestone-3/technical-design.md` — current phase status.
7. `docs/recruitment/milestone-3/migration-plan.md` — distinguish implemented M3.1.
8. `docs/recruitment/milestone-3/implementation-plan.md` — accepted decisions and stop gate.

No dependency, configuration, existing API handler, learning/finance implementation or
public route was changed. Existing test assertions were not weakened. Initial full-suite
fixture failures were corrected by modelling the actual Auth column and FK cleanup;
all affected suites then passed, followed by the complete final suite.

## Verification

| Command/evidence | Result |
| --- | --- |
| `npm test` | **402 passed / 41 files; zero failed/skipped** |
| New foundation suite | **26 passed**, included above |
| Previously affected M1/API/Admin/accounting suites | **66 passed**, also included in final full suite |
| `npx tsc --noEmit -p tsconfig.app.json` | Passed |
| `npx tsc --noEmit -p tsconfig.node.json` | Passed |
| `npm run lint` | Zero errors, seven existing Fast Refresh warnings |
| `npm run build` | Exit 0; 19 routes and noindex 404 prerendered |
| `git diff --check` | Passed |
| Populated upgrade | Existing Auth/Admin/learner/tutor/binding/recruitment/vacancy/request/audit/ledger rows preserved |
| Existing function preservation | M1/M2 authorization/mutation, tutor_bind/accounting_post definitions unchanged |
| Migration consistency | Canonical = fresh-schema block = reviewed transaction bundle |

Build retains the existing Browserslist and SSR useLayoutEffect warnings and the known
post-prerender `The build was canceled` diagnostic despite exit 0. It is not claimed
to be warning-free. No new browser screen exists, so no new browser acceptance is claimed.

The new tests cover role/pool SQL-TypeScript parity, owner approval, immutable forms,
document requirement limits, adult/type/unknown-field validation, exact cross-case pins,
key-rotation-safe uniqueness, controlled reapplication, scoped assignments, closed-vacancy
case work, sticky owner/staff identity conflicts, independent resolution, unverification/
disable/reverification revocation, sealed answer erasure boundaries, calendar clocks,
authorized extensions and withdrawal precedence, hold/barrier ordering under local case
locks, stable request identities, immutable proofs/results, consent separation, grants,
default-off interlock, migration reruns and populated M1/M2 upgrade preservation.

Local PGlite is not hosted Supabase, real provider Auth/MFA, real concurrent network
connections, Storage/malware acceptance or proof of production readiness.

## Migration identity

New canonical SHA-256:

`77acdaff19f4a621a7e077b61d4f5e419ba9d35dc622d9fea5ae5d021233d795`

Unchanged M2 canonical SHA-256:

`f5d99995c17fcfcf481e663e18ce09b496456cdd79c8b85c860e80a5a2abf1ab`

Confirm checksums against exact approved files before any execution request.

## Remaining gates and recommendation

M3.1 is ready for implementation review. No known failing local acceptance test remains.
It does not accept real applicants. Stop here before implementing M3.2.

Before real collection: controller approval of actual retention/privacy notice and
evidence schedule (90-day evidence recommendation remains unapproved; case_evidence_days
defaults NULL), approved legal/hold/backup/restore practice, complete deletion worker and
rights operations, provider security acceptance and explicit rollout approval.

Before M3.2: approve this phase; finalize exact email/capability/outbox/request-response
contracts, numeric abuse limits, sanitized provider adapter, key rotation and atomic
case/contact creation/recovery. Later phases must add narrow granted RPCs with validated
actor/session/current assurance; passing an actor UUID to an internal helper is not Auth.

Before uploads: real accepted operational scanner and exact-byte immutable promotion;
Storage TTL/no-overwrite/actual download header/hosting-limit acceptance. No fake scanner
or ordinary flag can override readiness. Provider-independent scanner implementation is
deferred to M3.3, not silently implemented as part of this database phase.

Before production SQL: inspect actual target M1/M2 dependencies/default privileges,
function owners/overloads, new object collisions and Auth-trigger ownership/performance;
rehearse transactional populated upgrade/restore and present exact SQL/checksum/lock impact
and recovery package for separate execution approval. There is no live target inventory
or hosted acceptance claim in this report. Existing unified backend remains authoritative.
