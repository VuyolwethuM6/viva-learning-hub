# Focused Milestone 2 acceptance review

Reviewed baseline: `59613eca0fa4d242d1dcec7d2bc03a3818486227`, using the [implementation report](implementation-report.md) and [deployment guide](deployment-and-review.md). Review scope was the vacancy wizard, approval/publication, public Careers boundary, scoped authorization, immutable versions and additive migration dependencies. This was not a repeat general technical audit.

## Outcome

One confirmed medium-severity UI defect was fixed and regression tested. No new critical/high authorization or publication defect was identified in the reviewed scope. Code-level acceptance is satisfactory after the fix; actual target/hosting checks remain prerequisites to production approval. Milestone 3 is documented separately as a proposal, not implemented or enabled.

### Corrected: stale version-history responses could change another vacancy's history cursor

At the reviewed baseline, `earlierVersions()` applied its response, cursor, error and loading state without checking whether the reviewer had changed the selected vacancy while the request was pending. A slow history response for vacancy A could arrive after detail B loaded, hide B's remaining-history control or replace its pagination cursor. This did not grant unauthorized access or alter saved versions, but could prevent an accurate historical review.

Evidence/fix: `src/components/admin/recruitment/RecruitmentVacancyWorkspace.tsx:145` and `:358` now reset the old history-loading state when detail generation changes and ignore stale success/error/finally updates. `src/test/recruitment-vacancies-ui.test.tsx:498` defers A's response, selects B, completes A, and proves B retains its own cursor and can request earlier versions. The regression failed on the baseline and passes with the fix. No database or API contract change is required.

## Acceptance matrix and evidence

| Area | Verified repository behavior / evidence |
| --- | --- |
| Wizard | `VacancyWizard.tsx:185` separates engagement/schedule, supports incomplete saved drafts, structured future documents/questions and role-specific sections. Shared validation in `src/lib/recruitment-vacancies.ts:37` and SQL content checks enforce bounds/types; no applicant collection/upload control exists. Wizard/workspace suite now has 12 passing tests. |
| Approval/publication | M2 SQL `20261109050000_recruitment_vacancies.sql:158`, `:173`, `:225` checks current role/scope/AAL2, expected revision and owner-only final transitions. Saved/approved/public versions stay distinct. |
| Immutable history | M2 SQL composite version/approval links and immutable triggers at `:61–118`; revision/approval/publication at `:205–239`. New working or approved-but-unpublished content does not replace the old public snapshot. |
| Public endpoints | `api/careers.ts:103` queries current database state before ETag/304; SQL `:290` projects only published approved snapshots. Unknown/private nested fields are not forwarded. Pause/close/flag-off removes eligibility; application intake remains false. |
| Scoped staff | M2 SQL `:122–167` requires active scope for managers and active scope plus explicit vacancy assignment for officers. Direct browser writes/internal RPC execution are revoked. Current authority is checked before replay; owner-only publication cannot be obtained through UI bypass. |
| Migration dependencies | M1 migrations010000–040000 precede M2 migration050000. Existing M1 definitions are extended through reviewed dispatchers; no legacy table is renamed/dropped. Canonical/fresh-schema/transaction-bundle consistency and populated identity/tutor/ledger preservation are tested. Older M1-only bundles must not be replayed by themselves after M2. |
| Remaining list behavior | M2 public/private offset pages can move under concurrent publication/editing. This is a live-list consistency limitation, not an access bypass. M3 processing queues are proposed with stable keyset/snapshot boundaries. |

The canonical M2 migration remains unchanged, SHA-256:

`f5d99995c17fcfcf481e663e18ce09b496456cdd79c8b85c860e80a5a2abf1ab`

No corrective migration was necessary for the UI defect. Production dependencies/default grants/function owners/overloads still require target inspection before any SQL execution approval.

## Verification

- Complete suite: **376 tests passed across 40 files**, zero failed/skipped, including the new race regression, M1/M2 security, public exposure/cache, academic, teaching, enrollment and accounting regressions.
- Independent focused security verification: 39 tests passed across SQL, private/public APIs and recovered-review UI. Database dependency review identified no new critical/high SQL defect.
- Application and Node/API TypeScript: passed.
- Lint: zero errors; seven pre-existing UI Fast Refresh warnings.
- Production build: exit 0; 19 routes plus noindex 404 prerendered. Existing Browserslist/SSR warnings and the known prerender shutdown `The build was canceled` diagnostic remain; this is not reported as a diagnostic-free build.
- Diff whitespace and unchanged canonical migration checksum checked.

The M2 browser/accessibility evidence in [browser acceptance](browser-acceptance.json) and [accessibility results](accessibility-results.json) was reviewed as prior evidence. It is not a new hosted Supabase acceptance result. The additional race is covered by a fresh deferred-response UI regression; no new manual browser/hosted test is claimed for this acceptance fix. SQL tests use isolated local PostgreSQL fixtures and synthetic provider responses where applicable.

## Boundaries and recommendation

Continue to target/hosting acceptance after reviewing this fix. Verify actual Supabase Auth/MFA/session behavior, inherited grants/RLS, Storage/deployment configuration, true multi-connection contention and deployed SEO/caching before production rollout. No separate hosted project is imposed; the existing unified backend remains the target, subject to explicit execution approval.

Milestone 3 design must keep accountless access isolated, pin published requirements, scan immutable bytes, enforce staff conflicts and support erasure without storing PII in permanent M1 logs. See [the proposed technical design](../milestone-3/technical-design.md), [migration dependencies](../milestone-3/migration-plan.md), [API/security decisions](../milestone-3/api-and-security.md) and [implementation/approval plan](../milestone-3/implementation-plan.md).

No push, merge, deployment, production mutation, live flag/Auth change or M3 implementation occurred. Only the M2 UI fix/test and review/design documentation are included in this follow-up.
