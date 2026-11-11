import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Careers from "@/pages/Careers";
import VacancyDetail from "@/pages/VacancyDetail";
import RouteMetadata from "@/components/RouteMetadata";
import {
  publicContentFixture,
  publicVacancyFixture,
} from "./fixtures/public-vacancy";
vi.mock("@/components/Header", () => ({
  TopBar: () => null,
  StickyHeader: () => null,
}));
vi.mock("@/components/Footer", () => ({ default: () => null }));
function renderPage(path = "/careers") {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <RouteMetadata />
      <Routes>
        <Route path="/careers" element={<Careers />} />
        <Route path="/careers/:slug" element={<VacancyDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}
const response = (vacancies: unknown[] = [], enabled = true) =>
  new Response(
    JSON.stringify({
      enabled,
      generation: 1,
      vacancies,
      total: vacancies.length,
      nextOffset: null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("public vacancy browsing", () => {
  it("loads published database-backed cards and filters roles without presenting application controls", async () => {
    const tutor = publicVacancyFixture(),
      admin = publicVacancyFixture({
        id: "22222222-2222-4222-8222-222222222222",
        reference: "VIVA-2026-000002",
        slug: "administrator-viva-2026-000002",
        content: publicContentFixture({
          title: "Office administrator",
          category: "administrator",
          subjects: [],
          grades: [],
        }),
      });
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response([tutor, admin]))
      .mockResolvedValueOnce(response([admin]));
    renderPage();
    expect(
      screen.getByText("Loading current opportunities…"),
    ).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Mathematics tutor" });
    expect(
      screen.getByRole("heading", { name: "Office administrator" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 opportunities")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Role category" }), {
      target: { value: "administrator" },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Mathematics tutor" }),
      ).not.toBeInTheDocument(),
    );
    await screen.findByRole("heading", { name: "Office administrator" });
    expect(
      screen.getByRole("link", { name: /View opportunity/ }),
    ).toHaveAttribute("href", "/careers/administrator-viva-2026-000002");
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/careers",
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        cache: "no-cache",
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/careers?category=administrator",
      expect.objectContaining({ method: "GET" }),
    );
    expect(
      screen.queryByRole("button", { name: /apply/i }),
    ).not.toBeInTheDocument();
    expect(document.querySelector("form")).toBeNull();
  });
  it("shows a useful empty state and a future talent-pool area without collecting information", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response([], false));
    renderPage();
    await screen.findByRole("heading", { name: "No Current Vacancies" });
    expect(
      screen.getByRole("heading", {
        name: "Stay connected with future opportunities",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Talent-pool registration is not available yet/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.querySelector("form")).toBeNull();
    expect(document.title).toBe(
      "Careers at Viva Tutorials | Current Vacancies",
    );
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).not.toContain("currently no open");
  });
  it("distinguishes fetch failure from no vacancies and supports explicit retry", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(response([publicVacancyFixture()]));
    renderPage();
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("heading", { name: "No Current Vacancies" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Mathematics tutor" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("renders approved detail content, separates engagement from schedule and updates canonical metadata", async () => {
    const vacancy = publicVacancyFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response([vacancy]));
    renderPage("/careers/" + vacancy.slug);
    await screen.findByRole("heading", { name: "Mathematics tutor" });
    expect(
      screen.getByRole("heading", { name: "Responsibilities" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Prepare engaging mathematics sessions."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Applicable grades" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Independent contractor · Part-time · 2 positions/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Applications are not yet available",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /apply/i }),
    ).not.toBeInTheDocument();
    expect(document.title).toBe("Mathematics tutor | Viva Tutorials Careers");
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe("https://www.vivatutorials.co.za/careers/" + vacancy.slug);
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("index,follow");
    expect(
      document.querySelector('script[type="application/ld+json"]'),
    ).toBeNull();
  });
  it("does not render tutor-only sections for staff vacancies and displays text safely", async () => {
    const vacancy = publicVacancyFixture({
      content: publicContentFixture({
        title: "Support <img src=x onerror=alert(1)>",
        category: "support_staff",
        subjects: [],
        grades: [],
        summary: "Treat <script>alert('x')</script> as plain approved text.",
      }),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response([vacancy]));
    renderPage("/careers/" + vacancy.slug);
    await screen.findByRole("heading", { name: vacancy.content.title });
    expect(
      screen.queryByRole("heading", { name: "Subject specialization" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector("article h1 img")).toBeNull();
    expect(document.querySelector("article script")).toBeNull();
  });
  it("keeps unavailable detail noindex and offers navigation without leaking a cached vacancy", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unavailable" }), { status: 404 }),
    );
    renderPage("/careers/closed-vacancy");
    await screen.findByRole("heading", {
      name: "This vacancy is not available",
    });
    expect(
      screen.getByRole("link", { name: "View current opportunities" }),
    ).toHaveAttribute("href", "/careers");
    await waitFor(() =>
      expect(
        document.querySelector('meta[name="robots"]')?.getAttribute("content"),
      ).toBe("noindex,follow"),
    );
    expect(
      screen.queryByRole("heading", { name: "Responsibilities" }),
    ).not.toBeInTheDocument();
  });
  it("navigates bounded server pages and resets to the first page when the category changes", async () => {
    const page = Array.from({ length: 20 }, (_, index) =>
      publicVacancyFixture({
        id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
        slug: `tutor-role-${index + 1}`,
        content: publicContentFixture({
          title: `Tutor opportunity ${index + 1}`,
        }),
      }),
    );
    const last = publicVacancyFixture({
      slug: "last-support-role",
      content: publicContentFixture({
        title: "Support assistant",
        category: "support_staff",
        subjects: [],
        grades: [],
      }),
    });
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            enabled: true,
            generation: 1,
            vacancies: page,
            total: 21,
            nextOffset: 20,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            enabled: true,
            generation: 1,
            vacancies: [last],
            total: 21,
            nextOffset: null,
          }),
        ),
      )
      .mockResolvedValueOnce(response([last]));
    renderPage();
    await screen.findByRole("heading", { name: "Tutor opportunity 1" });
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByRole("heading", { name: "Support assistant" });
    expect(
      screen.getByText("Showing 21–21 of 21 opportunities"),
    ).toBeInTheDocument();
    expect(fetcher.mock.calls[1][0]).toBe("/api/careers?offset=20");
    fireEvent.change(screen.getByRole("combobox", { name: "Role category" }), {
      target: { value: "support_staff" },
    });
    await screen.findByRole("heading", { name: "Support assistant" });
    expect(fetcher.mock.calls[2][0]).toBe(
      "/api/careers?category=support_staff",
    );
  });
});
