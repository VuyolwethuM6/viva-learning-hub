import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import About from "./pages/About";
import Services from "./pages/Services";
import Pricing from "./pages/Pricing";
import Contact from "./pages/Contact";
import OurTutors from "./pages/OurTutors";
import SuccessStories from "./pages/SuccessStories";
import Mathematics from "./pages/Mathematics";
import PhysicalScience from "./pages/PhysicalScience";
import LifeSciences from "./pages/LifeSciences";
import Accounting from "./pages/Accounting";
import Geography from "./pages/Geography";
import InformationTechnology from "./pages/InformationTechnology";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/about" element={<About />} />
          <Route path="/services" element={<Services />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/tutors" element={<OurTutors />} />
          <Route path="/success-stories" element={<SuccessStories />} />
          <Route path="/mathematics" element={<Mathematics />} />
          <Route path="/physical-science" element={<PhysicalScience />} />
          <Route path="/life-sciences" element={<LifeSciences />} />
          <Route path="/accounting" element={<Accounting />} />
          <Route path="/geography" element={<Geography />} />
          <Route path="/information-technology" element={<InformationTechnology />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
