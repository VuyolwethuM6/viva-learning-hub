# M3.1 retention, evidence and operational recovery boundaries

Implemented controls are dormant. This document defines required later operations;
it does not claim a working retention worker, scanner, mailbox or rights portal.
Real applicant collection remains prohibited until notice/policy and operational
acceptance are separately approved. All M3 flags are off and database-interlocked.

## Retention contract

| Purpose | Basis |
| --- | --- |
| Draft | 14×24 hours after last meaningful successful applicant edit/completed authorized upload |
| Submitted review | Twelve calendar months after accepted submission |
| Review extension | Finite later expiry; current independent owner, documented external approval reference; no automatic renewal |
| Withdrawal | 30×24 hours after verified withdrawal; overrides any prior review extension |
| Unsuccessful | Six calendar months after an authorized final closure in a FUTURE separately approved workflow |
| Pool | Twelve calendar months from affirmative consent/renewal |

Use UTC instants and Africa/Johannesburg calendar-month arithmetic. Case triggers
derive retention_due_at rather than trusting an input deadline. Reads never write
activity. Recovery, session refresh, resend, staff views and scanner callbacks must
not renew a draft. M3.2 save/upload RPCs will be responsible for proving qualifying
activity; M3.1 exposes none. A review recommendation is not final rejection.

Retained extension authorization remains evidence after withdrawal but cannot extend
the 30-day deadline. Extension fields cannot introduce infinity, an earlier expiry,
an unverified/non-owner authorizer or a known self-conflict. Effective extensions are
allowed only for submitted/under_review/recommendation_recorded vacancy cases.

## Evidence schedule and privacy approval

The engineering recommendation is minimal case audit/consent/erasure evidence for
90 days after the relevant operational purpose ends, unless a documented legal
obligation/hold requires a different period. THIS NUMERIC EVIDENCE PERIOD REQUIRES
CONTROLLER APPROVAL; it is not silently installed as an approved legal policy.
`recruitment_settings.case_evidence_days` defaults NULL. Privacy notice version,
approval timestamp and approval reference also default NULL. Later enablement must
require those values and accepted policy evidence. Existing M1 privacy-policy text
or retention constants are insufficient to approve recruitment intake.

Case audit/consent/request rows require finite explicit evidence expiry. Later
producers derive it from the approved schedule, not a client-supplied timestamp;
workers must also check the case's current retention/extension/hold before pruning.
Proofs and staged PII expire within five minutes; scrub consumed staged payloads
promptly after their committed operation and expire unused buffers. M3.2 must define
email/session/outbox TTLs before adding their tables. No permanent raw proof/mail
archive, broad email directory or indefinite pseudonymous event retention.

M1 immutable governance tables are left intact. They receive no candidate PII,
free-text case note or permanent case identifier. Form governance can contain only
non-applicant definitions. New case journals are update-protected but deliberately
not DELETE-immutable: a later specifically authorized retention RPC can erase them.
Browser/service roles have no direct deletion permission. DB owners are trusted.

## Hold authority and independent review

An active verified recruitment owner without a conflict is the technical authority;
the controller's protected legal/privacy approval record supplies the substantive
authority. Managers/officers may request review later, not place/release holds.
Future owner mutations require the existing fresh confirmation/AAL2 policy and
case-bound proof before commit. There is no new bypass or callable hold RPC now.

Each hold has case/purpose, reason code, opaque protected evidence reference and a
finite review date. No arbitrary legal narrative/PII is copied into immutable audit.
M3.1 holds are case-purpose scoped: document-specific holds can be added only with
the document phase and must not retain another purpose's objects accidentally.

Placement/release locks the case. The case may be deletion_pending before the
irreversible barrier; a valid hold can still intervene. Once the barrier is crossed,
late hold requests fail and require operator/controller escalation; already erased
data cannot be reconstructed as a normal action. A released hold cannot be rewritten.
Release uses current independent authority, even if the original placer is disabled.
Holds never restore sessions, recruitment use or outreach. Review/release reminders
and scheduler execution are deferred to M3.6.

