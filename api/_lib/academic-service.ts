import type { ServerResponse } from "node:http";
import { rpc, db, uuid } from "./admin.js";
import { serveTeachingFile, type StoredFile } from "./teaching-service.js";
import {
  getSupabaseConfig,
  encodeStoragePath,
  HttpError,
  sendJson,
  type ApiRequest,
} from "./http.js";
import { buildAcademicReport } from "./academic-report.js";
type Audience = "admin" | "tutor" | "student" | "parent";
export async function academicRead(
  req: ApiRequest,
  res: ServerResponse,
  actor: string,
  audience: Audience,
) {
  const url = new URL(req.url || "", "http://localhost");
  const application = url.searchParams.get("application");
  const args = {
    p_actor: actor,
    p_audience: audience,
    p_application: application ? uuid(application) : null,
  };
  if (url.searchParams.has("report")) {
    const report = await rpc<{
      id: string;
      content: Record<string, unknown>;
      created_at: string;
    }>("academic_report", {
      ...args,
      p_id: uuid(url.searchParams.get("report")),
    });
    const bytes = await buildAcademicReport(report);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Viva-progress-${report.id}.pdf"`,
    );
    return res.end(Buffer.from(bytes));
  }
  if (url.searchParams.has("file")) {
    const file = await rpc<
      StoredFile & { bucket: "teaching-materials" | "academic-submissions" }
    >("academic_file", {
      ...args,
      p_id: uuid(url.searchParams.get("file")),
      p_kind: url.searchParams.get("kind") || "submission",
    });
    if (!["teaching-materials", "academic-submissions"].includes(file.bucket))
      throw new HttpError(409, "Invalid academic storage bucket.");
    return await serveTeachingFile(res, file, file.bucket);
  }
  return sendJson(
    res,
    200,
    await rpc("academic_snapshot", {
      ...args,
      ...(url.searchParams.has("class")
        ? { p_class: uuid(url.searchParams.get("class")) }
        : {}),
      p_task: url.searchParams.get("task")
        ? uuid(url.searchParams.get("task"))
        : null,
    }),
  );
}
export async function academicMutation(
  res: ServerResponse,
  actor: string,
  audience: Exclude<Audience, "parent">,
  body: Record<string, unknown>,
) {
  const operation = String(body.operation || "");
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data))
    throw new HttpError(400, "Choose an academic action and details.");
  const data = body.data as Record<string, unknown>;
  uuid(data.requestId);
  for (const k of [
    "id",
    "classId",
    "taskId",
    "attemptId",
    "periodId",
    "sessionId",
    "topicId",
    "applicationId",
    "gradeId",
  ])
    if (data[k]) uuid(data[k]);
  for (const k of ["opensAt", "dueAt", "closesAt"])
    if (data[k] && !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(String(data[k])))
      throw new HttpError(400, "Choose a South African date and time.");
  if (
    data.learners &&
    (!Array.isArray(data.learners) || data.learners.length > 100)
  )
    throw new HttpError(400, "Choose at most 100 learners.");
  const result = await rpc<StoredFile & Record<string, unknown>>(
    "academic_mutate",
    {
      p_actor: actor,
      p_audience: audience,
      p_operation: operation,
      p_data: data,
    },
  );
  if (["upload_prepare", "upload_resume"].includes(operation)) {
    const signed = await db<{ url?: string; token?: string }>(
      `/storage/v1/object/upload/sign/academic-submissions/${encodeStoragePath(result.storage_path)}`,
      { method: "POST", body: JSON.stringify({ upsert: false }) },
    );
    if (!signed.url?.startsWith("/object/upload/sign/"))
      throw new HttpError(
        502,
        "Upload link unavailable. Refresh and resume the saved pending upload.",
      );
    const link = new URL(`${getSupabaseConfig()!.url}/storage/v1${signed.url}`);
    if (signed.token) link.searchParams.set("token", signed.token);
    return sendJson(res, 200, { result, url: link.toString() });
  }
  return sendJson(res, 200, { result });
}
