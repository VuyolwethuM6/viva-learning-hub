# Viva portal interface and acceptance checks

Updated 27 October 2026. This interface update uses the existing APIs, access
rules and stored records. It adds no database migration. Existing portal setup
and academic setup still apply if they have not already been installed.

## Where each person works

| Portal | Main destinations | Main purpose |
| --- | --- | --- |
| Student `/student` | Home, Learning, Progress, Account | See the week, join sessions, open materials, submit work, read feedback and reports. |
| Parent `/parent` | Home, Finances, Help | Switch children, follow attendance and learning, view family invoices, receipts and statements, contact Viva. |
| Tutor `/tutor` | Today, Classes, Work, Account | Find sessions needing attention, manage an assigned classroom, record attendance and complete sessions, assign and mark work. |
| Admin `/admin` | Overview, Applications, Students, Finance; more teaching and oversight tools | Review applications, manage learners and accounts, organise teaching and publish academic results. |

Mobile destinations stay fixed at the bottom, with clearance below page content.
Desktop navigation exposes the same destinations. Sign out opens a confirmation
and can be cancelled. Viva's logo, Jakarta font, purple/orange colours, email-link
sign-in and contextual WhatsApp support remain in use.

## Learning and attendance

Student Home places the learner profile and weekly attendance before session and
work details. Select a subject and tap a day to see its individual sessions.
Parent Home places the selected child's weekly attendance before account and
enrollment details. The parent can open results or assigned work separately.
Programme days and the programme start date remain under **Programme & enrollment
details**; they are not used as proof of attendance.

The week runs Monday–Sunday in South African time. Each actual session is
represented separately. Two subjects on Monday can show **1/2** (one of two attended). Tap the day for the full statuses.
Late counts as attended; an explicit absence is distinct from excused or
cancelled teaching. Empty days say **No session**. Unfinished past sessions say
**Not recorded**, rather than becoming absences. Overall attendance percentages
continue to come from the server, with excused, cancelled and unconfirmed
sessions excluded from the rate. Recent-history limits are disclosed: an empty
older week is not a guarantee that no historical teaching occurred.

Student **Learning** opens a classroom with **Sessions**, **Work** and
**Materials** views. Sessions and work are class-specific. Released materials
are grouped by subject because the existing student API returns subject-labelled
files; when multiple classes teach that subject, the materials view identifies
that these are shared across those classes. Old sessions remain available under
past-session details. Online room links use the existing access rules.

Student **Progress** displays each subject/class reporting period separately.
The published average, enrollment starting mark and target remain distinct.
The orange marker denotes the target; the purple bar denotes the published
average. Open calculation details for included marks, weights, diagnostics and
missing-result counts. Published PDF reports remain available. No combined
average across unrelated subjects is invented.

## Teaching and academic work

Tutor **Today** offers Today, Upcoming, Needs completion and Past filters. Its
summary cards open the corresponding class or session view. In **Classes**, open
one classroom, then choose **Sessions**, **Attendance**, **Learners**,
**Materials** or **Timetable**. Opening a session focuses its register, resources
and completion/correction actions; **All class sessions** returns to the list.
Attendance opens a learner's weekly register. In Materials, **Upload & manage
teaching materials** opens the existing upload/version tools, with a return to
Classes. In Timetable, saved day-specific slots remain available to the session
planner; changing the screen does not change already scheduled teaching.

Tutor **Work** separates **Assigned work** from **Results & reports**. Work queues
show All, Drafts, Assigned, To mark, In review, Published and Cancelled. A task awaiting admin
review appears in In review before other queue categories. These are navigation
filters over stored task/submission/grade records, not new workflow statuses.
Open a task to assign learners, inspect submissions and mark or review them.
Work creation groups its existing choices into learning goal, response/timing,
and marks/resources; the review-and-confirm step remains mandatory.

Admin **Assessments** manages assigned work, marking and publication. Admin
**Academics** manages period progress and report publication. These now have
different views of the same academic records. Reporting-period configuration is
still available when selecting a class. Unimplemented Settings and System health
placeholder destinations have been removed from navigation.

Parent learning access remains read-only. Student submission receipts, timed
attempts, hard closing times, file verification, staff-only notes, admin result
publication and frozen reports use the same server checks as before. Financial
transactions, invoice/receipt storage and PDFs are unchanged.

## Test on the work deployment

Use existing test accounts and test records. Each role signs in separately.

1. Open `/student` on a phone. Home should show the correct learner and a weekly
   strip. Scroll to the end: the four-button navigation should stay visible.
2. With a learner taking two subjects, select each attendance subject and tap a
   day. Verify both session records remain distinct and an absence in one subject
   does not overwrite attendance in the other. Move to a previous week and back.
3. Open Learning, choose each classroom, then Sessions, Work and Materials.
   Check that the session/work list follows the chosen class and that room and
   document buttons work. Use All classrooms to switch subjects.
4. Open assigned work. Save a draft, refresh/reopen it, upload the required file,
   review and submit. A final submission must produce a receipt. Submitted and
   Results filters should distinguish submission from published feedback.
5. Open `/tutor`. Today should contain the appropriate sessions; Needs completion
   should show unfinished ended sessions or a clear empty state. Open a session
   and verify the register, attendance dialog and completion action.
6. In a tutor classroom, test each of the five views. Open a learner's weekly
   attendance. Upload/verify a material from Materials, assign it and explicitly
   release it. Staff-only files must remain hidden from the learner.
7. Use Timetable and Schedule session to choose a Monday with its Monday-specific
   time. Preview a repeat before saving. Verify the resulting dated sessions.
8. In tutor Work, mark a submitted task and send the result for review. In admin
   Assessments, publish it. In admin Academics, inspect the subject/period average
   and publish a report. Open the PDF.
9. Student Progress should show the published average beside the correct subject
   target and period. A timed attempt that expires must retain any saved draft
   without displaying a false submission receipt.
10. Open `/parent`. Switch children if the family has more than one; weekly
    attendance and academic details must follow the chosen child. Open Results
    and Assigned work, read feedback and open a report PDF. Parent access must
    not offer starting/submitting work or display private tutor notes.
11. In parent Finances and admin Finance, spot-check existing balances and open an
    invoice and receipt. Review an application/report card through admin as usual.
12. On each portal, test portrait and landscape, scroll past the last card, open
    and cancel Sign out, and open WhatsApp. On admin mobile, test More and its
    close button. Check at 320px width and on desktop, including keyboard focus
    and a real phone with its on-screen keyboard open.

## Verification performed for this change

Automated checks cover weekly date boundaries, two-subject/session attendance,
neutral missing records, subject filtering and classroom navigation. The isolated
Chromium harness exercises the actual SQL and API with synthetic Auth/Storage:
assignment, draft retention, upload verification, final receipt, marking, admin
publication, parent read-only visibility, timed expiry and report PDFs. Mobile
and desktop browser checks cover navigation, dialogs, fixed docks and overflow.
These checks do not sign in to or change the deployed Supabase project; the
steps above remain the deployment acceptance checklist.
