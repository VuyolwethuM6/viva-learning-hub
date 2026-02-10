import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SyllabusModal = ({ isOpen, onClose, subject }) => {
  if (!isOpen || !subject) return null;

  const syllabusContent = {
    Mathematics: {
      grade: "Grade 8-12",
      description: "Pure Mathematics covers algebra, calculus, trigonometry, and statistics",
      topics: [
        "Algebra & Equations",
        "Functions & Relations",
        "Calculus (Limits, Derivatives, Integration)",
        "Trigonometry",
        "Statistics & Probability",
        "Number Patterns & Sequences"
      ],
      duration: "2-3 months per topic",
      resources: ["Video lessons", "Practice worksheets", "Past exam papers", "Interactive simulations"]
    },
    "Physical Sciences": {
      grade: "Grade 8-12",
      description: "Physics and Chemistry integrated curriculum covering mechanics, waves, thermodynamics, and chemical reactions",
      topics: [
        "Mechanics & Motion",
        "Energy & Waves",
        "Electricity & Magnetism",
        "Atomic Structure & The Periodic Table",
        "Chemical Bonding & Reactions",
        "Stoichiometry & Equilibrium"
      ],
      duration: "2-4 weeks per topic",
      resources: ["Lab practicals", "Demonstration videos", "Formula sheets", "Past papers with solutions"]
    },
    "Life Sciences": {
      grade: "Grade 8-12",
      description: "Biology and Life Sciences covering genetics, ecology, human biology, and evolution",
      topics: [
        "Cell Structure & Function",
        "Genetics & Heredity",
        "Photosynthesis & Respiration",
        "Ecology & Ecosystems",
        "Human Body Systems",
        "Evolution & Natural Selection"
      ],
      duration: "1-3 weeks per topic",
      resources: ["Detailed diagrams", "Video explanations", "Interactive models", "Revision guides"]
    },
    "Computer Science": {
      grade: "Grade 8-12",
      description: "IT and Programming fundamentals covering algorithms, Python, web development, and data structures",
      topics: [
        "Algorithm Design",
        "Python Programming",
        "Data Structures",
        "Web Development Basics",
        "Database Concepts",
        "Cybersecurity Fundamentals"
      ],
      duration: "1-2 weeks per topic",
      resources: ["Code examples", "Tutorial videos", "Practice projects", "Documentation"]
    },
    "Mathematical Literacy": {
      grade: "Grade 8-12",
      description: "Technical drawing and design principles for practical mathematical applications",
      topics: [
        "Orthographic Projections",
        "Isometric Drawings",
        "CAD Basics",
        "Technical Sketching",
        "Measurement & Scaling",
        "3D Modeling"
      ],
      duration: "1-2 weeks per topic",
      resources: ["Drawing templates", "CAD software guides", "Step-by-step tutorials", "Assessment rubrics"]
    }
  };

  const content = syllabusContent[subject.title] || {
    grade: "Grade 8-12",
    description: `Explore the comprehensive syllabus for ${subject.title}`,
    topics: subject.topics || ["Topic 1", "Topic 2", "Topic 3"],
    duration: "Flexible",
    resources: ["Study materials", "Practice exercises", "Expert guidance"]
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto"
        >
          {/* Close Button */}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <BookOpen className="w-8 h-8 text-[#7949fe]" />
              <h3 className="text-3xl font-bold text-gray-900">{subject.title}</h3>
            </div>
            <p className="text-gray-600 text-sm font-medium">{content.grade}</p>
            <p className="text-gray-700 mt-4 leading-relaxed">{content.description}</p>
          </div>

          {/* Syllabus Details */}
          <div className="space-y-6">
            {/* Topics */}
            <div>
              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#7949fe]"></div>
                Key Topics Covered
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {content.topics.map((topic, idx) => (
                  <div
                    key={idx}
                    className="bg-[#7949fe]/5 border border-[#7949fe]/20 rounded-lg p-3 flex items-start gap-3"
                  >
                    <div className="w-5 h-5 rounded-full bg-[#7949fe]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-[#7949fe]"></div>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{topic}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <h4 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#ff7849]"></div>
                Learning Duration
              </h4>
              <div className="bg-[#ff7849]/5 border border-[#ff7849]/20 rounded-lg p-4">
                <p className="text-gray-700 font-medium">{content.duration}</p>
                <p className="text-gray-600 text-sm mt-1">Pace varies based on student level and commitment</p>
              </div>
            </div>

            {/* Resources */}
            <div>
              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#5a4ecf]"></div>
                Resources Provided
              </h4>
              <div className="space-y-2">
                {content.resources.map((resource, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-4 h-4 rounded border-2 border-[#7949fe] flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-[#7949fe]"></div>
                    </div>
                    <span className="text-gray-700 font-medium">{resource}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 pt-6 border-t border-gray-200 flex flex-col sm:flex-row gap-3">
            <Button 
              onClick={onClose}
              variant="outline"
              className="flex-1 border-gray-300 hover:bg-gray-50 py-3 rounded-lg font-bold"
            >
              Close
            </Button>
            <Button 
              className="flex-1 bg-[#7949fe] hover:bg-[#5a4ecf] text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Syllabus
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default SyllabusModal;
