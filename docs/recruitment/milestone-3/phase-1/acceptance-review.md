# Focused M3.1 acceptance review

Baseline: `121119bd466cecaf428c52ad331f2af7837fb592`. Branch `work`.
Review restricted to M3.1 and its immediate integration/test boundaries. No M1/M2
general audit was repeated. Inspection was read-only until confirmed regression
reproductions; corrections/tests were then made as explicitly authorized.

## Result

Four dormant material defects corrected. No new publicly reachable critical defect
identified: all thirteen tables and thirteen new helper/trigger functions were already
closed to browser/service access, and all five M3 flags remain database-interlocked OFF.
Ready for review of M3.2 design/implementation authorization; not real applicant intake.

| Finding | Baseline evidence | Resolution |
| --- | --- | --- |
| High latent privacy/authorization: staff helper allowed private drafts and withdrawn/expired case review, including owner | Original migration:309–323 | Correction:11–29 limits read/document/review/allocation/extensions to submitted/under_review/recommendation_recorded. Separate revoke_assignment preserves revocation without read access or target verification. Hold/conflict governance remain independent; purged is denied. |
| Medium completeness: SQL btrim accepted tabs/newlines/Unicode-only required answers that JS trim rejects | Original:185,198; shared schema src/lib/recruitment-applications.ts:123–129 | Correction:32–64 explicitly uses the ECMAScript whitespace set for required base/question text. |
| Medium notice evidence: a valid email revision could acknowledge an arbitrary notice unrelated to the pinned form | Original:471–474 | Correction:94–99 compares against the form's approved notice. Withdrawal may refer to an actual prior affirmative consent, without being forced to accept a replacement notice; fabricated old notices fail. |
| Medium retention integrity: withdrawn_at could be set while state stayed submitted, shortening retention to30 days while remaining reviewable | Original:140–149,328–344 | Correction:4–9 adds recruitment_case_withdrawal_state. Existing contradictory rows cause transaction failure, not silent relabel/erasure. |

New regressions first produced **4 failures /26 passes** on the original baseline.
After corrections and expanded acceptance coverage the foundation suite has35 passes.
Existing authorization fixtures now seed submitted cases for staff PII tests rather
than treating unsubmitted drafts as reviewable. No regression assertion was removed.

## Ten requested checks

1. Exact scope/form/vacancy/version/publication composites remain enforced by FKs
   and guards (original:65–170,347–404). Payloads/staged proofs reject other-case forms
   and data; contact scope/vacancy cannot be rewritten. These are ownership invariants,
   not substitutes for M3.2's fresh eligibility/deadline checks.
2. Conflict predicate runs before owner shortcut. Active scope+case assignments are
   required for managers/officers. New tests exercise all three roles after verified
   email matches and changes. Independent resolution cannot clear current self-match.
3. New M3 functions have no write path to immutable M1 requests/events. Case PII lives
   in separate tables; requests use keyed digests, audit uses typed metadata. Tests
   check this boundary. This is not a universal DLP guarantee for arbitrary trusted DB
   operators or humans entering PII into unrelated legacy free-text governance fields.
4. Contact partial unique indexes use normalized email+vacancy, independent of key
   version/HMAC. Rotation cannot create a duplicate active application. Retained
   inactive replacement requires independent owner approval evidence.
5. Retention clocks, finite current-owner extensions, withdrawal precedence, hold
   locks, immutable barrier and live-PII purge checks pass. Six-month unsuccessful
   calculation is reserved only; final decisions remain unavailable. Real parallel
   hosted contention and external Storage erasure are not certified by local tests.
6. No applicant API exists. No new function/table execution/write grant was added.
   Direct service-role invocation of the actor-UUID helper fails. Existing APIs remain
   unchanged. Helpers are internal predicates, not authenticated RPCs.
7. vacancy_intake_enabled, talent_pool_intake_enabled, applicant_email_enabled,
   document_uploads_enabled, case_processing_enabled all default false, NOT NULL and
   CHECK-interlocked. Each attempted enablement fails in isolated SQL.
8. Full recruitment/enrollment/teaching/academic/accounting tests pass; populated
   upgrade preserves existing people, grants, tutors/bindings, vacancies/history and
   ledger data. M1/M2/tutor/accounting function definitions remain unchanged.
9. The thirteen tables fit M3.2's cases, contacts, forms, payloads, consent and stable
   request identity without a new applicant identity model. Three previously deferred
   entities are needed (email challenges, sessions, outbox), plus a justified separate
   public-abuse counter. Proposed digest-version/cancellation changes are minor
   dependent-phase extensions, not implemented as acceptance fixes.
10. case_evidence_days/notice/approval fields default NULL. Ninety days appears only
    as an unapproved recommendation, never a production fallback. A test assigns90
    synthetically and proves all flag enablements still fail. No live values inspected.

## All thirteen entities inspected

- intake_forms: immutable owner-approved definitions, exact approved vacancy/version
  and scope, fixed template/document policy, bounded definition and server digest.
- intake_form_bindings: exact composite links, owner check, default off, one enabled
  binding per version or pool scope, publication check and immutable binding identity.
- cases: exact purpose/form/publication, fixed lifecycle, revision+1, immutable identity/
  submitted pins, finite computed retention, forbidden final decision, barrier guards.
