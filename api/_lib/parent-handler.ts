import type { ServerResponse } from "node:http";
import { privateResponse, rpc, sameOrigin, uuid } from "./admin.js";
import {
  accountingFilename,
  buildAccountingPDF,
  type AccountingDocument,
} from "./accounting-document.js";
import { buildTuitionPDF, documentFilename } from "./tuition-document.js";
import { loadTuitionDocument } from "./tuition-document-data.js";
import { BANK_DETAILS } from "./payment-details.js";
import {
  completeParentSession,
  limitParentAuth,
  parentAuthFetch,
  parentCookie,
  parentCookies,
  parentEmail,
  requireParent,
} from "./parent-auth.js";
import {
  handleError,
  HttpError,
  readJsonBody,
  sendJson,
  type ApiRequest,
} from "./http.js";
import type { ParentSnapshot } from "../../src/lib/parent-types.js";

// The /api/parent rewrite shares a deployed function with admin session to stay
// within the existing function budget. Authentication/authorization stay separate.
export default async function parentHandler(
  request: ApiRequest,
  response: ServerResponse,
) {
  privateResponse(response);
  try {
    const url = new URL(request.url || "", "http://localhost");
    if (
      request.method === "GET" &&
      url.searchParams.get("action") === "callback"
    ) {
      const hash = url.searchParams.get("token_hash") || "";
      let destination = "/parent";
      try {
        if (!/^[A-Za-z0-9_-]{32,256}$/.test(hash))
          throw new HttpError(401, "Invalid sign-in link.");
        const auth = await parentAuthFetch("verify", {
          token_hash: hash,
          type: "email",
        });
        await completeParentSession(response, auth);
      } catch {
        // An old email link must not sign an already authenticated parent out.
        destination = "/parent?signin=expired";
      }
      response.statusCode = 303;
      response.setHeader("Location", destination);
      return response.end();
    }
    if (request.method === "GET") {
      const user = await requireParent(request);
      if (url.searchParams.get("action") === "session")
        return sendJson(response, 200, { user });
      if (url.searchParams.get("action") === "document") {
        const kind = url.searchParams.get("kind") || "",
          id = uuid(url.searchParams.get("id"));
        if (
          ![
            "invoice",
            "account_receipt",
            "credit_note",
            "refund",
            "statement",
          ].includes(kind)
        )
          throw new HttpError(404, "Document unavailable for this account.");
        // Ownership is checked before loading any file or financial source data.
        const document = await rpc<
          AccountingDocument | { kind: "invoice"; id: string }
        >("parent_document", { p_user: user.id, p_kind: kind, p_id: id });
        let bytes: Uint8Array, name: string;
        if ("kind" in document) {
          const invoice = await loadTuitionDocument("invoice", document.id);
          bytes = await buildTuitionPDF(invoice);
          name = documentFilename(invoice, "invoice");
        } else {
          bytes = await buildAccountingPDF(document);
          name = accountingFilename(document);
        }
        response.setHeader("Content-Type", "application/pdf");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Disposition", `inline; filename="${name}"`);
        return response.end(Buffer.from(bytes));
      }
      const snapshot = await rpc<ParentSnapshot>("parent_snapshot", {
        p_user: user.id,
      });
      return sendJson(response, 200, {
        ...snapshot,
        paymentDetails:
          process.env.TUITION_BANK_DETAILS_CONFIRMED === "true"
            ? BANK_DETAILS
            : null,
      });
    }
    if (!["POST", "DELETE"].includes(request.method || ""))
      throw new HttpError(405, "Method not allowed.");
    sameOrigin(request);
    if (request.method === "DELETE") {
      const token = parentCookie(request, "access");
      if (token) {
        try {
          await parentAuthFetch("logout?scope=local", {}, token);
        } catch {
          /* Local cookies are always cleared. */
        }
      }
      parentCookies(response);
      return sendJson(response, 200, { success: true });
    }
    const body = await readJsonBody(request, 4096, "Parent sign-in");
    if (body.action === "refresh") {
      const token = parentCookie(request, "refresh");
      if (!token || token.length > 8192)
        throw new HttpError(401, "Please sign in again.");
      const auth = await parentAuthFetch("token?grant_type=refresh_token", {
        refresh_token: token,
      });
      try {
        return sendJson(response, 200, {
          user: await completeParentSession(response, auth),
        });
      } catch (error) {
        parentCookies(response);
        throw error;
      }
    }
    const email = parentEmail(body.email);
    if (body.action === "request_link") {
      const base = process.env.PARENT_PORTAL_URL || process.env.PUBLIC_SITE_URL;
      let callback: URL;
      try {
        callback = new URL("/api/parent?action=callback", base);
        if (
          callback.protocol !== "https:" &&
          !(
            process.env.NODE_ENV !== "production" &&
            callback.hostname === "localhost"
          )
        )
          throw new Error();
      } catch {
        throw new HttpError(
          503,
          "Parent sign-in is not configured. Please contact Viva Tutorials.",
        );
      }
      await limitParentAuth(request, email, "send");
      const allowed = await rpc<boolean>("parent_signin_allowed", {
        p_email: email,
      });
      if (allowed) {
        const auth = await parentAuthFetch(
          `otp?redirect_to=${encodeURIComponent(callback.href)}`,
          { email, create_user: true },
        );
        // The public response never confirms whether a guardian account exists.
        if (!auth.ok)
          console.error(
            "[Parent auth] OTP delivery request rejected",
            auth.status,
          );
      }
      return sendJson(response, 200, {
        success: true,
        message:
          "If parent access is enabled for this email, a sign-in link is on its way. Open the email and tap Open my parent portal.",
      });
    }
    throw new HttpError(400, "Unknown parent sign-in action.");
  } catch (error) {
    return handleError(
      response,
      error,
      "Parent portal",
      "The parent portal is unavailable. Please try again later.",
    );
  }
}
