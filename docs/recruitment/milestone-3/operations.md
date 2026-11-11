# M3 operational, privacy and recovery contract

This is implemented code, not production enablement authorization. Use the existing unified Supabase project. Never run the synthetic acceptance harness against hosted services. No application route creates Auth users, teaching_tutors, admin_users, tutor assignments, accounting entries or final hiring/rejection decisions.

## Before any real applicant data

1. Obtain privacy/legal approval for the actual recruitment notice and evidence retention. There is **no approved 90-day default**. Cases use 14 days from qualifying draft activity, 12 calendar months under review, 30 days after withdrawal, 12 calendar months from affirmative pool consent/renewal. The inherited six-month unsuccessful-case calculation is dormant: final closure/decisions are not available in M3. Holds and approved legal obligations override erasure; an owner can document a finite review extension for a submitted vacancy case.
2. Obtain recruitment owner approval, with independent authority for any conflict. Record the approved notice/version/reference/evidenceDays through the fresh-confirmed `intake_policy` operation in Forms and intake. Do not put applicant names, case links or other PII in governance notices or approval references. The case-specific journals hold review notes and case evidence separately from immutable M1 journals.
3. Authorize a named database operator and independent approver. Keep approval evidence in the organization's protected change-management system. On the isolated target, verify the existing schema, migration history and checksums in `release-manifest.json`. Review `migration.sql` (one transaction, four additive migrations) and the live impact. Obtain separate explicit permission for its execution. No production permission is implied by this document.
4. Confirm backups/PITR and Storage recovery duration. Document the actual maximum backup horizon and approve the erasure-proof retention basis. Test a restore while offline. Execute **as protected database owner**, using actual references, not these placeholders:

```sql
select public.recruitment_intake_operate(
 'attest_operations','AUTHORIZED-OPERATOR','APPROVAL-REFERENCE',
 'Approved retention, offline restore, worker and deletion acceptance completed',
 ACTUAL_APPROVED_BACKUP_DAYS,null);
select public.recruitment_intake_operate(
 'attest_scanner','AUTHORIZED-OPERATOR','SCANNER-ACCEPTANCE-REFERENCE',
 'Real engine, definitions freshness, quarantine and infected-file acceptance completed',
 null,'pdf-v1');
```

These functions are deliberately unavailable to browser and service roles. They produce protected operational audit records including `session_user`, operator, approval reference and sanitized details. They do not enable flags. Never introduce an owner bypass or temporarily grant these functions to service_role.

## Keys and infrastructure

All keys are server-only. Use distinct secrets in each environment; never paste credentials into tickets, browser persistence or logs.

| Configuration | Contract |
|---|---|
| Existing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY | Same platform; validated staff sessions use existing Supabase Auth. No applicant Auth users. |
| RECRUITMENT_PUBLIC_ORIGIN | Exact HTTPS site origin; localhost HTTP is accepted only locally. |
| RECRUITMENT_HMAC_KEYS | JSON `{ "current": N, "keys": { "N": "base64-encoded-32-byte-key" } }`; domain-separated lookup/request/note signatures. Retain old versions while their case requests can be retried. |
| RECRUITMENT_MAIL_KEYS | Independent versioned 32-byte AES-GCM ring with the same shape. Retain old keys through encrypted outbox expiry. |
| RECRUITMENT_ABUSE_KEY | Independent base64 32-byte key. HMAC-only rate counters, retained at most one day. Do not rotate routinely with request keys. |
| RECRUITMENT_WORKER_KEY | Separate random bearer secret of at least 32 characters. Authorized scheduler only. |
| RESEND_API_KEY / EMAIL_FROM | Approved verified sender; existing email provider. Provider idempotency keys remain stable through retries within the 24-hour job lifetime. |
| RECRUITMENT_SCANNER_URL / KEY | Private HTTPS signed scanning gateway; separate secret of at least 32 characters, no redirects. |
| RECRUITMENT_ERASURE_MANIFEST_KEY | Separate offline signing key, protected outside database backups; used only by the operator utility. |

