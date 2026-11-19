# Owner configuration guide: recruitment M1–M5

Merging code, deploying code, installing database changes and enabling recruitment are separate steps. This guide configures the existing platform, not another application or database. No production setting, secret, SQL, account or worker is changed by reading this file. Store secret values privately; never paste them into chat, GitHub or browser code.

## 1. Code and Vercel

After the approved merge, verify the Vercel deployment for the exact `main` merge commit finishes **Ready**. A GitHub merge alone is not proof of a successful deployment. Keep repository root, framework Vite, install `npm ci`, build `npm run build`, output `dist`, and the existing Node runtime/API configuration. Preserve committed `vercel.json`, all 12 function entries, private headers/rewrites, bundled PDF fonts/logo and existing accounting cron. Recruitment uses the existing `api/recruitment.ts`; do not create more serverless functions.

Use the existing production domain `https://www.vivatutorials.co.za`. New screens can appear before SQL/activation, but new workflows must remain closed. Do not enable intake to test whether configuration is complete.

## 2. Supabase schema: incremental install only

M1–M3 are already installed. **Never rerun the fresh M1–M3 installer or the complete `supabase/schema.sql`.**

1. Save current database and private Storage backup/recovery evidence.
2. Run `preflight.sql` as read-only inspection. Review actual target function bodies, dependencies, 42 existing recruitment tables, bucket/policy controls, old flag values and recorded installation source hash. Stop on drift.
3. Review this folder's exact `migration.sql` and `manifest.json`. Fill the required non-secret operator, exact-script approval and project references only after approval. Obtain separate production SQL execution approval; authorization to merge code is not that approval.
4. The package applies five migrations atomically: selection; engagement; onboarding documents; lifecycle workers/reporting; uncertain-request recovery. It adds 25 RLS tables and leaves the three new switches false. Existing data, buckets and control values are preserved.
5. After approved execution, run `verify.sql`. Expect 67 recruitment tables with RLS, no direct browser/service table permissions, intended service RPCs only, previous buckets unchanged and new flags false. Verify the installation journal and schema cache reload. Keep output/approval evidence securely.

Use the exact reviewed package, not a partial excerpt. A failed transaction should roll back; after committed data exists, use reviewed forward recovery rather than destructive down SQL.

## 3. Vercel Production environment variables

Preserve working existing values. Fill only actual missing configuration through Vercel Project → Settings → Environment Variables, scoped to Production. Saving environment values requires a new deployment/redeployment of the approved code before functions see them. Do not expose these under `VITE_*`; do not give production secrets to untrusted preview deployments.

| Name | Required configuration |
| --- | --- |
| `SUPABASE_URL` | Existing unified Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only service credential for that same project. |
| `RECRUITMENT_PUBLIC_ORIGIN` | Exactly `https://www.vivatutorials.co.za`, without an extra path. |
| `RESEND_API_KEY` | Approved Resend credential with verified sender domain. |
| `EMAIL_FROM` | Approved sender accepted by Resend for that domain. |
| `RECRUITMENT_HMAC_KEYS` | Versioned JSON key ring; independently generated 32-byte decoded keys. |
| `RECRUITMENT_MAIL_KEYS` | Same JSON shape, different independent 32-byte keys; used to encrypt mail envelopes. |
| `RECRUITMENT_ABUSE_KEY` | Another independent base64-encoded 32-byte random key. |
| `RECRUITMENT_WORKER_KEY` | Independent random bearer secret of at least 32 characters, shared only with the trusted scheduler. |
| `RECRUITMENT_SCANNER_URL` | Actual accepted HTTPS scanner gateway URL; proposed hostnames are not proof of infrastructure. |
| `RECRUITMENT_SCANNER_KEY` | Different independent secret of at least 32 characters, shared only with the scanner gateway. |

Both JSON rings use this structure (placeholders are not valid secrets):

```json
{"current":1,"keys":{"1":"BASE64_ENCODED_32_RANDOM_BYTES"}}
```

Generate each key independently using an approved secure password/secret manager or cryptographic random generator. Keep the current version numeric; key IDs are strings matching that number. Retain prior ring versions while old encrypted jobs/requests need recovery. Do not blindly rotate working keys. Never set `VIVA_RECRUITMENT_LOCAL_ACCEPTANCE` or `API_DEBUG=1` on production.

