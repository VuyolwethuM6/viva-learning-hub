import { Phone, Mail, MapPin } from 'lucide-react';
import { FaFacebook, FaYoutube, FaTiktok } from 'react-icons/fa';

const TopBar = () => (
  <div className="fixed top-0 left-0 right-0 z-50 bg-[#1a0b2e] text-white py-2.5 text-xs font-medium border-b border-white/10">
    <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
      <div className="flex items-center gap-3 lg:gap-6 overflow-x-auto">
        <span className="flex items-center gap-2 hover:text-[#ff7849] transition-colors cursor-pointer whitespace-nowrap">
          <Phone className="w-3.5 h-3.5 animate-[wiggle_1s_ease-in-out_infinite]" /> <span className="hidden sm:inline">+27 (0) 123 456 789</span>
        </span>
        <span className="flex items-center gap-2 hover:text-[#ff7849] transition-colors cursor-pointer whitespace-nowrap hidden sm:flex">
          <Mail className="w-3.5 h-3.5" /> info@vivatutorials.com
        </span>
        <span className="flex items-center gap-2 hover:text-[#ff7849] transition-colors cursor-pointer whitespace-nowrap hidden md:flex">
          <MapPin className="w-3.5 h-3.5" /> Cape Town, South Africa
        </span>
      </div>
      <div className="flex items-center gap-2 lg:gap-4">
        <span className="text-white/60 hidden lg:inline">Follow Us:</span>
        <div className="flex items-center gap-3">
          <FaFacebook className="w-3.5 h-3.5 hover:text-[#ff7849] cursor-pointer transition-colors" />
          <FaYoutube className="w-3.5 h-3.5 hover:text-[#ff7849] cursor-pointer transition-colors" />
          <FaTiktok className="w-3.5 h-3.5 hover:text-[#ff7849] cursor-pointer transition-colors hidden sm:block" />
        </div>
      </div>
    </div>
  </div>
);

export default TopBar;
