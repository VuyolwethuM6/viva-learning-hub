import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import RecruitmentApplicant from "../pages/RecruitmentApplicant";
import { createIntakeDefinition } from "../lib/recruitment-applications";
import { emptyVacancyContent } from "../lib/recruitment-vacancies";
import {
  applicantPending,
  retainApplicant,
  ApplicantError,
} from "../lib/recruitment-applicant-client";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../lib/recruitment-applicant-client", async (original) => ({
  ...(await original<typeof import("../lib/recruitment-applicant-client")>()),
  applicantRequest: send,
}));
const uuid = "11111111-1111-4111-8111-111111111111";
function definition(category: "tutor" | "administrator" | "support_staff") {
  return createIntakeDefinition("vacancy", category, {
    ...emptyVacancyContent(),
    category,
    title: "Synthetic role",
    department: "Synthetic",
    location: "Cape Town",
    summary: "A synthetic role for UI tests.",
    responsibilities: ["Relevant work"],
    minimumRequirements: ["Experience"],
    requiredExperience: "Experience",
    scheduleDetails: "Flexible",
    subjects: category === "tutor" ? ["Mathematics"] : [],
    grades: category === "tutor" ? ["12"] : [],
    opensAt: new Date(Date.now() - 1000).toISOString(),
    closesAt: new Date(Date.now() + 86400000).toISOString(),
  });
}
function mount(path = "/recruitment/application") {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/recruitment/*" element={<RecruitmentApplicant />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  send.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(["tutor", "administrator", "support_staff"] as const)(
  "renders accessible %s role-specific fields and keeps draft answers out of persistence",
  async (category) => {
    const c = {
      id: uuid,
      caseReference: uuid,
      state: "draft",
      purpose: "vacancy",
      revision: 0,
      expiresAt: new Date().toISOString(),
      formId: uuid,
      definition: definition(category),
      noticeVersion: "synthetic",
      notice: "Synthetic approved privacy notice",
      answers: { fields: {}, questions: {} },
      documents: [],
      receipt: null,
      messages: [],
      request: null,
    };
    send.mockResolvedValue(c);
    mount();
    await screen.findByRole("heading", { name: "Your application" });
    fireEvent.click(screen.getByRole("button", { name: "2. Role experience" }));
    expect(
      screen.getByLabelText(
        category === "tutor"
          ? "Qualifications *"
          : category === "administrator"
            ? "Administrative Experience *"
            : "Support Experience *",
      ),
    ).toBeInTheDocument();
    if (category !== "tutor")
      expect(screen.queryByLabelText("Subjects")).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText(
        category === "tutor"
          ? "Qualifications *"
          : category === "administrator"
            ? "Administrative Experience *"
            : "Support Experience *",
      ),
      { target: { value: "Private synthetic answer" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save draft and continue" }),
    );
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        "applicant",
        expect.objectContaining({
          action: "save",
          requestId: expect.any(String),
        }),
      ),
    );
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(
      "Private synthetic answer",
    );
  },
);
it("stores only opaque pending operation metadata across uncertain responses", async () => {
  retainApplicant({ requestId: uuid, action: "submit" });
  expect(applicantPending()).toEqual({ requestId: uuid, action: "submit" });
  expect(sessionStorage.length).toBe(1);
  send.mockResolvedValue({
    id: uuid,
    caseReference: uuid,
    state: "submitted",
    purpose: "vacancy",
    revision: 2,
    expiresAt: new Date().toISOString(),
    definition: null,
    answers: null,
    documents: [],
    messages: [],
    receipt: { receipt: uuid },
    request: null,
  });
  mount();
  expect(await screen.findByText(/uncertain result/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Check or retry original request" }),
  ).toBeInTheDocument();
  expect(send).toHaveBeenCalledTimes(1);
});
it("does not render an applicant form when operational controls fail closed", async () => {
  send.mockRejectedValue(new ApplicantError("intake_disabled"));
  mount("/recruitment/talent-pool");
  expect(await screen.findByRole("alert")).toHaveTextContent("intake disabled");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("keeps an uncertain UUID after a later confirmed rejection until authoritative recovery", async () => {
  const c = {
    id: uuid,
    caseReference: uuid,
    state: "draft",
    purpose: "vacancy",
    revision: 0,
    expiresAt: new Date().toISOString(),
    formId: uuid,
    definition: definition("tutor"),
    noticeVersion: "synthetic",
    notice: "Synthetic notice",
    answers: { fields: {}, questions: {} },
    documents: [],
    receipt: null,
    messages: [],
    request: null,
  };
  let writes = 0;
  send.mockImplementation(
    async (_route: string, body?: { action?: string }) => {
      if (body?.action === "save") {
        writes++;
        throw new ApplicantError(
          writes === 1 ? "outcome_uncertain" : "request_conflict",
          writes !== 1,
        );
      }
      return c;
    },
  );
  mount();
  await screen.findByRole("heading", { name: "Your application" });
  fireEvent.click(
    screen.getByRole("button", { name: "Save draft and continue" }),
  );
  await screen.findByText(/uncertain result/);
  const pending = applicantPending();
  expect(pending?.action).toBe("save");
  fireEvent.click(
    screen.getByRole("button", { name: "Check or retry original request" }),
  );
  await waitFor(() => expect(writes).toBe(2));
  expect(applicantPending()?.requestId).toBe(pending?.requestId);
  expect(screen.getByText(/uncertain result/)).toBeInTheDocument();
});

it("clears an acknowledged in-memory command before accepting a newly reviewed edit", async () => {
  const c = {
    id: uuid,
    caseReference: uuid,
    state: "draft",
    purpose: "vacancy",
    revision: 0,
    expiresAt: new Date().toISOString(),
    formId: uuid,
    definition: definition("tutor"),
    noticeVersion: "synthetic",
    notice: "Synthetic notice",
    answers: { fields: {}, questions: {} },
    documents: [],
    receipt: null,
    messages: [],
    request: null,
  };
  const writes: {
    requestId: string;
    answersPatch: { fields: Record<string, string> };
  }[] = [];
  let committed = false;
  send.mockImplementation(
    async (
      _route: string,
      body?: {
        action?: string;
        requestId: string;
        answersPatch: { fields: Record<string, string> };
      },
    ) => {
      if (body?.action === "save") {
        writes.push(body);
        if (writes.length === 1) throw new ApplicantError("outcome_uncertain");
        return { saved: true };
      }
      return {
        ...c,
        revision: writes.length,
        request: committed ? { state: "committed", operation: "save" } : null,
      };
    },
  );
  mount();
  await screen.findByRole("heading", { name: "Your application" });
  fireEvent.change(screen.getByLabelText("First Name *"), {
    target: { value: "First edit" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save draft and continue" }),
  );
  await screen.findByText(/uncertain result/);
  committed = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
  await waitFor(() => expect(applicantPending()).toBeNull());
  fireEvent.change(screen.getByLabelText("First Name *"), {
    target: { value: "New reviewed edit" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save draft and continue" }),
  );
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1].requestId).not.toBe(writes[0].requestId);
  expect(writes[1].answersPatch.fields.firstName).toBe("New reviewed edit");
});
