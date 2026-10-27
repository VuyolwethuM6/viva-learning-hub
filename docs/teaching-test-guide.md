# Teaching release 1: setup and complete test guide

Updated 27 October 2026 (Africa/Johannesburg). The owner reports the parent and
accounting portals working. This release adds teaching setup, private materials,
tutor email-link access, session records and attendance. Use synthetic learners,
controlled email inboxes and dummy teaching documents for deployment tests.

## Delivered scope

Admin Classes: saved teaching rooms, reusable topics/goals, generated class names,
grade/subject/group/year, assigned tutor, programme days/time choices, active
learner membership and individual sessions. Scheduling checks programme days,
February–November teaching, closures and overlapping tutor/class/classroom/online-room or learner times.
Classes retain their records when archived; archiving cancels unstarted future
sessions. Past records are not deleted. Tutor reassignment checks future clashes,
updates future scheduled tutor snapshots and revokes the former tutor's class
access; earlier session snapshots/history remain.

Admin Tutors: authorize verified names/emails, enable/disable access, show whether
they have signed in. Enabled administrators manage teaching in this release;
finance permissions do not grant a tutor administrative access.

Admin Materials: private PDF/JPEG/PNG files up to 10 MB; version history; Storage
size/type checks; resume/verify interrupted uploads; explicit class/session
attachments. Session attachments save specific versions; removing a default
class resource does not erase its existing session attachments. Files are not
published on `/study-materials` and are not available to parents or learners.
Question papers/memoranda are staff resources in this release. Learner release
windows and submissions arrive with the next assessment/learner release.

Tutor `/tutor`: email-link sign-in, own assigned classes, session roster, starting
marks/targets from enrollment, private assigned resources, attendance, completion,
corrections and authorized per-session history. No family balances, guardian email,
payment records or enrollment report-card downloads are in the tutor snapshot.
A tutor's current class assignment controls access, including file downloads.

Parent `/parent`: confirmed completed-session attendance, topic/goal/outcome,
upcoming sessions, cancelled-session records and complete attendance totals.
Private staff notes are excluded. Present and late count as attended; excused,
cancelled and unconfirmed sessions are excluded from the attendance denominator.
There is no percentage when that denominator is zero. The history list shows the
latest 200 family records and upcoming list at most 30; totals cover all completed
records. Staff snapshots flag their latest-1,000-session display limit. Per-session
audit reads are complete up to 1,000 events and refuse larger reads explicitly.

Enrollment starting/target marks are reference values, not assessed averages.
The roster saves those marks at scheduling time. Session creation/outcome alone
never invents marks, attendance, diagnostic results or target achievement.

## 1. Database setup

After the working parent migration, run **all** of `docs/teaching-setup.sql` in a
fresh Supabase SQL Editor tab. Ensure its last statement is `commit;`, clear any
selected text and run the full script. It combines these canonical migrations:

1. `20261027160000_teaching_foundation.sql`
2. `20261027161000_teaching_operations.sql`
3. `20261027162000_teaching_reads.sql`

The script preserves existing financial and parent records, creates a private
`teaching-materials` bucket, adds role/teaching tables and service-only functions,
and reloads the PostgREST schema. Reruns preserve records. Do not reset your books.
The new audit/request history is immutable and the server uses stable request IDs
and session revisions to protect retries and concurrent register edits.

Verify:

```sql
select to_regclass('public.teaching_classes') as classes,
       to_regclass('public.teaching_sessions') as sessions,
       to_regclass('public.teaching_tutors') as tutors,
       to_regprocedure('public.teaching_snapshot(uuid,text)') as teaching_api;
select id, public, file_size_limit
from storage.buckets where id = 'teaching-materials';
```

Objects must exist; bucket `public` must be false. Fresh projects can use the
complete `supabase/schema.sql` instead of applying both installation paths.
`scripts/sync-teaching-setup.mjs` regenerates the combined teaching upgrade and
fresh-schema teaching section from canonical migration files.

## 2. Deploy and configure tutor authentication

Deploy the release to the intended work deployment. Admin and parent routes keep
working after setup; `/api/tutor` shares the existing session deployment function,
with distinct tutor cookies and role checks, preserving the 12-function budget.

Reuse the already working Supabase Email provider/custom SMTP. If both portals
use the same deployment, the existing `PARENT_PORTAL_URL` is also the fallback
for tutor emails. Optionally set server-only `TUTOR_PORTAL_URL` to its HTTPS
origin; redeploy when changing environment variables.

Add the deployment's exact extra allowed URL under Supabase Auth URL Configuration:

```text
https://YOUR-DEPLOYMENT/api/tutor?action=callback
```

Keep the existing parent callback as well. Both Email and signup remain enabled;
keep confirmed email and a 900-second email-link expiry. Parents and tutors need
no password or code. A valid existing Supabase identity may have both roles,
with separate grants/cookies. Only staff-authorized tutor emails can request a
tutor sign-in email; disabled accounts and unknown emails receive the same public
request message. Cookies are HttpOnly/Secure/SameSite=Strict and scoped to the
specific `/api/parent` or `/api/tutor` endpoint. Tutor logout clears only tutor
cookies and attempts provider logout for that tutor session.

