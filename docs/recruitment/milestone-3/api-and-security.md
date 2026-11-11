# Proposed M3 API, authorization and security decisions

> Current status: the owner subsequently authorized all M3.2–M3.6 implementation. The historical proposals/review gates below are superseded by [implementation-report.md](implementation-report.md), [runtime-contracts.md](runtime-contracts.md) and [operations.md](operations.md). Production execution and rollout remain separately gated.
**Approval proposal only.** No routes below exist as M3 functionality at the reviewed M2 baseline. Existing `/api/admin/recruitment` and `/api/careers` behavior remains unchanged until approved implementation.

## Endpoint boundaries

Use existing Node/Vercel conventions, with a small number of action-routed handlers. The table describes contracts, not permission to create or deploy them now.

| Proposed endpoint | Contract / authority |
| --- | --- |
| `GET /api/recruitment/form?slug=...` | Whitelisted approved active form and current public eligibility only; no draft/contact data. Pool has its own purpose parameter and flag. Form ID/digest must match the published vacancy version. |
| `POST /api/recruitment/email` | Strict `begin`, `resend`, `recover`, `exchange` actions; generic 202 for requests, explicit one-use proof exchange. No applicant answers/files accepted. Same-origin JSON, bounded body/rates, no account enumeration. |
| `GET /api/recruitment/applicant` | Case-scoped draft/receipt and allowed status only, using dedicated verified capability. Never return internal notes/recommendations/other applicants. `caseId` is a selector, not authorization. |
| `PATCH /api/recruitment/applicant` | Strict typed answer delta, expected revision and stable request ID; partial draft validation. Unknown fields fail; no email-verification/status/role fields writable. |
| `POST /api/recruitment/applicant` | Explicit `rebase`, `submit`, `withdraw`, `request_deletion`, `rotate_session` actions. Each has its own policy, proof and idempotency requirements. Submit is server-authoritative and atomic. |
| `DELETE /api/recruitment/applicant` | Revoke the current capability/logout, not an implicit unaudited record purge. Privacy requests are separate. |
| `POST /api/recruitment/documents` | Verified applicant `reserve`, `finalize`, `discard` for an allowed case/form requirement; opaque paths, quotas, scan state. No upload before verified email/ready scanner. |
| Private document-access operation | Applicant's own clean document or authorized staff case document only; fresh case authorization before a short-lived signed URL or approved proxy. No quarantine URLs exposed to staff/public. |
| `GET /api/admin/recruitment?route=applications` | Existing staff Auth plus active case/scope/conflict checks; stable keyset paging and authorized counts/search. A selected case may continue to be reviewed after vacancy closes. |
| `POST /api/admin/recruitment?route=case-stage` | Store a bounded, short-lived staff PII change buffer; return opaque change ID and keyed digest. Current scope/case authority required. Does not apply the change. |
| Private staff `case-reauthenticate`/`case-mutate`/`case-recover` routes | New strict metadata-only commands for case assignment, note/clarification and recommendation commit. Reuse M1 Auth/session/MFA/proof semantics with retention-governed case challenge/request stores. Fresh confirmation binds staged digest; owner-sensitive operations require current AAL2 when enabled. No applicant PII or permanent case references in generic M1 journals. |
| `POST /api/recruitment/scan-callback` | Provider/worker authentication, signature/timestamp/nonce, exact job/generation/checksum binding and deduplication. No user-controlled “clean” flag. |
| Protected recruitment worker endpoint | Separate scheduler/worker credential and leased batches for email, scans, retention and reconciliation. Never infer worker privilege from a staff cookie or reuse accounting recipients/jobs. |

Applicant responses and document authorization use `Cache-Control: no-store`, noindex/nosniff/no-referrer as appropriate. Private responses vary on their credentials and must bypass CDN/service-worker caching. New public form responses may use ETags only with authoritative state/version revalidation; public eligibility never authorizes a write.

## Critical request contracts

