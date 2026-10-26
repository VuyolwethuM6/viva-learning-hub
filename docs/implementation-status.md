# Implementation status and next work

Updated: 26 October 2026. This describes the current working tree. “Implemented” means code exists; “verified locally” means the stated checks ran. Neither establishes production readiness or a deployed database migration.

## Working scope

| Area | Implementation | Verification boundary |
| --- | --- | --- |
| Enrollment | Multi-step intake, server-priced draft, private signed report upload, retry and metadata verification | UI/API tests; prior Chromium check used mocked services |
| Application received | Stage-aware blur/loader, duplicate-click guard, matching-reference receipt, summary/print/contact, safe unknown-outcome handling | Existing tests and browser check |
| Receipt/admin email | Triggered after document completion; failure does not undo enrollment; claim/release functions now included in Git and fresh schema | Owner previously applied email SQL in Supabase; this task did not inspect or migrate the live DB |
| Admin access | `/admin`, Supabase Auth session, explicit enabled admin membership, HttpOnly cookie, server-side authorization and same-origin writes | Local API authorization tests; live account setup still required |
| Review | Private report-card link requests, learner/guardian details, marks, notes, approve/reject | Real database function tests; UI/browser checks described in development guide |
| First invoice | Approval transaction issues prorated first invoice and queues email | Database-enforced date, programme-day, document, fee and duplicate rules |
| Tuition payments | Manual verified allocations, unique transaction references, partial/early invoice payments, audit | Real PostgreSQL-function tests; no bank/provider reconciliation |
| Activation | Requires approval and fully settled first invoice | Enforced in DB, not merely by a disabled button |
| Continuing billing | Manual next-month generation from 25th; invoices due 1st; reminder queue from 3rd | Date/duplicate tests; no scheduler enabled |
| Notifications | Durable invoice/receipt/reminder/activation queue with lease and provider idempotency key | Provider mocked; sender configuration and live tests still needed |
| Public pricing | Grade/subject fees aligned with enrollment | Replaces conflicting legacy session-package cards |
| PDF commerce | Existing server-signed live PayFast checkout and notification validation; paid PDF emails | Separate from tuition; no new live payment test |
| Enquiries/analytics | Existing Resend enquiry routes and optional GA; admin route skips app analytics | Existing implementation; no full enquiry integration test |
| Teaching/portals/monitoring | Dashboard placeholders only | No fake academic data or “healthy” claims |

## Policies and operational guidance

[Admin workflow](admin-workflow.md) is the authoritative working policy and setup/test procedure: grade-specific weekly programmes, enrollment-form prices, first payment before activation, monthly invoicing on the 25th, due on the 1st and reminders from the 3rd. It distinguishes agreed suspension/withdrawal policies from controls not built yet.

[Development guide](development.md) covers commands and architecture. [Service setup](supabase-setup.md) covers enrollment-specific configuration and verification.

## Database synchronization

The owner's previously supplied email claim/release SQL is now stored in `20261026090000_enrollment_email_claims.sql`. The new admin/tuition definitions are in `20261026100000_admin_tuition.sql`. Both are included in `supabase/schema.sql` for new projects. No live SQL was executed here. Apply reviewed migrations to the intended Supabase project before testing admin endpoints.

## Next milestones

1. Configure a test deployment and admin account; complete live synthetic enrollment, private document, approval, invoice, payment and email verification.
2. Add suspension, withdrawal, payment arrangements, reversals/credits and reconciliation workflows before unattended billing.
3. Introduce scheduled monthly generation/reminders with run history, monitoring and recovery. Do not describe manual buttons as scheduled automation.
4. Add tuition online checkout and then authorized recurring collection. Keep it separate from PDF sales and require durable payment-provider event handling.
5. Implement class access and learner/parent/tutor portals, then attendance, materials, assessments and reports. The proposed native class spaces replace Google Classroom; this remains a later product milestone.
6. Expand admin MFA/account recovery, pagination, durable exports and operational monitoring/backup verification.

## Remaining risks and limits

- No live credentials were available in the coding environment. Production integration readiness is unverified.
- Initial public submission still lacks server idempotency and refresh recovery. Lost initial creation responses direct users to support. Email claim timestamps are duplicate suppression, not exactly-once delivery.
- Tuition notification retries must be investigated after ambiguous outcomes; older attempts require provider-history review.
- PDF delivery still uses process-local duplicate tracking and lacks a durable purchase ledger.
- Suspension/withdrawal controls are absent. The schema's status foundations do not establish completed lifecycle management.
- Public subject pages can describe enquiry-only services outside the current enrollment subject options; confirm availability with families during review.
- Remaining baseline lint/build warnings are documented in the development guide; they are not ignored test failures.
