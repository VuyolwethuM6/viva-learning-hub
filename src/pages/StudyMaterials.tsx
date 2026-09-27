import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { ArrowDownToLine, ArrowRight, BookOpen, CalendarDays, FileText, GraduationCap, LockKeyhole, Search, SlidersHorizontal } from 'lucide-react';
import TopBar from '@/components/TopBar';
import StickyHeader from '@/components/StickyHeader';
import Footer from '@/components/Footer';
import MaterialPurchaseDialog from '@/components/MaterialPurchaseDialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { studyMaterials, type StudyMaterial } from '@/lib/studyMaterials';

type Filter = 'all' | 'free' | 'paid';
type GradeFilter = 'all' | StudyMaterial['grade'];
type SessionFilter = 'all' | Exclude<StudyMaterial['examSession'], null>;

const grades: GradeFilter[] = ['all', 8, 9, 10, 11, 12];
const subjects = ['all', 'Mathematics', 'Physical Sciences', 'Life Sciences', 'Accounting', 'Geography', 'Information Technology', 'Business Studies', 'Economics'];
const examSessions: SessionFilter[] = ['all', 'March', 'June', 'September', 'November/December', 'General revision'];

const materialUrl = (material: StudyMaterial) => {
  const slug = material.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return material.isFree ? `https://www.vivatutorials.co.za${material.file}` : `https://www.vivatutorials.co.za/study-materials#${slug}`;
};

