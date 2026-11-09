# Milestone 1 isolated setup

This is a review/test guide. Implementation did not execute cloud migrations, change provider settings, deploy, push or merge main. Use a disposable local/test Supabase project for manual acceptance, never the production project.

## Automated isolated database

The repository already includes PGlite. `recruitment-migration.test.ts` and `recruitment-api.test.ts` instantiate separate in-memory PostgreSQL databases, create synthetic Auth/Storage schemas and load the full application schema. No Supabase URL or credential is needed for those databases. API tests stub Auth and RPC network access and reject unexpected external operations. Tests use synthetic `example.test` identities.

Run:

```sh
npm test
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.node.json
npm run lint
npm run build
```

Do not run the Vercel API against a production-configured `.env` for local acceptance. `npm run dev` alone serves frontend assets; it is not the Node API runtime. For interactive acceptance, point a local Vercel API runtime at an isolated Supabase project and use its Auth identities. SMTP is not used by the M1 staff password sign-in. No applicant or recruitment notification emails are sent.

## Migrations

For an existing isolated application database, review and run the complete `milestone-1-setup.sql` transaction. It contains exactly:

1. `20261109010000_recruitment_foundations.sql`
2. `20261109020000_recruitment_security_operations.sql`
3. `20261109030000_recruitment_access_guards.sql`
4. `20261109040000_recruitment_security_remediation.sql`

If M1 commit `3f1ffee` is already installed, apply only migration 4 in a transaction; do not rerun the old bootstrap signature. Fresh installs use the complete bundle.

It depends on the existing teaching/accounting/Auth foundation. Fresh isolated installations may use the complete `supabase/schema.sql` instead. Do not use the full fresh schema as a blind production upgrade.

All features default off, there are no seeded staff identities, and guards are inert until an owner opts in. Migration reruns do not reset existing settings. No recruitment bucket is created, and no existing bucket configuration changes.

## Explicit owner bootstrap

Create/identify an existing verified Auth identity with password sign-in in the isolated project. After documented owner approval, an authorized database operator can run:

```sql
-- Replace with the intended verified test user's Auth UUID, not an email.
select public.recruitment_bootstrap('REPLACE_WITH_VERIFIED_AUTH_UUID'::uuid,
 'OPERATOR_REFERENCE', 'INDEPENDENT_APPROVAL_REFERENCE',
 'Approved initial recruitment owner setup in isolated project');
```

This operation is not exposed through HTTP or granted to `service_role`, `anon` or `authenticated`. It succeeds once. It adds no `admin_users`, `portal_users` or tutor identity. Do not infer recruitment ownership from finance. No personal UUID or credential belongs in migrations or source control.

Open `/admin/recruitment`, sign in with that verified identity's email/password and review the disabled readiness indicators. The first owner can govern security even while the staff console is disabled. No other portal session substitutes for this session.

## Rollout controls

When ready in the isolated database, use Owner rollout controls. First enable Legacy access safeguards; enable Staff console in the same reviewed choice if desired. Confirm the password again. These settings are revision checked, logged and retry safe.

Enabling the fence affects existing Add Tutor and Admin grant operations: tutors become disabled records; new Admin enablement/elevation is blocked. Existing enabled identities keep working. The activation workflow is deliberately absent, even for owners. Disable/reduce access rather than attempting to elevate it during M1.

Add a second test owner and manager/officer using existing verified Auth UUIDs. There is no automated user provisioning or invitation endpoint. A second independent owner is operationally recommended before testing revocation or any later self-interest case. Do not use a bootstrap reset or direct table edit as an ordinary recovery flow.

## Production prerequisites still outstanding

Before a later live approval: obtain production constraints/indexes, active functions, grants/policies/triggers and external-consumer inventory; inspect table-level fence compatibility; confirm Supabase password/refresh/single-session behavior; choose operational owner identities; rehearse restoration. A generic readiness screen is not a production certificate.

Do not push this branch without considering Vercel's automatic preview deployments. Main and production migration execution require separate explicit approval.

## Security remediation

Follow [owner operations and recovery](owner-recovery-runbook.md) for two-owner setup, attributable bootstrap, all-owner recovery, MFA acceptance and operational safeguard locks. MFA and mandatory safeguards default off; no production enforcement is enabled by this migration. Browser recovery persists only an opaque pending request UUID in session storage. Payloads remain server-side. A pending request belongs to its original actor and must not be replaced with a new ID after an uncertain response.

Tutor identity history is preserved even with the legacy fence off. Existing established identities are backfilled at migration time. A replacement identity needs explicit independently approved operational authorization; ordinary first binding and repeated tutor sign-in remain supported. Existing Add Tutor activation remains blocked with the fence on.
