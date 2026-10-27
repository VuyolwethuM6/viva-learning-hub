import { VivaLoader } from "@/components/VivaLoader";
import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { StudyMaterial } from '@/lib/studyMaterials';

type Props = {
  material: StudyMaterial | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function MaterialPurchaseDialog({ material, open, onOpenChange }: Props) {
  const [customer, setCustomer] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionStarted = useRef(false);

  const submitCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!material || material.isFree || submissionStarted.current) return;
    submissionStarted.current = true;
    setSubmitting(true);
    setError('');
    const timeoutController = new AbortController();
    const timeout = window.setTimeout(() => timeoutController.abort(), 15000);
    let redirecting = false;

    try {
      const response = await fetch('/api/payfast/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...customer, material: material.title }),
        signal: timeoutController.signal,
      });
      const checkout = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(checkout.error || 'Checkout could not start. Please try again.');
      if (!checkout.endpoint || !checkout.fields) throw new Error('PayFast returned an incomplete checkout response.');

      sessionStorage.setItem('viva-purchase', JSON.stringify({
        customer,
        material: material.title,
        amount: material.price.replace('R', ''),
        currency: 'ZAR',
        status: 'pending',
      }));

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = checkout.endpoint;
      Object.entries(checkout.fields).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = String(value);
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
      redirecting = true;
    } catch (checkoutError) {
      setError(checkoutError instanceof Error && checkoutError.name === 'AbortError'
        ? 'Checkout timed out. Please try again.'
        : checkoutError instanceof Error ? checkoutError.message : 'The checkout service could not be reached.');
    } finally {
      window.clearTimeout(timeout);
      if (!redirecting) {
        submissionStarted.current = false;
        setSubmitting(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 shadow-2xl sm:max-h-[94vh] sm:w-full">
        {material && (
          <form onSubmit={submitCheckout} className="p-5 sm:p-8">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-2xl font-bold text-slate-900">Complete your purchase</DialogTitle>
              <DialogDescription>Enter your details so we can send your paid PDF after PayFast confirms payment.</DialogDescription>
            </DialogHeader>
            <div className="mt-5 border-l-4 border-[#7949fe] bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Selected PDF</p>
              <p className="mt-1 font-bold text-slate-900">{material.title}</p>
              <p className="text-sm text-slate-600">{material.pages} pages · {material.price}</p>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">First name
                <Input required autoComplete="given-name" value={customer.firstName} onChange={(event) => setCustomer({ ...customer, firstName: event.target.value })} className="mt-2" />
              </label>
              <label className="text-sm font-semibold text-slate-700">Surname
                <Input required autoComplete="family-name" value={customer.lastName} onChange={(event) => setCustomer({ ...customer, lastName: event.target.value })} className="mt-2" />
              </label>
            </div>
            <label className="mt-4 block text-sm font-semibold text-slate-700">Email address
              <Input required type="email" autoComplete="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} className="mt-2" />
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">Phone number
              <Input required type="tel" autoComplete="tel" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} className="mt-2" />
            </label>
            {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
            <Button type="submit" disabled={submitting} aria-busy={submitting} className="mt-5 min-h-12 w-full rounded-lg bg-[#7949fe] font-bold text-white hover:bg-[#6237e8] disabled:cursor-wait disabled:opacity-70">
              {submitting ? 'Redirecting to PayFast...' : `Continue to PayFast · ${material.price}`}
              {submitting ? <VivaLoader size="button" decorative className="ml-2" /> : <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
