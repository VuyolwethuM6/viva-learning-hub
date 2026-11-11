# Milestone 1 security remediation report

Baseline: `3f1ffee9029de1b28cbc2cef6f2c6f76b3f9c941` on `work`. This is a subsequent commit; the original commit and its three canonical migrations are unchanged. No other development branch was created. No push, merge, deployment, production migration, production Auth-setting change, public recruitment release or account activation occurred.

Recommendation: ready for controlled isolated hosted acceptance testing, subject to the prerequisites below. This is not production approval or a hosted Supabase acceptance result.

## Finding resolution

| Accepted finding | Resolution | Implementation evidence |
| --- | --- | --- |
| High: target verification blocked revocation | New/increased staff and scope access require verification; removal, disabling and reductions of existing authority do not. Current actor authentication, authorization, self-grant denial and revisions remain enforced. | `supabase/migrations/20261109040000_recruitment_security_remediation.sql`: `recruitment_mutate`; migration regression tests |
| Medium: ordinary flags could disable safeguards | Isolated off/on testing remains available. A separately authorized operator can set `access_guards_mandatory`; ordinary owner settings cannot disable locked safeguards. Exceptional disablement is operator-only, turns off the staff console, retains the mandatory bit and appends an attributable audit event. Missing singleton configuration fails closed. | Same migration: `recruitment_operate`, `recruitment_mutate`, `recruitment_guard_access` |
| Medium: temporary password session depended on original session surviving | Password confirmation now retains and sets cookies for the fresh authenticated session. Proofs bind to that token. The prior session is locally logged out; failed fresh-session verification is cleaned up. | `api/_lib/recruitment-security-service.ts`: `recruitmentChange` |
| Medium: no owner AAL2 enforcement | Opt-in protected `owner_aal2_required` control. Supabase validates the exact token through `/user` before server-side AAL parsing. Sensitive owner challenge/mutation RPCs independently enforce the server-derived assurance. Fresh password plus verified Supabase TOTP performs step-up; credentials/codes/proofs are not persisted in browser storage. Enforcement defaults off. | `api/_lib/recruitment-auth.ts`: `recruitmentIdentity`; security service; migration `recruitment_require_assurance` |
| Medium: established tutor identities could be replaced through email binding | Established UUID history survives clearing/deletion of Auth bindings. Migration backfills current and recoverable audited UUIDs and quarantines unresolved prior sign-ins. First binding/repeat sign-in remain supported. Replacement needs separately verified owner approval, recorded through a protected operator procedure and consumed transactionally. It cannot enable a disabled tutor. | Migration: `recruitment_guard_tutor_binding`, `recruitment_record_tutor_binding`, `recruitment_operate` |
| Medium: uncertain-response/reload recovery | Browser session storage retains only the original request UUID. Authorized server recovery restores choices/completed status. No automatic mutation retry or new request ID. Unmarked gateway/transport/malformed outcomes stay uncertain. A rejected retry cannot erase an earlier uncertain result. Mutation result shapes are checked server-side. | `src/lib/recruitment-client.ts`; `RecruitmentSecurityWorkspace.tsx`; API `recover` route; migration `recruitment_recover_request` |
| Medium: incomplete owner recovery | Executable, protected two-person operational runbook covers two independent owners, identity verification, all-owner loss, approval evidence, recovery, validation and closing exceptional windows. Recovery does not silently suspend MFA or grant general Admin/teaching access. | `docs/recruitment/owner-recovery-runbook.md`; migration `recruitment_operate` |
| Low: unrelated officer emails exposed to managers | Managers see only enabled officers with owner-introduced membership in the manager's active scopes, including disabled officer scope grants needed for re-delegation. Delegation checks enforce the same relationship. Owners introduce new relationships and retain organization-wide recruitment visibility. | Migration: `recruitment_snapshot`, `recruitment_authorize` |
| Low: bootstrap attribution named only the new owner | Old bootstrap signature removed. Protected bootstrap/operational events record actual database `session_user`, individual operator reference, independent approval reference and reason. Business events link to the protected operational event UUID. | Migration: `recruitment_bootstrap`, `recruitment_operate`, `recruitment_operational_events` |

## Migration and unchanged boundaries

Existing M1 installations apply only `20261109040000_recruitment_security_remediation.sql` in a transaction after review. Fresh schema and setup bundle contain all four canonical migrations, tested for exact consistency. The remediation adds three protected tables and two default-off enforcement columns. No production flags are enabled by installation.

Browser roles have no recruitment table/RPC grants. Service role has selected RPC execution only; operational controls, bootstrap, direct writes and internal helpers remain unavailable. Obsolete challenge/mutation overloads are removed. Security-definer search paths remain empty. The service key is a trusted server credential, not a browser authorization mechanism.

`teaching_tutors` remains authoritative; tutor record IDs, assignments and academic history are preserved. No academic RPC or accounting ledger logic was modified. General enrollment, accounting, teaching and public recruitment workflows are not redesigned. Mandatory access fencing retains its documented effect on legacy Add Tutor/Admin grant operations when explicitly enabled. Tutor replacement protection applies even with that fence off. No new public forms, uploads, hiring, onboarding, activation or compensation endpoints exist.

## Final verification

