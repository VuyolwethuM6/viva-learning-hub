# Admin review and tuition operations

Updated: 26 October 2026. This is the first admin milestone, not a completed teaching/collection platform.

## Agreed business policies

| Item | Policy |
| --- | --- |
| Programme | Grades 8–11 Monday–Saturday; Grade 12 Monday–Sunday including feedback; Matric Rewrite all Monday–Friday days, regardless of subject selection. Configured closures are excluded |
| Grades 8–9 | 1 subject R350/month; 2 subjects R600/month |
| Grades 10–12 | 1 subject R500; 2 R800; 3 R1,100/month |
| Matric Rewrite | 1 subject R550; 2 R900; 3 R1,200/month |
| First charge | Monthly fee × remaining scheduled programme days / total scheduled programme days in the starting calendar month, rounded once to cents |
| First payment | Fully verified and allocated before activation |
| First invoice due date | Agreed start date; it must be settled before activation, even if activation is requested earlier |
| Continuing invoices | Issue on the 25th for the following calendar month |
| Continuing payment due | 1st of the month being taught, including weekends/public holidays |
| Unpaid-balance reminder | From the 3rd, only for outstanding balances |
| Follow-up | Personal follow-up on the 7th; not automated in this milestone |
| Suspension | Proposed agreed workflow: from the 10th after admin confirmation/notice unless an approved arrangement exists; controls are not implemented yet |
| Withdrawal | Notice by the 20th to stop next month's charge. Later requests need a recorded, agreed final date and charge; no automatic full extra month |
| Timezone | Africa/Johannesburg |

Example: R800 monthly fee, 22 scheduled weekdays, 11 remaining = R400 first invoice. Count actual grade-specific programme days, not a fixed 20-day month. `tuition_programmes` contains grade-level weekday arrays (ISO Monday=1 through Sunday=7). Configure closures before invoice creation; changing programme calendars also requires updating the enrollment display and reviewing future charges. `tuition_closures` contains exclusions; it is initially empty. Do not assume South African holidays are automatically excluded. Configure closures before issuing invoices. Existing invoice calculations are retained if the calendar or monthly fee later changes. The enrollment display comes from `src/lib/tuition-programme.json`; matching database programme seeds drive billing. The admin preview uses the database calendar, and every issued invoice saves the calendar label/days it used. Rewrite billing counts all five programme days, not just selected-subject teaching days.

No automatic deletion for unpaid applications, Google Classroom invitations, learner portal provisioning or suspension runs in this milestone.

## What is implemented

- `/admin` sign-in using Supabase Auth email/password, a server-validated session and enabled `admin_users` membership on every API call.
- Overview, searchable applications/students, private report-card link requests, intake details/marks, review notes, rejection reasons and approval.
- Approval plus first invoice plus queued invoice notification in one database transaction. Approval moves the application to `pending_payment`; it does not activate it.
- Invoices derived from the stored, server-calculated enrollment fee. No client-supplied amount controls an invoice.
- Manual verified payment allocations with date, method, transaction reference, verification note and actor. Partial payments and early payment of already-issued future invoices are supported.
- Activation only after approval and full first-invoice settlement, enforced again by the database. Active status does not provision classes or portal access.
- Manual next-month invoice generation from the 25th and manual reminder queueing from the 3rd. Repeating a run does not duplicate learner/month invoices or invoice/month reminders.
- Durable notification queue for invoice, payment receipt, reminder and activation messages. An admin sends one queued message at a time.
- Audit events for reviews, document-link requests, financial changes, activation, billing/reminder runs and notification-send attempts.
- Other proposed dashboard sections display “Not available yet,” not sample numbers or false monitoring results.

The initial application-received email remains a separate existing flow. Its claim timestamps are captured by the email migration; it is not managed in the new tuition queue. Rejection currently records a reason but does not send an automatic rejection email; contact the family separately.

## Setup in Supabase and Vercel