Supabase shares Magic Link/Confirm signup email templates across the two roles.
Update **both** to the shared `docs/parent-signin-email.html` in this release:
subject `Open your Viva Tutorials portal`, button **Open my Viva portal**. Its
heading/body are now portal-neutral. Preserve the exact target:

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}">Open my Viva portal</a>
```

The server provides the correct parent/tutor callback. Do not hard-code one role's
URL in the template. Existing parent-only wording still routes according to the
callback, but update it to avoid confusing tutors. No SMTP emails were sent by
implementation tests. Protected Vercel Previews still need tester access; this
is separate from the site's tutor authorization.

## 3. Prepare teaching records in admin

1. Open Tutors → Add tutor. Enter a verified controlled inbox/name; confirm.
2. Open Classes → Add teaching room. Choose Online/In-person, give it a name,
   and save an HTTPS meeting link or physical address. This is reusable.
3. Add topic & goal: select grade and subject, enter a topic and learning goal.
   New content requires typing once; later sessions choose saved options.
4. Create class: choose grade, subject, group, teaching year, tutor, room,
   programme days and start/end times. The name is generated automatically.
5. Choose the class → Add learners. Only active learners with matching grade and
   enrolled subject qualify. Choose their effective join date and learners.
   Classes are limited to 100 current learners. Ended membership periods remain
   in history. A returning learner can join the same class with a new effective
   date; overlapping periods are rejected and past registers are retained.
6. Open Materials → Upload teaching material. Select grade, subject and type,
   then a dummy file. The filename supplies its initial title. Review/confirm.
7. Return to the class → Assign resource → choose its verified version.
8. Schedule session: choose topic, actual date and times. Current eligible
   membership and default material versions are saved with the session.

Past-session entry is supported for accurate backfilling. Use an actual past
scheduled programme day within the selected year (e.g. 26 October 2026 while
testing on the 27th), with membership starting on/before it. Do not modify the
production clock. Genuine future attendance and completion are rejected.

## 4. Tutor → parent acceptance test

1. Open `/tutor` in a separate/private browser. Enter the authorized tutor email,
   open the actual received message and tap Open my Viva portal. Verify the
   callback returns to `/tutor` on the intended deployment.
2. Choose the assigned class and session. Check learner names/student numbers,
   enrollment starting marks/targets, saved topic/goal and resource versions.
3. View/download the private worksheet. An unassigned tutor must be denied it.
4. Record attendance: explicitly choose present/late/absent/excused for every
   learner; review the choices and confirm. Empty or partial registers fail.
5. At this point the session is still scheduled; it is not published as completed
   attendance to parents. Once the session has ended, choose Complete session,
   select a teaching outcome, optionally add a private note, review/confirm.
6. Sign in to the correct parent account and open the learner. Refresh attendance.
   It should show the completed session, attendance and outcome. Verify the
   private staff note, other learners and tutor-only files are absent.
7. Correct a completed register with a selected correction reason. Refresh the
   parent view; it must update the same session rather than add a second one.
8. Open Recorded session changes: actor/time and previous/current attendance must
   remain visible. Raw saved record details are available only to authorized staff.
9. Schedule/cancel another session. The parent can see cancellation; it must not
   count as absence. Try future attendance, missing statuses, stale-register saves,
   closure dates and overlapping class/tutor/classroom times: all should fail safely.
10. Upload a new version of the worksheet. Existing sessions retain the earlier
    version. New defaults/attachments require an explicit version choice.
11. Disable tutor access in admin, then refresh their page/try a file: deny access.
    Past session/parent attendance records remain. Reassignment also removes the
    former tutor's access. Tutor accounts must not open `/api/admin/records` using
    their tutor credentials or access parent finances without a separate parent grant.
12. At 320px portrait, small landscape and tablet sizes, check choosing classes,
    scrolling registers, review dialogs, document preview/download and logout.

## Upload recovery and record retention

If uploading fails or its response is ambiguous, refresh Materials before creating
another version. **Verify upload** checks the actual private object. If it is
missing, use **Resume upload** with the original name/size/type. Mismatches fail;
verified files cannot be overwritten. A pending row alone never grants a download.
Material files, roster records and teaching history remain private after logout.
Downloaded copies remain on the user's device; sign out on shared devices.

Tutor class removal affects subsequent requests. Financial suspension/withdrawal
keeps historical teaching records; staff manage effective class membership dates
and cancel/remove future teaching as appropriate. Teaching operations never post
invoices, receipts, income or academic averages. Assessment purposes, submitted
work, publication approval and target/average reports remain the next release.

## Verification boundaries

Database tests execute actual SQL in PGlite; API tests use synthetic provider
responses; browser checks use actual HTTP handlers/SQL with synthetic Auth,
Storage and email. Live SMTP, redirect allowlists, deployed storage permissions
and hosting rewrites still require the controlled test above. No live migration,
real email or financial transaction is performed by these implementation checks.

Local release verification: 162 tests across 19 files passed, both TypeScript targets passed, lint has zero errors and seven existing warnings, and the production build exited 0. Chromium and WebKit browser checks passed with synthetic Auth/Storage/email and actual API/SQL.
