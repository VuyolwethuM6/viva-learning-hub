import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Download, 
  ArrowRight, 
  Check, 
  Sparkles, 
  BookOpen, 
  Search,
  Filter,
  Star,
  Lock
} from 'lucide-react';

const Header = () => (
  <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-lg">
    <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
      <a href="/" className="flex items-center gap-2">
        <img 
          src="/viva-tutorials-logo.png" 
          alt="Viva Tutorials Logo" 
          className="h-10 w-auto"
        />
      </a>
      <nav className="hidden lg:flex items-center gap-8 font-medium text-sm text-gray-600">
        {[
          { label: 'Home', path: '/' },
          { label: 'Study Materials', path: '/study-materials' },
          { label: 'Services', path: '/services' },
          { label: 'Pricing', path: '/pricing' },
          { label: 'Contact', path: '/contact' }
        ].map((item) => (
          <a 
            key={item.label} 
            href={item.path}
            className="hover:text-[#7949fe] transition-colors relative group py-2"
          >
            {item.label}
            <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-[#7949fe] transition-all duration-300 group-hover:w-full" />
          </a>
        ))}
      </nav>
      <div className="hidden lg:flex items-center gap-4">
        <span className="text-sm font-semibold text-[#7949fe] hover:underline cursor-pointer">Login</span>
        <a href="/contact">
          <Button className="bg-[#7949fe] hover:bg-[#5a4ecf] text-white rounded-full px-6">
            Book a Tutor
          </Button>
        </a>
      </div>
    </div>
  </header>
);

const SectionHeading = ({ subtitle, title, align = "center" }) => (
  <div className={`mb-16 ${align === "center" ? "text-center" : "text-left"}`}>
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase mb-4 bg-[#7949fe]/10 text-[#7949fe]`}
    >
      {subtitle}
    </motion.div>
    <motion.h2 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.1 }}
      className={`text-3xl md:text-4xl lg:text-5xl font-bold text-[#1a0b2e] tracking-tight leading-tight`}
    >
      {title}
    </motion.h2>
    <motion.div 
      initial={{ opacity: 0, width: 0 }}
      whileInView={{ opacity: 1, width: 80 }}
      viewport={{ once: true }}
      transition={{ delay: 0.2, duration: 0.8 }}
      className={`h-1.5 mt-6 rounded-full ${align === "center" ? "mx-auto" : ""} bg-gradient-to-r from-[#7949fe] to-[#ff7849]`}
    />
  </div>
);

