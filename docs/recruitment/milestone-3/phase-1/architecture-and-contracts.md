# M3.1 database and authorization foundation

Status: implemented locally under the conditional M3 authorization, on `work`.
This phase stops before M3.2. There are no applicant routes, email sends, sessions,
uploads, scanner deployments, staff case screens, workers or live mutations.

Acceptance update: apply `20261111020000_recruitment_intake_acceptance.sql` AFTER the
original migration. See [acceptance-review.md](acceptance-review.md). Original SQL and
checksum remain unchanged; the fresh schema includes both blocks. Ordinary staff PII
access/allocation is now limited to submitted/under-review cases, not private drafts,
withdrawn or expired cases. Separate `revoke_assignment` permission preserves revocation
without granting review access. Positive notice evidence is bound to the approved form;
withdrawal may refer to an actual prior consent without accepting a replacement notice.
SQL completeness uses the same whitespace set as JavaScript trim. Withdrawal timestamps
must agree with the case state. Do not replay the old standalone M3.1 bundle over fixes.

## Decisions and phase boundaries

Accepted business rules: accountless verified email; initial adult-only recruitment;
one active application per verified email/vacancy; explicit requirement rebase;
PDF-only 10 MiB/file, eight files, 40 MiB/case; mandatory clean documents before
submission; no final hire/reject/interview/onboarding/activation/compensation.

Retention: qualifying draft activity +14 days; submitted review +12 calendar months
with authorized finite extensions; withdrawal +30 days; future authorized unsuccessful
closure +6 calendar months; pool affirmative consent/renewal +12 calendar months.
Instants are UTC, calendar-month arithmetic uses Africa/Johannesburg. Actual privacy
notice and retention-policy acceptance remain launch gates, not inferred approval.

The 22-entity proposal was reviewed. Thirteen distinct foundation entities are
implemented; nine dependent entities remain deferred, rather than shipped as empty
integration features. No extra global applicant, applicant Auth, or pool registration
table is necessary. A pool registration is a separate-purpose case. Review extensions
live on the case with protected approval references, not a second identity/workflow.
Contact, answers, staged staff PII, proof hashes, consent and audit remain separate
because their exposure and erasure rules differ. Proofs cannot contain full staged
PII, and neither case data nor permanent case links enter M1 immutable journals.

## Exact migration and dependencies

Canonical: `supabase/migrations/20261111010000_recruitment_intake_foundation.sql`.
`migration.sql` in this directory wraps that exact content in a transaction.
The fresh schema has the identical `BEGIN/END RECRUITMENT MILESTONE 3.1` block.

Requires the reviewed M1 migrations 20261109010000–040000, then M2
20261109050000. The M2 acceptance fix e29ef09 is an application dependency;
it does not change the M2 migration. Never replay the old M1-only bundle after M2.

No existing application data is updated. Existing M1/M2/teaching/accounting functions
are not replaced. Added settings columns default off, plus fixed review/withdrawal
durations. The named CHECK `recruitment_m31_intake_interlock` rejects enabling any
new M3 flag, even through an ordinary settings update. A separately reviewed later
migration must replace that interlock when dependent phases are accepted. Existing
`public_vacancies_enabled`, safeguard and MFA controls remain unchanged.

Two additive integration points capture known identity conflicts: an AFTER INSERT
trigger on recruitment_staff, and AFTER UPDATE OF email,email_confirmed_at on
auth.users. A contact trigger also captures matches. They store case/staff IDs and
coded source only, perform no external work and do not change Auth rows/settings.
These triggers require actual target privilege/performance acceptance before live SQL.

## Tables, keys and relationships

The canonical SQL is the executable field/type/constraint contract. All identifiers
are UUIDs, revisions integers, instants timestamptz and bounded content JSONB.

