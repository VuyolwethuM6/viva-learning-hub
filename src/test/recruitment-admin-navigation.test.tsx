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
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/recruitment-client", async (original) => ({
  ...(await original<typeof import("@/lib/recruitment-client")>()),
  recruitmentRequest: send,
}));
vi.mock("@/components/admin/recruitment/RecruitmentVacancyWorkspace", () => ({
  RecruitmentVacancyWorkspace: () => <p>Vacancy workspace is accessible</p>,
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
    render(<RecruitmentAdmin />);
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
