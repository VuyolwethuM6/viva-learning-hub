// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  lifecycleNotification,
  recruitmentLifecycle,
} from "../../api/_lib/recruitment-lifecycle-worker";
import { intakeRpc } from "../../api/_lib/recruitment-intake";

vi.mock("../../api/_lib/recruitment-intake", () => ({ intakeRpc: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it("routes lifecycle work through the existing bounded service RPC", async () => {
  const counts = { interviewsReminded: 1, offersExpired: 2, offersReminded: 3, onboardingReminded: 4 };
  vi.mocked(intakeRpc).mockResolvedValue(counts);
  await expect(recruitmentLifecycle(1000)).resolves.toEqual(counts);
  expect(intakeRpc).toHaveBeenCalledWith("recruitment_lifecycle_tick", { p_limit: 10 });
  await recruitmentLifecycle(-10);
  expect(intakeRpc).toHaveBeenLastCalledWith("recruitment_lifecycle_tick", { p_limit: 1 });
});

it("keeps lifecycle notifications generic and requires accountless verification", () => {
  for (const template of ["selection_status", "engagement_status", "interview_reminder", "offer_reminder", "offer_expired", "onboarding_reminder"]) {
    const body = lifecycleNotification(template, "https://viva.example.test");
    expect(body).toContain("https://viva.example.test/recruitment/recover");
    expect(body).toContain("Verify your email");
    expect(body).toContain("does not grant staff access");
    expect(body).not.toMatch(/score|bank|salary|meeting|proof=|token=|password|interviewer/i);
  }
  expect(lifecycleNotification("unknown", "https://viva.example.test")).toBeNull();
});

it("propagates failed lifecycle scheduling for observability and safe retry", async () => {
  vi.mocked(intakeRpc).mockRejectedValue(new Error("service_unavailable"));
  await expect(recruitmentLifecycle()).rejects.toThrow("service_unavailable");
});
