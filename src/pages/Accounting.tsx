import { motion } from 'framer-motion';
import { CheckCircle, Target, Award, Users, BookOpen, Clock } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from '@/components/Footer';

export default function Accounting() {
  const topics = [
    "Financial Statements",
    "Journal Entries & Ledgers",
    "Audit & Internal Control",
    "Cost Accounting",
    "VAT & Taxation",
    "Financial Analysis"
  ];

  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />
      <main id="main-content">
      <section className="pt-40 pb-20 px-6 bg-gradient-to-b from-white to-[#7949fe]/5">
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="text-center">
            <div className="text-7xl mb-6">💼</div>
            <h1 className="text-5xl md:text-7xl font-bold text-[#1a0b2e] mb-6">Accounting</h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">Master accounting principles, financial reporting, and auditing with expert guidance</p>
          </motion.div>
        </div>
      </section>

      <section className="py-16 px-6 bg-gradient-to-r from-[#7949fe]/5 to-[#ff7849]/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[{ type: "Study Guides", count: 42 }, { type: "Video Lessons", count: 110 }, { type: "Practice Cases", count: 95 }, { type: "Past Papers", count: 25 }].map((r, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
                <div className="text-4xl font-bold text-[#7949fe] mb-2">{r.count}+</div>
                <div className="text-gray-600">{r.type}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <Tabs defaultValue="topics">
            <TabsList className="grid w-full grid-cols-3 mb-12 bg-gray-100 p-1 rounded-lg">
              <TabsTrigger value="topics" className="rounded-md">Topics</TabsTrigger>
              <TabsTrigger value="resources" className="rounded-md">Resources</TabsTrigger>
              <TabsTrigger value="tutoring" className="rounded-md">Tutoring</TabsTrigger>
            </TabsList>

            <TabsContent value="topics" className="space-y-12">
              <h2 className="text-3xl font-bold text-[#1a0b2e] mb-8">Key Topics</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {topics.map((t, i) => (
                  <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} className="flex gap-4 p-4 bg-gradient-to-r from-[#7949fe]/5 to-[#ff7849]/5 rounded-lg border border-gray-200">
                    <CheckCircle className="w-6 h-6 text-[#ff7849] flex-shrink-0" />
                    <div>
                      <h3 className="font-bold text-[#1a0b2e]">{t}</h3>
                      <p className="text-sm text-gray-600">Practical case studies and worked examples</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="resources" className="space-y-12">
              <h2 className="text-3xl font-bold text-[#1a0b2e] mb-8">Resources</h2>
              <div className="grid md:grid-cols-2 gap-8">
                {[{ title: "Study Guides", icon: BookOpen }, { title: "Video Lessons", icon: Clock }, { title: "Case Studies", icon: Target }, { title: "Past Papers", icon: Award }].map((r, i) => (
                  <Card key={i} className="border-2 border-gray-100 hover:border-[#7949fe]">
                    <CardContent className="pt-6">
                      <div className="text-[#7949fe] mb-4"><r.icon className="w-8 h-8" /></div>
                      <h3 className="text-xl font-bold text-[#1a0b2e] mb-2">{r.title}</h3>
                      <p className="text-gray-600">Resources for mastering accounting principles and practice</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="tutoring">
              <h2 className="text-3xl font-bold text-[#1a0b2e] mb-8">Expert Tutoring</h2>
              <p className="text-gray-600 mb-8">Certified accountants provide step-by-step guidance through complex accounting concepts and real-world scenarios.</p>
              <Button className="w-full bg-[#7949fe] hover:bg-[#7949fe]/90 text-white py-6 rounded-lg font-bold">Book a Session</Button>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <section className="py-20 px-6 bg-[#1a0b2e] rounded-[3rem] mx-6 md:mx-24">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Master Accounting</h2>
          <a href="/contact">
            <Button className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">Book Your Tutor</Button>
          </a>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
