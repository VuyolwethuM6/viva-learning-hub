import { motion } from 'framer-motion';
import { CheckCircle, Users, Award, Target, Heart, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import TopBar from '@/components/TopBar';
import StickyHeader from '@/components/StickyHeader';
import Footer from '@/components/Footer';

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />
      {/* Hero Section */}
      <section className="pt-40 pb-20 bg-gradient-to-b from-white to-white px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h1 className="text-5xl md:text-7xl font-bold text-[#1a0b2e] mb-6">
              About Viva Tutorials
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Empowering learners across South Africa with personalized STEM education, expert mentorship, and innovative learning solutions since our founding.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission, Vision, Values */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <Target className="w-16 h-16 text-[#7949fe] mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-[#1a0b2e] mb-4">Our Mission</h3>
              <p className="text-gray-600">
                To provide high-quality, accessible STEM education that empowers Grade 8-12 learners to achieve academic excellence and build confidence in their abilities.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-center"
            >
              <Zap className="w-16 h-16 text-[#ff7849] mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-[#1a0b2e] mb-4">Our Vision</h3>
              <p className="text-gray-600">
                To be the leading provider of personalized tutoring and learning solutions in South Africa, transforming education through innovation and excellence.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-center"
            >
              <Heart className="w-16 h-16 text-[#7949fe] mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-[#1a0b2e] mb-4">Our Values</h3>
              <p className="text-gray-600">
                Excellence, integrity, innovation, and student-centered learning. We believe every learner deserves personalized attention and expert guidance.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-24 px-6 bg-gradient-to-b from-[#7949fe]/5 to-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-[#1a0b2e] text-center mb-16">Why Choose Viva Tutorials?</h2>
          
          <div className="grid md:grid-cols-2 gap-12">
            {[
              {
                title: "Expert Tutors",
                description: "Highly qualified educators with years of experience in their respective subjects"
              },
              {
                title: "Personalized Learning",
                description: "Tailored teaching approaches that adapt to each student's learning style and pace"
              },
              {
                title: "Comprehensive Materials",
                description: "Access to study guides, past papers, video lessons, and revision notes"
              },
              {
                title: "Flexible Scheduling",
                description: "Choose tutoring sessions that fit your schedule with online and in-person options"
              },
              {
                title: "Progress Tracking",
                description: "Regular assessments and detailed progress reports to monitor improvement"
              },
              {
                title: "Affordable Pricing",
                description: "Competitive rates with flexible payment options for all budgets"
              }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="flex gap-4"
              >
                <CheckCircle className="w-8 h-8 text-[#7949fe] flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold text-[#1a0b2e] mb-2">{item.title}</h3>
                  <p className="text-gray-600">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            {[
              { number: "500+", label: "Students Helped" },
              { number: "50+", label: "Expert Tutors" },
              { number: "15", label: "Subjects Covered" },
              { number: "95%", label: "Success Rate" }
            ].map((stat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="text-5xl font-bold text-[#7949fe] mb-2">{stat.number}</div>
                <div className="text-gray-600">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Ready to Transform Your Learning?</h2>
          <p className="text-white/60 text-lg mb-8 max-w-2xl mx-auto">
            Join hundreds of students achieving their goals with Viva Tutorials.
          </p>
          <a href="/contact">
            <Button className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">
              Get Started Today
            </Button>
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
