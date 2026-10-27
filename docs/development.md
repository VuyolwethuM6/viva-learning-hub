# Development and architecture

Updated: 27 October 2026. See [implementation status](implementation-status.md) and [admin workflow](admin-workflow.md).

## Stack and map

React 18, TypeScript, Vite 5, Tailwind/shadcn, React Router and Vitest; Vercel Node-style API routes; Supabase Auth/PostgreSQL/Storage; Resend; separate PayFast PDF commerce.

| Location                                                            | Responsibility                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/pages/Enrollment.tsx`                                          | Intake, submission overlay, upload retries and application receipt                                      |
| `src/pages/Admin.tsx`, `admin.css`                                  | Authenticated admin shell, reviews, invoices, payments and queue                                        |
| `src/components/admin/AdminPrimitives.tsx`                          | Brand, badges, modal/drawer focus handling, confirmations and private document viewer                   |
| `src/components/admin/NotificationQueue.tsx`, `AuditTrail.tsx`      | Waiting/completed message views, cancellation form and readable searchable audit history                |
| `src/lib/tuition-programme.json`                                    | Grade-specific enrollment programme display and tested billing seed definitions                         |
| `src/lib/admin-types.ts`                                            | Admin display types and non-authoritative fee preview                                                   |
| `api/enrollment*.ts`                                                | Intake validation, signed upload, stored-file verification and finalization                             |
| `api/admin/session.ts`                                              | Login/session/sign-out; no public admin signup                                                          |
| `api/admin/records.ts`                                              | Authorized snapshot, document signing and mutations                                                     |
| `api/admin/messages.ts`                                             | Authorized manual notification sending                                                                  |
| `api/admin/documents.ts`                                            | Authorized invoice/receipt PDF generation and private report downloads                                  |
| `api/_lib/admin.ts`                                                 | Auth validation, membership, same-origin protection, DB calls and cookies                               |
| `api/_lib/tuition-email.ts`                                         | Tuition messages, distinct from initial application emails                                              |
| `api/_lib/tuition-document.ts`, `tuition-document-data.ts`          | Branded PDFs and invoice/payment snapshot loading                                                       |
| `private/fonts`                                                     | Licensed static full-character-map PDF fonts; bundled into Vercel functions                             |
| `api/_lib/enrollment-emails.ts`, `email.ts`                         | Initial receipt/admin templates, claims and Resend helper                                               |
| `api/_lib/payment-details.ts`                                       | Bank details for tuition invoice/reminder emails; verify before enabling                                |
| `api/payfast`, `public/materials`, `private/materials`              | Existing independent PDF commerce                                                                       |
| `supabase/schema.sql`, `supabase/migrations`                        | Fresh bootstrap and reviewed existing-project updates                                                   |
| `src/test/admin-database.test.ts`                                   | Embedded PostgreSQL tests of real SQL invariants and permissions                                        |
| `src/test/admin-api.test.ts`                                        | API authorization and provider-boundary tests                                                           |
| `src/test/admin-documents-api.test.ts`, `tuition-documents.test.ts` | Private document access, report limits, embedded fonts, deterministic PDFs and email attachment content |
| `vercel.json`                                                       | Routing, private-file inclusion and admin security response headers                                     |

## Install and run

Use the existing isolated checkout `/workspace/viva-learning-hub`; do not create a worktree unless requested. Validated runtime: Node 24.19.0/npm 11.9.0 (observed, not pinned). npm uses the committed package lock. Bun's legacy lock is retained; npm is the supported tested workflow. PGlite is a pinned development dependency for PostgreSQL-function tests; it is not an application database.

```bash
npm ci
npm run dev -- --host 127.0.0.1 --strictPort
```

Vite serves frontend pages on port 8080 but does not host `api/` routes or Vercel rewrites. `/admin` can render there, but authentication/data operations need the integrated runtime:

```bash
npx vercel dev
```

The Vercel CLI is not pinned in the manifest; project linking and account access may be required. Configure server bindings and apply migrations as described in [admin workflow](admin-workflow.md). Do not overwrite existing `.env.local` or expose server credentials with `VITE_`. Restart services for each new task; running processes are not snapshot state.

## Checks

```bash
npm test
npm run lint
npx --no-install tsc -p tsconfig.app.json --noEmit
npx --no-install tsc -p tsconfig.node.json --noEmit
npm run build
```

App checking covers browser code and test imports; Node checking covers `api/**/*.ts` and Vite config. There is no npm typecheck alias. PGlite tests run in a Node test environment with local Auth/Storage metadata stubs, exercise actual PostgreSQL functions, and never connect to Supabase. API/UI tests mock external services. Test clocks exist only inside isolated test databases.

The admin font is self-hosted through `@fontsource/plus-jakarta-sans`. Server PDFs use `pdf-lib`/`@pdf-lib/fontkit` with complete static TTFs under `private/fonts`, not language-specific web subsets. The checked-in licence/provenance explains regeneration. `vercel.json` includes the fonts and logo in both PDF-producing functions. Vite denies serving private files. No browser request contains the service key, and no external HTML-to-PDF service receives learner data.

The production build includes `scripts/prerender-route-metadata.mjs`, yielding 19 public route pages and a noindex 404. `/admin` is client-rendered from the SPA entry, protected by API authorization; it is not a publicly prerendered data page. Baseline build warnings include React SSR/useLayoutEffect, fetchPriority, stale Browserslist data and an esbuild shutdown cancellation diagnostic after completed prerendering. The validated build exits 0. Investigate any new nonzero exit rather than accepting warnings as success.

`npm run preview` does not host Vercel APIs. `npm run build:dev` does not execute the production `postbuild` lifecycle hook.

## Latest verification

The final accounting release passed 119 tests across 15 files, both TypeScript targets, lint (zero errors; seven existing Fast Refresh warnings) and the production build (exit 0; the prerender warnings described above remain). This includes real PostgreSQL ledger/domain and atomic upgrade/rerun tests, financial input/PDF tests and accounting API authorization tests.

Accounting implementation: `api/admin/accounting.ts` handles authorized reads/writes, exports, private evidence and bearer-authorized scheduled work. `api/_lib/accounting-*` and `dispatch-tuition-message.ts` implement server validation, documents and outbox dispatch. `src/components/admin/FinanceWorkspace.tsx`, `AccountingForms.tsx`, `LearnerAccountControls.tsx` and `src/lib/accounting-*` provide the responsive UI. Six reviewed accounting migrations are consolidated into `docs/accounting-setup.sql`. Optional Supabase Cron setup is separate from the core migration; main financial automation remains disabled until configured in Finance Controls.

The accounting browser run additionally covered a cash receipt/available credit, activation, credit note, refund, paid supplier expense/private evidence, cash deposit, bank CSV import/match, ledger reports and real PDF/CSV downloads. Chromium checked every Finance section at mobile width. WebKit checked the Finance sections plus More/logout at 390×844, 320×568 and 568×320, and rejected signed-out finance reads. The accounting test guide records the expected synthetic balances.

An earlier isolated Chromium test used the actual admin HTTP handlers and actual PGlite SQL functions, with synthetic Auth/Storage and no external sends. It exercised branded desktop/mobile sign-in, navigation, the report viewer and authenticated download, preservation of an unsaved review note, confirmations, Grade 12 Sunday prorating, tuition-month invoice numbering, actual invoice/receipt PDF downloads, partial-payment activation blocking, full settlement, activation and sign-out/401. The follow-up Chromium and WebKit checks also exercised mobile More/logout dialogs at 320×568, 568×320, 390×844 and 768×1024, application/student separation, audited queue cancellation, retained receipt PDF bytes and readable searchable audit history. These use browser engines in the cloud, not a physical iPhone. This harness lived outside the checkout and is not a production demo-auth bypass. Downloaded PDFs were also rendered and their extracted text inspected; structural PDF validity alone does not prove readable glyphs.

## Testing boundaries

Enrollment browser checks exercised all five steps, overlay, desktop/mobile receipt and print output with mocked endpoints. Admin browser checks must similarly distinguish mocked Auth/data from live Supabase integration. No mocked test proves bank receipt, email inbox delivery, provider settlement, backup health or production access rules. Use the live synthetic checklist in the admin guide before release.

Do not log credentials, signed URLs, learner documents or complete request bodies in shared reports. Some older PDF handlers log recipient/provider details; review operational logging before broader production use.
