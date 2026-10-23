import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, Clock, Send } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TopBar from '@/components/TopBar';
import StickyHeader from '@/components/StickyHeader';
import Footer from '@/components/Footer';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { trackAnalyticsEvent } from '@/lib/analytics';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const plan = params.get('plan');
    const subject = params.get('subject');
    if (plan || subject) setFormData((current) => ({ ...current, subject: plan ? `Enrollment: ${plan}` : subject || '' }));
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitState('submitting');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error('Contact request failed');
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
      setSubmitState('success');
      trackAnalyticsEvent('contact_form_success');
    } catch {
      setSubmitState('error');
    }
  };

  const contactInfo = [
    {
      icon: <Phone className="w-8 h-8" />,
      title: "Phone",
      details: ["+27 73 391 3206"],
      color: "text-[#7949fe]"
    },
    {
      icon: <Mail className="w-8 h-8" />,
      title: "Email",
      details: ["info@vivatutorials.co.za"],
      color: "text-[#ff7849]"
    },
    {
      icon: <MapPin className="w-8 h-8" />,
      title: "Location",
      details: ["South Africa", "Available Nationwide"],
      color: "text-[#7949fe]"
    },
    {
      icon: <Clock className="w-8 h-8" />,
      title: "Hours",
      details: ["Mon - Fri: 8:00 AM - 8:00 PM", "Sat - Sun: 9:00 AM - 5:00 PM"],
      color: "text-[#ff7849]"
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />
      <main id="main-content">

      {/* Hero Section */}
<section className="relative pt-[10.5rem] md:pt-40 pb-40 px-6 bg-gradient-to-b from-white to-[#7949fe]/5 overflow-hidden">
  {/* Background Blobs */}
  <motion.div
    className="absolute w-72 h-72 bg-[#7949fe]/20 rounded-full top-10 left-10 blur-3xl"
    animate={{ x: [0, 20, 0], y: [0, -10, 0] }}
    transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
  />
  <motion.div
    className="absolute w-96 h-96 bg-[#ff7849]/15 rounded-full bottom-10 right-20 blur-2xl"
    animate={{ x: [0, -30, 0], y: [0, 20, 0] }}
    transition={{ repeat: Infinity, duration: 12, ease: "easeInOut" }}
  />
  <motion.div
    className="absolute w-40 h-40 bg-[#7949fe]/10 rounded-full top-1/2 right-1/3 blur-2xl"
    animate={{ x: [0, 10, 0], y: [0, -10, 0] }}
    transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
  />

  <div className="relative max-w-7xl mx-auto text-center">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      <h1 className="text-5xl md:text-7xl font-bold text-[#1a0b2e] mb-6">
        Get in Touch
      </h1>
      <p className="text-xl text-gray-600 max-w-3xl mx-auto">
        Have questions? We'd love to hear from you. Reach out to us and we'll get back to you as soon as possible.
      </p>
      <motion.a
        href="/enroll"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="inline-block mt-8"
      >
        <Button className="bg-[#7949fe] hover:bg-[#5a4ecf] text-white py-4 px-10 rounded-full font-bold text-lg">
          Enroll Now
        </Button>
      </motion.a>
    </motion.div>
  </div>
</section>


      {/* Contact Info Cards */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-24">
            {contactInfo.map((info, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className="h-full border-2 border-[#7949fe] transition-all duration-300">
                  <CardContent className="pt-6 text-center">
                    <div className={`${info.color} mb-4 flex justify-center`}>{info.icon}</div>
                    <h3 className="text-xl font-bold text-[#1a0b2e] mb-4">{info.title}</h3>
                    <div className="space-y-2">
                      {info.details.map((detail, i) => {
                        const href = info.title === "Phone" ? "tel:+27733913206" : info.title === "Email" ? "mailto:info@vivatutorials.co.za" : undefined;
                        return href ? (
                          <a key={i} href={href} className="block text-sm text-gray-600 underline-offset-2 hover:underline">{detail}</a>
                        ) : (
                          <p key={i} className="text-gray-600 text-sm">{detail}</p>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Contact Form and FAQ */}
          <div className="grid md:grid-cols-2 gap-12">
            {/* Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-3xl font-bold text-[#1a0b2e] mb-8">Send us a Message</h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-name" className="block text-sm font-semibold text-[#1a0b2e] mb-2">Full Name</label>
                    <Input
                      type="text"
                      id="contact-name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Your name"
                      className="border-2 border-gray-200 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-sm font-semibold text-[#1a0b2e] mb-2">Email</label>
                    <Input
                      type="email"
                      id="contact-email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="your@email.com"
                      className="border-2 border-gray-200 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-phone" className="block text-sm font-semibold text-[#1a0b2e] mb-2">Phone</label>
                    <Input
                      type="tel"
                      id="contact-phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="Your phone number"
                      className="border-2 border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-subject" className="block text-sm font-semibold text-[#1a0b2e] mb-2">Subject</label>
                    <Input
                      type="text"
                      id="contact-subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      placeholder="Subject"
                      className="border-2 border-gray-200 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="contact-message" className="block text-sm font-semibold text-[#1a0b2e] mb-2">Message</label>
                  <Textarea
                    name="message"
                    id="contact-message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Your message..."
                    className="border-2 border-gray-200 rounded-lg min-h-[150px]"
                    required
                  />
                </div>

                {submitState === 'success' && <p className="text-sm text-green-700" role="status">Thanks, your message has been sent.</p>}
                {submitState === 'error' && <p className="text-sm text-red-700" role="alert">We could not send your message. Please try again.</p>}
                <Button type="submit" disabled={submitState === 'submitting'} className="w-full bg-[#7949fe] hover:bg-[#5a4ecf] text-white py-6 rounded-lg font-bold flex items-center justify-center gap-2">
                  <Send className="w-5 h-5" />
                  {submitState === 'submitting' ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            </motion.div>

            {/* FAQ / Additional Info */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-3xl font-bold text-[#1a0b2e] mb-8">Frequently Asked Questions</h2>
              <div className="space-y-6">
                {[
                  { q: "How quickly will I hear back?", a: "We aim to respond to all inquiries within 24 hours during business days." },
                  { q: "Do you offer free consultations?", a: "Yes! We offer a free 30-minute consultation to discuss your learning goals." },
                  { q: "What are your cancellation policies?", a: "Sessions can be cancelled up to 24 hours in advance for a full refund." },
                  { q: "Do you tutor online or in-person?", a: "We offer both online and in-person tutoring across South Africa." }
                ].map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <h3 className="font-bold text-[#1a0b2e] mb-2 text-lg">{item.q}</h3>
                    <p className="text-gray-600">{item.a}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-gradient-to-b from-[#7949fe]/5 to-white">
        <div className="max-w-7xl mx-auto bg-[#1a0b2e] rounded-[3rem] p-12 md:p-24 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Still Have Questions?</h2>
          <p className="text-white/60 text-lg mb-8 max-w-2xl mx-auto">
            Our support team is here to help. Don't hesitate to reach out!
          </p>
          <a href="mailto:info@vivatutorials.co.za">
            <Button className="bg-white text-[#7949fe] hover:bg-gray-100 py-6 px-10 rounded-full text-lg font-bold">
              Email Us
            </Button>
          </a>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
