import { useEffect, useState } from 'react';
import { CheckCircle2, Mail, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from "@/components/Footer";

export default function PaymentSuccess() {
  const [purchase, setPurchase] = useState<{ customer?: { firstName?: string; lastName?: string; email?: string }; material?: string; amount?: string } | null>(null);

  useEffect(() => {
    const storedPurchase = sessionStorage.getItem('viva-purchase');
    if (!storedPurchase) return;
    try {
      const parsed = JSON.parse(storedPurchase);
      if (parsed && typeof parsed === 'object' && parsed.customer && typeof parsed.material === 'string') {
        setPurchase(parsed);
      }
    } catch {
      sessionStorage.removeItem('viva-purchase');
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar />
      <StickyHeader />
      <main className="flex min-h-screen items-center justify-center px-6 py-16">
        <section className="w-full max-w-xl rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-xl sm:p-12">
          <CheckCircle2 className="mx-auto mb-6 h-16 w-16 text-emerald-500" />
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Payment processing</p>
          <h1 className="mb-4 text-3xl font-bold text-slate-900 sm:text-4xl">Thank you for your purchase</h1>
          <p className="mb-8 text-base leading-7 text-slate-600">
            PayFast is confirming your payment. Once the transaction is validated, your PDF will be sent to the email address used during checkout.
          </p>
          {purchase && (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left text-sm">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Checkout details</div>
              <div className="space-y-2 text-slate-700">
                <div className="flex justify-between gap-4"><span>Customer</span><strong>{purchase.customer?.firstName} {purchase.customer?.lastName}</strong></div>
                <div className="flex justify-between gap-4"><span>Email</span><strong className="break-all text-right">{purchase.customer?.email}</strong></div>
                <div className="flex justify-between gap-4"><span>PDF</span><strong className="text-right">{purchase.material}</strong></div>
                <div className="flex justify-between gap-4"><span>Amount</span><strong>R{purchase.amount}</strong></div>
              </div>
            </div>
          )}
          <div className="mb-8 flex items-center justify-center gap-3 rounded-2xl bg-emerald-50 px-4 py-4 text-left text-sm text-emerald-800">
            <Mail className="h-5 w-5 shrink-0" />
            <span>Check your inbox, including the spam folder, for the delivery email.</span>
          </div>
          <Link
            to="/study-materials"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#7949fe] px-6 py-3 font-bold text-white transition-colors hover:bg-[#5a4ecf]"
          >
            Continue learning <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
