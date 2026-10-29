import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { FinancialRecoveryControls } from "@/components/admin/FinancialRecoveryControls";
import type { RecoverySnapshot } from "@/lib/recovery-types";
const id = "22222222-2222-4222-8222-222222222222";
let snapshot: RecoverySnapshot;
beforeEach(() => {
  snapshot = {
    month: "2026-10-01",
    fingerprint: "preview-fingerprint",
    candidates: [
      {
        id,
        learner_name: "Test Learner",
        application_number: "VT-TEST",
        grade_level: "Grade 12",
        starts_on: "2026-10-01",
        ends_on: "2026-10-31",
        amount_cents: 50000,
      },
    ],
    sales: {
      role: "owner",
      authorized: false,
      unposted: 0,
      deliveryAttention: 0,
      clearingCents: 0,
      payments: [],
      deliveries: [],
      settlements: [],
      limited: false,
    },
  };
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
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const props = {
  today: "2026-10-29",
  booksStart: "2026-01-01",
  changed: vi.fn(async () => {}),
};
it("requires learner selection and explicit review before issuing recovery invoices, preserving the preview fingerprint", async () => {
  const writes: Record<string, unknown>[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_, options) => {
    if (options?.method === "POST") {
      writes.push(JSON.parse(String(options.body)));
      snapshot.candidates = [];
      return new Response('{"success":true}');
    }
    return new Response(JSON.stringify(snapshot));
  });
  render(<FinancialRecoveryControls {...props} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Review missing invoices" }),
  );
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByLabelText(/Test Learner/));
  fireEvent.click(
    within(dialog).getByLabelText(/I reviewed the service dates/),
  );
  fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), {
    target: { value: "Reviewed service and prior invoices" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Review before saving" }),
  );
  expect(writes).toHaveLength(0);
  expect(
    within(dialog).getByText(/Test Learner · 2026-10-01/),
  ).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    action: "recover_billing",
    applications: [id],
    fingerprint: "preview-fingerprint",
    month: "2026-10-01",
    reviewed: true,
  });
  await screen.findByText("No eligible missing invoices for this month.");
});
it("keeps financial viewers read-only and makes no implicit provider request", async () => {
  snapshot.sales.role = "viewer";
  snapshot.sales.deliveries = [
    {
      id,
      order_id: id,
      product: "Test PDF",
      kind: "customer",
      recipient: "buyer@example.test",
      state: "uncertain",
      display_state: "uncertain",
      provider_id: null,
      last_error: "Check provider history",
    },
  ];
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(snapshot)));
  render(<FinancialRecoveryControls {...props} />);
  await screen.findByText(
    "Only a finance owner can preview and recover missing invoices.",
  );
  fireEvent.click(screen.getByRole("button", { name: "PDF sales" }));
  expect(
    screen.queryByRole("button", { name: "Review provider outcome" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Send pending emails" }),
  ).not.toBeInTheDocument();
  expect(
    fetch.mock.calls.every(
      ([, options]) => !options?.method || options.method === "GET",
    ),
  ).toBe(true);
});
