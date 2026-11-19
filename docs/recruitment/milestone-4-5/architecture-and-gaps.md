# M4/M5 architecture and gap review

Reviewed baseline: `a43264159ef549e1360005e14f5e21b0a166cd83` on `work`; remote refreshed 2026-11-15. `main` is `ac7228bbdcb9826146662a2319d4e2b07e626ac6`. No unrelated working changes or applicable AGENTS.md were found. This is an integration review, not a repeat general M1/M2 audit.

## Existing contracts to preserve

- `api/recruitment.ts` multiplexes three independently authorized APIs. Eleven unrelated functions plus this one consume the 12-function budget; handlers belong under `api/_lib`.
- M1 staff Auth uses verified Supabase identities, dedicated cookies, fresh password confirmation, owner TOTP/AAL2 and database scope checks. M3 `fresh` can be reused for sensitive mutations without a new authentication system.
- M2 approved/published snapshots and M3 immutable submission payloads are authoritative. Applicant data must never enter permanent M1 governance request payloads.
- M3 applicant access is an expiring, revocable case capability; uploaded PDF bytes pass quarantine/scanning before clean access. Existing case access enforces assignments, scope, conflicts and owner assurance. Reuse those checks.
- Email dispatch uses a deduplicated outbox and recipient reauthorization; scan/mail/retention workers already have authenticated routing. Extend their work without new serverless entry points or configuration variables.
- `teaching_tutors`, teaching bindings/history and existing accounting remain authoritative. Recruitment is not an alternate tutor or accounting system.
- Existing `RecruitmentAdmin` is separately authenticated but uses a distinct top navigation. Reuse Admin Dashboard layout classes, brand and navigation conventions without inheriting general Admin permissions.

## Gaps and implementation phases

1. Shared authenticated recruitment shell, permission-aware navigation and accurate readiness copy.
2. Selection tables/RPCs, screening, shortlist, interviews, independent scorecards, corrections, recommendations and owner decisions.
3. Engagement tables/RPCs, approved versioned agreements/offers, secure applicant responses, onboarding, explicit activation, authoritative tutor/admin integration and controlled offboarding.
4. Unified staff workspaces, applicant interview/offer/onboarding views and role-scoped aggregate reports.
5. Lifecycle reminders/expiry via existing worker/outbox; preserve retention and case deletion boundaries.
6. Database/security/concurrency tests, API/UI tests, existing regressions, browser/visual checks and function budget verification.
7. Ordered additive migration package, preflight/read-only acceptance SQL, forward recovery/runbooks and practical review instructions.

## Unresolved business and operational acceptance

No legal text is pre-approved. South African employment/contracting/privacy/electronic acceptance needs authorised legal review. An offer acceptance record alone is not a claim of enforceability. Privileged provisioning must be explicitly approved, and support-staff capabilities are limited by the existing platform's actual permission model.

The two-independent-owner release requirement remains in force. A sole-owner alternative requires a separately reviewed recovery policy, independent recovery custody, tested restoration and explicit owner approval; creating a second account for the same person is not independent control. No such exception is applied here.

Production email delivery, scanner/TLS/signatures, scheduling, Storage controls, owner recovery/MFA, backup/restore and erasure acceptance are unverified in this workspace. No production credentials are configured. Document existing configuration dependencies; add/change no environment variables. Develop using synthetic isolated PostgreSQL and retain fail-closed production behavior.

Production M1–M3 installation and 42 RLS tables are user-reported historical facts, not fresh hosted verification. Never rerun the fresh installer. No production SQL, flags, real staff activation, communications, pushing, merge or deployment is authorised by this implementation task.
