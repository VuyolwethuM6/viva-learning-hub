import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { rpc } from "./admin.js";
import { getEmailConfig } from "./email.js";
import { customerEmailHtml, adminEmailHtml } from "./payfast-email.js";
import { paidProducts } from "./payfast-protocol.js";
type Delivery = {
  id: string;
  claim_id: string;
  recipient: string;
  kind: string;
  order: {
    id: string;
    product: string;
    file_name: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    amount_cents: number;
  };
  payment: { providerId: string; verifiedOn: string };
};
export async function dispatchPDFOrder(orderId: string) {
  const config = getEmailConfig();
  if (!config) return { pending: true };
  for (const kind of ["customer", "admin"]) {
    const d = await rpc<Delivery | null>("payfast_claim_delivery", {
      p_order: orderId,
      p_kind: kind,
      p_admin: config.admin,
    });
    if (!d) continue;
    let state = "uncertain",
      provider: string | null = null,
      error: string | null = null;
    try {
      const product = paidProducts[d.order.product];
      if (!product || product.file !== d.order.file_name)
        throw new Error("The recorded PDF version needs staff review.");
      let file: Buffer;
      try {
        file = await readFile(
          join(process.cwd(), "private", "materials", product.file),
        );
      } catch {
        state = "failed";
        throw new Error(
          "The recorded PDF is unavailable. Restore its file before retrying.",
        );
      }
      const details = {
        customerName: `${d.order.first_name} ${d.order.last_name}`,
        customerFirstName: d.order.first_name,
        customerEmail: d.order.email,
        customerPhone: d.order.phone,
        itemName: d.order.product,
        fileName: product.file,
        amount: (d.order.amount_cents / 100).toFixed(2),
        paymentId: d.payment.providerId,
        issuedOn: d.payment.verifiedOn,
      };
      const subject =
        kind === "customer"
          ? `Your Viva Tutorials PDF: ${d.order.product}`
          : `New PDF purchase: ${d.order.product}`;
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `viva-pdf-${d.id}`,
        },
        body: JSON.stringify({
          from: config.from,
          to: [d.recipient],
          subject,
          text: `Verified PayFast payment ${d.payment.providerId}. ${d.order.product} · R${details.amount}. PDF attached.`,
          html:
            kind === "customer"
              ? customerEmailHtml(details)
              : adminEmailHtml(details),
          attachments: [
            { filename: product.file, content: file.toString("base64") },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (sent.ok) {
        const result = (await sent.json().catch(() => null)) as {
          id?: unknown;
        } | null;
        if (typeof result?.id === "string" && result.id) {
          state = "accepted";
          provider = result.id;
        } else
          error =
            "Provider acceptance could not be confirmed. Review its history.";
      } else {
        state =
          sent.status >= 400 && sent.status < 500 && sent.status !== 409
            ? "failed"
            : "uncertain";
        error =
          "The provider did not confirm this delivery. Review provider history before retrying.";
      }
    } catch (e) {
      error =
        e instanceof Error ? e.message : "Delivery needs provider review.";
    }
    await rpc("payfast_finish_delivery", {
      p_id: d.id,
      p_claim: d.claim_id,
      p_state: state,
      p_provider: provider,
      p_error: error,
    });
  }
  return { pending: false };
}
