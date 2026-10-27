import type { ServerResponse } from "node:http";
import { db, rpc, uuid } from "./admin.js";
import {
  encodeStoragePath,
  getSupabaseConfig,
  HttpError,
  sendJson,
  serviceHeaders,
  type ApiRequest,
} from "./http.js";
import { validAccountingDate } from "../../src/lib/accounting-input.js";
type Audience = "admin" | "tutor";
type StoredFile = {
  id: string;
  storage_path: string;
  mime: string;
  size_bytes: number;
  file_name: string;
};
export async function teachingRead(
  request: ApiRequest,
  response: ServerResponse,
  actor: string,
  audience: Audience,
) {
  const url = new URL(request.url || "", "http://localhost");
  if (url.searchParams.has("history"))
    return sendJson(
      response,
      200,
      await rpc("teaching_history", {
        p_actor: actor,
        p_audience: audience,
        p_session: uuid(url.searchParams.get("history")),
      }),
    );
  if (!url.searchParams.has("file"))
    return sendJson(
      response,
      200,
      await rpc("teaching_snapshot", { p_actor: actor, p_audience: audience }),
    );
  const file = await rpc<StoredFile>("teaching_file", {
    p_actor: actor,
    p_audience: audience,
    p_id: uuid(url.searchParams.get("file")),
  });
  const config = getSupabaseConfig()!;
  const upstream = await fetch(
    `${config.url}/storage/v1/object/authenticated/teaching-materials/${encodeStoragePath(file.storage_path)}`,
    { headers: serviceHeaders(config.key), signal: AbortSignal.timeout(20000) },
  );
  if (!upstream.ok || !upstream.body)
    throw new HttpError(
      502,
      "The private teaching file could not be downloaded.",
    );
  if (
    upstream.headers.get("Content-Type")?.split(";")[0].toLowerCase() !==
    file.mime
  )
    throw new HttpError(409, "The stored file type does not match its record.");
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 10485760 || size > file.size_bytes) {
        await reader.cancel();
        throw new HttpError(
          413,
          "The teaching file exceeds its expected size.",
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (size !== file.size_bytes)
    throw new HttpError(409, "The stored file size does not match its record.");
  response.setHeader("Content-Type", file.mime);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="${file.file_name.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
  );
  return response.end(Buffer.concat(chunks));
}
export async function teachingMutation(
  response: ServerResponse,
  actor: string,
  audience: Audience,
  body: Record<string, unknown>,
) {
  const operation = String(body.operation || "");
  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new HttpError(400, "Choose a teaching operation and valid details.");
  const input = data as Record<string, unknown>;
  uuid(input.requestId);
  for (const key of [
    "id",
    "classId",
    "sessionId",
    "topicId",
    "tutorId",
    "venueId",
    "applicationId",
    "versionId",
    "materialId",
  ])
    if (input[key]) uuid(input[key]);
  if (input.day && !validAccountingDate(String(input.day)))
    throw new HttpError(400, "Choose a valid teaching date.");
  for (const key of ["learners", "rows"])
    if (
      input[key] !== undefined &&
      (!Array.isArray(input[key]) || input[key].length > 100)
    )
      throw new HttpError(400, "Choose at most 100 learners.");
  const result = await rpc<StoredFile & Record<string, unknown>>(
    "teaching_mutate",
    {
      p_actor: actor,
      p_audience: audience,
      p_operation: operation,
      p_data: input,
    },
  );
  if (["material_prepare", "material_resume"].includes(operation)) {
    const signed = await db<{ url?: string; token?: string }>(
      `/storage/v1/object/upload/sign/teaching-materials/${encodeStoragePath(result.storage_path)}`,
      { method: "POST", body: JSON.stringify({ upsert: false }) },
    );
    if (!signed.url?.startsWith("/object/upload/sign/"))
      throw new HttpError(
        502,
        "The private upload link could not be created. Check the saved pending upload before retrying.",
      );
    const link = new URL(`${getSupabaseConfig()!.url}/storage/v1${signed.url}`);
    if (signed.token) link.searchParams.set("token", signed.token);
    return sendJson(response, 200, { result, url: link.toString() });
  }
  return sendJson(response, 200, { result });
}
