import type { VacancyContent } from "@/lib/recruitment-vacancies";

function TextList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-[#24143b]">{title}</h2>
      <ul className="list-disc space-y-2 pl-5 text-slate-600">
        {items.map((item, index) => (
          <li className="whitespace-pre-line leading-7" key={index}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
export function PublicVacancyContent({
  content: c,
}: {
  content: VacancyContent;
}) {
  return (
    <div className="space-y-8 break-words">
      <section>
        <h2 className="mb-3 text-xl font-bold text-[#24143b]">
          About the opportunity
        </h2>
        <p className="whitespace-pre-line leading-7 text-slate-600">
          {c.summary}
        </p>
      </section>
      <TextList title="Responsibilities" items={c.responsibilities} />
      <TextList title="Minimum requirements" items={c.minimumRequirements} />
      <TextList
        title="Preferred qualifications"
        items={c.preferredQualifications}
      />
      <section>
        <h2 className="mb-3 text-xl font-bold text-[#24143b]">
          Required experience
        </h2>
        <p className="whitespace-pre-line leading-7 text-slate-600">
          {c.requiredExperience}
        </p>
      </section>
      <TextList title="Skills and competencies" items={c.skills} />
      {c.category === "tutor" && (
        <>
          <TextList title="Subject specialization" items={c.subjects} />
          <TextList title="Applicable grades" items={c.grades} />
        </>
      )}
      <section>
        <h2 className="mb-3 text-xl font-bold text-[#24143b]">
          Working schedule
        </h2>
        <p className="whitespace-pre-line leading-7 text-slate-600">
          {c.scheduleDetails}
        </p>
      </section>
      {c.remuneration && (
        <section>
          <h2 className="mb-3 text-xl font-bold text-[#24143b]">
            Remuneration
          </h2>
          <p className="whitespace-pre-line leading-7 text-slate-600">
            {c.remuneration}
          </p>
        </section>
      )}
      {!!c.requiredDocuments.length && (
        <section>
          <h2 className="mb-3 text-xl font-bold text-[#24143b]">
            Documents for future applications
          </h2>
          <p className="mb-3 text-sm leading-6 text-slate-600">
            Document collection is not available yet. Do not send documents
            through other forms on this website.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-slate-600">
            {c.requiredDocuments.map((doc) => (
              <li key={doc.key}>
                {doc.label}
                {doc.required ? " (required)" : " (optional)"}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!c.questions.length && (
        <TextList
          title="Questions for future applications"
          items={c.questions.map(
            (q) => q.label + (q.required ? " (required)" : " (optional)"),
          )}
        />
      )}
    </div>
  );
}
