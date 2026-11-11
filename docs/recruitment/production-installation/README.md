# Full recruitment production installation — REVIEW PACKAGE

Status: **LOCALLY REHEARSED; PRODUCTION EXECUTION REQUIRES SEPARATE APPROVAL.** Supplied production inventory is reconciled. The eleven immutable migration sources are pinned to `a1444b7596cfa062801c6a78f5037527c0bde09c`; deploy the final reviewed `work` commit, which also contains the dashboard and operational wrappers. Package generation performs no SQL or deployment. Authorized disposable PostgreSQL 17.11 rehearsal is recorded in `REHEARSAL.md`. Production has not been changed. These files are operational preparation, not M4.

## Reconciled production target

User-reported: PostgreSQL 17.11; SQL Editor role postgres; pgcrypto; no 42 recruitment tables/functions/settings/buckets; existing Supabase Auth/admin_users/teaching_tutors; four legacy buckets; no supabase_migrations.schema_migrations or cron.job.

The supplied exports confirm all 22 required column types, public-schema creation permission, RLS flags, role/default ACLs, finance_role checks and existing ownership. The follow-up confirms existing identity indexes/triggers, no recruitment namespace conflicts and no current Storage policies. The final platform check confirms registered Supautils policy delegation to `postgres` for `storage.objects`, so the required restrictive policy can be installed without changing managed-table ownership. See `COMPATIBILITY.md`. The installer rechecks these conditions to stop on target drift; no further inventory is requested. Existing defaults/owners/legacy policies must remain unchanged.

## Complete ordered sources — no reconstructed migration bodies

The generator reads exact Git blobs at the pinned commit, checks the checked-out migrations are byte-identical and copies complete sources verbatim into marked sections of `01-install-m1-through-m3.sql`:

1. 20261109010000_recruitment_foundations.sql
2. 20261109020000_recruitment_security_operations.sql
3. 20261109030000_recruitment_access_guards.sql
4. 20261109040000_recruitment_security_remediation.sql
5. 20261109050000_recruitment_vacancies.sql
6. 20261111010000_recruitment_intake_foundation.sql
7. 20261111020000_recruitment_intake_acceptance.sql
8. 20261111030000_recruitment_applicants.sql
9. 20261111040000_recruitment_documents_submissions.sql
10. 20261111050000_recruitment_case_operations.sql
11. 20261111060000_recruitment_runtime_guards.sql

M1 tables/types precede its security functions. Legacy admin/tutor/Auth dependencies must already exist. Remediation retires weaker historical overloads and adds attributed operational controls. M2 requires M1 authority/scopes; M3.1 requires M2 versions/publications; corrected M3.1 follows its foundation; M3.2 introduces capabilities/outbox/governance; documents precede case operations and runtime guards. Apply all eleven in ONE transaction, not one editor run per historical migration. `notify pgrst` is delivered only on commit. The full platform `supabase/schema.sql` and unrelated academic/accounting/teaching migrations are NOT installation scripts for this target.

The new prechecks, postconditions and installation audit marker are explicitly additional operational wrapper SQL. Original migration bodies are not edited. Release templates 05–07 are explicitly proposed NEW operational SQL, not claimed as committed migrations. Review/approve them separately.

## Install order and effects