`RECRUITMENT_ERASURE_MANIFEST_KEY` belongs only to the protected offline erasure/restore signing utility, outside database backups. `RECRUITMENT_OPERATOR_REFERENCE` / `RECRUITMENT_APPROVAL_REFERENCE` are operational utility references when performing an approved restore. They are not applicant-facing variables and are not extra browser settings.

## 4. Owners, MFA and recovery

Keep existing verified Supabase staff identities and recruitment-specific grants. General Admin access does not grant recruitment access. The current intake-release gate requires **two independently controlled, verified, usable recruitment owners**. Enrol/test TOTP and recovery for the owners, then enforce owner AAL2 and mandatory access safeguards through existing approved governance.

A second account controlled by the same sole owner does not satisfy independent control. If that arrangement is impossible, pause release and review/approve a precise sole-owner recovery policy revision first. Do not remove the gate ad hoc. Test recovery before enforcing MFA and keep recovery material out of this repository.

## 5. Email delivery

Verify the sender domain in Resend and its SPF/DKIM/DMARC DNS records. Test real delivery, spam-folder behavior, bounce/failure handling, retries and duplicate suppression. Disable tracking/link rewriting for verification proofs. Applicant email verification is the existing accountless Resend flow; configuring Supabase Auth SMTP alone does not configure it.

Accept the 15-minute proof/confirmation/recovery journey and generic lifecycle notice templates. Mail points to private verified application access; it must not disclose scores, internal notes, meeting links or financial terms. Recruitment status messages remain email-only.

## 6. Private Storage and a real scanner

Keep `recruitment-quarantine` and `recruitment-documents` private and preserve the four pre-existing platform buckets. The restrictive recruitment Storage policy must remain effective even beside legacy permissive policies. Do not grant anonymous/authenticated bucket access or create public/long-lived document URLs.

Provision a real maintained ClamAV daemon plus the repository's signed HTTP gateway on an approved host with current definitions, HTTPS/TLS and bounded resources. Daemon TCP stays loopback/private. Use the existing gateway, Nginx and service examples in `docs/recruitment/production-installation/infrastructure/`; no Microsoft/Google integration is required. Gateway policy is `pdf-v1`, and the gateway key must match the application key. The gateway host receives no Supabase service key or applicant mail credentials.

Accept benign PDF, recognized test-malware, malformed/encrypted PDF, wrong hash/generation, stale definitions, timeout and unavailable-service cases. Unknown/unavailable scanning must fail closed. Verify private upload, exact-byte clean promotion and authorized download on hosted Storage before recording scanner acceptance.

## 7. Schedule all four workers

A trusted external scheduler/host must POST:

```text
https://www.vivatutorials.co.za/api/recruitment?route=worker
Authorization: Bearer <RECRUITMENT_WORKER_KEY>
Content-Type: application/json
```

Use separate requests with JSON `{"action":"mail","limit":5}`, `scan`, `retention` and **`lifecycle`**. Mail sends/retries; scan processes quarantine; retention enforces expiry/deletion; lifecycle queues interview/offer/onboarding reminders and expires offers. The older M3 runner rejects `lifecycle`: use the M1–M5 `worker-invoke.mjs.example` in THIS folder when updating the approved runner, not the old three-action example unchanged.

For the existing systemd examples, copy this reviewed runner as `/opt/viva-recruitment/worker-invoke.mjs`; retain the protected worker environment with `RECRUITMENT_WORKER_ENDPOINT` set to the exact URL above and the matching `RECRUITMENT_WORKER_KEY`. Reuse the existing service/timer templates and instantiate `mail`, `scan`, `retention` and `lifecycle`. Suggested initial cadence is one minute per non-overlapping instance, then tune to accepted load/hosting limits. A less frequent lifecycle schedule increases reminder/expiry latency. Validate the installed timer status and sanitized HTTP success/failure logs; enabled timers alone are not proof of processing.

Do not replace or add to the accounting cron to achieve this. Keep the retention worker operational during an intake pause unless the approved recovery plan specifically says otherwise. Run no worker with production keys in an untrusted preview environment.

## 8. Privacy, backups and operational acceptance

