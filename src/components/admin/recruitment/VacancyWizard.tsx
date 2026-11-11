import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  emptyVacancyContent,
  engagementTypes,
  validateVacancyContent,
  vacancyCategories,
  type VacancyContent,
} from "@/lib/recruitment-vacancies";
import type { RecruitmentScope } from "@/lib/recruitment-types";

const steps = [
  "Role",
  "Responsibilities",
  "Eligibility",
  "Application setup",
  "Review",
];
const listFields = [
  "responsibilities",
  "minimumRequirements",
  "preferredQualifications",
  "skills",
  "subjects",
  "grades",
] as const;
type ListField = (typeof listFields)[number];
const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
function dateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
function isoDate(value: string) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}
function bulletList(items: string[]) {
  return items.length ? (
    <ul>
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className="vacancy-muted">Not specified in this draft.</p>
  );
}

export function VacancyContentView({
  content: c,
}: {
  content: VacancyContent;
}) {
  return (
    <article className="vacancy-preview">
      <div className="vacancy-badges">
        <span>{label(c.category)}</span>
        <span>{label(c.engagementType)}</span>
        <span>{label(c.scheduleType)}</span>
      </div>
      <h3>{c.title || "Untitled draft"}</h3>
      <p className="vacancy-preserve">
        {c.summary || "Add a vacancy summary before submission."}
      </p>
      <dl className="vacancy-facts">
        <div>
          <dt>Department</dt>
          <dd>{c.department || "Not specified"}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>
            {c.location || "Not specified"} · {label(c.workArrangement)}
          </dd>
        </div>
        <div>
          <dt>Positions</dt>
          <dd>{c.positions}</dd>
        </div>
        <div>
          <dt>Working schedule</dt>
          <dd>{c.scheduleDetails || "Not specified"}</dd>
        </div>
        <div>
          <dt>Opening</dt>
          <dd>
            {c.opensAt
              ? new Date(c.opensAt).toLocaleString("en-ZA", {
                  timeZone: "Africa/Johannesburg",
                }) + " SAST"
              : "Not set"}
          </dd>
        </div>
        <div>
          <dt>Closing</dt>
          <dd>
            {c.closesAt
              ? new Date(c.closesAt).toLocaleString("en-ZA", {
                  timeZone: "Africa/Johannesburg",
                }) + " SAST"
              : "Not set"}
          </dd>
        </div>
      </dl>
      <h4>Responsibilities</h4>
      {bulletList(c.responsibilities)}
      <h4>Minimum requirements</h4>
      {bulletList(c.minimumRequirements)}
      <h4>Preferred qualifications</h4>
      {bulletList(c.preferredQualifications)}
      <h4>Required experience</h4>
      <p className="vacancy-preserve">
        {c.requiredExperience || "Not specified"}
      </p>
      <h4>Skills and competencies</h4>
      {bulletList(c.skills)}
      {c.category === "tutor" && (
        <>
          <h4>Subjects</h4>
          {bulletList(c.subjects)}
          <h4>Applicable grades</h4>
          {bulletList(c.grades)}
        </>
      )}
      {c.remuneration && (
        <>
          <h4>Remuneration information</h4>
          <p className="vacancy-preserve">{c.remuneration}</p>
        </>
      )}
      <h4>Documents requested for future applications</h4>
      {c.requiredDocuments.length ? (
        <ul>
          {c.requiredDocuments.map((d) => (
            <li key={d.key}>
              {d.label} · {d.required ? "Required" : "Optional"}
            </li>
          ))}
        </ul>
      ) : (
        <p>No documents specified.</p>
      )}
      <h4>Questions for future applications</h4>
      {c.questions.length ? (
        <ul>
          {c.questions.map((q) => (
            <li key={q.key}>
              {q.label} · {label(q.type)} ·{" "}
              {q.required ? "Required" : "Optional"}
            </li>
          ))}
        </ul>
      ) : (
        <p>No additional questions specified.</p>
      )}
      <p className="vacancy-info">
        Applications are not available yet. This preview does not collect
        information or accept uploads.
      </p>
    </article>
  );
}

