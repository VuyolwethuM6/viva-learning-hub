# Implementation status and next work

Last reviewed: 26 October 2026. Base commit: `103c522` on branch `work`, with the application-received flow described below implemented in the current working tree.

This document describes the checked-in implementation. “Implemented” means code exists; it does not mean a production service was verified. Deployment settings, database contents, inbox delivery and real payment settlement cannot be established from Git alone.

## Evidence and current readiness

| Evidence | Result | Limit |
| --- | --- | --- |
| Dependency installation | `npm ci` succeeded with Node 24.19.0 / npm 11.9.0 | No repository runtime version pin exists |
| Existing tests | 22 tests passed across 4 files | External services are mocked; no live integration proof |
| Lint | No errors, 7 React Fast Refresh warnings | Shared UI exports still produce warnings |
| App TypeScript check | Passed after ES2022 library update | Both app and Node/API tsconfig checks passed |
| Production build | Passed; generated 19 routes and a noindex 404 | SSR warnings and a shutdown cancellation diagnostic remain |
| Vite startup | Five-step enrollment, submitting overlay, receipt and print output exercised in Chromium with mocked APIs | Desktop/mobile layout checked; this does not prove live API hosting or external services |
| Supabase email SQL | Owner reports applying the email claim/release SQL in Supabase | Live database was not inspected; SQL is not yet a repository migration |
| Earlier database submission | Previous documentation records a synthetic API/database test and cleanup | Historical report, not rerun here; did not validate the current full upload/email flow |
| Production enrollment, email and payments | Not independently verified in this review | No relevant service bindings were available in this cloud instance |

The environment supports frontend development and mocked API tests. It is not evidence that the full production enrollment or commerce workflow is ready.

## What happens now

### Enrollment

1. `/enroll` collects learner and guardian details, grade, tutoring mode, subjects, goals, marks, consent and report-card metadata.
2. `POST /api/enrollment` validates the payload and derives the fee from its own grade/subject rules. It does not trust a client price.
3. The `submit_enrollment` database function creates the application and linked records transactionally, reserves a sequential student number, and leaves the application in `draft` awaiting upload.
4. The API obtains a short-lived signed upload URL for the private `learner-documents` bucket. The browser uploads the file directly to Storage.
5. `POST /api/enrollment-complete` checks stored file metadata, calls `finalize_enrollment_document`, and returns `pending_review`. Verification checks metadata, not a malware scan or full file-content inspection.
6. Completion then attempts a family receipt and an admin alert through Resend. An email failure is logged without failing the saved enrollment.
7. The browser displays an “Application received!” receipt with the student number, application reference, learner, grade, subjects, format, server-returned fee and supplied email addresses. It confirms pending review, explains next steps, and offers print/contact/home actions. It does not offer tuition checkout or show bank details. Upload retries reuse the application and can request another signed URL through `/api/enrollment-upload-url`.
8. Submission shows a blurred, noninteractive background and a focused live status overlay for saving, uploading and verification. JSON requests time out after 60 seconds; upload requests after 90 seconds. Duplicate submissions are guarded. On a known pending application, details are frozen and only its secure-upload/completion flow is retried. Both normal and retry completion must return matching student/application references and `pending_review`.
9. A lost or unconfirmed initial creation response blocks blind resubmission and directs the family to support. There is no server idempotency key or cross-refresh receipt/retry persistence yet. Navigation warnings reduce accidental loss but are browser-dependent. The confirmation can be printed; it is not a portal or a durable browser record.

Report-card formats are PDF, JPEG and PNG, up to 10 MiB. Storage paths are `student-number/application-number/report-card.ext`. The checked-in generator produces student numbers in `VT-YYYY-NNNNNN` format; fixtures using `VTS-…` are examples, not the SQL generator format.

### Enrollment email behavior

Implementation: `api/_lib/enrollment-emails.ts`, `api/_lib/email.ts` and the completion route.

- The family receipt goes to the deduplicated, lowercased guardian and learner addresses; the admin alert goes to `ADMIN_EMAIL`.
- Templates include the student number, fee and pending-review next steps. Receipt HTML and plain text no longer request payment, publish bank details, promise deletion after 30 days, or promise Google Classroom enrollment. `api/_lib/payment-details.ts` remains an unused legacy configuration file for later review; it is not an active payment instruction source in this flow.
- The admin message includes the private report-card path, not a public download link.
- `claim_enrollment_email` atomically claims each receipt/admin send. `release_enrollment_email` resets a claim following a reported send failure. A later completion request can retry; there is no scheduled retry worker.
- The owner supplied SQL adding `receipt_emailed_at`, `admin_notified_at`, `email_last_error`, and both service-role-only functions, and reports applying it in Supabase.
- That SQL is still absent from `supabase/schema.sql` and the migration directory. Following only the current repository SQL does not reproduce the email prerequisite.

This is concurrent duplicate suppression, not guaranteed exactly-once delivery. Claims are marked before the provider accepts a message: a process crash can strand a claim, and an ambiguous provider/network failure can lead to a duplicate after release and retry. Provider acceptance also does not establish inbox delivery.

### Study materials and PDF purchases

