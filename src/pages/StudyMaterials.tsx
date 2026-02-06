import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
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
import { 
  Download, 
  ArrowRight, 
  Check, 
  Sparkles, 
  Search,
  X,
  Menu,
  ChevronDown,
  Star,
  TrendingUp
} from 'lucide-react';

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-white/95 backdrop-blur-lg shadow-lg' : 'bg-white shadow-md'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex justify-between items-center">
          <a href="/" className="flex items-center gap-2" aria-label="Viva Tutorials Home">
            <img 
              src="/viva-tutorials-logo.png" 
              alt="Viva Tutorials Logo" 
              className="h-8 sm:h-10 w-auto"
              width="120"
              height="40"
            />
          </a>
          
          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8 font-medium text-sm text-gray-600" aria-label="Main navigation">
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
                aria-current={item.path === '/study-materials' ? 'page' : undefined}
              >
                {item.label}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-[#7949fe] transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>
          
          <div className="hidden lg:flex items-center gap-3 xl:gap-4">
            <a href="/login" className="text-sm font-semibold text-[#7949fe] hover:underline">
              Login
            </a>
            <a href="/contact">
              <Button className="bg-[#7949fe] hover:bg-[#5a4ecf] text-white rounded-full px-4 xl:px-6 text-sm">
                Book a Tutor
              </Button>
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-gray-600 hover:text-[#7949fe] transition-colors"
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.nav
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden overflow-hidden"
              aria-label="Mobile navigation"
            >
              <div className="py-4 space-y-2">
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
                    className="block px-4 py-3 text-gray-600 hover:text-[#7949fe] hover:bg-gray-50 rounded-lg transition-colors font-medium"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
                <div className="border-t border-gray-200 pt-4 px-4 space-y-2">
                  <a href="/login" className="block text-[#7949fe] font-semibold py-2">
                    Login
                  </a>
                  <a href="/contact" className="block">
                    <Button className="w-full bg-[#7949fe] hover:bg-[#5a4ecf] text-white rounded-full">
                      Book a Tutor
                    </Button>
                  </a>
                </div>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};

const SectionHeading = ({ subtitle, title, align = "center" }) => (
  <div className={`mb-12 sm:mb-16 ${align === "center" ? "text-center" : "text-left"}`}>
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase mb-3 sm:mb-4 bg-[#7949fe]/10 text-[#7949fe]`}
    >
      {subtitle}
    </motion.div>
    <motion.h2 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.1 }}
      className={`text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-[#1a0b2e] tracking-tight leading-tight px-4`}
    >
      {title}
    </motion.h2>
    <motion.div 
      initial={{ opacity: 0, width: 0 }}
      whileInView={{ opacity: 1, width: 80 }}
      viewport={{ once: true }}
      transition={{ delay: 0.2, duration: 0.8 }}
      className={`h-1.5 mt-4 sm:mt-6 rounded-full ${align === "center" ? "mx-auto" : ""} bg-gradient-to-r from-[#7949fe] to-[#ff7849]`}
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
  const [showGradeDropdown, setShowGradeDropdown] = useState(false);

  const currentGradeData = materialsData[selectedGrade];

  const getMaterialsByFilter = () => {
    let materials = [];
    currentGradeData.subjects.forEach(subject => {
      materials = [...materials, ...subject.materials.map(m => ({ ...m, subject: subject.subject }))];
    });

    if (filterType === "free") {
      materials = materials.filter(m => m.isFree);
    } else if (filterType === "premium") {
      materials = materials.filter(m => !m.isFree);
    }

    if (searchTerm) {
      materials = materials.filter(m => 
        m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.subject.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return materials;
  };

  const filteredMaterials = getMaterialsByFilter();

  // Generate structured data for SEO
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "name": "Viva Tutorials",
    "description": "Comprehensive study materials and tutoring services for South African students from Grade 8 to Grade 12 (Matric)",
    "url": "https://vivatutorials.co.za/study-materials",
    "offers": filteredMaterials.map(material => ({
      "@type": "Offer",
      "name": material.title,
      "description": material.description,
      "price": material.isFree ? "0" : material.price.replace('R', ''),
      "priceCurrency": "ZAR"
    }))
  };

  return (
    <>
      <Helmet>
        <title>Study Materials for Grade 8-12 | CAPS Curriculum | Viva Tutorials</title>
        <meta name="description" content="Download comprehensive study materials, past papers, and practice resources for South African students Grade 8-12. Free and premium CAPS-aligned content for Mathematics, Physical Sciences, Life Sciences, and more." />
        <meta name="keywords" content="study materials, matric study guides, Grade 12 study notes, CAPS curriculum, past papers, South Africa education, mathematics notes, physical sciences, life sciences, accounting notes, free study materials" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://vivatutorials.co.za/study-materials" />
        <meta property="og:title" content="Study Materials for Grade 8-12 | Viva Tutorials" />
        <meta property="og:description" content="Access thousands of CAPS-aligned study materials for South African students. Free and premium resources available." />
        <meta property="og:image" content="https://vivatutorials.co.za/og-image.jpg" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://vivatutorials.co.za/study-materials" />
        <meta property="twitter:title" content="Study Materials for Grade 8-12 | Viva Tutorials" />
        <meta property="twitter:description" content="Access thousands of CAPS-aligned study materials for South African students." />
        <meta property="twitter:image" content="https://vivatutorials.co.za/og-image.jpg" />

        {/* Canonical URL */}
        <link rel="canonical" href="https://vivatutorials.co.za/study-materials" />

        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>

      <div className="min-h-screen bg-white font-sans selection:bg-[#7949fe]/20 selection:text-[#7949fe]">
        <Header />

        {/* Hero Section - Optimized for mobile */}
        <section className="pt-24 sm:pt-32 pb-12 sm:pb-16 lg:pt-40 lg:pb-24 bg-gradient-to-b from-white to-gray-50 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center max-w-3xl mx-auto"
            >
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-[#7949fe]/10 border border-[#7949fe]/30 mb-4 sm:mb-6">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-[#7949fe]" />
                <span className="text-xs sm:text-sm font-medium text-[#7949fe]">Comprehensive Study Resources</span>
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold leading-tight mb-4 sm:mb-6 px-4">
                Your Complete <span className="bg-gradient-to-r from-[#7949fe] to-[#ff7849] bg-clip-text text-transparent">Study Hub</span>
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 sm:mb-8 leading-relaxed px-4">
                Access thousands of CAPS-aligned study materials, past papers, and practice resources for Grades 8-12. Excel in your exams with our expertly curated content.
              </p>
              
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-3 sm:gap-6 max-w-2xl mx-auto mt-8 px-4">
                <div className="text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-[#7949fe]">500+</div>
                  <div className="text-xs sm:text-sm text-gray-600 mt-1">Study Materials</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-[#7949fe]">15+</div>
                  <div className="text-xs sm:text-sm text-gray-600 mt-1">Subjects</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-[#7949fe]">5K+</div>
                  <div className="text-xs sm:text-sm text-gray-600 mt-1">Students</div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Grade Selector - Mobile Optimized */}
        <section className="py-4 sm:py-6 bg-white sticky top-[65px] sm:top-[73px] z-40 border-b border-gray-100 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            {/* Mobile: Dropdown */}
            <div className="sm:hidden">
              <label className="text-sm font-semibold text-gray-700 block mb-2">Select Grade:</label>
              <div className="relative">
                <button
                  onClick={() => setShowGradeDropdown(!showGradeDropdown)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white border-2 border-gray-200 rounded-xl font-semibold text-[#7949fe] focus:border-[#7949fe] focus:outline-none"
                  aria-expanded={showGradeDropdown}
                  aria-haspopup="listbox"
                >
                  <span>{currentGradeData.title}</span>
                  <ChevronDown className={`w-5 h-5 transition-transform ${showGradeDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                <AnimatePresence>
                  {showGradeDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-xl overflow-hidden z-50"
                      role="listbox"
                    >
                      {Object.entries(materialsData).map(([key, data]) => (
                        <button
                          key={key}
                          onClick={() => {
                            setSelectedGrade(key);
                            setShowGradeDropdown(false);
                          }}
                          className={`w-full px-4 py-3 text-left font-semibold transition-colors ${
                            selectedGrade === key
                              ? 'bg-[#7949fe] text-white'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                          role="option"
                          aria-selected={selectedGrade === key}
                        >
                          {data.title}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Desktop/Tablet: Horizontal Buttons */}
            <div className="hidden sm:flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">Select Grade:</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(materialsData).map(([key, data]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedGrade(key)}
                    className={`px-3 sm:px-4 py-2 rounded-full font-semibold transition-all text-sm ${
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

        {/* Search and Filter - Mobile Optimized */}
        <section className="sticky top-[145px] sm:top-[153px] z-40 py-4 sm:py-6 bg-gray-50 border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
              {/* Search */}
              <div className="relative sm:col-span-2">
                <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search materials..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 sm:pl-12 pr-10 py-3 rounded-full border-2 border-gray-200 focus:border-[#7949fe] focus:outline-none transition-colors bg-white text-sm sm:text-base"
                  aria-label="Search study materials"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filter */}
              <div className="flex gap-2" role="group" aria-label="Filter materials">
                <button
                  onClick={() => setFilterType("all")}
                  className={`flex-1 px-3 sm:px-4 py-3 rounded-full font-medium transition-all text-xs sm:text-sm ${
                    filterType === "all"
                      ? 'bg-[#7949fe] text-white'
                      : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-[#7949fe]'
                  }`}
                  aria-pressed={filterType === "all"}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterType("free")}
                  className={`flex-1 px-3 sm:px-4 py-3 rounded-full font-medium transition-all text-xs sm:text-sm ${
                    filterType === "free"
                      ? 'bg-green-500 text-white'
                      : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-green-500'
                  }`}
                  aria-pressed={filterType === "free"}
                >
                  Free
                </button>
                <button
                  onClick={() => setFilterType("premium")}
                  className={`flex-1 px-3 sm:px-4 py-3 rounded-full font-medium transition-all text-xs sm:text-sm ${
                    filterType === "premium"
                      ? 'bg-[#ff7849] text-white'
                      : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-[#ff7849]'
                  }`}
                  aria-pressed={filterType === "premium"}
                >
                  Premium
                </button>
              </div>
            </div>

            {/* Results count */}
            <div className="mt-3 sm:mt-4 text-xs sm:text-sm text-gray-600">
              Showing <span className="font-semibold text-[#7949fe]">{filteredMaterials.length}</span> {filteredMaterials.length === 1 ? 'material' : 'materials'} for {currentGradeData.title}
            </div>
          </div>
        </section>

        {/* Materials Grid - Mobile Optimized */}
        <section className="py-8 sm:py-12 lg:py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            {filteredMaterials.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-12 sm:py-16"
              >
                <div className="text-5xl sm:text-6xl mb-4">📭</div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">No materials found</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-6">Try adjusting your filters or search terms</p>
                <Button 
                  onClick={() => {
                    setSearchTerm("");
                    setFilterType("all");
                  }}
                  className="bg-[#7949fe] hover:bg-[#5a4ecf] text-white rounded-full px-6"
                >
                  Clear Filters
                </Button>
              </motion.div>
            ) : (
              <motion.div
                layout
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
              >
                <AnimatePresence mode="popLayout">
                  {filteredMaterials.map((material, idx) => (
                    <motion.article
                      key={`${material.title}-${idx}`}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.3 }}
                      className="relative group h-full"
                    >
                      {material.popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-gradient-to-r from-[#7949fe] to-[#ff7849] text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          <span className="hidden sm:inline">Best Seller</span>
                          <span className="sm:hidden">Popular</span>
                        </div>
                      )}
                      <Card className={`h-full border-2 ${material.popular ? 'border-[#7949fe] shadow-xl' : material.isFree ? 'border-green-200' : 'border-gray-100'} hover:border-[#7949fe]/50 transition-all duration-300 hover:shadow-xl bg-white overflow-hidden group-hover:-translate-y-1 sm:group-hover:-translate-y-2`}>
                        <div className={`h-1.5 sm:h-2 bg-gradient-to-r ${material.gradient}`} />
                        <CardHeader className="p-4 sm:p-6">
                          <div className="flex items-start justify-between mb-3 sm:mb-4">
                            <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br ${material.gradient} flex items-center justify-center text-2xl sm:text-3xl shadow-lg transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300`}>
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
                              <div className={`text-lg sm:text-xl font-bold mt-2 ${material.isFree ? 'text-green-600' : 'text-[#1a0b2e]'}`}>
                                {material.price}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                              {material.subject}
                            </Badge>
                            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                              {material.type}
                            </Badge>
                            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                              {material.pages}
                            </Badge>
                          </div>
                          <CardTitle className="text-base sm:text-lg font-bold text-gray-900 mb-2 line-clamp-2">
                            {material.title}
                          </CardTitle>
                          <CardDescription className="text-gray-600 text-sm line-clamp-2">
                            {material.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-1.5 sm:space-y-2 px-4 sm:px-6 pb-4">
                          <div className="text-xs font-semibold text-gray-700 mb-2">What's included:</div>
                          {material.includes.slice(0, 3).map((item, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                              <Check className="w-3 h-3 text-green-600 flex-shrink-0" />
                              <span className="line-clamp-1">{item}</span>
                            </div>
                          ))}
                          {material.includes.length > 3 && (
                            <div className="text-xs text-gray-500 font-medium pt-1">
                              +{material.includes.length - 3} more features
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="pt-0 p-4 sm:p-6 sm:pt-4">
                          <Button className={`w-full py-4 sm:py-5 rounded-xl font-bold group-hover:shadow-lg transition-all text-sm sm:text-base ${
                            material.isFree 
                              ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white' 
                              : 'bg-gradient-to-r from-[#7949fe] to-[#ff7849] hover:from-[#5a4ecf] hover:to-[#ff6b35] text-white'
                          }`}>
                            <Download className="w-4 h-4 mr-2" />
                            {material.isFree ? 'Download Free' : 'Get Premium'}
                            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                          </Button>
                        </CardFooter>
                      </Card>
                    </motion.article>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </section>

        {/* Features Section - Mobile Optimized */}
        <section className="py-12 sm:py-16 lg:py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <SectionHeading 
              subtitle="Why Choose Us" 
              title="Comprehensive Study Solutions"
            />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
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
                  className="text-center p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">{feature.icon}</div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust Indicators */}
        <section className="py-12 sm:py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              <div className="text-center p-6 bg-gradient-to-br from-[#7949fe]/5 to-[#ff7849]/5 rounded-2xl">
                <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-3 text-[#7949fe]" />
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">95%</div>
                <div className="text-sm text-gray-600">Student Success Rate</div>
              </div>
              <div className="text-center p-6 bg-gradient-to-br from-green-500/5 to-emerald-600/5 rounded-2xl">
                <Star className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-3 text-green-600" />
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">4.9/5</div>
                <div className="text-sm text-gray-600">Average Rating</div>
              </div>
              <div className="text-center p-6 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 rounded-2xl">
                <Check className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-3 text-blue-600" />
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">CAPS</div>
                <div className="text-sm text-gray-600">Curriculum Aligned</div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section - Mobile Optimized */}
        <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 bg-white">
          <div className="max-w-4xl mx-auto bg-gradient-to-r from-[#7949fe] to-[#ff7849] rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center shadow-2xl">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4">Need Help Finding Materials?</h2>
            <p className="text-white/90 text-base sm:text-lg mb-6 sm:mb-8 max-w-2xl mx-auto">
              Contact our support team to get personalized recommendations or custom study materials for your specific needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <a href="/contact">
                <Button className="w-full sm:w-auto bg-white text-[#7949fe] hover:bg-gray-100 px-6 sm:px-8 py-5 sm:py-6 rounded-full text-base sm:text-lg font-bold shadow-lg">
                  Contact Support
                </Button>
              </a>
              <a href="/contact">
                <Button variant="outline" className="w-full sm:w-auto border-2 border-white text-white hover:bg-white/10 px-6 sm:px-8 py-5 sm:py-6 rounded-full text-base sm:text-lg font-bold">
                  Book a Tutor
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* FAQ Section for SEO */}
        <section className="py-12 sm:py-16 lg:py-20 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <SectionHeading 
              subtitle="FAQs" 
              title="Frequently Asked Questions"
            />
            
            <div className="space-y-4">
              {[
                {
                  question: "Are the study materials CAPS-aligned?",
                  answer: "Yes, all our study materials are fully aligned with the South African CAPS (Curriculum and Assessment Policy Statement) curriculum."
                },
                {
                  question: "Can I download materials for offline use?",
                  answer: "Absolutely! Once you download our materials, you can access them offline anytime on your device."
                },
                {
                  question: "What grades do you cover?",
                  answer: "We provide comprehensive study materials for Grades 8, 9, 10, 11, and Grade 12 (Matric)."
                },
                {
                  question: "Are there free materials available?",
                  answer: "Yes! We offer a selection of free study materials alongside our premium content. Use the 'Free' filter to view all available free resources."
                }
              ].map((faq, idx) => (
                <details key={idx} className="group bg-white rounded-xl p-4 sm:p-6 shadow-sm">
                  <summary className="font-semibold text-gray-900 cursor-pointer list-none flex items-center justify-between text-sm sm:text-base">
                    <span>{faq.question}</span>
                    <ChevronDown className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0 ml-2" />
                  </summary>
                  <p className="mt-3 sm:mt-4 text-gray-600 text-sm sm:text-base leading-relaxed">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Footer - Mobile Optimized */}
        <footer className="bg-[#1a0b2e] text-white py-8 sm:py-12 border-t border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center text-gray-400 text-sm">
              <p className="mb-4 sm:mb-6">&copy; 2026 Viva Tutorial Services. All rights reserved.</p>
              <nav className="flex flex-wrap justify-center gap-4 sm:gap-6" aria-label="Footer navigation">
                <a href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</a>
                <a href="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</a>
                <a href="/contact" className="hover:text-white transition-colors">Contact Us</a>
                <a href="/sitemap.xml" className="hover:text-white transition-colors">Sitemap</a>
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
