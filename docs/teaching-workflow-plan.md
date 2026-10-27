> Current delivery: the academic release now implements assigned work, submissions, human marking, admin publication, timed assessments, explicit averages and report PDFs. See [academic-workflow.md](academic-workflow.md) for current behaviour and limitations. The design below preserves the original requirements and delivery sequence.

# Teaching workflow: agreed requirements and proposed delivery

Recorded 27 October 2026 (Africa/Johannesburg). Release 2 now delivers day-specific scheduling, expanded tutor actions and the student portal foundation; see [connected-portals.md](connected-portals.md) for the implementation and tests. This records the full design; the teaching foundation is now implemented as
described in teaching-test-guide.md. Learner submissions, assessments/averages and timed assessments are now implemented in academic-workflow.md; public catalog editing remains planned. The owner reports the parent
portal working; the new teaching foundation still needs its deployment acceptance
test.

## Owner requirements

- Class setup must support effective teaching and learning, beyond a timetable.
- Materials must be part of the teaching workflow.
- Work may belong to a specific session, be homework, or be an independent,
  ad hoc timed exam.
- Timed exams close at a stated time and require submission before that time.
- Admin's Materials section must eventually manage `/study-materials` too.
- Prefer choosing existing options over typing into fields throughout the design.
- Tutor access supports the teaching service families pay for; parent records
  should reflect real teaching activity.
- Retain past session details, attendance, assigned work, submissions, marks and
  feedback. Calculate subject averages and compare progress against the target
  mark recorded for that subject on the enrollment form.

## Classes and session planning

Use existing grade/programme, subject, tutor and active-learner records as choices.
Class setup includes programme/teaching season, delivery mode, roster, recurring
days and times, location or meeting link, and selected curriculum topics/goals.
Generate an initial class name from selected grade, subject and group, with an
optional custom name. Respect the February–November season, configured closures
and grade-specific programme days. The actual class timetable is separate from
the enrollment programme's broad availability.

A session has an actual date/time, topic, learning goal, attached resource
versions, attendance, assigned work and a teaching status such as scheduled,
completed or cancelled. Tutors record outcomes; passage of time alone must not
mark a session taught or learners present. Preserve corrections/history.

## Materials library

Create one managed library with grade, subject, topic, resource type, file/link,
audience, publication state and version history. Attach chosen library resources
to classes, individual sessions and tasks without repeatedly uploading copies.

Suggested resource types: notes, worksheet, presentation, question paper,
memorandum, revision resource and external/video link. Question papers and
memoranda have separately controlled access/release times. Uploading a file does
not automatically publish it. Tutor permissions apply to assigned classes;
admin controls public website publication and paid-resource settings.

Separate public visibility, purchase entitlement and class entitlement. A paid
website resource may be explicitly assigned to an enrolled class without making
its file public. Public previews must never expose private questions, memos or
learner submissions. Versioned task attachments preserve what learners received
when a library resource is later replaced.

Current code: `/study-materials` reads the static catalog in
`src/lib/studyMaterials.ts`; PayFast checkout separately maintains product titles
and prices in `api/payfast/checkout.ts`, with delivery handled by the notification
route. Admin Materials now manages the private teaching library; public catalog editing remains planned. Public catalog
management therefore requires moving metadata, server pricing and delivery
lookups together; changing only the visible cards would be incomplete.

Preserve the existing free/paid offerings and checkout behavior during migration.
Use stable resource/version identifiers, authoritative server prices and saved
purchase details so renaming a resource or changing its price/file does not
invalidate past purchases. Durable purchase/delivery tracking must accompany the
paid-catalog migration; the current process-local duplicate tracking is an
existing limit documented in implementation-status.md.

## Assigned work

Use a common task foundation with three presentation presets:

| Preset | Session link | Timing | Submission |
| --- | --- | --- | --- |
| Session activity | Required | Session-based availability/deadline | Configured response/file |
| Homework | Optional | Due date; explicit late-work policy | Configured response/file |
| Timed exam | Optional | Opens at / closes at; strict closing default | Confirmed before closing |

Select the subject/topic, class or learners, resources, instructions, maximum
marks, submission method and dates/times. An ad hoc exam need not have a lesson
session first. Randomized question generation is not implied by an ad hoc exam.

Use South African dates/times with the timezone visible. The server enforces
opening/closing times for access and submission; the visible countdown is only
a display. Starting an upload is not a confirmed submission: all required files
must be uploaded and submission finalized before closing. Display upload state
and a server-confirmed submission receipt/time. Mark work as submitted only on
that confirmation. Never infer submission from opening or downloading a file.

