import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { BANK_DETAILS } from "./payment-details.js";

export type TuitionPayload = {
  recipients: string[];
  invoiceNumber: string;
  studentNumber: string;
  learner: string;
  month: string;
  dueDate: string;
  amountCents: number;
  balanceCents: number;
  paidCents?: number;
  paidOn?: string;
  method?: string;
  paymentId?: string;
  transactionReference?: string;
  remainingDays: number;
  teachingDays: number;
  monthlyFee?: number;
  periodStart?: string;
  periodEnd?: string;
  subjects?: string[];
  creditedCents?: number;
  reversed?: boolean;
  remainingAllocationCents?: number;
};
export type TuitionDocument = TuitionPayload & {
  kind: "invoice" | "receipt";
  issuedAt: string;
  bankConfirmed: boolean;
};
export const BRAND = {
  name: "Viva Tutorials",
  email: "info@vivatutorials.co.za",
  address: "11 Ungqobe Street",
  location: "Mfuleni, Cape Town 7100",
  logo: "https://www.vivatutorials.co.za/viva-tutorials-logo.png",
};
export const money = (cents: number) => `R${(cents / 100).toFixed(2)}`;
export const monthLabel = (month: string) =>
  new Date(`${month.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  });
const dateLabel = (value: string) =>
  new Date(
    value.length === 10 ? `${value}T12:00:00Z` : value,
  ).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  });
export const documentNumber = (
  p: TuitionPayload,
  kind: "invoice" | "receipt",
) =>
  kind === "invoice"
    ? p.invoiceNumber
    : `${p.invoiceNumber}-REC-${p.paymentId || p.paidOn || "payment"}`;
export const documentFilename = (
  p: TuitionPayload,
  kind: "invoice" | "receipt",
) => `${documentNumber(p, kind).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

let assets: Promise<Buffer[]> | undefined;
export async function loadTuitionAssets() {
  assets ??= Promise.all(
    [
      "public/viva-tutorials-logo.png",
      "private/fonts/PlusJakartaSans-Regular.ttf",
      "private/fonts/PlusJakartaSans-Bold.ttf",
    ].map((path) => readFile(join(process.cwd(), path))),
  ).catch((error) => {
    assets = undefined;
    throw error;
  });
  return assets;
}
// Creates a real branded PDF entirely on the server; no external render service receives learner data.
export async function buildTuitionPDF(p: TuitionDocument): Promise<Uint8Array> {
  const [logoBytes, regularBytes, boldBytes] = await loadTuitionAssets();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const logo = await doc.embedPng(logoBytes);
  const issued = new Date(p.issuedAt);
  if (!Number.isFinite(issued.getTime()))
    throw new Error("A valid document issue date is required.");
  doc.setCreationDate(issued);
  doc.setModificationDate(issued);
  doc.setProducer(BRAND.name);
  doc.setCreator(BRAND.name);
  doc.setTitle(
    `${p.kind === "receipt" ? "Receipt" : "Invoice"} ${p.invoiceNumber}`,
  );
  const purple = rgb(0.478, 0.29, 0.945),
    green = rgb(0.059, 0.663, 0.345),
    ink = rgb(0.086, 0.059, 0.18),
    muted = rgb(0.42, 0.36, 0.55),
    pale = rgb(0.946, 0.926, 1),
    white = rgb(1, 1, 1);
  const accent = p.kind === "receipt" ? green : purple;
  let page!: PDFPage;
  let y = 0;
  const wrap = (value: string, font: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    for (const paragraph of String(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (font.widthOfTextAtSize(word, size) > width) {
          if (line) {
            lines.push(line);
            line = "";
          }
          let fragment = "";
          for (const char of Array.from(word)) {
            if (font.widthOfTextAtSize(fragment + char, size) > width) {
              lines.push(fragment);
              fragment = "";
            }
            fragment += char;
          }
          line = fragment;
        } else if (
          line &&
          font.widthOfTextAtSize(`${line} ${word}`, size) > width
        ) {
          lines.push(line);
          line = word;
        } else line = line ? `${line} ${word}` : word;
      }
      lines.push(line);
    }
    return lines;
  };
  const addPage = () => {
    page = doc.addPage([595.28, 841.89]);
    page.drawRectangle({
      x: 0,
      y: 835.89,
      width: 595.28,
      height: 6,
      color: accent,
    });
    page.drawImage(logo, {
      x: 38,
      y: 752,
      width: 106,
      height: (106 * logo.height) / logo.width,
    });
    page.drawText(p.kind.toUpperCase(), {
      x: 355,
      y: 795,
      font: bold,
      size: 12,
      color: accent,
    });
    const number =
      p.kind === "invoice" ? p.invoiceNumber : `${p.invoiceNumber} / Receipt`;
    page.drawText(number, { x: 355, y: 774, font: bold, size: 10, color: ink });
    page.drawText(`${BRAND.name} · ${BRAND.email}`, {
      x: 38,
      y: 27,
      font: regular,
      size: 9,
      color: muted,
    });
    page.drawText(String(doc.getPageCount()), {
      x: 548,
      y: 27,
      font: regular,
      size: 9,
      color: muted,
    });
    y = 725;
  };
  const ensure = (height: number) => {
    if (y - height < 55) addPage();
  };
  const text = (
    value: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      x?: number;
      width?: number;
    } = {},
  ) => {
    const font = opts.bold ? bold : regular,
      size = opts.size || 10;
    for (const line of wrap(value, font, size, opts.width || 519)) {
      ensure(size + 7);
      page.drawText(line, {
        x: opts.x || 38,
        y,
        size,
        font,
        color: opts.color || ink,
      });
      y -= size + 6;
    }
  };
  const heading = (value: string) => {
    ensure(50);
    y -= 10;
    text(value, { bold: true, color: accent, size: 12 });
    y -= 4;
  };
  const row = (label: string, value: string) => {
    const lines = wrap(value, regular, 10, 320),
      height = Math.max(lines.length, 1) * 16 + 12;
    ensure(height);
    page.drawRectangle({
      x: 38,
      y: y - height + 12,
      width: 519,
      height,
      color: pale,
    });
    page.drawText(label, { x: 48, y, font: bold, size: 9, color: muted });
    lines.forEach((line, index) =>
      page.drawText(line, {
        x: 205,
        y: y - index * 16,
        font: regular,
        size: 10,
        color: ink,
      }),
    );
    y -= height;
  };
  addPage();
  if (p.reversed)
    text("REVERSED PAYMENT RECORD — see the current account statement", {
      bold: true,
    });
  const fromLines = [BRAND.name, BRAND.address, BRAND.location, BRAND.email];
  const toLines = [
    p.learner,
    ...Array.from(new Set(p.recipients)),
    `Student: ${p.studentNumber}`,
  ];
  const toHeight = toLines.reduce(
    (n, line) => n + wrap(line, regular, 10, 237).length,
    0,
  );
  if (toHeight > 12) {
    heading("FROM");
    fromLines.forEach((line) => text(line, { size: 10 }));
    heading(p.kind === "receipt" ? "RECEIVED FOR" : "BILL TO");
    toLines.forEach((line) => text(line, { size: 10 }));
    y -= 12;
  } else {
    page.drawText("FROM", { x: 38, y, font: bold, size: 10, color: accent });
    page.drawText(p.kind === "receipt" ? "RECEIVED FOR" : "BILL TO", {
      x: 310,
      y,
      font: bold,
      size: 10,
      color: accent,
    });
    y -= 23;
    const top = y;
    let depth = 0;
    for (const [lines, x] of [
      [fromLines, 38],
      [toLines, 310],
    ] as const) {
      let offset = 0;
      lines.forEach((line, index) => {
        for (const fragment of wrap(
          line,
          index === 0 ? bold : regular,
          index === 0 ? 11 : 9,
          237,
        )) {
          page.drawText(fragment, {
            x,
            y: top - offset,
            font: index === 0 ? bold : regular,
            size: index === 0 ? 11 : 9,
            color: index === 0 ? ink : muted,
          });
          offset += 15;
        }
      });
      depth = Math.max(depth, offset);
    }
    y = top - depth - 15;
  }
  row(
    p.kind === "receipt" ? "Receipt date" : "Invoice date",
    dateLabel(p.issuedAt),
  );
  row("Billing period", monthLabel(p.month));
  row(
    p.kind === "receipt" ? "Paid on" : "Due date",
    dateLabel(p.kind === "receipt" ? p.paidOn! : p.dueDate),
  );
  if (p.periodStart && p.periodEnd)
    row(
      "Covered dates",
      `${dateLabel(p.periodStart)} to ${dateLabel(p.periodEnd)}`,
    );
  heading("DESCRIPTION");
  text(`Tutoring services — ${monthLabel(p.month)}`, { bold: true });
  if (p.subjects?.length) text(p.subjects.join(", "));
  if (p.monthlyFee)
    text(
      `Monthly package: ${money(p.monthlyFee * 100)} · ${p.remainingDays} of ${p.teachingDays} programme days`,
      { color: muted },
    );
  y -= 12;
  row(
    p.kind === "receipt" ? "PAYMENT RECEIVED" : "INVOICE TOTAL",
    money(p.kind === "receipt" ? p.paidCents! : p.amountCents),
  );
  if (p.kind === "receipt") {
    row("Payment method", p.method || "Recorded payment");
    if (p.transactionReference)
      row("Transaction reference", p.transactionReference);
    row("Payment identifier", p.paymentId || "See payment history");
    row("Invoice balance after payment", money(p.balanceCents));
    if (
      typeof p.remainingAllocationCents === "number" &&
      p.remainingAllocationCents !== p.paidCents
    )
      row(
        "Current allocation after corrections",
        money(p.remainingAllocationCents),
      );
    heading("PAYMENT CONFIRMED");
    text(
      "This receipt covers the payment shown above. It does not confirm that other invoices are settled.",
    );
  } else {
    if (p.creditedCents) row("Credit notes issued", money(p.creditedCents));
    row("Balance at document preparation", money(p.balanceCents));
    heading("PAYMENT DETAILS");
    if (p.bankConfirmed) {
      for (const [label, value] of [
        ["Bank", BANK_DETAILS.bank],
        ["Account name", BANK_DETAILS.accountName],
        ["Account number", BANK_DETAILS.accountNumber],
        ["Account type", BANK_DETAILS.accountType],
        ["Branch code", BANK_DETAILS.branchCode],
        ["Payment reference", p.studentNumber],
      ])
        row(label, value);
      text(
        "If you have already paid, confirm matching with our team before paying again.",
        { size: 9, color: muted },
      );
    } else
      text(
        "Payment instructions await confirmation by Viva Tutorials. Contact our team before making a payment.",
      );
  }
  heading("THANK YOU FOR CHOOSING VIVA TUTORIALS");
  text(
    "Questions or payment arrangements? Contact our team and quote your student number.",
    { size: 9, color: muted },
  );
  return doc.save({ useObjectStreams: false });
}
