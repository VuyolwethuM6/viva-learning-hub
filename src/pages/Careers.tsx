import { ArrowLeft, ArrowRight, Briefcase } from "lucide-react";
import { Link } from "react-router-dom";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Careers() {
  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />
      <main id="main-content">
        <section
          aria-labelledby="careers-heading"
          className="relative overflow-hidden bg-gradient-to-b from-[#7949fe]/5 to-white px-5 pb-10 pt-44 sm:px-6 sm:pb-14 sm:pt-48"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 top-24 h-64 w-64 rounded-full bg-[#ff7849]/10 blur-3xl"
          />
          <div className="relative mx-auto max-w-4xl">
            <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-600">
              <ol className="flex items-center gap-3">
                <li>
                  <Link to="/" className="rounded-sm underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7949fe]">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="font-semibold text-[#1a0b2e]">Careers</li>
              </ol>
            </nav>
            <p className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#5a4ecf]">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#ff7849]" />
              Grow with purpose
            </p>
            <h1 id="careers-heading" className="text-4xl font-bold leading-tight tracking-tight text-[#1a0b2e] sm:text-5xl lg:text-6xl">
              Careers at Viva Tutorials
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Helping learners build understanding and confidence, in Mfuleni,
              Cape Town, and online across South Africa.
            </p>
          </div>
        </section>

        <section aria-labelledby="vacancies-heading" className="px-5 pb-16 sm:px-6 sm:pb-24">
          <div className="mx-auto max-w-4xl">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-600">Opportunities at Viva</p>
              <p className="rounded-full border border-violet-100 bg-violet-50 px-4 py-2 text-sm font-semibold text-[#5a4ecf]">
                0 open positions
              </p>
            </div>
            <Card className="overflow-hidden rounded-3xl border-violet-100 bg-white shadow-xl shadow-violet-100/40">
              <div aria-hidden="true" className="h-1 bg-gradient-to-r from-[#7949fe] to-[#ff7849]" />
              <CardContent className="px-5 py-10 text-center sm:px-12 sm:py-14">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-violet-100 bg-violet-50">
                  <Briefcase aria-hidden="true" className="h-9 w-9 text-[#7949fe]" strokeWidth={1.5} />
                </div>
                <h2 id="vacancies-heading" className="text-2xl font-bold tracking-tight text-[#1a0b2e] sm:text-3xl">
                  No Current Vacancies
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-slate-600">
                  Thank you for your interest in joining Viva Tutorials. We are
                  not recruiting at the moment.
                </p>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
                  Future opportunities will be listed here. Please check back
                  for updates.
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Button asChild className="min-h-12 rounded-full bg-[#7949fe] px-6 font-semibold text-white hover:bg-[#5a4ecf] focus-visible:ring-[#7949fe]">
                    <Link to="/about">
                      About Viva Tutorials <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="min-h-12 rounded-full border-slate-300 px-6 font-semibold text-slate-700 focus-visible:ring-[#7949fe]">
                    <Link to="/">
                      <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" /> Back to home
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
