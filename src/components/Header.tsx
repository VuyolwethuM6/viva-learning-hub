import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, MapPin, Menu, Phone, X } from "lucide-react";
import { FaFacebook, FaTiktok, FaYoutube } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/WhatsAppButton";

const navItems = [
  { label: "Home", path: "/" },
  { label: "About", path: "/about" },
  { label: "Study Materials", path: "/study-materials" },
  { label: "Services", path: "/services" },
  { label: "Pricing", path: "/pricing" },
];

const socialLinks = [
  {
    icon: FaFacebook,
    url: "https://web.facebook.com/profile.php?id=61586724797551",
    label: "Facebook",
  },
  {
    icon: FaTiktok,
    url: "https://www.tiktok.com/@viva.coach.vuyo?_r=1&_t=ZS-93WzVp1UbQe",
    label: "TikTok",
  },
  {
    icon: FaYoutube,
    url: "https://www.youtube.com/@viva-tutorials",
    label: "YouTube",
  },
];

export const TopBar = () => (
  <div className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#1a0b2e] py-2.5 text-xs font-medium text-white">
    <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
      <div className="flex items-center gap-3 overflow-x-auto lg:gap-6">
        <a
          href="tel:+27733913206"
          aria-label="Call Viva Tutorials"
          className="flex cursor-pointer items-center gap-2 whitespace-nowrap transition-colors hover:text-[#ff7849]"
        >
          <Phone className="h-3.5 w-3.5 animate-[wiggle_1s_ease-in-out_infinite]" />
          <span className="hidden sm:inline">(+27) 73 391 3206</span>
        </a>
        <a
          href="mailto:info@vivatutorials.co.za"
          className="hidden items-center gap-2 whitespace-nowrap transition-colors hover:text-[#ff7849] sm:flex"
        >
          <Mail className="h-3.5 w-3.5" />
          info@vivatutorials.co.za
        </a>
        <span className="hidden cursor-pointer items-center gap-2 whitespace-nowrap transition-colors hover:text-[#ff7849] md:flex">
          <MapPin className="h-3.5 w-3.5" />
          Mfuleni, Cape Town, South Africa
        </span>
      </div>

      <div className="flex items-center gap-2 lg:gap-4">
        <a
          href="/parent"
          className="font-semibold text-white hover:text-[#ff7849]"
        >
          Parent Portal
        </a>
        <span className="hidden text-white/60 xl:inline">Follow Us:</span>
        <div className="flex items-center gap-3">
          {socialLinks.map(({ icon: Icon, url, label }) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
            >
              <Icon className="h-3.5 w-3.5 cursor-pointer transition-colors hover:text-[#ff7849]" />
            </a>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const StickyHeader = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        mobileMenuButtonRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleMenuKeyDown);
    return () => window.removeEventListener("keydown", handleMenuKeyDown);
  }, [isMobileMenuOpen]);

  return (
    <>
      <header
        className={`fixed left-0 right-0 top-[37px] z-40 border-b transition-all duration-300 ${
          isScrolled
            ? "border-gray-100 bg-white/95 py-3 shadow-lg backdrop-blur-md"
            : "border-transparent bg-white py-5"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6">
          <a href="/" className="flex items-center gap-2">
            <img
              src="/viva-tutorials-logo.png"
              alt="Viva Tutorials Logo"
              className="h-10 w-auto"
            />
          </a>

          <nav className="hidden items-center gap-4 text-sm font-medium text-gray-600 lg:flex xl:gap-8">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.path}
                className="group relative py-2 transition-colors hover:text-[#7949fe]"
              >
                {item.label}
                <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-[#7949fe] transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
            <WhatsAppButton />
          </nav>

          <div className="hidden items-center gap-4 lg:flex">
            <a
              href="https://calendar.app.google/k1hbyKuD97U5g1Vf7"
              className="hidden text-sm font-semibold text-[#7949fe] hover:underline xl:inline"
            >
              Book A Session
            </a>
            <a href="/enroll">
              <Button className="rounded-full bg-[#7949fe] px-6 text-white shadow-lg transition-all duration-300 hover:bg-[#5a4ecf] hover:shadow-[#7949fe]/20">
                Enroll Now!
              </Button>
            </a>
          </div>

          <button
            ref={mobileMenuButtonRef}
            type="button"
            className="p-2 text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7949fe] lg:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={
              isMobileMenuOpen
                ? "Close navigation menu"
                : "Open navigation menu"
            }
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation"
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 lg:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.div
              id="mobile-navigation"
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.3 }}
              className="fixed bottom-0 right-0 top-0 z-50 w-[80%] max-w-sm overflow-y-auto bg-white shadow-2xl lg:hidden"
            >
              <div className="p-6">
                <div className="mb-8 flex items-center justify-between">
                  <a href="/" className="flex items-center gap-2">
                    <img
                      src="/viva-tutorials-logo.png"
                      alt="Viva Logo"
                      className="h-12 w-12 object-contain"
                    />
                  </a>
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="rounded-full p-2 hover:bg-gray-100"
                    aria-label="Close navigation menu"
                  >
                    <X className="h-6 w-6 text-gray-600" />
                  </button>
                </div>

                <nav className="flex flex-col gap-2">
                  {navItems.map((item) => (
                    <a
                      key={item.label}
                      href={item.path}
                      className="rounded-lg px-4 py-4 text-lg font-semibold text-gray-800 transition-colors hover:bg-[#7949fe]/10"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {item.label}
                    </a>
                  ))}
                  <WhatsAppButton onClick={() => setIsMobileMenuOpen(false)} />
                </nav>

                <div className="mt-8 space-y-4 border-t border-gray-200 pt-8">
                  <a href="/enroll" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button className="w-full rounded-full bg-[#7949fe] py-6 text-lg hover:bg-[#5a4ecf]">
                      Enroll Now
                    </Button>
                  </a>
                  <a
                    href="https://calendar.app.google/k1hbyKuD97U5g1Vf7"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Button
                      variant="outline"
                      className="mt-4 w-full rounded-full border-2 border-gray-200 py-6 text-lg"
                    >
                      Book a Session
                    </Button>
                  </a>
                </div>

                <div className="mt-8 border-t border-gray-200 pt-8">
                  <p className="mb-4 text-sm font-semibold text-gray-500">
                    Follow Us
                  </p>
                  <div className="flex gap-4">
                    {socialLinks.map(({ icon: Icon, url, label }) => (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={label}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7949fe]/10 text-[#7949fe] transition-all hover:bg-[#7949fe] hover:text-white"
                      >
                        <Icon className="h-5 w-5" />
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
