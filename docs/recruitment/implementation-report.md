# Recruitment Milestone 1 implementation report

Implemented locally on the existing `work` branch from `dae505b`. No new development branch was created. Main was not merged or changed. No production Supabase connection, migration, account change, Storage change, provider configuration, email dispatch or deployment was performed.

## Delivered

- Separate `/admin/recruitment` entry and one private Node API. General Admin navigation links to it without sharing authorization or loading Admin records for recruitment-only users.
- Nine private foundation tables and three additive migrations, mirrored exactly in the fresh schema and isolated setup SQL transaction.
- Explicit recruitment ownership, one-time privileged operator bootstrap, owner/manager/officer grants, scope delegation and current-permission checks.
- Dedicated staff password/refresh sessions, rate limits and per-action password reauthentication. Proof hashes bind actor, original session, exact validated choices and request ID, expire after five minutes, and are consumed atomically.
- Stable mutation replay, revisions, append-only events/requests, conflict checks, concurrent owner protection and browser-RPC/table restrictions.
- Owner rollout controls; future collection, documents, decisions, onboarding, activation and compensation remain unavailable. Retention configuration records the confirmed 14-day / 6-month / 12-month policy; no retention worker or legal-hold processing is claimed.
- Opt-in table-level fence for legacy tutor/Admin grants. New tutors become disabled; new enabled Admin grants and finance authority elevations are blocked. Existing enabled identities, ordinary tutor binding, access revocation and finance demotion remain available. No ledger operation was altered.
- Setup, permissions, architecture and manual acceptance documentation.

## Verification

| Check | Result |
| --- | --- |
| Complete Vitest suite | 298 passed across 32 test files |
| New recruitment tests | 22 passed: 12 database/migration, 7 API and 3 UI |
| Application TypeScript | Passed |
| Node/API TypeScript | Passed |
| ESLint | Zero errors; seven existing Fast Refresh warnings |
| Production build | Exit 0; 19 public routes plus 404 prerendered |
| Migration/fresh-schema/setup-bundle consistency | Passed |
| Populated audited-baseline upgrade | Existing tutor/Admin/journal/ledger rows preserved |
| PostgreSQL ACL/search-path checks | Browser access blocked, internal/bootstrap service execution blocked, definer search paths fixed |
| Browser acceptance | Real isolated SQL + Node API; synthetic Auth; owner grants, rollout, manager delegation, officer restrictions, uncertain-response recovery, scoped API traffic, logout focus and private metadata passed |
| Responsive widths | 320, 390, 768 and 1440px without page overflow |
| Diff whitespace check | Passed |

Database tests instantiate in-memory PGlite databases with synthetic Auth/Storage schemas; API tests bridge to real SQL and stub external Auth. Browser acceptance used a temporary localhost harness with real PGlite/Node API and synthetic Auth. Unexpected external requests were rejected. No hosted database or real identity was used. No application dependencies were added.

The existing Vite prerender shutdown diagnostic (`The build was canceled`) still appears after successful prerender and exit 0; it predates this milestone. Hosted deployment and real Supabase Auth acceptance have not been performed.

## Important rollout limitations

1. Access guards default OFF. Legacy access behavior remains until an owner explicitly enables them. Staff-console enablement requires guards ON. Do not mistake installed migrations for active global owner-activation enforcement.
2. There is no onboarding/activation adapter. While the fence is on, new teaching/Admin activation is blocked even for owners. Turning it off is a reauthenticated, audited owner decision that restores legacy behavior.
3. Staff must have existing verified Supabase Auth identities with passwords. This milestone does not provision users, send invitations, implement MFA or certify hosted single-session/refresh configuration.
4. Production constraints/indexes, live functions, grants/policies/triggers and external consumers of older identity tables remain unverified. Reconcile them before production approval; do not run the setup bundle blindly against live data.
5. Public Careers remains the existing zero-vacancy page. No applicant accounts, files, public forms, interviews, hiring/rejection, onboarding, notification outbox or compensation processing are released.
6. Sensitive case self-review/onboarding conflict checks and real engagement FKs must be introduced with those later entities. No placeholder API permits those operations now.
7. Owner security audit displays the latest 200 events. Privileged operator recovery and larger-directory pagination are future operational considerations.

## Commit and deployment boundary

The completed implementation is committed locally on `work`. It is not pushed: this repository's earlier `work` pushes automatically triggered Vercel previews, while the current instruction forbids deployment without explicit approval. Remote `work` and remote `main` were verified unchanged before the local commit. Review the local commit/diff before approving publication, migration execution or deployment.

For testing steps, see [isolated setup](milestone-1-setup.md) and [acceptance guide](milestone-1-test-guide.md). Implementation does not authorize production bootstrap, deployment, push or main merge.
