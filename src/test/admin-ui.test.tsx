import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Admin from "@/pages/Admin";
import { firstInvoiceEstimate, type Snapshot } from "@/lib/admin-types";

const actor = "11111111-1111-4111-8111-111111111111";
const appId = "22222222-2222-4222-8222-222222222222";
const invoiceId = "33333333-3333-4333-8333-333333333333";
let snapshot: Snapshot;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
const view = () =>
  render(
    <HelmetProvider>
      <Admin />
    </HelmetProvider>,
  );
beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal)
    HTMLDialogElement.prototype.showModal = function () {};
  if (!HTMLDialogElement.prototype.close)
    HTMLDialogElement.prototype.close = function () {};
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(
    function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
  });
  snapshot = {
    today: "2026-10-26",
    truncated: false,
    closures: [],
    programmes: [
      {
        grade: "Grade 10",
        label: "Grades 10–11 afternoon programme",
        weekdays: [1, 2, 3, 4, 5, 6],
      },
    ],
    messages: [],
    payments: [],
    audit: [],
    applications: [
      {
        id: appId,
        application_number: "VT-TEST",
        student_number: "VT-2026-000001",
        learner_name: "Test Learner",
        learner_email: "learner@example.test",
        guardian_name: "Test Parent",
        guardian_email: "parent@example.test",
        grade_level: "Grade 10",
        tutoring_mode: "Online",
        selected_subjects: ["Mathematics"],
        selected_goals: ["Improve marks"],
        monthly_fee: 500,
        status: "pending_review",
        created_at: "2026-10-26T10:00:00Z",
        tuition_start_date: null,
      },
    ],
    invoices: [],
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function network() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/session"))
        return json({ user: { id: actor, email: "admin@example.test" } });
      if (!init?.body) return json(snapshot);
      const body = JSON.parse(String(init.body));
      if (body.action === "approve")
        snapshot.applications[0].status = "pending_payment";
      return json({ success: true });
    });
}
describe("admin interface", () => {
  it("shows sign-in without leaking records for an unauthenticated request", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json({ error: "Please sign in" }, 401));
    view();
    expect(
      await screen.findByRole("button", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Test Learner")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("loads real counts and makes future sections explicit placeholders", async () => {
    network();
    view();
    await screen.findByRole("heading", { name: "Your tuition operations" });
    fireEvent.click(screen.getByRole("button", { name: "System health" }));
    expect(screen.getByText("Not available yet.")).toBeInTheDocument();
    expect(screen.queryByText("All systems healthy")).not.toBeInTheDocument();
  });
  it("sends an approval request with the selected start date and refreshes status", async () => {
    const fetch = network();
    view();
    await screen.findByRole("heading", { name: "Your tuition operations" });
    fireEvent.click(screen.getByRole("button", { name: "Applications" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Test Learner" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Agreed start date"), {
      target: { value: "2026-11-16" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Approve and issue invoice" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const requests = fetch.mock.calls.map(([, init]) =>
      init?.body ? JSON.parse(String(init.body)) : {},
    );
    expect(requests).toContainEqual({
      action: "approve",
      applicationId: appId,
      startDate: "2026-11-16",
      note: "",
    });
  });
  it("keeps activation unavailable until the first invoice is settled", async () => {
    snapshot.applications[0].status = "pending_payment";
    snapshot.invoices = [
      {
        id: invoiceId,
        application_id: appId,
        number: "VT-T-00000001",
        billing_month: "2026-11-01",
        period_start: "2026-11-16",
        period_end: "2026-11-30",
        due_date: "2026-11-16",
        monthly_fee: 500,
        teaching_days: 21,
        remaining_days: 11,
        amount_cents: 26190,
        paid_cents: 100,
        created_at: "2026-10-26T10:00:00Z",
      },
    ];
    network();
    view();
    await screen.findByRole("heading", { name: "Your tuition operations" });
    fireEvent.click(screen.getByRole("button", { name: "Applications" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Test Learner" }));
    expect(
      screen.getByRole("button", { name: "Activate learner" }),
    ).toBeDisabled();
  });
  it("retains one payment request id across a failed attempt and retry", async () => {
    snapshot.invoices = [
      {
        id: invoiceId,
        application_id: appId,
        number: "VT-T-00000001",
        billing_month: "2026-11-01",
        period_start: "2026-11-16",
        period_end: "2026-11-30",
        due_date: "2026-11-16",
        monthly_fee: 500,
        teaching_days: 21,
        remaining_days: 11,
        amount_cents: 26190,
        paid_cents: 0,
        created_at: "2026-10-26T10:00:00Z",
      },
    ];
    const fetch = network();
    const original = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (input, init) =>
      init?.body && JSON.parse(String(init.body)).action === "payment"
        ? json({ error: "Unknown outcome; refresh before retrying" }, 502)
        : original(input, init),
    );
    view();
    await screen.findByRole("heading", { name: "Your tuition operations" });
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    fireEvent.click(screen.getByRole("button", { name: "View VT-T-00000001" }));
    fireEvent.change(screen.getByLabelText("Amount allocated (rand)"), {
      target: { value: "100" },
    });
    fireEvent.change(
      screen.getByLabelText("Unique bank transaction ID / cash receipt number"),
      { target: { value: "BANK-123" } },
    );
    fireEvent.change(screen.getByLabelText("Verification note"), {
      target: { value: "Matched against statement" },
    });
    fireEvent.click(
      screen.getByLabelText(
        "I have verified funds received and the invoice allocation.",
      ),
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Record verified payment" })
        .closest("form")!,
    );
    await screen.findByRole("alert");
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Record verified payment" })
        .closest("form")!,
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.filter(
          ([, init]) =>
            init?.body && JSON.parse(String(init.body)).action === "payment",
        ),
      ).toHaveLength(2),
    );
    const requests = fetch.mock.calls
      .filter(
        ([, init]) =>
          init?.body && JSON.parse(String(init.body)).action === "payment",
      )
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(requests[0].paymentId).toBe(requests[1].paymentId);
    expect(requests[0].amountCents).toBe(10000);
  });
});

describe("invoice display estimate", () => {
  it("excludes closures and counts actual calendar weekdays, not four fixed weeks", () => {
    expect(
      firstInvoiceEstimate(800, "2026-10-16", ["2026-10-19"], [1, 2, 3, 4, 5]),
    ).toEqual({ total: 21, remaining: 10, cents: 38095 });
    expect(
      firstInvoiceEstimate(800, "not-a-date", [], [1, 2, 3, 4, 5]),
    ).toBeNull();
  });
});