Use a separate test Supabase project and Vercel Preview environment where possible. Review SQL before applying to an existing project and back up existing data. No live migration was applied by the coding task.

For an existing intake installation, run in order:

1. `supabase/migrations/20261025120000_learner_documents.sql` if that document migration is not already applied.
2. `supabase/migrations/20261026090000_enrollment_email_claims.sql`. This captures the owner's previously applied “04” email SQL. It is rerunnable and does not reset existing timestamps.
3. `supabase/migrations/20261026100000_admin_tuition.sql` for the new admin/finance schema.

For a new project, `supabase/schema.sql` includes all of these definitions. Run the fresh schema instead of blindly applying both paths. The files are rerunnable definitions, not a migration-history tracker.

In Supabase Authentication, create/confirm the intended admin user using the dashboard's supported account workflow. Then add its **Auth user UUID**, not an email or invented UUID, using the SQL Editor:

```sql
insert into public.admin_users(user_id, enabled)
values ('REPLACE-WITH-AUTH-USER-UUID'::uuid, true)
on conflict(user_id) do update set enabled = true;
```

An ordinary Auth account cannot grant itself membership. To revoke access, set `enabled=false`; each subsequent admin request checks it. Normal public registration is not an admin onboarding mechanism. Configure Auth's password protections/rate limits; the application has no public admin signup endpoint. Password recovery must currently use your Supabase-supported account recovery workflow.

Server environment requirements:

| Setting | Use |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Auth validation, authorized database RPCs and private Storage signing |
| `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` | Tuition notification provider, verified sender, reply-to |
| `TUITION_BANK_DETAILS_CONFIRMED=true` | Explicit release gate for sending invoice/reminder payment instructions |

Before setting the confirmation flag, verify `api/_lib/payment-details.ts` against the business's real bank account. This version uses those existing bank details for tuition emails; the old `PAYMENT_DEADLINE_DAYS` constant is unused. Do not enable the flag with unverified details. No `VITE_` credential variables are needed. Server settings must be assigned to the correct Vercel Preview/Production environment and the deployment restarted/rebuilt as needed.

Admin cookies are HttpOnly, SameSite=Strict, scoped to `/api/admin`, and Secure in production/Vercel deployments. Sessions last at most one hour; there is no refresh-token storage or refresh workflow. Sign out removes the browser cookie. Supabase validates access-token expiry and account membership is checked every request. MFA is not implemented by this UI yet; the prototype's “two-step sign-in required” label has not been carried over as a false claim.

`/admin` and admin APIs are non-indexable. API responses are non-cacheable. App analytics initialization/event tracking is skipped on `/admin`. Financial tables and mutation functions are unavailable to browser database roles; the server service key must remain private. The server checks request Origin before mutations. Audit records have no application edit/delete endpoint; database owners/service administrators still have database-level capabilities, so this is not tamper-proof archival storage.

## Manual end-to-end test

1. Run `npm ci`, then `npx vercel dev` with the configured project, or use its Preview deployment. Vite alone does not host the APIs.
2. Submit a synthetic enrollment with a dummy report card and controlled inboxes.
3. Sign in at `/admin`. An authenticated non-admin must be denied, and a signed-out API request must return 401.
4. Open Applications, inspect the report-card link and learner details/marks, and add a review note.
5. Select a start date today or later that belongs to the learner’s programme; confirm the displayed estimate. Approve. Verify status is awaiting payment, one invoice exists, and one invoice message is queued.
6. Open Finance and print/check the invoice's period, due date, programme days and amount. Before payment, activation must be unavailable.
7. In Notifications, send the invoice message only to the authorized test inboxes. “Sent” means provider acceptance, not inbox delivery. No automatic sending or collection takes place.
8. Check a synthetic/test payment against its source before recording it. Choose a unique bank transaction ID or cash receipt number, not the student's recurring reference. Record a partial allocation; the remaining balance must stay visible and activation remain blocked.
9. Record the rest using another transaction ID. Send the two receipt messages; each receipt describes that payment and the balance at that event, not the entire account as universally settled.
10. Return to the learner record and activate. Confirm status and audit history, then send the queued activation email. No portal/classroom access should be claimed as created.
11. Test repeating a payment request, reusing a transaction reference, over-allocation, an invalid date, an unauthorized request and a document request without an admin session.
12. On/after the 25th, generate next month invoices twice. Verify one full invoice per eligible active learner/month, due on the 1st. On/after the 3rd, queue reminders twice and verify no duplicate notices. To test other clock dates without changing production functions, use the local database tests described below.
13. Test mobile tables, navigation, dialog keyboard focus, printable invoice/history, expired sign-in and email-provider failure.

