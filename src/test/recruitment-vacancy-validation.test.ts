import { describe, expect, it } from "vitest";
import {
  emptyVacancyContent,
  validateVacancyContent,
  vacancyContentSchema,
} from "@/lib/recruitment-vacancies";
import { recruitmentInput } from "../../api/_lib/recruitment-input";
const id = "11111111-1111-4111-8111-111111111111";
describe("structured vacancy validation", () => {
  it("permits an incomplete saved draft but rejects incomplete submission", () => {
    const draft = {
      ...emptyVacancyContent(),
      title: "Support administrator",
      category: "administrator" as const,
    };
    expect(validateVacancyContent(draft)).toEqual([]);
    expect(validateVacancyContent(draft, true).length).toBeGreaterThan(0);
    expect(
      recruitmentInput("vacancy_create", {
        requestId: id,
        scopeId: null,
        content: draft,
      }).data.content,
    ).toEqual(draft);
  });
  it("separates a single legal engagement type from working schedule", () => {
    const draft = {
      ...emptyVacancyContent(),
      title: "Support role",
      engagementType: "volunteer" as const,
      scheduleType: "part_time" as const,
    };
    expect(vacancyContentSchema.safeParse(draft).success).toBe(true);
    expect(
      vacancyContentSchema.safeParse({ ...draft, engagementType: "part_time" })
        .success,
    ).toBe(false);
    expect(
      vacancyContentSchema.safeParse({
        ...draft,
        engagementType: ["employee", "volunteer"],
      }).success,
    ).toBe(false);
  });
  it("keeps non-tutor roles free of subject/grade requirements and rejects accidental tutor-only data", () => {
    const draft = {
      ...emptyVacancyContent(),
      title: "Office support",
      category: "support_staff" as const,
    };
    expect(validateVacancyContent(draft)).toEqual([]);
    expect(
      validateVacancyContent({ ...draft, subjects: ["Mathematics"] }),
    ).not.toEqual([]);
  });
  it("validates opening/closing dates, structured document/question uniqueness and strict fields", () => {
    const draft = { ...emptyVacancyContent(), title: "Mathematics tutor" };
    expect(
      vacancyContentSchema.safeParse({
        ...draft,
        opensAt: "2030-01-02T00:00:00Z",
        closesAt: "2030-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      vacancyContentSchema.safeParse({
        ...draft,
        questions: [
          { key: "q", label: "Experience?", type: "text", required: true },
          { key: "q", label: "Duplicate", type: "text", required: false },
        ],
      }).success,
    ).toBe(false);
    expect(
      vacancyContentSchema.safeParse({
        ...draft,
        applicantEmail: "private@example.test",
      }).success,
    ).toBe(false);
    expect(() =>
      recruitmentInput("vacancy_settings", {
        requestId: id,
        expectedRevision: 1,
        publicVacanciesEnabled: true,
        activation: true,
      }),
    ).toThrow();
  });
});
