import { useEffect, useState } from "react";
import { ArrowLeft, Briefcase, CalendarDays, MapPin } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { VivaLoader } from "@/components/VivaLoader";
import { PublicVacancyContent } from "@/components/careers/PublicVacancyContent";
import type { PublicVacancy } from "@/lib/recruitment-vacancies";
import {
  arrangementLabels,
  availabilityLabels,
  categoryLabels,
  engagementLabels,
  loadPublicVacancies,
  publicVacancyMetadata,
  scheduleLabels,
  vacancyDate,
} from "@/lib/public-careers";

export default function VacancyDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [vacancy, setVacancy] = useState<PublicVacancy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const path = `/careers/${encodeURIComponent(slug)}`;
    setLoading(true);
    setError("");
    setVacancy(null);
    setMissing(false);
    publicVacancyMetadata(
      "Career opportunity | Viva Tutorials",
      "Explore opportunities to join Viva Tutorials.",
      path,
      false,
    );
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length < 3 ||
      slug.length > 160
    ) {
      setMissing(true);
      setLoading(false);
      return () => controller.abort();
    }
    loadPublicVacancies(controller.signal, slug)
      .then((response) => {
        if (controller.signal.aborted) return;
        const published =
          response.enabled &&
          response.vacancies.find((item) => item.slug === slug);
        if (!published) {
          setMissing(true);
          return;
        }
        setVacancy(published);
        publicVacancyMetadata(
          `${published.content.title} | Viva Tutorials Careers`,
          published.content.summary.slice(0, 160),
          path,
          true,
        );
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (
          failure &&
          typeof failure === "object" &&
          "status" in failure &&
          failure.status === 404
        )
          setMissing(true);
        else
          setError(
            failure instanceof Error
              ? failure.message
              : "This opportunity could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug, retry]);
  const current = vacancy?.slug === slug ? vacancy : null;
  const content = current?.content;
  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />
      <main
        id="main-content"
        className="px-5 pb-16 pt-44 sm:px-6 sm:pb-24 sm:pt-48"
      >
        <div className="mx-auto max-w-5xl">
          <Link
            to="/careers"
            className="mb-8 inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-[#6A3AB2] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6A3AB2]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All opportunities
          </Link>
          {loading ? (
            <VivaLoader size="page" label="Loading opportunity…" />
          ) : missing ? (
            <section className="rounded-3xl border border-purple-100 bg-purple-50/40 p-7 sm:p-12">
              <h1 className="text-3xl font-bold text-[#24143b]">
                This vacancy is not available
              </h1>
              <p className="mt-4 max-w-xl leading-7 text-slate-600">
                It may have been paused or closed. Explore our current
                opportunities to see what is available.
              </p>
              <Button
                asChild
                className="mt-6 min-h-12 bg-[#6A3AB2] hover:bg-[#552c94]"
              >
                <Link to="/careers">View current opportunities</Link>
              </Button>
            </section>
          ) : error ? (
            <section className="space-y-4 rounded-3xl border border-purple-100 p-8">
              <h1 className="text-2xl font-bold text-[#24143b]">
                Opportunity temporarily unavailable
              </h1>
              <p role="alert" className="leading-7 text-slate-600">
                {error}
              </p>
              <Button
                onClick={() => setRetry((value) => value + 1)}
                className="min-h-12 bg-[#6A3AB2] hover:bg-[#552c94]"
              >
                Try again
              </Button>
            </section>
          ) : current && content ? (
            <article>
              <header className="mb-9 border-b border-purple-100 pb-8">
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-purple-50 px-3 py-1 text-sm font-semibold text-[#6A3AB2]">
                    {categoryLabels[content.category]}
                  </span>
                  <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-[#934000]">
                    {availabilityLabels[current.availability]}
                  </span>
                </div>
                <p className="text-sm font-semibold tracking-wide text-slate-500">
                  {current.reference}
                </p>
                <h1 className="mt-3 break-words text-3xl font-bold leading-tight tracking-tight text-[#24143b] sm:text-5xl">
                  {content.title}
                </h1>
                <p className="mt-4 break-words text-lg leading-7 text-slate-600">
                  {content.department}
                </p>
                <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="mb-1 flex items-center gap-2 font-semibold text-[#24143b]">
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                      Location
                    </dt>
                    <dd className="break-words leading-6 text-slate-600">
                      {content.location} ·{" "}
                      {arrangementLabels[content.workArrangement]}
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-1 flex items-center gap-2 font-semibold text-[#24143b]">
                      <Briefcase className="h-4 w-4" aria-hidden="true" />
                      Engagement
                    </dt>
                    <dd className="leading-6 text-slate-600">
                      {engagementLabels[content.engagementType]} ·{" "}
                      {scheduleLabels[content.scheduleType]} ·{" "}
                      {content.positions}{" "}
                      {content.positions === 1 ? "position" : "positions"}
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-1 flex items-center gap-2 font-semibold text-[#24143b]">
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      Opening date
                    </dt>
                    <dd className="leading-6 text-slate-600">
                      {vacancyDate(content.opensAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-1 font-semibold text-[#24143b]">
                      Closing date
                    </dt>
                    <dd className="leading-6 text-slate-600">
                      {vacancyDate(content.closesAt)}
                    </dd>
                  </div>
                </dl>
              </header>
              <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_280px]">
                <PublicVacancyContent content={content} />
                <aside className="h-fit rounded-3xl border border-orange-100 bg-orange-50/60 p-6">
                  <h2 className="text-xl font-bold text-[#24143b]">
                    {vacancy.acceptingApplications
                      ? "Apply for this opportunity"
                      : "Applications are not yet available"}
                  </h2>
                  {vacancy.acceptingApplications && (
                    <a
                      className="inline-block rounded-lg bg-[#6A3AB2] text-white px-5 py-3 mt-4"
                      href={`/recruitment/apply/${vacancy.slug}`}
                    >
                      Verify email and apply
                    </a>
                  )}
                  {!vacancy.acceptingApplications && (
                    <p className="mt-3 leading-7 text-slate-600">
                      You can read this published opportunity now. Application
                      submission and document collection are not available on
                      this page.
                    </p>
                  )}
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Please check back for updates. Our other website forms are
                    for their stated purposes and do not accept job
                    applications.
                  </p>
                </aside>
              </div>
            </article>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  );
}
