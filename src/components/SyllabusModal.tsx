import React from 'react';
import { Download, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const SyllabusModal = ({ isOpen, onClose, subject }) => {
  if (!isOpen || !subject) return null;

  const content = {
    grade: subject.grade || "Confirm the relevant grade and subject requirements with Viva Tutorials.",
    description: subject.description || `Ask Viva Tutorials about current support for ${subject.title}.`,
    topics: subject.topics || [],
  };

  const downloadSyllabus = () => {
    const text = `${subject.title}\n${content.grade}\n\n${content.description}\n\nTopics to discuss:\n${content.topics.map((topic) => `- ${topic}`).join('\n')}`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${subject.title.replace(/\s+/g, '-').toLowerCase()}-subject-overview.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-center gap-3 text-3xl font-bold text-gray-900">
            <BookOpen className="h-8 w-8 shrink-0 text-[#7949fe]" aria-hidden="true" />
            {subject.title} Overview
          </DialogTitle>
          <DialogDescription className="text-sm font-medium text-gray-600">{content.grade}</DialogDescription>
        </DialogHeader>
        <p className="mb-8 leading-relaxed text-gray-700">{content.description}</p>

          {/* Syllabus Details */}
          <div className="space-y-6">
            {/* Topics */}
            <div>
              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#7949fe]"></div>
                Topics for This Grade Band
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
              onClick={downloadSyllabus}
              className="flex-1 bg-[#7949fe] hover:bg-[#5a4ecf] text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Overview
            </Button>
          </div>
      </DialogContent>
    </Dialog>
  );
};

export default SyllabusModal;
