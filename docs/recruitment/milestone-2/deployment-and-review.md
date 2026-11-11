# Milestone 2 review and controlled deployment

No production migration, flag, Auth setting, branch push, merge or deployment has been authorized by completing the implementation. Keep work local until separate approval. The application continues to use the existing unified Supabase platform. A separate hosted Supabase project is not a prerequisite imposed by this milestone; safe local fixtures are used for automated testing.

## Review without production changes

1. Review the migration, API contracts, architecture and tests in this directory. Existing M1 installations need only `20261109050000_recruitment_vacancies.sql`, not the full fresh schema or old bootstrap.
2. Run `npm test`, both TypeScript checks, `npm run lint` and `npm run build`. Automated database tests use in-memory PostgreSQL, and Auth integration tests use explicit synthetic provider responses. These are not claims of hosted Supabase acceptance.
3. Build, then start the guarded local acceptance fixture from the repository root:

   ```sh
   npm run build
   VIVA_RECRUITMENT_LOCAL_ACCEPTANCE=1 node scripts/recruitment-acceptance-server.mjs
   ```

   Open `http://127.0.0.1:8095/admin/recruitment`. Test identities are `owner@example.test`, `manager@example.test`, `officer@example.test`, each with the deliberately synthetic password `synthetic-password`. Do not enter real credentials. The script binds localhost, replaces service configuration with a synthetic-only origin, blocks all outbound fetches, runs the real migration/API code in an in-memory PostgreSQL fixture and resets all test data on restart. It refuses hosted/production execution and requires the explicit environment opt-in. This adapter is a test double only; no new application authentication provider or production database is introduced. The `/__test/*` fixture endpoints exist only in this standalone local script, never in production application routes. Existing reauthentication rate limits are preserved; long test scenarios can use the local-only reset-auth-limits fixture between independent scenarios, not as an application workaround.

   Review `/admin/recruitment` in this fixture or an existing approved development runtime. Vite alone does not implement Node APIs. The production implementation calls the existing Supabase Auth/SQL backend; fixture authentication is test-only.
4. Owner creates a draft with a new dedicated scope or existing vacancy scope. Incomplete drafts can be saved. Preview, complete and submit; approve the exact version and publish. Public visibility remains off until an explicitly reviewed owner flag change in the test environment.
5. Inspect `/careers` and the stable `/careers/:slug` URL. Verify category filters, deadlines, pagination, error/empty states and the informational talent-pool section. Applications must remain unavailable.
6. Start a revision, change draft content, and verify the public page still shows the previously published version. Submit/approve/re-publish to replace it. Pause/close and verify old ETags do not preserve availability.
7. Give a manager an active vacancy scope. Officers additionally need an explicit vacancy assignment. Test every owner-only action as manager/officer and confirm API/database denial, including direct calls that bypass UI controls.
8. Repeat response-loss/reload, stale revisions, revoked permissions and optional owner AAL2 checks. Review audit evidence and immutable version pointers. Do not manually activate a tutor or Admin identity.

## Production execution prerequisites

Before presenting any execution approval request:

- Identify the exact target project/schema and applied migration history. Confirm both accepted M1 security commits are installed and authoritative functions match reviewed definitions.
- Inspect the relevant existing recruitment settings/scopes/staff/requests/events/challenges tables, grants, constraints, triggers, function overloads/owners and default privileges. Reconcile unknown dependencies/external consumers before proceeding.
- Inspect for conflicting new table/sequence/function/constraint names and partially applied installations. `IF NOT EXISTS` is idempotence support, not structural schema reconciliation.
- Confirm the five new vacancy tables, reference sequence, new default-off public fields, indexes and version-pointer constraints are additive. Review the intentional M1 authorize/mutate/snapshot function extensions; existing security logic must remain intact.
- Confirm no existing enrollment, teaching, tutor, academic, accounting or Admin rows change. Rehearse representative data/grant preservation and function behavior. Inspect lock time/timeout and expected data volume.
- Review payload limits, deployment routing for `/careers/:slug`, API execution configuration, SEO rendering and cache revalidation in the actual hosting environment.
- Confirm backups, restoration access, operator/owner identities and the approved owner recovery runbook. Do not alter production MFA/other Auth settings as part of this migration.
- Present the exact migration file/transaction, checksum, expected objects, lock impact, validation queries, rollback/recovery approach and requested environment to the user for explicit execution approval. Approval to implement is not approval to run live SQL.

## Exact migration impact

The migration adds `recruitment_vacancies`, `recruitment_vacancy_versions`, `recruitment_vacancy_approvals`, `recruitment_vacancy_publications` and `recruitment_vacancy_assignments`; a reference sequence; indexes; immutable-history triggers; scoped visibility/content validation/authorization/mutation/workspace/public projection functions. It adds default-off `public_vacancies_enabled` and generation metadata to existing settings. Existing authorize/mutate functions dispatch vacancy operations while preserving M1 security operations; snapshot reports the public flag. There are no applicant/interview tables or Storage buckets.

Canonical migration SHA-256:

`f5d99995c17fcfcf481e663e18ce09b496456cdd79c8b85c860e80a5a2abf1ab`

Confirm it against the exact file before an execution approval request. The SQL Editor [transaction bundle](migration.sql) contains that exact migration between `begin` and `commit`.

Apply inside a transaction. Any error before commit must roll back the whole migration. Do not apply the full fresh schema as a production upgrade. Do not change live flags at installation. New functionality remains hidden publicly with the default flag off.

## Recovery and rollback

Prefer an audited forward fix or approved feature disablement over destructive schema rollback. The append-only version, approval, publication, request and event history must be preserved.

- Before migration commit: `ROLLBACK` the transaction on failed validation.
- After installation but before rollout: leave public visibility off, retain tables/history and investigate. If previous code is restored, its application intake remains unavailable; do not drop referenced objects or reset request evidence.
- After rollout: a separate approved owner `vacancy_settings` operation can hide all public listings. It is audited, revision checked and invalidates cache generation. Pausing/closing an individual vacancy has the same authoritative visibility effect for that record.
- A deployed code rollback does not automatically remove database functions or prove that a live visibility flag was disabled. Inspect both states and follow approved operational procedures.
- If function restoration is necessary, use the exact previously reviewed M1 function definitions in a separately reviewed corrective migration, preserving all new data. Do not delete tables, rewrite immutable snapshots or issue blanket grants to make an old client work.

## Milestone boundary

Applicant intake, CV/document uploads, malware scanning, interviews, hiring decisions, onboarding, account activation, notifications and compensation processing are not implemented. Existing M1 retention constants do not constitute a working applicant retention job. Milestone 3 requires a separate authorization and readiness review after real target/hosting acceptance.
