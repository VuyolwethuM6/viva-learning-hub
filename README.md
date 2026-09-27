# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

# Viva Tutorials Learning Hub

Production website for Viva Tutorials, a South African tutoring service for high-school learners. The site provides tutoring and subject information, contact and subject-request forms, free study resources, and PayFast checkout for paid PDFs.

## Technology

- React 18, TypeScript, and Vite
- React Router, Tailwind CSS, and shadcn/ui components
- Vercel static hosting and serverless API routes
- Resend for email delivery and PayFast for payments

## Requirements

- Node.js 20 or later
- npm
- Vercel CLI for local testing of serverless API routes

## Local Development

Install the locked dependencies and start the Vite frontend:

```sh
npm ci
npm run dev
```

Vite serves the frontend on port 8080 by default. `npm run dev` does not emulate Vercel API routes. To test contact, subject-request, or payment endpoints locally, use the Vercel CLI with local environment variables:

```sh
npx vercel dev
```

Do not use production payment credentials for local development. Use PayFast sandbox credentials and test recipient addresses.

## Project Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite frontend development server |
| `npx vercel dev` | Run the site and Vercel API routes locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Run ESLint |
| `npm run build` | Build the site and prerender route HTML and metadata |
| `npm run preview` | Preview the generated `dist` build |

The build runs `scripts/prerender-route-metadata.mjs` as its `postbuild` step. It writes static HTML for the routes in `src/lib/pageMetadata.json`, including page content and metadata, and a noindex `dist/404.html`.

## Application Structure

- `src/pages/`: public pages and route views
- `src/components/`: shared navigation, forms, dialogs, and UI
- `src/lib/`: study-material catalogue, analytics, and route metadata
- `api/`: Vercel serverless handlers for contact, subject requests, and PayFast
- `public/`: public images, free PDFs, `robots.txt`, and `sitemap.xml`
- `private/materials/`: paid PDFs; do not move paid files into `public/`
- `scripts/prerender-route-metadata.mjs`: build-time route rendering

`vercel.json` redirects `www.vivatutorials.co.za` to the canonical apex domain and maps application routes to their generated HTML files. Keep routes in `src/App.tsx`, `src/lib/pageMetadata.json`, `public/sitemap.xml`, and `vercel.json` aligned when adding or removing a public page. Payment-result pages are excluded from indexing.

## Environment Configuration

Copy `.env.example` to `.env.local` for local development, then replace every sample value. `.env.local` is ignored by Git. Never commit credentials or put secrets in `VITE_` variables; Vite variables are included in browser code.

Configure these server-side variables in the Vercel project for the appropriate environments:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_SITE_URL` | Public canonical site origin used to construct payment return URLs |
| `PAYFAST_ENDPOINT` | PayFast checkout endpoint; use the sandbox endpoint outside production |
| `PAYFAST_VALIDATE_URL` | PayFast ITN validation endpoint |
| `PAYFAST_NOTIFY_URL` | Public PayFast ITN callback URL; the code falls back to `/api/payfast/notify` on `PUBLIC_SITE_URL` |
| `PAYFAST_MERCHANT_ID` | PayFast merchant identifier |
| `PAYFAST_MERCHANT_KEY` | PayFast merchant key |
| `PAYFAST_PASSPHRASE` | PayFast signature passphrase, when configured for the merchant account |
| `RESEND_API_KEY` | Resend API credential for contact and delivery emails |
| `EMAIL_FROM` | Verified sender address used by Resend |
| `ADMIN_EMAIL` | Inbox for contact, subject requests, and purchase notifications |

`VITE_GA_MEASUREMENT_ID` is an optional, public build-time setting for the Google Analytics 4 measurement ID. Leave it unset to keep analytics disabled. When configured, analytics loads only after a visitor opts in. The app measures page views, navigation, phone/email links, lead calls to action, resource downloads, and successful contact submissions. It does not send contact form values or contact details in analytics events. Visitors can change their choice from **Analytics choices** in the footer.

Before enabling analytics in production, review the privacy notice, consent behavior, data retention, and applicable privacy requirements for the actual analytics configuration. Do not assume the included privacy copy replaces legal review.

## Production Release

1. Develop on a feature branch and open a pull request for review.
2. Require `npm test`, `npm run lint`, and `npm run build` to pass before merging.
3. Configure production environment variables in Vercel. Use production PayFast credentials and live endpoints only in the Production environment; retain sandbox settings for Preview/development.
4. Set `PUBLIC_SITE_URL` to `https://vivatutorials.co.za` and ensure `PAYFAST_NOTIFY_URL` points to the deployed `/api/payfast/notify` endpoint.
5. Deploy through the connected Vercel project. Confirm the build output directory is `dist` and the `api/` handlers are deployed as serverless functions.
6. Verify the deployed sitemap, robots file, route-specific HTML, canonical host redirect, contact form, subject requests, and payment flows.
7. Run a complete PayFast sandbox purchase and ITN delivery test before enabling live payments. Confirm that the deployment includes the required files from `private/materials` in the PayFast notification function bundle; a local build alone does not prove private-file delivery works in the deployed function.
8. Verify the canonical domain in Google Search Console, submit `https://vivatutorials.co.za/sitemap.xml`, and monitor indexing and crawl errors after release.

Free PDFs belong in `public/materials` and are publicly downloadable. Paid PDFs must stay in `private/materials` and be delivered only after the PayFast ITN handler validates the transaction. Never expose paid files through a public URL or include them in client-side bundles.

## Operational Notes

- Keep the canonical hostname consistent across redirects, metadata, `robots.txt`, and the sitemap.
- Check that each indexable page has a useful title, description, canonical URL, one primary heading, and crawlable links.
- After changing a route, update route metadata, sitemap entries, and Vercel routing together, then verify the generated HTML in `dist`.
- Treat names, email addresses, phone numbers, payment details, and learner information as sensitive. Do not log secrets or include personal data in analytics events.
- Review third-party integrations and privacy disclosures whenever analytics, payment, or email settings change.
