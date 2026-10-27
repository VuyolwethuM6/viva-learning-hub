# Academic workflow: setup and acceptance guide

Updated 27 October 2026, South African time. This describes implemented code on
`work`; the owner still needs to apply the migration and test their deployment.
Existing enrollment, tuition, accounting, class, attendance and access records
are preserved. Do not clear your database.

## Delivered workflow and boundaries

Admin **Assessments** and **Academics**, and tutor **Work**, share class-scoped
academic records. Student **Work** provides assignments/submissions and published
feedback; **Progress** provides calculated period averages and published reports.
Parent Home's **Assigned work, published results & reports** is read-only family
access. It also works for an authorised family after a learner's tuition access
is paused; it does not activate student sign-in or tuition service.

Supported work presets are session activity (session required), homework
(optional session) and timed assessment (optional session). Assessment purpose
is independently diagnostic, formative or summative; formats are Quiz,
Worksheet, Homework, Project, Test, Practical and Exam. Questions/instructions
and existing verified paper/resource versions are delivered for human marking.
This release does **not** implement a structured multiple-choice question bank,
automatic marking, AI marking, browser lockdown or remote exam proctoring.

A tutor creates a draft, explicitly selects eligible active learners and assigns
it. Task configuration and resource versions are then retained. To replace an
incorrect unused task, cancel it with a reason and create a new draft; cancelling
work that already has a confirmed submission is rejected. Draft/assigned work
is not silently edited over history. Archived classes preserve published
records and block new student work; admin can still correct/publish old marks.

Students independently sign in through the existing student email-link grant.
Parent-assisted access is for viewing, never proof that a learner took an exam.
Learners without their own independent account cannot submit through the parent
session. An alternative supervised identity/collection policy remains a future
choice; no shared parent password or unverified learner selector is introduced.

## 1. Download and migrate

While signed into GitHub with access to this private repository, open:

https://github.com/VuyolwethuM6/viva-learning-hub/blob/work/docs/downloads/viva-academic-setup.zip

Use **Download raw file** (the download arrow), extract the ZIP and read this
guide. A private raw URL opened without an authorised session can return 404.

For an existing working connected teaching/student setup, copy **all** of
`academic-setup.sql` into a fresh Supabase SQL Editor tab and run it, including
the final `commit;`. Do not run a selected fragment inside a dollar-quoted
function. The upgrade is additive and safe to rerun; it creates no invoices,
payments or fake academic results.

For a fresh teaching installation, the repository's `docs/teaching-setup.sql`
combines all five teaching/academic migrations and runs after parent setup.
The academic-only package requires the connected portal foundation first.

Verify:

```sql
select to_regclass('public.academic_tasks') as tasks,
       to_regclass('public.academic_attempts') as attempts,
       to_regclass('public.academic_grades') as marking,
       to_regclass('public.academic_reports') as reports,
       to_regprocedure('public.academic_mutate(uuid,text,text,jsonb)') as operations;
select id, public, file_size_limit from storage.buckets
where id = 'academic-submissions';
```

All objects should exist. The bucket must be private (`public = false`) and have
`file_size_limit = 10485760`. Browser database roles cannot read the tables or
execute the RPCs; server-authorised API handlers do that work.

## 2. Deploy and use existing accounts

Wait for the latest `work` deployment to show **Ready** in Vercel. No new email
provider, Auth callback or application secret is required if the connected
student/tutor/parent sign-ins already work. The existing API functions are reused;
no extra serverless function is added. Admin records now includes the same local
fonts/logo used by the existing server PDF handlers.

Prepare a synthetic active learner with their own student account and a
separate enabled parent account. First payment/activation rules are unchanged.
Use a tutor assigned to the learner's class. The class must have an effective
learner membership and a reusable topic/goal from the Classes module.

This release updates portal records when they are loaded/refreshed. It does not
send academic assignment emails, due-date reminders or result emails. Existing
financial notification automation is unchanged. WhatsApp remains available for
support; no message is automatically sent by these tests.

## 3. Explicit reporting policies

Admin → **Assessments** (or **Academics**) → choose Teaching class → **Configure
reporting period**. Choose start/end dates within February–November of the class
year, and one method:

| Method | Calculation over eligible published marks |
| --- | --- |
| Total marks | 100 × sum of earned marks / sum of maximum marks |
| Equal weight | Mean of each assessment percentage |
| Weighted | Sum of percentage × configured weight / sum of included weights |

