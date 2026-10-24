import { CircleX, ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from "@/components/Footer";

export default function PaymentCancelled() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar />
      <StickyHeader />
      <main className="flex min-h-screen items-center justify-center px-6 py-16">
        <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl sm:p-12">
          <CircleX className="mx-auto mb-6 h-16 w-16 text-slate-400" />
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Payment cancelled</p>
          <h1 className="mb-4 text-3xl font-bold text-slate-900 sm:text-4xl">Your payment was not completed</h1>
          <p className="mb-8 text-base leading-7 text-slate-600">
            No charge was completed. You can return to the study materials library and try again whenever you are ready.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/study-materials"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#7949fe] px-6 py-3 font-bold text-white transition-colors hover:bg-[#5a4ecf]"
            >
              Return to materials <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-6 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Home
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