Configure an external authorized scheduler to POST `/api/recruitment?route=worker` with bearer key and JSON `{ "action": "mail|scan|retention", "limit": 5 }`. Use separate short jobs, approximately once per minute initially; tune only after load testing. No recruitment cron or live worker has been deployed. Hosting must support the configured 300-second function budget; confirm execution, memory, body limits and network routes. Upload requests use 2 MiB binary parts encoded below 2.8 MB JSON. Downloads use authorized 2 MiB parts.

Observe only sanitized counts/codes: mail sent/deferred, scan processed/deferred, retention scheduled/erased, oldest pending job age, expired claims, failed attempts and overdue hold reviews. Do not log request bodies, headers/cookies, email envelopes, recipient addresses, applicant answers, proofs, PDF bytes, provider diagnostic bodies or raw search strings. Configure infrastructure log redaction and alerting before launch. Verify the hosting proxy overwrites client-IP headers; add edge bot/abuse controls and demonstrate global mail-budget recovery without raising limits to bypass an incident.

## Real malware scanner acceptance

`scripts/recruitment-clamav-gateway.mjs` speaks actual ClamAV VERSION and INSTREAM TCP protocols. Deploy it privately behind authenticated TLS, with an independently maintained ClamAV daemon and signature updater. Only the adapter is replaceable: any replacement must attest the exact bytes, SHA-256, generation, job, nonce, policy, engine and definitions freshness. Health and verdict bodies are HMAC-signed. Unknown/error/timeout/stale/malformed/forged results never promote a document.

Require accepted ClamAV settings including PDF scanning, heuristic alerts, encrypted-document and exceeded-limit alerts; verify actual engine behavior rather than trusting configuration names alone. Run daemon and gateway clocks in UTC. Disable provider email click/open tracking and proof-URL rewriting.

Gateway configuration: CLAMD_HOST, CLAMD_PORT (default 3310), SCANNER_BIND (default loopback), SCANNER_PORT (default 8096), RECRUITMENT_SCANNER_KEY, RECRUITMENT_SCANNER_POLICY (default pdf-v1). Do not expose the daemon or gateway to public traffic. The gateway has no Supabase key and never shares samples with a public scanning service.

Run a separately accepted real-engine suite: benign PDF, embedded recognized test signature, malformed/encrypted PDF, 10 MiB boundary, wrong checksum/generation/policy, stale definitions, interrupted daemon, timeout, duplicate jobs, worker crash between promotion and DB completion. Validate PDF archive/embedded-content coverage with the operational security owner. Local protocol-peer tests do **not** certify malware detection. No daemon, real definitions or accepted hosted scanner was supplied in this workspace, so public uploads remain blocked.

Quarantine chunks and clean files are in private `recruitment-quarantine` / `recruitment-documents` buckets. A restrictive Storage policy excludes these buckets from anon/authenticated access even beside permissive legacy policies. The upload RPC checks private bucket configuration, caps/MIME and enabled Storage RLS. Only server-side uploads, exact-byte clean promotion and case-authorized downloads are possible. Never create public or long-lived upload/download URLs. Revoking scanner attestation is a separately audited operator call `recruitment_intake_operate('revoke_scanner',...)`; it disables uploads, not other platform workflows.

## Deletion, holds and backup reconciliation

Applicants can withdraw or request erasure using their own verified capability. Withdrawal immediately removes ordinary review/document access and cancels pending mail/scans. Owners can place/release documented legal/dispute/rights-request holds without reading ended-case answers. Officers/managers cannot grant themselves privacy authority. Matching and declared conflicts apply to owners too; only a different eligible owner can resolve a declared conflict, and a current matching email conflict cannot be overridden.

