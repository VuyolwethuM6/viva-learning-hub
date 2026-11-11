import { rpc } from "../_lib/admin.js";
import { handleRecruitmentCases } from "../_lib/recruitment-case-service.js";
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
    if (
      ![
        "session",
        "snapshot",
        "reauthenticate",
        "mutate",
        "recover",
        "vacancies",
        "forms",
        "applications",
        "privacy",
        "case-stage",
        "case-reauthenticate",
        "case-mutate",
        "case-recover",
        "case-documents",
        "case-step-up",
        "case-messages",
      ].includes(route)
    )
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
    if (
      [
        "forms",
        "applications",
        "privacy",
        "case-stage",
        "case-reauthenticate",
        "case-mutate",
        "case-recover",
        "case-documents",
        "case-step-up",
        "case-messages",
      ].includes(route)
    ) {
      return await handleRecruitmentCases(req, res, user, route, url);
    }
    if (req.method === "GET") {
      if (route === "session") return sendJson(res, 200, { user });
      if (route === "snapshot") return await recruitmentSnapshot(res, user);
      if (route === "vacancies") {
        const search = url.searchParams.get("search") || "";
        const status = url.searchParams.get("status") || "";
        const category = url.searchParams.get("category") || "";
        const vacancy = url.searchParams.get("vacancyId");
        const offsetText = url.searchParams.get("offset") || "0";
        const historyText = url.searchParams.get("historyBefore");
        if (
          search.length > 160 ||
          Number(offsetText) > 100000 ||
          !/^(0|[1-9][0-9]{0,6})$/.test(offsetText) ||
          (historyText !== null && !/^[1-9][0-9]{0,8}$/.test(historyText)) ||
          (vacancy !== null &&
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              vacancy,
            )) ||
          (status &&
            ![
              "draft",
              "submitted",
              "approved",
              "published",
              "paused",
              "closed",
              "archived",
            ].includes(status)) ||
          (category &&
            !["tutor", "administrator", "support_staff"].includes(category))
        )
          throw new HttpError(400, "Choose valid vacancy filters.");
        return sendJson(
          res,
          200,
          await rpc("recruitment_vacancy_workspace", {
            p_actor: user.id,
            p_vacancy: vacancy,
            p_offset: Number(offsetText),
            p_history_before: historyText === null ? null : Number(historyText),
            p_search: search,
            p_status: status,
            p_category: category,
          }),
        );
      }
      if (route === "recover") {
        const requestId = url.searchParams.get("requestId") || "";
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            requestId,
          )
        )
          throw new HttpError(400, "Choose a valid pending request ID.");
        return sendJson(
          res,
          200,
          await rpc("recruitment_recover_request", {
            p_actor: user.id,
            p_request_id: requestId,
          }),
        );
      }
      throw new HttpError(405, "POST is required.");
    }
    if (req.method !== "POST" || !["mutate", "reauthenticate"].includes(route))
      throw new HttpError(405, "Method not allowed.");
    const body = await readJsonBody(req, 131072, "Recruitment security");
    if (
      (typeof body.operation !== "string" ||
        (!body.operation.startsWith("vacancy_") &&
          body.operation !== "intake_policy")) &&
      Buffer.byteLength(JSON.stringify(body)) > 8192
    )
      throw new HttpError(413, "Request body is too large.");
    return await recruitmentChange(
      req,
      res,
      user,
      body,
      route === "reauthenticate",
    );
  } catch (error) {
    // Mark known application rejections; unmarked intermediary errors remain uncertain.
    if (error instanceof HttpError && error.status >= 400 && error.status < 500)
      res.setHeader("X-Recruitment-Error", "confirmed");
    return handleError(
      res,
      error,
      "Recruitment",
      "Recruitment security service unavailable. Check the foundation setup.",
    );
  }
}
