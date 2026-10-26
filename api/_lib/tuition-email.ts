import { BANK_DETAILS } from "./payment-details.js";
import { escapeHtml } from "./email.js";
import { HttpError } from "./http.js";

import { BRAND, type TuitionPayload } from "./tuition-document.js";
type Payload = TuitionPayload;
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
      "Our team will contact you to confirm your session arrangements and help you get started.",
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
    html: `<div style="background:#f4f4f4;padding:24px 10px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#f9f3ec;padding:20px 24px;text-align:center;"><img src="${BRAND.logo}" alt="Viva Tutorials" width="115" style="width:115px;height:auto;display:block;margin:auto;"></td></tr>
      <tr><td style="padding:28px;color:#333;font-size:14px;line-height:1.7;"><span style="display:inline-block;padding:4px 10px;border-radius:20px;background:${kind === "receipt" ? "#D6F7E8" : "#F0EBFF"};color:${kind === "receipt" ? "#0FA958" : "#7A4AF1"};font-size:11px;font-weight:bold;letter-spacing:1px;">${kind === "receipt" ? "PAYMENT RECORDED" : kind === "activation" ? "WELCOME TO VIVA" : "TUITION"}</span><h1 style="font-size:23px;line-height:1.3;color:${kind === "receipt" ? "#0FA958" : "#7A4AF1"};margin:16px 0;">${escapeHtml(title)}</h1>
      ${lines
        .slice(1)
        .map(
          (line) =>
            `<p style="margin:0 0 12px;overflow-wrap:anywhere;">${escapeHtml(line)}</p>`,
        )
        .join("")}
      ${["invoice", "receipt"].includes(kind) ? '<p style="padding:16px;background:#F0EBFF;border-radius:8px;color:#5428CC;font-weight:bold;">Your branded PDF is attached. Keep it with your records.</p>' : ""}</td></tr>
      <tr><td style="background:#f9f9f9;border-top:1px solid #DDD6F0;padding:18px 24px;color:#777;font-size:12px;">Need help? Contact <a href="mailto:${BRAND.email}" style="color:#7A4AF1;text-decoration:none;">${BRAND.email}</a><br>Viva Tutorials · ${BRAND.location}</td></tr>
      </table></div>`,
    to: Array.from(
      new Set(
        p.recipients.map((email) => email.trim().toLowerCase()).filter(Boolean),
      ),
    ),
  };
}
