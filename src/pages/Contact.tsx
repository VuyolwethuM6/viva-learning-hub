import { Mail, MapPin, Phone } from "lucide-react";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from "@/components/Footer";
import { ContactButton } from "@/components/ContactButton";
import { WhatsAppButton } from "@/components/WhatsAppButton";

export default function Contact() {
  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />
      <main id="main-content" className="pt-44 sm:pt-48">
        <section className="mx-auto max-w-5xl px-6 pb-16">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#6A3AB2]">
            Let’s talk
          </p>
          <h1 className="text-4xl font-bold text-[#1a0b2e] sm:text-6xl">
            Contact Viva Tutorials
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Ask about subjects, fees and lesson availability, or get help with
            enrollment and portal access. Choose the contact option that suits you.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <article className="rounded-3xl border border-slate-200 p-6 sm:p-8">
              <Mail className="mb-4 h-7 w-7 text-[#6A3AB2]" aria-hidden="true" />
              <h2 className="text-xl font-bold text-[#1a0b2e]">Email us</h2>
              <p className="mt-3 mb-5 leading-7 text-slate-600">
                Send your questions about our programmes, fees or learning resources.
              </p>
              <a
                href="mailto:info@vivatutorials.co.za"
                className="break-all font-semibold text-[#6A3AB2] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                info@vivatutorials.co.za
              </a>
            </article>
            <article className="rounded-3xl border border-slate-200 p-6 sm:p-8">
              <Phone className="mb-4 h-7 w-7 text-[#6A3AB2]" aria-hidden="true" />
              <h2 className="text-xl font-bold text-[#1a0b2e]">Call us</h2>
              <p className="mt-3 mb-5 leading-7 text-slate-600">
                Speak to Viva Tutorials about suitable tutoring options and availability.
              </p>
              <a
                href="tel:+27733913206"
                className="font-semibold text-[#6A3AB2] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                +27 73 391 3206
              </a>
            </article>
            <article id="support" className="scroll-mt-44 rounded-3xl border border-slate-200 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1a0b2e]">Chat and support</h2>
              <p className="mt-3 mb-5 leading-7 text-slate-600">
                Prefer a message? Contact our team on WhatsApp for tutoring enquiries,
                enrollment questions or help accessing your portal. WhatsApp opens in a new tab.
              </p>
              <WhatsAppButton message="Hello Viva Tutorials, I would like assistance with tutoring or my account.">
                Chat on WhatsApp
              </WhatsAppButton>
            </article>
            <article className="rounded-3xl bg-[#f6f2fb] p-6 sm:p-8">
              <h2 className="text-xl font-bold text-[#1a0b2e]">Ready to enrol?</h2>
              <p className="mt-3 mb-5 leading-7 text-slate-600">
                Complete our online enrollment application with the learner’s
                details and selected subjects.
              </p>
              <ContactButton href="/enroll">Enrol now</ContactButton>
            </article>
          </div>

          <div className="mt-8 flex items-start gap-3 text-slate-600">
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-[#6A3AB2]" aria-hidden="true" />
            <p>In-person tutoring in Mfuleni, Cape Town, and online across South Africa.</p>
          </div>

          <aside id="privacy" className="mt-10 scroll-mt-44 rounded-2xl border-l-4 border-[#FF6F00] bg-slate-50 p-6">
            <h2 className="text-xl font-bold text-[#1a0b2e]">Privacy and personal information</h2>
            <p className="mt-3 leading-7 text-slate-600">
              For a privacy request, email{" "}
              <a className="break-all font-semibold text-[#6A3AB2] underline underline-offset-4" href="mailto:info@vivatutorials.co.za?subject=Privacy%20enquiry">
                info@vivatutorials.co.za
              </a>
              . Do not send passwords, verification codes or sensitive documents
              through ordinary email or WhatsApp. Use the secure upload process
              provided for your application.
            </p>
          </aside>
        </section>
      </main>
      <Footer />
    </div>
  );
}
