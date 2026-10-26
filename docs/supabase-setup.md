# Service setup and integration verification

Last reviewed: 26 October 2026. Read [implementation status](implementation-status.md) before treating any service as production-verified. This guide covers the current intake/upload/email flow and separates it from PDF commerce.

## Configuration boundaries

Inspect existing settings and binding presence before requesting credentials. Never paste secrets in chat, commit `.env.local`, or print its contents. Do not use `VITE_` for server credentials: Vite exposes those variables to browser bundles. Use secure deployment/environment settings for hosted services. Local `.env.local` is Git-ignored.

`.env.example` documents variable names with placeholders; it is not working configuration. If creating `.env.local`, preserve any existing file, replace only the settings needed, and omit unused placeholders. A fake analytics ID can trigger unintended initialization.

| Variable | Required for | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | Enrollment, upload retry and completion | Project HTTPS URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server database and Storage access | Server-only secret; never browser code |
| `RESEND_API_KEY` | Enrollment receipts/admin alerts, enquiries and PDF emails | Secret used at `api.resend.com` |
| `EMAIL_FROM` | All email paths | Sender authorized by the configured Resend account/domain |
| `ADMIN_EMAIL` | All email paths | Intended operational inbox; receipt reply-to also uses it |
| `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY` | Paid PDF checkout/verification | Server-side merchant settings |
| `PAYFAST_PASSPHRASE` | PayFast signatures when configured on the account | Must match the merchant's configuration |
| `PUBLIC_SITE_URL` | Paid PDF checkout | Actual public origin, used for return/cancel URLs |
| `PAYFAST_NOTIFY_URL` | Optional callback override | Defaults to `PUBLIC_SITE_URL` plus `/api/payfast/notify` |
| `VITE_GA_MEASUREMENT_ID` | Optional frontend analytics | Build-time public GA ID; omit to disable initialization |
| `API_DEBUG` | Optional enrollment diagnostics | `1` enables debug logging; also enabled by `VERCEL_ENV=development` |

`VERCEL_ENV` is runtime context, not an application credential to invent. Legacy `VITE_PAYFAST_MERCHANT_ID/KEY` reads remain in a home-page button; they are not required by the server checkout. Do not add browser merchant settings to satisfy those obsolete reads.

Required external destinations depend on the workflow: the selected Supabase project hostname, `api.resend.com`, and `www.payfast.co.za`. Optional analytics uses Google services. Package installation uses the configured npm registry; Git uses the platform HTTPS proxy. Add only the actual required hosts to restricted network settings, preserving existing entries. Configure proxy secrets through supported environment settings; never copy secret values into scripts.

## Database setup and drift

For a new project, review and apply `supabase/schema.sql` in the Supabase SQL Editor. For an existing project, inspect its schema and migration history before selecting changes. `supabase/migrations/20261025120000_learner_documents.sql` upgrades the earlier intake schema for student numbers, report-card metadata and finalization. It is not a standalone empty-database bootstrap.

The scripts contain rerunnable guards, but do not assume replaying SQL replaces migration planning or proves compatibility with arbitrary deployed changes. Do not run both paths blindly. Back up data and review effects before changes to a live database.

### Email SQL already applied by the owner

The owner reports applying an additional script labeled “04” directly in Supabase. It adds these columns to `applications`:

- `receipt_emailed_at timestamptz`
- `admin_notified_at timestamptz`
- `email_last_error text`

It also creates:

| Function | Contract used by the API |
| --- | --- |
| `claim_enrollment_email(p_application_id uuid, p_kind text)` → boolean | For `receipt` or `admin`, atomically sets the corresponding timestamp only when it is null and status is `pending_review`; returns whether one row was claimed |
| `release_enrollment_email(p_application_id uuid, p_kind text, p_error text)` → void | Clears the corresponding timestamp and stores up to 300 characters of error text so a later completion call can retry |

Both are `SECURITY DEFINER` functions with an empty search path and schema-qualified tables. Execute privileges are revoked from public/browser roles and granted to `service_role`.

**Repository gap:** this additional SQL is not yet included in the fresh schema or migrations. The owner-provided SQL matches the application call signatures, but its deployed definition and permissions were not independently inspected here. A new database built only from repository SQL is incomplete for enrollment email sending. Capture the applied script in a reviewed migration and synchronize the fresh schema before claiming reproducible full setup. This documentation update does not apply or create migrations.

### Read-only database verification

In the intended Supabase project, inspect metadata without exposing keys or learner data:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'applications'
  and column_name in ('receipt_emailed_at', 'admin_notified_at', 'email_last_error');

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result, p.prosecdef,
       p.proconfig, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('submit_enrollment', 'finalize_enrollment_document',
                   'claim_enrollment_email', 'release_enrollment_email');