- Begin: `{purpose, vacancySlug?, email, privacyNoticeVersion, requestId}`. Server resolves scope/version/form and generic response. Do not trust an arbitrary client schema or vacancy version as active.
- Exchange: `{proof, intentReference, confirmation}`. Purpose/email revision/expiry/revocation checked in a transaction; no GET consumption. Return a case reference and set the narrow HttpOnly cookie, not a token for localStorage.
- Save: `{caseId, expectedRevision, requestId, answersPatch}`. The server binds request to current session/case and hashes canonical validated content; reject changed request reuse. Only qualifying successful edits extend draft activity.
- Reserve: `{caseId, requirementKey, expectedRevision, requestId, declaredName?, declaredMime, size}`. Names are untrusted/purgeable; storage key generated server-side. Returned capability targets one quarantine generation with no overwrite. Provider TTL is measured/accepted, not assumed.
- Finalize: `{caseId, documentId, generation, requestId}`. The server verifies the stored object independently; client checksum/type alone is not scan proof.
- Submit: `{caseId, expectedRevision, requestId, formVersionId, declarationVersions}`. Re-read trusted answers and clean documents from database; do not accept a second arbitrary answer payload as the final snapshot.
- Staff commit: `{requestId, caseId, expectedRevision, changeId, payloadDigest, operationCode}` plus a case-specific action-bound proof using the M1 protocol. All human text resides in the purgeable buffer/notes store. Strict typed metadata avoids an accidental permanent PII archive.

Success receipts are durable after database commit, even if confirmation email fails. A repeated identical authorized request returns the same receipt, including after session expiry/recovery and vacancy closure. Namespace applicant idempotency by stable case/applicant principal and staff idempotency by Auth UUID; rotating session IDs/proofs are authorization evidence, not request identity. Exclude credentials from the canonical command digest; no automatic new IDs/re-submission after transport uncertainty.401/403 on a later retry does not establish whether an earlier attempt committed. Preserve the opaque pending ID and restore authorized status. A request ID alone never restores applicant data.

## Permission matrix

| Capability | Applicant | Officer | Manager | Owner | Worker |
| --- | --- | --- | --- | --- | --- |
| Read/edit own eligible draft | Verified case session only | No through staff identity | No through staff identity | No through staff identity | No |
| Reserve/finalize own upload | Verified session + eligible case + flags/readiness | No staff impersonation | No staff impersonation | No staff impersonation | Scan/promotion only |
| Read submitted case PII | Own receipt/approved summary only | Active scope + explicit case assignment + no conflict | Active scope/case responsibility + no conflict | Recruitment authority + no conflict | Narrow leased operation only |
| Download clean documents | Own case if policy permits | Same case checks | Same case checks | Same case checks | Exact scoped scan/deletion objects |
| Change case allocation | No | No | Authorized scope, eligible other staff | Eligible independent staff | No |
| Notes/recommendations | No | Assigned case | Authorized case | Non-conflicted case | No suitability judgments |
| Final hire/reject | No | No | No | Future separately enabled owner workflow | No |
| Place/release legal hold | Rights request only | No | Request only | Approved privacy authority, independent if conflicted | Enforce only |
| Purge due PII/objects | Request only | No | No direct purge | Govern policy/exception, not arbitrary raw deletion | Leased approved policy after hold checks |
| Activate any platform account | No | No | No | Not in M3 | No |

An Auth identity with finance/general Admin access alone gains no case access. Applicant sessions never authorize staff endpoints. Known/declared conflicts exclude records from list/count/search and document issuance, not just hide action buttons. Persist known conflicts across both staff and applicant email changes; only independent authorized resolution clears them. No fallback to owner self-review when the owner is the applicant.

## Security decisions and residual risks