export function VacancyWizard({
  initialContent,
  scopeOptions,
  allowNewScope,
  initialScopeId,
  editing,
  onReview,
  onCancel,
}: {
  initialContent?: VacancyContent;
  scopeOptions: RecruitmentScope[];
  allowNewScope: boolean;
  initialScopeId?: string;
  editing: boolean;
  onReview: (content: VacancyContent, scopeId: string | null) => void;
  onCancel: () => void;
}) {
  const initial = initialContent || emptyVacancyContent();
  const [content, setContent] = useState<VacancyContent>(() =>
    structuredClone(initial),
  );
  const [lists, setLists] = useState<Record<ListField, string>>(
    () =>
      Object.fromEntries(
        listFields.map((field) => [field, initial[field].join("\n")]),
      ) as Record<ListField, string>,
  );
  const [scopeId, setScopeId] = useState(
    initialScopeId || (allowNewScope ? "new" : scopeOptions[0]?.id || ""),
  );
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof VacancyContent>(
    key: K,
    value: VacancyContent[K],
  ) => setContent((previous) => ({ ...previous, [key]: value }));
  function assemble(): VacancyContent {
    const arrays = Object.fromEntries(
      listFields.map((field) => [
        field,
        lists[field]
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      ]),
    );
    return {
      ...content,
      ...arrays,
      ...(content.category !== "tutor" ? { subjects: [], grades: [] } : {}),
    } as VacancyContent;
  }
  function review() {
    const value = assemble();
    const problems = validateVacancyContent(value);
    if (!editing && (!scopeId || (scopeId === "new" && !allowNewScope)))
      problems.push("Choose an authorized recruitment scope.");
    setErrors(problems);
    if (!problems.length) onReview(value, scopeId === "new" ? null : scopeId);
  }
  const listInput = (field: ListField, title: string, help?: string) => (
    <label>
      {title}
      <textarea
        rows={4}
        value={lists[field]}
        maxLength={50_000}
        onChange={(e) =>
          setLists((previous) => ({ ...previous, [field]: e.target.value }))
        }
        aria-describedby={`vacancy-${field}-help`}
      />
      <small id={`vacancy-${field}-help`}>
        {help || "One item per line. Up to 50 items."}
      </small>
    </label>
  );
  return (
    <section
      className="recruitment-card vacancy-wizard"
      aria-labelledby="vacancy-wizard-heading"
    >
      <div className="vacancy-section-heading">
        <div>
          <p className="recruitment-eyebrow">
            {editing ? "Edit working draft" : "Create vacancy"}
          </p>
          <h2 id="vacancy-wizard-heading">Build a clear opportunity</h2>
        </div>
        <span>
          Step {step + 1} of {steps.length}
        </span>
      </div>
      <p>
        Save an incomplete draft at any step. Saving creates a private version;
        it does not submit, approve or publish the vacancy.
      </p>
      <nav aria-label="Vacancy creation steps">
        <ol className="vacancy-steps">
          {steps.map((title, index) => (
            <li key={title}>
              <button
                type="button"
                aria-current={step === index ? "step" : undefined}
                onClick={() => setStep(index)}
              >
                <span>{index + 1}</span>
                {title}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          review();
        }}
      >
        {step === 0 && (
          <div className="vacancy-fields">
            <label className="vacancy-span">
              Job title
              <input
                aria-label="Job title"
                value={content.title}
                maxLength={160}
                onChange={(e) => set("title", e.target.value)}
                required
              />
              <small>
                At least 3 characters. Public references and stable URLs are
                generated when the vacancy is created.
              </small>
            </label>
            <label>
              Position category
              <select
                value={content.category}
                onChange={(e) =>
                  set("category", e.target.value as VacancyContent["category"])
                }
              >
                {vacancyCategories.map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Engagement type
              <select
                aria-label="Engagement type"
                value={content.engagementType}
                onChange={(e) =>
                  set(
                    "engagementType",
                    e.target.value as VacancyContent["engagementType"],
                  )
                }
              >
                {engagementTypes.map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
              <small>
                Legal engagement type; the working schedule is specified
                separately.
              </small>
            </label>
            <label>
              Department or functional area
              <input
                value={content.department}
                maxLength={160}
                onChange={(e) => set("department", e.target.value)}
              />
            </label>
            <label>
              Number of positions
              <input
                type="number"
                min={1}
                max={1000}
                step={1}
                value={content.positions}
                onChange={(e) => set("positions", Number(e.target.value))}
              />
            </label>
            {!editing && (
              <label className="vacancy-span">
                Recruitment scope
                <select
                  aria-label="Recruitment scope"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  required
                >
                  {allowNewScope && (
                    <option value="new">
                      Create dedicated scope with this vacancy
                    </option>
                  )}
                  <option value="" disabled>
                    Choose an authorized scope
                  </option>
                  {scopeOptions.map((scope) => (
                    <option key={scope.id} value={scope.id}>
                      {scope.label}
                    </option>
                  ))}
                </select>
                <small>
                  {allowNewScope
                    ? "A new scope and its vacancy are created together."
                    : "Only your authorized vacancy scopes are available. Ask an owner if none are assigned."}
                </small>
              </label>
            )}
            <label>
              Location
              <input
                value={content.location}
                maxLength={160}
                onChange={(e) => set("location", e.target.value)}
              />
            </label>
            <label>
              Work arrangement
              <select
                value={content.workArrangement}
                onChange={(e) =>
                  set(
                    "workArrangement",
                    e.target.value as VacancyContent["workArrangement"],
                  )
                }
              >
                <option value="onsite">Onsite</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
            <label>
              Expected working schedule
              <select
                value={content.scheduleType}
                onChange={(e) =>
                  set(
                    "scheduleType",
                    e.target.value as VacancyContent["scheduleType"],
                  )
                }
              >
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="flexible">Flexible</option>
              </select>
            </label>
            <label>
              Schedule details
              <textarea
                value={content.scheduleDetails}
                maxLength={2000}
                rows={3}
                onChange={(e) => set("scheduleDetails", e.target.value)}
              />
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="vacancy-fields">
            <label className="vacancy-span">
              Vacancy summary
              <textarea
                value={content.summary}
                maxLength={4000}
                rows={5}
                onChange={(e) => set("summary", e.target.value)}
              />
              <small>At least 20 characters before submission.</small>
            </label>
            <div className="vacancy-span">
              {listInput("responsibilities", "Responsibilities")}
            </div>
            <div className="vacancy-span">
              {listInput("skills", "Skills and competencies")}
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="vacancy-fields">
            <div className="vacancy-span">
              {listInput("minimumRequirements", "Minimum requirements")}
            </div>
            <div className="vacancy-span">
              {listInput("preferredQualifications", "Preferred qualifications")}
            </div>
            <label className="vacancy-span">
              Required experience
              <textarea
                value={content.requiredExperience}
                rows={4}
                maxLength={2000}
                onChange={(e) => set("requiredExperience", e.target.value)}
              />
            </label>
            {content.category === "tutor" ? (
              <>
                <div>
                  {listInput(
                    "subjects",
                    "Subject specialization",
                    "One subject per line; required for tutor submission.",
                  )}
                </div>
                <div>
                  {listInput(
                    "grades",
                    "Applicable grades",
                    "One grade per line; required for tutor submission.",
                  )}
                </div>
              </>
            ) : (
              <p className="vacancy-info vacancy-span">
                Subject specialization and grades apply to tutor vacancies only.
              </p>
            )}
          </div>
        )}
        {step === 3 && (
          <div className="vacancy-fields">
            <p className="vacancy-info vacancy-span">
              These fields prepare future applications. No application form or
              document upload is enabled.
            </p>
            <label>
              Application opening date
              <input
                type="datetime-local"
                value={dateInput(content.opensAt)}
                onChange={(e) => set("opensAt", isoDate(e.target.value))}
              />
            </label>
            <label>
              Application closing date
              <input
                type="datetime-local"
                value={dateInput(content.closesAt)}
                onChange={(e) => set("closesAt", isoDate(e.target.value))}
              />
            </label>
            <p className="vacancy-muted vacancy-span">
              Date inputs use your device time zone (
              {Intl.DateTimeFormat().resolvedOptions().timeZone}). Previews show
              South Africa Standard Time.
            </p>
            <label className="vacancy-span">
              Remuneration information (optional)
              <textarea
                value={content.remuneration}
                maxLength={1000}
                rows={3}
                onChange={(e) => set("remuneration", e.target.value)}
              />
              <small>
                Descriptive information only. This does not create compensation
                or accounting records.
              </small>
            </label>
            <fieldset className="vacancy-span">
              <legend>Documents for future applications</legend>
              {content.requiredDocuments.map((document, index) => (
                <div className="vacancy-repeat-row" key={document.key}>
                  <label>
                    Document {index + 1} label
                    <input
                      value={document.label}
                      maxLength={160}
                      onChange={(e) =>
                        set(
                          "requiredDocuments",
                          content.requiredDocuments.map((item) =>
                            item.key === document.key
                              ? { ...item, label: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="vacancy-checkbox">
                    <input
                      type="checkbox"
                      checked={document.required}
                      onChange={(e) =>
                        set(
                          "requiredDocuments",
                          content.requiredDocuments.map((item) =>
                            item.key === document.key
                              ? { ...item, required: e.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    Required
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      set(
                        "requiredDocuments",
                        content.requiredDocuments.filter(
                          (item) => item.key !== document.key,
                        ),
                      )
                    }
                  >
                    Remove document {index + 1}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={content.requiredDocuments.length >= 20}
                onClick={() =>
                  set("requiredDocuments", [
                    ...content.requiredDocuments,
                    {
                      key: `document_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`,
                      label: "",
                      required: true,
                    },
                  ])
                }
              >
                Add document requirement
              </Button>
            </fieldset>
            <fieldset className="vacancy-span">
              <legend>Role-specific questions for future applications</legend>
              {content.questions.map((question, index) => (
                <div className="vacancy-repeat-row" key={question.key}>
                  <label>
                    Question {index + 1}
                    <input
                      value={question.label}
                      maxLength={500}
                      onChange={(e) =>
                        set(
                          "questions",
                          content.questions.map((item) =>
                            item.key === question.key
                              ? { ...item, label: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Question {index + 1} response type
                    <select
                      value={question.type}
                      onChange={(e) =>
                        set(
                          "questions",
                          content.questions.map((item) =>
                            item.key === question.key
                              ? {
                                  ...item,
                                  type: e.target.value as
                                    | "text"
                                    | "yes_no"
                                    | "number",
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="text">Text</option>
                      <option value="yes_no">Yes / no</option>
                      <option value="number">Number</option>
                    </select>
                  </label>
                  <label className="vacancy-checkbox">
                    <input
                      type="checkbox"
                      checked={question.required}
                      onChange={(e) =>
                        set(
                          "questions",
                          content.questions.map((item) =>
                            item.key === question.key
                              ? { ...item, required: e.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    Required
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      set(
                        "questions",
                        content.questions.filter(
                          (item) => item.key !== question.key,
                        ),
                      )
                    }
                  >
                    Remove question {index + 1}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={content.questions.length >= 20}
                onClick={() =>
                  set("questions", [
                    ...content.questions,
                    {
                      key: `question_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`,
                      label: "",
                      type: "text",
                      required: true,
                    },
                  ])
                }
              >
                Add role-specific question
              </Button>
            </fieldset>
          </div>
        )}
        {step === 4 && (
          <>
            <VacancyContentView content={assemble()} />
            <div className="vacancy-validation">
              <h3>Submission readiness</h3>
              {validateVacancyContent(assemble(), true).length ? (
                <>
                  <p>
                    You can save this draft now. Complete these items before
                    submitting it for approval:
                  </p>
                  <ul>
                    {validateVacancyContent(assemble(), true).map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>
                  Required information is complete. Save the draft, then submit
                  it for owner approval.
                </p>
              )}
            </div>
          </>
        )}
        {errors.length > 0 && (
          <div role="alert">
            <p>Review the draft details:</p>
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="vacancy-actions">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((previous) => previous - 1)}
          >
            Previous
          </Button>
          {step < steps.length - 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((previous) => previous + 1)}
            >
              Next section
            </Button>
          )}
          <Button type="submit">Review and save draft</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Discard unsaved changes
          </Button>
        </div>
      </form>
    </section>
  );
}