Weights are relative positive units; they do not have to add to 100. For example,
weights 1 and 3 contribute 25% and 75% when both results are published. Each
learner's display shows how many eligible results are actually included and how
many assigned counted tasks await a published result.

Period policies are immutable through the application. Choose the method before
creating work. Missing, unsubmitted, unmarked and unpublished work is **excluded
and separately counted**, never silently converted to zero. A deliberately
awarded, published score of zero is a real score and is included.

Diagnostic marks are always separate from the formal average. Formative or
summative tasks count only when the creator explicitly selects **Yes** for
formal average inclusion. Attendance, viewing a file and practice XP do not
change assessment marks. Calculations are per class/subject/reporting period;
there is no automatic rollup across different class groups or incompatible
period policies. Class labels distinguish those records.

## 4. Assign homework or a diagnostic

1. Tutor → **Work** → choose Teaching class → **Create work / diagnostic**.
2. Choose the reporting period, work type, purpose, format and saved topic/goal.
   Select the related session if relevant; session activities require one.
3. Choose file, written text, or both. Enter meaningful instructions, maximum
   marks and South African opening/due/closing times inside the reporting period.
4. For homework, either reject late work (hard close equals due), or explicitly
   allow it until a later hard close. Late submissions are labelled late.
5. Choose the attempt limit (one to three). Further attempts require the tutor
   to return unmarked submitted work with a reason; they are not unlimited retries.
6. Attach saved resource versions as instructions/question paper or private
   memorandum. Timed papers/memos must be private unreleased versions, rather than
   documents already shared through another class/session or earlier open task.
   Database guards also prevent general class/session release from exposing a
   protected paper or memorandum through an alternate download path.
7. Review the choices and confirm creation. Open the draft → **Assign to
   learners** → select recipients → review and confirm.

Creating the draft does not assign it. A name/student number/target snapshot is
saved for each recipient when assignment is confirmed. Subsequent membership or
profile changes do not erase the assignment or its history.

## 5. Student submission and recovery

1. Student → **Work** → open the assigned item → Start work. A timed assessment
   explicitly confirms that starting begins the timer.
2. Enter a written answer if configured. **Save draft** stores it on the server;
   refresh, reopen Work and verify the saved answer is retained. Unsaved changes
   are labelled; there is no claim of automatic/offline saving.
3. Upload PDFs or JPEG/PNG photographs if required: maximum three active files,
   10 MB each. Wait for **Verified upload**. Only the owning learner can manage
   their draft uploads. Staff see confirmed submissions, not private drafts.
4. **Review & submit** → check answer/files/deadline → **Submit now**.
5. Success must show a server receipt and submission time. Refresh and verify
   the record stays submitted and cannot be edited. A saved answer or uploaded
   file alone is not submission.

If upload is interrupted, refresh. **Verify upload** checks an existing object;
**Resume original file** requires the same name, size and MIME type and does not
create another row. **Remove from draft** discards the attachment from that draft
while retaining its audit record. Pending files must be verified or discarded
before final submission. Verified objects cannot be overwritten. Downloads
already saved to a device cannot be recalled.

Do not repeatedly create new uploads after an ambiguous response; inspect the
pending list first. After an uncertain final submission, refresh/check the receipt
or retry the same action. Stable request IDs and revision checks prevent duplicate
confirmed submissions and stale overwrites.

## 6. Mark, review and publish

1. Tutor refreshes Work and opens the confirmed learner submission. Verify its
   receipt, written answer and attached files.
2. **Mark / revise feedback** → score within maximum, parent/student-facing
   feedback and optional private staff note → review → confirm.
3. **Submit mark for review**. Until admin publication, parent/student snapshots
   contain neither the mark nor the feedback/private note.
4. Admin → Assessments → class → task → **Publish result**, or return the
   marking with a review reason.
5. Student refreshes Work: the published score and feedback appear. Parent
   opens Home → Assigned work, published results & reports: same published
   record for their own child. Private staff notes must be absent.
6. Student Progress and staff Current assessed progress show the relevant
   calculated average and percentage-point gap to the enrollment target.

To correct a mark, the tutor saves a new revision with a reason, submits it for
review and admin publishes it. The previous published result remains current
until the correction is published. Earlier revisions remain in history. A new
revision cannot overwrite another tutor's concurrent revision silently.

