import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import {
  GraduationCap, Phone, Mail, MapPin,
  ChevronRight, Star, Check, ArrowRight, Play, BookOpen, Users,
  Award, Clock, Calendar, Search, Menu, X, Laptop, Sparkles
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Footer from '@/components/Footer';
import { FaYoutube, FaFacebook, FaTiktok } from "react-icons/fa6";
import Maths from '/maths.png'
import { Link } from "react-router-dom";
import SubjectRequestModal from '@/components/SubjectRequestModal';
import SyllabusModal from '@/components/SyllabusModal';

// --- Theme Components ---

const TopBar = () => (
  <div className="fixed top-0 left-0 right-0 z-50 bg-[#1a0b2e] text-white py-2.5 text-xs font-medium border-b border-white/10">
    <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">

      {/* Left section */}
      <div className="flex items-center gap-3 lg:gap-6 overflow-x-auto">
        <a
          href="tel:073913206"
          className="flex items-center gap-2 hover:text-[#ff7849] transition-colors cursor-pointer whitespace-nowrap"
        >
          <Phone className="w-3.5 h-3.5 animate-[wiggle_1s_ease-in-out_infinite]" />
          <span className="hidden sm:inline">(+27) 73 913 206</span>
        </a>

        <span className="hidden items-center gap-2 whitespace-nowrap transition-colors hover:text-[#ff7849] cursor-pointer sm:flex">
          <Mail className="w-3.5 h-3.5" />
          info@vivatutorials.co.za
        </span>

        <span className="hidden items-center gap-2 whitespace-nowrap transition-colors hover:text-[#ff7849] cursor-pointer md:flex">
          <MapPin className="w-3.5 h-3.5" />
          Cape Town, South Africa
        </span>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2 lg:gap-4">
        <span className="text-white/60 hidden lg:inline">Follow Us:</span>

        <div className="flex items-center gap-3">
          <a
            href="https://web.facebook.com/profile.php?id=61586724797551"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaFacebook className="w-3.5 h-3.5 hover:text-[#ff7849] transition-colors cursor-pointer" />
          </a>

          <a
            href="https://www.youtube.com/@viva-tutorials"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaYoutube className="w-3.5 h-3.5 hover:text-[#ff7849] transition-colors cursor-pointer" />
          </a>

          <a
            href="https://www.tiktok.com/@viva.coach.vuyo?_r=1&_t=ZS-93WzVp1UbQe"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaTiktok className="w-3.5 h-3.5 hover:text-[#ff7849] transition-colors cursor-pointer" />
          </a>
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
      name: "Sahluma Mkabile",
      role: "Grade 12 Student",
      image: 32, // Replace with actual image index
      text: "Coach Vuyo, thank you for your genuine love and for sacrificing your sleep to help us understand the work. Without you, we wouldn't be where we are. I really appreciate you being patient with me since Grade 10."
    },
    {
      name: "Liya Dameni",
      role: "Grade 12 Student",
      image: 45, // Replace with actual image index
      text: "What a journey it has been! You played a huge role in my academics. Thank you for being patient, understanding, and for never getting tired of my 'stupid' questions. I'm writing this with a heavy heart because your impact was so great."
    },
    {
      name: "Smart Kids Community",
      role: "Student Group",
      image: 28, // Replace with actual image index
      text: "We appreciate all the effort you put into making sure we get good grades. Your dedication is unmatched, and we hope that in the future, we can proudly say we are the products of your hands."
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
              {[1, 2, 3, 4, 5].map(i => <Star key={i} className="inline-block w-5 h-5 fill-current" />)}
            </div>
            <blockquote className="text-xl text-gray-800 font-medium leading-relaxed mb-6">
              "{testimonials[currentIndex].text}"
            </blockquote>
            <div className="flex items-center gap-4">
              <img loading="lazy" src={`https://i.pravatar.cc/100?img=${testimonials[currentIndex].image}`} alt={testimonials[currentIndex].name} className="w-12 h-12 rounded-full object-cover" />
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
              className={`h-2 rounded-full transition-all ${idx === currentIndex ? 'w-8 bg-[#7949fe]' : 'w-2 bg-gray-300'
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

// SVG Icons as components
const HomeIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const BookIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const FileIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const PurchaseModal = ({ material, open, onOpenChange }) => {
  const [customer, setCustomer] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [checkoutError, setCheckoutError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!material) return;

    setIsSubmitting(true);
    sessionStorage.setItem('viva-purchase', JSON.stringify({
      customer,
      material: material.title,
      amount: material.amount,
      currency: 'ZAR',
      status: 'pending',
    }));

    setCheckoutError('');
    try {
      const response = await fetch('/api/payfast/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ ...customer, material: material.title }),
      });
      const checkout = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCheckoutError(checkout.error || `Checkout could not start (${response.status}). Check your PayFast server settings.`);
        return;
      }
      if (!checkout.endpoint || !checkout.fields) {
        setCheckoutError('PayFast returned an incomplete checkout response. Please try again.');
        return;
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = checkout.endpoint;
      Object.entries(checkout.fields).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = String(value);
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch {
      setCheckoutError('The checkout service could not be reached. Confirm the deployed API is available and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl sm:max-h-[94vh] sm:w-full sm:rounded-3xl">
        {material && (
          <form onSubmit={handleSubmit} className="p-4 sm:p-8">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-2xl font-bold text-slate-900">Complete your purchase</DialogTitle>
              <DialogDescription className="text-slate-600">Enter your details so we know where to send your paid PDF.</DialogDescription>
            </DialogHeader>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3 sm:mt-6 sm:p-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#7949fe]">You are buying</div>
              <div className="mt-1 text-lg font-bold text-slate-900">{material.title}</div>
              <div className="mt-1 text-sm text-slate-500">{material.pages} pages · PDF · {material.price}</div>
            </div>

            <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">First name
                <Input required autoComplete="given-name" value={customer.firstName} onChange={(event) => setCustomer({ ...customer, firstName: event.target.value })} className="mt-2" />
              </label>
              <label className="text-sm font-semibold text-slate-700">Surname
                <Input required autoComplete="family-name" value={customer.lastName} onChange={(event) => setCustomer({ ...customer, lastName: event.target.value })} className="mt-2" />
              </label>
            </div>
            <label className="mt-4 block text-sm font-semibold text-slate-700">Email address
              <Input required type="email" autoComplete="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} className="mt-2" />
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">Phone number
              <Input required type="tel" autoComplete="tel" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} className="mt-2" />
            </label>

            {checkoutError && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{checkoutError}</p>}
            <Button type="submit" disabled={isSubmitting} className="mt-5 min-h-12 w-full rounded-xl bg-gradient-to-r from-[#7949fe] to-[#ff7849] font-bold text-white hover:from-[#5a4ecf] hover:to-[#ff6b35]">
              {isSubmitting ? 'Connecting to PayFast...' : `Continue to PayFast · ${material.price}`}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">Your details are used for payment processing, purchase records, and PDF delivery.</p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

const PayFastButton = ({ material, onPurchase }) => {
  const merchantId = import.meta.env.VITE_PAYFAST_MERCHANT_ID;
  const merchantKey = import.meta.env.VITE_PAYFAST_MERCHANT_KEY;

  if (!merchantId || !merchantKey) {
    return (
      <button
        type="button"
        onClick={onPurchase}
        className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7949fe] to-[#ff7849] px-3 py-3 text-center text-sm font-bold text-white transition-all hover:from-[#5a4ecf] hover:to-[#ff6b35]"
      >
        Buy via PayFast
        <ArrowRight className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onPurchase}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7949fe] to-[#ff7849] px-3 py-3 text-center text-sm font-bold text-white transition-all hover:from-[#5a4ecf] hover:to-[#ff6b35]"
    >
      Buy via PayFast
      <ArrowRight className="h-4 w-4" />
    </button>
  );
};


// --- Page Sections ---

export default function Home() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyllabusModalOpen, setIsSyllabusModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [previewMaterial, setPreviewMaterial] = useState(null);
  const [purchaseMaterial, setPurchaseMaterial] = useState(null);
  const [activeTab, setActiveTab] = useState('home');

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
        className={`fixed top-[37px] left-0 right-0 z-40 transition-all duration-300 border-b ${isScrolled ? 'bg-white/95 backdrop-blur-md shadow-lg py-3 border-gray-100' : 'bg-white py-5 border-transparent'
          }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
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
              { label: 'About', path: '/about' },
              { label: 'Services', path: '/services' },
              { label: 'Pricing', path: '/pricing' },
              { label: 'Contact', path: 'https://forms.gle/sh3Be1fF8gD1qt9G9' }
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
            <a
              href="https://calendar.app.google/k1hbyKuD97U5g1Vf7"
              className="text-sm font-semibold text-[#7949fe] hover:underline"
            >
              Book A Session
            </a>

            <a href="https://forms.gle/sh3Be1fF8gD1qt9G9">
              <Button className="bg-[#7949fe] hover:bg-[#5a4ecf] text-white rounded-full px-6 transition-all duration-300 shadow-lg hover:shadow-[#7949fe]/20">
                Enroll Now!
              </Button>
            </a>
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
                    <img
                      src="/viva-tutorials-logo.png"
                      alt="Viva Logo"
                      className="w-12 h-12 object-contain" // adjust size as needed
                    />

                  </div>

                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-full"
                  >
                    <X className="w-6 h-6 text-gray-600" />
                  </button>
                </div>

                <nav className="flex flex-col gap-2">
                  {[
                    { label: 'Home', path: '/' },
                    { label: 'About', path: '/about' },
                    { label: 'Services', path: '/services' },
                    { label: 'Pricing', path: '/pricing' },
                    { label: 'Contact', path: 'https://forms.gle/sh3Be1fF8gD1qt9G9' }
                  ].map((item) => (
                    <a
                      key={item.label}
                      href={item.path}
                      className="text-lg font-semibold text-gray-800 py-4 px-4 hover:bg-[#7949fe]/10 rounded-lg transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>

                <div className="mt-8 pt-8 border-t border-gray-200 space-y-4">
                  <a href="https://forms.gle/sh3Be1fF8gD1qt9G9">
                    <Button className="w-full bg-[#7949fe] hover:bg-[#5a4ecf] py-6 rounded-full text-lg">
                      Enroll Now
                    </Button>
                  </a>
                  <a
                    href="https://calendar.app.google/k1hbyKuD97U5g1Vf7"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      variant="outline"
                      className="w-full border-2 border-gray-200 py-6 rounded-full text-lg mt-4"
                    >
                      Book a Session
                    </Button>
                  </a>
                </div>
                <div className="mt-8 pt-8 border-t border-gray-200">
                  <p className="text-sm font-semibold text-gray-500 mb-4">Follow Us</p>

                  <div className="flex gap-4">
                    {[
                      { icon: FaFacebook, url: "https://facebook.com/yourpage" },
                      { icon: FaTiktok, url: "https://www.tiktok.com/@yourhandle" },
                      { icon: FaYoutube, url: "https://www.youtube.com/@yourchannel" },
                    ].map(({ icon: Icon, url }, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-10 h-10 rounded-full bg-[#7949fe]/10 flex items-center justify-center text-[#7949fe] hover:bg-[#7949fe] hover:text-white transition-all"
                      >
                        <Icon className="w-5 h-5" />
                      </a>
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
        <div className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" style={{ backgroundColor: 'rgba(108, 92, 231, 0.08)' }} />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full blur-3xl translate-y-1/4 -translate-x-1/4" style={{ backgroundColor: 'rgba(255, 122, 69, 0.08)' }} />

        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="flex flex-col items-center lg:grid lg:grid-cols-2 gap-12 lg:gap-16 lg:items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="w-full flex flex-col items-center lg:items-start text-center lg:text-left"
            >

              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7949fe]/10 border border-[#7949fe]/30 mb-6"
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

                <p className="text-lg sm:text-xl text-slate-600 max-w-xl leading-relaxed mx-auto lg:mx-0">
                  From Grade 8 to Matric, we provide personalized STEM mentorship and innovative mobile tools that South Africa’s future leaders need to succeed.
                </p>
              </div>


              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center lg:justify-start">
                <Button
                  asChild
                  size="lg"
                  className="h-14 px-8 text-base bg-[#7949fe] hover:bg-[#5a4ecf] text-white rounded-full shadow-xl shadow-[#7949fe]/30 hover:shadow-2xl hover:scale-105 transition-all duration-300"
                >
                  <Link to="https://forms.gle/sh3Be1fF8gD1qt9G9">Enroll Now!</Link>
                </Button>

                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-14 px-8 text-base border-2 border-[#7949fe] text-[#7949fe] hover:bg-[#7949fe]/10 rounded-full font-bold"
                >
                  <Link to="https://calendar.app.google/k1hbyKuD97U5g1Vf7">Book A Session</Link>
                </Button>
              </div>

              <div className="mt-12 flex items-center gap-4 text-sm font-medium text-gray-500 relative justify-center lg:justify-start">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-gray-200 overflow-hidden">
                      <img loading="lazy" src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="Student" className="w-full h-full object-cover" />
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
              className="relative w-full max-w-md mx-auto hidden lg:block"
            >
              <div className="absolute inset-0 bg-[#9f82f6] rounded-[3rem] rotate-3 opacity-10 scale-95 blur-2xl transform translate-y-8" />

              <div className="relative bg-white rounded-[2rem] shadow-2xl border border-gray-100 overflow-hidden">
                {/* Dashboard Header */}
                <div style={{ background: 'linear-gradient(to right, #7949fe, #9f82f6)' }} className="p-6 text-white">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="font-bold text-3xl mb-1">Vitocostrian Mableka</h3>
                      <p className="text-white/70 text-lg">Grade 12</p>
                    </div>
                    <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                      <svg className="w-7 h-7 text-[#E85D52]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  </div>

                  {/* Progress Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="relative w-12 h-12">
                          <svg className="w-12 h-12 transform -rotate-90">
                            <circle
                              cx="24"
                              cy="24"
                              r="20"
                              stroke="rgba(255,255,255,0.3)"
                              strokeWidth="4"
                              fill="none"
                            />
                            <circle
                              cx="24"
                              cy="24"
                              r="20"
                              stroke="white"
                              strokeWidth="4"
                              fill="none"
                              strokeDasharray="125.6"
                              strokeDashoffset="31.4"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xl font-bold">Level 4</div>
                        </div>
                      </div>
                      <div className="text-xs text-white/70">530 XP total</div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 bg-gradient-to-br from-[#FFB74D] to-[#FFA726] rounded-full flex items-center justify-center">
                          <span className="text-2xl">🔥</span>
                        </div>
                        <div>
                          <div className="text-xl font-bold">3 days</div>
                        </div>
                      </div>
                      <div className="text-xs text-white/70">Current streak</div>
                    </div>
                  </div>
                </div>

                {/* Dashboard Body */}
                <div className="p-6 bg-gray-50/50">
                  <div className="space-y-3">
                    {/* Equations course */}
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.3 }}
                      className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h5 className="font-bold text-gray-900 text-lg mb-2">Equations and Inequalities</h5>
                          <p className="text-xs text-gray-600 leading-relaxed">
                            Master solving linear, quadratic, exponential, logarithmic equations, and inequalities.
                          </p>
                        </div>
                        <button className="ml-4 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0">
                          <ChevronRight />
                        </button>
                      </div>

                      <div className="space-y-2">
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: '50%' }}
                            transition={{ duration: 1, delay: 0.5 }}
                            className="bg-[#9987ed] h-full rounded-full"
                          ></motion.div>
                        </div>
                        <p className="text-gray-500 text-xs text-right font-medium">50% complete</p>
                      </div>
                    </motion.div>

                    {/* Newton's Laws course */}
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.4 }}
                      className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h5 className="font-bold text-gray-900 text-lg mb-2">Newton's Laws of Motion</h5>
                          <p className="text-xs text-gray-600 leading-relaxed">
                            Learn how forces affect motion using Newton's three laws.
                          </p>
                        </div>
                        <button className="ml-4 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0">
                          <ChevronRight />
                        </button>
                      </div>

                      <div className="space-y-2">
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: '40%' }}
                            transition={{ duration: 1, delay: 0.6 }}
                            className="bg-[#9987ed] h-full rounded-full"
                          ></motion.div>
                        </div>
                        <p className="text-gray-500 text-xs text-right font-medium">40% complete</p>
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Bottom navigation */}
                <div className="border-t border-gray-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-around">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActiveTab('home')}
                      className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${activeTab === 'home' ? 'text-[#9987ed]' : 'text-gray-400'
                        }`}
                    >
                      <HomeIcon />
                      <span className="text-xs font-medium">Home</span>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActiveTab('learn')}
                      className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${activeTab === 'learn' ? 'text-[#9987ed]' : 'text-gray-400'
                        }`}
                    >
                      <BookIcon />
                      <span className="text-xs font-medium">Learn</span>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActiveTab('tutor')}
                      className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-colors relative ${activeTab === 'tutor' ? 'text-[#9987ed]' : 'text-gray-400'
                        }`}
                    >
                      {activeTab === 'tutor' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-16 h-16 bg-[#9987ed]/10 rounded-full -z-10"
                        />
                      )}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${activeTab === 'tutor' ? 'bg-[#9987ed] ring-4 ring-[#9987ed]/20' : 'bg-gray-200'
                        }`}>
                        <UsersIcon />
                      </div>
                      <span className="text-xs font-medium">Tutor</span>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActiveTab('exams')}
                      className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${activeTab === 'exams' ? 'text-[#9987ed]' : 'text-gray-400'
                        }`}
                    >
                      <FileIcon />
                      <span className="text-xs font-medium">Exams</span>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActiveTab('profile')}
                      className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${activeTab === 'profile' ? 'text-[#9987ed]' : 'text-gray-400'
                        }`}
                    >
                      <UserIcon />
                      <span className="text-xs font-medium">Profile</span>
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Ribbon */}
      <div className="bg-[#1a0b2e] text-white py-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10">
          <AnimatedCounter value="3+" label="Expert Tutors" />
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
                <a href="/services" className="inline-flex items-center font-bold text-[#1a0b2e] hover:text-[#7949fe] transition-colors uppercase text-sm tracking-wide">
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
                  {
                    title: "Computer Science",
                    icon: "💻",
                    gradient: "from-indigo-500 to-blue-500",
                    description: "IT, CAT & Programming fundamentals",
                    topics: ["Algorithms", "Python", "Web Dev", "Data Structures"],
                    students: "420+ students"
                  },
                  {
                    title: "Mathematical Literacy",
                    icon: "📐",
                    gradient: "from-orange-500 to-red-500",
                    description: "Technical drawing & design principles",
                    topics: ["Projections", "CAD", "Drafting", "3D Modeling"],
                    students: "280+ students"
                  },
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
                    <Card className="h-full border-2 border-[#7949fe]/30 hover:border-[#7949fe] transition-all duration-300 hover:shadow-2xl bg-white overflow-hidden">
                      <div className={`h-2 bg-gradient-to-r ${subject.gradient}`} />
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300`}>
                            <img
                              loading="lazy"
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
                        <Button
                          onClick={() => {
                            setSelectedSubject(subject);
                            setIsSyllabusModalOpen(true);
                          }}
                          className="w-full text-[#ff7849] hover:text-[#ff7849] hover:bg-[#ff7849]/10 font-bold group bg-transparent"
                        >
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
                        <Button
                          onClick={() => {
                            setSelectedSubject(subject);
                            setIsSyllabusModalOpen(true);
                          }}
                          variant="outline"
                          className="w-full text-[#ff7849] hover:text-[#ff7849] hover:bg-[#ff7849]/10 font-bold group"
                        >
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
                        <Button
                          onClick={() => {
                            setSelectedSubject(subject);
                            setIsSyllabusModalOpen(true);
                          }}
                          className="w-full text-[#ff7849] hover:text-[#ff7849] hover:bg-[#ff7849]/10 font-bold group bg-transparent"
                        >
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

            {/* Updated Button with onClick */}
            <Button
              onClick={() => setIsModalOpen(true)}
              size="lg"
              className="w-full sm:w-auto bg-[#7949fe] hover:bg-[#5a4ecf] text-white px-6 sm:px-10 py-4 sm:py-6 rounded-full text-sm sm:text-base md:text-lg font-bold"
            >
              <Mail className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Request a Subject
            </Button>
          </motion.div>

          {/* The Modal Component */}
          <SubjectRequestModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
          />

          {/* Syllabus Modal Component */}
          <SyllabusModal
            isOpen={isSyllabusModalOpen}
            onClose={() => setIsSyllabusModalOpen(false)}
            subject={selectedSubject}
          />
        </div>
      </section>

      {/* Study Materials Section */}
      <section id="materials" className="py-24 bg-gradient-to-b from-white to-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeading
            subtitle="Study Resources"
            title="Study Materials & Resources"
          />
          <p className="mx-auto mb-4 max-w-2xl text-center text-base text-gray-600 md:text-lg">
            Clean, fast-download resources stored in a local materials folder for quick access, with two free PDFs and two premium resources available via PayFast.
          </p>

          <div className="mb-12 flex justify-center">
            <a
              href="/study-materials"
              className="inline-flex items-center gap-2 rounded-full border border-[#7949fe]/20 bg-[#7949fe]/5 px-5 py-3 text-sm font-semibold text-[#7949fe] transition-colors hover:bg-[#7949fe]/10"
            >
              Explore the full library <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: "Sequence and Series Practice",
                subtitle: "Sequence and Series",
                description: "Uploaded Grade 12 practice problems for arithmetic and geometric sequences and series.",
                price: "Free",
                isFree: true,
                file: "/materials/02. Sequence And Series Practice Problems.pdf",
                paymentUrl: "",
                pages: 18,
                amount: "0.00",
                accent: "from-violet-500 to-indigo-600",
                badge: "Free PDF",
                includes: ["Sequence and series", "Practice questions", "Exam-style layout", "Quick revision summary"]
              },
              {
                title: "Trigonometry Practice Questions",
                subtitle: "Trigonometry",
                description: "Uploaded exam-focused trigonometry questions for Grade 12 revision.",
                price: "Free",
                isFree: true,
                file: "/materials/03. Trigonometry Practice Questions.pdf",
                paymentUrl: "",
                pages: 148,
                amount: "0.00",
                accent: "from-cyan-500 to-sky-600",
                badge: "Free PDF",
                includes: ["Trigonometry", "Euclidean geometry", "Worked questions", "Exam prep checklist"]
              },
              {
                title: "Analytical Geometry Practice",
                subtitle: "Analytical Geometry",
                description: "Uploaded analytical geometry practice questions for focused exam preparation.",
                price: "R299",
                isFree: false,
                file: "/materials/02. Analytical Geometry Practice Questions.pdf",
                paymentUrl: "",
                pages: 133,
                amount: "299.00",
                accent: "from-[#7949fe] to-[#ff7849]",
                badge: "PayFast",
                includes: ["Coordinate geometry", "Practice problems", "Exam-style questions", "Revision focus areas"]
              },
              {
                title: "Finance Practice Questions",
                subtitle: "Finance",
                description: "Uploaded finance practice questions for structured mathematics revision.",
                price: "R399",
                isFree: false,
                file: "/materials/04. Finance Practice Questions.pdf",
                paymentUrl: "",
                pages: 11,
                amount: "399.00",
                accent: "from-emerald-500 to-teal-600",
                badge: "PayFast",
                includes: ["Finance concepts", "Practice questions", "Exam-style layout", "Revision checklist"]
              }
            ].map((material, index) => (
              <motion.article
                key={material.title}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.06 }}
                className="group"
              >
                <div className="h-full overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(121,73,254,0.15)]">
                  <div className={`h-2 bg-gradient-to-r ${material.accent}`} />

                  <div className="p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <Badge className={material.isFree ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-[#7949fe]/20 bg-[#7949fe]/5 text-[#7949fe]'}>
                        {material.badge}
                      </Badge>
                      <div className="text-right">
                        <div className="text-xl font-extrabold text-[#1a0b2e]">{material.price}</div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {material.pages} pages
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-inner">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="rounded-full bg-slate-900 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-white">
                          PDF
                        </span>
                        <span className="text-[10px] font-medium text-slate-500">
                          {material.isFree ? 'First page' : 'Preview locked'}
                        </span>
                      </div>

                      {material.isFree ? (
                        <iframe
                          src={`${material.file}#page=1&view=FitH`}
                          title={`${material.title} first page`}
                          className="h-52 w-full rounded-xl border border-slate-200 bg-white"
                        />
                      ) : (
                        <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-5 text-center">
                          <div>
                            <div className="mb-2 text-sm font-bold text-slate-700">Premium PDF</div>
                            <p className="text-xs leading-5 text-slate-500">This document is delivered after successful PayFast payment.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <CardHeader className="p-0 pb-3">
                      <CardTitle className="text-xl font-bold text-slate-900">{material.title}</CardTitle>
                      <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                        {material.description}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-2 p-0 pb-4">
                      {material.includes.map((item) => (
                        <div key={item} className="flex items-center gap-2 text-sm text-slate-600">
                          <Check className="h-4 w-4 text-emerald-600" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </CardContent>

                    <CardFooter className="flex flex-col gap-2 p-0 sm:flex-row">
                      {material.isFree ? (
                        <a
                          href={material.file}
                          download
                          className="inline-flex min-h-12 w-full flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-3 py-3 text-center text-sm font-bold text-white transition-all hover:from-emerald-600 hover:to-green-700"
                        >
                          Download PDF
                          <ArrowRight className="h-4 w-4" />
                        </a>
                      ) : <PayFastButton material={material} onPurchase={() => setPurchaseMaterial(material)} />}
                      {material.isFree && (
                        <button
                          type="button"
                          onClick={() => setPreviewMaterial(material)}
                          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
                        >
                          Preview
                        </button>
                      )}
                    </CardFooter>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>

          <Dialog open={Boolean(previewMaterial)} onOpenChange={(open) => !open && setPreviewMaterial(null)}>
            <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto border-0 bg-slate-950 p-0 text-white shadow-2xl sm:rounded-3xl">
              {previewMaterial && (
                <>
                  <DialogHeader className="px-6 pb-4 pt-6 pr-14 text-left">
                    <DialogTitle className="text-xl font-bold text-white">{previewMaterial.title}</DialogTitle>
                    <DialogDescription className="text-slate-300">
                      Free PDF preview · Page 1 of {previewMaterial.pages}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="bg-slate-800 px-3 pb-5 sm:px-8">
                    <iframe
                      src={`${previewMaterial.file}#page=1&view=FitH`}
                      title={`${previewMaterial.title} PDF preview`}
                      className="h-[58vh] min-h-[360px] w-full rounded-2xl border border-white/10 bg-white sm:h-[68vh] sm:min-h-[480px]"
                    />
                    <div className="mt-4 flex flex-col items-stretch gap-4 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                      <span>Showing page 1 of {previewMaterial.pages}.</span>
                      <a
                        href={previewMaterial.file}
                        download
                        className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 py-2 font-bold text-slate-900 transition-colors hover:bg-slate-200"
                      >
                        Download PDF
                      </a>
                    </div>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
          <PurchaseModal
            material={purchaseMaterial}
            open={Boolean(purchaseMaterial)}
            onOpenChange={(open) => !open && setPurchaseMaterial(null)}
          />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 md:mt-16 text-center bg-gradient-to-r from-[#7949fe] to-[#ff7849] rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-12 shadow-xl mx-2 sm:mx-0"
          >
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 md:mb-4">Explore Complete Study Library</h3>
            <p className="text-white/90 text-sm sm:text-base mb-5 md:mb-6 px-2">
              Access materials for all grades (8-12), all subjects, and download free resources or purchase premium study packs.
            </p>
            <a href="/study-materials">
              <Button className="w-full sm:w-auto bg-white text-[#7949fe] hover:bg-gray-100 px-6 sm:px-10 py-4 sm:py-6 rounded-full text-sm sm:text-base md:text-lg font-bold">
                View All Materials
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
              </Button>
            </a>
          </motion.div>
        </div>
      </section>

      {/* Pricing Tables */}
      <section id="pricing" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeading subtitle="Pricing Plans" title="Affordable Learning Packages" />

          <div className="flex justify-center mb-12">
            <div className="bg-gray-100 p-1 rounded-full inline-flex">
              <Button variant="ghost" className="rounded-full bg-white shadow-sm text-[#7949fe] font-bold px-6">Monthly</Button>
              <Button variant="ghost" className="rounded-full text-gray-500 font-medium px-6 hover:text-[#7949fe]">Quarterly (Save 15%)</Button>
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

      {/* Image Grid Section */}
      <section className="py-24 bg-gray-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeading subtitle="Our Community" title="Learning in Action" />
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative max-w-3xl mx-auto"
          >
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="space-y-3 sm:space-y-4"
              >
                <div className="rounded-2xl overflow-hidden shadow-lg border-2 border-[#7949fe]/10">
                  <img
                    loading="lazy"
                    src="/images/inclass.jfif"
                    alt="Students studying"
                    className="w-full h-36 sm:h-48 object-cover"
                  />
                </div>
                <div className="rounded-2xl overflow-hidden shadow-lg border-2 border-[#7949fe]/10">
                  <img
                    loading="lazy"
                    src="/images/incamp.jfif"
                    alt="Group learning"
                    className="w-full h-44 sm:h-56 object-cover"
                  />
                </div>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="space-y-3 sm:space-y-4 pt-6 sm:pt-8"
              >
                <div className="rounded-2xl overflow-hidden shadow-lg border-2 border-[#7949fe]/10">
                  <img
                    loading="lazy"
                    src="/images/tutoring.jpeg"
                    alt="Tutoring session"
                    className="w-full h-44 sm:h-56 object-cover"
                  />
                </div>
                <div className="rounded-2xl overflow-hidden shadow-lg border-2 border-[#7949fe]/10">
                  <img
                    loading="lazy"
                    src="/images/success.jfif"
                    alt="Success celebration"
                    className="w-full h-36 sm:h-48 object-cover"
                  />
                </div>
              </motion.div>
            </div>

            {/* Floating Stats Card */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-4 -right-3 sm:-right-4 bg-gradient-to-br from-[#7949fe] to-[#5a4ecf] rounded-xl p-2 sm:p-3 text-white shadow-lg z-10"
            >
              <p className="text-xl sm:text-2xl font-bold">95%</p>
              <p className="text-white/70 text-xs sm:text-sm">Pass Rate</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">Ready to Transform Your Learning?</h2>
            <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto mb-10">
              Take the first step towards academic excellence. Join hundreds of students achieving their goals with Viva Tutorials.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">Enroll Now</Button>
              <Button variant="outline" className="border-white/20  hover:bg-white/10 py-6 px-10 rounded-full text-lg font-bold">Contact Us</Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
