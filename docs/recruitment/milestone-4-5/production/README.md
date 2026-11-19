# M4/M5 incremental production acceptance package

This package is preparation only. No production execution is authorised. M1–M3 are already installed: NEVER rerun `01-install-m1-through-m3.sql` or load `supabase/schema.sql` onto production.

## Ordered review and installation

1. Read `../architecture-and-gaps.md` and the implementation report. Obtain real hosted preflight results and inspect relevant function/trigger definitions and dependencies. The workspace has no hosted credentials and did not inspect the live database.
2. Run the read-only `preflight.sql` with approved access. Save table/trigger/Storage/academic/accounting baselines and existing flags. Verify the expected populated M3 schema and exact guarded function definitions, existing verified identities, authoritative tutor bindings and accounting structure. Stop on schema drift.
3. Review `migration.sql` and `manifest.json`, containing five ordered migration files copied verbatim in one transaction with finite lock/statement timeouts. M4 extends the existing final-decision guard and retention logic, M5 provisions authoritative platform records, document extensions replace specific existing functions while retaining their draft path, lifecycle replaces dispatch authorization. These changes need review on the actual target.
4. Confirm current database/Storage backups, restoration rehearsal, non-destructive impact and exact script checksums. Present the exact transaction and target-specific impact for EXPLICIT execution approval. Code promotion/deployment needs separate approval. No automatic migration, push, merge or deployment is included.
5. Apply only the approved incremental transaction once. Rehearse against a populated disposable PostgreSQL copy before target installation. On failure the transaction rolls back; investigate before retrying. Do not run partial migration excerpts.
6. Run `verify.sql`. New flags must remain false; all old controls retain previous values, existing buckets and unrelated data remain intact. Revalidate function ACLs and schema cache through the existing Supabase deployment process.

## Configuration and activation

No environment variables are added or changed. Reuse the existing server-side Auth, Supabase, Storage, mail, HMAC, scanner and worker configuration documented in M3. Missing services remain blockers; configuration presence is not operational acceptance.

Code deployment, schema installation and business activation are separate approvals. New controls `selection_enabled`, `onboarding_enabled`, `activation_enabled` default false. Do not enable these or M3 intake in this task. No ready-to-run activation SQL is supplied because the exact target, accepted governance and service evidence have not been reviewed. The existing mandatory access controls and two-independent-owner release policy remain intact.

Before release require owner MFA/recovery acceptance, two independently controlled verified owners (or a separately approved policy revision), approved privacy notice and minimal-evidence retention, an exact published-vacancy/form binding, real email/scanner/Storage/worker/backup/erasure acceptance, legally reviewed agreement templates and least-privilege access mapping. Intake stays disabled until separately approved.

Existing authenticated `POST /api/recruitment?route=worker` accepts `action:lifecycle` with bounded limit alongside mail/scan/retention. Schedule lifecycle periodically (for example every 15 minutes) using the existing approved worker host/secret; do not add Vercel cron functions or replace the accounting cron. Monitor returned counts, pending/failed outbox jobs, leases, queue age, scanner definitions, overdue onboarding and expiring offers. Repeated calls must be safe. Review generic lifecycle email bodies with the owner before dispatch acceptance.

## Recovery

Before commit, rollback is transactional. After commit, do not drop tables, remove accepted records or restore old functions blindly. Pause relevant new features using a separately approved operational change, stop lifecycle scheduling if necessary and preserve evidence. Revert code only if compatible with installed schema; recover data using the approved backup and erasure-reconciliation procedure. Prefer a reviewed forward corrective migration. Retain old migrations and immutable accepted agreements/offers; no destructive down migration is supplied.

If an uncertain activation/offboarding response occurs, recover the original request and inspect authoritative access, tutor bindings and sessions before retrying. Do not manually create duplicate staff/tutor identities. Existing privileged/finance access is never granted by inference. Hosted Auth session revocation must be verified separately where supported; local database checks alone do not prove provider token revocation.

## Sole-owner governance proposal (not approved)

Retain the current two-independent-owner rule by default. If the business cannot appoint an independent recruitment owner, commission a documented exception with independently held recovery materials, tested backup restoration, strong MFA, time-delayed emergency access, immutable incident evidence and periodic external review. Review operational/legal risks and explicitly approve a precise policy revision before changing any enforcement. A second account held by the same person does not provide independence.

## Additional migration impact

The final five sources also update historical snapshot feature labels to backend switches and add a denial-only pending-request cancellation fence. Cancellation keeps committed results and blocks delayed uncommitted writes; it never grants scope or staffing access. Its minimal tombstone follows case/evidence erasure where linked; no arbitrary new retention policy is introduced.

The package also pins the existing bodies of `accounting_snapshot`, `accounting_document_data` and `accounting_export_rows` before adding a narrowly scoped read guard for newly recruited administration-only users. Legacy financial viewers retain existing access. Review those dependencies in the actual target before approval. New recruiter access does not create finance-owner/bookkeeper permissions.

`supabase/schema.sql` is the documented M1–M3 local baseline for this release. For a fresh disposable local environment, load that baseline and the five ordered sources; the populated production database receives only the separately approved incremental transaction. Installation adds 25 RLS tables to the reported 42-table baseline; verify 67 total alongside the exact per-table manifest, not solely a count. The existing private bucket names and four legacy buckets are preserved.
