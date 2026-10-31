import { WhatsAppButton } from "@/components/WhatsAppButton";
import { motion } from "framer-motion";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from "@/components/Footer";

type TermsSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  groups?: { title: string; items: string[] }[];
};

const sections: TermsSection[] = [
  {
    title: "1. Introduction and Acceptance of Terms",
    paragraphs: [
      "Welcome to Viva Tutorials.",
      "These Terms of Service govern access to and use of the Viva Tutorials website, tutoring services, educational resources, online learning platforms, and related services.",
      "By registering a learner, purchasing a tutoring package, booking a session, or using our website, you acknowledge these terms. Where the learner is under 18, a parent or legal guardian must complete the registration and accept the applicable terms on the learner's behalf.",
      "If you do not agree with these terms, please do not proceed with a booking or purchase.",
      "Viva Tutorials operates in accordance with applicable South African law, including consumer protection and personal information legislation.",
    ],
  },
  {
    title: "2. About Viva Tutorials",
    paragraphs: [
      "Viva Tutorials provides academic support to school learners and candidates preparing for Matric examinations and rewrites.",
      "Available subjects, grades, schedules, and teaching formats depend on the programmes offered for each intake.",
      "Viva Tutorials reserves the right to organise learners into suitable groups based on grade, subject, availability, and learning needs.",
    ],
    bullets: [
      "Mathematics.",
      "Mathematical Literacy.",
      "Physical Sciences.",
      "Life Sciences.",
      "Natural Sciences support where offered.",
      "Matric rewrite tutoring.",
      "Online tutoring.",
      "In-person tutoring.",
      "Educational worksheets, revision guides, practice questions, and assessments.",
    ],
  },
  {
    title: "3. Registration and Eligibility",
    paragraphs: [
      "3.1. Registration with Viva Tutorials is free. No registration fee is charged.",
      "3.2. Parents or legal guardians must provide accurate contact details and relevant learner information when registering a minor.",
      "3.3. Learners aged 18 or older are responsible for their own registration and payment unless another arrangement has been agreed upon.",
      "3.4. Registration does not guarantee placement in a particular group, time slot, or teaching format. Placement depends on available capacity.",
      "3.5. Parents or guardians must inform Viva Tutorials of relevant changes to contact information, learner details, or circumstances affecting participation.",
      "3.6. A learner's place is confirmed once registration has been accepted, the relevant schedule has been communicated, and the required initial payment has been received.",
      "3.7. Viva Tutorials reserves the right to decline a registration where suitable capacity is unavailable or where reasonable operational or safeguarding concerns prevent enrolment.",
    ],
  },
  {
    title: "4. Tutoring Packages and Fees",
    paragraphs: [
      "4.1. Viva Tutorials offers monthly tutoring packages. Fees depend on the learner's grade, selected subjects, and programme.",
      "4.2. The following are the standard monthly prices currently offered.",
      "4.3. The same standard monthly pricing applies to online and in-person tutoring.",
      "4.4. Registration is free for all programmes. No additional registration charge applies.",
      "4.5. Any optional service, additional subject, special programme, or extra session outside the selected package must be agreed upon before an additional charge is incurred.",
      "4.6. Viva Tutorials will communicate any proposed fee changes before they take effect. Existing bookings and applicable consumer rights will be respected.",
      "4.7. Parents and learners should confirm the selected package, monthly fee, teaching format, and schedule before making payment.",
    ],
    groups: [
      {
        title: "Grades 8 and 9",
        items: ["One subject: R350 per month.", "Two subjects: R600 per month."],
      },
      {
        title: "Grades 10, 11 and 12",
        items: ["One subject: R500 per month.", "Two subjects: R800 per month.", "Three subjects: R1,100 per month."],
      },
      {
        title: "Matric Rewrite Programme",
        items: ["One subject: R550 per month.", "Two subjects: R900 per month.", "Three subjects: R1,200 per month."],
      },
    ],
  },
  {
    title: "5. Payment Terms",
    paragraphs: [
      "5.1. Monthly tutoring fees are payable in advance, on or before the first day of each month.",
      "5.2. New learners must pay the first month's tutoring fee before attending their first session.",
      "5.3. Registration is free. Payment is required only for the selected tutoring package and any separately agreed charges.",
      "5.4. Parents or guardians are responsible for ensuring payments are made by the applicable due date.",
      "5.5. Payments must be made through the payment methods communicated by Viva Tutorials. Learners or parents should retain proof of payment.",
      "5.6. A booking or payment confirmation should be retained for reference if a payment discrepancy arises.",
      "5.7. If payment is overdue, Viva Tutorials will contact the responsible parent, guardian, or adult learner to request settlement.",
      "5.8. Where an account remains unpaid, Viva Tutorials reserves the right to suspend future sessions after reasonable notice and in accordance with applicable law.",
      "5.9. Suspension for non-payment does not automatically cancel outstanding amounts properly owed for services provided.",
      "5.10. Viva Tutorials will not impose undisclosed charges. Any applicable additional fee must be communicated before the customer agrees to it.",
    ],
  },
  {
    title: "6. Scheduling and Attendance",
    paragraphs: [
      "6.1. Tutoring sessions take place according to the schedule communicated to the learner or parent.",
      "6.2. Learners are expected to attend sessions punctually and arrive prepared with the required books, stationery, worksheets, or other learning materials.",
      "6.3. Learners must notify Viva Tutorials as early as possible if they are unable to attend a scheduled session.",
      "6.4. Parents or guardians should communicate attendance concerns involving minor learners.",
      "6.5. A learner who arrives late remains responsible for attending the remaining scheduled portion of the session. The tutor is not automatically required to extend the session.",
      "6.6. Learners must follow reasonable instructions relating to classroom conduct, online participation, and the use of learning resources.",
      "6.7. Repeated absence, disruptive conduct, or failure to follow reasonable rules may result in a discussion with the parent or guardian and, where necessary, suspension or termination in accordance with applicable law.",
    ],
  },
  {
    title: "7. Cancellations and Missed Sessions",
    paragraphs: [
      "7.1. Where an individual session is booked separately, the learner or parent should provide at least 24 hours' notice of cancellation.",
      "7.2. For monthly group packages, learners should notify Viva Tutorials as early as possible if they expect to miss a session.",
      "7.3. A missed session does not automatically entitle the learner to a refund, replacement session, or transfer of the session to another month. Any applicable entitlement remains subject to the agreed package, the circumstances, and applicable law.",
      "7.4. Replacement sessions are subject to tutor availability and must be agreed upon in advance.",
      "7.5. If a tutor cancels a session, Viva Tutorials will communicate the cancellation and arrange a reasonable replacement or appropriate credit or refund, depending on the circumstances and applicable law.",
      "7.6. If Viva Tutorials cancels a session and does not provide the agreed service or an appropriate replacement, the learner's applicable consumer rights remain unaffected.",
      "7.7. Nothing in this section removes any statutory cancellation or refund rights available to a parent, guardian, or learner.",
    ],
  },
  {
    title: "8. Withdrawal and Termination",
    paragraphs: [
      "8.1. A parent, guardian, or adult learner who wishes to withdraw from a programme should notify Viva Tutorials in writing or through another recorded communication channel.",
      "8.2. Monthly tutoring packages are intended to provide tutoring for the relevant paid period. Any cancellation, withdrawal, refund, or amount due will be assessed in accordance with the package agreement and applicable law.",
      "8.3. Where a fixed-term consumer agreement is subject to section 14 of the Consumer Protection Act, the applicable statutory cancellation and notice requirements will apply.",
      "8.4. Viva Tutorials reserves the right to suspend or terminate services for serious misconduct, persistent non-payment, abuse, threats, or conduct that creates a genuine safety concern.",
      "8.5. Where a breach is capable of being remedied, Viva Tutorials will provide reasonable notice and an opportunity to address the breach, subject to applicable law and any immediate safety requirements.",
      "8.6. Termination does not remove either party's lawful rights or obligations relating to services already provided, outstanding payments, refunds, or personal information.",
    ],
  },
  {
    title: "9. Online Tutoring",
    paragraphs: [
      "9.1. Online sessions take place through the virtual learning platform or meeting link communicated by Viva Tutorials.",
      "9.2. Learners must have access to a suitable device, a reasonably stable internet connection, and any required learning materials.",
      "9.3. Learners must use online sessions for their intended educational purpose and behave respectfully towards tutors and other participants.",
      "9.4. Learners must not share meeting links with unauthorised persons or record sessions without prior permission.",
      "9.5. If a learner experiences technical difficulties, the learner or parent should notify Viva Tutorials as soon as possible.",
      "9.6. If technical difficulties on the tutor's side prevent delivery of a session, Viva Tutorials will arrange an appropriate replacement or other reasonable remedy.",
      "9.7. If a session is interrupted by circumstances outside Viva Tutorials' reasonable control, the parties will communicate to determine whether the session should continue, be rescheduled, or be otherwise resolved fairly.",
    ],
  },
  {
    title: "10. In-Person Tutoring and Learner Safety",
    paragraphs: [
      "10.1. Learners must attend the designated venue at the agreed time.",
      "10.2. Parents or guardians are responsible for arranging suitable transport to and from the venue and confirming collection arrangements for minor learners.",
      "10.3. Learners must follow reasonable safety instructions and respect the premises, equipment, tutors, and other learners.",
      "10.4. Parents or guardians should inform Viva Tutorials of relevant arrangements or support needs affecting a minor learner's safe participation.",
      "10.5. Viva Tutorials will take reasonable steps to maintain a respectful and appropriate learning environment.",
      "10.6. Bullying, harassment, threats, violence, deliberate damage to property, and serious disruptive conduct will be addressed promptly.",
      "10.7. Where a safety concern arises, Viva Tutorials will take reasonable steps to protect learners and communicate with the relevant parent or guardian.",
    ],
  },
  {
    title: "11. Educational Outcomes and Academic Responsibility",
    paragraphs: [
      "11.1. Viva Tutorials aims to support learners in improving subject knowledge, understanding, confidence, examination technique, and academic performance.",
      "11.2. Tutoring is a supplementary educational service. It does not replace the learner's school programme, prescribed curriculum, or independent study.",
      "11.3. Academic results depend on several factors, including attendance, effort, preparation, prior knowledge, practice, assessment conditions, and individual learning needs.",
      "11.4. Viva Tutorials does not guarantee a particular mark, examination result, promotion outcome, or pass rate.",
      "11.5. Learners remain responsible for completing school assignments, preparing for examinations, and complying with their school's academic integrity requirements.",
      "11.6. Tutors may provide practice questions, feedback, explanations, revision activities, and assessments to support progress.",
      "11.7. Parents and guardians are encouraged to communicate with Viva Tutorials about learning difficulties or reasonable support needs.",
    ],
  },
  {
    title: "12. Educational Materials and Intellectual Property",
    paragraphs: [
      "12.1. Unless otherwise stated, original worksheets, revision guides, notes, assessments, graphics, website content, and other educational materials created by Viva Tutorials remain its intellectual property or are used under an applicable licence.",
      "12.2. Enrolled learners receive permission to use supplied materials for their own educational purposes.",
      "12.3. Learners and parents must not sell, republish, reproduce for commercial distribution, upload publicly, or distribute Viva Tutorials' original materials to unauthorised persons without written permission.",
      "12.4. Learners must not remove copyright notices or falsely claim ownership of materials created by Viva Tutorials.",
      "12.5. These restrictions do not prevent lawful personal educational use, reasonable use permitted by applicable copyright law, or use of third-party materials according to their applicable licences.",
      "12.6. Unauthorised commercial use of Viva Tutorials' materials may result in appropriate legal action.",
    ],
  },
  {
    title: "13. Website Use and Acceptable Conduct",
    paragraphs: [
      "13.1. Users must provide accurate information when submitting forms or making enquiries.",
      "13.2. Users must not attempt to gain unauthorised access to the website, interfere with its operation, introduce malicious software, or misuse its services.",
      "13.3. Users must not use the website to distribute unlawful, threatening, defamatory, fraudulent, or abusive content.",
      "13.4. Website content is provided for general information and educational support. Users should confirm programme availability, prices, and schedules before making payment.",
      "13.5. Viva Tutorials reserves the right to update website content, correct errors, and maintain or improve its services.",
    ],
  },
  {
    title: "14. Privacy and Personal Information",
    paragraphs: [
      "14.1. Viva Tutorials collects and processes personal information for legitimate purposes connected with registration, communication, tutoring, attendance, administration, payments, learner support, and legal compliance.",
      "14.2. Personal information may include learner names, parent or guardian contact details, grade, selected subjects, attendance information, academic progress, and payment records.",
      "14.3. Viva Tutorials will handle personal information in accordance with applicable data protection law, including the Protection of Personal Information Act 4 of 2013 (POPIA).",
      "14.4. Personal information will be accessed only by authorised persons who need it for legitimate operational or legal purposes, subject to applicable law.",
      "14.5. Viva Tutorials will take reasonable measures to protect personal information against unauthorised access, loss, misuse, and disclosure.",
      "14.6. Personal information will be retained only for as long as reasonably necessary for the purposes for which it was collected, subject to legal recordkeeping requirements.",
      "14.7. Parents, guardians, and adult learners are entitled to exercise applicable rights concerning their personal information, subject to legal requirements and limitations.",
      "14.8. Photographs, identifiable recordings, and testimonials involving learners will not be used for promotional purposes without the appropriate permission and any consent required by law.",
      "14.9. Where personal information concerns a child, Viva Tutorials will comply with the additional legal requirements applicable to children's personal information.",
      "14.10. Further details about information collection, use, retention, disclosure, and data subject rights should be provided in the separate Viva Tutorials Privacy Policy.",
    ],
  },
  {
    title: "15. Third-Party Services and External Links",
    paragraphs: [
      "15.1. The Viva Tutorials website may contain links to third-party websites, payment providers, online learning platforms, or communication services.",
      "15.2. Third-party services operate under their own applicable terms and privacy policies.",
      "15.3. Viva Tutorials does not control every external website or service and is not responsible for matters outside its reasonable control.",
      "15.4. Users should review the relevant third-party terms before submitting personal information or making payments through an external service.",
      "15.5. Nothing in this section excludes liability where exclusion is prohibited by law.",
    ],
  },
  {
    title: "16. Website Availability and Disclaimer",
    paragraphs: [
      "16.1. Viva Tutorials endeavours to keep its website information accurate and its online services reasonably accessible.",
      "16.2. Temporary interruptions may occur because of maintenance, technical faults, internet connectivity, third-party service failures, or other operational circumstances.",
      "16.3. Website content is provided for general information and educational purposes. Errors or outdated information should be reported so they can be reviewed.",
      "16.4. Viva Tutorials does not guarantee uninterrupted website availability or that every website resource will always be free from technical errors.",
      "16.5. These provisions do not exclude any express commitment made to a customer or any right or remedy protected by applicable law.",
    ],
  },
  {
    title: "17. Limitation of Liability",
    paragraphs: [
      "17.1. Viva Tutorials will exercise reasonable care in delivering its tutoring services and handling learner information.",
      "17.2. To the extent permitted by law, Viva Tutorials is not responsible for losses arising from circumstances outside its reasonable control, including failures of third-party internet services or a learner's failure to attend sessions or complete assigned work.",
      "17.3. Nothing in these terms excludes or limits liability for fraud, wilful misconduct, gross negligence where liability cannot lawfully be excluded, or any other liability that applicable law does not permit a party to exclude.",
      "17.4. Nothing in these terms removes consumer rights or remedies available under the Consumer Protection Act or other applicable legislation.",
    ],
  },
  {
    title: "18. Changes to These Terms",
    paragraphs: [
      "18.1. Viva Tutorials may revise these terms when its services, operating procedures, or legal obligations change.",
      "18.2. The latest version will be published on the Viva Tutorials website with an updated revision date.",
      "18.3. Material changes affecting existing customers will be communicated through an appropriate channel where required by law or where reasonably necessary.",
      "18.4. Changes will not retrospectively remove rights already accrued or override statutory protections.",
      "18.5. Where a change requires customer agreement, Viva Tutorials will obtain the required agreement before applying it.",
    ],
  },
  {
    title: "19. Complaints and Dispute Resolution",
    paragraphs: [
      "19.1. Parents, guardians, and adult learners are encouraged to raise concerns directly with Viva Tutorials first.",
      "19.2. Complaints should include sufficient information about the issue, the relevant learner or booking, and the outcome requested.",
      "19.3. Viva Tutorials will review complaints fairly and seek a reasonable resolution.",
      "19.4. If a dispute remains unresolved, either party retains the right to pursue any available legal remedy or approach an appropriate consumer protection body.",
      "19.5. Nothing in this section prevents a consumer from exercising a statutory right or accessing an available dispute resolution process.",
    ],
  },
  {
    title: "20. Governing Law",
    paragraphs: [
      "These terms are governed by the laws of the Republic of South Africa.",
      "Any dispute will be dealt with by a court or other forum with appropriate jurisdiction under applicable South African law.",
      "Nothing in these terms restricts a consumer's statutory rights concerning jurisdiction or dispute resolution.",
    ],
  },
  {
    title: "21. Contact Information",
    paragraphs: [
      "For registration enquiries, payment questions, complaints, privacy requests, or other matters relating to these terms, contact Viva Tutorials through the official contact details published on our website.",
    ],
  },
  {
    title: "22. Final Provisions",
    paragraphs: [
      "If a provision of these terms is found to be unlawful or unenforceable, the remaining provisions will continue to apply to the extent permitted by law.",
      "A failure to enforce a provision on one occasion does not automatically waive the right to enforce it later.",
      "These terms should be read together with the applicable package details, registration information, and Viva Tutorials Privacy Policy.",
      "Thank you for choosing Viva Tutorials. We are committed to supporting learners through accessible tutoring, structured academic support, and a respectful learning environment.",
    ],
  },
];

