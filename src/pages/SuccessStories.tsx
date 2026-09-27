import { motion } from 'framer-motion';
import { Star, TrendingUp, Award } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from '@/components/Footer';

export default function SuccessStories() {
  const stories = [
    {
      name: "Amahle Dlamini",
      grade: "Grade 12",
      subject: "Mathematics",
      improvement: "+35%",
      story: "Struggled with calculus until I joined Viva Tutorials. The personalized approach helped me understand concepts I thought impossible. I went from a D to an A!",
      quote: "The tutors didn't just teach me; they gave me confidence in my abilities.",
      result: "Achieved 92% in final exams"
    },
    {
      name: "Thabo Mkhize",
      grade: "Grade 11",
      subject: "Physical Science",
      improvement: "+42%",
      story: "I was failing Physical Science completely. Viva's structured lessons and hands-on explanations transformed my understanding. Now I'm passing with flying colors.",
      quote: "Best decision I made for my academic journey.",
      result: "Improved from 28% to 70% within 4 months"
    },
    {
      name: "Naledi Mogubane",
      grade: "Grade 10",
      subject: "Life Sciences",
      improvement: "+38%",
      story: "Biology was overwhelming, but my tutor broke everything into manageable pieces. The mock exams really prepared me for the real thing.",
      quote: "I now actually enjoy learning Life Sciences!",
      result: "Top student in Life Sciences class"
    },
    {
      name: "Lerato Nkosi",
      grade: "Grade 12",
      subject: "Accounting",
      improvement: "+40%",
      story: "Accounting seemed like a foreign language to me. The clear explanations and practical examples made everything click. I now want to study Accounting at university!",
      quote: "My tutor made me realize I could excel at anything.",
      result: "University admission to top accounting program"
    },
    {
      name: "Kabelo Pule",
      grade: "Grade 11",
      subject: "Information Technology",
      improvement: "+45%",
      story: "Coding was intimidating until I started with Viva. My tutor explained concepts step-by-step and gave me confidence to solve problems independently.",
      quote: "I went from hating IT to loving it.",
      result: "Now building real applications"
    },
    {
      name: "Zara Ahmed",
      grade: "Grade 10",
      subject: "Geography",
      improvement: "+33%",
      story: "Thought Geography was just memorization until my tutor showed me the real-world connections. Learning became exciting and meaningful.",
      quote: "Geography is now my favorite subject!",
      result: "Consistently scoring A's and B's"
    }
  ];

  const testimonials = [
    {
      text: "Viva Tutorials completely changed my academic trajectory. I went from failing to getting distinctions!",
      author: "Sizwe, Grade 12",
      rating: 5
    },
    {
      text: "The tutors are patient, knowledgeable, and genuinely care about their students' success. Highly recommended!",
      author: "Busiswa, Grade 11",
      rating: 5
    },
    {
      text: "I've tried other tutoring services, but Viva Tutorials stands out for their personalized approach and affordability.",
      author: "Mzwandile, Grade 10",
      rating: 5
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
              Success Stories
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Real students. Real results. Real transformations.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Success Stories Grid */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {stories.map((story, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className="h-full border-2 border-gray-100 hover:border-[#7949fe] transition-all duration-300 hover:shadow-lg">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-[#1a0b2e]">{story.name}</h3>
                        <p className="text-sm text-gray-600">{story.grade}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-[#ff7849]">{story.improvement}</div>
                        <div className="text-xs text-gray-600 flex items-center gap-1 justify-end mt-1">
                          <TrendingUp className="w-4 h-4" />
                          Improvement
                        </div>
                      </div>
                    </div>
                    <Badge className="bg-[#7949fe] text-white w-fit">{story.subject}</Badge>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <p className="text-gray-600 italic">"{story.quote}"</p>
                    
                    <p className="text-gray-700">{story.story}</p>
                    
                    <div className="bg-[#7949fe]/5 p-4 rounded-lg border-l-4 border-[#7949fe]">
                      <p className="font-semibold text-[#1a0b2e]">
                        <Award className="w-4 h-4 inline-block mr-2 text-[#ff7849]" />
                        {story.result}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Statistics */}
      <section className="py-24 px-6 bg-gradient-to-b from-[#7949fe]/5 to-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-[#1a0b2e] text-center mb-16">Our Impact by Numbers</h2>
          
          <div className="grid md:grid-cols-4 gap-8 text-center">
            {[
              { number: "500+", label: "Students Transformed", color: "text-[#7949fe]" },
              { number: "95%", label: "Grade Improvement Rate", color: "text-[#ff7849]" },
              { number: "50+", label: "Expert Tutors", color: "text-[#7949fe]" },
              { number: "4.9/5", label: "Average Student Rating", color: "text-[#ff7849]" }
            ].map((stat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className={`text-5xl font-bold ${stat.color} mb-2`}>{stat.number}</div>
                <div className="text-gray-600">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-[#1a0b2e] text-center mb-16">What Students Say</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className="h-full border-2 border-gray-100 hover:border-[#7949fe] transition-all duration-300">
                  <CardContent className="pt-6">
                    <div className="flex gap-1 mb-4">
                      {Array.from({ length: testimonial.rating }).map((_, i) => (
                        <Star key={i} className="w-5 h-5 fill-[#ff7849] text-[#ff7849]" />
                      ))}
                    </div>
                    <p className="text-gray-600 mb-4 italic">"{testimonial.text}"</p>
                    <p className="font-bold text-[#1a0b2e]">— {testimonial.author}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Your Success Story Starts Here</h2>
          <p className="text-white/60 text-lg mb-8 max-w-2xl mx-auto">
            Join hundreds of students who have transformed their academics with Viva Tutorials.
          </p>
          <a href="/contact">
            <Button className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">
              Start Your Journey
            </Button>
          </a>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
