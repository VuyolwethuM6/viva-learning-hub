import { BANK_DETAILS } from "./payment-details.js";
import { escapeHtml } from "./email.js";
import { HttpError } from "./http.js";

type Payload = {
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
  remainingDays: number;
  teachingDays: number;
};
const money = (cents: number) => `R${(cents / 100).toFixed(2)}`;
export function tuitionEmail(kind: string, payload: Payload) {
  const p = payload;
  const titles: Record<string, string> = {
    invoice: "Tuition invoice",
    receipt: "Tuition payment recorded",
    reminder: "Tuition payment reminder",
    activation: "Enrollment activated",
  };
  const title = titles[kind];
  if (!title) throw new Error("Unsupported message type");
  const lines = [
    title,
    `Learner: ${p.learner}`,
    `Student number: ${p.studentNumber}`,
    `Invoice: ${p.invoiceNumber}`,
    `Billing month: ${p.month.slice(0, 7)}`,
  ];
  if (kind === "receipt") {
    lines.push(
      `Payment recorded: ${money(p.paidCents || 0)}`,
      `Payment date: ${p.paidOn}`,
      `Method: ${p.method}`,
      `Invoice balance after this payment: ${money(p.balanceCents)}`,
      "This receipt covers this payment only. Other invoices may remain outstanding.",
    );
  } else if (kind === "activation") {
    lines.push(
      "Your application has been approved and your first invoice is fully paid. Your enrollment is now active.",
      "Our team will contact you to confirm your session arrangements. This email does not create a learner portal or Google Classroom invitation.",
    );
  } else {
    if (process.env.TUITION_BANK_DETAILS_CONFIRMED !== "true")
      throw new HttpError(
        503,
        "Confirm the bank details in api/_lib/payment-details.ts and set TUITION_BANK_DETAILS_CONFIRMED=true before sending payment instructions.",
      );
    lines.push(
      `Invoice total: ${money(p.amountCents)}`,
      `Balance when this notice was prepared: ${money(p.balanceCents)}`,
      `Due date: ${p.dueDate}`,
      `Teaching days charged: ${p.remainingDays} of ${p.teachingDays}`,
      "If you have already paid, contact us to confirm matching before paying again.",
      `Bank: ${BANK_DETAILS.bank}`,
      `Account name: ${BANK_DETAILS.accountName}`,
      `Account number: ${BANK_DETAILS.accountNumber}`,
      `Account type: ${BANK_DETAILS.accountType}`,
      `Branch code: ${BANK_DETAILS.branchCode}`,
      `Payment reference: ${p.studentNumber}`,
      "Include your invoice number when sending payment details. Payment must be verified before initial activation.",
    );
  }
  lines.push(
    "Questions or payment arrangements: reply to this email.",
    "Viva Tutorials",
  );
  return {
    subject: `${title}: ${p.invoiceNumber}`,
    text: lines.join("\n\n"),
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#160f2e"><h1 style="color:#7949fe">${escapeHtml(title)}</h1>${lines
      .slice(1)
      .map((line) => `<p style="line-height:1.6">${escapeHtml(line)}</p>`)
      .join("")}</div>`,
    to: Array.from(
      new Set(
        p.recipients.map((email) => email.trim().toLowerCase()).filter(Boolean),
      ),
    ),
  };
}
