import { motion } from 'framer-motion';
import { BookOpen, Users, Clock, Award, MessageSquare, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from '@/components/Footer';

export default function Services() {
  const services = [
    {
      icon: <BookOpen className="w-12 h-12" />,
      title: "One-on-One Tutoring",
      description: "Personalized one-on-one sessions with expert tutors tailored to your learning style and goals.",
      features: ["Flexible Scheduling", "Customized Curriculum", "Regular Progress Reports", "Exam Preparation"]
    },
    {
      icon: <Users className="w-12 h-12" />,
      title: "Group Classes",
      description: "Interactive group learning sessions for collaborative study and peer interaction.",
      features: ["Small Group Sizes", "Interactive Sessions", "Group Discounts", "Social Learning"]
    },
    {
      icon: <Clock className="w-12 h-12" />,
      title: "Online Learning",
      description: "Access live virtual classes and pre-recorded lessons from the comfort of your home.",
      features: ["Live Sessions", "Recorded Lessons", "24/7 Access", "Flexible Duration"]
    },
    {
      icon: <Award className="w-12 h-12" />,
      title: "Exam Preparation",
      description: "Comprehensive exam preparation programs including practice papers and mock exams.",
      features: ["Past Paper Solutions", "Mock Exams", "Time Management Tips", "Subject Mastery"]
    },
    {
      icon: <MessageSquare className="w-12 h-12" />,
      title: "Study Materials",
      description: "Access to comprehensive study guides, notes, and resources for all major subjects.",
      features: ["Study Guides", "Video Lessons", "Practice Questions", "Quick Notes"]
    },
    {
      icon: <Zap className="w-12 h-12" />,
      title: "Workshop & Seminars",
      description: "Special workshops on specific topics, exam strategies, and study techniques.",
      features: ["Expert Sessions", "Small Groups", "Interactive Q&A", "Certificate of Participation"]
    }
  ];

  const subjects = [
    "Mathematics",
    "Physical Science",
    "Life Sciences",
    "Accounting",
    "Information Technology",
    "Geography",
    "English",
    "Afrikaans"
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
            className="text-center mb-16"
          >
            <h1 className="text-5xl md:text-7xl font-bold text-[#1a0b2e] mb-6">
              Our Services
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Comprehensive educational services designed to help you achieve your academic goals.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className="h-full border-2 border-gray-100 hover:border-[#7949fe] transition-all duration-300 hover:shadow-lg">
                  <CardHeader>
                    <div className="text-[#7949fe] mb-4">{service.icon}</div>
                    <CardTitle className="text-[#1a0b2e]">{service.title}</CardTitle>
                    <CardDescription>{service.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {service.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-[#ff7849]"></div>
                          <span className="text-gray-600">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Subjects Covered */}
      <section className="py-24 px-6 bg-gradient-to-b from-[#7949fe]/5 to-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-[#1a0b2e] text-center mb-16">Subjects We Cover</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {subjects.map((subject, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white p-6 rounded-xl border-2 border-gray-100 text-center hover:border-[#7949fe] hover:shadow-lg transition-all duration-300"
              >
                <p className="font-semibold text-[#1a0b2e]">{subject}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-[#1a0b2e] text-center mb-16">How Our Services Work</h2>
          
          <div className="space-y-12">
            {[
              { step: "1", title: "Assessment", description: "We assess your current level and identify areas for improvement" },
              { step: "2", title: "Planning", description: "Create a personalized learning plan tailored to your goals" },
              { step: "3", title: "Learning", description: "Engage with expert tutors using proven teaching methods" },
              { step: "4", title: "Progress", description: "Track your improvement with regular assessments and reports" },
              { step: "5", title: "Success", description: "Achieve your academic goals with confidence" }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="flex gap-8 items-start"
              >
                <div className="w-16 h-16 rounded-full bg-[#7949fe] text-white flex items-center justify-center flex-shrink-0 font-bold text-xl">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#1a0b2e] mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-lg">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Choose Your Service Today</h2>
          <p className="text-white/60 text-lg mb-8 max-w-2xl mx-auto">
            Start your journey to academic excellence with our comprehensive services.
          </p>
          <a href="/contact">
            <Button className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">
              Get in Touch
            </Button>
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