const materialsData = {
  "grade8": {
    title: "Grade 8",
    subjects: [
      {
        subject: "Mathematics",
        materials: [
          {
            title: "Grade 8 Maths Fundamentals",
            description: "Complete introduction to Grade 8 mathematics concepts",
            price: "Free",
            isFree: true,
            icon: "📊",
            gradient: "from-blue-500 to-cyan-500",
            type: "PDF Notes",
            pages: "60 pages",
            includes: ["Number systems", "Basic algebra", "Geometry intro", "Practice exercises", "Answer sheet"]
          },
          {
            title: "Algebra Basics Workbook",
            description: "Step-by-step guide to mastering algebraic expressions",
            price: "R149",
            isFree: false,
            icon: "📐",
            gradient: "from-blue-600 to-blue-800",
            type: "Workbook",
            pages: "40 pages",
            includes: ["Expression expansion", "Factorization basics", "Equations", "30 practice problems", "Solutions"]
          }
        ]
      },
      {
        subject: "Physical Sciences",
        materials: [
          {
            title: "Grade 8 Physics & Chemistry Basics",
            description: "Introduction to scientific principles and laboratory work",
            price: "Free",
            isFree: true,
            icon: "⚗️",
            gradient: "from-[#7949fe] to-[#ff7849]",
            type: "PDF Notes",
            pages: "50 pages",
            includes: ["Matter & states", "Forces & motion", "Chemical reactions", "Lab safety", "Diagrams"]
          }
        ]
      },
      {
        subject: "Life Sciences",
        materials: [
          {
            title: "Grade 8 Biology Study Guide",
            description: "Cells, organisms, and life processes",
            price: "R129",
            isFree: false,
            icon: "🧬",
            gradient: "from-green-500 to-emerald-600",
            type: "Study Guide",
            pages: "45 pages",
            includes: ["Cell structure", "Organisms", "Ecosystems", "Diagrams & labels", "Review questions"]
          }
        ]
      }
    ]
  },
  "grade9": {
    title: "Grade 9",
    subjects: [
      {
        subject: "Mathematics",
        materials: [
          {
            title: "Grade 9 Maths Complete Pack",
            description: "Comprehensive coverage of Grade 9 mathematics",
            price: "R199",
            isFree: false,
            icon: "📊",
            gradient: "from-blue-500 to-cyan-500",
            type: "PDF Notes",
            pages: "120 pages",
            popular: true,
            includes: ["Polynomial functions", "Linear equations", "Quadratic equations", "Sequences & series", "100+ exercises"]
          }
        ]
      },
      {
        subject: "Physical Sciences",
        materials: [
          {
            title: "Grade 9 Physics Complete Guide",
            description: "Motion, forces, electricity and magnetism",
            price: "R189",
            isFree: false,
            icon: "⚡",
            gradient: "from-yellow-500 to-orange-600",
            type: "Study Guide",
            pages: "100 pages",
            includes: ["Kinematics", "Newton's laws", "Electricity basics", "Magnetism", "Practical activities"]
          }
        ]
      }
    ]
  },
  "grade10": {
    title: "Grade 10",
    subjects: [
      {
        subject: "Mathematics",
        materials: [
          {
            title: "Grade 10 Maths Study Pack",
            description: "Functions, trigonometry, and analytical geometry",
            price: "R249",
            isFree: false,
            icon: "📊",
            gradient: "from-blue-500 to-cyan-500",
            type: "PDF Notes",
            pages: "180 pages",
            popular: true,
            includes: ["Functions & graphs", "Trigonometry", "Analytical geometry", "Sequences", "Past papers", "Formula sheets"]
          }
        ]
      },
      {
        subject: "Physical Sciences",
        materials: [
          {
            title: "Grade 10 Physical Sciences Bundle",
            description: "Physics and chemistry combined - complete curriculum",
            price: "R299",
            isFree: false,
            icon: "⚗️",
            gradient: "from-[#7949fe] to-[#ff7849]",
            type: "Bundle",
            pages: "250 pages",
            includes: ["Mechanics", "Waves & sound", "Chemical bonding", "Stoichiometry", "Practicals", "Exam papers"]
          }
        ]
      },
      {
        subject: "Life Sciences",
        materials: [
          {
            title: "Grade 10 Life Sciences Complete",
            description: "Cells, genetics, photosynthesis and ecosystems",
            price: "R229",
            isFree: false,
            icon: "🧬",
            gradient: "from-green-500 to-emerald-600",
            type: "Study Guide",
            pages: "140 pages",
            includes: ["Cell division", "Genetics", "Photosynthesis", "Ecosystems", "Detailed diagrams", "Study tips"]
          }
        ]
      }
    ]
  },
  "grade11": {
    title: "Grade 11",
    subjects: [
      {
        subject: "Mathematics",
        materials: [
          {
            title: "Grade 11 Mathematics Advanced Pack",
            description: "Calculus, sequences, financial math and more",
            price: "R299",
            isFree: false,
            icon: "📊",
            gradient: "from-blue-500 to-cyan-500",
            type: "PDF Notes",
            pages: "220 pages",
            popular: true,
            includes: ["Differential calculus", "Sequences & series", "Financial mathematics", "Grade 11 past papers", "Video links"]
          }
        ]
      },
      {
        subject: "Physical Sciences",
        materials: [
          {
            title: "Grade 11 Physics Mastery",
            description: "Mechanics, electricity, optics and modern physics",
            price: "R279",
            isFree: false,
            icon: "⚡",
            gradient: "from-yellow-500 to-orange-600",
            type: "Study Guide",
            pages: "200 pages",
            includes: ["Advanced mechanics", "Electric circuits", "Optics", "Modern physics", "Exam strategies"]
          },
          {
            title: "Grade 11 Chemistry Complete",
            description: "Organic chemistry, equilibrium, kinetics",
            price: "R259",
            isFree: false,
            icon: "⚗️",
            gradient: "from-purple-500 to-pink-600",
            type: "Study Guide",
            pages: "190 pages",
            includes: ["Organic reactions", "Equilibrium", "Kinetics", "Electrochemistry", "Lab practicals"]
          }
        ]
      },
      {
        subject: "Accounting",
        materials: [
          {
            title: "Grade 11 Accounting Essentials",
            description: "Accounting reports, analysis and interpretation",
            price: "R219",
            isFree: false,
            icon: "💰",
            gradient: "from-emerald-500 to-teal-600",
            type: "Study Guide",
            pages: "160 pages",
            includes: ["Financial reports", "Ratio analysis", "Interpretation", "Case studies", "Practice problems"]
          }
        ]
      }
    ]
  },
  "grade12": {
    title: "Grade 12 (Matric)",
    subjects: [
      {
        subject: "Mathematics",
        materials: [
          {
            title: "Grade 12 Maths Final Exam Prep",
            description: "Complete revision and exam strategy guide",
            price: "R349",
            isFree: false,
            icon: "📊",
            gradient: "from-blue-500 to-cyan-500",
            type: "PDF Notes",
            pages: "280 pages",
            popular: true,
            includes: ["All topics covered", "Integral calculus", "Statistics", "Practice exams (3)", "Detailed solutions", "Exam tips"]
          }
        ]
      },
      {
        subject: "Physical Sciences",
        materials: [
          {
            title: "Grade 12 Physics & Chemistry Bundle",
            description: "Complete matric-level science preparation",
            price: "R399",
            isFree: false,
            icon: "⚗️",
            gradient: "from-[#7949fe] to-[#ff7849]",
            type: "Bundle",
            pages: "400 pages",
            popular: true,
            includes: ["Full syllabus", "100+ practice problems", "Past exam papers (5 years)", "Detailed solutions", "Mind maps", "Formula sheets"]
          }
        ]
      },
      {
        subject: "Life Sciences",
        materials: [
          {
            title: "Grade 12 Life Sciences Complete",
            description: "Human biology, meiosis, evolution and ecology",
            price: "R319",
            isFree: false,
            icon: "🧬",
            gradient: "from-green-500 to-emerald-600",
            type: "Study Guide",
            pages: "250 pages",
            includes: ["Meiosis & heredity", "Evolution", "Ecology", "Human physiology", "Exam papers"]
          }
        ]
      },
      {
        subject: "Accounting",
        materials: [
          {
            title: "Grade 12 Accounting Mastery Pack",
            description: "Advanced accounting and exam preparation",
            price: "R329",
            isFree: false,
            icon: "💰",
            gradient: "from-emerald-500 to-teal-600",
            type: "Study Guide",
            pages: "280 pages",
            popular: true,
            includes: ["Advanced concepts", "Interpretation skills", "Exam papers (5)", "Solutions", "Mnemonics", "Shortcuts"]
          }
        ]
      },
      {
        subject: "Business Studies",
        materials: [
          {
            title: "Grade 12 Business Studies Guide",
            description: "Business environment and strategic management",
            price: "R239",
            isFree: false,
            icon: "📈",
            gradient: "from-orange-500 to-red-600",
            type: "Study Guide",
            pages: "200 pages",
            includes: ["Business roles", "Strategies", "Marketing", "HR", "Exam tips", "Case studies"]
          }
        ]
      },
      {
        subject: "Economics",
        materials: [
          {
            title: "Grade 12 Economics Complete",
            description: "Micro and macroeconomics for matric",
            price: "R259",
            isFree: false,
            icon: "📊",
            gradient: "from-indigo-500 to-blue-600",
            type: "Study Guide",
            pages: "220 pages",
            includes: ["Supply & demand", "Markets", "Government policy", "International trade", "Exam papers"]
          }
        ]
      }
    ]
  }
};

