import { db, rpc, uuid } from "./admin.js";
import { getEmailConfig } from "./email.js";
import { HttpError } from "./http.js";
import { buildTuitionPDF, documentFilename } from "./tuition-document.js";
import {
  accountingEmail,
  accountingFilename,
  buildAccountingPDF,
  type AccountingDocument,
} from "./accounting-document.js";
import { tuitionEmail } from "./tuition-email.js";

export async function dispatchTuitionMessage(actorId: string, id: string) {
  const config = getEmailConfig();
  if (!config) throw new HttpError(503, "Email is not configured.");
  const message = await rpc<{
    id: string;
    claim_token: string;
    kind: string;
    invoice_id: string | null;
    created_at: string;
    payload: Parameters<typeof tuitionEmail>[1];
  } | null>("admin_claim_message", { p_actor: actorId, p_id: id });
  if (!message) return { success: true, skipped: true };
  try {
    let rendered: ReturnType<typeof tuitionEmail>;
    const attachments: { filename: string; content: string }[] = [];
    if (
      ["account_receipt", "credit_note", "refund", "allocation"].includes(
        message.kind,
      )
    ) {
      const document = message.payload as unknown as AccountingDocument;
      rendered = accountingEmail(document);
      attachments.push({
        filename: accountingFilename(document),
        content: Buffer.from(await buildAccountingPDF(document)).toString(
          "base64",
        ),
      });
    } else {
      let documentDetails: {
        periodStart?: string;
        periodEnd?: string;
        monthlyFee?: number;
        transactionReference?: string;
      } = {};
      if (message.kind === "invoice" || message.kind === "receipt") {
        const invoice = await db<
          { period_start: string; period_end: string; monthly_fee: number }[]
        >(
          `/rest/v1/tuition_invoices?id=eq.${uuid(message.invoice_id)}&select=period_start,period_end,monthly_fee`,
        );
        if (!invoice[0])
          throw new HttpError(
            404,
            "The invoice for this document was not found.",
          );
        documentDetails = {
          periodStart: invoice[0].period_start,
          periodEnd: invoice[0].period_end,
          monthlyFee: Number(invoice[0].monthly_fee),
        };
        if (message.kind === "receipt") {
          const payment = await db<{ transaction_reference: string }[]>(
            `/rest/v1/tuition_payments?id=eq.${uuid(message.payload.paymentId)}&invoice_id=eq.${message.invoice_id}&select=transaction_reference`,
          );
          if (!payment[0])
            throw new HttpError(
              404,
              "The recorded payment for this receipt was not found.",
            );
          documentDetails.transactionReference =
            payment[0].transaction_reference;
        }
      }
      const payload = { ...message.payload, ...documentDetails };
      rendered = tuitionEmail(message.kind, payload);
      if (message.kind === "invoice" || message.kind === "receipt") {
        const pdf = await buildTuitionPDF({
          ...payload,
          kind: message.kind,
          issuedAt: message.created_at,
          bankConfirmed: process.env.TUITION_BANK_DETAILS_CONFIRMED === "true",
        });
        attachments.push({
          filename: documentFilename(payload, message.kind),
          content: Buffer.from(pdf).toString("base64"),
        });
      }
    }
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `tuition-${message.id}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: rendered.to,
        reply_to: config.admin,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        ...(attachments.length ? { attachments } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!sent.ok)
      throw new HttpError(
        502,
        "The email provider did not confirm acceptance. Check provider history before retrying.",
      );
    await rpc("admin_finish_message", {
      p_actor: actorId,
      p_id: id,
      p_claim: message.claim_token,
      p_success: true,
    });
  } catch (error) {
    await rpc("admin_finish_message", {
      p_actor: actorId,
      p_id: id,
      p_claim: message.claim_token,
      p_success: false,
    });
    throw error;
  }

  return { success: true };
}
