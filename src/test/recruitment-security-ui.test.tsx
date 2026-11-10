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
import { emptyVacancyContent } from "@/lib/recruitment-vacancies";
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
  sessionStorage.clear();
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
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review new scope" }),
      ).toHaveFocus(),
    );
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
  it("restores the original review after reload using only a persisted request UUID", async () => {
    const pendingId = crypto.randomUUID(),
      data = {
        requestId: pendingId,
        kind: "vacancy",
        label: "Private server-held label",
      };
    sessionStorage.setItem("viva.recruitment.pendingRequestId", pendingId);
    send.mockImplementation(async (route) =>
      route === "recover"
        ? { operation: "scope_create", data, completed: false }
        : route === "reauthenticate"
          ? { proof: "a".repeat(64) }
          : { result: { saved: true } },
    );
    const reload = vi.fn().mockResolvedValue(undefined);
    render(
      <RecruitmentSecurityWorkspace snapshot={snapshot()} reload={reload} />,
    );
    await screen.findByRole("dialog");
    expect(screen.getByText(data.label)).toBeInTheDocument();
    expect(Object.values(sessionStorage)).toEqual([pendingId]);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Confirm staff password"), {
      target: { value: "never-persist-this" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Authenticate and confirm" }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(
      send.mock.calls.find((c) => c[0] === "mutate")?.[1].data.requestId,
    ).toBe(pendingId);
    expect(sessionStorage.length).toBe(0);
  });
  it("keeps prior uncertain outcomes recoverable even when a later retry is rejected", async () => {
    send.mockImplementation(async (route) => {
      if (route === "reauthenticate") return { proof: "a".repeat(64) };
      throw new RecruitmentError("Gateway timeout", 408);
    });
    render(
      <RecruitmentSecurityWorkspace snapshot={snapshot()} reload={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Scope label"), {
      target: { value: "Pending scope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review new scope" }));
    fireEvent.change(screen.getByLabelText("Confirm staff password"), {
      target: { value: "test-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Authenticate and confirm" }),
    );
    await screen.findByText("Gateway timeout");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(Object.values(sessionStorage)).toEqual([
      send.mock.calls[1][1].data.requestId,
    ]);
    send.mockRejectedValueOnce(
      new RecruitmentError("Revision changed", 409, true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
    await screen.findByText("Revision changed");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(sessionStorage.length).toBe(1);
  });
  it("does not repeat a completed request restored after reload", async () => {
    sessionStorage.setItem(
      "viva.recruitment.pendingRequestId",
      crypto.randomUUID(),
    );
    send.mockResolvedValue({ completed: true });
    render(
      <RecruitmentSecurityWorkspace snapshot={snapshot()} reload={vi.fn()} />,
    );
    await screen.findByText(/already recorded/);
    expect(send.mock.calls.map((c) => c[0])).toEqual(["recover"]);
    expect(sessionStorage.length).toBe(0);
  });

  it("permits correction when the first mutation has a confirmed application rejection", async () => {
    send.mockImplementation(async (route) => {
      if (route === "reauthenticate") return { proof: "a".repeat(64) };
      throw new RecruitmentError("Confirmed stale revision", 409, true);
    });
    render(
      <RecruitmentSecurityWorkspace snapshot={snapshot()} reload={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Scope label"), {
      target: { value: "Rejected scope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review new scope" }));
    fireEvent.change(screen.getByLabelText("Confirm staff password"), {
      target: { value: "test-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Authenticate and confirm" }),
    );
    await screen.findByText("Confirmed stale revision");
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
    expect(sessionStorage.length).toBe(0);
  });
  it("restores the authorized immutable vacancy context before an owner retries publication", async () => {
    const requestId = crypto.randomUUID(),
      vacancyId = crypto.randomUUID(),
      versionId = crypto.randomUUID();
    const content = {
      ...emptyVacancyContent(),
      title: "Reviewed mathematics tutor",
    };
    sessionStorage.setItem("viva.recruitment.pendingRequestId", requestId);
    send.mockImplementation(async (route) =>
      route === "recover"
        ? {
            operation: "vacancy_publish",
            data: { requestId, vacancyId, expectedRevision: 2, reason: "" },
            completed: false,
          }
        : {
            vacancies: [
              {
                id: vacancyId,
                reference: "VIVA-TEST-1",
                revision: 2,
                draftVersionId: versionId,
              },
            ],
            versions: [{ id: versionId, number: 1, content }],
          },
    );
    render(
      <RecruitmentSecurityWorkspace snapshot={snapshot()} reload={vi.fn()} />,
    );
    await screen.findByRole("region", { name: "Recovered vacancy review" });
    expect(screen.getByText(content.title)).toBeInTheDocument();
    expect(screen.getByText(/Current version 1/)).toBeInTheDocument();
    expect(send.mock.calls.map((c) => c[0])).toEqual(["recover", "vacancies"]);
    expect(send.mock.calls[1][5]).toEqual({ vacancyId });
    expect(Object.values(sessionStorage)).toEqual([requestId]);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    send.mockImplementation(async (route) =>
      route === "reauthenticate"
        ? { proof: "a".repeat(64) }
        : { result: { saved: true } },
    );
    fireEvent.change(screen.getByLabelText("Confirm staff password"), {
      target: { value: "test-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Authenticate and confirm" }),
    );
    await screen.findByText("Security change recorded.");
    fireEvent.change(screen.getByLabelText("Scope label"), {
      target: { value: "Different governance choice" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review new scope" }));
    expect(
      screen.queryByRole("region", { name: "Recovered vacancy review" }),
    ).not.toBeInTheDocument();
  });
  it("fails closed when pending publication details are no longer authorized", async () => {
    const requestId = crypto.randomUUID();
    sessionStorage.setItem("viva.recruitment.pendingRequestId", requestId);
    send.mockImplementation(async (route) => {
      if (route === "recover")
        return {
          operation: "vacancy_publish",
          data: {
            requestId,
            vacancyId: crypto.randomUUID(),
            expectedRevision: 2,
            reason: "",
          },
          completed: false,
        };
      throw new RecruitmentError("Scope revoked", 403, true);
    });
    render(
      <RecruitmentSecurityWorkspace snapshot={snapshot()} reload={vi.fn()} />,
    );
    await screen.findByText(/A pending request needs recovery/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(1);
    expect(
      screen.getByRole("button", { name: "Review new scope" }),
    ).toBeDisabled();
  });
});
