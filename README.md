# Viva Tutorials

React/TypeScript website for Viva Tutorials, with Vercel API routes for enrollment, enquiries and paid PDF delivery. Documentation reviewed on 26 October 2026.

## Development documentation

- [Development and architecture](docs/development.md): installation, runtime commands, repository map and checks.
- [Implementation status and next work](docs/implementation-status.md): current behavior, verification evidence, gaps and proposed priorities.
- [Service setup and verification](docs/supabase-setup.md): environment requirements, Supabase drift and controlled integration checks.

The current baseline passes 22 mocked/local tests, lint with seven warnings, app and Node/API TypeScript checking and the production build. Live enrollment, email and payments were not independently verified in this cloud environment. The owner reports applying the enrollment email SQL in Supabase; it still needs to be saved as a repository migration and included in the fresh schema.

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

## Published Tutoring Packages

The website currently lists these options:

| Package | Published price | Sessions |
| --- | ---: | ---: |
| Single Session | R150 per session | 1 session |
| Starter | R500 per month | 4 sessions per month |
| Standard | R850 per month | 8 sessions per month |
| Premium | R1,200 per month | 12 sessions per month |

These prices match the public pricing page, but the enrollment form/API use subject-based fees: Grades 8–9 R350/R600; Grades 10–12 R500/R800/R1,100; Matric Rewrite R550/R900/R1,200. The two models have not been reconciled. See the [pricing decision](docs/implementation-status.md#pricing-decision-required) before changing prices or promising a package.

Package inclusions and availability may change. Confirm current details with Viva Tutorials before enrolling.

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