Payment methods are manual labels for verified EFT, Cash, Card or SnapScan receipts. They do not imply an integration with any of those services. No real charge is initiated by this admin workflow. Existing PDF PayFast checkout is separate.

## Safe notification retries

The outbox leases messages to avoid concurrent sends. Provider requests use a stable `tuition-<message UUID>` idempotency key. Email content is a snapshot, including the balance when prepared. Reminders for fully settled invoices are skipped at claim time. If a partial payment arrives after reminder preparation, inspect the current balance before sending that older notice; its snapshot is not dynamically rewritten.

A send timeout or an acknowledgment failure is ambiguous: investigate provider history before retrying. Leases expire after two minutes. Automated retry is not running. Attempts older than 23 hours from the first attempt are blocked for manual investigation because provider idempotency windows are limited; do not clear timestamps blindly. “Sent” can also indicate a settled reminder was skipped, with the reason in `last_error`.

Financial operations remain committed when notification delivery fails. Failed notification status must not be used to repeat the financial action.

## Automated checks and boundaries

```bash
npm test
npm run lint
npx --no-install tsc -p tsconfig.app.json --noEmit
npx --no-install tsc -p tsconfig.node.json --noEmit
npm run build
```

Database tests use PGlite (embedded PostgreSQL), real tables/functions and minimal stubs for Supabase-owned Auth/Storage schemas. They test rerunnable schema, date/closure calculations, money allocation, duplicates, activation gates, role privileges, invoice/reminder dates and notification leases. An isolated test clock is used only in the test database. They do not prove Supabase Auth, PostgREST, Storage or Resend connectivity. API tests mock those boundaries to check access controls and request behavior.

Current operational limits:

- No cron, automatic collection/debit orders, online tuition checkout, bank import, refunds, discounts, invoice cancellation, unallocated credit ledger or one transaction split over multiple invoices.
- One payment entry allocates one unique transaction reference to one invoice. Multi-invoice settlements need reconciliation design before recording, not invented references to bypass duplicate protection.
- No suspension, withdrawal, reactivation, payment-arrangement management or follow-up automation yet. These policies are agreed targets, not active controls. Do not keep generating future charges for a learner who has withdrawn; pause manual billing and resolve the record with the owner until those controls exist.
- No permanent receipt download links for families, PDF email attachments, class access, parent/student login, admin MFA or automatic reconciliation.
- The snapshot loads at most 500 applications, 1,000 invoices/payments and 200 recent audit/messages; it flags truncated financial data. Pagination and larger-volume reporting are future work.
- The first invoice amount is immutable after creation. Payment entries have no edit/delete API; corrections require a reviewed database/accounting procedure until reversal workflows exist.

Do not enable unattended billing until lifecycle controls (withdrawals, suspension/arrangements) and notification recovery are implemented and tested.

## Synthetic test cleanup

Financial and audit records deliberately do not cascade away with an application. Use a disposable test project or a reviewed cleanup transaction in the SQL Editor: identify the exact synthetic application UUID, remove its tuition messages, payment allocations, invoices and audit entries, then remove the application and its private Storage object. Do not apply broad delete statements to production. Do not reset invoice or learner sequences to hide gaps.