export default function TermsOfService() {
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
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-[#7949fe]">Viva Tutorials</p>
              <h1 className="mb-5 text-4xl font-bold text-[#1a0b2e] sm:text-5xl md:text-6xl">
                Terms of Service
              </h1>
              <p className="mx-auto max-w-3xl text-base leading-7 text-gray-600 sm:text-lg">
                Please read these terms before registering a learner, booking tutoring, or using our educational resources.
              </p>
              <p className="mt-4 text-sm font-medium text-gray-500">Last updated: 23 October 2026</p>
            </motion.header>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <nav aria-label="Terms of Service contents" className="mb-12 rounded-2xl border border-violet-100 bg-[#7949fe]/5 p-5 sm:p-7">
              <h2 className="mb-4 text-lg font-bold text-[#1a0b2e]">On this page</h2>
              <ol className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                {sections.map((section, index) => (
                  <li key={section.title}>
                    <a className="text-[#5a4ecf] underline-offset-2 hover:underline" href={`#terms-section-${index + 1}`}>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="mb-10 rounded-xl border-l-4 border-[#ff7849] bg-[#ff7849]/10 p-5 sm:p-6">
              <p className="leading-relaxed text-gray-700">
                These Terms of Service apply to use of the Viva Tutorials website and services. Where a learner is under 18, a parent or legal guardian must register and accept the applicable terms on the learner's behalf.
              </p>
            </div>

            <div className="space-y-10 sm:space-y-12">
              {sections.map((section, index) => (
                <motion.section
                  key={section.title}
                  id={`terms-section-${index + 1}`}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.1 }}
                  transition={{ duration: 0.35 }}
                  className="scroll-mt-32 border-b border-gray-100 pb-9 last:border-0"
                >
                  <h2 className="mb-4 text-xl font-bold leading-snug text-[#1a0b2e] sm:text-2xl">{section.title}</h2>
                  <div className="space-y-3">
                    {section.paragraphs?.map((paragraph) => (
                      <p key={paragraph} className="break-words text-[15px] leading-7 text-gray-600">{paragraph}</p>
                    ))}
                    {section.bullets && (
                      <ul className="ml-5 list-disc space-y-2 text-[15px] leading-7 text-gray-600 marker:text-[#7949fe]">
                        {section.bullets.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    )}
                    {section.groups?.map((group) => (
                      <div key={group.title} className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                        <h3 className="mb-2 font-bold text-[#1a0b2e]">{group.title}</h3>
                        <ul className="ml-5 list-disc space-y-1.5 text-[15px] leading-6 text-gray-600 marker:text-[#7949fe]">
                          {group.items.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {index === 20 && (
                    <address className="mt-4 not-italic text-[15px] leading-7 text-gray-600">
                      <p>Website: <a href="https://www.vivatutorials.co.za" className="font-medium text-[#5a4ecf] underline-offset-2 hover:underline">www.vivatutorials.co.za</a></p>
                      <p>Email: <a href="mailto:info@vivatutorials.co.za" className="font-medium text-[#5a4ecf] underline-offset-2 hover:underline">info@vivatutorials.co.za</a></p>
                      <p>WhatsApp: <a href="tel:+27733913206" className="font-medium text-[#5a4ecf] underline-offset-2 hover:underline">+27 73 391 3206</a></p>
                    </address>
                  )}
                </motion.section>
              ))}
            </div>

            <aside className="mt-10 rounded-2xl border-l-4 border-[#7949fe] bg-[#7949fe]/5 p-5 sm:p-7">
              <h2 className="mb-2 text-xl font-bold text-[#1a0b2e]">Privacy and personal information</h2>
              <p className="leading-7 text-gray-600">
                Read these terms together with our{" "}
                <a href="/privacy-policy" className="font-semibold text-[#5a4ecf] underline-offset-2 hover:underline">Privacy Policy</a>.
                {" "}For questions about our services or these terms, please{" "}
                <WhatsAppButton message="Hello Viva Tutorials, I have a question about your tutoring terms.">WhatsApp Viva</WhatsAppButton>.
              </p>
            </aside>
          </div>
        </section>

        <section className="px-6 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl rounded-3xl bg-[#1a0b2e] px-6 py-12 text-center sm:px-12 sm:py-16">
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">Questions about these terms?</h2>
            <p className="mx-auto mb-7 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              Contact Viva Tutorials if you have a question about our tutoring services, packages, or policies.
            </p>
            <WhatsAppButton message="Hello Viva Tutorials, I have a question about your tutoring terms.">WhatsApp Viva</WhatsAppButton>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