## Deletion protocol to implement before collection

1. Policy worker claims a due job with a bounded lease and sanitized identifiers.
2. Lock settings/vacancy/case consistently; compare real clock after lock waits.
3. Recheck active holds and effective retention. Mark pending, revoke ordinary
   capabilities, cancel outbox/scan work. Preserve restricted rights/status access.
4. Recheck holds under the same case lock and record the irreversible barrier.
5. Delete exact owned private objects via Storage API; account for actual upload URL
   lifetime and scan lease bound. Never SQL-delete storage.objects.
6. Remove contact/answer/note/buffer/proof/request data under approved policy. Preserve
   only minimal time-limited erasure evidence without a perpetual email lookup.
7. Verify both DB and Storage absence, reconcile late writes/callbacks, then complete.
8. Partial failures stay pending with lease/backoff/alerts; no false success status.

M3.1 already prevents reversal of a barrier, active-hold crossing and marking a case
purged while foundation PII/proof/request records remain. Document/Storage checks
must be added with those phases; M3.1 does not certify external erasure.

Do not delete retained forms/M2 versions to erase applicant answers. Do not disable
triggers, issue blanket grants, delete M1 journals or confuse logout with erasure.

## Backup restoration and incident recovery

Before accepting real data, the controller/operator must approve actual backup,
provider and log retention, encryption, region and restore access. Live-row erasure
does not promise instant backup erasure. No cryptographic-erasure claim is made.

Required restore procedure:

1. Document operator authorization, independent approval and incident/change ID in
   the protected operational process. Use the existing owner recovery runbook for
   lost owners; no new owner bypass.
2. Restore into an isolated/disabled environment; keep public intake, mail, uploads
   and pool disabled. Do not restore old rollout flags into active service.
3. Reconcile a separately protected, finite-retention erasure/revocation ledger from
   after the backup cutoff. Its storage/retention implementation is an M3.6 gate.
4. Invalidate pre-restore applicant proofs/sessions and worker/outbox/scan leases.
   Reconcile already sent mail/object generations; rotate compromised secrets.
5. Reapply verified deletions, withdrawals and consent revocations. Verify no erased
   contact/answer/object or expired consent is revived. Do not let a stale scan promote.
6. Independently verify owner identities, active grants, sticky conflicts, holds,
   policy versions and current providers. Test new recovery proofs before re-entry.
7. Record sanitized evidence and obtain explicit operational re-enable approval.

Email outage: no verification bypass. Preserve valid restricted privacy capabilities;
new rights requests need a documented independently verified controller process.
Scanner outage: fail closed, retain recoverable draft, no unknown=clean fallback.
Compromised capability: revoke/rotate case authority and old email revision; no
global staff or tutor activation. Logs use coded failure and opaque references,
not emails, names, answers, bearer proofs or signed URLs.

## Production migration and rollback

M3.1 adds 13 tables, settings columns, indexes and internal functions/triggers. It
changes no production rows/services in this work. Before live execution inventory
exact M1/M2 definitions/default grants/function owners, auth trigger privileges,
object collisions and the applied migration history. IF NOT EXISTS is not schema
reconciliation. Rehearse a populated upgrade and evaluate lock/performance impact.
Present canonical SQL/checksum/validation/backup/operator evidence for separate approval.

Before commit: rollback entire transaction on any error. After installation: retain
the interlock and disabled flags; prefer forward fixes. No destructive table rollback
after PII exists. Do not restore old M1-only function bundles over M2. Removal of the
interlock is its own reviewed later change, never an ordinary feature toggle.

M3.1 has local PGlite evidence only. Actual hosted Auth, inherited grants, triggers,
multi-connection races, mail, Storage, backups and scanner acceptance remain separate.
