import type {
  PublicVacancy,
  VacancyContent,
} from "@/lib/recruitment-vacancies";

export function publicVacancyFixture(
  overrides: Partial<PublicVacancy> = {},
): PublicVacancy {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    reference: "VIVA-2026-000001",
    slug: "mathematics-tutor-viva-2026-000001",
    version: 1,
    publishedAt: "2026-11-09T10:00:00Z",
    availability: "open",
    acceptingApplications: false,
    content: publicContentFixture(),
    ...overrides,
  };
}
export function publicContentFixture(
  overrides: Partial<VacancyContent> = {},
): VacancyContent {
  return {
    title: "Mathematics tutor",
    category: "tutor",
    engagementType: "independent_contractor",
    department: "Teaching",
    location: "Mfuleni, Cape Town",
    workArrangement: "hybrid",
    summary:
      "Support learners to develop strong mathematics understanding and confidence.",
    responsibilities: ["Prepare engaging mathematics sessions."],
    minimumRequirements: ["Relevant subject knowledge."],
    preferredQualifications: ["Teaching experience."],
    requiredExperience: "Experience supporting high school learners.",
    skills: ["Clear communication"],
    subjects: ["Mathematics"],
    grades: ["Grade 10", "Grade 11"],
    scheduleType: "part_time",
    scheduleDetails: "Afternoons and selected weekends.",
    positions: 2,
    opensAt: "2026-01-01T00:00:00Z",
    closesAt: "2099-12-31T12:00:00Z",
    remuneration: "Discussed during recruitment.",
    requiredDocuments: [
      { key: "qualification", label: "Qualification evidence", required: true },
    ],
    questions: [
      {
        key: "experience",
        label: "Describe your subject experience.",
        type: "text",
        required: true,
      },
    ],
    ...overrides,
  };
}
