import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecruitmentAdmin from "@/pages/RecruitmentAdmin";
import type { RecruitmentSnapshot } from "@/lib/recruitment-types";
import { MemoryRouter } from "react-router-dom";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/recruitment-client", async (original) => ({
  ...(await original<typeof import("@/lib/recruitment-client")>()),
  recruitmentRequest: send,
}));
vi.mock("@/components/admin/recruitment/RecruitmentVacancyWorkspace", () => ({
  RecruitmentVacancyWorkspace: () => <p>Vacancy workspace is accessible</p>,
}));
vi.mock("@/components/admin/recruitment/RecruitmentSelectionWorkspace", () => ({
  RecruitmentSelectionWorkspace: ({ section }: { section?: string }) => <p>{section === "reports" ? "Scoped recruitment reporting" : "Selection workspace is accessible"}</p>,
}));
vi.mock("@/components/admin/recruitment/RecruitmentEngagementWorkspace", () => ({
  RecruitmentEngagementWorkspace: () => <p>Engagement workspace is accessible</p>,
}));
vi.mock("@/components/admin/recruitment/RecruitmentCasesWorkspace", () => ({
  RecruitmentCasesWorkspace: () => <p>Scoped case messaging</p>,
}));
vi.mock("@/components/admin/recruitment/RecruitmentFormsWorkspace", () => ({
  RecruitmentFormsWorkspace: () => <p>Owner intake policy workspace</p>,
}));
const snapshot: RecruitmentSnapshot = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.test",
    role: "owner",
    revision: 0,
  },
  settings: {
    revision: 1,
    staff_console_enabled: false,
    access_guards_enabled: false,
    privacy_policy_version: "",
    draft_days: 14,
    unsuccessful_months: 6,
    talent_pool_months: 12,
  },
  features: { applications: false, activation: false },
  staff: [],
  scopes: [],
  grants: [],
  events: [],
};
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.resetAllMocks();
});
describe("recruitment navigation after request recovery", () => {
  it("enables the vacancy tab after completed recovery clears the pending marker", async () => {
    sessionStorage.setItem(
      "viva.recruitment.pendingRequestId",
      crypto.randomUUID(),
    );
    let complete: (value: unknown) => void;
    const recovery = new Promise((resolve) => {
      complete = resolve;
    });
    send.mockImplementation(async (route) =>
      route === "snapshot" ? snapshot : recovery,
    );
    render(
      <MemoryRouter>
        <RecruitmentAdmin />
      </MemoryRouter>,
    );
    const vacancies = await screen.findByRole("button", {
      name: "Vacancy management",
    });
    expect(vacancies).toBeDisabled();
    complete!({ completed: true });
    await waitFor(() => expect(vacancies).not.toBeDisabled());
    expect(sessionStorage.length).toBe(0);
    fireEvent.click(vacancies);
    expect(
      screen.getByText("Vacancy workspace is accessible"),
    ).toBeInTheDocument();
    expect(send.mock.calls.filter((c) => c[0] === "snapshot")).toHaveLength(1);
  });
});

describe("integrated recruitment dashboard navigation", () => {
  it("uses the Admin shell and preserves the official brand with owner settings", async () => {
    send.mockResolvedValue(snapshot);
    const { container } = render(<MemoryRouter initialEntries={["/admin/recruitment/overview"]}><RecruitmentAdmin /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Recruitment overview", level: 1 })).toBeInTheDocument();
    expect(container.querySelector(".admin-shell .admin-sidebar")).not.toBeNull();
    expect(container.querySelector(".admin-workspace .admin-topbar")).not.toBeNull();
    expect(screen.getByRole("link", {name: "Admin Dashboard"})).toHaveAttribute("href", "/admin");
    expect(screen.getAllByAltText("Viva Tutorials")[0]).toHaveAttribute("src", "/viva-tutorials-logo.png");
    expect(screen.getByRole("button", {name: "Forms and intake"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Deployment dashboard"})).toBeInTheDocument();
    expect(screen.getByText("Public visibility and application intake have separate controls. Intake remains subject to privacy, form, security and operational approvals.")).toBeInTheDocument();
  });
  it("routes desktop and mobile navigation through the same workspaces", async () => {
    send.mockResolvedValue(snapshot);
    render(<MemoryRouter initialEntries={["/admin/recruitment/selection"]}><RecruitmentAdmin /></MemoryRouter>);
    expect(await screen.findByText("Selection workspace is accessible")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Recruitment section"), {target: {value: "engagement"}});
    expect(await screen.findByText("Engagement workspace is accessible")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Offers, onboarding and staff"})).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", {name: "Recruitment reports"}));
    expect(await screen.findByText("Scoped recruitment reporting")).toBeInTheDocument();
    expect(screen.getByLabelText("Recruitment section")).toHaveValue("reports");
  });
  it("preserves the applications deep link used by candidate messaging", async () => {
    send.mockResolvedValue(snapshot);
    render(<MemoryRouter initialEntries={["/admin/recruitment/applications"]}><RecruitmentAdmin /></MemoryRouter>);
    expect(await screen.findByText("Scoped case messaging")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Applications and talent pool"})).toHaveAttribute("aria-current", "page");
  });
  it("does not expose owner settings or render forms through a manager deep link", async () => {
    send.mockResolvedValue({...snapshot, user: {...snapshot.user, role: "manager"}});
    render(<MemoryRouter initialEntries={["/admin/recruitment/forms"]}><RecruitmentAdmin /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Recruitment owner access is required");
    expect(screen.queryByRole("button", {name: "Forms and intake"})).not.toBeInTheDocument();
    expect(screen.queryByRole("link", {name: "Deployment dashboard"})).not.toBeInTheDocument();
    expect(screen.queryByText("Owner intake policy workspace")).not.toBeInTheDocument();
  });
  it("keeps deployment preparation owner only for a direct officer URL", async () => {
    send.mockResolvedValue({...snapshot, user: {...snapshot.user, role: "officer"}});
    render(<MemoryRouter initialEntries={["/admin/recruitment/deployment"]}><RecruitmentAdmin /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Recruitment owner access is required for deployment preparation");
    expect(screen.queryByRole("option", {name: "Deployment dashboard"})).not.toBeInTheDocument();
  });
  it("does not render staff navigation when recruitment authentication fails", async () => {
    send.mockRejectedValue(new Error("Sign in to recruitment."));
    render(<MemoryRouter initialEntries={["/admin/recruitment/engagement"]}><RecruitmentAdmin /></MemoryRouter>);
    expect(await screen.findByRole("heading", {name: "Recruitment staff sign-in"})).toBeInTheDocument();
    expect(screen.queryByRole("navigation", {name: "Recruitment workspace"})).not.toBeInTheDocument();
  });
});
