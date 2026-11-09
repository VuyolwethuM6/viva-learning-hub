import { randomBytes } from "node:crypto";
import { rpc } from "./admin.js";
import { HttpError, sendJson, type ApiRequest } from "./http.js";
import {
  digest,
  limitRecruitment,
  recruitmentAuth,
  recruitmentIdentity,
  recruitmentToken,
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
  return sendJson(
    res,
    200,
    await rpc<RecruitmentSnapshot>("recruitment_snapshot", {
      p_actor: user.id,
    }),
  );
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
    const temporary = (await auth.json()) as { access_token?: string };
    try {
      const verified = await recruitmentIdentity(temporary.access_token || "");
      if (verified.id !== user.id)
        throw new HttpError(403, "Authentication identity mismatch.");
      const proof = randomBytes(32).toString("hex");
      await rpc("recruitment_issue_challenge", {
        p_actor: user.id,
        p_session_hash: digest(session),
        p_operation: input.operation,
        p_data: input.data,
        p_secret_hash: digest(proof),
      });
      return sendJson(res, 200, { proof, expiresIn: 300 });
    } finally {
      if (temporary.access_token)
        await recruitmentAuth(
          "logout?scope=local",
          {},
          temporary.access_token,
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
  });
  return sendJson(res, 200, { result });
}
