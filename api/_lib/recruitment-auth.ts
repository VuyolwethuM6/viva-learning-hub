import { createHash } from "node:crypto";
import type { ServerResponse } from "node:http";
import { rpc } from "./admin.js";
import { getSupabaseConfig, HttpError, type ApiRequest } from "./http.js";
import type { RecruitmentUser } from "../../src/lib/recruitment-types.js";
const path = "/api/admin/recruitment";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function recruitmentToken(req: ApiRequest, refresh = false) {
  const name = refresh ? "viva_recruitment_refresh" : "viva_recruitment";
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export type RecruitmentSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};
export function recruitmentCookies(
  res: ServerResponse,
  session?: RecruitmentSession,
) {
  const secure =
    process.env.NODE_ENV === "production" ||
    ["preview", "production"].includes(process.env.VERCEL_ENV || "");
  const attrs = `; Path=${path}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
  res.setHeader("Set-Cookie", [
    `viva_recruitment=${session?.access_token || ""}; Max-Age=${session ? Math.min(session.expires_in || 3600, 3600) : 0}${attrs}`,
    `viva_recruitment_refresh=${session?.refresh_token || ""}; Max-Age=${session ? 86400 : 0}${attrs}`,
  ]);
}
export async function recruitmentAuth(
  pathname: string,
  data?: object,
  token?: string,
) {
  const cfg = getSupabaseConfig();
  if (!cfg)
    throw new HttpError(503, "Recruitment authentication is not configured.");
  return fetch(`${cfg.url}/auth/v1/${pathname}`, {
    method: data ? "POST" : "GET",
    headers: {
      apikey: cfg.key,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(15000),
  });
}
export async function recruitmentIdentity(token: string) {
  if (!token || token.length > 8192)
    throw new HttpError(401, "Sign in to recruitment.");
  const auth = await recruitmentAuth("user", undefined, token);
  if (!auth.ok)
    throw new HttpError(401, "Recruitment session expired. Sign in again.");
  const user = (await auth.json()) as {
    id?: string;
    email?: string;
    email_confirmed_at?: string;
    factors?: {
      id: string;
      factor_type: string;
      status: string;
      friendly_name?: string;
    }[];
  };
  if (
    !user.id ||
    !/^[0-9a-f-]{36}$/i.test(user.id) ||
    !user.email ||
    !user.email_confirmed_at
  )
    throw new HttpError(401, "A verified staff identity is required.");
  try {
    const context = await rpc<RecruitmentUser>("recruitment_context", {
      p_actor: user.id,
    });
    // GET /user above validates this exact JWT with Supabase before claims are trusted.
    // Opaque/malformed claims never establish AAL2, even if a provider accepts the token.
    let aal: "aal1" | "aal2" = "aal1";
    try {
      const claims = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
      );
      if (
        claims.sub === user.id &&
        claims.aal === "aal2" &&
        typeof claims.session_id === "string" &&
        /^[0-9a-f-]{36}$/i.test(claims.session_id) &&
        typeof claims.exp === "number" &&
        claims.exp > Date.now() / 1000
      )
        aal = "aal2";
    } catch {
      /* No assurance from unparseable claims. */
    }
    return {
      ...context,
      aal,
      mfaFactors: (user.factors || [])
        .filter((f) => f.factor_type === "totp" && f.status === "verified")
        .map((f) => ({
          id: f.id,
          friendlyName: f.friendly_name || "Authenticator",
        })),
    };
  } catch (e) {
    if (e instanceof HttpError && e.status === 409)
      throw new HttpError(
        403,
        "Recruitment access is unavailable or disabled.",
      );
    throw e;
  }
}
export async function requireRecruitment(req: ApiRequest) {
  return recruitmentIdentity(recruitmentToken(req));
}
export async function limitRecruitment(req: ApiRequest, identity: string) {
  const key = getSupabaseConfig()?.key;
  if (!key)
    throw new HttpError(503, "Recruitment authentication is not configured.");
  const ip = String(
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
  )
    .split(",")[0]
    .trim();
  for (const [kind, value, limit] of [
    ["ip", ip, 30],
    ["identity", identity, 8],
  ] as const) {
    if (
      !(await rpc<boolean>("recruitment_rate_limit", {
        p_hash: digest(`${key}:recruitment:${kind}:${value}`),
        p_limit: limit,
      }))
    )
      throw new HttpError(
        429,
        "Too many attempts. Try again after 15 minutes.",
      );
  }
}
export async function recruitmentSession(
  auth: Response,
): Promise<RecruitmentSession> {
  if (!auth.ok)
    throw new HttpError(
      auth.status === 429 ? 429 : 401,
      "Recruitment sign-in failed.",
    );
  const session = (await auth.json()) as RecruitmentSession;
  if (
    !session.access_token ||
    !session.refresh_token ||
    !/^[A-Za-z0-9._~-]+$/.test(session.access_token) ||
    !/^[A-Za-z0-9._~-]+$/.test(session.refresh_token)
  )
    throw new HttpError(502, "Invalid authentication response.");
  return session;
}
export async function recruitmentSignIn(res: ServerResponse, auth: Response) {
  const session = await recruitmentSession(auth);
  try {
    const user = await recruitmentIdentity(session.access_token);
    recruitmentCookies(res, session);
    return user;
  } catch (error) {
    await recruitmentAuth("logout?scope=local", {}, session.access_token).catch(
      () => undefined,
    );
    throw error;
  }
}
