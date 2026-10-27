# Implementation status and next work

Updated: 27 October 2026. This describes the parent-portal release on `work` and its accounting prerequisites. “Implemented” means code exists; “verified locally” means the stated checks ran. Neither establishes production readiness or a deployed database migration.

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
| Teaching/portals/monitoring | Classes, tutor access, private materials and confirmed attendance implemented; academic/learner tools and monitoring remain planned                                                                                                                                  | No fake academic data or “healthy” claims                                                           |

## Policies and operational guidance

[Admin workflow](admin-workflow.md) is the authoritative working policy and setup/test procedure: grade-specific weekly programmes, enrollment-form prices, first payment before activation, monthly invoicing on the 25th, due on the 1st and reminders from the 3rd. The accounting release implements the learner billing/lifecycle controls described in the [accounting test guide](accounting-test-guide.md).

[Development guide](development.md) covers commands and architecture. [Service setup](supabase-setup.md) covers enrollment-specific configuration and verification.

## Database synchronization

The owner's previously supplied email claim/release SQL is stored in `20261026090000_enrollment_email_claims.sql`. Admin/tuition definitions are in `20261026100000_admin_tuition.sql`. The follow-up `20261026110000_verified_document_finalization.sql` repairs deployed finalizer drift and missing legacy metadata. `20261026120000_monthly_invoice_numbers.sql` adds the tuition-month numbering format. These are also included in `supabase/schema.sql` for new projects and `docs/admin-setup.sql` for the guided setup path. No live SQL was executed by this coding task. The owner reported that the finalizer repair worked and subsequently confirmed running the monthly invoice-number migration. This is owner-reported deployment status; this coding task did not independently query the live definitions.

The prior notification-management release (`20261026130000_notification_management.sql`) added cancellation metadata, an authorized cancellation RPC, send protection and richer snapshots. The owner reported the preceding workspace changes working. The accounting upgrade assumes this prerequisite is installed; its actual live definition was not independently checked.

## Accounting release

The owner confirmed resetting test records before this implementation. The six migrations dated 20261027 are consolidated in [accounting-setup.sql](accounting-setup.sql), and included in the fresh schema. No live migration was executed by this coding task.

Implemented: zero-opening ZAR/no-VAT ledger; EFT/cash receipts and multi-invoice family allocations; advance credits, refunds, credit notes and reviewed reversals; expenses/payables/evidence; bank imports, matching and timing differences; statements and financial reports/exports; owner/bookkeeper/viewer finance roles; withdrawal, suspension/return and arrangements; closed periods; and opt-in scheduled billing/outbox dispatch. Routine tuition skips December/January. The [test guide](accounting-test-guide.md) provides the release checklist and verification boundaries.

## Parent portal

The owner reported the accounting release working before requesting the parent portal. The parent upgrade is `20261027150000_parent_portal.sql`, consolidated in [parent-setup.sql](parent-setup.sql). The owner reported successfully applying this setup on 27 October 2026. This coding task did not independently query the live database or configure Auth emails.

Implemented at `/parent`: prototype-inspired responsive orange/purple design; email-only sign-in via a one-use email link; explicit staff enable/disable controls for reviewed guardian accounts; verified Auth identity binding; sibling switching; real learner/programme information; complete family balances and bounded financial history; private invoice/receipt/credit/refund/statement PDFs; EFT/cash guidance and contact links. Sign-in and refresh tokens use separate HttpOnly parent cookies. No attendance or results are invented, and enrollment does not add an email challenge or prohibit siblings sharing a guardian email.

[Parent setup and testing](parent-portal.md) includes the SQL, Supabase SMTP/redirect/template settings and full controlled-inbox checklist. Existing tuition email templates are separate from the Supabase Auth templates. Parent academic publishing, proof uploads, second-guardian invitations and financial account transfers after a guardian change remain future work.

## Teaching foundation release

Implemented: admin tutor authorization, saved teaching rooms, reusable topics/goals, class setup, active learner membership, individual session scheduling with conflict/closure checks, versioned private teaching files with upload recovery, tutor email-link access, explicit attendance/completion/corrections and per-session audit history. Parents see authorized confirmed attendance and upcoming sessions, with private staff notes excluded. The owner has not yet reported applying the teaching migration or testing its live Auth/Storage setup.

Run the complete [teaching-setup.sql](teaching-setup.sql) after parent setup. [Teaching setup and tests](teaching-test-guide.md) includes the extra tutor callback, shared portal-neutral Auth email template, deployment checks and full acceptance flow. No production SQL or external email was executed by the implementation tests.

Enrollment marks/targets are shown and saved with session rosters. Assessment averages, diagnostic/formative/summative recording, learner submissions, timed exams and public materials/catalog management remain future releases. Existing study-material sales are unchanged.

## Next milestones

The owner now reports the parent portal working as expected. [Teaching workflow plan](teaching-workflow-plan.md) records the next requirements, including materials, session work/homework, timed submissions, future public catalog management and a preference for choosing options over typing. This is planned work; the teaching modules are not implemented yet.

1. Apply the teaching upgrade, configure the tutor callback/shared Auth email template and complete the live class → tutor → parent attendance test.
2. Verify the scheduler, private evidence and controlled-inbox delivery before enabling automatic dispatch.
3. Add learner access, assigned work/submission, marking/review/publication and timed exams.
4. Connect admin Materials to the public catalog and preserve paid-resource purchase/delivery behavior; online tuition checkout remains separate future work.
5. Expand MFA/account recovery, pagination, advanced statutory reporting and operational monitoring/backup verification.

## Remaining risks and limits

- No live credentials were available in the coding environment. Production integration readiness is unverified.
- Initial public submission still lacks server idempotency and refresh recovery. Lost initial creation responses direct users to support. Email claim timestamps are duplicate suppression, not exactly-once delivery.
- Tuition notification retries must be investigated after ambiguous outcomes; older attempts require provider-history review.
- The separate paid study-material PDF delivery still uses process-local duplicate tracking and lacks a durable purchase ledger. This is distinct from the new tuition document PDFs/outbox.
- Student lifecycle changes are recorded and affect billing; teaching access remains a manual team responsibility until portals exist.
- Public subject pages can describe enquiry-only services outside the current enrollment subject options; confirm availability with families during review.
- Remaining baseline lint/build warnings are documented in the development guide; they are not ignored test failures.
