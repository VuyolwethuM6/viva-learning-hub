import { motion } from 'framer-motion';
import { Check, X, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from '@/components/Footer';

export default function Pricing() {
  const plans = [
    {
      name: "Starter",
      price: "R299",
      period: "/month",
      description: "Perfect for casual learners",
      features: [
        { name: "4 tutoring sessions", included: true },
        { name: "Chat support", included: true },
        { name: "Study materials access", included: true },
        { name: "Progress reports", included: false },
        { name: "One-on-one priority", included: false },
        { name: "Mock exams", included: false }
      ],
      highlighted: false
    },
    {
      name: "Professional",
      price: "R599",
      period: "/month",
      description: "Best for dedicated learners",
      features: [
        { name: "8 tutoring sessions", included: true },
        { name: "Priority email support", included: true },
        { name: "Study materials access", included: true },
        { name: "Weekly progress reports", included: true },
        { name: "One-on-one priority", included: true },
        { name: "Mock exams", included: false }
      ],
      highlighted: true
    },
    {
      name: "Excellence",
      price: "R999",
      period: "/month",
      description: "For exam preparation",
      features: [
        { name: "Unlimited sessions", included: true },
        { name: "24/7 support", included: true },
        { name: "Study materials access", included: true },
        { name: "Daily progress reports", included: true },
        { name: "One-on-one priority", included: true },
        { name: "Mock exams + feedback", included: true }
      ],
      highlighted: false
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />
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
              Flexible Pricing Plans
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Choose the plan that works best for your learning needs and budget.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {plans.map((plan, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className={`relative ${plan.highlighted ? 'md:scale-105' : ''}`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                    <span className="bg-[#ff7849] text-white px-4 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                      <Zap className="w-4 h-4" />
                      Most Popular
                    </span>
                  </div>
                )}
                <Card className={`h-full border-2 ${plan.highlighted ? 'border-[#7949fe] shadow-2xl' : 'border-gray-100'} transition-all duration-300`}>
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
                          ? 'bg-[#7949fe] hover:bg-[#7949fe]/90 text-white' 
                          : 'bg-gray-100 hover:bg-gray-200 text-[#1a0b2e]'
                      }`}
                    >
                      Get Started
                    </Button>
                    <div className="space-y-4">
                      {plan.features.map((feature, i) => (
                        <div key={i} className="flex items-center gap-3">
                          {feature.included ? (
                            <Check className="w-5 h-5 text-[#ff7849] flex-shrink-0" />
                          ) : (
                            <X className="w-5 h-5 text-gray-300 flex-shrink-0" />
                          )}
                          <span className={feature.included ? 'text-gray-700' : 'text-gray-400'}>
                            {feature.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Comparison */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl font-bold text-[#1a0b2e] text-center mb-12">Why Choose Viva?</h2>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { title: "Expert Tutors", desc: "Highly qualified educators with years of experience" },
                { title: "Flexible Learning", desc: "Study at your own pace with personalized schedules" },
                { title: "Proven Results", desc: "95% of our students improve their grades" }
              ].map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
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
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6 bg-gradient-to-b from-[#7949fe]/5 to-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-[#1a0b2e] text-center mb-12">Pricing FAQs</h2>
          <div className="space-y-6">
            {[
              {
                q: "Can I change my plan anytime?",
                a: "Yes! You can upgrade or downgrade your plan at any time. Changes take effect at the next billing cycle."
              },
              {
                q: "Is there a long-term contract?",
                a: "No contracts! You can cancel anytime with no penalties. We believe in earning your business."
              },
              {
                q: "Do you offer discounts for long-term commitments?",
                a: "Yes! We offer 10% discount for 6-month plans and 15% for 12-month plans."
              },
              {
                q: "What payment methods do you accept?",
                a: "We accept credit cards, debit cards, and bank transfers. All payments are secured and processed securely."
              }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white p-6 rounded-xl border-2 border-gray-100 hover:border-[#7949fe] transition-all duration-300"
              >
                <h3 className="font-bold text-[#1a0b2e] mb-2 text-lg">{item.q}</h3>
                <p className="text-gray-600">{item.a}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Ready to Start Learning?</h2>
          <p className="text-white/60 text-lg mb-8 max-w-2xl mx-auto">
            Join hundreds of students already achieving their goals with Viva Tutorials.
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
