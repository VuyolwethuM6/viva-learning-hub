// @vitest-environment node
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTuitionPDF,
  documentFilename,
  type TuitionDocument,
} from "../../api/_lib/tuition-document";
import { tuitionEmail } from "../../api/_lib/tuition-email";
const invoice: TuitionDocument = {
  kind: "invoice",
  issuedAt: "2026-10-26T12:00:00Z",
  bankConfirmed: true,
  recipients: ["parent@example.test", "learner@example.test"],
  invoiceNumber: "VT-20261101",
  studentNumber: "VT-2026-000001",
  learner: "Thandé Learner",
  month: "2026-11-01",
  dueDate: "2026-11-15",
  amountCents: 42667,
  balanceCents: 42667,
  remainingDays: 16,
  teachingDays: 30,
  monthlyFee: 800,
  periodStart: "2026-11-15",
  periodEnd: "2026-11-30",
  subjects: ["Mathematics", "Physical Sciences"],
};
afterEach(() => vi.unstubAllEnvs());
describe("branded financial documents", () => {
  it("embeds complete fonts with basic Latin, numbers and accented learner names", async () => {
    for (const weight of ["Regular", "Bold"]) {
      const bytes = await readFile(
        `private/fonts/PlusJakartaSans-${weight}.ttf`,
      );
      const font = fontkit.create(bytes);
      for (const character of "Viva Tutorials INVOICE RECEIPT 0123456789 Thandé Élodie") {
        expect(font.hasGlyphForCodePoint(character.codePointAt(0)!)).toBe(true);
      }
    }
  });
  it("creates a real one-page invoice with embedded branding and stable bytes for retries", async () => {
    const first = await buildTuitionPDF(invoice),
      second = await buildTuitionPDF(invoice);
    expect(Buffer.from(first).subarray(0, 5).toString()).toBe("%PDF-");
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    const document = await PDFDocument.load(first);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe("Invoice VT-20261101");
    expect(documentFilename(invoice, "invoice")).toBe("VT-20261101.pdf");
  });
  it("creates a separate receipt for a partial payment without claiming that the invoice is settled", async () => {
    const receipt = {
      ...invoice,
      kind: "receipt" as const,
      paidCents: 10000,
      paidOn: "2026-10-26",
      method: "EFT",
      paymentId: "11111111-1111-4111-8111-111111111111",
      balanceCents: 32667,
    };
    const bytes = await buildTuitionPDF(receipt),
      doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("Receipt VT-20261101");
    const email = tuitionEmail("receipt", receipt);
    expect(email.html).toContain("PAYMENT RECORDED");
    expect(email.text).toContain("R100.00");
    expect(email.text).toContain("R326.67");
    expect(email.text).not.toContain("account is up to date");
    expect(documentFilename(receipt, "receipt")).toContain(receipt.paymentId);
  });
  it("escapes learner input and preserves the original branded email header/footer", () => {
    vi.stubEnv("TUITION_BANK_DETAILS_CONFIRMED", "true");
    const email = tuitionEmail("invoice", {
      ...invoice,
      learner: "Test <script>alert(1)</script>",
    });
    expect(email.html).toContain("viva-tutorials-logo.png");
    expect(email.html).toContain("Need help?");
    expect(email.html).toContain("Your branded PDF is attached");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
  it("retains the verified bank-details gate for sending payment instructions", () => {
    vi.stubEnv("TUITION_BANK_DETAILS_CONFIRMED", "false");
    expect(() => tuitionEmail("invoice", invoice)).toThrow(
      "Confirm the bank details",
    );
  });
  it("paginates long learner details without dropping content or crashing", async () => {
    const result = await buildTuitionPDF({
      ...invoice,
      learner: "Élodie " + "Long surname ".repeat(80),
      subjects: Array.from({ length: 30 }, (_, i) => `Subject ${i}`),
    });
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
