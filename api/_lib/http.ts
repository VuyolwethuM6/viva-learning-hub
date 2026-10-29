import type { IncomingMessage, ServerResponse } from "node:http";

export type JsonObject = Record<string, unknown>;
export type ApiRequest = IncomingMessage & { body?: unknown };

/** An error that carries the HTTP status the client should receive. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * Debug logging is ON when API_DEBUG=1, or automatically under `vercel dev`
 * (VERCEL_ENV === 'development'). It is OFF in production unless you set API_DEBUG=1.
 * Never pass personal data or secrets to debug(): log keys, types, sizes and statuses only.
 */
export function isDebug() {
  return (
    process.env.API_DEBUG === "1" || process.env.VERCEL_ENV === "development"
  );
}

export function debug(
  scope: string,
  message: string,
  data?: Record<string, unknown>,
) {
  if (!isDebug()) return;
  console.log(`[${scope}] ${message}${data ? ` ${JSON.stringify(data)}` : ""}`);
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: JsonObject,
) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

/** Safe-to-log summary of a request (no body values). */
export function describeRequest(request: ApiRequest) {
  const body = request.body;
  return {
    method: request.method,
    requestId: String(request.headers["x-vercel-id"] ?? "local"),
    contentType: request.headers["content-type"] ?? null,
    contentLength: request.headers["content-length"] ?? null,
    bodyType:
      body === undefined
        ? "undefined"
        : body === null
          ? "null"
          : Buffer.isBuffer(body)
            ? "buffer"
            : typeof body,
  };
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

/**
 * Reads a JSON object body in BOTH runtimes:
 *  - Vercel (and `vercel dev`) pre-parse the body into `request.body` and consume the stream,
 *    so iterating the stream afterwards yields nothing. This was the original bug.
 *  - Plain Node servers and tests do not pre-parse, so we fall back to reading the stream.
 *
 * An empty or unreadable body is a 400, never a silent `{}`.
 */
export async function readJsonBody(
  request: ApiRequest,
  maxBytes: number,
  scope: string,
): Promise<JsonObject> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, "Request body is too large.");
  }

  let parsed: unknown;
  let source: "pre-parsed" | "stream";

  if (request.body !== undefined && request.body !== null) {
    source = "pre-parsed";
    if (
      (typeof request.body === "string" &&
        Buffer.byteLength(request.body) > maxBytes) ||
      (Buffer.isBuffer(request.body) && request.body.length > maxBytes)
    )
      throw new HttpError(413, "Request body is too large.");
    if (typeof request.body === "string") parsed = parseJsonText(request.body);
    else if (Buffer.isBuffer(request.body))
      parsed = parseJsonText(request.body.toString("utf8"));
    else parsed = request.body;
  } else {
    source = "stream";
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes)
        throw new HttpError(413, "Request body is too large.");
      chunks.push(buffer);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text.trim()) throw new HttpError(400, "Request body is empty.");
    parsed = parseJsonText(text);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }

  if (Buffer.byteLength(JSON.stringify(parsed), "utf8") > maxBytes) {
    throw new HttpError(413, "Request body is too large.");
  }
  const body = parsed as JsonObject;
  debug(scope, "body read", {
    source,
    ...describeRequest(request),
    keys: Object.keys(body),
  });
  if (!Object.keys(body).length)
    debug(scope, "WARNING: body parsed but has no keys");
  return body;
}

export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export function serviceHeaders(key: string) {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    "Content-Type": "application/json",
  };
}

export function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** One place that turns errors into responses. HttpError keeps its status; anything else is a 502. */
export function handleError(
  response: ServerResponse,
  error: unknown,
  scope: string,
  fallbackMessage: string,
) {
  if (error instanceof HttpError) {
    debug(scope, "request rejected", {
      status: error.status,
      message: error.message,
    });
    return sendJson(response, error.status, { error: error.message });
  }
  console.error(
    `[${scope}] unexpected error:`,
    error instanceof Error ? error.message : "Unknown error",
  );
  if (isDebug() && error instanceof Error) console.error(error.stack);
  return sendJson(response, 502, { error: fallbackMessage });
}
/** Bounded URL-encoded fields, preserving raw bytes when supplied by the runtime. */
export async function readFormBody(request: ApiRequest, maxBytes: number) {
  if (
    !request.headers["content-type"]
      ?.toLowerCase()
      .startsWith("application/x-www-form-urlencoded")
  )
    throw new HttpError(415, "A URL-encoded notification is required.");
  if (Number(request.headers["content-length"]) > maxBytes)
    throw new HttpError(413, "Request body is too large.");
  let raw: string;
  if (request.body !== undefined && request.body !== null) {
    if (Buffer.isBuffer(request.body)) raw = request.body.toString("utf8");
    else if (typeof request.body === "string") raw = request.body;
    else {
      if (typeof request.body !== "object" || Array.isArray(request.body))
        throw new HttpError(400, "Invalid notification fields.");
      const entries = Object.entries(request.body);
      if (
        entries.some(
          ([k, v]) => !/^[a-z][a-z0-9_]*$/.test(k) || typeof v !== "string",
        )
      )
        throw new HttpError(400, "Invalid notification fields.");
      raw = entries
        .map(
          ([k, v]) =>
            `${k}=${encodeURIComponent(String(v)).replace(/%20/g, "+")}`,
        )
        .join("&");
    }
  } else {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const b = Buffer.from(chunk);
      size += b.length;
      if (size > maxBytes)
        throw new HttpError(413, "Request body is too large.");
      chunks.push(b);
    }
    raw = Buffer.concat(chunks).toString("utf8");
  }
  if (!raw.trim()) throw new HttpError(400, "Request body is empty.");
  if (Buffer.byteLength(raw) > maxBytes)
    throw new HttpError(413, "Request body is too large.");
  const params = new URLSearchParams(raw);
  for (const key of params.keys())
    if (params.getAll(key).length !== 1 || !/^[a-z][a-z0-9_]*$/.test(key))
      throw new HttpError(400, "Duplicate or invalid notification field.");
  return { raw, fields: Object.fromEntries(params.entries()) };
}
