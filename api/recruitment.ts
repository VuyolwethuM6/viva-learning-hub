import type { ServerResponse } from "node:http";
import { privateResponse } from "./_lib/admin.js";
import { sendJson, type ApiRequest } from "./_lib/http.js";
import staff from "./_lib/recruitment-admin-handler.js";
import careers from "./_lib/recruitment-careers-handler.js";
import applicant from "./_lib/recruitment-applicant-handler.js";

const selector = "__viva_recruitment";
const paths = {
  staff: "/api/admin/recruitment",
  careers: "/api/careers",
  applicant: "/api/recruitment",
} as const;

/** One deployed function; each logical API retains its own authentication and policy. */
export default async function handler(req: ApiRequest, res: ServerResponse) {
  const originalUrl = req.url;
  try {
    const url = new URL(originalUrl || "/api/recruitment", "http://localhost");
    const choices = url.searchParams.getAll(selector);
    const fromPath =
      url.pathname === paths.staff
        ? "staff"
        : url.pathname === paths.careers
          ? "careers"
          : "applicant";
    const choice = choices[0] || fromPath;
    if (
      (originalUrl || "").length > 4096 ||
      choices.length > 1 ||
      (choices.length === 1 && !["staff", "careers"].includes(choices[0])) ||
      (fromPath !== "applicant" && choice !== fromPath) ||
      !Object.values(paths).includes(
        url.pathname as (typeof paths)[keyof typeof paths],
      )
    ) {
      privateResponse(res);
      res.setHeader("X-Recruitment-Error", "confirmed");
      return sendJson(res, 400, { error: "Invalid recruitment endpoint." });
    }
    // The selector is routing only, never an authority claim. Normalize away the
    // rewrite parameter before delegation so public query allowlists stay strict.
    // Cookies are forwarded unchanged: the browser still uses each ORIGINAL URL's
    // cookie path, including /api/admin/recruitment for the isolated staff session.
    url.searchParams.delete(selector);
    req.url = paths[choice as keyof typeof paths] + url.search;
    if (choice === "staff") return await staff(req, res);
    if (choice === "careers") return await careers(req, res);
    return await applicant(req, res);
  } finally {
    req.url = originalUrl;
  }
}