export default function StudyMaterials() {
  const [selectedGrade, setSelectedGrade] = useState("grade12");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  const currentGradeData = materialsData[selectedGrade];

  const getMaterialsByFilter = () => {
    let materials = [];
    currentGradeData.subjects.forEach(subject => {
      materials = [...materials, ...subject.materials];
    });

    if (filterType === "free") {
      materials = materials.filter(m => m.isFree);
    } else if (filterType === "premium") {
      materials = materials.filter(m => !m.isFree);
    }

    if (searchTerm) {
      materials = materials.filter(m => 
        m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return materials;
  };

  const filteredMaterials = getMaterialsByFilter();

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-[#7949fe]/20 selection:text-[#7949fe]">
      <Header />

      {/* Hero Section */}
      <section className="pt-32 pb-16 lg:pt-40 lg:pb-24 bg-gradient-to-b from-white to-gray-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-3xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7949fe]/10 border border-[#7949fe]/30 mb-6">
              <Sparkles className="w-4 h-4 text-[#7949fe]" />
              <span className="text-sm font-medium text-[#7949fe]">Comprehensive Study Resources</span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight mb-6">
              Your Complete <span className="bg-gradient-to-r from-[#7949fe] to-[#ff7849] bg-clip-text text-transparent">Study Hub</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 mb-8 leading-relaxed">
              Access thousands of study materials, past papers, and practice resources for Grades 8-12. Start your learning journey with our expertly curated content.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Grade Selector */}
      <section className="py-12 bg-white sticky top-[73px] z-40 border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="w-full sm:w-auto">
              <label className="text-sm font-semibold text-gray-700 block mb-3 sm:mb-0">Select Grade:</label>
            </div>
            <div className="w-full sm:w-auto flex flex-wrap gap-2">
              {Object.entries(materialsData).map(([key, data]) => (
                <button
                  key={key}
                  onClick={() => setSelectedGrade(key)}
                  className={`px-4 py-2 rounded-full font-semibold transition-all text-sm sm:text-base ${
                    selectedGrade === key
                      ? 'bg-[#7949fe] text-white shadow-lg shadow-[#7949fe]/30'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {data.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Search and Filter */}
      <section className="sticky top-[177px] z-40 py-8 bg-gray-50 border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search materials..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-full border border-gray-200 focus:border-[#7949fe] focus:outline-none transition-colors bg-white"
              />
            </div>

            {/* Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType("all")}
                className={`flex-1 px-4 py-3 rounded-full font-medium transition-all text-sm ${
                  filterType === "all"
                    ? 'bg-[#7949fe] text-white'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-[#7949fe]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType("free")}
                className={`flex-1 px-4 py-3 rounded-full font-medium transition-all text-sm ${
                  filterType === "free"
                    ? 'bg-green-500 text-white'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-green-500'
                }`}
              >
                Free
              </button>
              <button
                onClick={() => setFilterType("premium")}
                className={`flex-1 px-4 py-3 rounded-full font-medium transition-all text-sm ${
                  filterType === "premium"
                    ? 'bg-[#ff7849] text-white'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-[#ff7849]'
                }`}
              >
                Premium
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Materials Grid */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          {filteredMaterials.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No materials found</h3>
              <p className="text-gray-600">Try adjusting your filters or search terms</p>
            </div>
          ) : (
            <motion.div
              layout
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              <AnimatePresence mode="popLayout">
                {filteredMaterials.map((material, idx) => (
                  <motion.div
                    key={`${material.title}-${idx}`}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.3 }}
                    className="relative group h-full"
                  >
                    {material.popular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 bg-gradient-to-r from-[#7949fe] to-[#ff7849] text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg">
                        Best Seller
                      </div>
                    )}
                    <Card className={`h-full border-2 ${material.popular ? 'border-[#7949fe] shadow-2xl' : material.isFree ? 'border-green-200' : 'border-gray-100'} hover:border-[#7949fe]/50 transition-all duration-300 hover:shadow-xl bg-white overflow-hidden group-hover:-translate-y-2`}>
                      <div className={`h-2 bg-gradient-to-r ${material.gradient}`} />
                      <CardHeader>
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${material.gradient} flex items-center justify-center text-3xl shadow-lg transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300`}>
                            {material.icon}
                          </div>
                          <div className="text-right">
                            {material.isFree ? (
                              <Badge className="bg-green-100 text-green-700 border border-green-300 text-xs font-bold px-2 py-0.5">
                                Free
                              </Badge>
                            ) : (
                              <Badge className="bg-[#7949fe]/10 text-[#7949fe] border border-[#7949fe]/30 text-xs font-bold px-2 py-0.5">
                                Premium
                              </Badge>
                            )}
                            <div className={`text-xl font-bold mt-2 ${material.isFree ? 'text-green-600' : 'text-[#1a0b2e]'}`}>
                              {material.price}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                            {material.type}
                          </Badge>
                          <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                            {material.pages}
                          </Badge>
                        </div>
                        <CardTitle className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">
                          {material.title}
                        </CardTitle>
                        <CardDescription className="text-gray-600 text-sm">
                          {material.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700 mb-2">Includes:</div>
                        {material.includes.slice(0, 3).map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                            <Check className="w-3 h-3 text-green-600 flex-shrink-0" />
                            <span className="line-clamp-1">{item}</span>
                          </div>
                        ))}
                        {material.includes.length > 3 && (
                          <div className="text-xs text-gray-500 font-medium pt-1">
                            +{material.includes.length - 3} more
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="pt-4">
                        <Button className={`w-full py-5 rounded-xl font-bold group-hover:shadow-lg transition-all ${
                          material.isFree 
                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white' 
                            : 'bg-gradient-to-r from-[#7949fe] to-[#ff7849] hover:from-[#5a4ecf] hover:to-[#ff6b35] text-white'
                        }`}>
                          <Download className="w-4 h-4 mr-2" />
                          {material.isFree ? 'Download' : 'Purchase'}
                          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeading 
            subtitle="Why Choose Us" 
            title="Comprehensive Study Solutions"
          />
          
          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                icon: "📚",
                title: "Massive Library",
                description: "Thousands of study materials covering all subjects and grades"
              },
              {
                icon: "🎯",
                title: "Exam Focused",
                description: "Materials aligned with CAPS curriculum and exam requirements"
              },
              {
                icon: "✅",
                title: "Expert Created",
                description: "Developed by experienced educators and tutors"
              },
              {
                icon: "📱",
                title: "Mobile Friendly",
                description: "Access materials anytime, anywhere on any device"
              }
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="text-center"
              >
                <div className="text-5xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto bg-gradient-to-r from-[#7949fe] to-[#ff7849] rounded-3xl p-12 text-center shadow-2xl">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Need Help Finding Materials?</h2>
          <p className="text-white/80 text-lg mb-8">
            Contact our support team to get personalized recommendations or custom study materials for your specific needs.
          </p>
          <Button className="bg-white text-[#7949fe] hover:bg-gray-100 px-8 py-6 rounded-full text-lg font-bold">
            Contact Support
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1a0b2e] text-white py-12 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-400 text-sm">
          <p>&copy; 2026 Viva Tutorial Services. All rights reserved.</p>
          <div className="flex justify-center gap-6 mt-6">
            <a href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="/contact" className="hover:text-white transition-colors">Contact Us</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
