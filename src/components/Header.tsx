import { Mail, MapPin, Menu, Phone, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FaFacebook, FaTiktok, FaYoutube } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";

export const TopBar = () => (
  <div className="fixed top-0 left-0 right-0 z-50 bg-[#1a0b2e] text-white py-2.5 text-xs font-medium border-b border-white/10">
    <div className="max-w-7xl mx-auto px-6 flex justify-between items-center gap-4">
      <div className="flex items-center gap-4 lg:gap-6">
        <a href="tel:+27733913206" className="inline-flex items-center gap-2 whitespace-nowrap hover:text-[#ff7849]" aria-label="Call Viva Tutorials at +27 73 391 3206">
          <Phone className="h-3.5 w-3.5" />
          <span>+27 73 391 3206</span>
        </a>
        <a href="mailto:info@vivatutorials.co.za" className="hidden items-center gap-2 whitespace-nowrap hover:text-[#ff7849] sm:inline-flex">
          <Mail className="h-3.5 w-3.5" />
          info@vivatutorials.co.za
        </a>
        <span className="hidden items-center gap-2 whitespace-nowrap md:inline-flex">
          <MapPin className="h-3.5 w-3.5" />
          Cape Town, South Africa
        </span>
      </div>
      <div className="hidden items-center gap-3 sm:flex">
        <a href="https://web.facebook.com/profile.php?id=61586724797551" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          <FaFacebook aria-hidden="true" />
        </a>
        <a href="https://www.youtube.com/@viva-tutorials" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
          <FaYoutube aria-hidden="true" />
        </a>
        <a href="https://www.tiktok.com/@viva.coach.vuyo" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
          <FaTiktok aria-hidden="true" />
        </a>
      </div>
    </div>
  </div>
);

export const StickyHeader = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header 
        className={`fixed top-[37px] left-0 right-0 z-40 transition-all duration-300 border-b ${
          isScrolled ? 'bg-white/95 backdrop-blur-md shadow-lg py-3 border-gray-100' : 'bg-white py-5 border-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-[#7949fe] to-[#ff7849] rounded-lg flex items-center justify-center text-white">
              <span className="text-lg font-bold font-mono">V</span>
            </div>
            <span className="text-lg font-extrabold text-[#1a0b2e]">Viva<span className="text-[#ff7849]">.</span></span>
          </a>

          <nav className="hidden lg:flex items-center gap-8 font-medium text-sm text-gray-600">
            {[
              { label: 'Home', path: '/' },
              { label: 'About', path: '/about' },
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
            <a href="/contact">
              <Button className="bg-[#7949fe] hover:bg-[#5a4ecf] text-white rounded-full px-6 transition-all duration-300 shadow-lg hover:shadow-[#7949fe]/20">
                Book a Tutor
              </Button>
            </a>
          </div>

          <button 
            className="lg:hidden p-2 text-gray-600"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileMenuOpen}
            aria-controls="legacy-mobile-navigation"
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/50 z-50"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              id="legacy-mobile-navigation"
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
                    aria-label="Close navigation menu"
                  >
                    <X className="w-6 h-6 text-gray-600" />
                  </button>
                </div>

                <nav className="flex flex-col gap-2">
                  {[
                    { label: 'Home', path: '/' },
                    { label: 'About', path: '/about' },
                    { label: 'Study Materials', path: '/study-materials' },
                    { label: 'Services', path: '/services' },
                    { label: 'Pricing', path: '/pricing' },
                    { label: 'Contact', path: '/contact' }
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

                <div className="mt-8 border-t border-gray-200 pt-8">
                  <a href="/contact">
                    <Button className="w-full bg-[#7949fe] hover:bg-[#5a4ecf] py-6 rounded-full text-lg">
                      Book a Tutor
                    </Button>
                  </a>
                </div>

                <div className="mt-8 pt-8 border-t border-gray-200">
                  <p className="text-sm font-semibold text-gray-500 mb-4">Follow Us</p>
                  <div className="flex gap-4">
                    {[
                      { Icon: FaFacebook, url: "https://web.facebook.com/profile.php?id=61586724797551", label: "Facebook" },
                      { Icon: FaTiktok, url: "https://www.tiktok.com/@viva.coach.vuyo", label: "TikTok" },
                      { Icon: FaYoutube, url: "https://www.youtube.com/@viva-tutorials", label: "YouTube" },
                    ].map(({ Icon, url, label }) => (
                      <a key={label} href={url} target="_blank" rel="noopener noreferrer" aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7949fe]/10 text-[#7949fe] transition-all hover:bg-[#7949fe] hover:text-white">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
