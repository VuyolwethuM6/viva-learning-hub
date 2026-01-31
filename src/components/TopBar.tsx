import { Phone, Mail, MapPin } from 'lucide-react';
import { FaFacebook, FaYoutube, FaTiktok } from 'react-icons/fa';

const TopBar = () => (
  <div className="fixed top-0 left-0 right-0 z-50 bg-[#1a0b2e] text-white py-2.5 text-xs font-medium border-b border-white/10">
    <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">

      {/* Left section */}
      <div className="flex items-center gap-3 lg:gap-6 overflow-x-auto">
        <a
          href="tel:+2773913206"
          className="flex items-center gap-2 hover:text-[#ff7849] transition-colors cursor-pointer whitespace-nowrap"
        >
          <Phone className="w-3.5 h-3.5 animate-[wiggle_1s_ease-in-out_infinite]" />
          <span className="hidden sm:inline">(+27) 73 913 206</span>
        </a>

        <a
          href="mailto:info@vivatutorials.co.za"
          className="flex items-center gap-2 hover:text-[#ff7849] transition-colors cursor-pointer whitespace-nowrap hidden sm:flex"
        >
          <Mail className="w-3.5 h-3.5" />
          info@vivatutorials.co.za
        </a>

        <span className="flex items-center gap-2 hover:text-[#ff7849] transition-colors cursor-pointer whitespace-nowrap hidden md:flex">
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
            aria-label="Facebook"
          >
            <FaFacebook className="w-3.5 h-3.5 hover:text-[#ff7849] transition-colors cursor-pointer" />
          </a>

          <a
            href="https://www.youtube.com/@viva-tutorials"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="YouTube"
          >
            <FaYoutube className="w-3.5 h-3.5 hover:text-[#ff7849] transition-colors cursor-pointer" />
          </a>

          <a
            href="https://www.tiktok.com/@viva.coach.vuyo?_r=1&_t=ZS-93WzVp1UbQe"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TikTok"
          >
            <FaTiktok className="w-3.5 h-3.5 hover:text-[#ff7849] transition-colors cursor-pointer" />
          </a>
        </div>
      </div>

    </div>
  </div>
);

export default TopBar;