export default function StudyMaterials() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedGrade, setSelectedGrade] = useState<GradeFilter>('all');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedSession, setSelectedSession] = useState<SessionFilter>('all');
  const [selectedMaterial, setSelectedMaterial] = useState<StudyMaterial | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<StudyMaterial | null>(null);

  const filteredMaterials = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return studyMaterials.filter((material) => {
      const matchesFilter = filter === 'all' || (filter === 'free' ? material.isFree : !material.isFree);
      const searchableText = `${material.title} ${material.subtitle} ${material.description} ${material.grade} grade ${material.subject} ${material.examSession || ''} ${material.keywords.join(' ')}`.toLowerCase();
      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);
      const matchesGrade = selectedGrade === 'all' || material.grade === selectedGrade;
      const matchesSubject = selectedSubject === 'all' || material.subject === selectedSubject;
      const matchesSession = selectedSession === 'all' || material.examSession === selectedSession;
      return matchesFilter && matchesQuery && matchesGrade && matchesSubject && matchesSession;
    });
  }, [filter, query, selectedGrade, selectedSubject, selectedSession]);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Grade 8–12 Study Materials and Matric Practice PDFs',
    description: 'Viva Tutorials study resources organized by grade, subject, and exam sitting. Browse free and premium Grade 12 Mathematics practice PDFs; more Grades 8–11 resources are being added.',
    url: 'https://www.vivatutorials.co.za/study-materials',
    about: { '@type': 'Thing', name: 'South African school exam preparation' },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: studyMaterials.length,
      itemListElement: studyMaterials.map((material, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'LearningResource',
          name: material.title,
          description: material.description,
          educationalLevel: `Grade ${material.grade}`,
          learningResourceType: 'Practice questions',
          teaches: material.subject,
          isAccessibleForFree: material.isFree,
          url: materialUrl(material),
          ...(material.isFree ? {} : { offers: { '@type': 'Offer', price: material.amount, priceCurrency: 'ZAR', availability: 'https://schema.org/InStock' } }),
        },
      })),
    },
  };

  const clearFilters = () => {
    setQuery('');
    setFilter('all');
    setSelectedGrade('all');
    setSelectedSubject('all');
    setSelectedSession('all');
  };

  const selectedGradeHasMaterials = selectedGrade === 'all' || studyMaterials.some((material) => material.grade === selectedGrade);

  return (
    <>
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <div className="min-h-screen overflow-x-hidden bg-white text-slate-900">
        <TopBar />
        <StickyHeader />

        <main className="pt-[7.5rem] sm:pt-[8rem]">
          <section className="relative isolate overflow-hidden border-b border-[#7949fe]/10 bg-gradient-to-br from-[#f6f3ff] via-white to-[#fff4ed]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(121,73,254,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(121,73,254,0.035)_1px,transparent_1px)] [background-size:34px_34px]" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] bg-[linear-gradient(135deg,transparent_0%,rgba(121,73,254,0.08)_45%,rgba(255,120,73,0.12)_100%)] lg:block" />
            <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_auto] lg:items-end lg:py-20">
              <div className="max-w-3xl">
                <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#7949fe]/20 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#7949fe] shadow-sm">
                  <BookOpen className="h-4 w-4" /> Grade 8–12 Learning Hub
                </p>
                <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] text-[#1a0b2e] sm:text-5xl lg:text-6xl">Find the right practice for <span className="bg-gradient-to-r from-[#7949fe] to-[#ff7849] bg-clip-text text-transparent">your next exam.</span></h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                  Search by grade, subject, topic, or exam sitting. Grade 12 Mathematics PDFs are available now; resources for other grades and exam periods are being added.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                  {['March', 'June', 'September', 'November / December'].map((session) => (
                    <span key={session} className="inline-flex items-center gap-1.5 rounded-full border border-[#7949fe]/15 bg-white/80 px-3 py-1.5"><CalendarDays className="h-3.5 w-3.5 text-[#7949fe]" />{session}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/80 bg-white/85 shadow-[0_18px_50px_rgba(26,11,46,0.09)] backdrop-blur-sm sm:min-w-72">
                <div className="border-r border-slate-200/80 px-5 py-5">
                  <p className="text-3xl font-extrabold text-[#7949fe]">{studyMaterials.length}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">PDFs available now</p>
                </div>
                <div className="px-5 py-5">
                  <p className="text-3xl font-extrabold text-[#ff7849]">{studyMaterials.filter((material) => material.isFree).length}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Free resources</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10" aria-label="Study materials">
            <div className="mb-7 flex flex-col gap-5 rounded-2xl border border-[#7949fe]/10 bg-gradient-to-r from-[#f8f6ff] via-white to-[#fff8f3] p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h2 className="text-2xl font-extrabold text-[#1a0b2e]">Browse the library</h2>
                    <p className="mt-1 text-sm text-slate-500">{filteredMaterials.length} {filteredMaterials.length === 1 ? 'document' : 'documents'} match your filters</p>
                  </div>
                  <label className="relative block sm:w-80">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7949fe]" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search grade, subject, topic..."
                      aria-label="Search by grade, subject, topic, or exam sitting"
                      className="h-12 w-full rounded-full border-2 border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#7949fe] focus:ring-4 focus:ring-[#7949fe]/10"
                    />
                  </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="text-xs font-semibold text-slate-600">Grade
                    <select value={selectedGrade} onChange={(event) => setSelectedGrade(event.target.value === 'all' ? 'all' : Number(event.target.value) as StudyMaterial['grade'])} className="mt-1.5 h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#7949fe] focus:ring-4 focus:ring-[#7949fe]/10">
                      {grades.map((grade) => <option key={grade} value={grade}>{grade === 'all' ? 'All grades' : `Grade ${grade}`}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Subject
                    <select value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#7949fe] focus:ring-4 focus:ring-[#7949fe]/10">
                      {subjects.map((subject) => <option key={subject} value={subject}>{subject === 'all' ? 'All subjects' : subject}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Exam sitting
                    <select value={selectedSession} onChange={(event) => setSelectedSession(event.target.value as SessionFilter)} className="mt-1.5 h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#7949fe] focus:ring-4 focus:ring-[#7949fe]/10">
                      {examSessions.map((session) => <option key={session} value={session}>{session === 'all' ? 'Any exam sitting' : session}</option>)}
                    </select>
                  </label>
                  <fieldset className="min-w-0">
                    <legend className="text-xs font-semibold text-slate-600">Resource type</legend>
                    <div className="mt-1.5 flex h-12 items-center gap-1 rounded-full border-2 border-slate-200 bg-white p-1" role="group" aria-label="Filter by resource type">
                      <SlidersHorizontal className="mx-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      {([['all', 'All'], ['free', 'Free'], ['paid', 'Paid']] as const).map(([value, label]) => (
                        <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`h-9 min-w-0 flex-1 rounded-full px-2 text-sm font-bold transition-colors ${filter === value ? 'bg-gradient-to-r from-[#7949fe] to-[#ff7849] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
              </div>
              {(query || filter !== 'all' || selectedGrade !== 'all' || selectedSubject !== 'all' || selectedSession !== 'all') && (
                <button type="button" onClick={clearFilters} className="self-start text-sm font-semibold text-[#7949fe] hover:underline">Clear filters</button>
              )}
            </div>

            {filteredMaterials.length ? (
              <div className="grid gap-5 py-6 sm:grid-cols-2 xl:grid-cols-3">
                {filteredMaterials.map((material, index) => (
                  <motion.article
                    key={material.title}
                    id={material.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_rgba(26,11,46,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-[#7949fe]/25 hover:shadow-[0_24px_55px_rgba(121,73,254,0.14)]"
                  >
                    <div className={`h-2 bg-gradient-to-r ${material.accent}`} />
                    <div className="flex flex-1 flex-col p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${material.isFree ? 'bg-emerald-50 text-emerald-800' : 'bg-[#7949fe]/10 text-[#6237e8]'}`}>
                          {material.isFree ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                          {material.badge}
                        </span>
                        <span className="shrink-0 text-lg font-extrabold text-[#1a0b2e]">{material.price}</span>
                      </div>

                      <div className={`relative mt-5 flex h-40 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br ${material.accent}`}>
                        {material.isFree ? (
                          <iframe
                            src={`${material.file}#page=1&view=FitH&toolbar=0&navpanes=0`}
                            title={`${material.title} first-page preview`}
                            aria-hidden="true"
                            loading="lazy"
                            tabIndex={-1}
                            className="pointer-events-none absolute inset-0 h-full w-full bg-white"
                          />
                        ) : (
                          <div className="text-center text-[#1a0b2e]">
                            <LockKeyhole className="mx-auto h-9 w-9 text-[#7949fe]" strokeWidth={1.5} />
                            <p className="mt-3 text-xs font-bold uppercase tracking-wider">Premium PDF</p>
                            <p className="mt-1 text-xs font-medium text-slate-600">Preview after purchase</p>
                          </div>
                        )}
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow-sm">
                          <FileText className="h-3 w-3 text-[#7949fe]" /> PDF
                        </span>
                        {material.pages && <span className="absolute bottom-3 right-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-slate-600 shadow-sm">{material.pages} pages</span>}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-1.5 text-xs font-semibold">
                        <span className="rounded-full bg-[#7949fe]/8 px-2.5 py-1 text-[#6237e8]">Grade {material.grade}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{material.subject}</span>
                        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-orange-800">{material.examSession || 'Exam sitting TBA'}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-extrabold leading-snug text-[#1a0b2e]">{material.title}</h3>
                      <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{material.description}</p>

                      <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                        {material.includes.slice(0, 3).map((item) => (
                          <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#ff7849]" />{item}
                          </li>
                        ))}
                      </ul>

                      <div className="mt-auto flex gap-2 pt-6">
                        {material.isFree ? (
                          <>
                            <a
                              href={material.file}
                              download
                              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-3 text-sm font-bold text-white transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
                            >
                              <ArrowDownToLine className="h-4 w-4" /> Download PDF
                            </a>
                            <button
                              type="button"
                              onClick={() => setPreviewMaterial(material)}
                              className="min-h-11 rounded-full border-2 border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:border-[#7949fe]/40 hover:bg-[#7949fe]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7949fe]"
                            >
                              Preview
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedMaterial(material)}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#7949fe] to-[#ff7849] px-4 text-sm font-bold text-white shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7949fe] focus-visible:ring-offset-2"
                          >
                            Buy with PayFast · {material.price}<ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center">
                <GraduationCap className="mx-auto h-9 w-9 text-[#7949fe]" strokeWidth={1.5} />
                <p className="mt-4 text-lg font-semibold text-slate-800">
                  {!selectedGradeHasMaterials ? `Grade ${selectedGrade} resources are being prepared.` : selectedSession !== 'all' ? `No PDFs tagged for ${selectedSession} exams yet.` : 'No documents match these search filters.'}
                </p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                  {!selectedGradeHasMaterials ? 'We are adding study guides and exam practice for Grades 8–11. Check back as new documents are uploaded.' : selectedSession !== 'all' ? 'Current resources are general revision practice. Session-specific papers will appear here when available.' : 'Try a different grade, subject, exam sitting, or search term.'}
                </p>
                <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
                  <button type="button" onClick={clearFilters} className="min-h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Clear filters</button>
                  <a href="/contact?subject=Study%20materials%20request" className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#7949fe] px-4 text-sm font-semibold text-white hover:bg-[#6237e8]">Request a resource</a>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4 border-t border-slate-200 py-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">Need help choosing a resource?</p>
              <a href="/contact" className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 sm:self-auto">
                Contact Viva Tutorials <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </section>
        </main>

        <Footer />

        <Dialog open={Boolean(previewMaterial)} onOpenChange={(open) => !open && setPreviewMaterial(null)}>
          <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-0 bg-slate-950 p-0 text-white sm:rounded-lg">
            {previewMaterial && (
              <>
                <DialogHeader className="px-5 pb-4 pt-6 pr-14 text-left sm:px-7">
                  <DialogTitle className="text-xl font-bold text-white">{previewMaterial.title}</DialogTitle>
                  <DialogDescription className="text-slate-300">Free PDF preview · {previewMaterial.pages} pages</DialogDescription>
                </DialogHeader>
                <div className="px-3 pb-4 sm:px-7">
                  <iframe
                    src={`${previewMaterial.file}#page=1&view=FitH`}
                    title={`${previewMaterial.title} preview`}
                    className="h-[65vh] min-h-[360px] w-full border border-white/15 bg-white"
                  />
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
        <MaterialPurchaseDialog
          material={selectedMaterial}
          open={Boolean(selectedMaterial)}
          onOpenChange={(open) => !open && setSelectedMaterial(null)}
        />
      </div>
    </>
  );
}
