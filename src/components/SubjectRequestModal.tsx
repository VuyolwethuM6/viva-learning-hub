import React, { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, X } from 'lucide-react';

const SubjectRequestModal = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('submitting');
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/subject-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: form.get('subject'), email: form.get('email') }),
      });
      if (!response.ok) throw new Error('Request failed');
      setStatus('success');
      event.currentTarget.reset();
    } catch {
      setStatus('error');
      setError('We could not send your request. Please try again.');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="subject-request-title">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative"
        >
          {/* Close Button */}
          <button aria-label="Close subject request"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>

          <h3 id="subject-request-title" className="text-2xl font-bold text-gray-900 mb-2">Request a Subject</h3>
          <p className="text-gray-600 mb-6">Tell us what you'd like to learn, and we'll find the perfect tutor for you.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject Name</label>
              <input 
                type="text" 
                name="subject"
                placeholder="e.g. Advanced Physics" 
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#7949fe] outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Email</label>
              <input 
                type="email" 
                name="email"
                placeholder="email@example.com" 
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#7949fe] outline-none"
                required
              />
            </div>
            {status === 'success' && <p className="text-sm text-green-700" role="status">Your request has been sent.</p>}
            {status === 'error' && <p className="text-sm text-red-700" role="alert">{error}</p>}
            <button disabled={status === 'submitting'}
              type="submit"
              className="w-full bg-[#7949fe] hover:bg-[#5a4ecf] text-white py-4 rounded-full font-bold transition-colors"
            >
              {status === 'submitting' ? 'Sending...' : 'Send Request'}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default SubjectRequestModal;