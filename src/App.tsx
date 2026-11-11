import { RecruitmentPrivacyBoundary } from "./components/RecruitmentPrivacyBoundary";
import { VivaLoader } from "@/components/VivaLoader";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, MemoryRouter, Routes, Route } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { lazy, Suspense } from "react";
import { HelmetProvider } from "react-helmet-async";
import RouteMetadata from "./components/RouteMetadata";
import Analytics from "./components/Analytics";
import { WhatsAppRedirect } from "./components/WhatsAppRedirect";

const Student = lazy(() => import("./pages/Student"));
const Tutor = lazy(() => import("./pages/Tutor"));
const Parent = lazy(() => import("./pages/Parent"));
const Admin = lazy(() => import("./pages/Admin"));
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const About = lazy(() => import("./pages/About"));
const RecruitmentApplicant = lazy(() => import("./pages/RecruitmentApplicant"));
const RecruitmentAdmin = lazy(() => import("./pages/RecruitmentAdmin"));
const Careers = lazy(() => import("./pages/Careers"));
const VacancyDetail = lazy(() => import("./pages/VacancyDetail"));
const Services = lazy(() => import("./pages/Services"));
const Pricing = lazy(() => import("./pages/Pricing"));

const Enrollment = lazy(() => import("./pages/Enrollment"));
const OurTutors = lazy(() => import("./pages/OurTutors"));
const SuccessStories = lazy(() => import("./pages/SuccessStories"));
const Mathematics = lazy(() => import("./pages/Mathematics"));
const PhysicalScience = lazy(() => import("./pages/PhysicalScience"));
const LifeSciences = lazy(() => import("./pages/LifeSciences"));
const Accounting = lazy(() => import("./pages/Accounting"));
const Geography = lazy(() => import("./pages/Geography"));
const InformationTechnology = lazy(
  () => import("./pages/InformationTechnology"),
);
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const StudyMaterials = lazy(() => import("./pages/StudyMaterials"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCancelled = lazy(() => import("./pages/PaymentCancelled"));

const queryClient = new QueryClient();

type AppProps = {
  staticLocation?: string;
  helmetContext?: object;
};

const App = ({ staticLocation, helmetContext }: AppProps = {}) => {
  const content = (
    <MotionConfig reducedMotion="user">
      <a
        href="#main-content"
        className="sr-only z-[100] bg-white px-4 py-3 text-[#1a0b2e] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-md focus:shadow-lg"
        onClick={(event) => {
          const target =
            document.querySelector<HTMLElement>("main") ??
            document.querySelector<HTMLElement>("h1");
          if (target) {
            target.id = "main-content";
            target.tabIndex = -1;
          } else {
            event.preventDefault();
          }
        }}
      >
        Skip to main content
      </a>
      <RouteMetadata />
      <Analytics />
      <Suspense fallback={<VivaLoader size="page" label="Loading page…" />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/about" element={<About />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/careers/:slug" element={<VacancyDetail />} />
          <Route path="/services" element={<Services />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/contact" element={<WhatsAppRedirect />} />
          <Route path="/enroll" element={<Enrollment />} />
          <Route path="/admin" element={<Admin />} />
          <Route
            path="/recruitment/*"
            element={
              <RecruitmentPrivacyBoundary>
                <RecruitmentApplicant />
              </RecruitmentPrivacyBoundary>
            }
          />
          <Route
            path="/recruitment/apply/:slug"
            element={
              <RecruitmentPrivacyBoundary>
                <RecruitmentApplicant />
              </RecruitmentPrivacyBoundary>
            }
          />
          <Route
            path="/admin/recruitment"
            element={
              <RecruitmentPrivacyBoundary>
                <RecruitmentAdmin />
              </RecruitmentPrivacyBoundary>
            }
          />
          <Route
            path="/admin/recruitment/deployment"
            element={
              <RecruitmentPrivacyBoundary>
                <RecruitmentAdmin />
              </RecruitmentPrivacyBoundary>
            }
          />
          <Route path="/parent" element={<Parent />} />
          <Route path="/student" element={<Student />} />
          <Route path="/tutor" element={<Tutor />} />
          <Route path="/tutors" element={<OurTutors />} />
          <Route path="/success-stories" element={<SuccessStories />} />
          <Route path="/mathematics" element={<Mathematics />} />
          <Route path="/physical-science" element={<PhysicalScience />} />
          <Route path="/life-sciences" element={<LifeSciences />} />
          <Route path="/accounting" element={<Accounting />} />
          <Route path="/geography" element={<Geography />} />
          <Route
            path="/information-technology"
            element={<InformationTechnology />}
          />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/study-materials" element={<StudyMaterials />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/payment-cancelled" element={<PaymentCancelled />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </MotionConfig>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <HelmetProvider context={helmetContext}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {staticLocation ? (
            <MemoryRouter initialEntries={[staticLocation]}>
              {content}
            </MemoryRouter>
          ) : (
            <BrowserRouter>{content}</BrowserRouter>
          )}
        </TooltipProvider>
      </HelmetProvider>
    </QueryClientProvider>
  );
};

export default App;
