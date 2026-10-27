# Parent portal: setup, authentication and testing

Updated 27 October 2026. The portal is at `/parent`. It takes its orange learner
cards, purple navigation, child selector and document viewer from the supplied
parent prototype, adapted for desktop and small mobile screens.

## What parents can do

- Choose between reviewed learners linked to their guardian email.
- See learner status, subjects, programme days, start date and current tuition.
- See complete family outstanding/overdue balances and available family credit.
- Read learner invoices, physical payment receipts, credit notes and refunds.
- Preview/download private branded PDFs and a family account statement.
- See confirmed EFT instructions, cash guidance and contact Viva.

Finance totals cover the complete eligible account. History lists show the most
recent 500 records of each kind and flag truncation. Each learner's home balance
is calculated from their complete invoice history. Statements refuse more than
2,000 net movements rather than silently dropping older activity. Available
credit is separate from unpaid invoices until staff allocate it.

The teaching-foundation release connects confirmed session attendance and upcoming
classes after its separate migration; see teaching-test-guide.md. Academic results
and assessment publishing remain future work. Programme days are separate from
the actual class timetable and are not themselves an attendance record. The portal cannot record a payment, change an invoice,
initiate a transfer, or change learner/guardian details. Contact requests use the
family's own email/phone application.

## Simple authentication

Parents enter **only their guardian email**, then tap **Open my Viva portal**
in the email. There is no password, PIN, code field or account-creation form.
Returning parents with a valid session go directly to their family account.

Enrollment does not need an extra email challenge. Siblings should share their
guardian email; this intentionally links them to one family account. Parent
account emails are unique and normalized for case/surrounding spaces. Learner
emails and guardian emails are not globally unique across applications. Repeat
applications are a separate intake issue; duplicate guardian email is not a
reason to reject a learner. Provider-specific aliases/dots are not merged.

Staff must review the enrollment and verify the correct guardian contact before
enabling portal access. The parent's first successful email link verifies inbox
ownership through Supabase Auth, and binds that verified Auth identity to the
enabled parent account. New reviewed siblings with the same guardian email then
appear on that account. An unreviewed intake alone cannot grant access.

Access checks use the server-verified Auth user and the enabled database account
on every request. Changing a URL, application UUID, browser state or client email
cannot authorize another family. The database checks the current confirmed Auth
email too. Guardian-email changes are not a self-service portal action. At the access
layer, a changed email removes the learner from the old family's scope; access
for a new email needs staff review/enablement. Financial history is not
automatically transferred between families: billed guardian changes require
reviewed financial-account handling before any database edits.

Access and refresh tokens live in separate **HttpOnly, Secure, SameSite=Strict**
cookies scoped to `/api/parent`, separate from admin cookies. Access lasts at
most an hour; the refresh cookie lasts seven days and rotates with Supabase's
refresh flow. Browser JavaScript/localStorage never receives those tokens.
Supabase session restrictions can require earlier sign-in. Sign out clears both
parent cookies and attempts provider logout for that session. Downloaded PDFs
remain on the user's device after logout.

Single-use sign-in links expire according to Supabase's email OTP expiry setting.
Configure 15 minutes below. Used/expired links return to a plain email sign-in
screen. Email requests have a durable 60-second resend delay and bounded email/IP
attempts per 15 minutes; public responses do not reveal account existence.
Supabase also applies its own Auth limits. Tokens/link hashes are never logged
by the application. Provider/access logs must still be handled as private data.
Parent routes are excluded from application analytics and marked noindex/no-store.

## Setup: one migration, then Auth email settings

1. The accounting release must already be installed and working. Run the entire
   [parent-setup.sql](parent-setup.sql) in Supabase SQL Editor as one query. It
   wraps `20261027150000_parent_portal.sql` in a transaction, adds no financial
   entries and preserves all existing records. Reruns preserve parent bindings.
   Fresh projects can use the complete `supabase/schema.sql` instead.
2. Deploy the parent-portal code on the branch you intend to test before trying sign-in links. The earlier SQL-download commit alone does not contain the portal UI/API. Keep the existing Supabase server environment settings. Configure
   `PARENT_PORTAL_URL` as the deployment origin hosting this portal, for example
   `https://your-work-preview.vercel.app`. It defaults to `PUBLIC_SITE_URL`.
   This separate setting lets you test the work deployment without changing
   PayFast/public-site URLs. Redeploy after changing it.
3. In **Supabase Authentication → URL Configuration**, add the exact allowed
   redirect URL for that deployment:
   `https://your-deployment/api/parent?action=callback`.
   Use the corresponding production URL when releasing there. Do not configure
   unrelated wildcard destinations. The server ignores client-supplied redirects.
4. Ensure the **Email** provider is enabled and **Allow new users to sign up**
   is enabled so the first emailed sign-in can create the parent's Auth account.
   There is no parent signup form; family access still requires an enabled,
   reviewed guardian account. Enable **Confirm email** and set the **Email OTP expiration**
   to **900 seconds** (15 minutes). Supabase uses this setting for email links
   too; parents never enter an OTP in this implementation.
