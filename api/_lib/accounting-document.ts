import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { BRAND, loadTuitionAssets, money } from "./tuition-document.js";
import { escapeHtml } from "./email.js";
export type AccountingDocument = {
  documentKind: string;
  documentId: string;
  documentNumber: string;
  title: string;
  payer: string;
  learner?: string;
  recipients: string[];
  issuedOn: string;
  fromDate?: string;
  toDate?: string;
  openingCents?: number;
  method?: string;
  reference?: string;
  note?: string;
  voided?: boolean;
  totalCents: number;
  creditCents?: number;
  items: { description: string; cents: number; date?: string }[];
  report?: Record<string, number>;
};
export const accountingFilename = (p: AccountingDocument) =>
  `${p.documentNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
export async function buildAccountingPDF(
  p: AccountingDocument,
): Promise<Uint8Array> {
  if (!Array.isArray(p.items) || !Number.isSafeInteger(p.totalCents))
    throw new Error("The financial document data is incomplete.");
  const [logoBytes, regularBytes, boldBytes] = await loadTuitionAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(regularBytes, { subset: true }),
    bold = await pdf.embedFont(boldBytes, { subset: true }),
    logo = await pdf.embedPng(logoBytes);
  const created = new Date(`${p.issuedOn.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(created.getTime()))
    throw new Error("A valid document date is required.");
  pdf.setCreationDate(created);
  pdf.setModificationDate(created);
  pdf.setProducer(BRAND.name);
  pdf.setCreator(BRAND.name);
  pdf.setTitle(`${p.title} ${p.documentNumber}`);
  const accent =
      p.documentKind === "account_receipt"
        ? rgb(0.04, 0.55, 0.28)
        : rgb(0.478, 0.29, 0.945),
    ink = rgb(0.086, 0.059, 0.18),
    muted = rgb(0.42, 0.36, 0.55),
    pale = rgb(0.946, 0.926, 1);
  let page!: PDFPage;
  let y = 0;
  const wrap = (value: string, width: number, size: number, strong = false) => {
    const font = strong ? bold : regular,
      lines: string[] = [];
    let line = "";
    for (const word of String(value).split(/\s+/)) {
      if (
        font.widthOfTextAtSize((line ? line + " " : "") + word, size) <= width
      ) {
        line += (line ? " " : "") + word;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const c of word) {
        if (font.widthOfTextAtSize(line + c, size) > width) {
          lines.push(line);
          line = "";
        }
        line += c;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };
  const newPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({
      x: 0,
      y: 835.89,
      width: 595.28,
      height: 6,
      color: accent,
    });
    page.drawImage(logo, {
      x: 38,
      y: 753,
      width: 106,
      height: (106 * logo.height) / logo.width,
    });
    page.drawText(p.title.toUpperCase(), {
      x: 275,
      y: 795,
      size: 12,
      font: bold,
      color: accent,
    });
    let top = 776;
    for (const line of wrap(p.documentNumber, 280, 9)) {
      page.drawText(line, { x: 275, y: top, size: 9, font: bold, color: ink });
      top -= 13;
    }
    page.drawText(`${BRAND.name} · ${BRAND.email}`, {
      x: 38,
      y: 27,
      size: 9,
      font: regular,
      color: muted,
    });
    page.drawText(String(pdf.getPageCount()), {
      x: 548,
      y: 27,
      size: 9,
      font: regular,
      color: muted,
    });
    y = 727;
  };
  const ensure = (height: number) => {
    if (y - height < 55) newPage();
  };
  const text = (value: string, strong = false, size = 10) => {
    for (const line of wrap(value, 519, size, strong)) {
      ensure(size + 8);
      page.drawText(line, {
        x: 38,
        y,
        font: strong ? bold : regular,
        size,
        color: strong ? ink : muted,
      });
      y -= size + 7;
    }
  };
  const row = (description: string, cents: number) => {
    const lines = wrap(description, 392, 10);
    for (let index = 0; index < lines.length; index++) {
      ensure(21);
      if (index === 0) {
        page.drawText(money(cents), {
          x: 557 - regular.widthOfTextAtSize(money(cents), 10),
          y,
          font: regular,
          size: 10,
          color: ink,
        });
      }
      page.drawText(lines[index], {
        x: 45,
        y,
        font: regular,
        size: 10,
        color: ink,
      });
      y -= 18;
    }
    y -= 8;
  };
  newPage();
  if (p.voided) {
    text(
      "REVERSED RECORD — see the correction in the account history",
      true,
      12,
    );
    y -= 8;
  }
  text(BRAND.name, true);
  text(`${BRAND.address}, ${BRAND.location}`);
  text(BRAND.email);
  y -= 10;
  text(p.payer, true, 12);
  if (p.learner && p.learner !== p.payer) text(p.learner);
  for (const email of Array.from(new Set(p.recipients))) text(email);
  y -= 10;
  text(`Document date: ${p.issuedOn.slice(0, 10)}`);
  if (p.fromDate && p.toDate)
    text(`Reporting period: ${p.fromDate} to ${p.toDate}`);
  if (p.method) text(`Payment method: ${p.method}`);
  if (p.reference) text(`Transaction reference: ${p.reference}`);
  y -= 16;
  if (typeof p.openingCents === "number")
    row("Opening net account balance", p.openingCents);
  text(
    p.documentKind === "financial_report"
      ? "TRIAL BALANCE · DEBIT POSITIVE / CREDIT NEGATIVE"
      : "DETAILS",
    true,
  );
  y -= 8;
  for (const item of p.items)
    row(`${item.date ? item.date + " · " : ""}${item.description}`, item.cents);
  if (p.report) {
    y -= 8;
    text("REPORT TOTALS", true);
    for (const [label, key] of [
      ["Income", "incomeCents"],
      ["Expenses", "expenseCents"],
      ["Profit / loss", "profitCents"],
      ["Assets", "assetsCents"],
      ["Liabilities", "liabilitiesCents"],
      ["Capital / equity", "equityCents"],
      ["Accumulated result", "accumulatedResultCents"],
      ["Bank", "bankCents"],
      ["Cash on hand", "cashCents"],
      ["Opening bank and cash", "cashOpeningCents"],
      ["External cash inflows", "cashInCents"],
      ["External cash outflows", "cashOutCents"],
    ])
      row(label, p.report[key] || 0);
  } else {
    ensure(55);
    page.drawRectangle({
      x: 38,
      y: y - 28,
      width: 519,
      height: 45,
      color: pale,
    });
    page.drawText(
      p.documentKind === "statement" ? "CLOSING NET BALANCE" : "TOTAL",
      { x: 48, y: y - 10, font: bold, size: 10, color: accent },
    );
    const total = money(p.totalCents);
    page.drawText(total, {
      x: 547 - bold.widthOfTextAtSize(total, 13),
      y: y - 10,
      font: bold,
      size: 13,
      color: ink,
    });
    y -= 56;
  }
  if (typeof p.creditCents === "number")
    text(`Available family credit when prepared: ${money(p.creditCents)}`);
  if (p.note) {
    y -= 8;
    text(p.note);
  }
  y -= 8;
  text("ZAR · No VAT charged. Keep this document with your records.");
  text(`Questions? Contact ${BRAND.email} and quote the document number.`);
  return pdf.save({ useObjectStreams: false });
}
export function accountingEmail(p: AccountingDocument) {
  if (!Array.isArray(p.recipients) || !p.recipients.length)
    throw new Error("The financial email has no saved recipients.");
  const lines = [
    `${p.title}: ${p.documentNumber}`,
    `Account: ${p.payer}`,
    `Date: ${p.issuedOn.slice(0, 10)}`,
    `Amount: ${money(p.totalCents)}`,
    ...(p.method ? [`Method: ${p.method}`] : []),
    ...(p.reference ? [`Reference: ${p.reference}`] : []),
    ...(p.note ? [p.note] : []),
    "Your branded PDF is attached. Please keep it with your records.",
    `Questions? Reply to this email. ${BRAND.name}`,
  ];
  return {
    to: Array.from(
      new Set(p.recipients.map((v) => v.trim().toLowerCase()).filter(Boolean)),
    ),
    subject: lines[0],
    text: lines.join("\n\n"),
    html: `<div style="background:#f4f4f4;padding:24px 10px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;"><tr><td style="background:#f9f3ec;padding:20px 24px;text-align:center;"><img src="${BRAND.logo}" alt="Viva Tutorials" width="115"></td></tr><tr><td style="padding:28px;color:#333;font-size:14px;line-height:1.7;"><h1 style="font-size:23px;color:#7A4AF1;">${escapeHtml(p.title)}</h1>${lines
      .slice(1)
      .map(
        (line) => `<p style="overflow-wrap:anywhere;">${escapeHtml(line)}</p>`,
      )
      .join(
        "",
      )}</td></tr><tr><td style="background:#f9f9f9;border-top:1px solid #DDD6F0;padding:18px 24px;color:#777;font-size:12px;">Need help? <a href="mailto:${BRAND.email}" style="color:#7A4AF1;">${BRAND.email}</a><br>${BRAND.name} · ${BRAND.location}</td></tr></table></div>`,
  };
}
