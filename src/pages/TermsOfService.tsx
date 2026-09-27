import { motion } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from '@/components/Footer';

export default function TermsOfService() {
  const sections = [
    {
      title: "1. Agreement to Terms",
      content: "By accessing and using the Viva Tutorials website and services, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service."
    },
    {
      title: "2. Use License",
      content: "Permission is granted to temporarily download one copy of the materials (information or software) on Viva Tutorials for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not: modify or copy the materials; use the materials for any commercial purpose or for any public display; attempt to decompile or reverse engineer any software contained on the website; remove any copyright or other proprietary notations from the materials; transferring the materials to another person or 'mirror' the materials on any other server."
    },
    {
      title: "3. Disclaimer",
      content: "The materials on Viva Tutorials are provided 'as is'. Viva Tutorials makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights."
    },
    {
      title: "4. Limitations",
      content: "In no event shall Viva Tutorials or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Viva Tutorials, even if Viva Tutorials or an authorized representative has been notified orally or in writing of the possibility of such damage."
    },
    {
      title: "5. Accuracy of Materials",
      content: "The materials appearing on Viva Tutorials could include technical, typographical, or photographic errors. Viva Tutorials does not warrant that any of the materials on the website are accurate, complete, or current. Viva Tutorials may make changes to the materials contained on its website at any time without notice."
    },
    {
      title: "6. Links",
      content: "Viva Tutorials has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by Viva Tutorials of the site. Use of any such linked website is at the user's own risk."
    },
    {
      title: "7. Modifications",
      content: "Viva Tutorials may revise these terms of service for our website at any time without notice. By using this website, you are agreeing to be bound by the then current version of these terms of service."
    },
    {
      title: "8. Governing Law",
      content: "These terms and conditions are governed by and construed in accordance with the laws of the Republic of South Africa and you irrevocably submit to the exclusive jurisdiction of the courts located therein."
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
              Terms of Service
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Last updated: January 2024
            </p>
          </motion.div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12 p-6 bg-[#ff7849]/10 rounded-xl border-l-4 border-[#ff7849]"
          >
            <p className="text-gray-700">
              Welcome to Viva Tutorials. These terms of service outline the rules and regulations for the use of our website and services. By accessing this website, you accept these terms and conditions in full. Do not continue to use Viva Tutorials if you do not accept all of the terms and conditions stated on this page.
            </p>
          </motion.div>

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

          {/* Important Notice */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-16 p-8 bg-[#7949fe]/5 rounded-xl border-l-4 border-[#7949fe]"
          >
            <h3 className="text-2xl font-bold text-[#1a0b2e] mb-4">Tutoring Services Terms</h3>
            <ul className="space-y-3 text-gray-600">
              <li>• All tutoring sessions must be booked in advance</li>
              <li>• Cancellations must be made 24 hours before the scheduled session</li>
              <li>• Payment is due before the commencement of services</li>
              <li>• We reserve the right to modify or discontinue services at any time</li>
              <li>• Student confidentiality and privacy are strictly maintained</li>
              <li>• All materials provided are for educational use only</li>
            </ul>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Accept Our Terms?</h2>
          <p className="text-white/60 text-lg mb-8 max-w-2xl mx-auto">
            Ready to start your learning journey with Viva Tutorials?
          </p>
          <a href="/contact">
            <Button className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">
              Get Started
            </Button>
          </a>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
