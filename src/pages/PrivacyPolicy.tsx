import { motion } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from '@/components/Footer';

export default function PrivacyPolicy() {
  const sections = [
    {
      title: "1. Introduction",
      content: "Viva Tutorials ('we', 'us', 'our' or 'Company') operates the website. This page informs visitors regarding our policies with the collection, use, and disclosure of personal data when using our website and the choices you have associated with that data."
    },
    {
      title: "2. Information Collection and Use",
      content: "When you contact us or request a service, we receive the information you choose to submit, such as your name, email address, phone number, and message. Payment and delivery details are processed as needed to complete purchases. Do not include sensitive personal information in website forms."
    },
    {
      title: "3. Use of Data",
      content: "Viva Tutorials uses the collected data for various purposes: to provide and maintain our service, to notify you about changes to our service, to allow you to participate in interactive features, to provide customer support, to gather analysis or valuable information so we can improve our service, to monitor the usage of our service, and to detect, prevent and address technical issues."
    },
    {
      title: "4. Security of Data",
      content: "The security of your data is important to us but remember that no method of transmission over the Internet or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security."
    },
    {
      title: "5. Contact Us",
      content: "If you have questions about this Privacy Policy, contact us at info@vivatutorials.co.za."
    },
    {
      title: "6. Website Analytics",
      content: "This website uses Google Analytics to measure visits and broad interaction categories, such as navigation, resource downloads, and clicks on contact links. Google Analytics may use cookies or similar technologies and may process technical information about your device and use of the site. Contact form contents, names, email addresses, and phone numbers are not sent as analytics events. You can limit tracking through your browser settings or privacy tools. For information about how Google processes data, see Google's Privacy Policy."
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />
      <main id="main-content">
      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 bg-gradient-to-b from-white to-[#7949fe]/5">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <h1 className="text-5xl md:text-7xl font-bold text-[#1a0b2e] mb-6">
              Privacy Policy
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Last updated: September 2026
            </p>
          </motion.div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-12">
            {sections.map((section, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <h2 className="text-2xl font-bold text-[#1a0b2e] mb-4">{section.title}</h2>
                <p className="text-gray-600 leading-relaxed">{section.content}</p>
              </motion.div>
            ))}
          </div>

          {/* Additional Important Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-16 p-8 bg-[#7949fe]/5 rounded-xl border-l-4 border-[#7949fe]"
          >
            <h3 className="text-2xl font-bold text-[#1a0b2e] mb-4">Children's Privacy</h3>
            <p className="text-gray-600">
              Viva Tutorials supports Grade 8-12 learners, who may be under 18. A parent or guardian should submit contact, enrollment, and purchase requests on behalf of learners under 18. Contact us with questions about personal information relating to a learner.
            </p>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Questions About Our Privacy?</h2>
          <p className="text-white/60 text-lg mb-8 max-w-2xl mx-auto">
            We're here to help and answer any questions you might have.
          </p>
          <a href="/contact">
            <Button className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">
              Contact Us
            </Button>
          </a>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
