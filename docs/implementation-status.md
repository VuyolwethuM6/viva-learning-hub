# Implementation status

## Completed

- Created a durable Supabase schema for applications, learners, guardians, subjects, payment records, portal users, and tutor assignments.
- Added an atomic enrollment database function to prevent partially saved applications.
- Locked down browser access with RLS and service-role-only enrollment writes.
- Added an enrollment API route at [../api/enrollment.ts](../api/enrollment.ts) that validates the package and calculates the fee server-side.
- Connected the enrollment form to the backend submission route and private Storage upload.
- Added a sequential student number separate from the application reference.
- Created a private learner folder path in Supabase Storage: `student-number/application-number/report-card.ext`.
- Added [../api/enrollment-complete.ts](../api/enrollment-complete.ts) to verify the uploaded object and move the application to review.
- Added [../api/enrollment-upload-url.ts](../api/enrollment-upload-url.ts) to support secure upload retries.
- Added the existing-project migration [../supabase/migrations/20261025120000_learner_documents.sql](../supabase/migrations/20261025120000_learner_documents.sql).
- Added the required environment variables to [.env.example](../.env.example) for Supabase.
- Added [supabase-setup.md](./supabase-setup.md) with cloud setup and testing instructions.
- Added [configure-supabase.ps1](../scripts/configure-supabase.ps1) to set local secrets without exposing them in chat or console output.
- Configured the local Supabase service secret through the masked Windows dialog.
- Passed a live synthetic cloud submission test; verified the application, learner, guardian, and subject rows and the server-calculated R800 fee, then removed the synthetic records.

## Remaining work

- Apply the new learner/document migration in Supabase before testing this updated flow.
- Verify the current browser-to-API-to-private-Storage flow with synthetic data.
- Add the application-received email after confirming the full submission and upload path.
- Create the admin review dashboard.
- Add payment verification for PayFast and the manual EFT/Capitec reconciliation flow after email.
- Add portal access and assignment logic for learners, guardians, tutors, and admins.
- Add Resend notifications and confirmation emails.
- Confirm final operational rules for approval, payment timing, and enrollment activation.

## Current state

The earlier API-to-database test passed. The current document upload, browser submission, email, and payment flow still need validation/implementation. Do not collect payments until the later payment work is complete.
