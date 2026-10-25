import type { IncomingMessage } from 'node:http';

export type ApiRequest = IncomingMessage & { body?: unknown };
export type JsonObject = Record<string, unknown>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function validateObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  return value as JsonObject;
}

export async function readJsonBody(request: ApiRequest, maxBytes: number): Promise<JsonObject> {
  const contentLength = Number(request.headers?.['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, 'Request body is too large.');
  }

  if (request.body !== undefined) {
    const rawBody = request.body;
    let parsed: unknown;
    let size: number;

    if (typeof rawBody === 'string') {
      size = Buffer.byteLength(rawBody);
      if (size > maxBytes) throw new HttpError(413, 'Request body is too large.');
      if (!rawBody.trim()) throw new HttpError(400, 'Request body is empty.');
      parsed = parseJson(rawBody);
    } else if (Buffer.isBuffer(rawBody)) {
      size = rawBody.length;
      if (size > maxBytes) throw new HttpError(413, 'Request body is too large.');
      if (!rawBody.length) throw new HttpError(400, 'Request body is empty.');
      parsed = parseJson(rawBody.toString('utf8'));
    } else {
      const serialized = JSON.stringify(rawBody);
      size = serialized === undefined ? 0 : Buffer.byteLength(serialized);
      if (size > maxBytes) throw new HttpError(413, 'Request body is too large.');
      parsed = rawBody;
    }

    return validateObject(parsed);
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new HttpError(413, 'Request body is too large.');
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) throw new HttpError(400, 'Request body is empty.');
  return validateObject(parseJson(text));
}
