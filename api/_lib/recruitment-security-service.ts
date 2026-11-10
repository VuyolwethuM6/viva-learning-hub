import { randomBytes } from "node:crypto";
import { rpc } from "./admin.js";
import { HttpError, sendJson, type ApiRequest } from "./http.js";
import {
  digest,
  limitRecruitment,
  recruitmentAuth,
  recruitmentIdentity,
  recruitmentToken,
  recruitmentSession,
  recruitmentCookies,
} from "./recruitment-auth.js";
import { recruitmentInput } from "./recruitment-input.js";
import { canChangeRecruitment } from "./recruitment-permissions.js";
import type { ServerResponse } from "node:http";
import type {
  RecruitmentSnapshot,
  RecruitmentUser,
} from "../../src/lib/recruitment-types.js";
export async function recruitmentSnapshot(
  res: ServerResponse,
  user: RecruitmentUser,
) {
  const snapshot = await rpc<RecruitmentSnapshot>("recruitment_snapshot", {
    p_actor: user.id,
  });
  snapshot.user = {
    ...snapshot.user,
    aal: user.aal,
    ownerAal2Required: user.ownerAal2Required,
    mfaFactors: user.mfaFactors,
  };
  return sendJson(res, 200, snapshot);
}
export async function recruitmentChange(
  req: ApiRequest,
  res: ServerResponse,
  user: RecruitmentUser,
  body: Record<string, unknown>,
  reauthenticate: boolean,
) {
  const input = recruitmentInput(body.operation, body.data);
  if (!canChangeRecruitment(user.role, input.operation))
    throw new HttpError(
      403,
      "Your recruitment role does not permit this change.",
    );
  const session = recruitmentToken(req);
  if (reauthenticate) {
    if (
      typeof body.password !== "string" ||
      !body.password ||
      body.password.length > 1024
    )
      throw new HttpError(400, "Confirm your staff password.");
    await limitRecruitment(req, user.id);
    const auth = await recruitmentAuth("token?grant_type=password", {
      email: user.email,
      password: body.password,
    });
    if (!auth.ok) throw new HttpError(401, "Fresh authentication failed.");
    let freshSession = await recruitmentSession(auth);
    let retained = false;
    try {
      let verified = await recruitmentIdentity(freshSession.access_token);
      if (verified.id !== user.id)
        throw new HttpError(403, "Authentication identity mismatch.");
      if (verified.role === "owner" && verified.ownerAal2Required) {
        if (
          typeof body.factorId !== "string" ||
          !verified.mfaFactors?.some((f) => f.id === body.factorId) ||
          typeof body.code !== "string" ||
          !/^\d{6}$/.test(body.code)
        )
          throw new HttpError(
            403,
            "A verified authenticator and current six-digit code are required.",
          );
        const challenge = await recruitmentAuth(
          `factors/${body.factorId}/challenge`,
          {},
          freshSession.access_token,
        );
        if (!challenge.ok) throw new HttpError(403, "MFA challenge failed.");
        const details = (await challenge.json()) as { id?: string };
        if (!details.id || !/^[0-9a-f-]{36}$/i.test(details.id))
          throw new HttpError(502, "Invalid MFA challenge response.");
        freshSession = await recruitmentSession(
          await recruitmentAuth(
            `factors/${body.factorId}/verify`,
            {
              challenge_id: details.id,
              code: body.code,
            },
            freshSession.access_token,
          ),
        );
        verified = await recruitmentIdentity(freshSession.access_token);
        if (verified.id !== user.id || verified.aal !== "aal2")
          throw new HttpError(403, "Owner MFA assurance (AAL2) is required.");
      }
      const proof = randomBytes(32).toString("hex");
      await rpc("recruitment_issue_challenge", {
        p_actor: user.id,
        p_session_hash: digest(freshSession.access_token),
        p_operation: input.operation,
        p_data: input.data,
        p_secret_hash: digest(proof),
        p_aal: verified.aal || "aal1",
      });
      // Rotate to the confirmed session. Never rely on an older session surviving a password grant.
      recruitmentCookies(res, freshSession);
      retained = true;
      if (session !== freshSession.access_token)
        await recruitmentAuth("logout?scope=local", {}, session).catch(
          () => undefined,
        );
      return sendJson(res, 200, { proof, expiresIn: 300 });
    } finally {
      if (!retained)
        await recruitmentAuth(
          "logout?scope=local",
          {},
          freshSession.access_token,
        ).catch(() => undefined);
    }
  }
  if (typeof body.proof !== "string" || !/^[0-9a-f]{64}$/.test(body.proof))
    throw new HttpError(400, "Review and authenticate this action first.");
  const result = await rpc("recruitment_mutate", {
    p_actor: user.id,
    p_operation: input.operation,
    p_data: input.data,
    p_session_hash: digest(session),
    p_proof_hash: digest(body.proof),
    p_aal: user.aal || "aal1",
  });
  if (
    !result ||
    typeof result !== "object" ||
    (input.operation.startsWith("vacancy_")
      ? result.saved !== true
      : input.operation === "scope_create"
        ? typeof result.scopeId !== "string"
        : input.operation === "settings"
          ? result.saved !== true
          : result.userId !== input.data.userId)
  )
    throw new HttpError(
      502,
      "The mutation outcome could not be confirmed. Retry the original request.",
    );
  return sendJson(res, 200, { result });
}