In `/admin/recruitment` → Forms and intake, approve the actual privacy notice/version and explicit minimal-evidence retention lifetime. No 90-day evidence lifetime is pre-approved. Existing case periods are 14 days for abandoned drafts, 12 months for submitted review, 30 days after withdrawal, six months after an authorized unsuccessful outcome and 12 months for affirmative talent-pool consent/renewal, subject to approved obligations/holds/extensions.

Back up database AND private Storage, test offline restoration and define the actual maximum backup horizon. Use the existing signed erasure-ledger export/restore process so a restore cannot resurrect deleted applications or dispatch old proofs. Protect its independent offline signing key and reconcile deletion before reopening a restored service.

Only after actual email, scanner, Storage, scheduler, recovery and restore tests pass should the database owner record the real operational/scanner attestations using the reviewed `04-operational-attestations.sql.template`. Attestations record completed acceptance; they do not perform the tests or enable flags.

## 9. Vacancy/form and phased activation

Recheck current vacancy publication and opening/closing dates. The historical Life Sciences reference is `VIVA-2026-000001`, slug `vacancy-2026-1`; do not assume its version/window remain current. Approve the actual intake form from the immutable published vacancy/category and current approved notice, then bind it to that EXACT published version. A revision needs a reviewed new binding.

Public visibility (`public_vacancies_enabled`) is separate from intake. After all M3 release prerequisites pass and exact activation SQL is separately approved, use the reviewed vacancy-pilot template to replace the existing all-off interlock atomically and enable only the intended vacancy binding. Never drop the interlock or update flags ad hoc. Global controls include `vacancy_intake_enabled`, `applicant_email_enabled`, `document_uploads_enabled`, `case_processing_enabled`; keep `talent_pool_intake_enabled` off until its separate release is approved.

After target-specific M4/M5 acceptance, separately review/approve enabling `selection_enabled`, then `onboarding_enabled`, then `activation_enabled`. These switches have no automatic production enablement UI and the prepared M4/M5 migration does not enable them. Review exact SQL with current settings revision, operator/owner approvals, governance and operational evidence; record each release. Do not infer authorization from a successful code deployment.

Approve actual legal employment/contractor/volunteer agreements and code of conduct before offer issuance. Role/engagement-specific onboarding must include necessary identity/qualification checks and lawful personnel-retention review evidence. Do not collect unnecessary banking or identity information. Prepare an existing verified platform identity for a successful candidate using the approved account process. Tutor activation links that identity to authoritative teaching records; administrator/support permissions require explicit approval, with no inferred recruitment/finance-owner privileges.

## 10. Hosted end-to-end acceptance

With a separately approved controlled test case and exposure policy:

1. Publish the approved vacancy; Careers shows the correct version and eligibility. Start, verify email, recover, fill and submit. A draft/private evaluation must never become public.
2. Upload required PDFs and wait for the real clean verdict. Unsupported/oversized/infected/unavailable scanning must not pass.
3. Review with a scoped assigned staff user; test other-scope IDs and conflicting reviewers are denied. Screen, shortlist, schedule/confirm an interview, assess/evaluate independently, recommend, and make the owner AAL2 decision.
4. Create/approve/issue an offer. Download the exact private PDF, accept/decline and separately accept the actual agreements/policies. No operational access exists yet. Test expiry/reminders and no duplicate delivery.
5. Complete onboarding and independent evidence verification, then explicitly approve activation. Verify tutor subject/grade restrictions, portal/class/session access and accepted-rate bill preparation to account 5000 without automatic payment. Test administrator/support least privilege too.
6. Simulate a lost response; recover the same request, or cancel an uncommitted request so a delayed original cannot execute. Verify no duplicate acceptance, identity, bill or activation.
7. Suspend/offboard, resolve future responsibilities and reconcile approved unpaid sessions. Verify portal access ends while teaching/accounting history remains. Verify retention/holds/erasure, including a restore/reconciliation rehearsal.
8. Recheck enrollment, learner/parent/tutor portals, academics and accounting. Record actual deployment commit, passed checks, rejected paths, service observations, unresolved findings and owner acceptance.

Start with `/admin/recruitment/deployment` for M3 configuration/recorded-evidence presence, then the shared overview, Vacancies, Applications, Selection, Offers/onboarding/Staff management and Reports. The dashboard's green configuration indicators do not prove external delivery/scanning/recovery works. `../review-guide.md` contains detailed UI actions and local-only test commands.
