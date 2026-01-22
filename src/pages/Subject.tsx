import { motion } from 'framer-motion';
import { BookOpen, Target, Award, Users, CheckCircle, Clock } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Footer from '@/components/Footer';

export default function Subject() {
  const subject = {
    name: "Mathematics",
    description: "Master mathematical concepts and problem-solving skills",
    icon: "📐",
    topics: [
      "Algebra & Equations",
      "Trigonometry",
      "Calculus & Derivatives",
      "Geometry & Vectors",
      "Statistics & Probability",
      "Financial Mathematics"
    ],
    grades: ["Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"],
    resources: [
      { type: "Study Guides", count: 45 },
      { type: "Video Lessons", count: 120 },
      { type: "Practice Problems", count: 500 },
      { type: "Past Papers", count: 30 }
    ],
    learningOutcomes: [
      "Develop strong algebraic reasoning",
      "Master problem-solving techniques",
      "Build confidence in exam preparation",
      "Understand real-world applications",
      "Improve mathematical communication"
    ],
    tutorBio: "Expert tutors with advanced Mathematics qualifications and years of teaching experience."
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 bg-gradient-to-b from-white to-[#7949fe]/5">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <div className="text-7xl mb-6">{subject.icon}</div>
            <h1 className="text-5xl md:text-7xl font-bold text-[#1a0b2e] mb-6">
              {subject.name}
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              {subject.description}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="py-16 px-6 bg-gradient-to-r from-[#7949fe]/5 to-[#ff7849]/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {subject.resources.map((resource, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="text-4xl font-bold text-[#7949fe] mb-2">{resource.count}+</div>
                <div className="text-gray-600">{resource.type}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content with Tabs */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <Tabs defaultValue="topics" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-12 bg-gray-100 p-1 rounded-lg">
              <TabsTrigger value="topics" className="rounded-md">Topics</TabsTrigger>
              <TabsTrigger value="resources" className="rounded-md">Resources</TabsTrigger>
              <TabsTrigger value="tutoring" className="rounded-md">Tutoring</TabsTrigger>
            </TabsList>

            {/* Topics Tab */}
            <TabsContent value="topics" className="space-y-12">
              <h2 className="text-3xl font-bold text-[#1a0b2e] mb-8">Key Topics Covered</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {subject.topics.map((topic, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-start gap-4 p-4 bg-gradient-to-r from-[#7949fe]/5 to-[#ff7849]/5 rounded-lg border border-gray-200 hover:border-[#7949fe] transition-all duration-300"
                  >
                    <CheckCircle className="w-6 h-6 text-[#ff7849] flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="font-bold text-[#1a0b2e] mb-1">{topic}</h3>
                      <p className="text-sm text-gray-600">Comprehensive lessons and practice materials available</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-12">
                <h3 className="text-2xl font-bold text-[#1a0b2e] mb-6">Grades Covered</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {subject.grades.map((grade, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, scale: 0.9 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.1 }}
                      className="p-4 bg-[#7949fe]/10 rounded-lg text-center border-2 border-[#7949fe] hover:bg-[#7949fe]/20 transition-all duration-300"
                    >
                      <p className="font-bold text-[#1a0b2e]">{grade}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Resources Tab */}
            <TabsContent value="resources" className="space-y-12">
              <h2 className="text-3xl font-bold text-[#1a0b2e] mb-8">Learning Resources</h2>
              <div className="grid md:grid-cols-2 gap-8">
                {[
                  {
                    title: "Study Guides",
                    icon: <BookOpen className="w-8 h-8" />,
                    description: "Comprehensive study guides covering all topics with examples and explanations."
                  },
                  {
                    title: "Video Lessons",
                    icon: <Clock className="w-8 h-8" />,
                    description: "HD video lessons from expert tutors explaining complex concepts simply."
                  },
                  {
                    title: "Practice Problems",
                    icon: <Target className="w-8 h-8" />,
                    description: "Hundreds of practice problems with step-by-step solutions."
                  },
                  {
                    title: "Past Papers",
                    icon: <Award className="w-8 h-8" />,
                    description: "Previous exam papers with detailed solutions and marking schemes."
                  }
                ].map((resource, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Card className="h-full border-2 border-gray-100 hover:border-[#7949fe] transition-all duration-300">
                      <CardContent className="pt-6">
                        <div className="text-[#7949fe] mb-4">{resource.icon}</div>
                        <h3 className="text-xl font-bold text-[#1a0b2e] mb-3">{resource.title}</h3>
                        <p className="text-gray-600">{resource.description}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <Button className="w-full bg-[#7949fe] hover:bg-[#7949fe]/90 text-white py-6 rounded-lg font-bold text-lg mt-8">
                Access All Resources
              </Button>
            </TabsContent>

            {/* Tutoring Tab */}
            <TabsContent value="tutoring" className="space-y-12">
              <h2 className="text-3xl font-bold text-[#1a0b2e] mb-8">Expert Tutoring</h2>
              
              <div className="bg-gradient-to-r from-[#7949fe]/5 to-[#ff7849]/5 p-8 rounded-lg border-2 border-gray-200">
                <p className="text-gray-700 mb-6">{subject.tutorBio}</p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {[
                  {
                    title: "One-on-One Sessions",
                    features: [
                      "Personalized learning plans",
                      "Flexible scheduling",
                      "Direct tutor access",
                      "Weekly progress reports"
                    ]
                  },
                  {
                    title: "Group Classes",
                    features: [
                      "Small class sizes (5-8 students)",
                      "Interactive learning environment",
                      "Peer collaboration",
                      "Affordable pricing"
                    ]
                  }
                ].map((session, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Card className="h-full border-2 border-gray-100 hover:border-[#7949fe] transition-all duration-300">
                      <CardHeader>
                        <CardTitle className="text-[#1a0b2e] flex items-center gap-2">
                          <Users className="w-6 h-6 text-[#7949fe]" />
                          {session.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-3">
                          {session.features.map((feature, i) => (
                            <li key={i} className="flex items-center gap-3">
                              <CheckCircle className="w-5 h-5 text-[#ff7849] flex-shrink-0" />
                              <span className="text-gray-600">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <h3 className="text-2xl font-bold text-[#1a0b2e] mt-12 mb-6">Learning Outcomes</h3>
              <div className="space-y-3">
                {subject.learningOutcomes.map((outcome, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-center gap-3 p-3 bg-[#7949fe]/5 rounded-lg"
                  >
                    <CheckCircle className="w-6 h-6 text-[#7949fe] flex-shrink-0" />
                    <span className="text-gray-700">{outcome}</span>
                  </motion.div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-gradient-to-b from-[#7949fe]/5 to-white">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Master {subject.name} Today</h2>
          <p className="text-white/60 text-lg mb-8 max-w-2xl mx-auto">
            Start with expert tutoring or explore our comprehensive learning resources.
          </p>
          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <a href="/contact">
              <Button className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">
                Book a Tutor
              </Button>
            </a>
            <a href="#resources">
              <Button variant="outline" className="border-white text-white hover:bg-white/10 py-6 px-10 rounded-full text-lg font-bold">
                Explore Resources
              </Button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
