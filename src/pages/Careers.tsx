import { useEffect, useState } from "react";
import { ArrowRight, Briefcase, MapPin, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { TopBar, StickyHeader } from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VivaLoader } from "@/components/VivaLoader";
import type { PublicVacancy } from "@/lib/recruitment-vacancies";
import {
  arrangementLabels,
  availabilityLabels,
  categoryLabels,
  engagementLabels,
  loadPublicVacancies,
  scheduleLabels,
  vacancyDate,
} from "@/lib/public-careers";

export default function Careers() {
  const [poolEnabled, setPoolEnabled] = useState(false);
  const [vacancies, setVacancies] = useState<PublicVacancy[]>([]);
  const [category, setCategory] = useState("all");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setVacancies([]);
    loadPublicVacancies(controller.signal, undefined, { offset, category })
      .then((response) => {
        if (!controller.signal.aborted) {
          setVacancies(response.vacancies);
          setPoolEnabled(response.talentPoolEnabled === true);
          setTotal(response.total);
          setNextOffset(response.nextOffset);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Current vacancies could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry, category, offset]);
  const visible = vacancies.filter(
    (vacancy) => category === "all" || vacancy.content.category === category,
  );
  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <StickyHeader />
      <main id="main-content">
        <section
          aria-labelledby="careers-heading"
          className="relative overflow-hidden bg-gradient-to-b from-[#6A3AB2]/10 to-white px-5 pb-10 pt-44 sm:px-6 sm:pb-14 sm:pt-48"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 top-24 h-64 w-64 rounded-full bg-[#FF6F00]/10 blur-3xl"
          />
          <div className="relative mx-auto max-w-6xl">
            <nav
              aria-label="Breadcrumb"
              className="mb-8 text-sm text-slate-600"
            >
              <ol className="flex items-center gap-3">
                <li>
                  <Link
                    to="/"
                    className="rounded-sm underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6A3AB2]"
                  >
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li
                  aria-current="page"
                  className="font-semibold text-[#24143b]"
                >
                  Careers
                </li>
              </ol>
            </nav>
            <p className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#6A3AB2]">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-[#FF6F00]"
              />
              Grow with purpose
            </p>
            <h1
              id="careers-heading"
              className="text-4xl font-bold leading-tight tracking-tight text-[#24143b] sm:text-5xl lg:text-6xl"
            >
              Careers at Viva Tutorials
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Help learners build understanding and confidence. Explore
              tutoring, administration and support opportunities in our growing
              team.
            </p>
          </div>
        </section>
        <section
          aria-labelledby="vacancies-heading"
          className="px-5 pb-12 sm:px-6 sm:pb-16"
        >
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2
                  id="vacancies-heading"
                  className="text-2xl font-bold text-[#24143b] sm:text-3xl"
                >
                  Current opportunities
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {vacancies.some((v) => v.acceptingApplications)
                    ? "Applications are open for eligible published roles. Verify your email to begin."
                    : "Applications are not yet available. Published opportunities are available to read here."}
                </p>
              </div>
              {!loading && !error && (
                <p className="rounded-full border border-purple-100 bg-purple-50 px-4 py-2 text-sm font-semibold text-[#6A3AB2]">
                  {total} {total === 1 ? "opportunity" : "opportunities"}
                </p>
              )}
            </div>
            <label className="mb-6 block max-w-sm text-sm font-semibold text-[#24143b]">
              Role category
              <select
                aria-label="Role category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setOffset(0);
                }}
                className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6A3AB2]"
              >
                <option value="all">All roles</option>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {loading ? (
              <div className="rounded-3xl border border-purple-100 py-12">
                <VivaLoader
                  size="section"
                  label="Loading current opportunities…"
                />
              </div>
            ) : error ? (
              <Card className="rounded-3xl border-purple-100">
                <CardContent className="space-y-4 p-8">
                  <h3 className="text-xl font-bold text-[#24143b]">
                    Opportunities are temporarily unavailable
                  </h3>
                  <p role="alert" className="leading-7 text-slate-600">
                    {error}
                  </p>
                  <Button
                    onClick={() => setRetry((value) => value + 1)}
                    className="min-h-12 bg-[#6A3AB2] hover:bg-[#552c94]"
                  >
                    Try again
                  </Button>
                </CardContent>
              </Card>
            ) : visible.length ? (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {visible.map((vacancy) => (
                  <Card
                    key={vacancy.id}
                    className="flex overflow-hidden rounded-3xl border-purple-100 bg-white shadow-sm"
                  >
                    <CardContent className="flex w-full min-w-0 flex-col p-6">
                      <div className="mb-5 flex flex-wrap gap-2">
                        <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-[#6A3AB2]">
                          {categoryLabels[vacancy.content.category]}
                        </span>
                        <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-[#934000]">
                          {availabilityLabels[vacancy.availability]}
                        </span>
                      </div>
                      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500">
                        {vacancy.reference}
                      </p>
                      <h3 className="break-words text-xl font-bold leading-7 text-[#24143b]">
                        <Link
                          to={`/careers/${vacancy.slug}`}
                          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6A3AB2]"
                        >
                          {vacancy.content.title}
                        </Link>
                      </h3>
                      <p className="mt-3 flex items-start gap-2 break-words text-sm leading-6 text-slate-600">
                        <MapPin
                          className="mt-1 h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                        {vacancy.content.location} ·{" "}
                        {arrangementLabels[vacancy.content.workArrangement]}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {engagementLabels[vacancy.content.engagementType]} ·{" "}
                        {scheduleLabels[vacancy.content.scheduleType]}
                      </p>
                      <p className="mt-4 line-clamp-3 break-words leading-7 text-slate-600">
                        {vacancy.content.summary}
                      </p>
                      <p className="mb-5 mt-4 text-sm leading-6 text-slate-600">
                        Closing: {vacancyDate(vacancy.content.closesAt)}
                      </p>
                      <Button
                        asChild
                        className="mt-auto min-h-12 rounded-full bg-[#6A3AB2] hover:bg-[#552c94]"
                      >
                        <Link to={`/careers/${vacancy.slug}`}>
                          View opportunity{" "}
                          <ArrowRight
                            className="ml-2 h-4 w-4"
                            aria-hidden="true"
                          />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="overflow-hidden rounded-3xl border-purple-100 bg-white shadow-xl shadow-purple-100/30">
                <div
                  aria-hidden="true"
                  className="h-1 bg-gradient-to-r from-[#6A3AB2] to-[#FF6F00]"
                />
                <CardContent className="px-5 py-10 text-center sm:px-12 sm:py-14">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-purple-50">
                    <Briefcase
                      aria-hidden="true"
                      className="h-9 w-9 text-[#6A3AB2]"
                      strokeWidth={1.5}
                    />
                  </div>
                  <h3 className="text-2xl font-bold text-[#24143b]">
                    {vacancies.length
                      ? "No opportunities in this category"
                      : "No Current Vacancies"}
                  </h3>
                  <p className="mx-auto mt-4 max-w-lg leading-7 text-slate-600">
                    {vacancies.length
                      ? "Choose another role category to explore our published opportunities."
                      : "Thank you for your interest in joining Viva Tutorials. Future opportunities will be listed here. Please check back for updates."}
                  </p>
                  <Button
                    asChild
                    variant="outline"
                    className="mt-6 min-h-12 rounded-full border-[#6A3AB2] text-[#6A3AB2]"
                  >
                    <Link to="/about">
                      About Viva Tutorials{" "}
                      <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            {!loading && !error && (offset > 0 || nextOffset !== null) && (
              <nav
                aria-label="Vacancy pages"
                className="mt-7 flex flex-wrap items-center justify-between gap-3"
              >
                <p className="text-sm text-slate-600" aria-live="polite">
                  Showing {offset + 1}–{offset + visible.length} of {total}{" "}
                  opportunities
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - 20))}
                  >
                    Previous page
                  </Button>
                  <Button
                    variant="outline"
                    disabled={nextOffset === null}
                    onClick={() => {
                      if (nextOffset !== null) setOffset(nextOffset);
                    }}
                  >
                    Next page
                  </Button>
                </div>
              </nav>
            )}
          </div>
        </section>
        <section
          aria-labelledby="talent-pool-heading"
          className="px-5 pb-16 sm:px-6 sm:pb-24"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-5 rounded-3xl bg-[#6A3AB2] px-6 py-8 text-white sm:flex-row sm:items-start sm:px-10">
            <Users
              className="h-10 w-10 shrink-0 text-[#ffbd89]"
              aria-hidden="true"
            />
            <div>
              <h2 id="talent-pool-heading" className="text-2xl font-bold">
                Stay connected with future opportunities
              </h2>
              <p className="mt-3 max-w-2xl leading-7 text-white/90">
                Our future talent pool will welcome interest from tutors,
                administrators and support staff, even when no matching role is
                advertised.
              </p>
              <p className="mt-3 text-sm leading-6 text-white/90">
                {poolEnabled ? (
                  <a
                    className="underline font-bold"
                    href="/recruitment/talent-pool"
                  >
                    Register for the general talent pool
                  </a>
                ) : (
                  "Talent-pool registration is not available yet. We are not collecting registrations or personal information here."
                )}
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
