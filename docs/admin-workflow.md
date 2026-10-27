# Admin review and tuition operations

Updated: 27 October 2026. For the accounting release, the [accounting setup and test guide](accounting-test-guide.md) is authoritative for ledger operations, migrations, financial controls and testing. This page retains the intake/review policies and earlier setup prerequisites.

## Agreed business policies

| Item                    | Policy                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programme               | Grades 8–11 Monday–Saturday; Grade 12 Monday–Sunday including feedback; Matric Rewrite all Monday–Friday days, regardless of subject selection. Configured closures are excluded |
| Grades 8–9              | 1 subject R350/month; 2 subjects R600/month                                                                                                                                      |
| Grades 10–12            | 1 subject R500; 2 R800; 3 R1,100/month                                                                                                                                           |
| Matric Rewrite          | 1 subject R550; 2 R900; 3 R1,200/month                                                                                                                                           |
| First charge            | Monthly fee × remaining scheduled programme days / total scheduled programme days in the starting calendar month, rounded once to cents                                          |
| First payment           | Fully verified and allocated before activation                                                                                                                                   |
| First invoice due date  | Agreed start date; it must be settled before activation, even if activation is requested earlier                                                                                 |
| Continuing invoices     | Issue on the 25th for the following calendar month                                                                                                                               |
| Invoice number          | `VT-YYYYMMNN`, using the tuition month and a shared monthly counter; minimum two-digit suffix, e.g. November's first invoice is `VT-20261101`, even if issued in October         |
| Continuing payment due  | 1st of the month being taught, including weekends/public holidays                                                                                                                |
| Unpaid-balance reminder | From the 3rd, only for outstanding balances                                                                                                                                      |
| Follow-up               | Personal follow-up on the 7th; not automated in this milestone                                                                                                                   |
| Suspension              | Admin-confirmed workflow: from the 10th after admin confirmation/notice unless an approved arrangement exists; recorded through the learner-account controls after notice and admin confirmation                                  |
| Withdrawal              | Notice by the 20th to stop next month's charge. Later requests need a recorded, agreed final date and charge; no automatic full extra month                                      |
| Timezone                | Africa/Johannesburg                                                                                                                                                              |

Example: R800 monthly fee, 22 scheduled weekdays, 11 remaining = R400 first invoice. Count actual grade-specific programme days, not a fixed 20-day month. `tuition_programmes` contains grade-level weekday arrays (ISO Monday=1 through Sunday=7). Configure closures before invoice creation; changing programme calendars also requires updating the enrollment display and reviewing future charges. `tuition_closures` contains exclusions; it is initially empty. Do not assume South African holidays are automatically excluded. Configure closures before issuing invoices. Existing invoice calculations are retained if the calendar or monthly fee later changes. The enrollment display comes from `src/lib/tuition-programme.json`; matching database programme seeds drive billing. The admin preview uses the database calendar, and every issued invoice saves the calendar label/days it used. Rewrite billing counts all five programme days, not just selected-subject teaching days.

There is no automatic deletion for unpaid applications or portal provisioning. Suspension requires an administrator and recorded notice.

## What is implemented

- `/admin` sign-in using Supabase Auth email/password, a server-validated session and enabled `admin_users` membership on every API call.
- Branded sign-in and responsive workspace with desktop sidebar and mobile bottom navigation. Overview totals use the loaded records and selected billing month.
- Finance shows “Collection for this billing period” at the top, with a billing-month selector, amounts invoiced/collected/outstanding and collection percentage. That collection card is removed from Home. Home retains the smaller financial summary cards. Totals represent allocations to invoices for the selected tuition month, not bank deposits received within that calendar month.
- Searchable applications/students, learner profile drawers, private report-card preview/download, intake details/marks, review notes, rejection reasons and approval. Opening a document preserves an unsaved review note.
- Applications excludes activated learners and retains drafts, applications awaiting review/payment, rejected applications and archived application records. Students shows activated learners only. Each view has its own empty state; approving an application alone does not move it into Students.
- Approval plus first invoice plus queued invoice notification in one database transaction. Approval moves the application to `pending_payment`; it does not activate it.
- Invoices derived from the stored, server-calculated enrollment fee. No client-supplied amount controls an invoice.
- Manual verified payment allocations with date, method, transaction reference, verification note and actor. Partial payments and early payment of already-issued future invoices are supported.
- Activation only after approval and full first-invoice settlement, enforced again by the database. Active status does not provision classes or portal access.
- Manual or optionally scheduled next-month invoice generation from the 25th and reminder queueing from the 3rd. Routine invoices run February–November; current arrangements suppress reminders. Repeating a run does not duplicate learner/month invoices or invoice/month reminders.
- Durable notification queue for invoice, payment receipt, reminder and activation messages. An admin can send one message at a time; optional scheduled dispatch processes bounded batches of never-attempted messages.
- Notifications separates waiting items from completed history and shows the learner, invoice, saved recipients, prepared date, attempts, balance snapshot and status explanation. Unwanted pending emails can be cancelled with a reason; previously attempted emails require provider-history review first. Cancellation preserves message/receipt snapshots and financial records.
- Branded invoice and per-payment receipt PDFs, available privately to admins and attached to their respective queued emails. Existing cream/logo email headers, purple accents and help footers have been adapted from the supplied legacy designs.
- Confirmation dialogs for approvals, rejection, verified payment recording, activation, billing/reminder runs and sending messages.
- Audit events for reviews, document-link requests, financial changes, activation, billing/reminder runs and notification-send attempts.
- Audit entries use plain-language action names, learner/invoice context, administrator email and Africa/Johannesburg date/time. Payment entries show amount, method, transaction reference and verification note. Search and activity filters apply to the loaded latest 200 events; technical record data is collapsed separately. Document requests and send attempts are described as requests/attempts, not proof of viewing/delivery.
- Other proposed dashboard sections display “Not available yet,” not sample numbers or false monitoring results.

