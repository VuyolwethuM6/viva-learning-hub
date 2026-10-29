import type { ServerResponse } from "node:http";
import { readJsonBody, handleError, type ApiRequest } from "./_lib/http.js";

function respond(
  response: ServerResponse,
  status: number,
  body: Record<string, string>,
) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

export default async function handler(
  request: ApiRequest,
  response: ServerResponse,
) {
  if (request.method !== "POST")
    return respond(response, 405, { error: "Method not allowed" });
  try {
    const body = await readJsonBody(request, 8192, "Subject request");
    const subject = String(body.subject || "").trim();
    const email = String(body.email || "").trim();
    if (!subject || !/^\S+@\S+\.\S+$/.test(email))
      return respond(response, 400, {
        error: "A subject and valid email are required.",
      });
    if (
      !process.env.RESEND_API_KEY ||
      !process.env.EMAIL_FROM ||
      !process.env.ADMIN_EMAIL
    )
      return respond(response, 503, {
        error: "Email service is not configured.",
      });
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [process.env.ADMIN_EMAIL],
        reply_to: email,
        subject: `Subject request: ${subject}`,
        text: `Requested subject: ${subject}\nRequester: ${email}`,
      }),
    });
    if (!emailResponse.ok)
      return respond(response, 502, {
        error: "Email provider rejected the request.",
      });
    return respond(response, 200, { message: "Request sent." });
  } catch (error) {
    return handleError(
      response,
      error,
      "Subject request",
      "The request could not be completed. Please try again.",
    );
  }
}