1. **Capabilities:** random 256-bit secrets; store hashes and email-revision binding; rotate on recovery/email changes and revoke ordinary write authority on withdrawal/deletion. Verified users may receive a separately scoped privacy-only capability for rights/status; it cannot edit answers, upload, submit or receive outreach. Do not sign long-lived applicant authority into unrevocable client-only JWTs. The host-only applicant cookie uses `Path=/api/recruitment` to cover sibling applicant/document routes; worker/callback/form handlers ignore it for authority and require their own checks. Staff routes use their existing separate path/name. Cookie names/routes are isolated, with explicit server checks against cross-session confusion.
2. **Abuse controls:** separate IP/email/purpose budgets for initiation, resend, proof exchange, recovery, drafts and uploads; bound outstanding work and total bytes. Use keyed, short-lived abuse identifiers. A bot-challenge provider may be required by abuse acceptance, with privacy review; it is not a hiring score. Do not spend M1 staff password budgets on public traffic.
3. **Mail:** keep the existing provider infrastructure, but add a recruitment-specific sanitized adapter/outbox. Do not require or route applicant PII to global `ADMIN_EMAIL`. Never log provider bodies that may echo addresses or messages. Verification proofs needed for asynchronous delivery may live only in a short-lived encrypted queue envelope; its encryption key is managed outside the data row. Scrub after dispatch/expiry. Hash-only session verification remains the rule. Provider idempotency keys/claim leases prevent duplicate sends; SMTP failure never undoes accepted submission.
4. **Privacy/storage:** private buckets with no anonymous/authenticated read policies. Applicant-uploaded bytes cannot be served as clean until exact-byte scan and immutable promotion. Unknown format/size/verdict and scanner outages fail closed. Scanner access is purpose-bound; no global service key in an unapproved external scanner. Worker environments/providers must satisfy approved data-region/subprocessor requirements.
5. **Downloads:** proposed 60-second signed capabilities have a documented bounded revocation window and are kept out of logs/browser persistence. Generic attachment names avoid PII in URLs. Use a separately accepted streaming/proxy route if immediate per-request revocation is required; confirm host payload limits before proxying large files. Assert attachment, MIME, nosniff and cache headers on the actual Storage file response; headers on the URL-issuance response are insufficient. If Storage cannot meet the accepted policy, use the approved proxy alternative.
6. **PII versus immutable evidence:** contact/answers/CV filenames/notes/messages are retention-deletable. New event cores are minimal and policy-prunable only by controlled retention authority. Existing M1 immutable history is never loosened for cleanup. Pseudonymous IDs/digests are not assumed anonymous.
7. **Integrity:** conditional updates + stable requests; current staff role/scope/conflicts or applicant capability before any replay. Hold/submission/closure/flag races serialize in database with real-clock eligibility checks after locks. No external network calls while holding mutation locks.
8. **Client:** React-rendered escaped fields; no arbitrary schema scripts, HTML or URLs. No analytics/third-party embeds or PII-bearing telemetry on applicant/proof routes. Clear fragment proofs immediately, deny indexing, set referrer policy and avoid secrets in GET queries.
9. **Availability:** email/scanner/worker failures show explicit pending/retry states and retain a recoverable draft. Bound queues, processing time and leases; alert on overdue scans/deletion jobs. No “scanner unavailable, allow anyway” switch. A kill switch blocks new intake/promotion but preserves withdrawal/privacy access.
10. **Operational authority:** database/service credentials remain high trust, as in M1. Provider callbacks do not become trusted simply by knowing a document ID. Dedicated worker keys, authenticated callbacks, narrow RPC grants and secret rotation require tested runbooks. No claims of protection against a compromised database owner.

## Feature controls and rollout proposal

Add independent default-off controls for vacancy intake, talent-pool intake, applicant email dispatch, uploads and staff case processing. Keep M2 `public_vacancies_enabled` separate. Scanner readiness is derived from accepted configuration/health/signature policy and deployment acceptance evidence, not an ordinary togglable “clean” boolean.

Owner-governed changes require current authority/AAL2 and audit. Turning intake controls off prevents new intake capabilities/submissions, while valid privacy-only capabilities still permit rights/status actions. Recovery for a withdrawn/deletion-pending case can grant only that restricted purpose. If the mail kill switch/provider outage prevents a fresh proof, use a documented independently verified controller process; never relax ownership checks or promise that email recovery remains available. After erasure, an unexpired privacy token can read minimal job status; lost/expired tokens do not justify retaining case email indefinitely. Already issued storage capabilities retain their actual provider lifetime; private exposure and promotion stay blocked, and orphan cleanup accounts for late writes.

Interviews, final decisions, onboarding, activation and compensation remain unavailable. No flag change is executed by approving this design document; each launch/migration/deployment requires its own explicit approval.
