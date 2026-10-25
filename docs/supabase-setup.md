# Supabase setup and enrollment test

## Before starting

- Use the project URL already supplied for this setup.
- Never send the `service_role` / secret API key, database password, or `.env.local` contents in chat.
- The service role key is a server secret. It must never use a `VITE_` prefix or be placed in browser code.
- `.env.local` is git-ignored by this repository.
- The enrollment implementation uploads the report card to private Supabase Storage and creates a private per-learner folder. Use synthetic test data and dummy documents during testing.
- Application receipt emails, payment, admin review, and portal provisioning are not yet connected.

## 1. Apply the database schema / migration

If the earlier `schema.sql` was already run, apply only the new migration `supabase/migrations/20261025120000_learner_documents.sql`. It adds the learner number, private document metadata table, signed-upload path, and document-finalization functions.

If setting up a brand-new project, run the full `supabase/schema.sql` instead. Do not run both at once unless needed; both are designed to be safe to re-run.

The local Supabase CLI and Docker are not installed, so use the Supabase Dashboard SQL Editor:

1. Sign in to Supabase and open the project.
2. Open **SQL Editor** and create a new query.
3. For an existing installation, open `supabase/migrations/20261025120000_learner_documents.sql`, copy its full contents, and paste them into the SQL Editor. For a new project, use `supabase/schema.sql`.
4. Run the query and confirm it completes without an error.

The schema creates the intake tables, a private document bucket, and the `submit_enrollment` database function. It enables RLS and removes the earlier permissive prototype policies. Browser roles receive no table access; only the server-side service role can call the enrollment write function.

The script is designed to be re-runnable for this initial setup. If the SQL Editor reports an error, stop and share only the error text—not keys, passwords, or connection strings.

## 2. Configure the local server secret

In Supabase, find the project URL and service-role secret under the project API settings. Keep the dashboard open locally; do not copy the secret into chat.

From the repository root, run the secure Windows dialog:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\scripts\configure-supabase-dialog.ps1
```

The dialog is prefilled with the project URL used for this setup and masks the service-role key. It updates only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, preserving other environment settings.

Check only that `.env.local` is ignored by Git:

```powershell
git check-ignore .env.local
```

Do not print or paste the file contents.

## 3. Run the app with its API routes

The standard `npm run dev` command starts Vite and does not execute the `api/` serverless functions. Use Vercel's local development server instead:

```powershell
npx vercel dev
```

If prompted, sign in to Vercel and link this repository to the intended Vercel project. Do not enable or paste secrets into any public/browser settings. The server-side variables must be available to the local Vercel process.

Then open the local URL printed by Vercel and visit `/enroll`. The form uses the API routes for submission and uploads the report card directly to a short-lived signed URL in the private bucket.

## 4. Submit a controlled test

Use entirely synthetic learner and guardian names, emails, school, and marks. Upload a dummy PDF or image only.

On successful submission, the page should show a student number, application reference, and server-calculated monthly fee. The API should return HTTP `201`, upload the report card, and finalize the application as `pending_review`.

In Supabase **Table Editor**, verify that one matching application exists in:

- `applications`
- `learners`
- `guardians`
- `application_subjects`
- `learner_documents`

The database function creates the application and linked people/subjects and reserves a student number in one transaction. The report card is saved at `student-number/application-number/report-card.ext` in the private `learner-documents` bucket.

## 5. Remove the test data

After verifying a test application, remove it from Supabase SQL Editor with:

```sql
delete from public.applications
where application_number = 'VT-TEST-REPLACE-ME';
```

The learner, guardian, subject, and document metadata rows are deleted by foreign-key cascade. Remove the corresponding file from the private Storage bucket too. Do not run this against a real application.

## Troubleshooting

- **503 Supabase not configured:** confirm the settings were saved in `.env.local`, then restart `vercel dev`.
- **Database function/table not found:** rerun the current `supabase/schema.sql` and check for SQL Editor errors.
- **401/403 from Supabase:** confirm the local server has the correct service-role secret and it was not entered with extra whitespace. Do not share the key while troubleshooting.
- **CORS or HTML response from `/api/enrollment`:** ensure the app was started with `npx vercel dev`, not just `npm run dev`.
- **Application save fails:** share the displayed message and sanitized local terminal error, redacting credentials and personal data.

## Local Supabase option

Local Supabase is not available on this machine yet because Docker and the Supabase CLI are absent. To use it later, install Docker Desktop, start it, install the Supabase CLI, run `supabase start`, and apply this schema to the local instance. No local secrets should be pasted into chat.

## Previous cloud test

An earlier API-to-database-only test returned HTTP `201`, verified the application, learner, guardian, and subject rows and the R800 server-calculated fee, then removed the synthetic rows. That earlier test did not upload a document or exercise the browser. Retest with this migration and the current Vercel dev server before real use.