1. Inventory reconciliation is complete from supplied results. Take verified recovery snapshots and confirm production project reference matches the application's existing SUPABASE_URL. Review this exact source set, owner/Storage rights, busy-table lock window and operational approval references. User-facing times must be coordinated in Africa/Johannesburg time. Freeze competing schema changes; choose a quiet installation window. No zero-downtime guarantee: creating identity/Auth triggers briefly locks existing relations. Lock timeout is 5 seconds; each statement timeout is 180 seconds. Timeout aborts the transaction; ROLLBACK any open failed editor transaction before investigating.
2. Obtain explicit execution approval for `01-install-m1-through-m3.sql`, after inserting genuine NON-SECRET operator, approval and project references in its opening prechecks. Placeholders deliberately abort. Recompute the instantiated script checksum; keep both template and executed-script checksums with the ticket. Do not share secret values. The SQL cannot independently prove Supabase project identity from a project reference string: the operator must verify the connected project/host.
3. Run the ENTIRE approved transaction in SQL Editor once. Preconditions reject existing recruitment relations/routines/types or named trigger/policy conflicts, wrong dependency types or missing trigger/policy authority, disabled Storage RLS, or a changed four-bucket baseline. They do not repair legacy objects. Postconditions check 42 RLS tables, denied browser/direct table access, narrow service RPC grants, retired overloads absent, all controls off, null legal/operational approvals and correct private buckets. Failure prevents commit.
4. Installation creates 42 recruitment tables, associated functions/indexes/constraints/sequence, two buckets, new triggers and one restrictive Storage policy. It seeds only a disabled settings singleton and private tutor-binding continuity records derived from existing tutor UUIDs/recoverable teaching history. It does not rewrite tutor UUIDs, enable/disable existing tutor rows, assign tutors, alter Auth accounts, create administrators or post ledger entries. Four existing buckets and their policy definitions remain; the new restrictive predicate is true for legacy bucket IDs. No legacy data is deleted/renamed/reset.
5. M1 **always-on identity-replacement protection is a real behavior change**, even with normal access guards off. Established tutor UUID replacements need independent owner authorization. Unbound tutors with prior sign-in but unrecoverable UUID history are quarantined for review. Before execution, quantify any ambiguous legacy binding cases privately under the approved change process; the final remaining metadata query does not read tutor records. Do not promise all replacement sign-ins remain unchanged. Enabling the separate mandatory access fence later also blocks NEW/increased legacy Admin/tutor access until an authorized activation workflow exists; M4 is not being released here. Test established tutor/admin login continuity before that separate approval.
6. Run every SELECT block in `02-post-installation-read-only.sql`. Return results and compare legacy buckets/policies/triggers with preflight. Preserve the installation event and manifest in protected change records. These verification queries expose no applicant payloads. Stop on unexpected grants, missing/invalid constraints, wrong buckets or lost legacy functionality.
7. Approve and execute the owner bootstrap template separately. After the reviewed frontend/API deployment is present, the owner can sign in with console off under existing M1 rules. Bootstrap may be performed earlier, but it does not itself deploy the sign-in page. Add/test a second independently controlled verified owner via normal owner UI; validate logout/refresh/revocation and parent/student/tutor/Admin isolation. Provisioning or email-confirming Auth accounts is not performed by installer.
8. Follow `DEPLOYMENT.md`: deploy approved code with intake OFF, then complete hosted, legal, real-scanner, worker and recovery acceptance. Record actual notice/evidence duration with fresh owner confirmation; no unapproved 90-day policy. Only then use operational attestations and separately reviewed pilot release templates.

## Migration history is absent

Do NOT invent CLI migration records, insert fake `supabase_migrations` history, create a competing migration-history schema or execute `supabase db push`. The full source list, per-file SHA-256 and source-set checksum are in `manifest.json`. The installer records these source fingerprints and operator/session/approval attribution in the protected existing-design `recruitment_operational_events` table after all checks pass. Keep the executed artifact externally. This is manual SQL Editor installation evidence, not Supabase CLI state. A future CLI adoption/repair is a separate approved reconciliation of ALL existing platform migrations.

## Operational files and activation

- 00/00b: completed read-only evidence queries, retained for target-drift rechecks.
- 01: complete single-transaction installation, all eleven exact source migrations.
- 02: read-only post-install checks; not an owner bootstrap or test-data reset.
- 03: separately attributed initial owner bootstrap; existing UI and protected M1 operator controls handle console/safeguards/MFA after hosted acceptance.
- 04: attest actual DB/Storage backup, mail/scheduler/deletion recovery and real scanner acceptance. Does not substitute for tests.
- 05: proposed separately approved replacement for the all-off M3.1 interlock, with dependency CHECK fence; one approved published vacancy/current bound form; owner AAL2/mandatory safeguards; approved legal/ops/scanner; expected settings revision; attribution. Vacancy/email/uploads/processing on; talent pool remains off. Global public visibility is enabled, so review other published vacancy content before release. Publishing/approval itself stays owner-only.
- 06: separately approved talent-pool consent/form/exposure release after vacancy acceptance.
- 07: attributed incident pause; no down migration. Retention/holds continue. Retained email includes recovery AND queued applicant notifications; choose false for an approved mail shutdown. No blanket deletion or automatic safeguards/MFA disablement.

