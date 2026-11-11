import type { PublicVacancyResponse } from "@/lib/recruitment-vacancies";

export const categoryLabels = {
  tutor: "Tutors",
  administrator: "Administrators",
  support_staff: "Support staff",
};
export const engagementLabels = {
  employee: "Employee",
  independent_contractor: "Independent contractor",
  volunteer: "Volunteer",
};
export const scheduleLabels = {
  full_time: "Full-time",
  part_time: "Part-time",
  flexible: "Flexible",
};
export const arrangementLabels = {
  onsite: "On-site",
  remote: "Remote",
  hybrid: "Hybrid",
};
export const availabilityLabels = {
  opening_soon: "Opening soon",
  open: "Published opportunity",
  closed: "Application window closed",
};
export function vacancyDate(date: string | null) {
  if (!date) return "To be confirmed";
  return (
    new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(date)) + " SAST"
  );
}
export class PublicCareersError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function loadPublicVacancies(
  signal: AbortSignal,
  slug?: string,
  options: { offset?: number; category?: string } = {},
): Promise<PublicVacancyResponse> {
  const query = new URLSearchParams();
  if (slug) query.set("slug", slug);
  else {
    if (options.offset) query.set("offset", String(options.offset));
    if (options.category && options.category !== "all")
      query.set("category", options.category);
  }
  const response = await fetch(
    `/api/careers${query.toString() ? `?${query}` : ""}`,
    {
      method: "GET",
      credentials: "omit",
      cache: "no-cache",
      signal,
    },
  );
  if (!response.ok)
    throw new PublicCareersError(
      response.status === 404
        ? "This vacancy is not currently available."
        : "We couldn’t load current vacancies. Please try again.",
      response.status,
    );
  const body = await response.json();
  if (
    !body ||
    !Array.isArray(body.vacancies) ||
    typeof body.enabled !== "boolean" ||
    !Number.isSafeInteger(body.total) ||
    body.total < 0 ||
    !(body.nextOffset === null || Number.isSafeInteger(body.nextOffset))
  )
    throw new PublicCareersError(
      "We couldn’t load current vacancies. Please try again.",
      503,
    );
  return body as PublicVacancyResponse;
}

// Dynamic detail pages are not known at build time. Only authoritative published responses make them indexable.
export function publicVacancyMetadata(
  title: string,
  description: string,
  path: string,
  indexable: boolean,
) {
  const site = "https://www.vivatutorials.co.za";
  document.title = title;
  for (const [attribute, key, content] of [
    ["name", "description", description],
    ["name", "robots", indexable ? "index,follow" : "noindex,follow"],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", site + path],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
  ]) {
    const selector = `meta[${attribute}="${key}"]`;
    const matches = [
      ...document.head.querySelectorAll<HTMLMetaElement>(selector),
    ];
    const element = matches.shift() || document.createElement("meta");
    element.setAttribute(attribute, key);
    element.content = content;
    if (!element.isConnected) document.head.appendChild(element);
    matches.forEach((node) => node.remove());
  }
  const links = [
    ...document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'),
  ];
  const canonical = links.shift() || document.createElement("link");
  canonical.rel = "canonical";
  canonical.href = site + path;
  if (!canonical.isConnected) document.head.appendChild(canonical);
  links.forEach((node) => node.remove());
}