5. Configure a production SMTP sender in Supabase Auth using your verified
   sending domain/provider. For the existing Resend provider, use host
   `smtp.resend.com`, port `465`, username `resend` and the Resend API key as the
   SMTP password. Choose an email address on your verified domain and sender
   name `Viva Tutorials`. Enter credentials privately in Supabase. Existing `RESEND_API_KEY` application emails do
   **not** automatically configure Supabase Auth emails. Supabase's default mail
   service has recipient/rate restrictions and is not the family-facing sender.
6. Under **Authentication → Email Templates**, set the subject to
   `Open your Viva Tutorials portal`, and paste
   [parent-signin-email.html](parent-signin-email.html) into **Magic Link** and
   **Confirm signup**. Both templates need the supplied link target:

   ```html
   <a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}">Open my Viva portal</a>
   ```

   `.RedirectTo` is the configured `/api/parent?action=callback` URL sent by the
   server. Keep `token_hash` as supplied; do not substitute `.Token` or use the
   old prototype PIN. Disable email click tracking/link rewriting for Auth mail.
   Use these parent-specific templates with the portal request, not a generic
   dashboard-created signup invite with a different redirect URL.
7. Deploy this code before testing emailed links. `/api/parent` rewrites to the
   existing session function with an isolated parent handler, preserving the
   current 12 deployed API function count. No extra hosting function plan is
   required. `/parent` rewrites to the React entry and is not publicly prerendered.

No frontend Supabase key or additional parent-auth secret is required. All Auth
and family authorization calls run on the server. No real emails were sent by
the implementation tests.

### If SQL Editor reports “unterminated dollar-quoted string”

The query was cut off inside a function, or only part of the editor was selected
when Run was pressed. For example, a query ending after `Learner not found.`
stops inside `admin_parent_access`; its closing `end $$;` is further down.

Download the complete `parent-setup.sql` file rather than copying a shortened
preview. Open it in a text editor, select all, and copy it into a fresh Supabase
SQL Editor query. Confirm that the final line is `commit;`. Clear any highlighted
selection before choosing Run so SQL Editor executes the whole script. Rerunning
the complete upgrade preserves existing parent bindings and financial records.

## Enable a family

1. Approve a synthetic learner application through the existing review workflow.
2. Open their Applications/Students profile and find **Parent portal access**.
3. Check the guardian email against the family's confirmed contact details.
4. Choose **Enable parent access**, give the verification reason and confirm.
5. Share the `/parent` page address with that guardian through your normal
   contact process. Enabling access itself does not send an invitation email.
6. The guardian enters their email and taps the button in the email they receive.

An owner or bookkeeper can enable/disable access; viewers can read its status.
Disabling access blocks the whole guardian account, including existing sessions,
without altering enrollment, payments or balances. Staff changes appear in Audit.
Suspended and withdrawn learner records can remain visible for existing balances;
parent sign-in does not reactivate a learner or grant teaching access.

Verify a grant without exposing tokens:

```sql
select email, enabled, user_id is not null as has_signed_in,
       updated_at, last_signed_in_at
from public.parent_accounts
order by updated_at desc;
```

## Test checklist

1. Use a controlled guardian inbox and two reviewed synthetic children with that
   exact email. Keep another family on a different inbox. Enable the first family.
2. Open `/parent` in a private browser. It should ask for email only. Request a
   link, check actual inbox delivery, tap **Open my Viva portal**, and confirm
   the link returns to the intended work deployment.
3. Choose between the two children. Confirm names, subjects, programme days,
   lifecycle status and learner invoice balance match the admin records. The
   other family and unreviewed applications must not appear.
4. In Finances, check family totals, each child's invoice history, available credit
   and receipts/adjustments. Open/download an invoice, receipt, credit note, refund
   and family statement. Confirm credits/reversals match the accounting records.
5. Record a verified test payment in admin and refresh the parent account. The
   resulting balance/receipt must update. Attempting parent access to another
   family's document UUID or a financial-report/admin endpoint must fail.
6. If banking details are not confirmed, show contact guidance. After staff
   verify them and set `TUITION_BANK_DETAILS_CONFIRMED=true`, check the EFT
   details/reference. There is no online Pay button or self-reported settlement.
7. Reload/reopen the portal to check the retained session. Test another browser
   with a fresh email link. Never share/forward a sign-in link. Use an expired
   or already used link: the page must offer email sign-in again.
8. Sign out and verify financial reads/downloads now require sign-in. Signing out
   of parent access should not sign an admin out of their separate admin session.
9. Disable parent access while their session is open. Refresh the portal and try
   a document again: access must be denied. Re-enable only after staff review.
10. At 320px/390px and small landscape widths, check child switching, all three
    sections, readable finance cards, PDF download and reachable logout buttons.

Local checks passed **140 tests across 17 files**, both TypeScript targets,
lint (zero errors; seven existing warnings) and the production build. The
Chromium/WebKit checks also passed the email-link/sibling/finance/document and
mobile/logout flows described above.

The automated tests use real PostgreSQL functions in PGlite with synthetic
Auth/Storage records, and mocked provider boundaries for API tests. They do not
verify your live SMTP delivery, Auth redirect allowlist or deployed private PDFs;
those require the controlled-inbox checks above.

Future work: attendance/assessment publishing, parent payment-evidence uploads,
secure second-guardian invitations, and reviewed guardian-email change tools.