The initial application-received email remains a separate existing flow. Its claim timestamps are captured by the email migration; it is not managed in the new tuition queue. Rejection currently records a reason but does not send an automatic rejection email; contact the family separately.

## Setup in Supabase and Vercel

Use a separate test Supabase project and Vercel Preview environment where possible. Review SQL before applying to an existing project and back up existing data. No live migration was applied by the coding task.

For an existing intake installation, run in order:

1. `supabase/migrations/20261025120000_learner_documents.sql` if that document migration is not already applied.
2. `supabase/migrations/20261026090000_enrollment_email_claims.sql`. This captures the owner's previously applied “04” email SQL. It is rerunnable and does not reset existing timestamps.
3. `supabase/migrations/20261026100000_admin_tuition.sql` for the new admin/finance schema.
4. `supabase/migrations/20261026110000_verified_document_finalization.sql` to verify Storage metadata, persist report-card records and safely recover legacy pending-review applications.
5. `supabase/migrations/20261026120000_monthly_invoice_numbers.sql` for tuition-month invoice numbers. This changes only newly issued numbers; existing numbers remain valid.
6. `supabase/migrations/20261026130000_notification_management.sql` for audited notification cancellation and richer notification/audit snapshots. Apply before deploying the new notification controls. It preserves existing messages and financial data.

For accounting, run [accounting-setup.sql](accounting-setup.sql) after these prerequisites, following the new test guide. First installation needs cleared test financial tables.

For a new project, `supabase/schema.sql` includes all of these definitions. Run the fresh schema instead of blindly applying both paths. The files are rerunnable definitions, not a migration-history tracker.

In Supabase Authentication, create/confirm the intended admin user using the dashboard's supported account workflow. Then add its **Auth user UUID**, not an email or invented UUID, using the SQL Editor:

```sql
insert into public.admin_users(user_id, enabled)
values ('REPLACE-WITH-AUTH-USER-UUID'::uuid, true)
on conflict(user_id) do update set enabled = true;
```

An ordinary Auth account cannot grant itself membership. To revoke access, set `enabled=false`; each subsequent admin request checks it. Normal public registration is not an admin onboarding mechanism. Configure Auth's password protections/rate limits; the application has no public admin signup endpoint. Password recovery must currently use your Supabase-supported account recovery workflow.

Server environment requirements:

