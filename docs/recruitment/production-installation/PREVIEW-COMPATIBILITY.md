# Vercel Hobby preview compatibility correction

## Confirmed failures

The user supplied the e19fbbc preview build log and final deployment banner on 11 November 2026:

- The application build and all 19 prerender routes completed. The provider then rejected output: **“No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.”** There were 14 API entry files, compared with 11 on main.
- Vercel also reported TS2550 for `Object.hasOwn` in recruitment operation validation and enrollment report-card validation. Vercel reads root `tsconfig.json` and does not follow its app/node project references. The dedicated Node TypeScript check therefore passed while provider defaults still lacked the ES2022 declaration.
- The prerender cancellation/SSR warnings are not the confirmed function-count rejection: the supplied log explicitly continued to “Build Completed” and “Deploying outputs.”

## Corrections and security boundaries

The existing eleven unrelated platform API entrypoints are preserved. Recruitment uses only **one physical function**, `api/recruitment.ts`, for **twelve total**. No paid plan or new service is required by this correction.

| Existing public URL | Physical route | Independent handler |
| --- | --- | --- |
| `/api/admin/recruitment?route=...` | `/api/recruitment?__viva_recruitment=staff&route=...` | `api/_lib/recruitment-admin-handler.ts` |
| `/api/careers?...` | `/api/recruitment?__viva_recruitment=careers&...` | `api/_lib/recruitment-careers-handler.ts` |
| `/api/recruitment?route=...` | Unchanged | `api/_lib/recruitment-applicant-handler.ts` |

The selector is publicly forgeable routing metadata and confers **no authority**. The router rejects duplicate, empty, unknown or conflicting selectors, strips the selector, normalizes the logical URL and restores the original request URL after delegation. It does not parse bodies, infer an actor, validate a session itself or fall back from a denied staff operation to an applicant/public handler.

The moved handlers retain their existing authentication, same-origin checks, worker bearer validation, scoped database calls, feature gates, idempotency, limits and cache policies. Browser cookies are selected using the original incoming URL before Vercel rewriting; the isolated staff cookie remains `Path=/api/admin/recruitment`, applicant cookie remains `Path=/api/recruitment`, and neither general Admin nor applicant cookies grant recruitment staff access. Staff responses stay private/no-store; Careers retains its authoritative publication check/ETag behavior. Documents and SQL remain behind their existing authorization. Shared Node execution is packaging, not shared role authority.

The shared function carries the existing 300-second recruitment duration and server-only documentation `includeFiles`. The dashboard, frontend callers, worker endpoint, accounting cron, existing eleven functions, database schema, all eleven migration sources/checksums and production controls remain unchanged.

Root `tsconfig.json` explicitly sets ES2022 target, ES2023/DOM libraries, ESNext modules, Bundler resolution and the same interop behavior used by the Node toolchain. The separate app/node configurations remain. Own-property validation is retained rather than weakened to truthiness or the `in` operator.

## Repeatable safeguards

- `npm run check:vercel`: read-only discovery of API entries excluding private/underscore modules, asserts the Hobby limit, and compiles all API entries directly with root compiler options without following solution references. No Vercel credentials, provider request, database or deployment is involved.
- `npm run build` invokes this check automatically through `prebuild`, so the same mismatch or function-budget regression fails early in subsequent provider builds.
- Router tests cover both original and rewritten URLs, method/cookie preservation, worker dispatch, duplicate/conflicting selectors and exact rewrite configuration.
- Actual handler tests cover owner/manager/officer SQL authorization through the physical function, refusal of general Admin/applicant cookies, and public Careers data/cache/query isolation.
- The opt-in synthetic browser harness applies the actual `vercel.json` aliases before calling the shared entrypoint; browser sessions and original cookie paths are exercised through that flow.
- Local Vercel Node packaging is separate from a hosted deployment. The official `@vercel/node@30.0.0` builder was installed only in `/tmp`, using the repository's TypeScript 5.8.3. It compiled/traced each entry in an isolated source copy, skipped dependency installation with local/dev metadata, and did not call Vercel or live services. The recruitment bundle was checked for the three compiled handlers and protected SQL/manifest files. Detailed non-secret evidence is in `preview-packaging-evidence.json`.

Hosted confirmation comes from the automatic work-branch preview statuses after the correction push. No manual deployment, main merge, production SQL, live settings or intake activation is authorized by this document. Existing scanner/email/owner/privacy/backup acceptance gates remain in force.

## Verification for the correction

- **485 tests / 52 files passed**, including the existing recruitment, academic, accounting, enrollment and portal regressions plus 15 new routing/compiler/isolation cases.
- App and dedicated API TypeScript checks passed; root-config API preflight reports **12/12 entries, zero diagnostics**.
- Lint passed with zero errors and seven existing Fast Refresh warnings. Production build completed and prerendered all 19 routes plus noindex 404; existing Browserslist/SSR and prerender shutdown diagnostics remain nonfatal.
- Official Node builder locally produced all twelve function bundles with no TS diagnostics; recruitment bundle contains the independent handlers and protected SQL/manifest.
- Desktop/mobile owner deployment viewer, exact SQL copy/download, manager/officer denial and analytics isolation passed through the configured rewrite flow. Synthetic applicant verification → draft → PDF/quarantine protocol scan → submission/receipt → staff review also passed through that flow, with no browser exceptions. This is not hosted email/scanner acceptance.
- Original staff/Careers/applicant handler bodies were compared against e19fbbc, allowing only relative-import adjustment for their moves. No business or authentication logic changed inside them. All eleven SQL sources and installer/verification checksums remain unchanged.