| Table | Key / exact relationship and important constraints |
| --- | --- |
| recruitment_intake_forms | PK id; scope FK; exact (vacancy_id,version_id) FK to M2 approval; unique (id,purpose,scope_id) and (id,vacancy_id,version_id); current verified recruitment-owner approval; fixed m3.1-v1 template/pdf-v1 policy; full definition must equal the reviewed SQL template plus approved vacancy requirements; database-computed SHA-256; immutable update/delete |
| recruitment_intake_form_bindings | PK id; unique form_id; composite form/purpose/scope and form/vacancy/version FKs; default disabled; one enabled binding per exact vacancy/version or pool scope; verified owner only; enabling a vacancy binding requires its current published version; binding identity cannot be rewritten |
| recruitment_cases | PK id; unique random reference; exact form/purpose/scope, form/vacancy/version and vacancy/version/publication FKs; single purpose; bounded lifecycle/revision; automatic retention computation; finite documented owner extensions; no Auth applicant FK; unsuccessful_closed_at forbidden until separately approved final-decision work |
| recruitment_case_contacts | PK case_id; composite case/kind/scope FK ON DELETE CASCADE; verified timestamp and email revision; normalized email; HMAC/key version; active uniqueness per email/vacancy (or email/pool scope); inactive prior case requires independent owner reapplication authorization/reference while retained |
| recruitment_case_payloads | PK id; case FK CASCADE, form FK; unique (case_id,revision) and (case_id,id); SQL partial/full answer validation; draft updates permitted; submitted/correction updates forbidden; controlled erasure remains possible |
| recruitment_case_assignments | PK (case_id,user_id); staff/granting staff FKs; self grants forbidden; enabled target must be verified, active, scoped and non-conflicted; current grantor case authority; disablement does not require target verification |
| recruitment_case_conflicts | PK (case_id,user_id); staff FKs; coded source; sticky history across email changes; verified match capture; independent verified owner resolution/reference; no self resolution or clearing an actual current identity match |
| recruitment_consent_events | PK id; case FK CASCADE; purpose/action/notice/email-revision binding; pool consent cannot be inserted for a vacancy case; twelve-calendar-month affirmative pool expiry; append-only UPDATE protection; finite evidence expiry; controlled retention DELETE possible |
| recruitment_case_audit | PK id; case FK CASCADE; applicant/staff/worker actor kind; applicant principal must equal case; staff principal must exist; fixed coded actions, revisions, digests, request IDs, finite expiry; no arbitrary details or PII payload; ordinary UPDATE forbidden, controlled retention DELETE possible |
| recruitment_privacy_holds | PK id; case FK RESTRICT; purpose, legal/rights reason code, opaque evidence reference, owner authority, review/release timestamps; lock case; no late hold after irreversible barrier; release does not depend on original owner's continued authentication |
| recruitment_case_requests | PK (case_id,actor_kind,actor_id,request_id); stable applicant principal=case ID or existing staff identity; coded operation/keyed digest/state/opaque result; original command identity immutable; committed result immutable; no session ID in principal and no answer payload |
| recruitment_staff_change_buffers | PK id; case FK CASCADE/staff FK; session/digest/revision binding; bounded 8 KiB staged PII; maximum five-minute expiry; immutable staged content; one-way consumption |
| recruitment_case_challenges | PK secret_hash; case/staff/change FKs; exact staged case/staff/session/operation/revision/digest match; maximum five minutes; no PII payload; immutable action identity; one-way consumption |

Indexes cover scope/submitted_at/id keyset queues, due case retention, active
assignments/conflicts/holds, exact form versions, active bindings, purpose-keyed email
lookup, protected normalized-email conflict lookup, case/revision payloads,
consent/audit chronology and expiring proof/request/buffer data. The new unique M2
publication identity index enables an exact three-column publication FK.

Normalized email is already required contact PII. Partial unique indexes use that
protected field instead of a versioned HMAC as the uniqueness anchor. Thus rotating
an HMAC cannot manufacture a second active application. HMACs still provide bounded
purpose-specific lookup. No public email directory is exposed. Before creating a
replacement while old contact data remains, a future owner-confirmed operation must
provide independent approval. Full lawful erasure does not retain email indefinitely
just to detect future reapplication.

## Forms and validation contract

`src/lib/recruitment-applications.ts` exports `createIntakeDefinition`,
`intakeAnswersSchema`, `documentPolicy`, `caseStates`, `caseActions`, `intakeErrors`.
SQL/TypeScript template parity is tested for all roles and the general pool.

Answer envelope: `{fields:{...},questions:{...}}`, strict unknown-key rejection.
This namespace separation permits the same key in a base field and custom question
without changing meaning. No arbitrary scripts, HTML, expressions, regex or URLs.

Common fields: firstName/lastName (100 chars), optional phone (40), location (160),
availability (2000), adultConfirmed and privacyAcknowledged booleans. Both affirmations
must be true for a complete payload. No DOB/ID/bank/medical/referee data is collected.

Tutor: subjects/grades selected from the exact approved vacancy, qualifications
(2000), teachingExperience (4000). Administrator: administrativeExperience (4000),
administrativeSkills (2000). Support: supportExperience (4000), supportSkills (2000).
Pool: categoryInterests/engagementInterests, experience (4000), skills (2000), no
mandatory tutor fields or documents. Initial pool CV policy is minimal/no CV.