| Check | Result |
| --- | --- |
| `npm test` | 320 passed, 33 files; zero failed/skipped tests |
| Recruitment tests | 44 passed: 20 migration/database, 11 API, 7 UI, 6 client transport/recovery |
| Existing academic/teaching/accounting/enrollment regressions | Included in the complete passing suite |
| `npx tsc --noEmit -p tsconfig.app.json` | Passed |
| `npx tsc --noEmit -p tsconfig.node.json` | Passed |
| `npm run lint` | Exit 0; zero errors, seven pre-existing UI Fast Refresh warnings |
| `npm run build` | Exit 0; 19 routes and noindex 404 prerendered; existing shutdown diagnostic persists |
| Migration consistency / baseline-to-M1-to-remediation / rerun | Passed; existing identity and journal/line snapshots preserved |
| RLS/grants/search-path checks | Passed in isolated PostgreSQL fixture |
| `git diff --check` | Passed |

Initial development runs exposed fixture/revision and test-result typing errors; these were corrected before the final passing verification. The build still prints the previously documented `The build was canceled` diagnostic during prerender shutdown despite exit 0; this is not represented as a clean diagnostic-free build. Existing Browserslist/SSR warning output also remains. No dependencies or lockfiles were changed; a temporary formatting tool was used outside the project dependency tree.

Tests use in-memory PGlite PostgreSQL with synthetic Auth/Storage foundations. API tests use real SQL and synthetic external Auth responses; they do not perform cryptographic/provider integration certification. Promise-based competing requests test serialized behavior locally; PGlite is not a multi-connection hosted contention test. No hosted acceptance, production DB access or new manual browser acceptance was performed for this remediation.

## Remaining limitations and hosted acceptance prerequisites

1. Use a dedicated hosted Supabase project and synthetic identities, with independently reviewed project reference, credentials, outbound integrations and scheduling configuration. Never reuse production service credentials. Existing automated deployment from branch pushes remains a reason not to push without approval.
2. Reconcile actual tables, grants, inherited roles, function overloads, triggers and external consumers. Measure/back up/rehearse migration and historical teaching-audit backfill on representative isolated data. Resolve ambiguous legacy cleared bindings before rollout. Verify operational RPC denial through real anonymous/authenticated/service-role requests, not only metadata.
3. Enroll and verify two independently controlled test-owner TOTP factors using approved Supabase enrollment tooling. No self-service factor enrollment/reset UI ships in M1. Rehearse recovery and both-owner loss before enabling owner MFA enforcement for production users. Production Auth settings are unchanged.
4. Validate real Supabase AAL2 issuance, password session rotation, single-session configuration, refresh assurance/downgrade, JWT expiry, provider revocation and local logout semantics. Provider logout failures remain best-effort; do not assume that clearing cookies instantly revokes every access JWT. Hosted tests must certify actual behavior.
5. Test true parallel database connections for competing revocations, same-ID replay and replacement authorization consumption. Test gateway response loss/408/429/5xx, reload, denied retries, expired proofs and disabled browser storage through the actual deployment stack.
6. Request recovery persists in the same browser tab only. It deliberately persists no credentials or choice payload. A lost tab, expired challenge with no completed request, or revoked original actor can require the documented operator resolution; never automatically recreate an uncertain operation with a new ID.
7. Operational functions trust separately authorized database operators and external approval/identity evidence. They cannot prove human consent from an approval string. Enforce the runbook, individual operator attribution, two-person approval and closure deadlines. Exceptions do not auto-expire. Database-owner/server compromise remains outside the application boundary.
8. An approving owner must be a different person as well as a different Auth UUID for replacement access. UUID self-approval is enforced in SQL; cross-identity human conflict verification remains an independent operational responsibility until later person/onboarding entities exist.
9. Application audit covers successful security/operational changes; it is not a complete authentication-event monitoring system. Validate provider security logs and alerting during hosted acceptance. Original bootstrap records cannot be retroactively given invented operator attribution.
10. Retention jobs, malware scanning, applicant conflict checks and account activation remain outside M1. Public recruitment and compensation remain disabled/unreleased. Do not begin Milestone 2 or production enforcement from this report.

See [the executable recovery runbook](owner-recovery-runbook.md), [isolated setup](milestone-1-setup.md) and [expanded acceptance guide](milestone-1-test-guide.md).

## Exact changed files

- `api/_lib/recruitment-auth.ts`
- `api/_lib/recruitment-security-service.ts`
- `api/admin/recruitment.ts`
- `docs/recruitment/architecture.md`
- `docs/recruitment/implementation-report.md`
- `docs/recruitment/milestone-1-setup.md`
- `docs/recruitment/milestone-1-setup.sql`
- `docs/recruitment/milestone-1-test-guide.md`
- `docs/recruitment/owner-recovery-runbook.md`
- `docs/recruitment/permissions.md`
- `docs/recruitment/security-remediation-report.md`
- `src/components/admin/recruitment/RecruitmentSecurityWorkspace.tsx`
- `src/lib/recruitment-client.ts`
- `src/lib/recruitment-types.ts`
- `src/test/recruitment-api.test.ts`
- `src/test/recruitment-client.test.ts`
- `src/test/recruitment-migration.test.ts`
- `src/test/recruitment-security-ui.test.tsx`
- `supabase/migrations/20261109040000_recruitment_security_remediation.sql`
- `supabase/schema.sql`