```

Compare definitions and grants with the reviewed SQL; name presence alone is insufficient. Also verify RLS/browser privileges, the private `learner-documents` bucket and file limits. Do not manually call claim functions on real applications to test their existence: doing so changes delivery state.

## Start the frontend and API runtime

From the repository root:

```bash
npm ci
npx vercel dev
```

Vercel CLI is not pinned or installed by the npm manifest. Account authentication and linking to the intended project may be needed. Do not assume the project is linked or that local secrets exist because they were configured on another machine. The Windows helper scripts under `scripts/configure-supabase*.ps1` are optional local tools, not Linux cloud prerequisites.

`npm run dev` starts Vite only. Use it for frontend work, not API integration checks. Vercel must provide the server variables above. For hosted checks, use the intended deployment and its environment-specific bindings.

## Controlled enrollment verification

Use synthetic people and dummy documents only. Arrange authorized test inboxes before triggering email. Record the environment, date, results and cleanup without including secret values, signed URLs or learner data in reports.

1. Submit `/enroll` with a valid grade/subject combination, dummy PDF/JPEG/PNG up to 10 MiB, marks, goals and required consent.
2. Confirm `/api/enrollment` returns `201`, application/student identifiers, the server-calculated monthly fee and a signed upload URL. A `201` at this stage means a draft was created, not that the upload/email workflow is complete.
3. Confirm the browser's direct Storage upload succeeds and `/api/enrollment-complete` returns `200` with `pending_review`.
4. Verify the linked application, learner, guardian, subjects and learner-document metadata rows and the private stored object. Ensure stored size/type match expectations.
5. Verify the family receipt and admin alert reach the intended inboxes. Check references, fee, pending-review next steps and the private report-card path in the admin alert. The receipt must not ask for tuition payment, promise automatic deletion, or promise portal/Classroom activation while those workflows are deferred. A successful completion response does not prove email delivery because errors are intentionally nonfatal.
6. Retry completion and confirm already-claimed messages are suppressed. In a controlled test environment, test reported provider failure and subsequent retry. Do not treat this as proof of exactly-once delivery under crashes/timeouts.
7. Test invalid payloads and upload retry behavior without creating duplicate applications. The UI freezes pending application details and validates matching completion references on retries. Lost initial creation responses require support rather than blind resubmission. Reload recovery is not implemented: the UI keeps pending upload information and receipt details in component state only. Test missing/expired signed URLs explicitly.

Do not alter claim timestamps on real records as a routine retry technique. Investigate logs/provider history first to avoid sending duplicates.

## PDF payment verification is a separate procedure

The code uses live PayFast endpoints. Establish an approved payment test procedure before running transactions; do not initiate a real charge merely to check setup. Any sandbox adaptation is a code/configuration task, not an existing environment toggle.

Verify server-calculated prices, signed checkout, return/cancel navigation, invalid notification rejection, valid notification handling and customer/admin PDF attachments. The return page alone is not payment verification. Include repeated callbacks, process restarts and partial email failures in validation: the current in-memory delivery set does not provide durable idempotency. None of these checks prove tutoring enrollment reconciliation or activation.

For enquiries, test contact and subject-request delivery separately with an authorized inbox. Their runtime body parsing differs from the shared enrollment helper and needs validation in the actual Vercel runtime.

## Cleanup

After verification, identify the exact synthetic application UUID and Storage path. Remove only its object and application. Application deletion cascades to linked learner, guardian, subject and document metadata records, but not automatically to the Storage object.

```sql
-- Replace with the UUID recorded for the synthetic test only.
delete from public.applications
where id = '00000000-0000-0000-0000-000000000000'::uuid;
```

Do not reset student-number sequences to hide gaps. Remove synthetic inbox messages as appropriate and confirm no dummy records/files remain. Real transactions require their own payment-provider accounting/refund procedure.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| HTML or 404 from `/api/*` | Use the Vercel runtime; Vite does not host these endpoints |
| `503` Supabase/email configuration | Binding presence in the actual server environment; restart local runtime after changes |
| Supabase `401/403` | Correct project, server-role binding and permissions; never share the key |
| Missing RPC/table | Applied definitions and project selection; check the email SQL drift above |
| Draft exists but upload fails | Signed URL expiry, exact file metadata/path and Storage response; use the upload retry flow |
| Completion succeeds but no email | Resend settings/provider history, claim RPCs, timestamps and sanitized server errors |
| PayFast checkout `503` | Public origin and server merchant configuration |
| PDF notification rejected or delivery fails | Merchant/amount/signature/validation result, bundled private file and email configuration |

Historical notes about a previously configured Windows machine and an earlier database-only synthetic submission do not establish current cloud credentials or full live readiness. No fresh end-to-end production verification has been performed for the application-received changes. Chromium smoke checks used mocked APIs; live Supabase/Resend verification remains required.