- case_contacts: verified email revision, normalized private email, independent lookup
  HMAC version, active uniqueness, controlled replacement and immutable ownership.
- case_payloads: case/revision uniqueness, correct pinned form, strict partial/complete
  answers, sealed-update protection while controlled erasure stays possible.
- case_assignments: case/staff PK, no self grant, scoped verified eligible target,
  current actor/conflict checks, immutable identity, revocation-safe target handling.
- case_conflicts: case/staff PK, coded source/independent resolution, sticky identity,
  no self-clear, no clearing current verified match.
- consent_events: case/purpose/action/email revision/approved notice, calendar expiry,
  finite evidence, UPDATE-immutable but controlled retention DELETE possible.
- case_audit: coded action/actor/revision/digest only, proper stable applicant/staff
  identity, finite expiry, normal UPDATE denied, no arbitrary PII details field.
- privacy_holds: case-purpose FK, protected authority/reference, review/release, case
  lock and irreversible barrier, independent current owner; original placer can be disabled.
- case_requests: stable principal/case/request PK, canonical keyed digest, immutable
  original command and committed result, opaque result UUID and finite cleanup date.
- staff_change_buffers: bounded short-lived PII, actor/session/revision/digest, exact
  five-minute bounds and immutable content/one-way consumption.
- case_challenges: exact stage/case/staff/session/operation/digest binding, five-minute
  hash-only proof, one-way consumption and no contact/answer body.

All names have recruitment_ prefix. All RLS enabled, all direct PUBLIC/anon/
authenticated/service_role table privileges revoked. No permissive RLS policies.
Function execution denied to those roles, empty search_path/qualified relations.
DB owner bypass remains a trusted operational boundary; FORCE RLS is not claimed.

Nineteen explicit supporting indexes (in addition to PK/UNIQUE-generated indexes):
form_version; binding_active_version/pool; publication_identity; case_queue/retention;
active_vacancy_email/pool_email; contact_lookup/conflict_lookup; case_assignment;
case_conflict; consent_case; case_audit/audit_expiry; active_hold; case_request_expiry;
change_buffer_expiry; case_challenge_expiry. Index names carry recruitment_ prefixes.

## Files and migration identity

Created:

- supabase/migrations/20261111020000_recruitment_intake_acceptance.sql
- docs/recruitment/milestone-3/phase-1/acceptance-migration.sql
- docs/recruitment/milestone-3/phase-1/acceptance-review.md
- docs/recruitment/milestone-3/m3.2-implementation-plan.md (proposal only)

Modified:

- supabase/schema.sql: append acceptance block, original blocks intact.
- src/lib/recruitment-applications.ts: internal revoke_assignment action.
- src/test/recruitment-intake-foundation.test.ts: nine new tests, adjusted submitted
  authorization fixtures, full-chain rerun/upgrade and unchanged legacy assertions.
- docs/recruitment/milestone-3/phase-1/architecture-and-contracts.md: current correction.
- docs/recruitment/milestone-3/implementation-plan.md: link current review/proposal.

Original canonical SHA-256 (UNCHANGED):
77acdaff19f4a621a7e077b61d4f5e419ba9d35dc622d9fea5ae5d021233d795

Correction canonical SHA-256:
a8076db574006eff3a0b21ee322479ad9821f6158713a934af767347647c5e35

Correction transaction bundle SHA-256:
dccff3ec5138274a9ce71e6638c37bcb6c43aef50ed204047a3d363eee66644f

Order M1 → M2 → original M3.1 → correction. The historical original M3.1 bundle alone
must not be replayed over corrected functions. Fresh schema includes both canonical
blocks. New migration adds one CHECK and replaces three M3 helpers; no table/column
deletion, data rewrite, new API, service grant, Auth setting or rollout enablement.

## Verification and limitations

- Complete suite:411 passed /41 files, zero failed/skipped, including35 foundation tests.
- Both application and API TypeScript checks passed.
- Lint:0 errors,7 pre-existing Fast Refresh warnings.
- Production build exit0;19 routes +noindex404. Existing Browserslist/SSR warnings and
  known post-prerender `The build was canceled` diagnostic remain.
- Canonical/fresh-schema/bundle equality, populated preservation and whitespace checks pass.
- A correction transaction rejects contradictory installed withdrawal rows and preserves
  them unchanged on rollback. Operators must reconcile such data under explicit authority.

All DB execution isolated PGlite, with synthetic identities/data. No live target,
provider or browser UI acceptance claimed. No M3.2 implementation, public mail,
uploads, production SQL, flags, push, merge or deployment.

Remaining high launch gates: approved notice/retention/evidence/hold/backup policies;
real provider and scanner acceptance; complete rights/deletion/restore controls;
actual Supabase grants/Auth-trigger ownership/contention and hosting configuration.
Medium implementation dependencies: capability/session/proof/abuse/outbox/cancellation
contracts in the next-phase proposal; no candidate can currently reach these helpers.
Low known diagnostics: existing lint/prerender warnings and conservative JSON byte caps.

Recommendation: accept corrected M3.1 at code level and review the concrete M3.2 plan.
Do not enable real collection or remove the interlock. M3.2 remains unimplemented.
