# System Health and Settings: setup and testing

Updated 28 October 2026, South African time. The modules use real database
records, server configuration checks and provider responses. This release needs
one new SQL migration after the working accounting, parent, teaching and academic
setup. It preserves existing records and current automation settings.

## What the admin can oversee

**System Health** checks database access, the core module interfaces, private
storage bucket configuration, available PDF assets, email sign-in configuration,
financial reconciliation, notification failures, enrollment completion, file
records and scheduled accounting observations. It shows when the checks ran.
Operational cards link to application review, unfinished sessions and marks in
review. **Record issues** identifies affected application references and file
names; **Run history** separates scheduled runs, manual runs and owner email tests.

A successful check means exactly what its description says. File checks compare
metadata with Storage object records; they do not download every file. Auth
readiness does not verify SMTP delivery or callback URLs. Resend acceptance does
not establish inbox delivery. Backups, retention, continuous uptime and recovery
success are not automatically monitored. A missing database check is reported as
unavailable, never as a healthy zero count.

**Settings** has five focused views:

| View | Controls and information |
| --- | --- |
| Overview | Current operating policies, banking beneficiary, deployment readiness and enabled portal-access counts. |
| Automation | Enable/pause scheduled accounting and automatic dispatch using the existing accounting engine; inspect run history; open Finance Controls. |
| Calendar | Add or remove current/future teaching closures; view past closures and the stored grade programmes. |
| Staff access | Grant, disable or change existing verified staff accounts and their finance roles. |
| Backups | Record what an owner actually checked, with its date and notes; view retained review history. |

All enabled admins may read health and general settings. Only enabled finance
**owners** may write settings or request an email service test. Staff identity
lists and candidate emails are visible only to owners. Finance viewers still
have the application's existing admin access to non-financial administration;
“finance viewer” is not a universal read-only admin role.

## 1. Download the complete setup

Sign into GitHub with access to the private repository and open:

https://github.com/VuyolwethuM6/viva-learning-hub/blob/work/docs/downloads/viva-system-setup.zip

Click **Download raw file** (the download arrow) and extract the ZIP. It contains
`system-setup.sql` and this guide. An unauthenticated private raw URL can return
404; use the normal GitHub page while signed in.

The standalone SQL is also available at:

https://github.com/VuyolwethuM6/viva-learning-hub/blob/work/docs/system-setup.sql

## 2. Run the SQL once

1. Open your existing Supabase project's SQL Editor.
2. Create a new query and paste **all** of `system-setup.sql`, from `begin;` to
   the final `commit;`. Run the whole query, not a highlighted function fragment.
3. Do not reset your database. This adds oversight tables, private functions and
   a session-calendar guard; it preserves applications, invoices, payments,
   access grants, marks, files and current automation flags.
4. The script may be rerun. It does not reset revisions, history or settings.
5. If the prerequisite check fails, apply the previously required accounting and
   academic setup first. Do not remove the prerequisite check to force a partial
   installation.

Verify that each result below is present:

```sql
select to_regclass('public.system_preferences') as preferences,
       to_regclass('public.system_requests') as safe_change_requests,
       to_regclass('public.system_job_events') as run_observations,
       to_regclass('public.system_email_tests') as email_checks,
       to_regclass('public.system_backup_reviews') as backup_reviews,
       to_regprocedure('public.system_snapshot(uuid)') as oversight_read,
       to_regprocedure('public.system_mutate(uuid,text,jsonb)') as settings_write;

select u.email, a.enabled, a.finance_role
from public.admin_users a
join auth.users u on u.id = a.user_id
order by u.email;
```

Sign in with your already-authorized owner account. Another enabled owner must
approve permission changes; the interface does not allow self-promotion or
changing your own access.

## 3. Check service configuration

Existing server variables remain in **Vercel → Project → Settings → Environment
Variables**. Set them for the environment you are testing, then redeploy when
changing an environment variable:

| Configuration | Used for |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-side database, Auth and Storage access. Never use `VITE_` versions of service credentials. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` | Application/tuition email and the owner service test. Use an authorized sender. |
| `CRON_SECRET` | Authorization for the configured scheduled accounting endpoint. |
| `TUITION_BANK_DETAILS_CONFIRMED=true` | Explicit confirmation that the configured tuition beneficiary was checked. |

The beneficiary remains in `api/_lib/payment-details.ts`, used by the parent
portal, tuition emails and PDFs. Updating that source and redeploying keeps all
three consistent. The dashboard cannot reveal API keys, edit secrets or change
the beneficiary independently of those outputs.

Parent, tutor and student sign-in emails use **Supabase Authentication**, with its
Email provider, SMTP and redirect allowlist. The Resend service test does not
verify those sign-in emails. Keep testing a real email-link sign-in separately.

There are no additional public API routes or Vercel functions: both modules use
the existing authenticated `/api/admin/records` route.

## 4. Use the controls

### Automation

Settings and Finance Controls read and write the same accounting configuration.
The new Settings flow checks its revision and the previous automation flags
before saving, so it does not silently overwrite another owner's change. The
books start date is preserved; changing it or closing/reopening books remains in
Finance Controls under the existing posting restrictions.

The scheduled task is configured daily at **08:05 South African time** (06:05
UTC). Enabling requires `CRON_SECRET`; automatic dispatch additionally requires
email configuration and the bank-confirmation flag. Turning on a switch does
not itself run billing or send messages. Keep automatic dispatch off while
reviewing test records unless you intend to send their queued messages.

A scheduled heartbeat appears only after this release observes an authorized
scheduled run. A manual Finance run is labelled **Manual**, and does not prove
that Vercel Cron is firing. Accounting success and email dispatch results remain
separate. A stale, failed or unfinished scheduled observation needs review.
Earlier accounting-run details remain in Finance Controls. If oversight has not
been migrated yet, observation recording does not block the established
accounting workflow.

### Calendar

A closure must be today or a future date in February–November. Existing sessions
on that date must be cancelled or rescheduled first. The database serializes
closure changes with new/rescheduled sessions to prevent a race between the two.
Past closures remain history. Grade programme days remain unchanged: Grades 8–11
Monday–Saturday, Grade 12 Monday–Sunday, Rewrite Monday–Friday.

Closures affect future scheduling and newly calculated invoices. An issued
invoice retains its original earning dates and amounts. If an already-issued
charge needs adjustment, record an approved credit through Finance; adding a
closure does not silently alter the books.

### Staff access

Create and verify a dedicated staff Auth account in Supabase first. Ensure it has
the password needed for the existing admin sign-in. Settings does not create a
password or send invitations. Choose a verified account from the picker, or use
its exact verified email when it is outside the first 100 suggestions.

Grant the appropriate finance role: viewer, bookkeeper or owner. The server
checks the acting owner, target identity and current permissions. Own-account
changes are blocked. At least one enabled owner must remain. Before disabling or
demoting the configured scheduled-run owner, another owner must save automation
as themselves or pause scheduled automation. Disabling an existing unverified
staff account remains possible; verification is required for enabling access.
Parent/tutor/student access remains in the existing learner and tutor workflows;
links from Settings take you to those modules.

### Backups

After checking a provider backup, export or an isolated restore, record its
actual date, method and findings. This is labelled **Owner-reported**. Recording
it does not create, download or restore anything. Include private Storage file
contents in the recovery plan: database backups alone do not preserve those
file bytes. Supabase retains the actual backup controls and provider history.

### Email service test

System Health → **Test email to me** → Review → **Send test to my email** sends
one test only to the signed-in owner's verified database email. The recipient
cannot be supplied by the browser. It uses a stable request and provider
idempotency key; retries of the same request do not send another message. New
tests are limited to one per minute across owners.

An accepted response says **Accepted by provider**. Check the actual inbox. An
uncertain response or pending attempt must be reviewed in Resend before starting
another test; the app does not automatically resend it. This feature sends a
real email only when an owner explicitly confirms the test.

## 5. Acceptance checklist on the work preview

Use test records and dedicated test staff accounts.

1. After SQL setup, sign in as owner and open mobile **More → System health**.
   Verify the checked time, deployment environment and individual descriptions.
   Core interfaces, storage privacy and financial integrity should match your
   actual setup; investigate any attention items rather than treating the whole
   page as a blanket “healthy” guarantee.
2. Open **Record issues**. References and filenames should identify any existing
   metadata/upload problems. Counts cover all matches; the list is bounded to
   100 items. Nothing is automatically deleted, re-sent or repaired.
3. Open **Settings → Calendar**, add a future unused teaching date, review and
   save. Refresh and confirm it remains. Remove it with a reason. Test another
   date with a scheduled session: the change must be rejected until you move or
   cancel that session. Confirm historical invoices remain unchanged.
4. In **Staff access**, your own change button must be disabled. Grant a
   dedicated verified test staff account the Finance viewer role. Sign into that
   account separately: settings writes and test email must be unavailable, and
   owner-only staff identity lists must not appear. Disable the test grant after
   testing if it is no longer needed.
5. In **Automation**, configure the intended flags. Leave automatic email
   dispatch off if you do not intend to send messages. Inspect the same flags in
   **Finance Controls**; they must agree. A manual run should produce a Manual
   observation. After the next real authorized Vercel Cron run, verify a separate
   Scheduled observation and its outcome. Do not infer cron readiness from a
   manual run alone.
6. In **Backups**, record only a review you actually completed. Confirm the
   retained record is marked Owner-reported. No restore or backup should run from
   the form.
7. If the sender is configured, deliberately send one owner email test. Check the
   provider result and actual inbox. Repeating the same request must not send a
   second test; a new request within one minute must be blocked.
8. Open **Audit → System settings and access**. Confirm the closure, staff,
   backup-review and email-test events show the actor, time, readable action and
   reason/context. Automation changes appear under Accounting and bank.
9. Test the two screens and their confirmation dialogs at phone width, in
   landscape and on desktop. The bottom navigation must stay fixed; forms should
   fit and scroll; cancelling a dialog must not save a change. WhatsApp and
   Privacy remain on login screens only.
10. Throttle the network and open each portal: the branded opening loader should
    be centred in the viewport. Record loaders belong in their panel, compact
    action loaders stay in buttons, and refreshes retain existing records.
    Reduced-motion preferences must stop the animations.
11. Spot-check existing application review, invoice/receipt PDFs, learner access,
    session scheduling and an academic result/report. Business policies and
    historical records remain in their existing modules.

## Local verification boundary

The automated SQL tests run the real migration and functions in isolated
PostgreSQL. API tests cover authorization, same-origin writes, redaction,
provider ambiguity, idempotency and job observations. UI tests cover review before
saving, retry identity and role restrictions. The browser harness uses the real
SQL/API with synthetic external Auth, Storage and email boundaries; it never
contacts the live Supabase project or sends real email. Live configuration and
the acceptance steps above remain the project owner's deployment checks.
