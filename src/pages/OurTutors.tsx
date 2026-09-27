import { motion } from 'framer-motion';
import { Star, Award, Users } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from '@/components/Footer';

export default function OurTutors() {
  const tutors = [
    {
      name: "Mrs. Lindiwe Ndlovu",
      specialty: "Mathematics",
      experience: "12 years",
      rating: 4.9,
      students: 150,
      bio: "Expert in advanced mathematics with a passion for making complex concepts simple.",
      qualifications: ["BSc Mathematics", "PGCE", "Certified Tutor"]
    },
    {
      name: "Mr. Thabo Khumalo",
      specialty: "Physical Science",
      experience: "10 years",
      rating: 4.8,
      students: 120,
      bio: "Engaging educator specializing in practical science demonstrations and experiments.",
      qualifications: ["BSc Physics & Chemistry", "PGCE", "Master's in Education"]
    },
    {
      name: "Dr. Amira Hassan",
      specialty: "Life Sciences",
      experience: "15 years",
      rating: 4.9,
      students: 180,
      bio: "Doctorate holder with expertise in biology, ecology, and sustainable development.",
      qualifications: ["PhD Biology", "PGCE", "Research Publications"]
    },
    {
      name: "Ms. Naledi Mokoena",
      specialty: "Accounting",
      experience: "8 years",
      rating: 4.7,
      students: 95,
      bio: "Chartered accountant making accounting concepts accessible and engaging.",
      qualifications: ["CA(SA)", "PGCE", "Certified Auditor"]
    },
    {
      name: "Mr. Sipho Zungu",
      specialty: "Information Technology",
      experience: "9 years",
      rating: 4.8,
      students: 110,
      bio: "Tech enthusiast with industry experience in software development and coding.",
      qualifications: ["BSc Computer Science", "Microsoft Certified", "PGCE"]
    },
    {
      name: "Ms. Zahra Patel",
      specialty: "Geography",
      experience: "11 years",
      rating: 4.9,
      students: 140,
      bio: "Passionate about geography with expertise in both physical and human geography.",
      qualifications: ["BSc Geography", "PGCE", "GIS Certification"]
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
              Meet Our Expert Tutors
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Highly qualified educators passionate about helping you succeed.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Tutors Grid */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {tutors.map((tutor, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className="h-full border-2 border-gray-100 hover:border-[#7949fe] transition-all duration-300 hover:shadow-lg overflow-hidden">
                  {/* Header with specialty */}
                  <div className="bg-gradient-to-r from-[#7949fe]/10 to-[#ff7849]/10 p-6 pb-0">
                    <Badge className="bg-[#7949fe] text-white mb-4">{tutor.specialty}</Badge>
                    <h3 className="text-2xl font-bold text-[#1a0b2e]">{tutor.name}</h3>
                  </div>

                  <CardContent className="pt-6">
                    <p className="text-gray-600 mb-6">{tutor.bio}</p>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b border-gray-200">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-[#7949fe]">{tutor.experience}</div>
                        <div className="text-xs text-gray-600">Experience</div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Star className="w-5 h-5 fill-[#ff7849] text-[#ff7849]" />
                          <span className="font-bold text-[#1a0b2e]">{tutor.rating}</span>
                        </div>
                        <div className="text-xs text-gray-600">Rating</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-[#7949fe]">{tutor.students}</div>
                        <div className="text-xs text-gray-600">Students</div>
                      </div>
                    </div>

                    {/* Qualifications */}
                    <div className="mb-6">
                      <h4 className="font-bold text-[#1a0b2e] mb-3">Qualifications</h4>
                      <div className="space-y-2">
                        {tutor.qualifications.map((qual, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-[#ff7849] flex-shrink-0" />
                            <span className="text-sm text-gray-600">{qual}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Button className="w-full bg-[#7949fe] hover:bg-[#7949fe]/90 text-white rounded-lg font-bold">
                      Book a Session
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Our Tutors */}
      <section className="py-24 px-6 bg-gradient-to-b from-[#7949fe]/5 to-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-[#1a0b2e] text-center mb-16">Why Our Tutors Excel</h2>
          
          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                icon: <Award className="w-16 h-16 text-[#7949fe]" />,
                title: "Expert Qualifications",
                description: "All tutors hold advanced degrees and relevant teaching certifications in their specialties."
              },
              {
                icon: <Users className="w-16 h-16 text-[#ff7849]" />,
                title: "Student-Centric Approach",
                description: "Each tutor personalizes their teaching to match individual learning styles and pace."
              },
              {
                icon: <Star className="w-16 h-16 text-[#7949fe]" />,
                title: "Proven Track Record",
                description: "Our tutors have consistently helped students improve grades and build confidence."
              }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="text-center"
              >
                <div className="flex justify-center mb-6">{item.icon}</div>
                <h3 className="text-2xl font-bold text-[#1a0b2e] mb-4">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Ready to Learn from the Best?</h2>
          <p className="text-white/60 text-lg mb-8 max-w-2xl mx-auto">
            Connect with our expert tutors and start your journey to academic excellence.
          </p>
          <a href="/contact">
            <Button className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">
              Schedule Your Session
            </Button>
          </a>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
