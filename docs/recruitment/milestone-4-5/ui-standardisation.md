# Recruitment UI integration and visual review

Authenticated recruitment now reuses the existing Admin Dashboard's `admin.css`, official `Brand` component, Plus Jakarta Sans font resources, sidebar, account summary, topbar, breadcrumbs, content container, cards, button conventions, table styling and colour tokens. Recruitment authentication and permissions remain separate from general administration. Linking to Admin does not grant access to it.

Existing security, vacancy, case, form and deployment workspaces retain their existing server calls and review/recovery flows. New selection, engagement and reporting workspaces mount inside the same shell. Owner-only forms and deployment controls stay hidden from managers/officers, and their direct URLs render an access error instead of the owner workspace. Backend authorisation remains mandatory.

## Navigation

- `/admin/recruitment` preserves the existing vacancy default and outstanding-request recovery routing.
- `/admin/recruitment/overview` shows the authenticated role, visible scope count and backend-reported public vacancy visibility.
- `/admin/recruitment/vacancies` opens vacancy management.
- `/admin/recruitment/cases` and `/admin/recruitment/applications` open existing applications and talent-pool case management.
- `/admin/recruitment/selection` opens screening, interviews, assessments and decisions.
- `/admin/recruitment/engagement` opens offers, onboarding and staff lifecycle operations.
- `/admin/recruitment/reports` opens scoped recruitment reporting.
- `/admin/recruitment/security` opens existing recruitment access and governance.
- `/admin/recruitment/forms` and `/admin/recruitment/deployment` require recruitment owner access.

Desktop uses the Admin sidebar. Smaller viewports use a labelled native section selector with the same permitted navigation destinations; touch targets and focus indicators remain visible. The private Admin sidebar is not added to public Careers/applicant routes.

Vacancy introductory text no longer claims all applications, uploads and hiring are unavailable. Public visibility comes from the authenticated backend snapshot; a missing value is shown as unverified. Intake is described as independently gated and never inferred from public vacancy visibility. The overview does not claim external operational acceptance.

## Verification

Run focused UI tests:

```sh
npx vitest run src/test/recruitment-admin-navigation.test.tsx src/test/recruitment-vacancies-ui.test.tsx src/test/recruitment-deployment-ui.test.tsx src/test/recruitment-security-ui.test.tsx
```

Run the visual check with installed Python Playwright and `/usr/bin/chromium`:

```sh
python3 scripts/recruitment-ui-browser-review.py
```

The script starts Vite on loopback port 4179, blocks outbound browser requests, intercepts local API requests using explicitly synthetic fixture responses, captures nine routes at four widths (1440, 768, 375 and 320 pixels), and records `visual/evidence.json`. It compares recruitment topbar dimensions, background, font and padding against the actual Admin page, checks official logo use, mobile navigation, horizontal overflow and browser exceptions. File watching is disabled to prevent concurrent development from reloading a page during assertions. No environment variables or hosted settings are changed.

Screenshots were visually inspected at desktop, tablet and narrow mobile sizes. A generic Admin definition-list rule initially compressed overview metric cards; the scoped overview grid now preserves readable spacing and metric values.

These checks verify frontend layout/navigation only. They do not certify API authorisation, database transitions, production data, external email, scanner, worker scheduling, legal acceptance or hosted readiness. Those require the separate integration and production acceptance checks. A synthetic fixture never changes production intake availability.
