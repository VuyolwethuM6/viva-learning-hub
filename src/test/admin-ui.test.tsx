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
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
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
      if (url.endsWith("/messages") && body.action === "cancel")
        snapshot.messages.find((m) => m.id === body.id)!.state = "cancelled";
      return json({ success: true });
    });
}
describe("admin interface", () => {
  it("links both desktop and mobile Admin navigation to the isolated recruitment entry", async () => {
    const fetch = network();
    view();
    await screen.findByRole("heading", { name: "Your daily overview" });
    expect(screen.getByRole("link", { name: "Recruitment" })).toHaveAttribute("href", "/admin/recruitment");
    fireEvent.click(screen.getByRole("button", { name: "More sections" }));
    const drawer = await screen.findByRole("dialog", { name: "Your workspace" });
    expect(within(drawer).getByRole("link", { name: "Recruitment" })).toHaveAttribute("href", "/admin/recruitment");
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/api/admin/recruitment"))).toBe(false);
  });
  it("shows billing-period collection at the top of Finance and removes it from Home", async () => {
    network();
    view();
    await screen.findByRole("heading", { name: "Your daily overview" });
    expect(
      screen.queryByRole("heading", {
        name: "Collection for this billing period",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    const collection = screen.getByRole("region", {
      name: "Collection for this billing period",
    });
    expect(
      within(collection).getByLabelText("Billing period"),
    ).toBeInTheDocument();
    expect(
      collection.compareDocumentPosition(
        screen.getByRole("heading", { name: "Invoice register" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
  it("separates applications awaiting review or payment from activated students", async () => {
    snapshot.applications.push({
      ...snapshot.applications[0],
      id: "44444444-4444-4444-8444-444444444444",
      learner_name: "Active Learner",
      status: "active",
    });
    network();
    view();
    await screen.findByRole("heading", { name: "Your daily overview" });
    fireEvent.click(screen.getByRole("button", { name: "1 Active learners" }));
    expect(
      screen.getByRole("heading", { name: "Students" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Applications" }));
    expect(
      screen.getByRole("button", { name: "Open Test Learner" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Active Learner" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Students" }));
    expect(
      screen.getByRole("button", { name: "Open Active Learner" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Test Learner" }),
    ).not.toBeInTheDocument();
  });
  it("shows an application empty state when only activated students exist", async () => {
    snapshot.applications[0].status = "active";
    network();
    view();
    await screen.findByRole("heading", { name: "Your daily overview" });
    fireEvent.click(screen.getByRole("button", { name: "Applications" }));
    expect(
      screen.getByText("No applications at the moment"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Test Learner" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Students" }));
    expect(
      screen.getByRole("button", { name: "Open Test Learner" }),
    ).toBeInTheDocument();
  });
  it("separates waiting notifications from history and cancels with a recorded reason", async () => {
    snapshot.messages = [
      {
        id: actor,
        invoice_id: invoiceId,
        kind: "receipt",
        state: "pending",
        attempts: 0,
        last_error: null,
        created_at: "2026-10-26T10:00:00Z",
        payload: {
          learner: "Test Learner",
          invoiceNumber: "VT-20261101",
          recipients: ["parent@example.test"],
          paidCents: 10000,
          balanceCents: 32667,
        },
      },
      {
        id: invoiceId,
        invoice_id: invoiceId,
        kind: "invoice",
        state: "sent",
        attempts: 1,
        last_error: null,
        created_at: "2026-10-25T10:00:00Z",
      },
    ];
    const fetch = network();
    view();
    await screen.findByRole("heading", { name: "Your daily overview" });
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("parent@example.test")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ready to send. This notification has not been sent yet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Accepted by the email provider. Inbox delivery has not been confirmed.",
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove from queue" }));
    const dialog = screen.getByRole("dialog", {
      name: "Remove this email from the queue?",
    });
    fireEvent.change(within(dialog).getByLabelText("Cancellation reason"), {
      target: { value: "Already sent payment confirmation personally" },
    });
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Cancel queued email" })
        .closest("form")!,
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("No notifications waiting")).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(
        ([, init]) =>
          init?.body &&
          JSON.parse(String(init.body)).action === "cancel" &&
          JSON.parse(String(init.body)).reason ===
            "Already sent payment confirmation personally",
      ),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Completed history (2)" }),
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove from queue" }),
    ).not.toBeInTheDocument();
  });
  it("presents audit actions, amounts, references, administrator and local time clearly", async () => {
    snapshot.audit = [
      {
        id: invoiceId,
        action: "payment",
        actor_id: actor,
        actor_email: "finance@example.test",
        application_id: appId,
        created_at: "2026-10-26T10:00:00Z",
        details: {
          amountCents: 10000,
          method: "EFT",
          paidOn: "2026-10-26",
          reference: "BANK-CLEAR-001",
          note: "Matched statement and amount",
        },
      },
    ];
    network();
    view();
    await screen.findByRole("heading", { name: "Your daily overview" });
    fireEvent.click(screen.getByRole("button", { name: "Audit" }));
    expect(screen.getByText("Verified payment recorded")).toBeInTheDocument();
    expect(
      screen.getByText(/Transaction reference: BANK-CLEAR-001/),
    ).toBeInTheDocument();
    expect(screen.getByText(/finance@example.test/)).toBeInTheDocument();
    expect(screen.getByText(/12:00 SAST/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search audit history"), {
      target: { value: "no matching event" },
    });
    expect(screen.getByText("No matching activity")).toBeInTheDocument();
  });
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
  it("opens System Health even when the normal records snapshot cannot load",async()=>{
    const fetch=network(),original=fetch.getMockImplementation()!;
    fetch.mockImplementation((url,init)=>String(url)==="/api/admin/records"?Promise.resolve(json({error:"Snapshot unavailable"},502)):String(url).includes("?system=health")?Promise.resolve(json({role:"owner",checkedAt:"2026-10-28T09:00:00Z",configuration:{email:false,scheduler:false,bankConfirmed:false,environment:"preview",commit:null},checks:[{id:"database",title:"Database & oversight setup",status:"unavailable",detail:"System checks could not load."}],overviewAvailable:false,health:null,issues:[],jobs:[],emailTests:[],backups:[]})):original(url,init));
    view();await screen.findByText("Your records couldn’t load");fireEvent.click(screen.getByRole("button",{name:"System health"}));await screen.findByRole("heading",{name:"Database & oversight setup"});expect(screen.getByText(/Only service checks ran/)).toBeInTheDocument();expect(screen.queryByRole("heading",{name:"Operational follow-up"})).not.toBeInTheDocument();
  });
  it("loads real counts and exposes functional oversight modules", async () => {
    network();
    view();
    await screen.findByRole("heading", { name: "Your daily overview" });
    expect(
      screen.queryByRole("button", { name: "System health" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("All systems healthy")).not.toBeInTheDocument();
  });
  it("sends an approval request with the selected start date and refreshes status", async () => {
    const fetch = network();
    view();
    await screen.findByRole("heading", { name: "Your daily overview" });
    fireEvent.click(screen.getByRole("button", { name: "Applications" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Test Learner" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Agreed start date"), {
      target: { value: "2026-11-16" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Approve and issue invoice" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Approve this application?",
    });
    fireEvent.click(
      within(confirm).getByRole("button", {
        name: "Approve and issue invoice",
      }),
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
    await screen.findByRole("heading", { name: "Your daily overview" });
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
    await screen.findByRole("heading", { name: "Your daily overview" });
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
    const confirmation = await screen.findByRole("dialog", {
      name: "Confirm verified payment?",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", {
        name: "Record verified payment",
      }),
    );
    await within(confirmation).findByRole("alert");
    fireEvent.click(
      within(confirmation).getByRole("button", {
        name: "Record verified payment",
      }),
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
  it("offers branded sign-in with password visibility control", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ error: "Please sign in" }, 401),
    );
    view();
    await screen.findByRole("button", { name: "Sign in" });
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getAllByAltText("Viva Tutorials").length).toBeGreaterThan(0);
  });
  it("returns from a report-card viewer without discarding a review note", async () => {
    const fetch = network(),
      original = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (input, init) =>
      init?.body && JSON.parse(String(init.body)).action === "document"
        ? json({
            url: "https://project.supabase.co/storage/v1/object/sign/report.pdf?token=test",
            mime: "application/pdf",
            fileName: "report.pdf",
          })
        : original(input, init),
    );
    view();
    await screen.findByRole("heading", { name: "Your daily overview" });
    fireEvent.click(screen.getByRole("button", { name: "Applications" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Test Learner" }));
    fireEvent.change(screen.getByLabelText("Review note"), {
      target: { value: "Keep this draft note" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /Open private report card|Report card/,
      }),
    );
    const viewer = await screen.findByRole("dialog", { name: "Report card" });
    expect(within(viewer).getByTitle("Report card")).toHaveAttribute(
      "src",
      expect.stringContaining("/object/sign/"),
    );
    fireEvent.click(
      within(viewer).getByRole("button", { name: "Close document" }),
    );
    expect(screen.getByLabelText("Review note")).toHaveValue(
      "Keep this draft note",
    );
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