The user selected **open approved public intake** for the initial release. It is genuinely public once enabled, including during personal testing. The release template records public exposure; an independent release approval is still required. The restricted-IP alternative below is informational, not the selected release mode. A hidden URL/test email is not access control. Restrict both UI `/recruitment/*` and ALL methods/query variants on `/api/recruitment` to the personal tester's approved IP and fixed worker-runner IP before global flags turn on. Use provider-supported validated edge rules; do not add a naive `route=worker` query exemption (duplicate/encoded query parsing can bypass it). The worker IP must remain allowed so retention is never starved. If no suitable edge control exists, do not describe testing as private: either defer or separately approve genuinely public intake after every legal/service gate is satisfied.

## Recovery and stop conditions

Before commit, failure means rollback; do not continue statement-by-statement or edit guard conditions ad hoc. An interrupted SQL Editor response has an uncertain outcome: reconnect, run 00/02 inventory and inspect protected installation evidence before retrying; do not rerun based only on a timeout message. Verify no open failed transaction in the editor.

After committed installation, leave new tables and controls off if deployment fails. Additive objects need not be deleted to roll back application code. After any real applicant data exists, do not drop/truncate cases or restore an old DB over accepted applications. Use 07 to stop intake; preserve retention and legal holds, keys and audit evidence; review a forward migration. Supabase DB/PITR backups do not contain Storage file bytes. External signed erasure manifests must cover restoration intervals, be retained outside the backup domain and reconcile restored/deleted objects before reopening. Refer to the committed M3 operations and M1 owner-recovery runbooks. No undocumented owner bypass is added.

## Dashboard and package verification

The owner-only `/admin/recruitment/deployment` screen reads these packaged files through authenticated `GET /api/admin/recruitment?route=deployment`. The server checks current recruitment ownership, uses an exact filename allowlist, verifies package artifact SHA-256 and never executes SQL. SQL is not bundled into public frontend assets. Status distinguishes observed flags/recorded approvals from external service acceptance and exact catalog verification. Copy/download are the only script actions. The screen needs an already bootstrapped recruitment owner; initial installation/bootstrap therefore use the offline package. No credentials, environment values or private operational journals are returned.

After the e19fbbc preview failures, the three logical recruitment APIs were consolidated into one deployed Node function to fit the Hobby limit of twelve. Existing public URLs, staff/applicant cookie paths and independent handler authorization are preserved. Vercel rewrites and `includeFiles` are in `vercel.json`; the root compiler configuration is explicit. See `PREVIEW-COMPATIBILITY.md` and run `npm run check:vercel`. No SQL source/checksum, production flag or legacy API behavior changes for this packaging correction.

Run `node scripts/recruitment-production-package.mjs` after reviewing a source/package change, and `node scripts/recruitment-production-package.mjs --check` to verify deterministic artifacts without writing. The manifest records checksums for every artifact except itself, all eleven exact migration blobs, and packaged runtime files. No migration-history records are fabricated. The `sourceCommit` is a migration-source pin, not an instruction to deploy an earlier application commit.

The actual wrapper, eleven migrations, assertions and operational templates were executed in disposable native PostgreSQL 17.11 as non-superuser `postgres`. All 75 legacy public tables/data, existing triggers/indexes, Auth fixture identities and four buckets remained intact. Positive release tests used synthetic approvals only. Real hosted Auth, Supautils delegation, Storage HTTP, email, scanner, scheduling and recovery remain acceptance gates. See `REHEARSAL.md` and `RELEASE-REVIEW.md`; no local test is claimed as production or hosted acceptance.
