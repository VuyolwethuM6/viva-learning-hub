// @vitest-environment node
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  accountingEmail,
  buildAccountingPDF,
  type AccountingDocument,
} from "../../api/_lib/accounting-document";
const receipt: AccountingDocument = {
  documentKind: "account_receipt",
  documentId: "11111111-1111-4111-8111-111111111111",
  documentNumber: "VT-RC-20261001",
  title: "Payment receipt",
  payer: "Thandé Parent",
  recipients: ["parent@example.test"],
  issuedOn: "2026-10-27",
  method: "Cash",
  reference: "CASH-001",
  items: [
    { description: "Allocated to VT-20261101", cents: 80000 },
    { description: "Available family credit", cents: 20000 },
  ],
  totalCents: 100000,
  creditCents: 20000,
  note: "This receipt records the payment shown. Other invoices may remain outstanding.",
};
describe("accounting financial documents", () => {
  it("builds stable branded receipt bytes for idempotent email retries", async () => {
    const first = await buildAccountingPDF(receipt),
      second = await buildAccountingPDF(receipt);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    const doc = await PDFDocument.load(first);
    expect(doc.getTitle()).toBe("Payment receipt VT-RC-20261001");
    expect(doc.getPageCount()).toBe(1);
  });
  it("escapes customer text and includes the original email branding", () => {
    const email = accountingEmail({
      ...receipt,
      payer: "Parent <script>alert(1)</script>",
    });
    expect(email.html).toContain("viva-tutorials-logo.png");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.text).toContain("R1000.00");
    expect(email.text).toContain("PDF is attached");
  });
  it("paginates long statements and retains readable financial document metadata", async () => {
    const pdf = await buildAccountingPDF({
      ...receipt,
      documentKind: "statement",
      title: "Family account statement",
      openingCents: 10000,
      items: Array.from({ length: 100 }, (_, index) => ({
        description: `Invoice ${index} for a long academic period with a clear description`,
        cents: index * 100,
      })),
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
  });
});
