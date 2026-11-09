import type { ServerResponse } from "node:http";
import { privateResponse, sameOrigin } from "../_lib/admin.js";
import {
  handleError,
  HttpError,
  readJsonBody,
  sendJson,
  type ApiRequest,
} from "../_lib/http.js";
import {
  limitRecruitment,
  recruitmentAuth,
  recruitmentCookies,
  recruitmentSignIn,
  recruitmentToken,
  requireRecruitment,
} from "../_lib/recruitment-auth.js";
import {
  recruitmentChange,
  recruitmentSnapshot,
} from "../_lib/recruitment-security-service.js";

export default async function handler(req: ApiRequest, res: ServerResponse) {
  privateResponse(res);
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  try {
    const url = new URL(req.url || "", "http://localhost");
    const route = url.searchParams.get("route") || "snapshot";
    if (!["session", "snapshot", "reauthenticate", "mutate"].includes(route))
      throw new HttpError(404, "Recruitment operation unavailable.");
    if (!["GET", "POST", "DELETE"].includes(req.method || ""))
      throw new HttpError(405, "Method not allowed.");
    if (req.method !== "GET") sameOrigin(req);
    if (route === "session" && req.method === "DELETE") {
      const token = recruitmentToken(req);
      if (token)
        await recruitmentAuth("logout?scope=local", {}, token).catch(
          () => undefined,
        );
      recruitmentCookies(res);
      return sendJson(res, 200, { success: true });
    }
    if (route === "session" && req.method === "POST") {
      const body = await readJsonBody(req, 4096, "Recruitment session");
      if (body.action === "refresh") {
        const refresh = recruitmentToken(req, true);
        if (!refresh || refresh.length > 8192)
          throw new HttpError(401, "Sign in to recruitment.");
        try {
          return sendJson(res, 200, {
            user: await recruitmentSignIn(
              res,
              await recruitmentAuth("token?grant_type=refresh_token", {
                refresh_token: refresh,
              }),
            ),
          });
        } catch (error) {
          recruitmentCookies(res);
          throw error;
        }
      }
      if (
        typeof body.email !== "string" ||
        body.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
        typeof body.password !== "string" ||
        !body.password ||
        body.password.length > 1024
      )
        throw new HttpError(400, "Enter a staff email and password.");
      await limitRecruitment(req, body.email.trim().toLowerCase());
      const user = await recruitmentSignIn(
        res,
        await recruitmentAuth("token?grant_type=password", {
          email: body.email.trim().toLowerCase(),
          password: body.password,
        }),
      );
      return sendJson(res, 200, { user });
    }
    const user = await requireRecruitment(req);
    if (req.method === "GET") {
      if (route === "session") return sendJson(res, 200, { user });
      if (route === "snapshot") return await recruitmentSnapshot(res, user);
      throw new HttpError(405, "POST is required.");
    }
    if (req.method !== "POST" || !["mutate", "reauthenticate"].includes(route))
      throw new HttpError(405, "Method not allowed.");
    const body = await readJsonBody(req, 8192, "Recruitment security");
    return await recruitmentChange(
      req,
      res,
      user,
      body,
      route === "reauthenticate",
    );
  } catch (error) {
    return handleError(
      res,
      error,
      "Recruitment",
      "Recruitment security service unavailable. Check the foundation setup.",
    );
  }
}
