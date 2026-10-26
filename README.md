# Viva Tutorials

React/TypeScript website for Viva Tutorials, with Vercel API routes for enrollment, enquiries and paid PDF delivery. Documentation reviewed on 26 October 2026.

## Development documentation

- [Admin workflow and tuition policies](docs/admin-workflow.md): account authorization, migrations, payment rules and end-to-end testing.
- [Development and architecture](docs/development.md): installation, runtime commands, repository map and checks.
- [Implementation status and next work](docs/implementation-status.md): current behavior, verification evidence, gaps and proposed priorities.
- [Service setup and verification](docs/supabase-setup.md): environment requirements, Supabase drift and controlled integration checks.

The current milestone includes embedded PostgreSQL-function tests, mocked API/UI checks and a Chromium workflow through the actual admin API and embedded database with synthetic Auth/Storage. Live Supabase/Resend integration remains unverified. See the development guide for verification details. Email claims, admin/tuition definitions, strict document finalization and monthly invoice numbering are included in the migrations and fresh schema; no live SQL was executed by this coding task.

Viva Tutorials is a South African tutoring and learning-support service for Grade 8-12 learners. Based in Mfuleni, Cape Town, we offer in-person support locally and online learning for students across South Africa.

Our mission is to make high-quality, accessible STEM education more personal: helping learners understand their subjects, strengthen study skills, and grow in confidence. Viva Tutorials was founded by Vuyolwethu Mabhuleka.

## Our Services

- **One-to-one tutoring:** Individual sessions shaped around a learner's goals, pace, and areas for improvement.
- **Group learning:** Small-group classes, collaborative study, and workshops on selected subjects and study skills.
- **Online and in-person sessions:** Live online lessons and in-person tutoring options in the Cape Town area.
- **Exam preparation:** Revision support using practice questions, past papers, mock exams, and exam strategies.
- **Learning resources:** Study notes, guides, video lessons, practice questions, and selected PDF materials.

Session formats, subjects, and tutor availability can vary. Contact Viva Tutorials to discuss the right option for a learner.

## Subjects

Support is available for Grade 8-12 learners in:

- Mathematics and Mathematical Literacy
- Physical Sciences
- Life Sciences
- Accounting
- Geography
- Information Technology

Subject and grade availability may vary by tutor and learning format.

## Tuition pricing and billing

The enrollment form and pricing page use these monthly subject-based fees:

| Grade group    | One subject | Two subjects | Three subjects |
| -------------- | ----------: | -----------: | -------------: |
| Grades 8–9     |        R350 |         R600 |    Not offered |
| Grades 10–12   |        R500 |         R800 |         R1,100 |
| Matric Rewrite |        R550 |         R900 |         R1,200 |

First-month tuition is prorated using the learner's grade programme: Grades 8–11 include Monday–Saturday; Grade 12 includes Sunday feedback as well; Matric Rewrite counts all five weekdays. Configured closures are excluded. First payment is required before activation. Continuing invoices are issued on the 25th, due on the 1st, with unpaid-balance reminders from the 3rd. Billing/reminder actions are manual in this milestone; no scheduled collection is enabled.

See [admin workflow and test setup](docs/admin-workflow.md) for the agreed policies, database migrations, admin account authorization and verification checklist. The branded, responsive `/admin` workspace provides application review, private report previews, invoice/receipt PDFs, verified manual payment recording, activation and readable audit history. Applications and activated Students have separate lists. Notifications separates waiting emails from completed history and supports audited cancellation while preserving financial and receipt records. Invoice/receipt emails retain the legacy branding and attach the corresponding PDF. New invoice numbers use the tuition month: November's first invoice is `VT-20261101`, even when issued in October. Teaching portals, automatic tuition payments and suspension/withdrawal controls remain future work.

## Study Materials

The Study Materials library has text search (including topics/keywords) and filters for free/paid, grade, subject and exam sitting. The current catalogue contains six Grade 12 Mathematics PDFs: four free and two paid, priced R299 and R399. The implemented PayFast notification handler validates payment before attempting PDF delivery by email; live delivery was not verified in this review. This purchase flow is separate from tutoring enrollment payments. Parents or guardians should handle enquiries and purchases for learners under 18.

## Where We Teach

Viva Tutorials is based in Mfuleni, Cape Town. In-person options are available in the Cape Town area; online tutoring can support learners elsewhere in South Africa. Contact us to confirm the location and format for a particular session.

## Getting Started

- [Enroll with Viva Tutorials](https://vivatutorials.co.za/enroll)
- [Book a session](https://calendar.app.google/k1hbyKuD97U5g1Vf7)
- [Browse study materials](https://vivatutorials.co.za/study-materials)

The contact page also accepts tutoring questions and subject requests. The website says the team aims to respond to enquiries within one business day.

## Analytics setup

The site loads Google Analytics automatically when a measurement ID is configured. Set it in your local environment or deployment:

- Create or update the Git-ignored `.env.local` without overwriting existing settings; use `.env.example` for variable names and omit unused placeholders
- Set `VITE_GA_MEASUREMENT_ID` to your GA4 measurement ID, for example `G-XXXXXXXXXX`

The app tracks page views, external link clicks, phone/email clicks, resource downloads, and successful contact-form submissions. Initialization is controlled by the configured measurement ID; no application consent/preferences gate is implemented. Browser blocking may affect delivery. Review the analytics behavior and privacy disclosures before enabling it.

## Contact Viva Tutorials

- Phone: [+27 73 391 3206](tel:+27733913206)
- Email: [info@vivatutorials.co.za](mailto:info@vivatutorials.co.za)
- Website: [vivatutorials.co.za](https://vivatutorials.co.za)
