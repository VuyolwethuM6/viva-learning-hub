import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecruitmentSecurityWorkspace } from "@/components/admin/recruitment/RecruitmentSecurityWorkspace";
import { RecruitmentError } from "@/lib/recruitment-client";
import type { RecruitmentSnapshot } from "@/lib/recruitment-types";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/recruitment-client", async (original) => ({
  ...(await original<typeof import("@/lib/recruitment-client")>()),
  recruitmentRequest: send,
}));
const id = "11111111-1111-4111-8111-111111111111";
const snapshot = (
  role: "owner" | "manager" | "officer" = "owner",
): RecruitmentSnapshot => ({
  user: { id, email: "staff@example.test", role, revision: 0 },
  settings: {
    revision: 1,
    staff_console_enabled: false,
    access_guards_enabled: false,
    privacy_policy_version: "",
    draft_days: 14,
    unsuccessful_months: 6,
    talent_pool_months: 12,
  },
  features: { activation: false, applications: false },
  staff: [],
  scopes: [],
  grants: [],
  events: [],
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("recruitment security review", () => {
  it("requires exact-choice review and fresh authentication before any mutation", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    send.mockImplementation(async (route) =>
      route === "reauthenticate"
        ? { proof: "a".repeat(64) }
        : { result: { saved: true } },
    );
    render(
      <RecruitmentSecurityWorkspace snapshot={snapshot()} reload={reload} />,
    );
    fireEvent.change(screen.getByLabelText("Scope label"), {
      target: { value: "Tutor vacancy scope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review new scope" }));
    expect(send).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Tutor vacancy scope")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Confirm staff password"), {
      target: { value: "test-password" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Authenticate and confirm" }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      "reauthenticate",
      "mutate",
    ]);
    expect(send.mock.calls[0][1].data).toEqual(send.mock.calls[1][1].data);
    expect(send.mock.calls[1][1]).not.toHaveProperty("password");
    await waitFor(() => expect(screen.getByRole("button", { name: "Review new scope" })).toHaveFocus());
  });
  it("keeps the same proof and request after an uncertain response and requires retry confirmation", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    let attempt = 0;
    send.mockImplementation(async (route) => {
      if (route === "reauthenticate") return { proof: "a".repeat(64) };
      if (attempt++ === 0)
        throw new RecruitmentError("Uncertain test outcome", 0);
      return { result: { saved: true } };
    });
    render(
      <RecruitmentSecurityWorkspace snapshot={snapshot()} reload={reload} />,
    );
    fireEvent.change(screen.getByLabelText("Scope label"), {
      target: { value: "Stable scope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review new scope" }));
    fireEvent.change(screen.getByLabelText("Confirm staff password"), {
      target: { value: "test-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Authenticate and confirm" }),
    );
    await screen.findByText("Uncertain test outcome");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    const mutations = send.mock.calls.filter((c) => c[0] === "mutate");
    expect(mutations[0][1]).toEqual(mutations[1][1]);
  });
  it("shows no owner controls or released hiring/activation operations for officers", () => {
    render(
      <RecruitmentSecurityWorkspace
        snapshot={snapshot("officer")}
        reload={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Review/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No scopes assigned.")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });
});