| Setting                                       | Use                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`   | Auth validation, authorized database RPCs and private Storage signing   |
| `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` | Tuition notification provider, verified sender, reply-to                |
| `TUITION_BANK_DETAILS_CONFIRMED=true`         | Explicit release gate for sending invoice/reminder payment instructions |

Before setting the confirmation flag, verify `api/_lib/payment-details.ts` against the business's real bank account. This version uses those existing bank details for tuition emails; the old `PAYMENT_DEADLINE_DAYS` constant is unused. Do not enable the flag with unverified details. No `VITE_` credential variables are needed. Server settings must be assigned to the correct Vercel Preview/Production environment and the deployment restarted/rebuilt as needed.

Admin cookies are HttpOnly, SameSite=Strict, scoped to `/api/admin`, and Secure in production/Vercel deployments. Sessions last at most one hour; there is no refresh-token storage or refresh workflow. Sign out removes the browser cookie. Supabase validates access-token expiry and account membership is checked every request. MFA is not implemented by this UI yet; the prototype's “two-step sign-in required” label has not been carried over as a false claim.

`/admin` and admin APIs are non-indexable. API responses are non-cacheable. App analytics initialization/event tracking is skipped on `/admin`. Financial tables and mutation functions are unavailable to browser database roles; the server service key must remain private. The server checks request Origin before mutations. Audit records have no application edit/delete endpoint; database owners/service administrators still have database-level capabilities, so this is not tamper-proof archival storage.

## Manual end-to-end test

1. Run `npm ci`, then `npx vercel dev` with the configured project, or use its Preview deployment. Vite alone does not host the APIs.
2. Submit a synthetic enrollment with a dummy report card and controlled inboxes.
3. Sign in at `/admin`. An authenticated non-admin must be denied, and a signed-out API request must return 401.
4. Open Applications and a learner profile; type a review note, preview the report card, refresh its private link and download it. Close the viewer and check that the note remains. Inspect learner details and marks.
5. Select a start date today or later that belongs to the learner’s programme; confirm the displayed estimate. Approve. Verify status is awaiting payment, one invoice exists, and one invoice message is queued.
6. Open Finance and view/download the branded invoice PDF. Check the tuition-month number, period, due date, programme days and amount. Before payment, activation must be unavailable.
7. In Notifications, confirm and send the invoice message only to the authorized test inboxes. Inspect the branded email and attached PDF. “Sent” means provider acceptance, not inbox delivery. Automatic dispatch starts disabled; no bank collection is initiated.
8. Check a synthetic/test payment against its source before recording it. Choose a unique bank transaction ID or cash receipt number, not the student's recurring reference. Record a partial allocation; the remaining balance must stay visible and activation remain blocked.
9. Record the rest using another transaction ID. View each receipt in the invoice's payment history and send the two receipt messages. Each email and attached PDF must describe that individual payment and the balance at that event, not the entire account as universally settled.
10. Return to the learner record and activate. Confirm status and audit history, then send the queued activation email. No portal/classroom access should be claimed as created.
11. Test repeating a payment request, reusing a transaction reference, over-allocation, an invalid date, an unauthorized request and a document request without an admin session.
12. On/after the 25th, generate next month invoices twice. Verify one full invoice per eligible active learner/month, due on the 1st. On/after the 3rd, queue reminders twice and verify no duplicate notices. To test other clock dates without changing production functions, use the local database tests described below.
13. Test mobile cards and bottom navigation, desktop tables/sidebar, stacked dialog keyboard focus, PDF open/download, expired document links/sign-in and email-provider failure. Teaching and monitoring sections should show honest placeholders.
14. After activation, verify the learner appears only in Students and Applications shows its empty state if no other applications exist. Test More and logout at small portrait/landscape sizes: the menu must scroll to its final item, and all confirmation buttons must remain reachable.
15. In Notifications, inspect saved recipients and amounts, cancel a synthetic queued message with a reason, then check Completed history and Audit. Its invoice/payment/receipt PDF must remain available. An active send cannot be cancelled. A previous attempt requires checking provider history and confirming that review; accepted/skipped messages cannot be cancelled. Cancellation cannot recall a delivered message or automatically requeue the same event.

New payment methods are verified EFT or Cash only. They do not imply an integration with any of those services. No real charge is initiated by this admin workflow. Existing PDF PayFast checkout is separate.

## Safe notification retries

The outbox leases messages to avoid concurrent sends. Provider requests use a stable `tuition-<message UUID>` idempotency key. Email content is a snapshot, including the balance when prepared. Reminders for fully settled invoices are skipped at claim time. If a partial payment arrives after reminder preparation, inspect the current balance before sending that older notice; its snapshot is not dynamically rewritten.

A send timeout or an acknowledgment failure is ambiguous: investigate provider history before retrying. Leases expire after two minutes. Automatic dispatch does not retry previously attempted messages. Attempts older than 23 hours from the first attempt are blocked for manual investigation because provider idempotency windows are limited; do not clear timestamps blindly. “Sent” can also indicate a settled reminder was skipped, with the reason in `last_error`.

Financial operations remain committed when notification delivery fails. Failed notification status must not be used to repeat the financial action.

Cancellation removes a message from the waiting queue by marking it `cancelled`, recording the administrator, time and reason, and adding an audit event. It does not delete the row or its original payload, so per-payment receipt PDFs retain their historical balance. Repeating cancellation is idempotent, and the send claim refuses cancelled messages. The database locks the message to coordinate send/cancel requests; current send leases are protected for two minutes. Older sending/failed attempts require explicit provider-history review before cancellation. Completion of an old claim cannot overwrite a cancelled record. Cancelling an email does not undo approval, a payment, activation or the invoice, and the unique event key still prevents automatic recreation. There is currently no restore/requeue action.

The notification snapshot loads at most 200 records, prioritizing waiting items over completed history. A warning appears if the view is truncated; queue/history counts refer to loaded records. Administrator emails in Audit identify the account currently associated with the event's recorded actor UUID; they are not immutable historical copies of an email address.

## Invoice numbers and private documents

The monthly counter is global across learners. It resets for each tuition month and is assigned atomically inside the invoice insert transaction. `01` through `99` are followed by `100`; numbers are never truncated. Rerunning the migration preserves counters, and previously issued numbers are not renamed. Do not manually reset counters or rewrite issued numbers.

PDFs use the Viva logo, licensed embedded Plus Jakarta Sans fonts, business address, recipient details and invoice/payment records. Invoice PDFs show the immutable original charge and the balance at document preparation. An admin download therefore may show a newer balance than an earlier invoice email. Receipt PDFs retain the balance snapshot from that specific payment's queued receipt, even after later payments. A receipt's identifier includes the invoice and payment UUID to distinguish partial payments. Missing receipt snapshots fail clearly rather than inventing a balance.

`GET /api/admin/documents?kind=invoice|receipt|report&id=<UUID>` requires the same enabled admin session as the other admin endpoints. For an invoice use its UUID; for a receipt use the payment UUID; for a report use the application UUID. Responses are non-cacheable and document requests are audited. Financial PDFs are generated on the server without an external renderer; they are not placed in public Storage. Report previews use short-lived private signed URLs; the viewer supports refreshing expired links, opening separately and downloading through the authenticated API. Shared device users must still protect any files they download.

Invoice and receipt emails include real PDF attachments generated from the message's snapshot and original invoice/payment details. Provider retries reuse the message idempotency key and stable PDF issue date. Do not deploy a different template/font/bank configuration and blindly retry an ambiguous send: changed content can conflict with the provider's existing idempotency request. Investigate provider history first. Reminders and activation notices currently have no PDF attachment.

The Vercel configuration bundles the logo and private static font files into the document and message functions. Keep these assets and the font licence in Git. The business bank details continue to come from `api/_lib/payment-details.ts`, with the existing confirmation gate; the supplied legacy template is a design reference, not proof of current banking details. The address/support details are in `BRAND` in `api/_lib/tuition-document.ts` and should be checked by the owner before sending.

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

- Online tuition checkout/debit orders, payroll calculation, tax submissions, inventory and asset schedules are outside this release.
- Source financial records have no delete/edit workflow. Dedicated reversals, credit notes and void-import operations retain their history.
- Learner status controls do not provision teaching portals or automatically change external class access.
- API snapshots have explicit list limits; accounting reports aggregate the complete ledger, with bounded complete CSV exports. No family self-service portal or permanent private document links are provided.
- Accounting automation starts disabled. Complete the [accounting test guide](accounting-test-guide.md) and service checks before enabling unattended work.

## Parent access

The `/parent` release adds explicit guardian access controls inside learner profiles. Apply [parent-setup.sql](parent-setup.sql) and configure Auth emails as described in [parent-portal.md](parent-portal.md). Verify the guardian email, then enable access with a reason. Parents use an email link; siblings sharing that email intentionally use one family account. Disabling access blocks existing parent sessions without changing financial records.

## Synthetic test cleanup

Financial and audit records deliberately do not cascade away with an application. Use a disposable test project or a reviewed cleanup transaction in the SQL Editor: identify the exact synthetic application UUID, remove its tuition messages, payment allocations, invoices and audit entries, then remove the application and its private Storage object. Do not apply broad delete statements to production. Do not reset invoice or learner sequences to hide gaps.

## Missing report-card records on legacy applications

A deployed function can have the correct name/signature but a different body. The owner reported an application with a real private Storage object and no `learner_documents` row; inspection also found no expected insert in the deployed finalizer. The finalization repair migration updates the function without resetting applications, email timestamps or financial records.

The repaired function checks the private bucket, exact object path, known size, allowed MIME/extension and expected application metadata. It inserts a missing document record for a draft or pending-review application, verifies a matching existing record on retry, and rejects inconsistent metadata. It returns `document_id` as confirmation. The completion API now calls it for both statuses and checks that result before reporting success or attempting email. Apply this SQL migration before deploying that API change.

SQL Editor invocation of the repaired function does not send emails. For a legacy application, resolve its MIME from the stored object's metadata, call the function for that exact application, inspect its returned `document_id`, then refresh admin and retry approval. Do not fabricate document rows or remove the approval guard.
