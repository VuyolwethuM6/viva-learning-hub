import { useState, useEffect } from "react";
import { motion } from 'framer-motion';
import { CheckCircle, Target, Heart, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import TopBar from '@/components/TopBar';
import StickyHeader from '@/components/StickyHeader';
import Footer from '@/components/Footer';
import { FaLinkedin, FaTwitter } from 'react-icons/fa';

// Animated Counter Component
const AnimatedCounter = ({ value, label }: { value: string; label: string }) => {
  const [count, setCount] = useState(0);
  const numericValue = parseInt(value.replace(/\D/g, ""), 10);
  const suffix = value.replace(/\d+/g, "");

  useEffect(() => {
    let start = 0;
    const duration = 1500;
    const increment = numericValue / (duration / 30);
    const timer = setInterval(() => {
      start += increment;
      if (start >= numericValue) {
        start = numericValue;
        clearInterval(timer);
      }
      setCount(Math.floor(start));
    }, 30);
    return () => clearInterval(timer);
  }, [numericValue]);

  return (
    <div className="text-center">
      <div className="text-4xl md:text-5xl font-bold">{count}{suffix}</div>
      <div className="text-gray-200 mt-2">{label}</div>
    </div>
  );
};

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />

      {/* Main content offset for fixed headers */}
      <main className="pt-[6.5rem]"> {/* TopBar(2.5rem) + StickyHeader(4rem) */}

        {/* Hero Section */}
        <section className="relative pt-20 sm:pt-24 pb-16 md:pb-20 px-6 overflow-hidden bg-white">
          {/* Pattern blobs */}
          <motion.div
            className="absolute w-72 h-72 bg-[#7949fe]/20 rounded-full top-10 left-10 blur-3xl"
            animate={{ x: [0, 20, 0], y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute w-96 h-96 bg-[#ff7849]/15 rounded-full bottom-10 right-20 blur-2xl"
            animate={{ x: [0, -30, 0], y: [0, 20, 0] }}
            transition={{ repeat: Infinity, duration: 12, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute w-40 h-40 bg-[#7949fe]/10 rounded-full top-1/2 right-1/3 blur-2xl"
            animate={{ x: [0, 10, 0], y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
          />

          {/* Hero Content */}
          <div className="relative max-w-7xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mb-12 md:mb-16"
            >
              <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-[#1a0b2e] mb-4 sm:mb-6">
                About Viva Tutorials
              </h1>
              <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
                Empowering learners across South Africa with personalized STEM education, expert mentorship, and innovative learning solutions since our founding.
              </p>
            </motion.div>

            {/* CTA */}
            <motion.a
              href="/contact"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-block mt-6"
            >
              <Button className="bg-[#7949fe] text-white hover:bg-[#5a4ecf] py-4 px-8 rounded-full text-lg font-bold shadow-lg">
                Get Started Today
              </Button>
            </motion.a>
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
        <section className="py-24 px-6 bg-[#f7f5ff]">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-4xl font-bold text-[#1a0b2e] text-center mb-16">Why Choose Viva Tutorials?</h2>
            <div className="grid md:grid-cols-2 gap-12">
              {[
                { title: "Expert Tutors", description: "Highly qualified educators with years of experience in their respective subjects" },
                { title: "Personalized Learning", description: "Tailored teaching approaches that adapt to each student's learning style and pace" },
                { title: "Comprehensive Materials", description: "Access to study guides, past papers, video lessons, and revision notes" },
                { title: "Flexible Scheduling", description: "Choose tutoring sessions that fit your schedule with online and in-person options" },
                { title: "Progress Tracking", description: "Regular assessments and detailed progress reports to monitor improvement" },
                { title: "Affordable Pricing", description: "Competitive rates with flexible payment options for all budgets" }
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

        {/* Stats Section */}
        <section className="bg-[#1a0b2e] text-white py-12 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10">
            <AnimatedCounter value="20+" label="Expert Tutors" />
            <AnimatedCounter value="5" label="Years of Excellence" />
            <AnimatedCounter value="95%" label="Success Rate" />
            <AnimatedCounter value="3+" label="Locations" />
          </div>
        </section>

        {/* Founder Section */}
        <section className="py-24 px-6 bg-white">
          <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
<div className="flex justify-center md:justify-end">
  <img
    src="/vuyo.jfif"
    alt="Founder"
    className="w-64 md:w-72 h-auto object-contain shadow-xl rounded-xl"
  />
</div>

            <div className="text-center md:text-left">
              <h2 className="text-4xl font-bold text-[#1a0b2e] mb-4">Meet Our Founder</h2>
              <h3 className="text-xl text-[#7949fe] font-semibold mb-4">Vuyolwethu Mabhuleka</h3>
              <p className="text-gray-700 mb-4">
                Vuyolwethu started Viva Tutorials with the mission to empower learners across South Africa with personalized STEM education. With over 5 years of experience in teaching and mentorship, Vuyolwethu ensures that every learner achieves academic excellence and builds confidence.
              </p>
              <p className="text-gray-700 mb-4">
                Through innovative teaching methods, expert tutors, and a student-centered approach, Viva Tutorials has transformed learning for hundreds of students nationwide.
              </p>
              <div className="mt-4 flex justify-center md:justify-start gap-4">
                <a href="https://www.linkedin.com/in/vuyolwethu" target="_blank" rel="noopener noreferrer">
                  <FaLinkedin className="w-6 h-6 text-[#7949fe] hover:text-[#ff7849]" />
                </a>
                <a href="https://twitter.com/vuyolwethu" target="_blank" rel="noopener noreferrer">
                  <FaTwitter className="w-6 h-6 text-[#7949fe] hover:text-[#ff7849]" />
                </a>
              </div>
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

      </main>

      <Footer />
    </div>
  );
}
