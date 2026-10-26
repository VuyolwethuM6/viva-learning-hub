import type { ServerResponse } from "node:http";
import {
  getSupabaseConfig,
  HttpError,
  serviceHeaders,
  type ApiRequest,
  type JsonObject,
} from "./http.js";

const cookieName = "viva_admin";
export function privateResponse(response: ServerResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader("Vary", "Cookie");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
}
export function sameOrigin(request: ApiRequest) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host)
    throw new HttpError(403, "A same-origin request is required.");
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new HttpError(403, "Invalid origin.");
  }
  if (url.host !== host || !["http:", "https:"].includes(url.protocol))
    throw new HttpError(403, "Invalid origin.");
  if (
    request.method !== "DELETE" &&
    !request.headers["content-type"]?.startsWith("application/json")
  )
    throw new HttpError(415, "JSON is required.");
}
export async function db<T = JsonObject>(path: string, init: RequestInit = {}) {
  const config = getSupabaseConfig();
  if (!config) throw new HttpError(503, "Supabase is not configured.");
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: { ...serviceHeaders(config.key), ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // Only explicitly raised business errors may reach clients; never expose DB diagnostics.
    const failure = body as { code?: string; message?: string } | null;
    if (failure?.code === "P0001" && typeof failure.message === "string")
      throw new HttpError(409, failure.message);
    throw new HttpError(
      502,
      "The database operation could not be completed. Check configuration and retry safely.",
    );
  }
  return body as T;
}
export async function rpc<T = JsonObject>(
  name: string,
  params: Record<string, unknown>,
) {
  return db<T>(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}
export async function authorizeToken(token: string) {
  if (!token || token.length > 8192)
    throw new HttpError(401, "Please sign in.");
  const config = getSupabaseConfig();
  if (!config) throw new HttpError(503, "Supabase is not configured.");
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.key, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new HttpError(401, "Your session has expired. Please sign in again.");
  const user = (await response.json()) as { id?: string; email?: string };
  if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id))
    throw new HttpError(401, "Invalid session.");
  const admins = await db<{ user_id: string }[]>(
    `/rest/v1/admin_users?user_id=eq.${user.id}&enabled=eq.true&select=user_id`,
  );
  if (!Array.isArray(admins) || admins.length !== 1)
    throw new HttpError(403, "This account does not have admin access.");
  return { id: user.id, email: user.email };
}
export async function requireAdmin(request: ApiRequest) {
  const token =
    (request.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || "";
  return authorizeToken(token);
}
export function sessionCookie(token: string, maxAge: number) {
  // Production and Vercel previews require HTTPS. Local dev cookies remain HttpOnly/SameSite.
  return `${cookieName}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === "production" || ["preview", "production"].includes(process.env.VERCEL_ENV || "") ? "; Secure" : ""}`;
}
export function uuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new HttpError(400, "A valid record identifier is required.");
  return value;
}
