# Milestone 1 acceptance

Use only isolated synthetic identities. Do not use real applicant information.

1. Before bootstrap, recruitment sign-in is denied. Finance ownership alone grants no recruitment permission.
2. Bootstrap one verified identity using the authorized operator procedure. A second bootstrap fails. The service role cannot invoke bootstrap.
3. Sign in at `/admin/recruitment`. Check dedicated HttpOnly/Secure cookies scoped to `/api/admin/recruitment`; general Admin/tutor/parent sessions remain separate.
4. Review readiness: all future features false, fixed retention values 14 days / 6 months / 12 months. No applicant tables/forms, document uploads, decision or activation operations exist.
5. Grant an existing verified manager identity. Manager sign-in remains unavailable while the console is off. Unknown/unverified Auth UUIDs are rejected. Your own role cannot be changed through the UI/API.
6. Enable access safeguards and the console through explicit review and fresh password confirmation. Trying console on with safeguards off fails.
7. Create two vacancy scopes. Grant the manager only one. Add an enabled officer. Manager can delegate their scope to that officer; cross-scope, owner-role and self-grant attempts fail. Officer sees only assigned scopes and no mutation controls/audit directory.
8. Open a review, inspect exact choices and cancel: no write. Wrong password produces no proof. Correct password produces a session/action/payload-bound five-minute proof. Tampering with the operation or payload fails.
9. Simulate losing the mutation response. Keep the review open and retry: one stable request ID, one recorded change. Reusing the ID with altered details fails. Audit events contain no password/proof.
10. Revoke the manager. The same browser's next request, including a replay, is denied. Existing scope rows do not override disabled membership.
11. With the fence enabled, create a tutor through the existing workflow: the record is disabled. Attempt activation or new enabled Admin access: denied. Existing active tutor binding and sign-in remain available. Finance role reduction and access disable remain available, while elevation is blocked. There is no approval bypass in M1.
12. Confirm the existing enrollment, academic, tuition and accounting regression suites pass. No teaching sessions, ledger entries, real email requests or Storage objects are created by recruitment security operations.
13. Reapply migrations in the isolated database: owner grants/flags survive. Browser roles have no table grants or recruitment RPC execution, internal helpers/bootstrap are not executable by service role, and all security-definer functions use an empty search path.
14. Check 320px, 390px, tablet and desktop: no page overflow; review/logout dialogs trap focus and support keyboard dismissal when safe; uncertain writes cannot be dismissed into duplicate submission; loading indicators are centered; metadata is noindex/no-store and analytics excludes this route.

Automated tests inspect fresh schema and upgrade/rerun behavior in in-memory PostgreSQL. Synthetic Auth/provider checks do not certify real hosted Auth configuration or email delivery. Long-term retention purging, document scanning, applicant conflict-of-interest checks and activation acceptance belong to later milestones, not this foundation's test claims.
