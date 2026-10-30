import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http.js";
export const paidProducts: Record<
  string,
  { title: string; amount: string; file: string }
> = {
  "Analytical Geometry Practice": {
    title: "Analytical Geometry Practice",
    amount: "299.00",
    file: "02. Analytical Geometry Practice Questions.pdf",
  },
  "Finance Practice Questions": {
    title: "Finance Practice Questions",
    amount: "399.00",
    file: "04. Finance Practice Questions.pdf",
  },
};
export function payfastSignature(
  fields: Record<string, string>,
  passphrase = process.env.PAYFAST_PASSPHRASE,
) {
  const text = Object.entries(fields)
    .filter(([k, v]) => k !== "signature" && v !== "")
    .map(
      ([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, "+")}`,
    )
    .join("&");
  return createHash("md5")
    .update(
      text +
        (passphrase
          ? `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`
          : ""),
    )
    .digest("hex");
}
export function verifyPayfastSignature(
  raw: string,
  fields: Record<string, string>,
) {
  if (!/^[a-f0-9]{32}$/i.test(fields.signature || ""))
    throw new HttpError(400, "Invalid signature.");
  const encoded = raw
    .split("&")
    .filter((p) => !p.startsWith("signature="))
    .join("&");
  const pass = process.env.PAYFAST_PASSPHRASE;
  const rawHash = createHash("md5")
    .update(
      encoded +
        (pass
          ? `&passphrase=${encodeURIComponent(pass.trim()).replace(/%20/g, "+")}`
          : ""),
    )
    .digest("hex");
  const given = Buffer.from(fields.signature.toLowerCase());
  if (
    ![rawHash, payfastSignature(fields)].some((v) =>
      timingSafeEqual(given, Buffer.from(v)),
    )
  )
    throw new HttpError(400, "Invalid signature.");
}
export function providerCents(value: string, signed = false) {
  if (
    !(signed ? /^-?\d{1,8}(?:\.\d{1,2})?$/ : /^\d{1,8}(?:\.\d{1,2})?$/).test(
      value || "",
    )
  )
    throw new HttpError(400, "Invalid payment amount.");
  const negative = value.startsWith("-"),
    [whole, fraction = ""] = value.replace("-", "").split(".");
  return (
    (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) *
    (negative ? -1 : 1)
  );
}

export function payfastOrigin() {
  const mode = process.env.PAYFAST_MODE || "live";
  if (!["live", "sandbox"].includes(mode))
    throw new HttpError(503, "Choose live or sandbox PayFast configuration.");
  if (mode === "live" && !process.env.PAYFAST_PASSPHRASE?.trim())
    throw new HttpError(
      503,
      "Configure the PayFast security passphrase before accepting live payments.",
    );
  return mode === "sandbox"
    ? "https://sandbox.payfast.co.za"
    : "https://www.payfast.co.za";
}
