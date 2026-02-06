import { motion } from 'framer-motion';
import { BookOpen, Users, Clock, Award, MessageSquare, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import TopBar from '@/components/TopBar';
import StickyHeader from '@/components/StickyHeader';
import Footer from '@/components/Footer';

export default function Services() {
  const services = [
    {
      icon: <BookOpen className="w-12 h-12 text-[#7949fe]" />,
      title: "One-on-One Tutoring",
      description: "Personalized one-on-one sessions with expert tutors tailored to your learning style and goals.",
      features: ["Flexible Scheduling", "Customized Curriculum", "Regular Progress Reports", "Exam Preparation"]
    },
    {
      icon: <Users className="w-12 h-12 text-[#7949fe]" />,
      title: "Group Classes",
      description: "Interactive group learning sessions for collaborative study and peer interaction.",
      features: ["Small Group Sizes", "Interactive Sessions", "Group Discounts", "Social Learning"]
    },
    {
      icon: <Clock className="w-12 h-12 text-[#7949fe]" />,
      title: "Online Learning",
      description: "Access live virtual classes and pre-recorded lessons from the comfort of your home.",
      features: ["Live Sessions", "Recorded Lessons", "24/7 Access", "Flexible Duration"]
    },
    {
      icon: <Award className="w-12 h-12 text-[#7949fe]" />,
      title: "Exam Preparation",
      description: "Comprehensive exam preparation programs including practice papers and mock exams.",
      features: ["Past Paper Solutions", "Mock Exams", "Time Management Tips", "Subject Mastery"]
    },
    {
      icon: <MessageSquare className="w-12 h-12 text-[#7949fe]" />,
      title: "Study Materials",
      description: "Access to comprehensive study guides, notes, and resources for all major subjects.",
      features: ["Study Guides", "Video Lessons", "Practice Questions", "Quick Notes"]
    },
    {
      icon: <Zap className="w-12 h-12 text-[#7949fe]" />,
      title: "Workshops & Seminars",
      description: "Special workshops on specific topics, exam strategies, and study techniques.",
      features: ["Expert Sessions", "Small Groups", "Interactive Q&A", "Certificate of Participation"]
    }
  ];

  const subjects = [
    { name: "Mathematics", img: "/subjects/mathematics.png" },
    { name: "Physical Science", img: "/subjects/physical-sciences.png" },
    { name: "Life Sciences", img: "/subjects/life-sciences.png" },
    { name: "Mathematical Literacy", img: "/subjects/maths-lit.png" },
  ];

  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />

      {/* Hero Section */}
      <section className="relative pt-[12rem] sm:pt-[10rem] pb-16 md:pb-20 px-6 overflow-hidden bg-white">
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
              Our Services
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
              Comprehensive educational services designed to help you achieve your academic goals.
            </p>
          </motion.div>

          {/* Enroll Now Button */}
          <motion.a
            href="https://forms.gle/sh3Be1fF8gD1qt9G9"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-block mt-6"
          >
            <Button className="bg-[#7949fe] text-white hover:bg-[#5a4ecf] py-4 px-8 rounded-full text-lg font-bold shadow-lg">
              Enroll Now
            </Button>
          </motion.a>
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
                <Card className="h-full border-2 border-[#7949fe] hover:border-[#5a4ecf] transition-all duration-300 hover:shadow-lg">
                  <CardHeader>
                    <div className="mb-4">{service.icon}</div>
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
{/* Subjects Covered */}
<section className="py-24 px-6 bg-[#f7f5ff]">
  <div className="max-w-7xl mx-auto">
    <h2 className="text-4xl font-bold text-[#1a0b2e] text-center mb-16">Subjects We Cover</h2>
        <p className="text-center text-gray-600 text-lg max-w-3xl mx-auto mb-12">
      Our curriculum spans key subjects to ensure learners are fully prepared for exams and academic success. Each subject is supported with expert guidance and comprehensive resources.
    </p>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {subjects.map((subject, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: idx * 0.05 }}
          className="rounded-xl border-2 border-[#7949fe] overflow-hidden shadow-md transition-all duration-300"
        >
          <div
            className="w-full h-48 sm:h-60 md:h-64 bg-center bg-cover"
            style={{ backgroundImage: `url(${subject.img})`, backgroundRepeat: "no-repeat" }}
          />
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
          <a href="https://forms.gle/sh3Be1fF8gD1qt9G9">
            <Button className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">
              Start Now
            </Button>
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
