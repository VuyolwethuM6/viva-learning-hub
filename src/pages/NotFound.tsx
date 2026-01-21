import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Home, Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      {/* Animated background gradient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-96 h-96 rounded-full blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          style={{ top: "-10%", left: "-5%", backgroundColor: "rgba(108, 92, 231, 0.1)" }}
        />
        <motion.div
          className="absolute w-96 h-96 rounded-full blur-3xl"
          animate={{
            x: [0, -100, 0],
            y: [0, 100, 0],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          style={{ bottom: "-10%", right: "-5%", backgroundColor: "rgba(255, 122, 69, 0.1)" }}
        />
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 text-center max-w-2xl mx-auto"
      >
        {/* 404 Number with animation */}
        <motion.div
          className="mb-8"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <h1 className="text-8xl md:text-9xl font-black bg-gradient-to-r from-[#7949fe] to-[#ff7849] bg-clip-text text-transparent drop-shadow-lg">
            404
          </h1>
        </motion.div>

        {/* Main message */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="mb-4"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-[#7949fe] mb-4">
            Page Not Found
          </h2>
          <p className="text-base md:text-lg text-gray-700 mb-2">
            Oops! It looks like you've wandered off the learning path.
          </p>
          <p className="text-sm md:text-base text-gray-500">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </motion.div>

        {/* Requested path display */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="my-8 px-4 py-3 bg-gray-50 backdrop-blur-md rounded-lg border border-[#7949fe]/20 inline-block"
        >
          <p className="text-gray-600 text-sm flex items-center justify-center gap-2">
            <Search className="w-4 h-4" />
            <span className="font-mono text-gray-700">{location.pathname}</span>
          </p>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mt-12"
        >
          <a href="/">
            <Button
              size="lg"
              className="bg-[#7949fe] hover:bg-[#5a4ecf] text-white font-semibold rounded-lg group w-full sm:w-auto"
            >
              <Home className="w-4 h-4 mr-2" />
              Return Home
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </a>
          <a href="/">
            <Button
              size="lg"
              className="border-2 border-[#ff7849] text-[#ff7849] hover:bg-[#ff7849]/10 font-semibold rounded-lg w-full sm:w-auto bg-white"
            >
              Continue Learning
            </Button>
          </a>
        </motion.div>

        {/* Help text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="mt-12 text-gray-500 text-sm"
        >
          Need help? Contact us at <span className="text-[#ff7849] font-semibold">info@vivatutorials.com</span>
        </motion.p>
      </motion.div>
    </div>
  );
};

export default NotFound;
