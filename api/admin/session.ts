import type { ServerResponse } from "node:http";
import {
  authorizeToken,
  privateResponse,
  requireAdmin,
  sameOrigin,
  sessionCookie,
} from "../_lib/admin.js";
import {
  getSupabaseConfig,
  handleError,
  HttpError,
  readJsonBody,
  sendJson,
  type ApiRequest,
} from "../_lib/http.js";

export default async function handler(
  request: ApiRequest,
  response: ServerResponse,
) {
  privateResponse(response);
  try {
    if (request.method === "GET")
      return sendJson(response, 200, { user: await requireAdmin(request) });
    if (!["POST", "DELETE"].includes(request.method || ""))
      throw new HttpError(405, "Method not allowed.");
    sameOrigin(request);
    if (request.method === "DELETE") {
      response.setHeader("Set-Cookie", sessionCookie("", 0));
      return sendJson(response, 200, { success: true });
    }
    const body = await readJsonBody(request, 4096, "Admin login");
    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      body.password.length > 1024
    )
      throw new HttpError(400, "Email and password are required.");
    const config = getSupabaseConfig();
    if (!config) throw new HttpError(503, "Supabase is not configured.");
    const auth = await fetch(
      `${config.url}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { apikey: config.key, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: body.email.trim(),
          password: body.password,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!auth.ok)
      throw new HttpError(
        auth.status === 429 ? 429 : 401,
        "Sign-in failed. Check your details or try again later.",
      );
    const session = (await auth.json()) as {
      access_token: string;
      expires_in: number;
    };
    const user = await authorizeToken(session.access_token);
    response.setHeader(
      "Set-Cookie",
      sessionCookie(
        session.access_token,
        Math.min(session.expires_in || 3600, 3600),
      ),
    );
    return sendJson(response, 200, { user });
  } catch (error) {
    return handleError(
      response,
      error,
      "Admin session",
      "Sign-in service is unavailable.",
    );
  }
}
