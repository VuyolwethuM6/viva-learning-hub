# Onboarding documents

Migration `20261115025000_recruitment_onboarding_documents.sql` follows the engagement migration. It adds one internal RLS link table and replaces existing upload/scan functions without renaming tables, changing buckets or widening browser privileges. No production SQL has been executed.

The established `/api/recruitment?route=documents` reserve/chunk/finalize/discard/download contract is reused unchanged. In the applicant onboarding workspace, a document task stored as `document:identity_pdf` uploads using requirement key `identity_pdf`. Owner `task_require` creates approved extra requirements; original clean application documents can satisfy matching onboarding tasks without duplicate uploads.

An onboarding upload requires all of:

- Current verified-email applicant case session (privacy-only sessions cannot write).
- Active unexpired vacancy case with no deletion barrier.
- Onboarding feature enabled, onboarding started, accepted offer and no activated engagement.
- Approved document task for that exact case and key, not already verified.
- Existing upload/scanner flags, accepted scanner policy and private Storage controls.

The file remains private quarantine data until the same exact-byte scan, generation, checksum, policy and lease checks used in M3 pass. Scanner failure never produces a clean document. Owner/staff review can verify only a current same-case clean document; verification prevents the applicant from discarding its evidence. Withdrawal, deletion, expiry, activation or flag-off closes further onboarding uploads and scan promotion.

The limits remain PDF only, 10 MiB per PDF, eight PDFs and 40 MiB per case across both phases. A case with eight pinned submitted PDFs cannot add a ninth onboarding PDF. Reuse matching clean evidence where applicable; expanding the approved quota needs a separate policy decision. The immutable submitted manifest is never rewritten to include later uploads, and its pinned PDFs cannot be replaced through onboarding. Unpinned discarded/rejected onboarding files follow the existing six-minute grace cleanup. All records remain subject to case retention, holds and erasure.

Local tests use synthetic byte/checksum/scan verdicts and disposable PostgreSQL, not hosted Storage or a real malware scanner. Hosted acceptance still needs real PDF upload/download, private bucket ACL checks, actual scanner and definition maintenance, worker scheduling, and withdrawal/deletion races. No new environment variables or external services are introduced by this migration.