Where a per-learner duration is enabled, it cannot extend beyond the configured
close time without an authorized extension. Record extensions, attempts and
corrections with actor/reason/history. These are proposed controls; duration,
resubmission and late-homework policies still need final configuration choices.

## Tutor, learner and parent responsibilities

- Admin: tutor authorization, classes/rosters, publication permissions, account
  changes, public materials and review of submitted academic results.
- Tutor: assigned sessions, approved resources, attendance, work/assessments,
  marking, feedback and submission of results for publication.
- Learner: own timetable/resources/tasks, permitted submissions and submission
  receipts, followed by published marks/feedback.
- Parent: own children's confirmed attendance, assigned-work status and published
  results, alongside the existing family finances.

Assignments and exam submission require a learner workspace as well as the tutor
portal. Do not treat a parent selecting a child as proof that the learner took an
exam. Learner authentication requires a deliberate design that does not assume
each enrollment has a unique email; guardian emails intentionally repeat across
siblings. The existing parent sign-in remains email-link based.

Tutors see only authorized classes and teaching records. Financial balances,
payment details and private enrollment documents are outside their default
teaching scope. Removing an assignment/account blocks subsequent access. Grades,
memoranda and submissions require server-side authorization, including downloads.

Confirmed attendance appears to parents/students after session completion, with subsequent corrections retained. Proposed
assessment flow: tutor draft → submitted for admin review → published to the
correct learner/parent. Parent-facing feedback and internal staff notes are
separate. Teaching actions do not silently change tuition or financial records.

## Learner history, assessment purposes and enrollment targets

Keep a longitudinal record per learner and subject: original enrollment mark,
enrollment target mark, diagnostic findings, every past session/topic/resource
version, attendance, assigned work, submission status/time, assessment scores,
feedback and publication history. Read the actual per-subject enrollment values
from `application_subjects.current_mark` and `target_mark`; do not replace them
with invented defaults when missing. Revised targets retain the original value,
effective date, actor and reason.

Assessment purpose is separate from format: diagnostic establishes knowledge
and topic gaps, formative guides ongoing teaching, and summative evaluates
achievement after instruction. Formats include quizzes, worksheets, homework,
projects, tests, practicals and exams. Show diagnostic baselines separately and
exclude them from formal averages by default.

For each subject show the enrollment starting mark/target, diagnostic baseline,
current assessed average, trend over time and percentage-point gap to target.
Preserve report periods so the current average does not rewrite an earlier
report. Display the included assessment count, calculation method and any
weights; weighting and missing-work rules must be explicit configuration, not
hidden assumptions. Missing/unmarked work remains visibly flagged. Attendance
and completion sit alongside achievement rather than silently changing the
academic average. Compare the defined subject average with its applicable target.

Mark corrections retain prior values, reason, actor and time. Archived classes,
completed sessions and learner lifecycle changes do not delete their learning
history. Parents see authorized published records for their own children;
tutors/admin use their respective teaching/review permissions. Formal averages
and target indicators use eligible published marks, while draft marking remains
visibly separate in staff workflows.

## Choose options before asking for typing

Use selection cards, dropdowns, checkboxes, calendar/time pickers, file pickers,
number steppers and saved templates wherever choices already exist. Automatically
fill known learner/tutor/class information and offer generated titles. Search is
optional assistance, not required to complete a selection.

Create reusable topics/goals and feedback templates rather than making tutors
retype them each session. Text entry remains for genuinely new resource content,
new links, individualized instructions/feedback and meaningful correction
reasons. Provide these as short, clearly labelled exceptions; do not invent
choices or feedback merely to eliminate typing. Apply this preference to new
workflows and later targeted improvements to existing screens.

## Proposed delivery and acceptance tests

1. Teaching foundation: tutor authorization, class/session setup, private materials
   library/attachments, tutor workspace and attendance. Test admin creates a
   class/session with resources → assigned tutor records attendance → only the
   correct parent's account sees confirmed attendance.
2. Learner workflow: resolve learner sign-in, provide own resources/tasks and
   implement session activities/homework with uploads and confirmed submissions.
   Test the complete assign → access → submit → mark → review → publish cycle.
3. Timed assessment: availability, strict closing, countdown, upload/finalization
   boundaries, authorized extensions and history. Test before/open/close times,
   interrupted uploads, duplicate finalization, late rejection and cross-learner
   access. Use an isolated clock for boundary tests, not production clock edits.
4. Public Materials management: migrate the existing catalog and paid delivery
   together, then test free publication, private/class access, changed prices,
   preserved prior purchases and verified delivery/idempotency.

The foundation must accommodate all four stages even though they are delivered
separately. Delivered foundation/setup is documented in teaching-test-guide.md; later-stage
features are implemented only where confirmed in academic-workflow.md; richer curriculum/AI and public catalog work remain planned.
