import { createHash } from "node:crypto";
import type { ServerResponse } from "node:http";
import { z } from "zod";
import { rpc } from "./_lib/admin.js";
import { HttpError, sendJson, type ApiRequest } from "./_lib/http.js";
import {
  emptyVacancyContent,
  vacancyContentSchema,
  type PublicVacancy,
  type PublicVacancyResponse,
} from "../src/lib/recruitment-vacancies.js";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const vacancyEnvelope = z.object({
  id: z.string().uuid(),
  reference: z.string().min(1).max(80),
  slug: z.string().min(3).max(160).regex(slugPattern),
  version: z.number().int().positive(),
  publishedAt: z.string().datetime({ offset: true }),
  availability: z.enum(["opening_soon", "open", "closed"]),
});
const contentKeys = Object.keys(emptyVacancyContent());
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(503, "Current vacancies are temporarily unavailable.");
  return value as Record<string, unknown>;
};
function publicVacancy(value: unknown): PublicVacancy {
  const row = object(value);
  // SQL performs approval/publication checks; this second boundary never forwards private fields.
  if (row.status !== undefined && row.status !== "published")
    throw new HttpError(503, "Current vacancies are temporarily unavailable.");
  const envelope = vacancyEnvelope.safeParse(row);
  const source = object(row.content);
  const content = Object.fromEntries(
    contentKeys.map((key) => [key, source[key]]),
  );
  for (const field of ["requiredDocuments", "questions"] as const) {
    if (!Array.isArray(source[field])) continue;
    content[field] = source[field].map((value: unknown) => {
      const entry = object(value);
      return Object.fromEntries(
        (field === "questions"
          ? ["key", "label", "type", "required"]
          : ["key", "label", "required"]
        ).map((key) => [key, entry[key]]),
      );
    });
  }
  const parsed = vacancyContentSchema.safeParse(content);
  if (
    !envelope.success ||
    !parsed.success ||
    !parsed.data.opensAt ||
    !parsed.data.closesAt
  )
    throw new HttpError(503, "Current vacancies are temporarily unavailable.");
  return {
    ...envelope.data,
    content: parsed.data,
    acceptingApplications: false,
  } as PublicVacancy;
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      throw new HttpError(405, "Only GET is available.");
    }
    if ((req.url || "").length > 1024)
      throw new HttpError(400, "Invalid vacancy address.");
    const url = new URL(req.url || "/api/careers", "http://localhost");
    if (
      [...url.searchParams.keys()].some(
        (key) => !["slug", "offset", "category"].includes(key),
      ) ||
      ["slug", "offset", "category"].some(
        (key) => url.searchParams.getAll(key).length > 1,
      )
    )
      throw new HttpError(400, "Invalid vacancy query.");
    const slug = url.searchParams.get("slug");
    if (
      slug !== null &&
      (slug.length < 3 || slug.length > 160 || !slugPattern.test(slug))
    )
      throw new HttpError(400, "Invalid vacancy address.");
    const offsetText = url.searchParams.get("offset") || "0";
    const category = url.searchParams.get("category") || "";
    if (
      !/^(0|[1-9][0-9]{0,6})$/.test(offsetText) ||
      Number(offsetText) > 100000 ||
      !["", "tutor", "administrator", "support_staff"].includes(category) ||
      (slug !== null &&
        (url.searchParams.has("offset") || url.searchParams.has("category")))
    )
      throw new HttpError(400, "Invalid vacancy query.");
    const offset = Number(offsetText);
    let upstream: unknown;
    try {
      // Always read authoritative publication state, including before conditional 304 responses.
      upstream = await rpc("recruitment_public_vacancies", {
        p_slug: slug,
        p_offset: offset,
        p_category: category,
      });
    } catch {
      throw new HttpError(
        503,
        "Current vacancies are temporarily unavailable. Please try again later.",
      );
    }
    const state = object(upstream);
    if (
      typeof state.enabled !== "boolean" ||
      typeof state.generation !== "number" ||
      !Number.isSafeInteger(state.generation) ||
      state.generation < 0 ||
      !Array.isArray(state.vacancies) ||
      state.vacancies.length > (slug ? 1 : 20) ||
      typeof state.total !== "number" ||
      !Number.isSafeInteger(state.total) ||
      state.total < 0 ||
      !(
        state.nextOffset === null ||
        (Number.isSafeInteger(state.nextOffset) &&
          state.nextOffset === offset + 20 &&
          Number(state.nextOffset) < state.total)
      )
    )
      throw new HttpError(
        503,
        "Current vacancies are temporarily unavailable.",
      );
    const body: PublicVacancyResponse = {
      enabled: state.enabled,
      generation: state.generation,
      vacancies: state.enabled ? state.vacancies.map(publicVacancy) : [],
      total: state.enabled ? state.total : 0,
      nextOffset: state.enabled ? (state.nextOffset as number | null) : null,
    };
    if (
      category &&
      body.vacancies.some((row) => row.content.category !== category)
    )
      throw new HttpError(
        503,
        "Current vacancies are temporarily unavailable.",
      );
    if (slug && (!body.vacancies.length || body.vacancies[0].slug !== slug))
      throw new HttpError(404, "This vacancy is not currently available.");
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized) > 2500000)
      throw new HttpError(
        503,
        "Current vacancies are temporarily unavailable.",
      );
    const etag = `"${createHash("sha256").update(serialized).digest("hex")}"`;
    res.setHeader("ETag", etag);
    // Store/revalidate only. No stale CDN or error fallback can keep a paused/closed vacancy public.
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    const candidates = String(req.headers["if-none-match"] || "")
      .slice(0, 2048)
      .split(",")
      .map((tag) => tag.trim());
    if (
      candidates.includes(etag) ||
      candidates.includes(`W/${etag}`) ||
      candidates.includes("*")
    ) {
      res.statusCode = 304;
      return res.end();
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(serialized);
  } catch (error) {
    // Never forward database diagnostics or staff-facing business errors to public callers.
    res.setHeader("Cache-Control", "no-store");
    res.removeHeader?.("ETag");
    return sendJson(res, error instanceof HttpError ? error.status : 503, {
      error:
        error instanceof HttpError
          ? error.message
          : "Current vacancies are temporarily unavailable.",
    });
  }
}
