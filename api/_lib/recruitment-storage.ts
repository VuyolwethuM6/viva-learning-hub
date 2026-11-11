import { getSupabaseConfig } from "./http.js";
import { IntakeError, sha256 } from "./recruitment-intake.js";

export const CHUNK_BYTES = 2 * 1024 * 1024;
export const FILE_BYTES = 10 * 1024 * 1024;
const buckets = ["recruitment-quarantine", "recruitment-documents"];
function target(bucket: string, path: string, list = false) {
  const cfg = getSupabaseConfig();
  if (
    !cfg ||
    !buckets.includes(bucket) ||
    (!list && !/^[0-9a-f-]{36}\/(?:[0-4]|[0-9a-f-]{36}\.pdf)$/.test(path))
  )
    throw new IntakeError("storage_unavailable", 503);
  return {
    cfg,
    url: `${cfg.url}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`,
  };
}
const headers = (key: string) => ({
  Authorization: `Bearer ${key}`,
  apikey: key,
});
export async function boundedBytes(
  response: Response,
  limit: number,
): Promise<Buffer> {
  if (Number(response.headers.get("content-length") || 0) > limit)
    throw new IntakeError("file_too_large", 413);
  const reader = response.body?.getReader();
  if (!reader) throw new IntakeError("storage_unavailable", 503);
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw new IntakeError("file_too_large", 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}
export async function storageRead(
  bucket: string,
  path: string,
  limit = FILE_BYTES,
) {
  const { cfg, url } = target(bucket, path);
  const result = await fetch(url, {
    headers: headers(cfg.key),
    signal: AbortSignal.timeout(25000),
    redirect: "error",
  });
  if (!result.ok) throw new IntakeError("storage_unavailable", 503);
  return boundedBytes(result, limit);
}
export async function storageWrite(
  bucket: string,
  path: string,
  bytes: Buffer,
  mime: string,
) {
  const { cfg, url } = target(bucket, path);
  const response = await fetch(url, {
    method: "POST",
    headers: { ...headers(cfg.key), "Content-Type": mime, "x-upsert": "false" },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(25000),
    redirect: "error",
  });
  if (!response.ok) {
    // An uncertain previous write may already exist. It is accepted only byte-for-byte.
    const stored = await storageRead(bucket, path, bytes.length);
    if (sha256(stored) !== sha256(bytes))
      throw new IntakeError("storage_integrity_failure", 503);
  }
}
async function list(bucket: string, prefix: string) {
  const { cfg } = target(bucket, "", true);
  if (!/^[0-9a-f-]{36}$/.test(prefix))
    throw new IntakeError("storage_integrity_failure", 503);
  const response = await fetch(`${cfg.url}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: { ...headers(cfg.key), "Content-Type": "application/json" },
    body: JSON.stringify({
      prefix,
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    }),
    signal: AbortSignal.timeout(25000),
    redirect: "error",
  });
  if (!response.ok) throw new IntakeError("storage_unavailable", 503);
  const rows = (await response.json()) as {
    name?: string;
    id?: string | null;
  }[];
  if (
    !Array.isArray(rows) ||
    rows.length >= 100 ||
    rows.some((r) => !r.name || !/^(?:[0-4]|[0-9a-f-]{36}\.pdf)$/.test(r.name))
  )
    throw new IntakeError("storage_integrity_failure", 503);
  return rows.map((r) => `${prefix}/${r.name}`);
}
export async function storageDeletePrefix(bucket: string, prefix: string) {
  const paths = await list(bucket, prefix);
  if (paths.length) {
    const { cfg } = target(bucket, "", true);
    const response = await fetch(`${cfg.url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { ...headers(cfg.key), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: paths }),
      signal: AbortSignal.timeout(25000),
      redirect: "error",
    });
    if (!response.ok) throw new IntakeError("storage_unavailable", 503);
  }
  return (await list(bucket, prefix)).length === 0;
}
export async function storageDeleteFile(bucket: string, path: string) {
  const { cfg } = target(bucket, path);
  const response = await fetch(`${cfg.url}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: { ...headers(cfg.key), "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] }),
    signal: AbortSignal.timeout(25000),
    redirect: "error",
  });
  if (!response.ok) throw new IntakeError("storage_unavailable", 503);
}
export function validatePdf(bytes: Buffer) {
  if (
    !bytes.length ||
    bytes.length > FILE_BYTES ||
    !bytes.subarray(0, 8).toString("ascii").startsWith("%PDF-") ||
    !bytes
      .subarray(Math.max(0, bytes.length - 2048))
      .toString("latin1")
      .includes("%%EOF") ||
    /\/Encrypt\b/.test(bytes.toString("latin1"))
  )
    throw new IntakeError("uninspectable_pdf", 400);
}
