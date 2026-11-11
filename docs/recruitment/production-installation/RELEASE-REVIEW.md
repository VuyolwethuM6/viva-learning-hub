# Recruitment deployment preparation release review

**Preview follow-up:** e19fbbc's automatic previews were rejected by the Hobby twelve-function limit; its root compiler also lacked the libraries needed for `Object.hasOwn`. The subsequent correction uses one shared recruitment function, preserves the three logical URLs/security handlers, and adds root-config/compiler-budget checks. The 470-test table below is historical evidence for e19fbbc. Read `PREVIEW-COMPATIBILITY.md` for the corrected packaging and current verification; deploy the later reviewed work commit.

Work completed on the existing `work` branch. M1/M2 and accepted M3 commits remain ancestors, including `3f1ffee`, `e8024b4`, `59613ec`, `3cf6af5`, `367d0caf` and `a1444b759`. No original migration, academic workflow, enrollment model, accounting behavior, tutor identity, dependency lockfile or production service was changed. No M4 functionality is included. The final commit is identified by Git rather than a self-referential hash inside this file.

## Delivered

- Complete ordered SQL Editor package: 11 immutable committed migrations, fresh-install compatibility prechecks, protected operator/approval/source-hash installation evidence and fail-before-commit assertions. No fabricated Supabase CLI history.
- Read-only post-installation verification, separately approved bootstrap, operational attestations, vacancy/talent-pool activation and emergency pause templates. All production intake controls remain off until separately authorized execution.
- `/admin/recruitment/deployment` in the existing recruitment workspace, using the same recruitment login/session and current server/database owner authorization. Managers/officers cannot fetch inventory, guides, SQL or downloads. There is no SQL executor or activation endpoint/button.
- Full server-side repository script viewer with SHA-256 verification, syntax highlighting, exact copy and authenticated downloads. Files are included in the Node function, not public assets or frontend SQL literals. Owner sees non-secret configuration presence, current flags, approval-presence indicators, installation stages and manual testing checklist. The dashboard never exposes variable values or private operational journals and does not infer external service health from configuration.
- Native PostgreSQL 17.11 disposable installation/operational-template/concurrency runner and browser scripts, safe external-service deployment examples and recovery instructions. The local acceptance server uses its own Vite cache to avoid interference with builds/tests.

Important: initial database installation and owner bootstrap use the offline package. The dashboard deliberately cannot authenticate a nonexistent owner or bypass a missing recruitment schema.

## Final automated and local evidence

| Check | Actual result |
| --- | --- |
| `npm test` | **470 passed, 51 files**, including all existing recruitment, academic, enrollment, portal, accounting and new deployment tests |
| App TypeScript: `npx tsc -p tsconfig.app.json --noEmit` | Passed |
| API TypeScript: `npx tsc -p tsconfig.node.json --noEmit` | Passed |
| `npm run lint` | Exit 0; **0 errors, 7 existing Fast Refresh warnings** |
| `npm run build` | Exit 0, production assets built, **19 routes + noindex 404 prerendered** |
| Production-build diagnostics | Existing outdated Browserslist and SSR `useLayoutEffect` warnings; prerender shutdown still prints **“The build was canceled”** after successful output. This is disclosed, not described as a silent build. A final run without acceptance servers had no WebSocket-port diagnostic. |
| Canonical M3 synchronization | `node scripts/recruitment-m3-sync.mjs --check` passed |
| Package fingerprints | Generator `--check`, all artifact hashes, eleven exact ordered source bodies and 50-service-RPC allowlist passed |
| Native installation | **PostgreSQL 17.11, non-superuser installer, 11 migrations, 42 tables, all 12 verification blocks**; 75 legacy public tables/data, legacy indexes/triggers, Auth identities and four buckets preserved |
| Native operational SQL | Missing evidence/parameters rejected; synthetic positive bootstrap, attestations, vacancy/pool release and pause passed; MFA/scanner interlocks and recovery-after-complete-pause passed |
| Native multi-connection concurrency | Identical request replay returned once-only journal/audit; distinct concurrent same-revision writes produced one success / one conflict |
| Dashboard browser | Desktop + 390px mobile owner access, exact full SQL copy/download, verification viewer, no horizontal overflow, no private analytics and no browser exceptions; unauthenticated 401 and manager/officer 403 |
| M3 browser journey | Synthetic mobile verification → draft → private upload → signed protocol scan → clean file → final submission/receipt; desktop owner review/note; no browser exceptions |
| Real hosted services | **Not accepted by these tests.** No production SQL, deployment, applicant email or real applicant collection was performed. |

Corrections made during this task: explicit Auth/Storage schema-USAGE preflight; owner-gated artifact endpoint/route/header wiring; mobile long-code wrapping and SQL viewer contrast; router context in the existing navigation regression fixture; isolated Vite acceptance cache. Fixture-only bootstrap ownership/schema setup and native concurrency query were corrected while building the rehearsal runner. All canonical migration bytes remain unchanged.

The suite includes 22 new tests beyond the previous 448: 13 deployment API, five deployment UI and four package/configuration tests. Native Docker SQL and browser runs are separate evidence, not inflated into the Vitest count.

