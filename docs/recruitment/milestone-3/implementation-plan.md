# Proposed M3 implementation sequence and approval decisions

**Not implementation authorization.** M2 acceptance fixes are separate from this design. Do not create M3 tables, endpoints, buckets, scanner deployments, mail jobs or live flags until the design is approved. Do not begin interviews, final hiring, onboarding, compensation or activation.

## Required decisions before implementation/launch

Confirmed rules remain: no applicant accounts initially; mandatory email verification before uploads/final submission; completeness-only screening; human hiring decisions; owner-only final decisions; independent recruitment roles; email notification only;14-day abandoned drafts, 6-month unsuccessful cases and 12-month pool retention subject to policy/holds; accepted agreements/verified documents/onboarding/explicit owner activation before any future account access; authoritative `teaching_tutors` unchanged.

| Decision requiring approval | Recommended proposal / consequence |
| --- | --- |
| M3 case-management boundary | Staff may receive/review/assign/note/recommend. Final hiring/rejection remains unavailable. If owner-only unsuccessful closure must enter M3, approve that operation/flag/communications explicitly; do not implement it as a disguised administrative timer. |
| Submitted/open-review and withdrawal retention | Approve finite purpose-based deadlines and review/escalation. Six-month unsuccessful retention starts only at authorized unsuccessful closure; vacancy closing/recommendation does not start it. No launch with indefinite unreviewed cases by omission. |
| Draft lifetime | 14 days after meaningful successful applicant edits/completed uploads. Reads, refresh/resend/recovery and staff activity do not renew it. Any absolute draft-age cap beyond this needs separate policy approval. |
| Version changes | Require explicit applicant review/rebase to the current approved form before submission. Preserve old draft data; never silently reinterpret answers. Alternative grandfathering needs a separately approved cutoff/deadline policy. |
| Submission while scanning | Initial proposal requires clean required documents before final submission. If a before-deadline sealed/security-pending receipt is needed, approve document-remediation windows, receipt wording and owner extension rules before implementation. |
| Duplicate/reapplication policy | One active case per verified email/purpose/vacancy, independent of version; recovery resumes it. Approve withdrawal/reapplication exceptions before unique constraints are finalized. |
| Talent-pool consent | Independent opt-in, 12-month clock from affirmative consent/renewal, no automatic job-to-pool transfer. Approve renewal reminders, withdrawal handling and whether optional CVs are justified. |
| Minimum data and age eligibility | Approve role-field inventory and lawful basis; no national ID/bank/medical/referee details by default. Decide adult-only recruitment versus a lawful under 18 process before collecting minors' data. This is a legal/privacy eligibility decision, not an automated merit score. |
| Document policy/scanner | Proposed PDF-only 10 MiB/file,8 files / 40 MiB per case. Select a suitable real private scanner/operator, region/subprocessors, accepted signature freshness, scan timeouts and support/incident ownership. Public uploads cannot launch with a fake/no-op scanner. |
| Clean document delivery | Proposed60-second signed URLs have a bounded revocation window. Approve that risk or select an authenticated streaming proxy after testing actual hosting payload limits. |
| Privacy/legal holds and audit evidence | Controller/privacy authority approves hold placement/release, proof/audit retention, deletion targets, backup expiry/recovery and irreversible-purge barrier handling. Do not assume pseudonymous event IDs can be retained forever. |
| Email/abuse readiness | Approve sender/domain/templates, delivery monitoring, generic recovery behavior, per-purpose budgets and any bot-challenge provider. No global staff mailbox receives CVs/answers by default. |

These decisions are not a request to change production now. Resolve them in design approval and operational acceptance; current intake remains unavailable.

## Phased engineering plan

### M3.1 — privacy model, schemas and authorization core

Dependencies: accepted M2 review; actual target inventory; approved PII/retention/actor boundaries.

Deliver restricted role schemas, immutable form versions/bindings, case/contact/payload/consent core, separate case proof/request/audit stores, conflicts and default-off flags. Reuse existing staff Auth; no Auth applicants or tutor/admin grants. Add pure schema and populated-upgrade tests before feature routes.

Acceptance: schema rejects cross-case/version references; staff/context isolation negative tests pass; a candidate UUID cannot authorize anything; no applicant PII can enter M1 immutable logs; legal-hold/deletion dependency model reviewed. Existing M1/M2/academic/accounting behavior remains unchanged.

### M3.2 — verified email, draft access and recovery

Dependencies:1; accepted mail adapter and sanitized logging.

Deliver rate-limited generic initiation/resend/recovery, deliberate proof exchange, purpose/email-bound cookies, revocation and server-side draft saves. Implement draft conflict handling, meaningful-activity expiry and minimal applicant status/receipt access. Add no-document form wizard first, with private loading/error/saved states and accessibility.

Acceptance: no accounts created; no upload/submission before verification; GET mail-prefetch cannot consume proof; expired/reused/wrong-email/wrong-purpose proofs fail; email changes revoke prior authority; enumeration/rate-limit behavior tested; no PII/secrets persist in browser storage or telemetry. Lost-response retry uses the same request ID and restores only an authorized case.

### M3.3 — quarantine and real scanner integration

Dependencies:1/2; approved actual scanner, Storage configuration and operational capacity.

Deliver bounded document reservations, private no-overwrite uploads, independent finalization, worker leases/authenticated callbacks, exact-byte checksum/scan/immutable promotion, clean-only access and orphan cleanup. Run real engine tests in a controlled environment with benign, known test-malware, encrypted, malformed, oversized and timeout fixtures. Do not send real applicant files to unapproved scanners.

