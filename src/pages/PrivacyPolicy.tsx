import { WhatsAppButton } from "@/components/WhatsAppButton";
import { motion } from "framer-motion";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from "@/components/Footer";

type PrivacySection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

const sections: PrivacySection[] = [
  {
    title: "1. Introduction and Scope",
    paragraphs: [
      'Viva Tutorials ("Viva Tutorials", "we", "us" or "our") provides academic tutoring and educational support to Grades 8–12 learners and Matric Rewrite candidates through in-person and online programmes.',
      "This Privacy Policy explains how we collect, use, store, disclose and protect personal information when you visit our website, submit an enquiry, register for tutoring, communicate with us, make a payment or participate in our programmes.",
      "We process personal information in accordance with the Protection of Personal Information Act 4 of 2013 (POPIA), applicable regulations and other relevant South African laws.",
      "By using our website or engaging with our services, you acknowledge this notice. Where consent is the appropriate lawful basis for a particular activity, we will request it separately where required. This policy does not replace any consent or authorisation required by law.",
    ],
  },
  {
    title: "2. Who Is Responsible for Your Information?",
    paragraphs: [
      "Viva Tutorials is responsible for determining why and how personal information is processed for its tutoring and website operations, subject to applicable law.",
      "Business name: Viva Tutorials.",
      "Website: https://www.vivatutorials.co.za.",
      "Privacy contact: info@vivatutorials.co.za.",
    ],
  },
  {
    title: "3. Personal Information We Collect",
    paragraphs: [
      "Depending on your interaction with us, we may collect the following categories of information.",
      "Contact and identity information: names, email addresses, telephone numbers, parent or guardian contact details, and other details provided during an enquiry or registration.",
      "Learner information: learner name, grade, selected subjects, learning requirements, programme enrolment, attendance, assessment results and academic progress information needed to provide tutoring.",
      "Registration information: information submitted through website forms, learner onboarding processes, enquiries and communications with parents or guardians.",
      "Payment information: selected package, payment amount, transaction reference, payment status and records needed for accounting and resolving payment enquiries. Payments through PayFast are subject to PayFast's own processing arrangements. We do not intend to collect full card details through ordinary website forms or WhatsApp messages.",
      "Communications: messages and correspondence received through WhatsApp, email, website contact forms and other official communication channels.",
      "Technical information: information such as browser type, device information, approximate location inferred from technical data, pages visited, referring pages and website interaction events, where collected by the website or its analytics tools.",
      "We aim to collect only information reasonably necessary for the relevant purpose. Please do not send passwords, payment card security codes, identity documents or sensitive personal information through ordinary contact forms or WhatsApp unless we have provided a suitable, secure and justified process.",
    ],
  },
  {
    title: "4. Why We Process Personal Information",
    paragraphs: ["We process personal information for specific and legitimate purposes, including:"],
    bullets: [
      "Responding to enquiries and providing information about tutoring programmes.",
      "Registering learners, confirming enrolment and managing class placement.",
      "Providing online and in-person tutoring, monitoring attendance and supporting academic progress.",
      "Communicating with learners, parents and guardians about schedules, learning activities, payments and service changes.",
      "Processing payments, reconciling transactions, maintaining financial records and addressing payment disputes.",
      "Administering our website, registration forms, records and customer support processes.",
      "Improving website usability and understanding general website traffic through Google Analytics, subject to applicable privacy requirements.",
      "Sending promotional messages where we have the required consent or another lawful basis.",
      "Protecting the safety of learners, preventing misuse, resolving disputes and meeting applicable legal obligations.",
      "Establishing, exercising or defending legal claims where necessary.",
    ],
  },
  {
    title: "5. Lawful Basis for Processing",
    paragraphs: [
      "POPIA requires personal information to be processed lawfully and fairly. Depending on the purpose, we rely on an applicable lawful justification under POPIA, which may include consent, steps necessary to enter into or perform an agreement, compliance with a legal obligation, protection of legitimate interests where permitted, or another lawful justification.",
      "We request consent where consent is required, including for relevant promotional communications and the processing of children's personal information where the applicable legal requirements call for consent from a competent person.",
      "Where processing is based on consent, you may withdraw that consent. Withdrawal does not invalidate processing lawfully undertaken before withdrawal, and it does not prevent processing that remains lawful on another applicable basis.",
      "We will explain when information is required for enrolment or service delivery and when providing it is optional. If required information is not provided, we might be unable to register the learner or deliver the requested service.",
    ],
  },
  {
    title: "6. Children's Personal Information",
    paragraphs: [
      "Viva Tutorials serves school learners, including children under the age of 18. We recognise that children's personal information receives additional protection under POPIA.",
      "For learners under 18, a parent or legal guardian, or another person legally authorised to act as a competent person under applicable law, should complete registration and provide the necessary permissions where required.",
      "We collect learner information only to the extent reasonably needed to administer tutoring, communicate about the learner's participation, record attendance, support learning and meet applicable legal obligations.",
      "We do not knowingly ask children to provide more personal information than is reasonably necessary for the educational service. We encourage parents and guardians to supervise registration and communication involving younger learners.",
      "A parent or guardian may contact us to ask about a child's personal information, request correction of inaccurate information, or exercise applicable rights, subject to verification and legal requirements.",
      "Photographs, identifiable video recordings, learner testimonials or identifiable academic achievements will not be used in marketing without the appropriate permission and consent required by law. Consent for promotional use should be separate from consent needed to register for tutoring.",
      "Where a learner turns 18, we will take account of the learner's own rights and applicable consent requirements when managing their information.",
    ],
  },
  {
    title: "7. Registration Forms and Learner Records",
    paragraphs: [
      "Information submitted through Viva Tutorials website forms may be used to respond to enquiries, assess programme suitability, process registrations and maintain learner records.",
      "We use Google Sheets and Google Apps Script for certain administrative and recordkeeping processes. Depending on the form or workflow, these records may include contact information, learner details, selected subjects, attendance and registration information.",
      "Access to learner records is intended to be limited to people who need the information to perform authorised tutoring or administrative duties.",
      "Please ensure the information you submit is accurate and notify us of changes that affect registration or communication.",
    ],
  },
  {
    title: "8. Payments and Financial Information",
    paragraphs: [
      "Viva Tutorials offers free registration. Learners are charged the applicable monthly tutoring fee for their selected package. Registration details and payment records are processed separately for administration and accounting purposes.",
      "Payments may be made through PayFast or electronic funds transfer (EFT), according to the payment instructions provided by Viva Tutorials.",
      "When you pay through PayFast, the payment is processed through the relevant payment service. PayFast may collect and process payment information under its own terms and privacy notices.",
      "For EFT payments, we may process the payer's name, payment reference, amount, date and transaction confirmation to reconcile the payment. If you send proof of payment, please avoid including unrelated banking information.",
      "We do not intend to request full card numbers, card security codes, banking passwords or one-time PINs through email, WhatsApp or ordinary website forms.",
      "Payment records may be retained for accounting, tax, contractual, dispute-resolution and other lawful recordkeeping purposes.",
    ],
  },
  {
    title: "9. WhatsApp, Email and Other Communications",
    paragraphs: [
      "We use WhatsApp and email to respond to enquiries, communicate with parents and learners, coordinate tutoring schedules, share relevant learning information and address administrative matters.",
      "Messages you send us may contain personal information. Please share only information relevant to the enquiry or service.",
      "WhatsApp and email are third-party services. Their providers process information under their own terms, privacy policies and technical arrangements. Information may be processed outside South Africa, depending on the provider and service configuration.",
      "We take reasonable steps to limit access to business communications, but we cannot control every aspect of third-party platforms, recipient devices or external networks.",
      "Please notify us if your contact details change or if you believe a message containing your information has been sent to the wrong recipient.",
    ],
  },
  {
    title: "10. Google Analytics and Cookies",
    paragraphs: [
      "Viva Tutorials uses Google Analytics to understand general website traffic and interaction patterns and to improve the website.",
      "Depending on the website configuration, Google Analytics may collect technical information such as pages visited, navigation events, browser and device information, approximate geographic information and interactions with website features. Cookies or similar technologies may be used for these purposes.",
      "We do not intend to send names, email addresses, telephone numbers, payment details, learner records or other directly identifying personal information to Google Analytics. Analytics events and page URLs are configured to avoid transmitting such information.",
      "Google processes analytics data under its applicable terms and policies. For more information, review Google's Privacy Policy at https://policies.google.com/privacy and Google Analytics information at https://support.google.com/analytics.",
      "Where required by applicable law or the analytics configuration, we will provide an appropriate consent or preference mechanism. Browser settings and available privacy tools may also help limit cookies, but browser controls do not necessarily prevent all forms of measurement.",
    ],
  },
  {
    title: "11. When We Share Personal Information",
    paragraphs: [
      "We do not sell personal information as part of our ordinary tutoring operations.",
      "We may share relevant information with service providers where necessary to operate our services, including website hosting providers, form and recordkeeping services, Google services, email providers, WhatsApp, PayFast and other payment or communication services actually used by Viva Tutorials.",
      "We may also disclose information where necessary to comply with a legal obligation, respond to a lawful request, resolve a dispute, protect a person's safety or establish, exercise or defend legal rights.",
      "Where a third party processes information on our behalf, we will take steps required by POPIA to ensure appropriate confidentiality and security arrangements, including written operator arrangements where required.",
      "We aim to disclose only the information reasonably necessary for the relevant purpose. We do not authorise service providers to use learner information for unrelated purposes merely because they provide a service to us.",
    ],
  },
  {
    title: "12. International Transfers",
    paragraphs: [
      "Some service providers used by Viva Tutorials may store or process information outside South Africa. This depends on the provider, account configuration, infrastructure and services being used.",
      "Where personal information is transferred outside South Africa, Viva Tutorials will take the steps required by section 72 of POPIA and any other applicable legal requirements. These requirements may include ensuring an adequate level of protection or relying on another legally permitted transfer condition.",
      "Information about particular providers and their processing locations should be confirmed from the applicable service documentation and account settings.",
    ],
  },
  {
    title: "13. Data Security and Breach Management",
    paragraphs: [
      "Viva Tutorials recognises the importance of protecting personal information against loss, unauthorised access, disclosure, alteration or destruction.",
      "We will take reasonable technical and organisational steps appropriate to the nature of the information and the risks involved. The safeguards used may vary according to the information and the process.",
      "No method of electronic transmission or storage is completely secure. We therefore cannot promise absolute security.",
      "If we become aware of a security compromise affecting personal information, we will assess the incident and take the steps required by POPIA, including notifying the Information Regulator and affected data subjects where required by law.",
    ],
  },
  {
    title: "14. Data Retention and Deletion",
    paragraphs: [
      "We retain personal information only for as long as reasonably necessary for the purpose for which it was collected, unless a longer retention period is permitted or required by law.",
      "Different categories of information may have different retention periods. Enquiry records, active learner records, attendance, academic progress, payment records, consent records and complaints may need to be retained for different periods.",
      "Financial and transaction records may be retained for periods required by tax, accounting or other applicable legislation. Information relevant to a dispute or legal claim may be retained where legally justified.",
      "When personal information is no longer required and no lawful retention ground applies, we will take appropriate steps to delete, destroy or de-identify it, subject to technical limitations and legal obligations.",
      "You may request deletion of information, but we might need to retain some records where required by law or where another lawful justification applies. We will explain the outcome of a request where appropriate.",
    ],
  },
  {
    title: "15. Direct Marketing and Promotional Messages",
    paragraphs: [
      "Viva Tutorials may send information about tutoring packages, enrolment periods, subject offerings, educational programmes and promotions where permitted by law.",
      "Where prior consent is required, we will obtain it before sending promotional electronic communications. A request to receive promotional messages should be separate from registration for tutoring and should not be preselected by default.",
      "You may opt out of promotional messages at any time by using the unsubscribe method provided or by contacting us through our official communication channels.",
      "Opting out of promotions will not prevent us from sending essential messages relating to an existing enrolment, payment, schedule, safety issue or service you have requested, where such messages are otherwise lawful.",
      "We will maintain reasonable records of marketing preferences and requests to stop promotional communications.",
    ],
  },
  {
    title: "16. Your Rights Under POPIA",
    paragraphs: [
      "Subject to applicable law, you may have the right to:",
      "To protect privacy, we may need to verify your identity or authority to act on behalf of a learner before responding. Some requests may be subject to lawful exceptions or recordkeeping obligations.",
      'To submit a request, email info@vivatutorials.co.za with the subject line "Privacy Request". Explain the request and provide enough information for us to identify the relevant records without sending unnecessary sensitive information.',
    ],
    bullets: [
      "Ask whether we hold personal information about you or the learner you are legally authorised to represent.",
      "Request access to personal information we hold about you, subject to lawful limitations and applicable procedures.",
      "Request correction, updating or deletion of information that is inaccurate, irrelevant, excessive, outdated, incomplete, misleading or unlawfully obtained, where the legal requirements are met.",
      "Object to certain processing where POPIA provides that right.",
      "Withdraw consent where processing is based on consent, subject to the legal consequences of withdrawal.",
      "Object to the use of personal information for direct marketing in accordance with applicable law.",
      "Lodge a complaint with the Information Regulator if you believe your information has been processed unlawfully.",
    ],
  },
  {
    title: "17. Privacy Complaints",
    paragraphs: [
      "If you have a question or concern about how Viva Tutorials handles personal information, please contact us first so we have an opportunity to review and address it.",
      "You may also lodge a complaint with the Information Regulator of South Africa using the contact details and complaint procedures published on its official website: https://inforegulator.org.za.",
      "Contact details, forms and complaint procedures may change. Please consult the Information Regulator's website for current information.",
    ],
  },
  {
    title: "18. Third-Party Websites",
    paragraphs: [
      "Our website may contain links to external websites or services. When you follow an external link, the third party's own privacy policy and terms may apply.",
      "Viva Tutorials does not control every external website's data practices. We encourage users to review third-party privacy notices before submitting information to those services.",
    ],
  },
  {
    title: "19. Changes to This Privacy Policy",
    paragraphs: [
      "We may update this Privacy Policy to reflect changes in our services, systems, data practices or legal obligations.",
      "The latest version will be published on this page with an updated revision date. Where a material change requires notice or consent under applicable law, we will take the appropriate steps.",
      "Changes to this policy do not retrospectively make previously unlawful processing lawful.",
    ],
  },
  {
    title: "20. Contact Viva Tutorials",
    paragraphs: [
      "For privacy enquiries, data access requests, correction requests, objections, consent withdrawals or complaints, contact:",
      "Business: Viva Tutorials.",
      "Website: https://www.vivatutorials.co.za.",
      "Email: info@vivatutorials.co.za.",
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />
      <main id="main-content">
        <section className="bg-gradient-to-b from-white to-[#7949fe]/5 px-6 pb-16 pt-40 sm:pb-20">
          <div className="mx-auto max-w-7xl">
            <motion.header
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center"
            >
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-[#7949fe]">
                Viva Tutorials
              </p>
              <h1 className="mb-5 text-4xl font-bold text-[#1a0b2e] sm:text-5xl md:text-6xl">
                Privacy Policy
              </h1>
              <p className="mx-auto max-w-3xl text-base leading-7 text-gray-600 sm:text-lg">
                Learn how Viva Tutorials handles learner and family information for tutoring in Mfuleni, Cape Town, and online across South Africa.
              </p>
              <p className="mt-4 text-sm font-medium text-gray-500">Last updated: 23 October 2026</p>
            </motion.header>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <nav
              aria-label="Privacy Policy contents"
              className="mb-12 rounded-2xl border border-violet-100 bg-[#7949fe]/5 p-5 sm:p-7"
            >
              <h2 className="mb-4 text-lg font-bold text-[#1a0b2e]">On this page</h2>
              <ol className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                {sections.map((section, index) => (
                  <li key={section.title}>
                    <a
                      className="text-[#5a4ecf] underline-offset-2 hover:underline"
                      href={`#privacy-section-${index + 1}`}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <aside className="mb-10 rounded-xl border-l-4 border-[#ff7849] bg-[#ff7849]/10 p-5 sm:p-6">
              <h2 className="mb-2 text-lg font-bold text-[#1a0b2e]">
                Important information for parents and learners
              </h2>
              <p className="leading-7 text-gray-700">
                Registration with Viva Tutorials is free. We collect learner and parent information to manage enrolment and provide tutoring. If a learner is under 18, a parent or legal guardian should complete registration and provide the permissions required by law. You may contact us with questions about your information or a learner's information you are authorised to access.
              </p>
            </aside>

            <div className="space-y-10 sm:space-y-12">
              {sections.map((section, index) => (
                <motion.section
                  key={section.title}
                  id={`privacy-section-${index + 1}`}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.1 }}
                  transition={{ duration: 0.35 }}
                  className="scroll-mt-32 border-b border-gray-100 pb-9 last:border-0"
                >
                  <h2 className="mb-4 text-xl font-bold leading-snug text-[#1a0b2e] sm:text-2xl">
                    {section.title}
                  </h2>
                  <div className="space-y-3">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph} className="break-words text-[15px] leading-7 text-gray-600">
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets && (
                      <ul className="ml-5 list-disc space-y-2 text-[15px] leading-7 text-gray-600 marker:text-[#7949fe]">
                        {section.bullets.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    )}
                  </div>
                </motion.section>
              ))}
            </div>

            <aside className="mt-10 rounded-2xl border-l-4 border-[#7949fe] bg-[#7949fe]/5 p-5 sm:p-7">
              <h2 className="mb-2 text-xl font-bold text-[#1a0b2e]">Related policy</h2>
              <p className="leading-7 text-gray-600">
                Read this Privacy Policy together with our{" "}
                <a
                  href="/terms-of-service"
                  className="font-semibold text-[#5a4ecf] underline-offset-2 hover:underline"
                >
                  Terms of Service
                </a>
                . For questions about our services or personal information, please{" "}
                <WhatsAppButton message="Hello Viva Tutorials, I have a privacy or personal information enquiry.">WhatsApp Viva</WhatsAppButton>
                .
              </p>
            </aside>
          </div>
        </section>

        <section className="px-6 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl rounded-3xl bg-[#1a0b2e] px-6 py-12 text-center sm:px-12 sm:py-16">
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
              Questions about your privacy?
            </h2>
            <p className="mx-auto mb-7 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              Contact Viva Tutorials about privacy requests, learner records, consent or how personal information is used.
            </p>
            <WhatsAppButton message="Hello Viva Tutorials, I have a privacy or personal information enquiry.">WhatsApp Viva</WhatsAppButton>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
