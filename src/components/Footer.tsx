import { WhatsAppButton } from "@/components/WhatsAppButton";
import { whatsappHref } from "@/lib/whatsapp";
import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Phone, Mail, Facebook, Twitter, Linkedin, Youtube, ArrowUp } from 'lucide-react';

export default function Footer() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const footerLinks: Record<string, { name: string; href?: string; message?: string }[]> = {
    services: [
      { name: "In-Person Tutoring", href: "/services" },
      { name: "Mobile Learning", href: "/services" },
      { name: "Mentor Support", href: "/services" },
      { name: "Exam Prep", href: "/services" },
      { name: "Holiday Classes", message: "Hello Viva Tutorials, I would like assistance with holiday classes." }
    ],
    subjects: [
      { name: "Mathematics", href: "/mathematics" },
      { name: "Physical Sciences", href: "/physical-science" },
      { name: "Life Sciences", href: "/life-sciences" },
      { name: "Accounting", href: "/accounting" },
      { name: "Economics", message: "Hello Viva Tutorials, I would like assistance with economics." }
    ],
    company: [
      { name: "About Us", href: "/about" },
      { name: "Our Tutors", href: "/tutors" },
      { name: "Locations", message: "Hello Viva Tutorials, I would like assistance with locations." },
      { name: "Success Stories", href: "/success-stories" },
      { name: "Careers", href: "/careers" }
    ]
  };

  const locations = [
    "Mfuleni, Cape Town",
    "Online Around South Africa",
  ];

  const socials = [
    { icon: Facebook, href: "https://web.facebook.com/profile.php?id=61586724797551", label: "Facebook" },
    { icon: Twitter, href: "https://twitter.com/vuyolwethu", label: "Twitter" },
    { icon: Linkedin, href: "https://www.linkedin.com/in/vuyolwethu", label: "LinkedIn" },
    { icon: Youtube, href: "https://www.youtube.com/@viva-tutorials", label: "YouTube" }
  ];

  return (
    <footer className="relative bg-slate-900 text-white overflow-hidden">
      {/* Background Pattern */}
    <div className="absolute inset-0 opacity-5">
      <div className="absolute inset-0" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231a0b2e' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />
    </div>

      {/* Main Footer Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 mb-12">
          {/* Brand Column */}
          <div className="col-span-2 lg:col-span-2">
            <div className="mb-6">
              <h3 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                Viva Tutorials
              </h3>
              <p className="text-slate-400 mt-2">STEM Education Center</p>
            </div>
            <p className="text-slate-400 mb-6 leading-relaxed">
              Empowering Grade 8-12 learners across South Africa with personalized STEM tutoring 
              and innovative mobile learning solutions.
            </p>
            
            {/* Contact Info */}
            <div className="space-y-3">
              <WhatsAppButton />
              <div className="flex items-center gap-3 text-slate-400">
                <Phone className="w-4 h-4 text-violet-400" />
                <a href="tel:+27733913206" className="hover:text-white">+27 73 391 3206</a>
              </div>
              <div className="flex items-center gap-3 text-slate-400">
                <Mail className="w-4 h-4 text-violet-400" />
                <a href="mailto:info@vivatutorials.co.za" className="hover:text-white">info@vivatutorials.co.za</a>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex gap-3 mt-6">
              {socials.map((social, index) => (
                <motion.a
                  key={index}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ y: -3 }}
                  className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-violet-600 flex items-center justify-center transition-colors duration-300"
                  aria-label={social.label}
                >
                  <social.icon className="w-5 h-5" />
                </motion.a>
              ))}
            </div>
          </div>

          {/* Links Columns */}
          <div>
            <h4 className="font-bold text-white mb-4">Services</h4>
            <ul className="space-y-3">
              {footerLinks.services.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.message ? whatsappHref(link.message) : link.href}
                    target={link.message ? "_blank" : undefined}
                    rel={link.message ? "noopener noreferrer" : undefined}
                    className="text-slate-400 hover:text-violet-400 transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4">Subjects</h4>
            <ul className="space-y-3">
              {footerLinks.subjects.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.message ? whatsappHref(link.message) : link.href}
                    target={link.message ? "_blank" : undefined}
                    rel={link.message ? "noopener noreferrer" : undefined}
                    className="text-slate-400 hover:text-violet-400 transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.message ? whatsappHref(link.message) : link.href}
                    target={link.message ? "_blank" : undefined}
                    rel={link.message ? "noopener noreferrer" : undefined}
                    className="text-slate-400 hover:text-violet-400 transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-4">Locations</h4>
            <ul className="space-y-3">
              {locations.map((location, index) => (
                <li key={index} className="flex items-start gap-2 text-slate-400">
                  <MapPin className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                  <span>{location}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-sm">
            © {new Date().getFullYear()} Viva Tutorial Services. All rights reserved.
          </p>
          
          <div className="flex items-center gap-6">
            <a href="/privacy-policy" className="text-slate-500 hover:text-violet-400 text-sm transition-colors">
              Privacy Policy
            </a>
            <a href="/terms-of-service" className="text-slate-500 hover:text-violet-400 text-sm transition-colors">
              Terms of Service
            </a>
          </div>

          {/* Scroll to Top */}
          <motion.button
            onClick={scrollToTop}
            aria-label="Scroll to top"
            whileHover={{ y: -3 }}
            className="w-10 h-10 rounded-lg bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition-colors duration-300"
          >
            <ArrowUp className="w-5 h-5" />
          </motion.button>
        </div>
      </div>
    </footer>
  );
}
