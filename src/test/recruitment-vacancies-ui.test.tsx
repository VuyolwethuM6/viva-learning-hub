import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecruitmentVacancyWorkspace } from "@/components/admin/recruitment/RecruitmentVacancyWorkspace";
import { VacancyWizard } from "@/components/admin/recruitment/VacancyWizard";
import {
  emptyVacancyContent,
  type RecruitmentVacancy,
  type VacancyContent,
  type VacancyWorkspace,
} from "@/lib/recruitment-vacancies";
import type { RecruitmentSnapshot } from "@/lib/recruitment-types";
import { RecruitmentError } from "@/lib/recruitment-client";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/recruitment-client", async (original) => ({
  ...(await original<typeof import("@/lib/recruitment-client")>()),
  recruitmentRequest: send,
}));
const owner = "11111111-1111-4111-8111-111111111111",
  vacancyId = "22222222-2222-4222-8222-222222222222",
  secondId = "33333333-3333-4333-8333-333333333333",
  scopeId = "44444444-4444-4444-8444-444444444444",
  versionId = "55555555-5555-4555-8555-555555555555";
const content = (title = "Mathematics tutor"): VacancyContent => ({
  ...emptyVacancyContent(),
  title,
  department: "Teaching",
  location: "Mfuleni",
  summary: "Help learners build confidence in mathematics.",
  responsibilities: ["Prepare learning sessions"],
  minimumRequirements: ["Subject knowledge"],
  requiredExperience: "Tutoring experience",
  scheduleDetails: "Weekday afternoons",
  subjects: ["Mathematics"],
  grades: ["Grade 10"],
  opensAt: "2099-01-01T00:00:00.000Z",
  closesAt: "2099-02-01T00:00:00.000Z",
});
const vacancy = (id = vacancyId): RecruitmentVacancy => ({
  id,
  reference: id === vacancyId ? "VIVA-2099-000001" : "VIVA-2099-000002",
  slug: "mathematics-tutor",
  scopeId,
  revision: 2,
  status: "draft",
  reviewState: "draft",
  draftVersionId:
    id === vacancyId ? versionId : "66666666-6666-4666-8666-666666666666",
  approvedVersionId: null,
  publishedVersionId: null,
  createdBy: owner,
  updatedBy: owner,
  createdAt: "2099-01-01T00:00:00Z",
  updatedAt: "2099-01-01T00:00:00Z",
});
const snapshot = (
  role: "owner" | "manager" | "officer" = "owner",
): RecruitmentSnapshot => ({
  user: { id: owner, email: "staff@example.test", role, revision: 0 },
  settings: {
    revision: 1,
    staff_console_enabled: true,
    access_guards_enabled: true,
    privacy_policy_version: "test",
    draft_days: 14,
    unsuccessful_months: 6,
    talent_pool_months: 12,
  },
  features: { applications: false },
  staff: [],
  scopes: [{ id: scopeId, kind: "vacancy", label: "Teaching recruitment" }],
  grants: [],
  events: [],
});
let data: VacancyWorkspace;
function base(): VacancyWorkspace {
  return {
    vacancies: [vacancy(), vacancy(secondId)],
    versions: [
      {
        id: versionId,
        vacancyId,
        number: 1,
        content: content(),
        createdBy: owner,
        createdAt: "2099-01-01T00:00:00Z",
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        vacancyId: secondId,
        number: 1,
        content: content("Support coordinator"),
        createdBy: owner,
        createdAt: "2099-01-01T00:00:00Z",
      },
    ],
    events: [],
    assignments: [],
    publicVacanciesEnabled: false,
    settingsRevision: 1,
    total: 2,
    nextOffset: null,
    historyBefore: null,
    versionsHasMore: false,
  };
}
function mockApi() {
  send.mockImplementation(async (route, _body, _method, _renew, _id, query) => {
    if (route === "vacancies") {
      if (query?.vacancyId)
        return {
          ...data,
          vacancies: data.vacancies.filter((v) => v.id === query.vacancyId),
        };
      return data;
    }
    if (route === "reauthenticate") return { proof: "a".repeat(64) };
    return { result: { vacancyId } };
  });
}
beforeEach(() => {
  data = base();
  mockApi();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.resetAllMocks();
});
async function open() {
  render(
    <RecruitmentVacancyWorkspace
      snapshot={snapshot()}
      reload={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  await screen.findByRole("button", { name: /Edit draft/ });
}
async function authenticate() {
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Confirm staff password"), {
      target: { value: "test-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Authenticate and confirm" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("recruitment vacancy workspace", () => {
  it("keeps the full listing separate from selected vacancy detail and applies server filters", async () => {
    await open();
    expect(
      screen.getByRole("button", { name: /Support coordinator/ }),
    ).toBeInTheDocument();
    expect(
      send.mock.calls.some(
        (c) => c[0] === "vacancies" && c[5]?.vacancyId === vacancyId,
      ),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Status filter"), {
      target: { value: "published" },
    });
    await waitFor(() =>
      expect(
        send.mock.calls.some(
          (c) =>
            c[0] === "vacancies" &&
            c[5]?.status === "published" &&
            !c[5]?.vacancyId,
        ),
      ).toBe(true),
    );
    expect(
      screen.getByRole("button", { name: /Support coordinator/ }),
    ).toBeInTheDocument();
  });
  it("creates an incomplete administrator draft through exact review without tutor fields or browser payload persistence", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Create vacancy" }));
    fireEvent.change(screen.getByLabelText("Job title"), {
      target: { value: "Office administrator" },
    });
    fireEvent.change(screen.getByLabelText("Position category"), {
      target: { value: "administrator" },
    });
    fireEvent.change(screen.getByLabelText("Engagement type"), {
      target: { value: "employee" },
    });
    fireEvent.change(screen.getByLabelText("Expected working schedule"), {
      target: { value: "part_time" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Eligibility/ }));
    expect(
      screen.queryByLabelText("Subject specialization"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review and save draft" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Office administrator"),
    ).toBeInTheDocument();
    expect(send.mock.calls.some((c) => c[0] === "mutate")).toBe(false);
    await authenticate();
    await waitFor(() =>
      expect(send.mock.calls.some((c) => c[0] === "mutate")).toBe(true),
    );
    const body = send.mock.calls.find((c) => c[0] === "mutate")![1];
    expect(body.operation).toBe("vacancy_create");
    expect(body.data.scopeId).toBe(null);
    expect(body.data.content).toMatchObject({
      category: "administrator",
      engagementType: "employee",
      scheduleType: "part_time",
      subjects: [],
      grades: [],
      summary: "",
    });
    expect(body).not.toHaveProperty("password");
    expect(sessionStorage.length).toBe(0);
  });
  it("validates a draft before review and preserves separate engagement and schedule fields", () => {
    const onReview = vi.fn();
    render(
      <VacancyWizard
        scopeOptions={snapshot().scopes}
        allowNewScope
        editing={false}
        onReview={onReview}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review and save draft" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/title/);
    expect(onReview).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Engagement type")).toHaveValue(
      "independent_contractor",
    );
    expect(screen.getByLabelText("Expected working schedule")).toHaveValue(
      "flexible",
    );
  });
  it("supports structured future document and question requirements without accepting uploads", () => {
    const onReview = vi.fn();
    render(
      <VacancyWizard
        initialContent={content()}
        scopeOptions={snapshot().scopes}
        allowNewScope
        editing={false}
        onReview={onReview}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Application setup/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add document requirement" }),
    );
    fireEvent.change(screen.getByLabelText("Document 1 label"), {
      target: { value: "Qualification evidence" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add role-specific question" }),
    );
    fireEvent.change(screen.getByLabelText("Question 1", { exact: true }), {
      target: { value: "Are you available on Saturdays?" },
    });
    fireEvent.change(screen.getByLabelText("Question 1 response type"), {
      target: { value: "yes_no" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review and save draft" }),
    );
    expect(onReview.mock.calls[0][0].requiredDocuments).toEqual([
      {
        key: expect.stringMatching(/^document_/),
        label: "Qualification evidence",
        required: true,
      },
    ]);
    expect(onReview.mock.calls[0][0].questions).toEqual([
      {
        key: expect.stringMatching(/^question_/),
        label: "Are you available on Saturdays?",
        type: "yes_no",
        required: true,
      },
    ]);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
  it("offers scoped draft work but hides owner publication controls from officers", async () => {
    render(
      <RecruitmentVacancyWorkspace
        snapshot={snapshot("officer")}
        reload={vi.fn()}
      />,
    );
    await screen.findByRole("button", { name: "Edit draft" });
    expect(
      screen.getByRole("button", { name: "Submit for approval" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create vacancy" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Review public visibility/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close vacancy" }),
    ).not.toBeInTheDocument();
  });
  it("shows owner approval for submitted working versions and does not expose editing of historical snapshots", async () => {
    data.vacancies[0] = {
      ...data.vacancies[0],
      status: "submitted",
      reviewState: "submitted",
    };
    data.versions.push({
      ...data.versions[0],
      id: "77777777-7777-4777-8777-777777777777",
      number: 0,
      content: content("Historical title"),
    });
    render(
      <RecruitmentVacancyWorkspace
        snapshot={snapshot()}
        reload={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await screen.findByRole("button", { name: "Approve version" });
    fireEvent.click(screen.getByRole("button", { name: "Preview version 0" }));
    expect(screen.getByText(/Historical version 0/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve version" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Return to current working version" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve version" }));
    await authenticate();
    await waitFor(() =>
      expect(send.mock.calls.some((c) => c[0] === "mutate")).toBe(true),
    );
    expect(send.mock.calls.find((c) => c[0] === "mutate")?.[1]).toMatchObject({
      operation: "vacancy_approve",
      data: { vacancyId, expectedRevision: 2 },
    });
  });
  it("retains the exact request and proof after an uncertain gateway response, including a rejected retry", async () => {
    await open();
    let attempts = 0;
    send.mockImplementation(
      async (route, _body, _method, _renew, _id, query) => {
        if (route === "vacancies")
          return query?.vacancyId
            ? { ...data, vacancies: [data.vacancies[0]] }
            : data;
        if (route === "reauthenticate") return { proof: "b".repeat(64) };
        if (attempts++ === 0)
          throw new RecruitmentError("Uncertain gateway timeout", 408);
        throw new RecruitmentError("Permissions changed", 403, true);
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );
    await authenticate();
    await screen.findByText("Uncertain gateway timeout");
    const first = send.mock.calls.find((c) => c[0] === "mutate")![1];
    expect(Object.values(sessionStorage)).toEqual([first.data.requestId]);
    expect(
      screen.getByRole("button", { name: "Cancel review" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
    await screen.findByText("Permissions changed");
    const both = send.mock.calls.filter((c) => c[0] === "mutate");
    expect(both[0][1]).toEqual(both[1][1]);
    expect(
      screen.getByRole("button", { name: "Cancel review" }),
    ).toBeDisabled();
    expect(sessionStorage.length).toBe(1);
  });
  it("allows cancelling a confirmed first rejection and does not repeat a mutation automatically", async () => {
    await open();
    send.mockImplementation(
      async (route, _body, _method, _renew, _id, query) => {
        if (route === "vacancies")
          return query?.vacancyId
            ? { ...data, vacancies: [data.vacancies[0]] }
            : data;
        if (route === "reauthenticate") return { proof: "b".repeat(64) };
        throw new RecruitmentError("Stale vacancy revision", 409, true);
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );
    await authenticate();
    await screen.findByText("Stale vacancy revision");
    expect(
      screen.getByRole("button", { name: "Cancel review" }),
    ).not.toBeDisabled();
    expect(sessionStorage.length).toBe(0);
    expect(send.mock.calls.filter((c) => c[0] === "mutate")).toHaveLength(1);
  });
  it("requires an audited reason before close or return and supports bounded list pagination", async () => {
    data.nextOffset = 50;
    data.total = 51;
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Close vacancy" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /reason of at least 10 characters/,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(
        send.mock.calls.some(
          (c) =>
            c[0] === "vacancies" && c[5]?.offset === 50 && !c[5]?.vacancyId,
        ),
      ).toBe(true),
    );
  });
  it("allows removing an existing assignment even when the officer is absent from the enabled scoped directory", async () => {
    const unavailable = "88888888-8888-4888-8888-888888888888";
    data.assignments = [{ vacancyId, userId: unavailable, enabled: true }];
    await open();
    expect(
      within(screen.getByLabelText("Officer")).queryByRole("option", {
        name: unavailable,
      }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Assignment state"), {
      target: { value: "no" },
    });
    expect(
      within(screen.getByLabelText("Officer")).getByRole("option", {
        name: unavailable,
      }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Officer"), {
      target: { value: unavailable },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review assignment" }));
    await authenticate();
    expect(send.mock.calls.find((c) => c[0] === "mutate")?.[1]).toMatchObject({
      operation: "vacancy_assign",
      data: { vacancyId, userId: unavailable, enabled: false },
    });
  });
  it("passes an owner authenticator only to fresh confirmation and never to persisted data or mutation payloads", async () => {
    const state = snapshot();
    state.user.ownerAal2Required = true;
    state.user.mfaFactors = [
      {
        id: "99999999-9999-4999-8999-999999999999",
        friendlyName: "Owner test authenticator",
      },
    ];
    render(
      <RecruitmentVacancyWorkspace
        snapshot={state}
        reload={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await screen.findByRole("button", { name: "Submit for approval" });
    fireEvent.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );
    fireEvent.change(screen.getByLabelText("Authenticator code"), {
      target: { value: "123456" },
    });
    await authenticate();
    expect(
      send.mock.calls.find((c) => c[0] === "reauthenticate")?.[1],
    ).toMatchObject({
      password: "test-password",
      code: "123456",
      factorId: state.user.mfaFactors[0].id,
    });
    expect(
      send.mock.calls.find((c) => c[0] === "mutate")?.[1],
    ).not.toHaveProperty("code");
    expect(sessionStorage.length).toBe(0);
  });
});
