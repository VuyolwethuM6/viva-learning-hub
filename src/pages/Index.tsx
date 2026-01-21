import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { 
  GraduationCap, Phone, Mail, MapPin,
  ChevronRight, Star, Check, ArrowRight, Play, BookOpen, Users, 
  Award, Clock, Calendar, Search, Menu, X, Laptop, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import Footer from '@/components/Footer';
import { FaYoutube, FaFacebook, FaTiktok } from "react-icons/fa6";
import Maths from '/maths.png'

// --- Theme Components ---

const TopBar = () => (
  <div className="fixed top-0 left-0 right-0 z-50 bg-[#1a0b2e] text-white py-2.5 text-xs font-medium border-b border-white/10">
    <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
      <div className="flex items-center gap-3 lg:gap-6 overflow-x-auto">
        <span className="flex items-center gap-2 hover:text-purple-300 transition-colors cursor-pointer whitespace-nowrap">
          <Phone className="w-3.5 h-3.5 animate-[wiggle_1s_ease-in-out_infinite]" /> <span className="hidden sm:inline">+27 (0) 123 456 789</span>
        </span>
        <span className="flex items-center gap-2 hover:text-purple-300 transition-colors cursor-pointer whitespace-nowrap hidden sm:flex">
          <Mail className="w-3.5 h-3.5" /> info@vivatutorials.com
        </span>
        <span className="flex items-center gap-2 hover:text-purple-300 transition-colors cursor-pointer whitespace-nowrap hidden md:flex">
          <MapPin className="w-3.5 h-3.5" /> Cape Town, South Africa
        </span>
      </div>
      <div className="flex items-center gap-2 lg:gap-4">
        <span className="text-white/60 hidden lg:inline">Follow Us:</span>
        <div className="flex items-center gap-3">
          <FaFacebook className="w-3.5 h-3.5 hover:text-purple-400 cursor-pointer transition-colors" />
          <FaYoutube className="w-3.5 h-3.5 hover:text-purple-400 cursor-pointer transition-colors" />
          <FaTiktok className="w-3.5 h-3.5 hover:text-purple-400 cursor-pointer transition-colors hidden sm:block" />
        </div>
      </div>
    </div>
  </div>
);

const SectionHeading = ({ subtitle, title, align = "center", light = false }) => (
  <div className={`mb-16 ${align === "center" ? "text-center" : "text-left"}`}>
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase mb-4 ${light ? "bg-white/10 text-white" : "bg-[#7949fe]/10 text-[#7949fe]"}`}
    >
      {subtitle}
    </motion.div>
    <motion.h2 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.1 }}
      className={`text-3xl md:text-4xl lg:text-5xl font-bold ${light ? "text-white" : "text-[#1a0b2e]"} tracking-tight leading-tight`}
    >
      {title}
    </motion.h2>
    <motion.div 
      initial={{ opacity: 0, width: 0 }}
      whileInView={{ opacity: 1, width: 80 }}
      viewport={{ once: true }}
      transition={{ delay: 0.2, duration: 0.8 }}
      className={`h-1.5 mt-6 rounded-full ${align === "center" ? "mx-auto" : ""} ${light ? "bg-[#ff7849]" : "bg-gradient-to-r from-[#7949fe] to-[#ff7849]"}`}
    />
  </div>
);

const AnimatedCounter = ({ value, label }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.5 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      className="text-center p-6"
    >
      <div className="text-4xl md:text-5xl font-extrabold text-[#7949fe] mb-2 font-mono tracking-tighter">
        {value}
      </div>
      <div className="text-sm font-bold text-gray-500 uppercase tracking-widest">{label}</div>
    </motion.div>
  );
};

const TestimonialCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const testimonials = [
    {
      name: "Thabo M.",
      role: "Grade 11 Student",
      image: 32,
      text: "Viva Tutorials helped me improve my Maths from 45% to 78% in just one term! The tutors are patient and explain concepts in a way I can understand."
    },
    {
      name: "Sarah K.",
      role: "Parent of Grade 9 Student",
      image: 45,
      text: "My daughter's confidence in Physical Sciences has skyrocketed. The personalized attention and structured approach make all the difference."
    },
    {
      name: "Lebo N.",
      role: "Grade 12 Student",
      image: 28,
      text: "Thanks to Viva, I got accepted into my dream university! The exam preparation workshops and one-on-one tutoring were invaluable."
    }
  ];

  const nextTestimonial = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <div className="relative">
      {/* Abstract background shapes */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#7949fe]/10 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
      
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -100 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="relative bg-white border-none shadow-2xl p-8 rounded-[2rem]">
            <div className="text-[#7949fe] mb-6">
              {[1,2,3,4,5].map(i => <Star key={i} className="inline-block w-5 h-5 fill-current" />)}
            </div>
            <blockquote className="text-xl text-gray-800 font-medium leading-relaxed mb-6">
              "{testimonials[currentIndex].text}"
            </blockquote>
            <div className="flex items-center gap-4">
              <img src={`https://i.pravatar.cc/100?img=${testimonials[currentIndex].image}`} alt={testimonials[currentIndex].name} className="w-12 h-12 rounded-full object-cover" />
              <div>
                <div className="font-bold text-gray-900">{testimonials[currentIndex].name}</div>
                <div className="text-sm text-[#7949fe]">{testimonials[currentIndex].role}</div>
              </div>
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-center gap-4 mt-6">
        <Button 
          onClick={prevTestimonial}
          variant="outline" 
          size="icon" 
          className="rounded-full h-10 w-10"
        >
          <ChevronRight className="w-5 h-5 rotate-180" />
        </Button>
        <div className="flex items-center gap-2">
          {testimonials.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === currentIndex ? 'w-8 bg-[#7949fe]' : 'w-2 bg-gray-300'
              }`}
            />
          ))}
        </div>
        <Button 
          onClick={nextTestimonial}
          variant="outline" 
          size="icon" 
          className="rounded-full h-10 w-10"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
};

// --- Page Sections ---

export default function Home() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-[#7949fe]/20 selection:text-[#7949fe] overflow-x-hidden">
      <TopBar />
      
      {/* Sticky Header */}
      <header 
        className={`fixed top-[37px] left-0 right-0 z-40 transition-all duration-300 border-b ${
          isScrolled ? 'bg-white/95 backdrop-blur-md shadow-lg py-3 border-gray-100' : 'bg-white py-5 border-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
            <a href="#" className="flex items-center gap-2">
            <img 
              src="/viva-tutorials-logo.png" 
              alt="Viva Tutorials Logo" 
              className="h-10 w-auto"
            />
            </a>

          <nav className="hidden lg:flex items-center gap-8 font-medium text-sm text-gray-600">
            {['Home', 'About', 'Services', 'Pricing', 'Contact'].map((item) => (
              <a 
                key={item} 
                href={`#${item.toLowerCase()}`}
                className="hover:text-[#7949fe] transition-colors relative group py-2"
              >
                {item}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-[#7949fe] transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-4">
            <span className="text-sm font-semibold text-[#7949fe] hover:underline cursor-pointer">Login</span>
            <Button className="bg-[#7949fe] hover:bg-[#5a4ecf] text-white rounded-full px-6 transition-all duration-300 shadow-lg hover:shadow-[#7949fe]/20">
              Book a Tutor
            </Button>
          </div>

          <button 
            className="lg:hidden p-2 text-gray-600"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/50 z-50"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            
            {/* Slide-in Menu */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="lg:hidden fixed top-0 right-0 bottom-0 w-[80%] max-w-sm bg-white z-50 shadow-2xl overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-tr from-[#7949fe] to-[#ff7849] rounded-lg flex items-center justify-center text-white">
                      <span className="text-lg font-bold font-mono">V</span>
                    </div>
                    <span className="text-lg font-extrabold text-[#1a0b2e]">Viva<span className="text-[#ff7849]">.</span></span>
                  </div>
                  <button 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-full"
                  >
                    <X className="w-6 h-6 text-gray-600" />
                  </button>
                </div>

                <nav className="flex flex-col gap-2">
                  {['Home', 'About', 'Services', 'Pricing', 'Contact'].map((item) => (
                    <a 
                      key={item} 
                      href={`#${item.toLowerCase()}`}
                      className="text-lg font-semibold text-gray-800 py-4 px-4 hover:bg-[#7949fe]/10 rounded-lg transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {item}
                    </a>
                  ))}
                </nav>

                <div className="mt-8 pt-8 border-t border-gray-200 space-y-4">
                  <Button className="w-full bg-[#7949fe] hover:bg-[#5a4ecf] py-6 rounded-full text-lg">
                    Book a Tutor
                  </Button>
                  <Button variant="outline" className="w-full border-2 border-gray-200 py-6 rounded-full text-lg">
                    Login
                  </Button>
                </div>

                <div className="mt-8 pt-8 border-t border-gray-200">
                  <p className="text-sm font-semibold text-gray-500 mb-4">Follow Us</p>
                  <div className="flex gap-4">
                    {[FaFacebook, FaTiktok, FaYoutube].map((Icon, i) => (
                      <div key={i} className="w-10 h-10 rounded-full bg-[#7949fe]/10 flex items-center justify-center text-[#7949fe] hover:bg-[#7949fe] hover:text-white transition-all cursor-pointer">
                        <Icon className="w-5 h-5" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section id="home" className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden bg-gradient-to-b from-white to-white">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" style={{backgroundColor: 'rgba(108, 92, 231, 0.08)'}} />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full blur-3xl translate-y-1/4 -translate-x-1/4" style={{backgroundColor: 'rgba(255, 122, 69, 0.08)'}} />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >


            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7949fe]/10 border border-[#7949fe]/30"
            >
              <Sparkles className="w-4 h-4 text-[#7949fe]" />
              <span className="text-sm font-medium text-[#7949fe]">STEM Education Excellence</span>
            </motion.div>

              {/* Headline */}
              <div className="space-y-4 mb-6">
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight">
                  <span className="text-slate-900">Unlock Your</span>
                  <br />

                  <span className="relative inline-block">
                    <span className="bg-gradient-to-r from-[#7949fe] via-[#ff7849] to-[#7949fe] bg-clip-text text-transparent">
                      Academic
                    </span>

                    <motion.svg
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 1, duration: 1 }}
                      className="absolute -bottom-2 left-0 w-full"
                      viewBox="0 0 200 12"
                      fill="none"
                      aria-hidden="true"
                    >
                      <motion.path
                        d="M2 10C50 2 150 2 198 10"
                        stroke="url(#gradient)"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0" y1="0" x2="200" y2="0">
                          <stop stopColor="#7949fe" />
                          <stop offset="1" stopColor="#ff7849" />
                        </linearGradient>
                      </defs>
                    </motion.svg>
                  </span>

                  <br />
                  <span className="text-slate-900">Potential</span>
                </h1>

                <p className="text-lg sm:text-xl text-slate-600 max-w-xl leading-relaxed">
                  Empowering Grade 8–12 learners across South Africa with personalized STEM tutoring,
                  comprehensive mentorship, and innovative mobile learning solutions.
                </p>
              </div>

              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="h-14 px-8 text-base bg-[#7949fe] hover:bg-[#5a4ecf] text-white rounded-full shadow-xl shadow-[#7949fe]/30 hover:shadow-2xl hover:scale-105 transition-all duration-300">
                  Get Started Now
                </Button>
                <Button size="lg" variant="outline" className="h-14 px-8 text-base border-2 border-[#7949fe] text-[#7949fe] hover:bg-[#7949fe]/10 rounded-full font-bold">
                  More Info
                </Button>
              </div>

              <div className="mt-12 flex items-center gap-4 text-sm font-medium text-gray-500">
                <div className="flex -space-x-3">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-gray-200 overflow-hidden">
                       <img src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="Student" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  <div className="w-10 h-10 rounded-full border-2 border-white bg-[#7949fe]/20 flex items-center justify-center text-[#7949fe] text-xs font-bold">
                    +2k
                  </div>
                </div>
                <p>Trusted by 2,000+ students & parents</p>
              </div>
            </motion.div>

            {/* Custom Dashboard Graphic */}
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative hidden md:block"
            >
              <div className="absolute inset-0 bg-[#7949fe] rounded-[3rem] rotate-3 opacity-10 scale-95 blur-2xl transform translate-y-8" />
              
              <div className="relative bg-white rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden">
                {/* Dashboard Header */}
                <div className="bg-gradient-to-r from-[#7c3aed] to-[#9333ea] p-6 text-white">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="font-bold text-lg">Student Portal</h3>
                      <p className="text-[#7949fe]/40 text-sm">Welcome back, Sarah!</p>
                    </div>
                    <div className="w-10 h-10 bg-white/20 rounded-full backdrop-blur-sm flex items-center justify-center">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  
                  {/* Progress Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                      <div className="text-2xl font-bold mb-1">92%</div>
                      <div className="text-xs text-[#7949fe]/60">Math Average</div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                      <div className="text-2xl font-bold mb-1">A+</div>
                      <div className="text-xs text-[#7949fe]/60">Recent Grade</div>
                    </div>
                  </div>
                </div>

                {/* Dashboard Body */}
                <div className="p-6 bg-gray-50/50">
                  <div className="mb-2 flex justify-between items-center">
                    <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Upcoming Sessions</h4>
                    <span className="text-xs text-[#ff7849] font-semibold cursor-pointer">View All</span>
                  </div>
                  
                  <div className="space-y-3">
                    {[
                      { subject: "Advanced Physics", time: "Today, 14:00", icon: Sparkles, color: "text-blue-500", bg: "bg-blue-100" },
                      { subject: "Calculus II", time: "Tomorrow, 10:00", icon: Laptop, color: "text-[#7949fe]", bg: "bg-[#7949fe]/10" },
                      { subject: "Chemistry Lab", time: "Wed, 15:30", icon:  BookOpen, color: "text-pink-500", bg: "bg-pink-100" },
                    ].map((item, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer">
                        <div className={`w-12 h-12 ${item.bg} rounded-full flex items-center justify-center flex-shrink-0`}>
                          <item.icon className={`w-5 h-5 ${item.color}`} />
                        </div>
                        <div className="flex-1">
                          <h5 className="font-bold text-gray-900 text-sm">{item.subject}</h5>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {item.time}
                          </p>
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full">
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 bg-[#7949fe]/10 rounded-xl p-4 border border-[#7949fe]/20 flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-[#7949fe]">
                      <Star className="w-5 h-5 fill-[#7949fe]" />
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">Course Completed!</div>
                      <div className="text-xs text-gray-600">You finished "Biology 101"</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Floating elements */}
              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="absolute -right-8 top-20 bg-white p-4 rounded-2xl shadow-xl border border-gray-100 z-20 hidden md:block"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-full">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">Homework Done</div>
                    <div className="text-xs text-gray-500">Just now</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Ribbon */}
      <div className="bg-[#1a0b2e] text-white py-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10">
          <AnimatedCounter value="20+" label="Expert Tutors" />
          <AnimatedCounter value="5" label="Years of Excellence" />
          <AnimatedCounter value="95%" label="Success Rate" />
          <AnimatedCounter value="3+" label="Locations" />
        </div>
      </div>

      {/* Services Grid (WordPress Style) */}
      <section id="services" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeading 
            subtitle="What We Offer" 
            title="Our Services" 
          />
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { 
                icon: Users, 
                title: "In-Person Tutoring", 
                desc: "Personalized one-on-one sessions at your home or our learning centers, tailored to your pace and learning style.",
                color: "text-blue-600",
                bg: "bg-blue-50"
              },
              { 
                icon: Laptop, 
                title: "Hybrid/Combined Learning", 
                desc: "Flexible combination of in-person and online tutoring designed to fit your schedule and maximize results.",
                color: "text-[#7949fe]",
                bg: "bg-[#7949fe]/10"
              },
              { 
                icon: BookOpen, 
                title: "Comprehensive Study Material", 
                desc: "Access to curated notes, practice tests, and resources aligned with the CAPS curriculum.",
                color: "text-pink-600",
                bg: "bg-pink-50"
              }
            ].map((service, idx) => (
              <motion.div 
                key={idx}
                whileHover={{ y: -10 }}
                className="bg-white p-10 rounded-[2rem] shadow-sm hover:shadow-2xl transition-all duration-300 border border-gray-100 group"
              >
                <div className={`w-20 h-20 ${service.bg} rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300`}>
                  <service.icon className={`w-10 h-10 ${service.color}`} />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{service.title}</h3>
                <p className="text-gray-600 leading-relaxed mb-8">{service.desc}</p>
                <a href="#" className="inline-flex items-center font-bold text-[#1a0b2e] hover:text-[#7949fe] transition-colors uppercase text-sm tracking-wide">
                  Learn More <ArrowRight className="w-4 h-4 ml-2" />
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Subjects - Enhanced */}
      <section id="subjects" className="py-24 bg-gradient-to-b from-white to-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <SectionHeading 
            subtitle="Our Curriculum" 
            title="Subjects We Excel In" 
          />

          <Tabs defaultValue="stem" className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-1 mb-12 bg-white border border-gray-200 p-1 rounded-full shadow-sm">
              <TabsTrigger value="stem" className="rounded-full data-[state=active]:bg-[#7949fe] data-[state=active]:text-white font-bold">Maths & Science</TabsTrigger>
              {/* 
              <TabsTrigger value="languages" className="rounded-full data-[state=active]:bg-[#7949fe] data-[state=active]:text-white font-bold">Languages</TabsTrigger>
              <TabsTrigger value="commerce" className="rounded-full data-[state=active]:bg-[#7949fe] data-[state=active]:text-white font-bold">Commerce</TabsTrigger>
              */}
            </TabsList>

            <TabsContent value="stem" className="mt-0">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  { 
                    title: "Mathematics", 
                    icon: "/integration.png",
                    gradient: "from-blue-500 to-cyan-500",
                    description: "Pure Maths & Maths Literacy from Grade 8-12",
                    topics: ["Algebra", "Calculus", "Trigonometry", "Statistics"],
                    students: "150+ students"
                  },
                  { 
                    title: "Physical Sciences", 
                    icon: "/physics.png",
                    gradient: "from-[#7949fe] to-[#ff7849]",
                    description: "Physics & Chemistry combined curriculum",
                    topics: ["Mechanics", "Waves", "Organic Chemistry", "Electrostatics"],
                    students: "120+ students"
                  },
                  { 
                    title: "Life Sciences", 
                    icon: "/genetic-engineering.png",
                    gradient: "from-green-500 to-emerald-500",
                    description: "Biology & Life Sciences for all grades",
                    topics: ["Genetics", "Ecology", "Human Biology", "Evolution"],
                    students: "80+ students"
                  },
                  // { 
                  //   title: "Computer Science", 
                  //   icon: "💻",
                  //   gradient: "from-indigo-500 to-blue-500",
                  //   description: "IT, CAT & Programming fundamentals",
                  //   topics: ["Algorithms", "Python", "Web Dev", "Data Structures"],
                  //   students: "420+ students"
                  // },
                  // { 
                  //   title: "Engineering Graphics", 
                  //   icon: "📐",
                  //   gradient: "from-orange-500 to-red-500",
                  //   description: "Technical drawing & design principles",
                  //   topics: ["Projections", "CAD", "Drafting", "3D Modeling"],
                  //   students: "280+ students"
                  // },
                  // { 
                  //   title: "Geography", 
                  //   icon: "🌍",
                  //   gradient: "from-teal-500 to-cyan-500",
                  //   description: "Physical & Human Geography studies",
                  //   topics: ["Climatology", "Geomorphology", "Urban Studies", "GIS"],
                  //   students: "510+ students"
                  // }
                ].map((subject, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ y: -8 }}
                    className="group"
                  >
                    <Card className="h-full border-2 border-gray-100 hover:border-[#7949fe]/30 transition-all duration-300 hover:shadow-2xl bg-white overflow-hidden">
                      <div className={`h-2 bg-gradient-to-r ${subject.gradient}`} />
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300`}>
                            <img
                              src={subject.icon}
                              alt={subject.title}
                              className="w-12 h-12 object-contain"
                            />
                          </div>
                          <Badge variant="secondary" className="bg-[#7949fe]/10 text-[#7949fe] border border-[#7949fe]/20">
                            <Users className="w-3 h-3 mr-1" />
                            {subject.students}
                          </Badge>
                        </div>
                        <CardTitle className="text-2xl font-bold text-gray-900 group-hover:text-[#7949fe] transition-colors">
                          {subject.title}
                        </CardTitle>
                        <CardDescription className="text-gray-600 text-base">
                          {subject.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <BookOpen className="w-4 h-4 text-[#7949fe]" />
                            Key Topics:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {subject.topics.map((topic, tIdx) => (
                              <span key={tIdx} className="px-3 py-1 bg-gray-50 text-gray-700 rounded-full text-xs font-medium border border-gray-200">
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-4 border-t">
                        <Button variant="ghost" className="w-full text-[#ff7849] hover:text-[#ff7849] hover:bg-[#ff7849]/10 font-bold group">
                          View Syllabus 
                          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="languages" className="mt-0">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  { 
                    title: "English", 
                    icon: "📚",
                    gradient: "from-rose-500 to-pink-500",
                    description: "Language, Literature & Comprehension",
                    topics: ["Poetry", "Prose", "Grammar", "Essay Writing"],
                    students: "920+ students"
                  },
                  { 
                    title: "Afrikaans", 
                    icon: "🗣️",
                    gradient: "from-amber-500 to-orange-500",
                    description: "First & Additional Language courses",
                    topics: ["Begrip", "Taal", "Letterkunde", "Skrif"],
                    students: "640+ students"
                  },
                  { 
                    title: "isiZulu", 
                    icon: "🌟",
                    gradient: "from-yellow-500 to-amber-500",
                    description: "Home Language & FAL",
                    topics: ["Ulimi", "Ukufunda", "Ukubhala", "Inkulumo"],
                    students: "380+ students"
                  }
                ].map((subject, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ y: -8 }}
                    className="group"
                  >
                    <Card className="h-full border-2 border-gray-100 hover:border-[#7949fe]/30 transition-all duration-300 hover:shadow-2xl bg-white overflow-hidden">
                      <div className={`h-2 bg-gradient-to-r ${subject.gradient}`} />
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${subject.gradient} flex items-center justify-center text-3xl shadow-lg transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300`}>
                            {subject.icon}
                          </div>
                          <Badge variant="secondary" className="bg-[#7949fe]/10 text-[#7949fe] border border-[#7949fe]/20">
                            <Users className="w-3 h-3 mr-1" />
                            {subject.students}
                          </Badge>
                        </div>
                        <CardTitle className="text-2xl font-bold text-gray-900 group-hover:text-[#7949fe] transition-colors">
                          {subject.title}
                        </CardTitle>
                        <CardDescription className="text-gray-600 text-base">
                          {subject.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <BookOpen className="w-4 h-4 text-[#7949fe]" />
                            Key Topics:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {subject.topics.map((topic, tIdx) => (
                              <span key={tIdx} className="px-3 py-1 bg-gray-50 text-gray-700 rounded-full text-xs font-medium border border-gray-200">
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-4 border-t">
                        <Button variant="ghost" className="w-full text-[#ff7849] hover:text-[#ff7849] hover:bg-[#ff7849]/10 font-bold group">
                          View Syllabus 
                          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="commerce" className="mt-0">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  { 
                    title: "Accounting", 
                    icon: "💰",
                    gradient: "from-emerald-500 to-teal-500",
                    description: "Financial & Management Accounting",
                    topics: ["Balance Sheets", "Income Statements", "Cost Accounting", "Budgets"],
                    students: "560+ students"
                  },
                  { 
                    title: "Business Studies", 
                    icon: "📊",
                    gradient: "from-blue-500 to-indigo-500",
                    description: "Business principles & entrepreneurship",
                    topics: ["Marketing", "Management", "HR", "Economics"],
                    students: "490+ students"
                  },
                  { 
                    title: "Economics", 
                    icon: "📈",
                    gradient: "from-[#7949fe] to-[#ff7849]",
                    description: "Micro & Macroeconomics studies",
                    topics: ["Supply & Demand", "Markets", "GDP", "Fiscal Policy"],
                    students: "410+ students"
                  }
                ].map((subject, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ y: -8 }}
                    className="group"
                  >
                    <Card className="h-full border-2 border-gray-100 hover:border-[#7949fe]/30 transition-all duration-300 hover:shadow-2xl bg-white overflow-hidden">
                      <div className={`h-2 bg-gradient-to-r ${subject.gradient}`} />
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${subject.gradient} flex items-center justify-center text-3xl shadow-lg transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300`}>
                            {subject.icon}
                          </div>
                          <Badge variant="secondary" className="bg-[#7949fe]/10 text-[#7949fe] border border-[#7949fe]/20">
                            <Users className="w-3 h-3 mr-1" />
                            {subject.students}
                          </Badge>
                        </div>
                        <CardTitle className="text-2xl font-bold text-gray-900 group-hover:text-[#7949fe] transition-colors">
                          {subject.title}
                        </CardTitle>
                        <CardDescription className="text-gray-600 text-base">
                          {subject.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <BookOpen className="w-4 h-4 text-[#7949fe]" />
                            Key Topics:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {subject.topics.map((topic, tIdx) => (
                              <span key={tIdx} className="px-3 py-1 bg-gray-50 text-gray-700 rounded-full text-xs font-medium border border-gray-200">
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-4 border-t">
                        <Button variant="ghost" className="w-full text-[#ff7849] hover:text-[#ff7849] hover:bg-[#ff7849]/10 font-bold group">
                          View Syllabus 
                          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* Bottom CTA */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 md:mt-16 text-center bg-white rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-12 shadow-xl border-2 border-[#7949fe]/20 mx-2 sm:mx-0"
          >
            <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 md:mb-4">Don't See Your Subject?</h3>
            <p className="text-gray-600 text-sm sm:text-base md:text-lg mb-6 md:mb-8 max-w-2xl mx-auto px-2">
              We offer personalized tutoring for many other subjects. Contact us to discuss your specific learning needs.
            </p>
            <Button size="lg" className="w-full sm:w-auto bg-[#7949fe] hover:bg-[#5a4ecf] text-white px-6 sm:px-10 py-4 sm:py-6 rounded-full text-sm sm:text-base md:text-lg font-bold">
              <Mail className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Request a Subject
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Study Materials Section */}
      <section id="materials" className="py-24 bg-gradient-to-b from-white to-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeading 
            subtitle="Study Resources" 
            title="Study Materials & Resources" 
          />
          <p className="text-center text-gray-600 text-lg mb-12 max-w-2xl mx-auto">
            Access our collection of study guides, past papers, video lessons, and revision notes. Some resources are completely free!
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: "Grade 10 Maths Basics",
                description: "Introduction to Grade 10 Mathematics with essential concepts and practice questions",
                price: "Free",
                isFree: true,
                icon: "📊",
                gradient: "from-green-500 to-emerald-500",
                type: "PDF Notes",
                pages: "45 pages",
                includes: ["Basic algebra", "Number patterns", "Intro to functions", "Practice exercises"]
              },
              {
                title: "Past Exam Papers 2023",
                description: "Free collection of past matric exam papers with memo answers",
                price: "Free",
                isFree: true,
                icon: "📝",
                gradient: "from-teal-500 to-cyan-500",
                type: "Practice Tests",
                pages: "12 papers",
                includes: ["Maths Paper 1 & 2", "Physical Sciences", "Life Sciences", "Answer memos"]
              },
              {
                title: "Study Tips Video Series",
                description: "Free video lessons on effective study techniques and exam strategies",
                price: "Free",
                isFree: true,
                icon: "🎬",
                gradient: "from-blue-400 to-blue-600",
                type: "Video Lessons",
                pages: "8 videos",
                includes: ["Time management", "Memory techniques", "Exam strategies", "Note-taking tips"]
              },
              {
                title: "Grade 12 Maths Study Pack",
                description: "Complete revision notes, practice questions, and exam strategies for Grade 12 Mathematics",
                price: "R299",
                isFree: false,
                icon: "📐",
                gradient: "from-blue-500 to-cyan-500",
                type: "PDF Notes",
                pages: "250+ pages",
                includes: ["Full syllabus coverage", "100+ practice problems", "Past exam papers", "Video explanations"]
              },
              {
                title: "Physical Sciences Bundle",
                description: "Comprehensive Physics & Chemistry study material for Grades 10-12",
                price: "R399",
                isFree: false,
                icon: "⚗️",
                gradient: "from-[#7949fe] to-[#ff7849]",
                type: "PDF Notes",
                pages: "400+ pages",
                popular: true,
                includes: ["Physics & Chemistry", "Practical experiments", "Formula sheets", "Exam tips & tricks"]
              },
              {
                title: "Life Sciences Guide",
                description: "Detailed notes and diagrams covering all Grade 12 Life Sciences topics",
                price: "R249",
                isFree: false,
                icon: "🧬",
                gradient: "from-green-500 to-emerald-500",
                type: "PDF Notes",
                pages: "180+ pages",
                includes: ["Detailed diagrams", "Summary notes", "Past papers", "Mnemonics & tips"]
              },
              {
                title: "Accounting Mastery Pack",
                description: "Step-by-step guides to mastering Grade 11-12 Accounting concepts",
                price: "R279",
                isFree: false,
                icon: "💰",
                gradient: "from-emerald-500 to-teal-500",
                type: "PDF Notes",
                pages: "200+ pages",
                includes: ["Financial statements", "Practice exercises", "Case studies", "Calculator tips"]
              },
              {
                title: "Complete Exam Prep Kit",
                description: "All subjects combined - everything you need for final exams",
                price: "R899",
                isFree: false,
                icon: "🎓",
                gradient: "from-orange-500 to-red-500",
                type: "Practice Tests",
                pages: "1000+ pages",
                includes: ["All major subjects", "Exam strategies", "Time management tips", "Bonus resources"]
              },
              {
                title: "English Literature Pack",
                description: "Comprehensive guides for all prescribed books and poetry",
                price: "R229",
                isFree: false,
                icon: "📚",
                gradient: "from-rose-500 to-pink-500",
                type: "PDF Notes",
                pages: "150+ pages",
                includes: ["Character analysis", "Themes & symbols", "Essay guides", "Sample answers"]
              }
            ].map((material, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.05 }}
                className="relative group"
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
                          <Badge className="bg-green-100 text-green-700 border border-green-300 text-sm font-bold px-3 py-1">
                            Free
                          </Badge>
                        ) : (
                          <Badge className="bg-[#7949fe]/10 text-[#7949fe] border border-[#7949fe]/30 text-sm font-bold px-3 py-1">
                            Premium
                          </Badge>
                        )}
                        <div className={`text-2xl font-bold mt-2 ${material.isFree ? 'text-green-600' : 'text-[#1a0b2e]'}`}>
                          {material.price}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                        {material.type}
                      </Badge>
                      <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                        {material.pages}
                      </Badge>
                    </div>
                    <CardTitle className="text-xl font-bold text-gray-900 mb-2">
                      {material.title}
                    </CardTitle>
                    <CardDescription className="text-gray-600">
                      {material.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm font-semibold text-gray-700 mb-2">Includes:</div>
                    {material.includes.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                        {item}
                      </div>
                    ))}
                  </CardContent>
                  <CardFooter className="pt-4">
                    <Button className={`w-full py-6 rounded-xl font-bold group-hover:shadow-lg transition-all ${
                      material.isFree 
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white' 
                        : 'bg-gradient-to-r from-[#7949fe] to-[#ff7849] hover:from-[#5a4ecf] hover:to-[#ff6b35] text-white'
                    }`}>
                      {material.isFree ? 'Download Free' : 'Purchase Now'}
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 md:mt-16 text-center bg-white rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-12 shadow-xl border-2 border-[#7949fe]/20 mx-2 sm:mx-0"
          >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mb-3 md:mb-4">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-[#7949fe]" />
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-center">Need Custom Study Material?</h3>
            </div>
            <p className="text-gray-600 text-sm sm:text-base mb-5 md:mb-6 px-2">
              We can create personalized study guides tailored to your specific needs and learning style.
            </p>
            <Button size="lg" variant="outline" className="w-full sm:w-auto border-2 border-[#7949fe] text-[#7949fe] hover:bg-[#7949fe]/10 px-6 sm:px-8 py-4 sm:py-6 rounded-full text-sm sm:text-base md:text-lg font-bold">
              Request Custom Material
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Pricing Tables */}
      <section id="pricing" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeading subtitle="Pricing Plans" title="Affordable Learning Packages" />
          
          <div className="flex justify-center mb-12">
             <div className="bg-gray-100 p-1 rounded-full inline-flex">
               <Button variant="ghost" className="rounded-full bg-white shadow-sm text-purple-900 font-bold px-6">Monthly</Button>
               <Button variant="ghost" className="rounded-full text-gray-500 font-medium px-6 hover:text-purple-900">Quarterly (Save 15%)</Button>
             </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 items-start">
            {[
              { name: "Basic", price: "R500", color: "border-gray-200", features: ["4 sessions per month", "Group classes (max 6)", "Digital study materials", "Email support", "Progress tracking"] },
              { name: "Standard", price: "R850", color: "border-[#7949fe]", popular: true, features: ["8 sessions per month", "Small group (max 3)", "Printed & digital materials", "WhatsApp support", "Monthly assessments", "Parent-teacher meetings"] },
              { name: "Premium", price: "R1200", color: "border-gray-200", features: ["12 sessions per month", "One-on-one tutoring", "Complete resource library", "24/7 tutor access", "Weekly progress reports", "Exam preparation workshops", "University application guidance"] }
            ].map((plan, idx) => (
              <div 
                key={idx} 
                className={`relative bg-white rounded-3xl p-8 border-2 ${plan.popular ? 'border-[#7949fe] shadow-2xl scale-105 z-10' : 'border-gray-100 shadow-lg'} transition-all`}
              >
                {plan.popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#7949fe] text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg">
                    Most Popular
                  </div>
                )}
                <div className="text-center mb-8">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-4xl font-extrabold text-[#1a0b2e]">{plan.price}</span>
                    <span className="text-gray-500 font-medium text-sm">/month</span>
                  </div>
                </div>
                <div className="space-y-4 mb-8">
                  {plan.features.map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-green-600" />
                      </div>
                      <span className="text-gray-600 text-sm">{feat}</span>
                    </div>
                  ))}
                </div>
                <Button className={`w-full py-6 rounded-xl font-bold ${plan.popular ? 'bg-[#7949fe] hover:bg-[#5a4ecf]' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>
                  Choose {plan.name}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial Carousel Style */}
      <section className="py-24 bg-gray-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
           <div className="grid md:grid-cols-2 gap-16 items-center">
             <div>
               <SectionHeading align="left" subtitle="Testimonials" title="What Our Learners Say" />
               <p className="text-gray-600 text-lg mb-8 leading-relaxed">
                 Hear from our students and parents about their transformative learning experiences with Viva Tutorials.
               </p>
               <Button className="bg-[#1a0b2e] text-white px-8 py-6 rounded-full text-lg">Read More Stories</Button>
             </div>
             
             <TestimonialCarousel />
           </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">Ready to Transform Your Learning?</h2>
            <p className="text-purple-200 text-lg md:text-xl max-w-2xl mx-auto mb-10">
              Take the first step towards academic excellence. Join hundreds of students achieving their goals with Viva Tutorials.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button className="bg-white text-purple-900 hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">Enroll Now</Button>
              <Button variant="outline" className="border-white/20  hover:bg-white/10 py-6 px-10 rounded-full text-lg font-bold">Contact Us</Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      {/* Footer (Detailed WP Style) */}
      {/* <footer className="bg-white pt-20 pb-10 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-[#7949fe] rounded-lg flex items-center justify-center text-white">
                  <span className="font-bold font-mono">V</span>
                </div>
                <span className="text-2xl font-extrabold text-[#1a0b2e]">Viva.</span>
              </div>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Empowering students to achieve academic excellence through personalized STEM education and expert guidance.
              </p>
              <div className="flex gap-4">
                {[Facebook, Twitter, Instagram, Linkedin].map((Icon, i) => (
                  <div key={i} className="w-8 h-8 rounded-full bg-[#7949fe]/10 flex items-center justify-center text-[#7949fe] hover:bg-[#7949fe] hover:text-white transition-all cursor-pointer">
                    <Icon className="w-4 h-4" />
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-900 mb-6">Quick Links</h4>
              <ul className="space-y-3 text-gray-600">
                {['Home', 'About Us', 'Our Tutors', 'Success Stories', 'Pricing', 'Contact'].map(item => (
                  <li key={item}><a href="#" className="hover:text-[#7949fe] transition-colors">{item}</a></li>
                ))}
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-900 mb-6">Subjects</h4>
              <ul className="space-y-3 text-gray-600">
                {['Mathematics', 'Physical Science', 'Life Sciences', 'Accounting', 'Information Tech', 'Geography'].map(item => (
                  <li key={item}><a href="#" className="hover:text-[#7949fe] transition-colors">{item}</a></li>
                ))}
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-900 mb-6">Newsletter</h4>
              <p className="text-gray-500 mb-4 text-sm">Subscribe to get study tips and updates.</p>
              <div className="flex gap-2">
                <Input placeholder="Email Address" className="rounded-full bg-gray-50 border-gray-200" />
                <Button className="rounded-full bg-[#7949fe] hover:bg-[#5a4ecf] w-12 h-10 p-0 flex items-center justify-center">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-100 pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
            <p>&copy; 2026 Viva Tutorial Services. All rights reserved.</p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-[#7949fe]">Privacy Policy</a>
              <a href="#" className="hover:text-[#7949fe]">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer> */}
    </div>
  );
}