Acceptance: fake/wrong/old callbacks and checksum substitution cannot mark a file clean; known test-malware/unknown results remain blocked; overwrite attempts cannot change served bytes; provider token lifetimes/late uploads are measured; old/deleted cases cannot expose promoted files; only accepted healthy scanner readiness can unlock uploads. Hosting payload/download behavior accepted.

### M3.4 — sealed submission and confirmation

Dependencies:1–3; approved version/deadline policy.

Deliver transactional fresh eligibility checks, explicit rebase, complete answers/clean required documents, stable receipt and transactional email outbox. Completeness reporting has no suitability ranking or automatic rejection.

Acceptance: true parallel settings/pause/close/deadline/republication versus submit tests pass; locks use real clock after waits; new submissions fail after closure while authorized identical completed replay returns the old receipt; document/form/case pins cannot be substituted; mail failure cannot duplicate/undo a committed submission. No external calls occur while holding mutation locks.

### M3.5 — staff application management and talent pool

Dependencies:1–4; approved role permissions and pool consent.

Deliver conflict-filtered case queues/detail/search/counts, explicit case allocation, notes/recommendations, clean documents, metadata-only staged staff confirmation and private audit. Add independent verified-email pool registration/withdrawal/renewal. Submitted cases remain manageable after the vacancy closes without giving officers vacancy-edit or owner publication powers.

Acceptance: owner/manager/officer scope matrices enforced in API and SQL; self-review denied on every read/write/download/search/count path including owner; declared/known alternate-identity conflicts remain sticky across staff/applicant email changes and are resolved independently; revoked staff cannot retry old operations. Pool refusal does not affect a job application, consent is not inferred, and cross-purpose retention/access does not silently share files. No interviews/final hire/activation endpoint exists.

### M3.6 — retention, operational recovery and controlled acceptance

Dependencies:1–5; finite retention/backup/hold policies approved.

Deliver leased scheduled expiry/purge, verified object/PII deletion, late-upload/scan reconciliation, consent withdrawal, holds/rights requests, sanitized operational metrics and incident runbooks. Test provider outages, duplicate workers and restoration of erased/revoked data from backups. Publish an exact migration/checksum/impact/rollback package for separate live execution approval.

Acceptance:14-day expiry; six/twelve calendar-month boundaries including leap years; no refresh-only renewal; holds win before the irreversible barrier; no successful purge until objects and PII are gone; failures retry/alert; outbox/payload/secrets follow retention; restore does not reactivate old tokens or consent. All flags stay off until explicit rollout approval.

## Automated and hosted test matrix

| Area | Required evidence |
| --- | --- |
| Forms | All three categories/engagements; optional versus required fields; unknown fields/types; role isolation; published/schema pinning and explicit rebase; mobile/keyboard/error accessibility |
| Identity | Accountless creation; staff/applicant/worker cookie/key isolation; verified email revision; deliberate proof exchange; purpose/TTL/replay/rotation; actual cookie delivery to sibling document routes; CSRF/enumeration/bot/rate behavior |
| Drafts | 14-day valid-activity rules; stale revisions/multi-tab conflicts; offline/uncertain responses; same-ID retry; no local PII or false saved indicators |
| Documents | Private Storage grants; no ID-only access; size/format enforcement; quota/overwrite/orphan cases; real malware and unavailable engine; signed callbacks, leases/checksums, clean promotion, actual downloaded-file headers and short-lived authorized downloads |
| Submission | Exact form/publication/doc ownership; current flags/open/deadline; real concurrent close/pause/version change; duplicate receipts, including session rotation/recovery after a committed-response loss and later vacancy closure; fail-safe outbox and completeness-only screening |
| Staff | Scope plus explicit case assignment; closed-vacancy case review; self-interest on all list/count/search/download/write paths; stage/proof digest tampering; current permission checks before replay |
| Talent pool | Separate consent/purpose/form; verification; renewal/withdrawal; no automatic conversion; independent document and retention ownership |
| Privacy | Calendar months/timezones; open/withdrawn policy; hold/purge races; partial failures; no PII in immutable M1 evidence; outbox/log/backup handling; late capabilities and restore reconciliation |
| Regression | M1 security/MFA/recovery; M2 wizard/approval/public projection/cache/immutability; existing learner enrollment, tutor binding, academic and accounting suites; TypeScript/lint/build |
| Live platform | Actual Supabase roles/RLS/default grants, Storage TTL/overwrite/region, real mail/scanner, multi-connection contention, hosting sizes/routing and deployed metadata. Local/mock tests are not these certifications. |

## Files and integration points proposed for later implementation

- New `src/lib/recruitment-applications.ts` for restricted typed forms and answer validation, separate from learner data.
- New applicant route components under a privacy layout in the existing application, plus existing Careers links only when intake is explicitly enabled. Full-page entry unloads prior analytics; all proof/draft routes and global click listeners are excluded before initialization. Add explicit routing/headers for apply, verify, recovery and privacy paths. Extend M2’s literal-false public availability contract only through fresh server-derived gates.
- New `api/recruitment/{form,email,applicant,documents,scan-callback,worker}.ts` and narrow applicant/case/mail/scan/retention services. Exact file mapping may follow current action-router conventions to limit function count.
- Existing recruitment Admin workspace gets case/talent-pool tabs; existing staff Auth helpers remain the authority. New case-specific proof/request/recovery tables and routes avoid permanent PII/case links in M1 governance logs.
- Approved additive migrations and matching fresh-schema/upgrade bundles, private bucket configuration and tests. No production Auth/provider settings are mutated by migrations.
- Operational runbooks for email/scanner outages, compromised case sessions, rights requests, holds, failed erasure, restoration and independent owner conflict handling.

Stop after design approval review now. Approval to implement M3 later does not itself approve production SQL, deployment, email sending, uploads or platform activation.
