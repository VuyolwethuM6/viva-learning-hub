import type { ServerResponse } from "node:http";
import { rpc, uuid } from "../_lib/admin.js";
import { readFormBody, HttpError, type ApiRequest } from "../_lib/http.js";
import {
  paidProducts,
  payfastOrigin,
  providerCents,
  verifyPayfastSignature,
} from "../_lib/payfast-protocol.js";
import { dispatchPDFOrder } from "../_lib/payfast-delivery.js";
export default async function handler(
  request: ApiRequest,
  response: ServerResponse,
) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  try {
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed.");
    const { raw, fields } = await readFormBody(request, 65536);
    const product = paidProducts[fields.item_name];
    if (!process.env.PAYFAST_MERCHANT_ID)
      throw new HttpError(503, "Payment verification is not configured.");
    if (
      !product ||
      fields.merchant_id !== process.env.PAYFAST_MERCHANT_ID ||
      providerCents(fields.amount_gross || fields.amount) !==
        providerCents(product.amount)
    )
      throw new HttpError(400, "Invalid purchase.");
    const providerOrigin = payfastOrigin();
    verifyPayfastSignature(raw, fields);
    const validation = await fetch(providerOrigin + "/eng/query/validate", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: raw,
      signal: AbortSignal.timeout(12000),
    });
    if (!validation.ok || (await validation.text()).trim() !== "VALID")
      throw new HttpError(400, "Payment not validated.");
    if (fields.payment_status !== "COMPLETE") {
      response.statusCode = 202;
      return response.end("Payment incomplete");
    }
    if (
      !/^[A-Za-z0-9_-]{1,120}$/.test(fields.pf_payment_id || "") ||
      !/^\S+@\S+\.\S+$/.test(fields.email_address || "")
    )
      throw new HttpError(400, "Invalid payment reference or recipient.");
    const gross = providerCents(product.amount);
    const fee =
      fields.amount_fee !== undefined
        ? Math.abs(providerCents(fields.amount_fee, true))
        : fields.amount_net !== undefined
          ? gross - providerCents(fields.amount_net)
          : null;
    if (
      fee !== null &&
      (fee > gross ||
        fee < 0 ||
        (fields.amount_net !== undefined &&
          providerCents(fields.amount_net) + fee !== gross))
    )
      throw new HttpError(400, "Invalid provider fee or net amount.");
    const saved = await rpc<{ orderId: string }>("payfast_record_payment", {
      p_data: {
        orderId: fields.m_payment_id ? uuid(fields.m_payment_id) : null,
        paymentId: fields.pf_payment_id,
        product: product.title,
        grossCents: gross,
        feeCents: fee,
        email: fields.email_address.trim().toLowerCase(),
        firstName: fields.name_first?.trim() || "Customer",
        lastName: fields.name_last?.trim() || "Customer",
        phone: fields.cell_number?.trim() || "Not provided",
        adminEmail: process.env.ADMIN_EMAIL || null,
      },
    });
    // Payment is durable before external email. Sending/uncertain attempts are never reclaimed automatically.
    try {
      await dispatchPDFOrder(saved.orderId);
    } catch {
      console.error(
        "[PayFast] Verified payment saved; delivery needs staff review.",
      );
    }
    response.statusCode = 200;
    return response.end("Payment recorded");
  } catch (e) {
    response.statusCode = e instanceof HttpError ? e.status : 503;
    response.end(
      e instanceof HttpError
        ? e.message
        : "Notification could not be recorded. Retry safely.",
    );
  }
}
