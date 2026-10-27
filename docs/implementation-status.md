# Implementation status and next work

Updated: 27 October 2026. This describes the accounting release on `work`. “Implemented” means code exists; “verified locally” means the stated checks ran. Neither establishes production readiness or a deployed database migration.

## Working scope

| Area                        | Implementation                                                                                                                                               | Verification boundary                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Enrollment                  | Multi-step intake, server-priced draft, private signed report upload, retry, strict stored-file metadata verification and confirmed document-record creation | UI/API tests; prior Chromium check used mocked services                                             |
| Application received        | Stage-aware blur/loader, duplicate-click guard, matching-reference receipt, summary/print/contact, safe unknown-outcome handling                             | Existing tests and browser check                                                                    |
| Receipt/admin email         | Triggered after document completion; failure does not undo enrollment; claim/release functions now included in Git and fresh schema                          | Owner previously applied email SQL in Supabase; this task did not inspect or migrate the live DB    |
| Admin access                | `/admin`, Supabase Auth session, explicit enabled admin membership, HttpOnly cookie, server-side authorization and same-origin writes                        | Local API authorization tests; live account setup still required                                    |
| Admin design                | Viva-branded login, sidebar/mobile bottom navigation, real-data overview, learner cards/profile drawers and confirmation dialogs                             | Desktop/mobile Chromium checks with synthetic records; future teaching sections remain placeholders |
| Review                      | Private report-card link requests, learner/guardian details, marks, notes, approve/reject                                                                    | Real database function tests; UI/browser checks described in development guide                      |
| First invoice               | Approval transaction issues prorated first invoice and queues email                                                                                          | Database-enforced date, programme-day, document, fee and duplicate rules                            |
| Invoice numbers             | New invoices use `VT-YYYYMMNN` for the tuition month, with an atomic shared monthly counter                                                                  | Reset, rerun and 100th-invoice database tests; existing issued numbers preserved                    |
| Financial documents         | Branded private invoice/per-payment receipt PDFs, admin preview/download and attachments in the corresponding emails                                         | Actual PDF generation and local rendering checks; live provider delivery unverified                 |
| Tuition payments            | Verified EFT/cash receipts, family allocations/advances, refunds/corrections and audit                                                            | Real PostgreSQL-function tests; statement matching verified locally, live bank activity unverified                                     |
| Activation                  | Requires approval and fully settled first invoice                                                                                                            | Enforced in DB, not merely by a disabled button                                                     |
| Continuing billing          | Manual/opt-in scheduled generation from 25th; due 1st; reminders from 3rd; Feb–Nov billing                                                                            | Date/duplicate/seasonal tests; unattended work starts disabled                                                          |
| Notifications               | Durable tuition/financial document queue with leases, idempotency keys and opt-in dispatch                                                                    | Provider mocked; sender configuration and live tests still needed                                   |
| Public pricing              | Grade/subject fees aligned with enrollment                                                                                                                   | Replaces conflicting legacy session-package cards                                                   |
| PDF commerce                | Existing server-signed live PayFast checkout and notification validation; paid PDF emails                                                                    | Separate from tuition; no new live payment test                                                     |
| Enquiries/analytics         | Existing Resend enquiry routes and optional GA; admin route skips app analytics                                                                              | Existing implementation; no full enquiry integration test                                           |
| Teaching/portals/monitoring | Dashboard placeholders only                                                                                                                                  | No fake academic data or “healthy” claims                                                           |

## Policies and operational guidance

[Admin workflow](admin-workflow.md) is the authoritative working policy and setup/test procedure: grade-specific weekly programmes, enrollment-form prices, first payment before activation, monthly invoicing on the 25th, due on the 1st and reminders from the 3rd. The accounting release implements the learner billing/lifecycle controls described in the [accounting test guide](accounting-test-guide.md).

[Development guide](development.md) covers commands and architecture. [Service setup](supabase-setup.md) covers enrollment-specific configuration and verification.

## Database synchronization

The owner's previously supplied email claim/release SQL is stored in `20261026090000_enrollment_email_claims.sql`. Admin/tuition definitions are in `20261026100000_admin_tuition.sql`. The follow-up `20261026110000_verified_document_finalization.sql` repairs deployed finalizer drift and missing legacy metadata. `20261026120000_monthly_invoice_numbers.sql` adds the tuition-month numbering format. These are also included in `supabase/schema.sql` for new projects and `docs/admin-setup.sql` for the guided setup path. No live SQL was executed by this coding task. The owner reported that the finalizer repair worked and subsequently confirmed running the monthly invoice-number migration. This is owner-reported deployment status; this coding task did not independently query the live definitions.

The prior notification-management release (`20261026130000_notification_management.sql`) added cancellation metadata, an authorized cancellation RPC, send protection and richer snapshots. The owner reported the preceding workspace changes working. The accounting upgrade assumes this prerequisite is installed; its actual live definition was not independently checked.

## Accounting release

The owner confirmed resetting test records before this implementation. The six migrations dated 20261027 are consolidated in [accounting-setup.sql](accounting-setup.sql), and included in the fresh schema. No live migration was executed by this coding task.

Implemented: zero-opening ZAR/no-VAT ledger; EFT/cash receipts and multi-invoice family allocations; advance credits, refunds, credit notes and reviewed reversals; expenses/payables/evidence; bank imports, matching and timing differences; statements and financial reports/exports; owner/bookkeeper/viewer finance roles; withdrawal, suspension/return and arrangements; closed periods; and opt-in scheduled billing/outbox dispatch. Routine tuition skips December/January. The [test guide](accounting-test-guide.md) provides the release checklist and verification boundaries.

## Next milestones

1. Apply accounting setup to the intended test project and complete the live synthetic checklist.
2. Verify the scheduler, private evidence and controlled-inbox delivery before enabling automatic dispatch.
3. Add online tuition checkout if needed, separately from PDF sales.
4. Implement learner/parent/tutor teaching portals and class access, then academic tools.
5. Expand MFA/account recovery, pagination, advanced statutory reporting and operational monitoring/backup verification.

## Remaining risks and limits

- No live credentials were available in the coding environment. Production integration readiness is unverified.
- Initial public submission still lacks server idempotency and refresh recovery. Lost initial creation responses direct users to support. Email claim timestamps are duplicate suppression, not exactly-once delivery.
- Tuition notification retries must be investigated after ambiguous outcomes; older attempts require provider-history review.
- The separate paid study-material PDF delivery still uses process-local duplicate tracking and lacks a durable purchase ledger. This is distinct from the new tuition document PDFs/outbox.
- Student lifecycle changes are recorded and affect billing; teaching access remains a manual team responsibility until portals exist.
- Public subject pages can describe enquiry-only services outside the current enrollment subject options; confirm availability with families during review.
- Remaining baseline lint/build warnings are documented in the development guide; they are not ignored test failures.
