import { getEmailConfig } from "../_lib/email.js";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { rpc, uuid } from "../_lib/admin.js";
import {
  paidProducts,
  payfastSignature,
  payfastOrigin,
} from "../_lib/payfast-protocol.js";
import {
  readJsonBody,
  sendJson,
  handleError,
  HttpError,
  type ApiRequest,
} from "../_lib/http.js";
export default async function handler(
  request: ApiRequest,
  response: ServerResponse,
) {
  response.setHeader("Cache-Control", "no-store");
  try {
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed.");
    const body = await readJsonBody(request, 16384, "PDF checkout");
    const product = paidProducts[String(body.material || "")];
    const firstName = String(body.firstName || "").trim(),
      lastName = String(body.lastName || "").trim(),
      email = String(body.email || "")
        .trim()
        .toLowerCase(),
      phone = String(body.phone || "").trim();
    if (
      !product ||
      firstName.length < 1 ||
      firstName.length > 100 ||
      lastName.length < 1 ||
      lastName.length > 100 ||
      email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      phone.length < 3 ||
      phone.length > 40
    )
      throw new HttpError(
        400,
        "Complete customer and product details are required.",
      );
    const origin = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "");
    if (
      !origin ||
      !process.env.PAYFAST_MERCHANT_ID ||
      !process.env.PAYFAST_MERCHANT_KEY
    )
      throw new HttpError(503, "PayFast server configuration is incomplete.");
    if (!getEmailConfig())
      throw new HttpError(
        503,
        "PDF delivery is temporarily unavailable. Please try again later.",
      );
    const providerOrigin = payfastOrigin();
    const order = await rpc<{ id: string; amount_cents: number }>(
      "payfast_order_create",
      {
        p_id: body.requestId ? uuid(body.requestId) : randomUUID(),
        p_product: product.title,
        p_first: firstName,
        p_last: lastName,
        p_email: email,
        p_phone: phone,
      },
    );
    const fields: Record<string, string> = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY,
      return_url: `${origin}/payment-success`,
      cancel_url: `${origin}/payment-cancelled`,
      notify_url:
        process.env.PAYFAST_NOTIFY_URL || `${origin}/api/payfast/notify`,
      name_first: firstName,
      name_last: lastName,
      email_address: email,
      cell_number: phone,
      m_payment_id: order.id,
      amount: (order.amount_cents / 100).toFixed(2),
      item_name: product.title,
      custom_str1: product.title,
      custom_str2: email,
    };
    return sendJson(response, 200, {
      endpoint: providerOrigin + "/eng/process",
      fields: { ...fields, signature: payfastSignature(fields) },
    });
  } catch (e) {
    return handleError(
      response,
      e,
      "PDF checkout",
      "Checkout could not be prepared. Please retry with the same checkout request.",
    );
  }
}