- The catalogue has six Grade 12 Mathematics PDFs: four free and two paid. Topic search uses titles, descriptions and keywords. Explicit filters are free/paid, grade, subject and exam sitting; there is no separate resource-type filter.
- Free files live in `public/materials`; Vercel rewrites `/download/*` to `/materials/*` and adds attachment headers.
- Paid files live in `private/materials`. Vite denies that directory; Vercel includes the files in the notification function bundle.
- `POST /api/payfast/checkout` signs a server-priced checkout for Analytical Geometry Practice (R299) or Finance Practice Questions (R399).
- `POST /api/payfast/notify` checks the product, merchant, amount, signature, PayFast validation response and `COMPLETE` status. It emails the purchased PDF to the customer and an alert/attachment to the admin.
- Checkout and validation URLs are hardcoded to live PayFast. No documented runtime sandbox switch exists. Do not treat dummy merchant settings as sandbox configuration.
- Delivery duplicate tracking is an in-memory `Set`, lost on restart and unshared between instances. No durable purchase ledger is written by this handler. A customer send followed by an admin-send failure can also duplicate customer delivery on retry.

This PDF commerce flow is separate from tutoring enrollment payments. It does not update an enrollment's payment records or status.

### Enquiries, analytics and public pages

- Contact and subject-request APIs validate inputs and send admin emails through Resend; they are not a CRM or ticketing system.
- Public pages cover services, pricing, subjects, tutors, testimonials, privacy and terms. These pages describe offerings; they do not implement lesson scheduling or learner progress tracking.
- Analytics loads when `VITE_GA_MEASUREMENT_ID` is set. Page, link, download and contact-success events are implemented. The application does not provide an analytics consent/preferences UI or gate initialization on such a choice.
- Production builds prerender route HTML and metadata. Vercel route rewrites are defined in `vercel.json`.

## Database foundations versus completed features

The SQL defines applications, learners, guardians, selected subjects, learner documents, payments, portal users and tutor assignments. It enables RLS, removes browser table privileges and grants server service-role access. A private Storage bucket and enrollment functions are provided.

The status enum contains `draft`, `pending_review`, `pending_payment`, `approved`, `rejected`, `active` and `archived`. The implemented intake flow uses draft and pending review. The other enum values and tables are foundations, not proof of implemented transitions, authentication, dashboard or activation logic.

## Known inconsistencies and missing work

| Priority | Gap | Work needed |
| --- | --- | --- |
| 1 | Email database changes exist outside Git | Save the owner's applied SQL as a reviewed migration and include equivalent definitions in the fresh schema; compare against deployed definitions before running changes |
| 1 | Full integration evidence is missing | Run the synthetic enrollment/upload/completion/email checks in the setup guide, recording outcomes and cleanup |
| 1 | Public pricing differs from enrollment pricing | Decide the business model and align the pricing page, enrollment UI/API, README and email expectations |
| 1 | Tuition payments are deliberately deferred | Confirm bank details, timing, review/approval rules and activation policy before adding payment instructions or checkout |
| 2 | Initial submission recovery across refresh is absent | Add server idempotency and an appropriately protected recovery/receipt mechanism before promising retry across network loss or refresh |
| 2 | Enrollment email claims can become stranded | Define recovery and retry policy; consider durable delivery state and provider idempotency where supported |
| 2 | PDF delivery lacks durable deduplication | Add persistent payment/delivery records, safe retries and coverage for repeated notifications and partial email failures |
| 2 | Admin review is absent | Add authenticated review, protected document access, audited approve/reject transitions and notifications |
| 2 | Enrollment payment reconciliation is absent | Link verified tutoring payments or manual EFT decisions to applications; do not reuse PDF payment success as enrollment approval |
| 3 | Portals and assignment workflows are absent | Implement authentication, role authorization, learner/guardian/tutor/admin views and tutor assignment after workflow rules are agreed |
| 3 | Configuration and maintenance gaps | Pin supported Node/package tools, document Vercel tooling, review privacy/analytics behavior, remove obsolete frontend PayFast variable reads, and address remaining build/lint warnings |

These priorities are a proposed sequence, not a delivery schedule or approved product policy.

### Pricing decision required

| Surface | Current code |
| --- | --- |
| Public pricing page | Single R150/session; Starter R500/4 sessions; Standard R850/8 sessions; Premium R1,200/12 sessions |
| Enrollment Grades 8–9 | R350 for 1 subject; R600 for 2 |
| Enrollment Grades 10–12 | R500 for 1 subject; R800 for 2; R1,100 for 3 |
| Enrollment Matric Rewrite | R550 for 1 subject; R900 for 2; R1,200 for 3 |

The enrollment frontend and API currently agree with each other. The public session packages do not map to these subject-based tiers. Accounting, Geography and IT have public subject pages but are not senior enrollment selections; clarify whether they are enquiry-only offerings.

## Documentation and change discipline

Use [the setup guide](supabase-setup.md) for configuration and verification, and [the development guide](development.md) for commands and architecture. When a feature changes, update this status document alongside it. Record live verification separately with date, target environment, result and cleanup, excluding personal data and secrets. Never change “implemented” to “verified live” based only on mocked tests or a successful deployment build.