Custom questions preserve M2 text/yes_no/number, required flag and key. Text is bounded
at 4000; finite JS-range numbers only. Partial drafts may omit fields; complete
payloads enforce every required value. Multi-selects reject duplicates/unknown options.
Wire answers cap is 64 KiB; database JSONB text also caps at 64 KiB (its formatting can
make a boundary payload fail conservatively). Definitions cap at 32 KiB.
More than eight declared document items is rejected even if some are optional:
M2's twenty-item capacity cannot create an impossible M3 intake definition.

## Authorization and exact internal signatures

All 13 tables enable RLS. PUBLIC, anon, authenticated and service_role have no direct
SELECT/INSERT/UPDATE/DELETE grants. No policies allow browser access. All new functions
revoke execution from those roles; no M3.1 HTTP endpoint or callable service RPC ships.
Database owners remain trusted. RLS is not claimed to resist a compromised DB owner.

Internal helpers (not an authorization credential or browser API):

```text
recruitment_intake_field(text,text,boolean,integer,jsonb) → jsonb
recruitment_intake_definition(text,text,jsonb) → jsonb
recruitment_answers_valid(uuid,jsonb,boolean) → boolean
recruitment_case_conflicted(uuid,uuid) → boolean
recruitment_case_staff_allowed(uuid,uuid,text) → boolean
recruitment_retention_deadline(text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz) → timestamptz
```

All functions use empty search_path/qualified relations. Trigger functions are also
non-callable by service/browser roles. Later narrow RPCs must validate the provider
staff session or verified case-capability BEFORE using these helpers, check current
authority before replay, enforce rollout flags and applicable owner AAL2, and audit
the actual actor. Passing an owner UUID is not authentication.

| Action | Owner | Manager | Officer | Applicant/worker in M3.1 |
| --- | --- | --- | --- | --- |
| Case read/document/review | Current verified owner, submitted/review state, no conflict | Submitted/review state + enabled staff console + active scope + explicit case assignment + no conflict | Same | None; no capability/worker RPC exists |
| Allocate case | Same owner checks | Same manager checks; eligible other target | Denied | Denied |
| Hold/extend retention/resolve conflict | Independent current owner only; protected evidence | Denied | Denied | Denied |
| Final decisions/activation | Denied; no action/state available | Denied | Denied | Denied |

Finance/general Admin membership and M2 vacancy-edit assignment never substitute
for case authorization. Case authorization is independent of vacancy closure.
Known identity conflicts deny all actions, including owner; only independent review
can resolve historical conflicts. Case deletion_pending denies ordinary access;
independent holds may still be placed before its irreversible barrier. Purged cases
are unavailable. The helper tests permissions, not rollout: it cannot be used as a
standalone later read API that forgets case_processing_enabled.

## Reserved proof/idempotency contracts

Case requests use stable actor/case/request UUID + canonical keyed digest; credentials
are excluded. Staff PII lives in the expiring buffer; proof identity contains only
metadata/digest. Changed reuse is rejected, completed outcome cannot be rewritten,
and proofs/buffers cannot be unconsumed. No claim of implemented HTTP recovery,
outbox or submission semantics is made in M3.1.

Existing API error handling is unchanged. The new shared `intakeErrors` map reserves
400 invalid_request;401 verification_required;403 access_denied;404 case_unavailable;
409 revision_conflict/requirements_changed/request_conflict/incompatible_document_requirements;
413 answers_too_large;429 rate_limited;503 intake_disabled/scanner_unavailable.
No new route/rate budget/worker privilege is released in this phase. M3.2 must freeze
its wire schemas, numeric abuse limits and narrowly granted capability RPCs before
implementing them. Existing staff rate limits remain unchanged.

## Deferred entities and next phase gate

Deferred: email_challenges, applicant_sessions, case_documents, document_scans,
submissions, case_notes, deletion_jobs, retention_runs and email_outbox (all with the
`recruitment_` prefix). Their exact DDL/API/provider contracts are finalized in their
dependent phases. This phase neither sends mail nor creates a no-op scanner.

Before M3.2: review this implementation/report; finalize generic email/proof/session
contracts, HMAC/key handling, abuse budgets, one-time exchange, narrow create/recovery
RPCs and sanitized outbox adapter. No M3.2 work begins as part of this delivery.
