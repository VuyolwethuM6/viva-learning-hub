import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { loadTuitionAssets } from "./tuition-document.js";
export async function buildAcademicReport(report: {
  id: string;
  content: Record<string, unknown>;
  created_at: string;
}) {
  const [logoBytes, regularBytes, boldBytes] = await loadTuitionAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(regularBytes, { subset: true }),
    bold = await pdf.embedFont(boldBytes, { subset: true }),
    logo = await pdf.embedPng(logoBytes);
  let page: PDFPage,
    y = 0;
  function next() {
    page = pdf.addPage([595, 842]);
    page.drawRectangle({
      x: 0,
      y: 835,
      width: 595,
      height: 7,
      color: rgb(0.46, 0.26, 0.9),
    });
    page.drawImage(logo, { x: 40, y: 758, width: 90, height: 53 });
    y = 730;
  }
  function line(value: string, strong = false, size = 11) {
    const font = strong ? bold : regular;
    let row = "";
    const draw = () => {
      if (y < 55) next();
      page.drawText(row, { x: 42, y, size, font, color: rgb(0.13, 0.09, 0.2) });
      y -= 18;
      row = "";
    };
    const clean = Array.from(value, (c) =>
      (c.codePointAt(0) || 0) < 32 ? " " : c,
    ).join("");
    for (const word of clean.split(/\s+/)) {
      const candidate = row ? row + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= 510) {
        row = candidate;
        continue;
      }
      if (row) draw();
      for (const char of word) {
        if (font.widthOfTextAtSize(row + char, size) > 510) draw();
        row += char;
      }
    }
    if (y < 55) next();
    page.drawText(row || " ", {
      x: 42,
      y,
      size,
      font,
      color: rgb(0.13, 0.09, 0.2),
    });
    y -= 22;
  }
  next();
  const c = report.content;
  line("Viva Tutorials · Academic progress report", true, 18);
  line(String(c.learnerName || "Learner"), true, 15);
  line(`${c.studentNumber} · ${c.className}`);
  line(`${c.subject} · ${c.startsOn} to ${c.endsOn}`);
  line(
    `Published ${new Date(report.created_at).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })} · South African time`,
  );
  line(`Report reference: ${report.id}`);
  line("");
  line(
    `Starting mark: ${c.startingMark === null ? "Not recorded" : c.startingMark + "%"} · Target: ${c.targetMark === null ? "Not recorded" : c.targetMark + "%"}`,
  );
  line(
    `Assessed average: ${c.average === null ? "No eligible published results" : c.average + "%"}`,
    true,
  );
  line(
    `Method: ${String(c.method).replaceAll("_", " ")} · Included assessments: ${c.assessmentCount} · Awaiting result: ${c.missingCount}`,
  );
  line(
    "Diagnostics are separate. Missing/unmarked work is excluded and reported, never silently scored zero.",
  );
  const marks = Array.isArray(c.marks)
    ? (c.marks as Record<string, unknown>[])
    : [];
  for (const m of marks) {
    line(String(m.title), true);
    line(
      `${m.score}/${m.maxMarks} (${m.percentage}%) · ${m.purpose} · Weight ${m.weight} · ${m.countsAverage ? "Included in average" : "Separate from average"}`,
    );
    if (m.feedback) line(String(m.feedback));
  }
  line("");
  line(
    "This is a frozen published report. Later corrections produce a new report; this record is retained.",
  );
  pdf.setTitle(`Viva progress ${report.id}`);
  pdf.setCreationDate(new Date(report.created_at));
  return pdf.save();
}