## Operational dependencies / release blockers

1. **Production execution approval:** exact target, quiet lock window, actual operator/approval/project bindings and instantiated checksum for 01; no execution is authorized by this file. Recheck target drift. Actual hosted Supautils policy authority was supplied by inventory but was not exercised by the local ownership-mode fixture.
2. **Deployment approval and provider configuration:** final reviewed work commit, main production branch preserved, Node/Vercel plan supports the 300-second API, server-only package `includeFiles` and private rewrites/headers verified on hosted runtime. No production credentials in previews or VITE_*.
3. **Real scanner:** approved host, DNS/TLS, actual ClamAV daemon + current signatures + gateway, separate secret, PDF parser/embedded threat acceptance and fail-closed operational tests. No real scanner/daemon/credentials were provisioned in this task. Synthetic scanner protocol tests are not real engine acceptance.
4. **Email:** existing approved Resend credential/sender, SPF/DKIM/DMARC, proof-link tracking disabled, actual delivery/replay/recovery/receipt acceptance and sanitized monitoring. No live messages sent here.
5. **Workers:** separate authenticated POST mail/scan/retention timers; validate actual duration, concurrency, retry leases and missed-run monitoring. Existing accounting GET cron remains unchanged.
6. **Private Storage:** two newly installed recruitment buckets, restrictive policy and real Storage API isolation/overwrite/download tests; existing four buckets/data preserved. DB backups alone do not contain Storage bytes.
7. **Legal/privacy/backup:** owner-approved notice and actual evidence lifetime (no default 90 days), approved backup horizon, holds/deletion authority and signed erasure ledger outside the backup domain; real DB/Storage restore and erasure reconciliation accepted.
8. **Owner governance:** verified initial owner + second independent owner, real hosted TOTP enrollment/recovery, fresh password/MFA/session/logout and revoked-access tests. No MFA enrollment/reset UI is added; use the documented Supabase flow. Separately enable/lock safeguards and require owner AAL2 only after compatibility/owner recovery acceptance.

## Exact production sequence — separate approvals required

1. Preserve actual DB recovery points and Storage backups, freeze competing DDL, recheck 00/00b drift inventory and confirm the existing unified project/domain. Review the exact current manifest and installation SHA.
2. Privately bind genuine installation operator/approval/project references in a copy of 01. Calculate and approve that instantiated checksum, then execute the **whole transaction once** in Supabase SQL Editor. Do not run the full platform schema or historical migrations piecemeal. A timeout has uncertain outcome: inventory/evidence first, no blind retry.
3. Run every 02 verification block. Confirm 42 RLS tables, exact 50 service RPCs, no browser/direct-table grants, original four buckets plus two private buckets, canonical tutor safeguards and all ten console/access/public/intake controls initially false. Preserve the executed artifact and protected installation marker.
4. After separate code deployment approval, deploy the reviewed final work commit to the existing Vercel project/domain using its controlled promotion workflow. No merge into main is implied. Configure the exact server-side names in `infrastructure/application.env.example`, keeping the existing Supabase project and approved email configuration. First verify legacy platform behavior with all public intake flags off.
5. After separate bootstrap approval, run 03 with the verified Auth UUID and genuine attribution. Sign in as owner, inspect `/admin/recruitment/deployment`, establish/test the second independent owner and the scoped staff roles. Complete hosted MFA enrollment/recovery and compatibility checks before separately enabling console, mandatory safeguards and owner AAL2 via the documented M1 controls.
6. Provision/accept real scanner and Resend; verify private Storage; install approved separate POST worker schedules. Perform actual backup/erasure recovery. Approve the privacy notice, evidence duration and real immutable role forms/bindings. Verify published vacancies and deadlines. Record genuine completed operational/scanner acceptance with separately approved 04; never use synthetic evidence.
7. Review all currently published content and enabled bindings. Privately bind exact intended vacancy UUID/settings revision, deployment acceptance, operator, owner release and **public exposure** references into 05. After explicit execution approval, run it atomically. This replaces the all-off interlock with the dependency fence and enables vacancy/email/uploads/processing; talent pool stays off. **Normal public intake is global; no test-email restriction is introduced.**
8. Personally perform hosted browser acceptance on www.vivatutorials.co.za: verified email/recovery, all role forms/draft conflicts/rebase, real clean/malware/failure PDF behavior, receipts, staff isolation/conflicts, notes/messages, withdrawal/holds/deletion, workers and legacy regressions. Use consenting controlled data and an approved lawful privacy process. Actual third-party provider and multi-connection failure behavior require this acceptance even though local tests pass.
9. Approve and execute 06 for the talent-pool form/current revision only after consent/retention and vacancy acceptance. Test renewal/withdrawal and expired records. M4 remains stopped.
10. On an incident use the approved 07 pause. Keep retention/holds/recovery/keys intact. Default retains existing applicant email; select complete mail pause before any separately approved MFA/safeguards exception. Do not drop the release CHECK, truncate cases, delete legacy buckets or restore an old DB over real submissions. Prefer an approved forward correction.

Ready for **production installation/deployment approval and operational acceptance**, with the external/legal/owner prerequisites above. This report does not claim that public intake is already live or that M4 may start.
