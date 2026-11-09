# Recruitment Milestone 1 — implemented foundations

Baseline: `work` at `dae505b`; remote main at `2dbebde` had the same tree. This milestone is additive. No production database or provider configuration was changed by implementation/testing.

## Implemented boundary

`/admin/recruitment` is a separate staff entry. It uses `/api/admin/recruitment?route=session|snapshot|reauthenticate|mutate`, dedicated HttpOnly cookies and existing Supabase Auth password credentials. It never falls back to general Admin, tutor or parent cookies. It never creates an Auth account or sends invitations. Current staff must already have a verified Auth identity with a password. General Admin offers a link, not a permission grant or shared session.

Recruitment ownership is an explicit `recruitment_staff` role, independent of finance. Normal staff/scope/rollout mutations require password reauthentication. A random proof is stored only as a hash, bound to actor, original session, exact choices and request ID; it expires after five minutes and is consumed transactionally. Temporary reauthentication sessions are locally logged out. Refresh alone cannot mint a proof.

The database exposes only context, snapshot, rate-limit, issue-challenge and mutation entry points to the service role. Browser roles have no direct grants. Even service_role has no direct table-write grants. The existing service key remains a high-trust server credential; it is not a substitute for the application authorization boundary. Bootstrap and internal assertions are not callable by the HTTP router or service role.

## Tables and relationships

- `recruitment_settings`: singleton lock for security mutations, rollout revision and fixed retention configuration.
- `recruitment_staff`: Auth user FK, owner/manager/officer, enabled state and permission revision; granted_by references Auth.
- `recruitment_scopes`: vacancy/talent-pool authorization boundaries. Exactly one talent-pool scope. A scope is not a published vacancy.
- `recruitment_staff_scopes`: staff/scope FKs, grant state, revision and granting Auth user.
- `recruitment_requests`: stable request ID, actor FK, operation, exact validated payload and replay result.
- `recruitment_events`: append-only actor/action/target/request metadata. No passwords, tokens or applicant documents.
- `recruitment_auth_limits`: keyed, salted hashes and counters. IP checked before identity to limit unique-email flooding; old entries are pruned during authentication attempts.
- `recruitment_reauth_challenges`: hash of one-use secret; actor/session/action/payload binding. Expired evidence is pruned on later challenge creation.
- `recruitment_access_approvals`: reserved, protected evidence shape only. No approval creation/consumption or activation API exists. Its prerequisite UUID is not yet a live engagement relationship; a later migration must add the real FK and consumption controls.

The fresh schema contains the exact three canonical migrations. The SQL Editor bundle is a transaction containing the same migrations. Reruns preserve owner grants and settings. There are no candidate, application, document, hiring, interview, engagement, compensation or public-publishing tables in M1.

## Features and rollout

Only `staff_console_enabled` and `access_guards_enabled` can be changed. Defaults are false. Enabling the console requires the access fence. Owners can reach security/governance while the console is disabled; managers/officers cannot. Other readiness features are hard-coded false, not configurable placeholders. Unknown actions, activation requests and extra fields fail closed.

With the fence OFF, legacy access-management behavior continues. This is deliberate disabled-by-default rollout, not a claim that global owner activation policy is already active. With the fence ON:

- new `teaching_tutors` records are forced disabled, including the existing tutor creation RPC;
- enabling disabled tutors or changing an enabled tutor's email is blocked;
- inserting enabled Admin users, enabling disabled Admin users, changing enabled Admin identity, or elevating finance permissions is blocked;
- existing enabled identities and ordinary tutor Auth binding keep working;
- disabling access and lowering finance authority remain possible;
- there is no active approval bypass; access activation awaits the onboarding milestone.

The triggers protect table mutations regardless of the legacy HTTP entry point. They do not edit old teaching/accounting RPCs or alter ledger rules. Disabling the fence is itself a reviewed, reauthenticated owner choice and must not be done casually; it restores legacy access behavior. Public rollout must not occur with that fence off.

## Confirmed future policy

- Abandoned drafts expire after 14 days of valid applicant activity.
- Unsuccessful applications retain for six calendar months from unsuccessful closure.
- Talent pool consent/records expire after twelve calendar months unless explicitly renewed.
- Privacy policy, legal obligations and documented holds govern retention/purging.
- Email verification precedes uploads and final submission; applicants have no Auth accounts.
- Each vacancy has one engagement type: employee, contractor or volunteer.
- Approved public content will be database-backed and cached; intake eligibility is checked server-side.
- Screening checks completeness only. Managers/officers recommend; owners alone finalize hiring/rejection.
- Suitable malware scanning must pass acceptance before uploads are enabled.
- Agreements, verified documents, completed onboarding and explicit owner activation precede new recruitment-originated system access.
- Compensation is outside this release.

These are architectural commitments, not implemented intake or retention jobs. Do not infer legal compliance or working notification delivery from the fixed configuration values.

## Compatibility and outstanding production evidence

Existing learner enrollment, teaching sessions/rosters, assessments/marks, accounting posting/reversals, public Careers and public tutor directory are preserved. `teaching_tutors` remains authoritative. Legacy `portal_users` and `tutor_assignments` are untouched. Self-grant changes are denied now; applicant-self-review and onboarding conflicts must be enforced when those records are introduced, with no permissive placeholder operations in M1.

The production constraints/indexes, deployed RPC definitions, effective grants and unknown external consumers still require inventory reconciliation before live migration approval. Trigger fences cover the inspected tutor/Admin tables; additional production access tables or custom functions require review. Retention jobs, malware provider, real Auth acceptance (including single-session settings), granular case assignment, MFA and scalable audit pagination remain later work. Owner audit shows the newest 200 events; underlying history is retained.

No migration has been run against production. No deployment or main merge is authorized by completing M1. Vercel previously auto-deployed `work` pushes, so keep the commit local until deployment is explicitly approved or a reviewed skip mechanism is available.
