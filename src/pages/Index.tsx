import { VivaLoader } from "@/components/VivaLoader";
import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  GraduationCap, Mail, MapPin,
  Check, ArrowRight, BookOpen, Users, Laptop, Sparkles
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
import { TopBar, StickyHeader } from "@/components/Header";
import SubjectRequestModal from '@/components/SubjectRequestModal';
import SyllabusModal from '@/components/SyllabusModal';
import { getStudyMaterialDownloadUrl, getStudyMaterialFileName, studyMaterials } from '@/lib/studyMaterials';

const communityImages = [
  { src: '/images/inclass.jfif', alt: 'Students studying together in class' },
  { src: '/images/incamp.jfif', alt: 'Students learning together at camp' },
  { src: '/images/tutoring.jpeg', alt: 'Tutor supporting a student during a lesson' },
  { src: '/images/vivatutorials-feedback session.jpeg', alt: 'Tutor providing feedback to students during a study session' },
  { src: '/images/vivatutorials friday-assessments.jpeg', alt: 'Students completing assessment questions in a classroom' },
  { src: '/images/vivatutorials-assessment.jpeg', alt: 'Students working through a mathematics mock exam' },
];

// --- Theme Components ---

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

// SVG Icons as components
const FileIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const PurchaseModal = ({ material, open, onOpenChange }) => {
  const [customer, setCustomer] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [checkoutError, setCheckoutError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionStarted = useRef(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!material || submissionStarted.current) return;

    submissionStarted.current = true;
    setIsSubmitting(true);
    console.info('[PayFast] Starting checkout', {
      product: material.title,
      amount: material.amount,
      email: customer.email,
    });
    sessionStorage.setItem('viva-purchase', JSON.stringify({
      customer,
      material: material.title,
      amount: material.amount,
      currency: 'ZAR',
      status: 'pending',
    }));

    setCheckoutError('');
    let redirecting = false;
    let timeout;
    try {
      const controller = new AbortController();
      timeout = window.setTimeout(() => controller.abort(), 15000);
      const response = await fetch('/api/payfast/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ ...customer, material: material.title }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const checkout = await response.json().catch(() => ({}));
      console.info('[PayFast] Checkout API response', {
        status: response.status,
        ok: response.ok,
        error: checkout.error || null,
      });
      if (!response.ok) {
        setCheckoutError(checkout.error || `Checkout could not start (${response.status}). Check your PayFast server settings.`);
        return;
      }
      if (!checkout.endpoint || !checkout.fields) {
        console.error('[PayFast] Invalid checkout response', checkout);
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
      console.info('[PayFast] Submitting signed checkout form', { endpoint: checkout.endpoint });
      form.submit();
      redirecting = true;
    } catch (error) {
      console.error('[PayFast] Checkout request failed', error);
      setCheckoutError(error.name === 'AbortError'
        ? 'Checkout timed out after 15 seconds. Check that the deployed /api/payfast/checkout endpoint is reachable.'
        : 'The checkout service could not be reached. Check the browser console and deployed API settings.');
    } finally {
      window.clearTimeout(timeout);
      if (!redirecting) {
        submissionStarted.current = false;
        setIsSubmitting(false);
      }
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
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="mt-5 min-h-12 w-full rounded-xl bg-gradient-to-r from-[#7949fe] to-[#ff7849] font-bold text-white hover:from-[#5a4ecf] hover:to-[#ff6b35] disabled:cursor-wait disabled:opacity-70">
              {isSubmitting ? 'Redirecting to PayFast...' : `Continue to PayFast · ${material.price}`}
              {isSubmitting ? <VivaLoader size="button" decorative className="ml-2" /> : <ArrowRight className="ml-2 h-4 w-4" />}
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyllabusModalOpen, setIsSyllabusModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [previewMaterial, setPreviewMaterial] = useState(null);
  const [purchaseMaterial, setPurchaseMaterial] = useState(null);
  const [selectedCommunityImage, setSelectedCommunityImage] = useState(null);

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-[#7949fe]/20 selection:text-[#7949fe] overflow-x-hidden">
      <TopBar />
      <StickyHeader />

<main id="main-content">
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
                 
                <GraduationCap className="h-5 w-5 text-[#7949fe]" />
                <span className="text-sm font-medium text-[#7949fe]">ONLINE &amp; IN-PERSON TUTORING</span>
              </motion.div>

              {/* Headline */}
              <div className="space-y-4 mb-6">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-slate-900">
                  <span className="relative inline-block mb-3">
                    <span className="bg-gradient-to-r from-[#7949fe] via-[#ff7849] to-[#7949fe] bg-clip-text text-transparent">
                      Maths & Science
                    </span>

                    <motion.svg
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 1, duration: 1 }}
                      className="absolute -bottom-3 left-0 h-3 w-full"
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
                  <span>Tutoring in Mfuleni </span>
                  <br />
                  <span>Cape Town</span>
                </h1>

                <p className="text-lg sm:text-xl text-slate-600 max-w-xl leading-relaxed mx-auto lg:mx-0">
                  CAPS-aligned tutoring for Grades 8–12 and matric rewrite learners, online or in person in Mfuleni, Cape Town. Practise exam-style questions and ask us about subjects, programmes and availability.
                </p>
              </div>


              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center lg:justify-start">
                <Button
                  asChild
                  size="lg"
                  className="h-14 px-8 text-base bg-[#7949fe] hover:bg-[#5a4ecf] text-white rounded-full shadow-xl shadow-[#7949fe]/30 hover:shadow-2xl hover:scale-105 transition-all duration-300"
                >
                  <a href="/contact">Enquire About Tutoring</a>
                </Button>

                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-14 px-8 text-base border-2 border-[#7949fe] text-[#7949fe] hover:bg-[#7949fe]/10 rounded-full font-bold"
                >
                  <a href="/study-materials">Explore Free Study Materials</a>
                </Button>
              </div>

              <div className="mt-8 text-sm font-semibold text-gray-600 lg:text-left">
                Structured lessons. Guided practice. Assessment and progress review.
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="relative hidden w-full max-w-xl justify-self-end lg:block"
            >
              <div className="absolute -inset-4 rounded-[2.5rem] bg-[#7949fe]/10 blur-2xl" aria-hidden="true" />
              <img
                src="/images/tutoring.jpeg"
                alt="Viva Tutorials tutor teaching a Mathematics lesson at a whiteboard"
                fetchPriority="high"
                className="relative aspect-[4/5] w-full rounded-[2rem] object-center shadow-2xl"
              />
            </motion.div>
          </div>
        </div>
      </section>

      <section id="delivery-options" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading subtitle="Flexible Learning Options" title="Choose How You Want to Learn" />
          <p className="mx-auto -mt-8 mb-12 max-w-3xl text-center leading-7 text-gray-600">
            Every learner has different needs and circumstances. Viva Tutorials offers online and in-person tutoring, giving learners the option to receive academic support in a format that suits them.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Laptop,
                title: 'Online Tutoring',
                description: 'Learn from home with scheduled online lessons designed to help you understand difficult concepts, work through examples and practise relevant questions. Online tutoring gives learners access to academic support without needing to travel to the classroom.',
                href: '/contact?subject=Online%20tutoring',
                cta: 'Enquire About Online Lessons',
              },
              {
                icon: MapPin,
                title: 'In-Person Tutoring in Mfuleni',
                description: 'Join face-to-face tutoring in Mfuleni, Cape Town. Work through challenging topics, ask questions, practise problem-solving methods and strengthen your understanding with guided academic support.',
                href: '/contact?subject=In-person%20tutoring%20in%20Mfuleni',
                cta: 'Enquire About In-Person Lessons',
              },
              {
                icon: BookOpen,
                title: 'Support Across Your Subjects',
                description: 'Choose support for the subjects you need, based on the available timetable and programme options. Ask about online or in-person delivery for each subject and whether a combination of both formats can be arranged.',
                href: '/services',
                cta: 'Explore Our Subjects',
              },
            ].map(({ icon: Icon, title, description, href, cta }) => (
              <article key={title} className="rounded-3xl border-2 border-[#7949fe]/30 bg-white p-7 shadow-sm">
                <Icon className="mb-5 h-9 w-9 text-[#7949fe]" aria-hidden="true" />
                <h3 className="mb-3 text-xl font-bold text-gray-900">{title}</h3>
                <p className="mb-6 leading-7 text-gray-600">{description}</p>
                <a className="font-bold text-[#7949fe] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7949fe]" href={href}>
                  {cta} <ArrowRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Services Grid (WordPress Style) */}
      <section id="services" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 ">
          <SectionHeading
            subtitle="Our Services"
            title="How We Support Learners"
          />
          <p className="mx-auto -mt-8 mb-12 max-w-3xl text-center leading-7 text-gray-600">
            Our approach combines teaching, guided practice and study resources to help learners work towards a stronger understanding of their subjects.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Users,
                title: "Structured Tutoring",
                desc: "Receive explanations and guided support in the subjects and grade levels offered by Viva Tutorials. Lessons focus on understanding concepts, working through examples and practising relevant questions.",
                color: "text-[#7949fe]",
                bg: "bg-[#7949fe]/10",
                href: "/services",
                cta: "Explore Tutoring Services",
              },
              {
                icon: Check,
                title: "Assessment and Revision",
                desc: "Use appropriate assessment and revision activities to check understanding, identify gaps and prepare for school assessments and examinations, where included in the selected programme.",
                color: "text-[#7949fe]",
                bg: "bg-[#7949fe]/10",
                href: "/services",
                cta: "Discuss Assessment Support",
              },
              {
                icon: BookOpen,
                title: "Study Materials",
                desc: "Explore study notes, practice questions and revision resources designed to support learning beyond scheduled tutoring sessions. Availability and any charges are shown with each resource.",
                color: "text-[#7949fe]",
                bg: "bg-[#7949fe]/10",
                href: "/study-materials",
                cta: "Explore Study Materials",
              }
            ].map((service, idx) => (
              <motion.div
                key={idx}
                whileHover={{ y: -10 }}
                className="bg-white p-10 rounded-[2rem] shadow-sm hover:shadow-2xl transition-all duration-300   group border-2 border-[#7949fe]/30"
              >
                <div className={`w-20 h-20 ${service.bg} rounded-3xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300`}>
                  <service.icon className={`w-10 h-10 ${service.color}`} />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{service.title}</h3>
                <p className="text-gray-600 leading-relaxed mb-8">{service.desc}</p>
                <a href={service.href} className="inline-flex items-center font-bold text-[#1a0b2e] hover:text-[#7949fe] transition-colors text-sm tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7949fe]">
                  {service.cta} <ArrowRight className="w-4 h-4 ml-2" />
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Subjects - Enhanced */}
      <section id="subjects" className="py-24 bg-gradient-to-b from-white to-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10 ">
          <SectionHeading
            subtitle="Our Subjects"
            title="CAPS-Aligned Tutoring for Grades 8–12"
          />
          <p className="mx-auto -mt-8 mb-12 max-w-3xl text-center leading-7 text-gray-600">
            Build a stronger foundation, improve your understanding of important concepts and prepare for assessments with structured support in Mathematics and Science subjects. Our academic support is organised around the learner's grade, subject requirements and learning needs.
          </p>

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
                    grade: "Grades 8–9",
                    description: "Strengthen your understanding of number patterns, algebra, equations, functions, geometry, measurement and other grade-appropriate mathematical concepts through explanations and guided practice.",
                    topics: ["Number patterns", "Algebra and equations", "Geometry", "Measurement"],
                  },
                  {
                    title: "Natural Sciences",
                    icon: "/physics.png",
                    gradient: "from-[#7949fe] to-[#ff7849]",
                    grade: "Grades 8–9",
                    description: "Develop your understanding of scientific concepts through structured explanations, practical examples, questions and revision aligned with the relevant grade's curriculum.",
                    topics: ["Scientific concepts", "Practical examples", "Questions and revision"],
                  },
                  {
                    title: "Mathematics",
                    icon: "/integration.png",
                    gradient: "from-blue-500 to-cyan-500",
                    grade: "Grades 10–12",
                    description: "Develop problem-solving skills and improve your understanding of algebra, functions, trigonometry, calculus where applicable, probability, statistics and other curriculum topics relevant to your grade.",
                    topics: ["Algebra and functions", "Trigonometry", "Calculus where applicable", "Probability and statistics"],
                  },
                  {
                    title: "Mathematical Literacy",
                    icon: "/maths.png",
                    gradient: "from-orange-500 to-red-500",
                    grade: "Grades 10–12",
                    description: "Build confidence in applying mathematics to everyday situations, including financial mathematics, measurement, maps, data handling and other CAPS curriculum topics relevant to your grade.",
                    topics: ["Financial mathematics", "Measurement", "Maps", "Data handling"],
                  },
                  {
                    title: "Physical Sciences",
                    icon: "/physics.png",
                    gradient: "from-[#7949fe] to-[#ff7849]",
                    grade: "Grades 10–12",
                    description: "Strengthen your understanding of physics and chemistry through explanations, worked calculations, scientific principles and exam-style practice.",
                    topics: ["Physics", "Chemistry", "Worked calculations", "Exam-style practice"],
                  },
                  {
                    title: "Life Sciences",
                    icon: "/genetic-engineering.png",
                    gradient: "from-green-500 to-emerald-500",
                    grade: "Grades 10–12",
                    description: "Study biological concepts through structured explanations, diagrams, terminology, application questions and exam preparation relevant to your grade.",
                    topics: ["Biological concepts", "Diagrams and terminology", "Application questions", "Exam preparation"],
                  },
                  {
                    title: "Matric Rewrite Tutoring",
                    icon: null,
                    gradient: "from-[#7949fe] to-[#ff7849]",
                    grade: "Matric rewrite learners",
                    description: "Preparing to rewrite your matric examinations? Get structured support in the relevant subjects, identify topics that need attention, practise examination-style questions and review your progress as you prepare. Support is subject to the available programme and timetable.",
                    topics: ["Mathematics", "Mathematical Literacy", "Physical Sciences", "Life Sciences"],
                  },

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
                        <div className="mb-4">
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300`}>
                            {subject.icon ? (
                              <img
                                loading="lazy"
                                src={subject.icon}
                                alt=""
                                className="w-12 h-12 object-contain"
                              />
                            ) : <BookOpen className="h-8 w-8 text-[#7949fe]" aria-hidden="true" />}
                          </div>
                        </div>
                        <CardTitle className="text-2xl font-bold text-gray-900 group-hover:text-[#7949fe] transition-colors">
                          {subject.title}
                        </CardTitle>
                        <p className="mb-2 text-sm font-semibold text-[#7949fe]">{subject.grade}</p>
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
                          View Subject Overview
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
            <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 md:mb-4">Not Sure Which Subject Support You Need?</h3>
            <p className="text-gray-600 text-sm sm:text-base md:text-lg mb-6 md:mb-8 max-w-2xl mx-auto px-2">
              Ask us to confirm whether support is currently available for your grade, subject and preferred lesson format.
            </p>

            <Button
              onClick={() => setIsModalOpen(true)}
              size="lg"
              className="w-full sm:w-auto bg-[#7949fe] hover:bg-[#5a4ecf] text-white px-6 sm:px-10 py-4 sm:py-6 rounded-full text-sm sm:text-base md:text-lg font-bold"
            >
              <Mail className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Find the Right Subject Support
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

      <section id="learning-approach" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading subtitle="Our Approach" title="A Structured Approach to Learning" />
          <p className="mx-auto -mt-8 mb-12 max-w-3xl text-center leading-7 text-gray-600">
            Progress starts with understanding what a learner knows, where they need support and what they should work on next. Viva Tutorials uses a structured learning approach to support understanding, practice and review.
          </p>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'Enquire and Identify Your Needs',
                description: "Tell us the learner's grade, subjects, learning challenges and academic goals. This helps establish which support options may be appropriate.",
              },
              {
                title: 'Identify Learning Gaps',
                description: 'Where applicable, use previous results and diagnostic assessments to identify topics that require further attention.',
              },
              {
                title: 'Learn Through Guided Practice',
                description: 'Work through explanations, worked examples and relevant practice questions to develop understanding and problem-solving skills.',
              },
              {
                title: 'Assess and Review',
                description: 'Use assessments, corrections and feedback, where included in the selected programme, to identify strengths and areas for further improvement.',
              },
              {
                title: 'Continue With a Clearer Focus',
                description: 'Use the review of previous work to plan what the learner should practise or revisit next.',
              },
            ].map((step, index) => (
              <li key={step.title} className="rounded-3xl border-2 border-[#7949fe]/30 bg-white p-7 shadow-sm">
                <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#7949fe]/10 font-bold text-[#7949fe]" aria-hidden="true">
                  {index + 1}
                </span>
                <h3 className="mb-3 text-xl font-bold text-gray-900">{step.title}</h3>
                <p className="leading-7 text-gray-600">{step.description}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <a href="/contact" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#7949fe] px-7 py-3 font-bold text-white transition-colors hover:bg-[#5a4ecf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7949fe]">
              Discuss Your Learning Goals
            </a>
          </div>
        </div>
      </section>

      {/* Study Materials Section */}
      <section id="materials" className="py-24 bg-gradient-to-b from-white to-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeading
            subtitle="Learn Beyond the Lesson"
            title="Study Materials and Exam Practice"
          />
          <p className="mx-auto mb-4 max-w-2xl text-center text-base text-gray-600 md:text-lg">
            Keep practising between lessons with study resources that help you revisit concepts, work through questions and prepare for assessments. Explore available Mathematics and Science materials by subject, grade and topic.
          </p>
          <p className="mx-auto mb-8 max-w-2xl text-center leading-7 text-gray-600">
            Use these resources to reinforce what you have learned, identify questions you still find difficult and prepare for further practice.
          </p>

          <div className="mb-12 flex justify-center">
            <a
              href="/study-materials"
              className="inline-flex items-center gap-2 rounded-full border border-[#7949fe]/20 bg-[#7949fe]/5 px-5 py-3 text-sm font-semibold text-[#7949fe] transition-colors hover:bg-[#7949fe]/10"
            >
              Explore All Study Materials <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {[...studyMaterials.filter((material) => material.isFree).slice(0, 2), ...studyMaterials.filter((material) => !material.isFree)].map((material, index) => (
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
                        {material.pages && (
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {material.pages} pages
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mb-4 flex min-h-28 items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <FileIcon />
                      <div>
                        <p className="font-bold text-slate-800">{material.subject} · Grade {material.grade}</p>
                        <p className="mt-1 text-sm text-slate-600">{material.subtitle} · PDF resource</p>
                        <p className="mt-1 text-sm text-slate-500">{material.examSession ?? 'Study resource'}</p>
                      </div>
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
                          href={getStudyMaterialDownloadUrl(material)}
                          download={getStudyMaterialFileName(material)}
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
            <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden border-0 bg-slate-950 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white shadow-2xl sm:h-[82dvh] sm:min-h-[480px] sm:max-h-[900px] sm:w-[calc(100%-2rem)] sm:max-w-4xl sm:rounded-3xl sm:pt-0 sm:pb-0">
              {previewMaterial && (
                <>
                  <DialogHeader className="shrink-0 space-y-1 px-4 py-3 pr-14 text-left sm:px-6 sm:py-5">
                    <DialogTitle className="text-base font-bold leading-snug text-white sm:text-xl">{previewMaterial.title}</DialogTitle>
                    <DialogDescription className="text-xs text-slate-300 sm:text-sm">
                      {previewMaterial.pages ? `Free PDF preview · Page 1 of ${previewMaterial.pages}` : 'Free PDF preview'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 flex-1 bg-slate-800 p-2 sm:px-8 sm:pb-5">
                    <iframe
                      src={`${previewMaterial.file}#page=1&view=FitH`}
                      title={`${previewMaterial.title} PDF preview`}
                      className="h-full min-h-0 w-full rounded-xl border border-white/10 bg-white sm:rounded-2xl"
                    />
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 bg-slate-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <span className="text-xs text-slate-300 sm:text-sm">
                      {previewMaterial.pages ? `${previewMaterial.pages} pages · Scroll in the viewer to read` : 'Scroll in the viewer to read'}
                    </span>
                    <a
                      href={getStudyMaterialDownloadUrl(previewMaterial)}
                      download={getStudyMaterialFileName(previewMaterial)}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-200 sm:w-auto"
                    >
                      Download PDF
                    </a>
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
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 md:mb-4">Explore the Available Study Library</h3>
            <p className="text-white/90 text-sm sm:text-base mb-5 md:mb-6 px-2">
              Browse the available Mathematics and Science resources by subject, grade and topic. Resource prices and access options are shown with each item.
            </p>
            <a href="/study-materials">
              <Button className="w-full sm:w-auto bg-white text-[#7949fe] hover:bg-gray-100 px-6 sm:px-10 py-4 sm:py-6 rounded-full text-sm sm:text-base md:text-lg font-bold">
                Explore All Study Materials
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
              </Button>
            </a>
          </motion.div>
        </div>
      </section>

      <section id="pricing" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeading subtitle="Tutoring Options" title="Find a Tutoring Option That Fits Your Needs" />
          <p className="mx-auto -mt-8 max-w-3xl text-center leading-7 text-gray-600">
            Tutoring requirements vary by grade, subject selection and delivery format. Explore the available programmes and fees, then contact us to confirm the subjects, timetable and package that best fit your needs.
          </p>
          <p className="mx-auto mt-4 max-w-3xl text-center leading-7 text-gray-600">
            Before enrolling, confirm what your selected package includes, the scheduled lesson frequency, the delivery mode, the billing terms and the current availability.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <a href="/pricing" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#7949fe] px-7 py-3 font-bold text-white transition-colors hover:bg-[#5a4ecf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7949fe]">
              View Tutoring Fees
            </a>
            <a href="/services" className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-[#7949fe] px-7 py-3 font-bold text-[#7949fe] transition-colors hover:bg-[#7949fe]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7949fe]">
              Explore Tutoring Options
            </a>
          </div>
        </div>
      </section>

      <section id="why-viva" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeading subtitle="Why Viva Tutorials" title="Support Built Around the Learner" />
          <p className="mx-auto -mt-8 mb-12 max-w-3xl text-center leading-7 text-gray-600">
            Viva Tutorials focuses on helping learners strengthen their understanding, practise important concepts and approach their academic work with a clearer plan.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: 'CAPS-Aligned Support',
                description: 'Learning support organised around the relevant South African school curriculum and grade-level requirements.',
              },
              {
                title: 'Online and In-Person Options',
                description: 'Choose online tutoring or enquire about face-to-face lessons in Mfuleni, Cape Town.',
              },
              {
                title: 'Focused Practice',
                description: 'Work through examples and questions to improve understanding and identify topics that need further attention.',
              },
              {
                title: 'A Clear Learning Process',
                description: 'Where provided by the selected programme, assessments and feedback help learners and parents understand what has been covered and what needs more practice.',
              },
            ].map((item) => (
              <article key={item.title} className="rounded-3xl border-2 border-[#7949fe]/30 bg-white p-6">
                <Check className="mb-4 h-7 w-7 text-[#7949fe]" aria-hidden="true" />
                <h3 className="mb-3 text-lg font-bold text-gray-900">{item.title}</h3>
                <p className="leading-7 text-gray-600">{item.description}</p>
              </article>
            ))}
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
            className="relative mx-auto max-w-5xl"
          >
            <div className="columns-1 gap-5 sm:columns-2 sm:gap-6 lg:columns-3 lg:gap-7">
              {communityImages.map((image, index) => (
                <motion.figure
                  key={image.src}
                  whileHover={{ y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="group mb-5 break-inside-avoid overflow-hidden rounded-2xl border-2 border-[#7949fe]/10 bg-white p-2 shadow-lg sm:mb-6 lg:mb-7"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCommunityImage(image)}
                    aria-label={`Open larger view of ${image.alt}`}
                    className="block w-full cursor-zoom-in overflow-hidden rounded-xl bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#7949fe]/30"
                  >
                    <img
                      loading="lazy"
                      decoding="async"
                      src={image.src}
                      alt={image.alt}
                      sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                      className="block h-auto w-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </button>
                </motion.figure>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <Dialog open={Boolean(selectedCommunityImage)} onOpenChange={(open) => !open && setSelectedCommunityImage(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl border-0 bg-[#1a0b2e] p-3 text-white shadow-2xl sm:rounded-3xl sm:p-5">
          {selectedCommunityImage && (
            <>
              <DialogHeader className="px-2 pb-3 pt-2 text-left sm:px-3">
                <DialogTitle className="text-lg font-bold text-white">Learning in Action</DialogTitle>
                <DialogDescription className="text-white/70">{selectedCommunityImage.alt}</DialogDescription>
              </DialogHeader>
              <div className="flex max-h-[78vh] items-center justify-center overflow-hidden rounded-2xl bg-black/20">
                <img
                  src={selectedCommunityImage.src}
                  alt={selectedCommunityImage.alt}
                  className="max-h-[78vh] w-full object-contain"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <section id="faq" className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeading subtitle="Frequently Asked Questions" title="Questions About Viva Tutorials" />
          <div className="space-y-7">
            {[
              {
                question: 'Do you offer online and in-person lessons?',
                answer: 'Yes. Viva Tutorials offers both online and in-person tutoring. In-person lessons are associated with Mfuleni, Cape Town, while online lessons allow learners to receive support remotely. Contact us to confirm the current timetable and available options for your subjects.',
              },
              {
                question: 'Which grades does Viva Tutorials support?',
                answer: 'Viva Tutorials provides academic support for Grades 8–12, as well as matric rewrite learners, in the subjects offered by the programme.',
              },
              {
                question: 'Which subjects can I get help with?',
                answer: 'The core subjects include Mathematics and Natural Sciences for Grades 8–9, and Mathematics, Mathematical Literacy, Physical Sciences and Life Sciences for Grades 10–12 and relevant matric rewrite programmes. Subject availability should be confirmed before enrolment.',
              },
              {
                question: 'Is the tutoring aligned with CAPS?',
                answer: 'The learning support is designed around the relevant South African CAPS curriculum and grade-level subject requirements.',
              },
              {
                question: 'Can I choose online lessons for one subject and in-person lessons for another?',
                answer: 'Ask us about combining delivery modes across subjects. Arrangements depend on the available timetable, subject and programme.',
              },
              {
                question: 'How does the enrolment process work?',
                answer: "Start by completing the enquiry or enrolment process. Provide the learner's grade, selected subjects and learning needs so that the appropriate programme and available timetable can be discussed. Any diagnostic assessment or further onboarding steps will be explained as part of the applicable programme.",
              },
              {
                question: 'Do you provide study materials?',
                answer: 'Available study resources can be explored through the Study Materials section of the website. The library may include notes, revision resources and practice questions. Resource availability and any associated charges are shown with the relevant material.',
              },
              {
                question: 'How do I find out about fees?',
                answer: 'Visit the Pricing page or contact Viva Tutorials for the current fees, package inclusions, lesson frequency and available delivery options before enrolling.',
              },
              {
                question: 'How do parents find out about learner progress?',
                answer: 'Progress communication depends on the learner’s programme and the assessment and feedback processes available. Ask about the reporting and feedback arrangements before enrolment.',
              },
            ].map(({ question, answer }) => (
              <article key={question} className="border-b border-gray-200 pb-6">
                <h3 className="text-lg font-bold text-gray-900">{question}</h3>
                <p className="mt-2 leading-7 text-gray-600">{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-[#7949fe]/20 via-transparent to-[#ff7849]/20" aria-hidden="true" />
          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">Let&apos;s Plan the Learner&apos;s Next Step</h2>
            <p className="text-white/80 text-lg md:text-xl max-w-3xl mx-auto mb-5">
              Whether the learner needs help strengthening foundational concepts, preparing for school assessments or revising matric subjects, Viva Tutorials offers online and in-person tutoring options designed to support the learning process.
            </p>
            <p className="text-white/80 text-base md:text-lg max-w-3xl mx-auto mb-10">
              Tell us the learner&apos;s grade, subjects and goals. We can then discuss suitable support options and the currently available timetable.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button asChild className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">
                <a href="/contact">Enquire About Tutoring</a>
              </Button>
              <Button asChild variant="outline" className="border-white/20 text-white hover:bg-white/10 py-6 px-10 rounded-full text-lg font-bold">
                <a href="/study-materials">Explore Study Materials</a>
              </Button>
            </div>
            <p className="mt-8 text-sm text-white/75">
              Questions about subjects, fees or lesson availability?{' '}
              <a href="/contact" className="font-bold text-white underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                Contact Viva Tutorials using the details on our contact page.
              </a>
            </p>
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
