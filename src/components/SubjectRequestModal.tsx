import { useState, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-md overflow-y-auto rounded-2xl border-0 bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle id="subject-request-title" className="text-2xl font-bold text-gray-900">Ask About Subject Availability</DialogTitle>
          <DialogDescription className="text-gray-600">Tell us the subject you need help with. We will confirm whether support is currently available.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="requested-subject" className="block text-sm font-medium text-gray-700 mb-1">Subject Name</label>
              <input 
                id="requested-subject"
                type="text" 
                name="subject"
                placeholder="e.g. Grade 10 Mathematics" 
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#7949fe] outline-none"
                required
              />
            </div>
            <div>
              <label htmlFor="requester-email" className="block text-sm font-medium text-gray-700 mb-1">Your Email</label>
              <input 
                id="requester-email"
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
      </DialogContent>
    </Dialog>
  );
};

export default SubjectRequestModal;