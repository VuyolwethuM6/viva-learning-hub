# Development and architecture

Last reviewed: 26 October 2026. See [implementation status](implementation-status.md) for known gaps and the proposed roadmap.

## Stack and repository map

React 18, TypeScript, Vite 5, Tailwind CSS, shadcn/Radix UI, React Router and Vitest. Backend endpoints are Node-style Vercel functions using HTTP calls to Supabase, Resend and PayFast.

| Location | Responsibility |
| --- | --- |
| `src/pages`, `src/components` | Public pages, enrollment UI and shared components |
| `src/lib/studyMaterials.ts` | Catalogue, file names and download URLs |
| `src/lib/analytics.ts`, `src/components/Analytics.tsx` | Optional GA loading and interaction events |
| `api/enrollment.ts` | Validation, authoritative fees and enrollment draft creation |
| `api/enrollment-upload-url.ts` | Signed upload retry URL |
| `api/enrollment-complete.ts` | Stored-file verification, finalization and email trigger |
| `api/_lib/http.ts` | Shared enrollment body parsing, responses and Supabase headers |
| `api/_lib/enrollment-emails.ts`, `email.ts` | Receipt/admin templates, send claims and Resend; `payment-details.ts` is currently unused legacy configuration |
| `api/contact.ts`, `api/subject-request.ts` | Enquiry emails |
| `api/payfast/checkout.ts`, `notify.ts` | Paid PDF checkout and notification/delivery |
| `supabase/schema.sql`, `supabase/migrations` | Database/bootstrap SQL; email SQL synchronization remains outstanding |
| `public/materials`, `private/materials` | Free and paid PDFs respectively |
| `scripts/prerender-route-metadata.mjs` | Build-time route rendering and metadata |
| `vercel.json` | Function file inclusion, download headers and page rewrites |
| `src/test` | Catalogue, enrollment API/UI and enrollment email tests |

## Install and run

Commands run from the repository root. In this cloud environment the checkout is `/workspace/viva-learning-hub`. Use the existing isolated checkout; do not create a worktree unless requested.

Validated tool versions: Node 24.19.0 and npm 11.9.0. These are observations, not committed version pins. Both `package-lock.json` and `bun.lockb` exist; this workflow uses npm and preserves both lockfiles.

```bash
npm ci
npm run dev -- --host 127.0.0.1 --strictPort
```

Vite uses port 8080. It serves frontend modules and SPA routes but does not execute `api/` functions or apply Vercel rewrites. A form can render in Vite while its API submission is unavailable. Stop the process with Ctrl-C. Restart services in each new cloud task; running processes are not reusable snapshot state.

For the integrated Vercel runtime, configure services as described in [Supabase setup](supabase-setup.md), then run `npx vercel dev` from the root. The Vercel CLI is not a pinned dependency; installation, account access and project linking may be required. Read its selected environment before accepting changes or pulling configuration. Do not overwrite existing local settings.

## Validation commands

```bash
npm test
npm run lint
npx --no-install tsc -p tsconfig.app.json --noEmit
npm run build
```

As validated with the application-received changes: all 22 tests pass, lint has 0 errors/7 Fast Refresh warnings, app type checking passes, and the production build succeeds. The app tsconfig uses ES2022 libraries to recognize `Object.hasOwn`, while its JavaScript target remains ES2020; the deployment runtime must support APIs used by server code. There is no npm `typecheck` script. Also run `npx --no-install tsc -p tsconfig.node.json --noEmit` for the Node/API and Vite configuration target; this passes with the current changes.

Tests exercise five enrollment API cases, nine enrollment UI cases, six email cases and two catalogue cases. The email suite restores environment variables, globals and spies between tests. External calls are mocked. UI coverage includes progress/focus, duplicate submit prevention, secure upload retry, mismatched completion, uncertain initial creation, validation rejection, timeout and malformed responses. A separate Chromium smoke check exercised the five-step form, overlay, mobile/desktop receipt and print PDF with mocked endpoints; this does not establish live integration readiness. There is no existing live Supabase/Resend/PayFast test suite, committed full browser E2E suite, or dedicated server upload-completion/payment suite in this baseline.

`npm run build` includes the `postbuild` prerender script, creating 19 route pages and `dist/404.html`. Inspect the exit status and generated files. Known output includes React SSR/useLayoutEffect and fetchPriority warnings, stale Browserslist data and a cancellation diagnostic during Vite shutdown after prerender completion. The validated build exited 0; a new nonzero exit requires investigation.

`npm run preview` serves build output but is not a substitute for Vercel API validation. `npm run build:dev` runs a development-mode Vite build; it does not invoke the production `postbuild` lifecycle script.

## Deployment and operational boundaries

Vercel needs server environment bindings and the private paid PDFs included by `vercel.json`. Keep `private/materials` out of public assets. Production PayFast callbacks require a publicly reachable HTTPS deployment; local frontend startup cannot validate them. Deployment publication and cloud environment publication are separate operations.

Do not log request bodies, credentials, signed URLs or learner documents in shared reports. Existing API/payment logging should be reviewed before broad production use, since some handlers log recipient or provider details. Use synthetic records for checks, explicitly authorized test inboxes for delivery, and a planned test procedure for payments.

## Keeping these docs current

When code changes, update the feature status, API/configuration requirements and verification results. Before marking an integration ready, record an actual integration result. Save database changes in Git as reviewed SQL as well as applying them in Supabase. A dashboard-only change creates drift that future environments cannot reproduce.
