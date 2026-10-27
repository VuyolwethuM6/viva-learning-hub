import { createHash } from "node:crypto";
import type { ServerResponse } from "node:http";
import { rpc, uuid } from "./admin.js";
import { getSupabaseConfig, HttpError, type ApiRequest } from "./http.js";

export type ParentUser = { id: string; email: string };
type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};
export type PortalAudience = "parent" | "tutor" | "student";
const names = (audience: PortalAudience) => ({
  access: `viva_${audience}`,
  refresh: `viva_${audience}_refresh`,
});
export function parentCookie(
  request: ApiRequest,
  kind: "access" | "refresh",
  audience: PortalAudience = "parent",
) {
  const cookieNames = names(audience);
  return (
    (request.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieNames[kind] + "="))
      ?.slice(cookieNames[kind].length + 1) || ""
  );
}
export function parentCookies(
  response: ServerResponse,
  session?: AuthSession,
  audience: PortalAudience = "parent",
) {
  const cookieNames = names(audience);
  const secure =
    process.env.NODE_ENV === "production" ||
    ["preview", "production"].includes(process.env.VERCEL_ENV || "");
  const attributes = `; Path=/api/${audience}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
  response.setHeader("Set-Cookie", [
    `${cookieNames.access}=${session?.access_token || ""}; Max-Age=${session ? Math.min(session.expires_in || 3600, 3600) : 0}${attributes}`,
    `${cookieNames.refresh}=${session?.refresh_token || ""}; Max-Age=${session ? 7 * 24 * 3600 : 0}${attributes}`,
  ]);
}
export function parentEmail(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    throw new HttpError(400, "Enter your email address.");
  return value.trim().toLowerCase();
}
export async function parentAuthFetch(
  path: string,
  data?: object,
  token?: string,
) {
  const config = getSupabaseConfig();
  if (!config) throw new HttpError(503, "Email sign-in is not configured.");
  return fetch(`${config.url}/auth/v1/${path}`, {
    method: data ? "POST" : "GET",
    headers: {
      apikey: config.key,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(15000),
  });
}
async function verifiedIdentity(token: string): Promise<ParentUser> {
  if (!token || token.length > 8192)
    throw new HttpError(401, "Please sign in to your Viva account.");
  const response = await parentAuthFetch("user", undefined, token);
  if (!response.ok)
    throw new HttpError(401, "Your session has expired. Please sign in again.");
  const user = (await response.json()) as {
    id?: string;
    email?: string;
    email_confirmed_at?: string;
  };
  if (!user.id || !user.email || !user.email_confirmed_at)
    throw new HttpError(401, "A verified email is required.");
  return { id: uuid(user.id), email: parentEmail(user.email) };
}
export async function requireParent(
  request: ApiRequest,
  audience: PortalAudience = "parent",
): Promise<ParentUser> {
  const user = await verifiedIdentity(
    parentCookie(request, "access", audience),
  );
  try {
    await rpc(`${audience}_assert`, { p_user: user.id });
  } catch (error) {
    if (error instanceof HttpError && error.status === 409)
      throw new HttpError(
        403,
        `${audience[0].toUpperCase() + audience.slice(1)} access is unavailable. Contact Viva Tutorials.`,
      );
    throw error;
  }
  return user;
}
export async function completeParentSession(
  response: ServerResponse,
  auth: Response,
  expectedEmail?: string,
  audience: PortalAudience = "parent",
) {
  if (!auth.ok)
    throw new HttpError(
      auth.status === 429 ? 429 : 401,
      "The sign-in link or session is invalid or has expired. Request a new link and try again.",
    );
  const session = (await auth.json()) as AuthSession;
  if (
    !session.access_token ||
    !session.refresh_token ||
    !/^[A-Za-z0-9._~-]+$/.test(session.access_token) ||
    !/^[A-Za-z0-9._~-]+$/.test(session.refresh_token)
  )
    throw new HttpError(502, "Sign-in could not be confirmed.");
  const user = await verifiedIdentity(session.access_token);
  if (expectedEmail && user.email !== expectedEmail)
    throw new HttpError(
      401,
      "The verified email does not match this sign-in request.",
    );
  try {
    await rpc(`${audience}_bind`, { p_user: user.id });
  } catch (error) {
    if (error instanceof HttpError && error.status === 409)
      throw new HttpError(
        403,
        `${audience[0].toUpperCase() + audience.slice(1)} access is unavailable. Contact Viva Tutorials.`,
      );
    throw error;
  }
  parentCookies(response, session, audience);
  return user;
}
export async function limitParentAuth(
  request: ApiRequest,
  email: string,
  operation: "send" | "verify",
  audience: PortalAudience = "parent",
) {
  const config = getSupabaseConfig();
  if (!config) throw new HttpError(503, "Email sign-in is not configured.");
  const address = String(
    request.headers["x-forwarded-for"] ||
      request.socket?.remoteAddress ||
      "unknown",
  )
    .split(",")[0]
    .trim();
  for (const [kind, value] of [
    [`${operation}_email`, email],
    [`${operation}_ip`, address],
  ]) {
    const hash = createHash("sha256")
      .update(config.key + ":" + audience + ":" + kind + ":" + value)
      .digest("hex");
    if (
      !(await rpc<boolean>("parent_rate_limit", { p_hash: hash, p_kind: kind }))
    )
      throw new HttpError(
        429,
        "Please wait before trying again. You can request another email after a minute; repeated attempts may need 15 minutes.",
      );
  }
}