Unmarked homework may be returned for correction if another attempt is allowed.
The earlier receipt is retained. An already marked attempt cannot be returned
through this shortcut, and timed assessments have one final attempt.

## 7. Timed assessment and extension tests

Choose Timed assessment with an opening time, hard close and allowed duration
(15–240 minutes in the UI). It has one final attempt and no late-work window.
Deadline checks use database wall time after lock acquisition, so a request waiting for another write cannot use an earlier transaction-start time to bypass closing. The effective deadline is the earlier of the learner's hard close and
`started_at + allowed duration + authorised extra minutes`.

Test before opening, just after opening, near the close and after the close.
Refreshing or changing the device clock must not restart the server timer.
At the exact effective closing time, new draft saves, upload finalization and
submissions are rejected. Starting an upload before close is not sufficient.
The countdown does not fabricate an automatic submission; an expired draft
remains recorded without a receipt.

For controlled deployment tests use a short real test window. Do not edit the
production database clock. Automated boundary tests use an isolated test clock.

Staff may **Authorize extension** for a selected learner with a reason, a later
hard close and a total extra-duration allowance. Extending only the hard close
will not revive an expired timed duration; add the appropriate extra minutes.
A submitted attempt remains final. Other learners' deadlines do not change.

Memoranda stay private until admin explicitly releases them after **all** learner
closing times, including extensions. At close they may be released, but the task
then cannot be reopened through an extension. Previously downloaded copies
cannot be withdrawn.

## 8. Frozen progress reports

Review staff **Current assessed progress**, included results, diagnostics,
calculation method, count, missing count and target. Choose **Publish learner
report**, select the learner and give a publication reason. If marks/targets
changed since the calculation was loaded, publication is rejected: refresh and
review again.

This creates an immutable report snapshot. **View report PDF** generates a
branded PDF from that saved content. Students and parents can open the same
published report through their authorised portals. A later mark correction
updates current progress but does not rewrite the old report; publish a new
report to record the corrected period result. All report versions are retained.

## 9. Permission, history and mobile checks

- Another learner, sibling, family or unassigned tutor must not obtain tasks,
  private papers, submissions, draft marking or report PDFs by changing IDs.
- Parent views have no start/save/upload/submit/mark actions. Attempts to post
  academic operations through a parent session are rejected by the API/SQL.
- Disabled student/tutor accounts lose subsequent API/file access. A student's
  active enrollment is rechecked. Published records are retained.
- Academic changes record actor, operation, request and reason. Protected mark
  revisions, receipts, upload records and immutable requests preserve details;
  general class history does not expose answer text or private marking notes.
- At 320px portrait, small landscape and tablet sizes, test selectors, file
  pickers, answer editing, review dialogs, report previews and pinned docks.
  Test an actual phone/browser keyboard as well as cloud browser checks.
- Reads have an explicit 1,000-task export boundary rather than silently dropping
  older work. Submitted answer text is fetched for the selected task; history
  remains stored. Large deployments will need pagination/export tooling.

## Still outside this release

Richer curriculum lessons/practice banks, automatic/AI marking, AI tutor, badges,
leaderboards, academic email automation, cross-class subject rollups, public
paid/free materials CMS, proctoring and independent assessment identity for
learners without their own account. Existing public material purchases and
finance automation remain separate.

## Local verification

205 tests across 21 files passed, including actual PostgreSQL/PGlite academic
permissions, upload recovery and deadline boundaries, the three averaging
methods, mark revisions, frozen reports and safe migration reruns. API checks
verify trusted identities/roles, family scope, private files, report PDF bytes,
cross-origin rejection and revoked sessions. Both TypeScript targets passed;
lint has no errors and the seven existing Fast Refresh warnings. The production
build exits successfully with the repository's existing SSR/prerender warnings.

The isolated Chromium journey uses the actual API handlers and database SQL,
with synthetic external Auth/Storage. It exercised period configuration, tutor
assignment, student saved-draft reload, verified upload and final receipt,
marking/admin publication, parent read-only results/PDFs, weighted progress,
timed draft expiry without a false receipt, and docks/layouts at 390×844,
320×568 and 568×320. Report PDF text and its rendered branding were inspected.
Cloud checks do not replace the live migration/Auth/Storage and physical-phone
acceptance above. No real emails, payments or live database changes were made.
