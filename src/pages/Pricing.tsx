import { motion } from 'framer-motion';
import { Check, X, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TopBar from '@/components/TopBar';
import StickyHeader from '@/components/StickyHeader';
import Footer from '@/components/Footer';

export default function Pricing() {
  const plans = [
    {
      name: "Single Session",
      price: "R150",
      period: "/session",
      description: "Perfect for one-time help",
      features: ["1 tutoring session", "Chat support", "Study material access"],
      highlighted: false
    },
    {
      name: "Starter",
      price: "R500",
      period: "/month",
      description: "Perfect for casual learners",
      features: ["4 tutoring sessions", "Group classes (max 6)", "Digital study materials", "Email support", "Progress tracking"],
      highlighted: false
    },
    {
      name: "Standard",
      price: "R850",
      period: "/month",
      description: "Best for dedicated learners",
      features: ["8 sessions per month", "Small group (max 3)", "Printed & digital materials", "WhatsApp support", "Monthly assessments", "Parent-teacher meetings"],
      highlighted: true
    },
    {
      name: "Premium",
      price: "R1200",
      period: "/month",
      description: "For full support & exam prep",
      features: ["12 sessions per month", "One-on-one tutoring", "Complete resource library", "24/7 tutor access", "Weekly progress reports", "Exam workshops", "University application guidance"],
      highlighted: false
    }
  ];

  const whyChoose = [
    { title: "Expert Tutors", desc: "Highly qualified educators with years of experience" },
    { title: "Flexible Learning", desc: "Study at your own pace with personalized schedules" },
    { title: "Proven Results", desc: "95% of our students improve their grades" }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Topbar + Sticky Header */}
      <TopBar />
      <StickyHeader />

      {/* Hero Section */}
      <section className="relative pt-[10.5rem] md:pt-44 pb-20 px-6 bg-gradient-to-b from-white to-[#7949fe]/5 overflow-hidden">
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

        <div className="relative max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-12 md:mb-16"
          >
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-[#1a0b2e] mb-4 sm:mb-6">
              Flexible Pricing Plans
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
              Choose the plan that works best for your learning needs and budget.
            </p>

            <motion.a
              href="https://forms.gle/sh3Be1fF8gD1qt9G9"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-block mt-8"
            >
              <Button className="bg-[#7949fe] text-white hover:bg-[#5a4ecf] py-4 px-10 rounded-full font-bold text-lg shadow-lg">
                Enroll Now
              </Button>
            </motion.a>
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8">
          {plans.map((plan, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className={`relative`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                  <span className="bg-[#ff7849] text-white px-4 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                    <Zap className="w-4 h-4" />
                    Most Popular
                  </span>
                </div>
              )}
              <Card className={`h-full border-2 ${plan.highlighted ? 'border-[#7949fe] shadow-2xl' : 'border-[#7949fe]'} transition-all duration-300`}>
                <CardHeader>
                  <CardTitle className="text-[#1a0b2e]">{plan.name}</CardTitle>
                  <p className="text-gray-600 text-sm mt-2">{plan.description}</p>
                  <div className="mt-6">
                    <span className="text-5xl font-bold text-[#7949fe]">{plan.price}</span>
                    <span className="text-gray-600">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button 
                    className={`w-full mb-8 py-6 rounded-lg font-bold ${
                      plan.highlighted 
                        ? 'bg-[#7949fe] hover:bg-[#5a4ecf] text-white' 
                        : 'bg-gray-100 hover:bg-gray-200 text-[#1a0b2e]'
                    }`}
                  >
                    Choose {plan.name}
                  </Button>
                  <div className="space-y-4">
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Check className="w-5 h-5 text-[#ff7849] flex-shrink-0" />
                        <span className="text-gray-700">{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Why Choose Viva? */}
      <section className="py-24 px-6 bg-[#f7f5ff] relative overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl font-bold text-[#1a0b2e] text-center mb-6">Why Choose Viva?</h2>
          <p className="text-center text-gray-600 mb-12 max-w-3xl mx-auto">
            Our approach ensures personalized attention, expert guidance, and measurable results for every learner.
          </p>

          <div className="grid md:grid-cols-3 gap-12">
            {whyChoose.map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="text-center"
              >
                <div className="w-16 h-16 bg-[#7949fe]/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <div className="w-8 h-8 bg-[#7949fe] rounded"></div>
                </div>
                <h3 className="text-xl font-bold text-[#1a0b2e] mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Ready to Start Learning?</h2>
          <p className="text-white/60 text-lg mb-8 max-w-2xl mx-auto">
            Join hundreds of students already achieving their goals with Viva Tutorials.
          </p>
          <a href="https://forms.gle/sh3Be1fF8gD1qt9G9">
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
