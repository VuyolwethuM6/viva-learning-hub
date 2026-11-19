# Practical M4 review guide

This guide is for the current `work` implementation. It grants no production deployment, database, flag, account or communication authority. Existing M1–M3 installation SQL must not be rerun against the populated database. No environment-variable changes are required or authorised by this development work.

## Local automated verification

From the repository root, install the locked dependencies if absent with `npm ci`, then run:

```sh
npx vitest run src/test/recruitment-selection-ui.test.tsx --maxWorkers=1
npx vitest run src/test/recruitment-selection-database.test.ts --maxWorkers=1
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm run lint
npm test -- --maxWorkers=1
npm run build
```

Use the final engineering report for exact executed commands/results. The selection database test constructs a disposable PGlite PostgreSQL database, existing M1–M3 schema and synthetic verified applicants/staff. It applies the new migration locally. It does not connect to production Supabase. UI tests use synthetic API responses to verify interactions and permission-dependent display; they are not hosted-service acceptance.

## Screen navigation

After signing in through the existing recruitment staff sign-in, navigate to:

- `/admin/recruitment/overview`: module overview and current backend-derived feature state.
- `/admin/recruitment/selection`: screening, interviews, assessments, evaluations and owner decisions.
- `/admin/recruitment/reports`: role-scoped aggregate recruitment reports.
- `/admin/recruitment/applications`: existing assignments, case notes, additional-information messages and privacy governance.
- `/admin/recruitment/engagement`: offers, onboarding, activation and offboarding; see the engagement review instructions in the delivery report.
- `/recruitment/application`: verified applicant case workspace, with applicant-safe interview and later-stage information.

New selection processing is disabled by default. An empty or disabled production screen is the expected result until separately approved migration and rollout controls are satisfied. To exercise enabled flows, use only an isolated synthetic database fixture/test adapter. Do not enable production intake to create test candidates.

## Staff and owner walkthrough in an authorised isolated fixture

1. Start with a submitted vacancy application and clean mandatory documents. An accountless verified applicant is the source; do not insert a fake application into the real database.
2. As owner or an explicitly assigned, scoped reviewer, open Selection. Search by candidate name/email, optionally filter by vacancy or stage, and use pagination. Search is sent in a POST body; private applicant identifiers are not placed in URLs. Unauthorised cases must be absent.
3. Open a candidate. Profile displays the submitted answers, document states and assigned reviewers. A quarantined or unclean document cannot be downloaded. A clean document download must still pass server-side permission checks.
4. On Screening, record completeness, qualification, experience, role-requirement checks and supporting notes. Review and confirm using fresh password and configured owner MFA. The record appears in history; it does not make an automatic suitability decision.
5. Record a shortlisting outcome and private reason. Request-information additionally requires a separate applicant-facing message; only that message appears in the applicant conversation. Return-for-review is also available. Unauthorised scope, conflict or stale revision must reject the mutation.
6. On Interviews, schedule a round with assigned interviewers, date/time, duration and private location/link. Dates display in South African time; the datetime input follows the browser timezone. Try an overlapping interviewer booking: the database must reject a known conflict. Manual scheduling does not imply external calendar availability. Reschedule, cancel, complete or record a no-show with an explicit reason.
7. On Assessments, assign role-specific instructions, criteria, evaluators and a due date. Each assigned evaluator records a result, feedback and required evidence. If a new assessment must replace an incomplete or erroneous requirement, the owner selects the earlier assessment in the replacement control and confirms with AAL2; earlier instructions/results stay in history and only the new requirement remains outstanding. Unassigned evaluators must be denied; repeated requests must not create duplicates.
8. On Evaluations, select a completed interview and suitable tutor, administrator or support-staff criteria. Configure scoring scales/weights, enter feedback for every criterion and submit an independent scorecard. The summary score is informational. The original remains immutable; an authorised correction records a replacement and a correction reason.
9. On Decisions, submit a human recommendation with supporting evaluations and reasons. An owner cannot approve a stale recommendation referencing a subsequently corrected scorecard. Only the owner has a final decision control. As a manager/officer, attempt the equivalent owner API command: it must be denied even though the UI hides the control.
10. As the authorised owner, review the recommendation and record approval for offer, unsuccessful or further assessment. Incomplete prerequisites, unresolved conflicts, duplicate conflicting decisions and stale revisions must reject. Approval for offer does not grant staff access.
11. Check History and Reports. History records authorised transitions. Reports show aggregate counts within the current user's scopes and do not list private candidate identities or internal evaluations.
12. Simulate a lost mutation response. Keep the original review and retry the same request, or use the pending-action recovery control. One committed result must exist, with no duplicate decision, interview or notification.

Use different synthetic owner, manager, officer, candidate and unrelated-scope identities. A second login controlled by the same person does not satisfy the independent two-owner release requirement.

## What remains external