The worker schedules expiry jobs independently of intake flags. Active holds prevent barrier crossing. The database sets an immutable erasure barrier, revokes delivery/scanning and waits **six minutes** before deleting objects, exceeding bounded upload and scan leases. A new hold cannot be added after this irreversible barrier. Resolve any legal question before crossing it. Failed Storage verification preserves PII and retries. Only after verified object absence are contacts, answers, documents, submission manifests, notes/replies, requests, buffers, verification proofs, assignments and conflicts removed. Minimal purpose/action/notice-version consent proof contains no email/answers and remains with the finite private evidence header. Its post-erasure lifetime must be included in legal approval. Minimal case/audit evidence and opaque object-prefix erasure evidence persist for their approved finite period. The ledger horizon is at least the actual approved backup horizon. Late writes are swept fairly; final expiry requires a fresh, successful object check after the ledger expiry before its evidence/header is pruned.

Before backups are eligible for restoration, export the current ledger using the protected database-owner-only `recruitment_erasure_export(operator,approval)` into a protected JSON file. This records an operational audit event. Do not include extra query wrapper columns: the file must contain the returned JSON array. Sign it offline:

```sh
node scripts/recruitment-erasure-manifest.mjs sign export.json signed.json
```

Store signed ledgers outside the database/Storage backup domain with access control, encryption, access logs and approved expiry. Refresh at least daily and after erasure batches; block restoration if an interval cannot be reconciled. Protected artifacts contain opaque case IDs/prefixes, never contact/answer data, but remain privacy-sensitive. The utility creates mode-0600 files and refuses to overwrite them.

For disaster recovery:

1. Obtain independent operator authorization/approval evidence; identify the backup interval and all erasure ledgers since it. Keep the restored environment **offline**, all intake/email/uploads/review flags off, and disable outbound workers.
2. Verify the signed ledger with the offline key. Set RECRUITMENT_OPERATOR_REFERENCE and RECRUITMENT_APPROVAL_REFERENCE to the approved protected references; generate, inspect and separately authorize SQL:

```sh
node scripts/recruitment-erasure-manifest.mjs restore-sql signed.json restore.sql
```

3. Execute the reviewed SQL as protected database owner only. `recruitment_erasure_restore` reinstates deletion work, revokes restored applicant sessions and restores the finite opaque ledger. An active restored hold causes a hard stop for independent legal review. Do not bypass it or rewrite the deletion barrier. Inspect all restored auth permissions, conflicts, case assignments, operator approvals, proof TTLs, outbox claims and feature flags. Supabase Auth sessions and general owner recovery follow the existing M1 recovery runbook; no alternate login is introduced here.
4. Run retention workers until every restored erased case is purged and object prefixes are independently absent, reconcile both buckets, compare sanitized counts and confirm no proof/email is dispatchable. Use new environment worker/provider secrets; prevent restored pending emails from being delivered. Verify unaffected enrollment, academics, teaching and accounting with the existing regression suite.
5. Keep approval and sanitized validation evidence. Only independent release authorization permits reopening services/flags. Ledger export/signing/storage/restore is an operational obligation, not an automatically configured backup service. An expired, missing or invalid manifest blocks reopening. Review utility batches above 10,000 records explicitly; do not silently truncate.

## Rollout and recovery from a bad release

All **five flags remain NOT NULL false** and the corrected M3.1 `recruitment_m31_intake_interlock` remains in place. No application UI/RPC ships an enablement operation. A later separately reviewed migration must inspect the real target and explicitly replace the interlock before flags can be enabled. Do not drop it ad hoc. Policy/form approval and a form binding alone cannot override it.

Suggested separately authorized order after hosted acceptance: internal case review; verified-email/draft pilot; operational scanner and upload pilot; vacancy intake; talent-pool registration. Coordinate email with verification-dependent flows. Refresh/revalidate public Careers on every request; ETags include actual intake eligibility, and saving/submission always recheck authoritative publication and deadlines after locking. No stale cache authorizes intake.

If release checks fail, keep or set the affected flags off through the approved operational change process, stop mail/scanning dispatch, preserve retention workers and legal holds, and roll application code back to the last compatible version. The changes are additive, so **do not drop tables or run destructive down migrations after collecting data**. Retain keys needed for recovery. Resolve schema defects using a reviewed forward migration. Do not restore an old database over accepted applications. No existing ledger, academic, tutor identity, enrollment, Auth settings or legacy migration is to be altered as part of this rollback.
