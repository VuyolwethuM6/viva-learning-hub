# Contact, enrollment and WhatsApp navigation

Public navigation uses Viva-branded actions rather than making WhatsApp the
destination for every enquiry or enrollment button.

- `ContactButton` links to `/contact` by default. Subject-page and getting-started
  enrollment actions explicitly link to the existing `/enroll` workflow.
- `/contact` offers the existing email address and telephone number, a clearly
  labelled WhatsApp support option, and an enrollment link. It does not collect
  information or introduce a new backend contact form.
- WhatsApp remains available for contextual enrollment help and portal-access
  support. Its links retain their message context and open in a separate tab.
- Privacy enquiries link to `/contact#privacy`, which provides the existing
  business email address and secure-document guidance.
- The old Vercel permanent redirect from `/contact` to WhatsApp has been removed.
  The route is prerendered using the existing metadata pipeline, included in the
  sitemap, and served by an explicit Vercel rewrite. A browser that cached the
  previous permanent redirect may need its cached redirect cleared.

The routing change requires regenerating the deployment inventory with
`node scripts/recruitment-production-package.mjs`. Only the `vercel.json` runtime
hash changes; the eleven pinned SQL migrations and installation script retain
their existing checksums. No database installation or intake activation is
required for this UI update.

## Verification

- All 488 automated tests across 53 files passed, including contact choices,
  direct subject enrollment and the absence of the old hosting redirect.
- App and server TypeScript checks passed. Lint passed with seven existing
  warnings. The production build and twelve-function Vercel check passed.
- Chromium checked public routes at 320, 390 and 1440 pixels, mobile contact-menu
  navigation, and the retained support link on all four portal login pages:
  55 route/viewport checks, with no browser exceptions. External requests and
  backend calls were blocked during these local navigation checks.
- The new contact page and its actions fit the tested viewports. An existing
  Mathematics heading overflows by 19 pixels at 320 pixels; its typography was
  not changed by this navigation update.

Confirm the GitHub deployment environment is **Production**, not merely Preview,
and check the live `/contact` route after merging. A successful preview check
alone does not establish that the public domain has updated.