The code can queue approved status communications and reminders; successful hosted delivery requires accepted email and scheduling infrastructure. Scanner health, real malware verdicts, private Storage policy enforcement, backup restore, owner MFA/recovery and operational attestations require hosted acceptance. No synthetic adapter result certifies those services. Public intake remains closed until those dependencies and release governance have been separately accepted.

Screenshots and browser results, when generated, are local visual/flow evidence. They must be described separately from actual hosted Supabase, Auth, mail, scanner, calendar or scheduler verification. Legal agreements, privacy approvals and evidence-retention duration remain explicit business/legal decisions.

## M5 staff and applicant walkthrough in the isolated fixture

1. Complete the M4 human recommendation and owner AAL2 decision `Approved for offer`. Open **Offers and onboarding** from that candidate; the case context must carry across. An arbitrary candidate without owner approval must be rejected by the server.
2. In **Agreements**, register a synthetic legally reviewed employment/contractor/volunteer template with an explicit approval reference. Use only test wording in local fixtures. In production, actual wording needs authorised legal approval; do not paste a fabricated agreement and claim acceptance.
3. In **Offers**, create the offer using the approved template, engagement type, start date, expiry, work/reporting arrangements, compensation and applicable tutor session rate. Review its exact fields, confirm credentials, then use owner **Approve offer** and **Issue approved offer**. Draft offers must remain absent from the applicant view.
4. As the accountless verified applicant, open `/recruitment/application`. Review the issued terms and use **Download offer version … PDF**. Confirm that your own explicit offer acknowledgement is required to accept. A separate agreement acknowledgement is required afterward. Accepting must not create operational access. Try a different case's offer identifier: it must be denied.
5. Return as staff, refresh the candidate engagement, then start onboarding for the accepted offer. Review the role-specific checks. Create an additional approved document/declaration/internal-check requirement where necessary and assign staff and due dates.
6. Approve a synthetic **Code of conduct** template and assign it through **Require an approved policy**. As applicant, review and accept the exact displayed policy independently. Reusing an earlier checkbox must not accept another agreement or declaration.
7. Upload a PDF for an approved document task. It must remain unavailable for verification until the existing scan pipeline reports the correct document/generation clean. Existing 10 MiB/file, eight-file and 40 MiB/case limits still apply. Unknown or failed scanning remains closed. Local tests simulate scan protocol verdicts; they do not establish real scanner acceptance.
8. As assigned staff, select the exact clean same-case document where required and record verification evidence. An unclean, other-case or immutable submitted document substitution must be rejected. Required declarations need the applicant's prior acknowledgement. Complete all mandatory checks; preserve independent verification evidence.
9. As owner, review **Activation**. Supply the verified existing platform identity, approved display name, lawful personnel-retention review/evidence and role permissions. Tutors also need approved supported subjects/grades and an optional correct existing tutor link. Administrators require explicit administration approval; support staff inherit no unspecified portal permissions. Final activation requires AAL2 and the separate activation switch in the isolated fixture.
10. Confirm the tutor is created/linked exactly once and enabled through the existing teaching identity. Verify subjects/grades constrain new scheduling. Existing legacy tutors and their historical records must remain unchanged. Repeating the same request must not create another tutor or engagement.
11. For an owner who also has existing accounting permission, use **Payments** to prepare a bill from completed authorised tutor session references, accepted session rate and approval evidence. Confirm account `5000`, exact session linkage and no duplicate billing. This prepares a bill; it does not transfer money.
12. Open **Staff management** inside Engagement. Suspend an active engagement; the established portal must deny further operational requests. Offboard with an effective date, reason and reconciliation reference. Resolve outstanding sessions/classes or select an eligible replacement before completion. Confirm access is disabled and both the personnel table and detail status show `ended`; teaching and accounting history remain.
13. Repeat personnel safety checks after the applicant review period expires or selection/intake controls are paused in the isolated fixture. An assured owner must still be able to suspend/offboard. This does not grant access to private expired applicant details.
14. Simulate a lost mutation response. **Check previous action/response** must recover a committed request without repeating its consequence. If it never committed, **Cancel pending request/response** records a denial tombstone before a new review. A delayed original request must then fail; cancelling a completed action must preserve it. No credentials, applicant answers or offer terms may appear in browser session storage.

## Reproduce the visual/client review without hosted setup

With locked Node dependencies installed and Python Playwright plus `/usr/bin/chromium` available:

```sh
python3 scripts/recruitment-ui-browser-review.py
python3 scripts/recruitment-lifecycle-ui-browser.py
```

Both scripts start a loopback Vite server, intercept API responses with explicitly synthetic fixtures, block outbound browser requests and close their local processes after review. They do not add/change environment configuration or connect to production. Review screenshots and the JSON evidence under `docs/recruitment/milestone-4-5/visual/`. The first compares Admin/recruitment at four widths; the second exercises connected client workflows, including mobile, with mutable fixtures. Actual SQL/RLS/transaction/security behavior is covered by the separate database/API tests; hosted Auth, Storage, mail, scanning and workers still need their own acceptance.
