// @vitest-environment node
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../api/_lib/http";
import handler from "../../api/careers";
import { publicVacancyFixture } from "./fixtures/public-vacancy";
const { database } = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock("../../api/_lib/admin", () => ({ rpc: database }));
function resolve(state: Record<string, unknown>) {
  return database.mockResolvedValue({
    total: Array.isArray(state.vacancies) ? state.vacancies.length : 0,
    nextOffset: null,
    ...state,
  });
}
function response() {
  const result = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    body: "",
    setHeader(key: string, value: unknown) {
      this.headers[key] = value;
    },
    removeHeader(key: string) {
      delete this.headers[key];
    },
    end(value?: unknown) {
      this.body = value === undefined ? "" : String(value);
    },
  };
  return result as unknown as ServerResponse & typeof result;
}
async function call(
  url = "/api/careers",
  method = "GET",
  headers: Record<string, string> = {},
) {
  const req = Object.assign(Readable.from([]), {
      url,
      method,
      headers,
    }) as ApiRequest,
    res = response();
  await handler(req, res);
  return res;
}
beforeEach(() => {
  resolve({
    enabled: true,
    generation: 1,
    vacancies: [publicVacancyFixture()],
  });
});
afterEach(() => vi.resetAllMocks());
describe("public careers publication boundary", () => {
  it("uses only the public RPC and strips private fields at every exposed level", async () => {
    const vacancy = publicVacancyFixture();
    resolve({
      enabled: true,
      generation: 1,
      staff: ["private staff email"],
      vacancies: [
        {
          ...vacancy,
          status: "published",
          actor_id: "private actor",
          staff_email: "private staff email",
          acceptingApplications: true,
          content: {
            ...vacancy.content,
            staffNote: "private staff note",
            questions: [
              { ...vacancy.content.questions[0], reviewer: "private reviewer" },
            ],
            requiredDocuments: [
              {
                ...vacancy.content.requiredDocuments[0],
                storage_path: "private storage",
              },
            ],
          },
        },
      ],
    });
    const result = await call();
    expect(result.statusCode).toBe(200);
    expect(database).toHaveBeenCalledExactlyOnceWith(
      "recruitment_public_vacancies",
      { p_slug: null, p_offset: 0, p_category: "" },
    );
    expect(result.body).not.toContain("private");
    expect(JSON.parse(result.body).vacancies[0].acceptingApplications).toBe(
      false,
    );
    expect(Object.keys(JSON.parse(result.body).vacancies[0]).sort()).toEqual(
      [
        "id",
        "reference",
        "slug",
        "version",
        "publishedAt",
        "availability",
        "content",
        "acceptingApplications",
      ].sort(),
    );
  });
  it("rejects an upstream draft instead of publishing an accidental non-public record", async () => {
    resolve({
      enabled: true,
      generation: 1,
      vacancies: [{ ...publicVacancyFixture(), status: "draft" }],
    });
    const result = await call();
    expect(result.statusCode).toBe(503);
    expect(result.body).not.toContain("Mathematics");
    expect(result.headers["Cache-Control"]).toBe("no-store");
  });
  it("suppresses all records when publication is disabled and returns indistinguishable unavailable detail responses", async () => {
    resolve({
      enabled: false,
      generation: 2,
      vacancies: [{ secret: "private draft" }],
    });
    const list = await call();
    expect(JSON.parse(list.body)).toEqual({
      enabled: false,
      generation: 2,
      vacancies: [],
      total: 0,
      nextOffset: null,
    });
    const detail = await call(
      "/api/careers?slug=" + publicVacancyFixture().slug,
    );
    expect(detail.statusCode).toBe(404);
    expect(detail.body).not.toContain("private");
  });
  it("revalidates authoritative DB visibility before 304 and invalidates cached publication immediately", async () => {
    const first = await call(),
      etag = String(first.headers.ETag);
    expect(first.headers["Cache-Control"]).toBe(
      "public, max-age=0, must-revalidate",
    );
    const cached = await call("/api/careers", "GET", { "if-none-match": etag });
    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe("");
    expect(database).toHaveBeenCalledTimes(2);
    resolve({ enabled: true, generation: 2, vacancies: [] });
    const paused = await call("/api/careers", "GET", { "if-none-match": etag });
    expect(paused.statusCode).toBe(200);
    expect(paused.headers.ETag).not.toBe(etag);
    expect(JSON.parse(paused.body).vacancies).toEqual([]);
    resolve({ enabled: false, generation: 3, vacancies: [] });
    expect(
      (await call("/api/careers", "GET", { "if-none-match": etag })).statusCode,
    ).toBe(200);
  });
  it("changes ETags for deadline availability and new approved publication snapshots", async () => {
    const first = await call();
    resolve({
      enabled: true,
      generation: 1,
      vacancies: [publicVacancyFixture({ availability: "closed" })],
    });
    const closed = await call("/api/careers", "GET", {
      "if-none-match": String(first.headers.ETag),
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.headers.ETag).not.toBe(first.headers.ETag);
    resolve({
      enabled: true,
      generation: 2,
      vacancies: [publicVacancyFixture({ version: 2 })],
    });
    const revised = await call();
    expect(revised.headers.ETag).not.toBe(closed.headers.ETag);
  });
  it("returns a fresh 404 for removed detail even with a previously valid ETag", async () => {
    const slug = publicVacancyFixture().slug,
      first = await call("/api/careers?slug=" + slug);
    resolve({ enabled: true, generation: 2, vacancies: [] });
    const closed = await call("/api/careers?slug=" + slug, "GET", {
      "if-none-match": String(first.headers.ETag),
    });
    expect(closed.statusCode).toBe(404);
    expect(closed.headers.ETag).toBeUndefined();
    expect(closed.headers["Cache-Control"]).toBe("no-store");
  });
  it("bounds methods, filters, slug inputs and result sizes", async () => {
    for (const url of [
      "/api/careers?slug=x",
      "/api/careers?slug=valid-slug&slug=other-slug",
      "/api/careers?scopeId=private",
      "/api/careers?offset=-1",
      "/api/careers?offset=100001",
      "/api/careers?category=finance",
      "/api/careers?slug=valid-slug&offset=0",
      "/api/careers?slug=%3Cscript%3E",
      "/api/careers?slug=" + "x".repeat(161),
    ])
      expect((await call(url)).statusCode).toBe(400);
    expect((await call("/api/careers", "POST")).statusCode).toBe(405);
    expect(database).not.toHaveBeenCalled();
    resolve({
      enabled: true,
      generation: 1,
      vacancies: Array.from({ length: 21 }, () => publicVacancyFixture()),
    });
    expect((await call()).statusCode).toBe(503);
  });
  it("never serves stale data or database diagnostics when revalidation fails", async () => {
    const first = await call();
    database.mockRejectedValue(
      new Error("private service credential and staff details"),
    );
    const failed = await call("/api/careers", "GET", {
      "if-none-match": String(first.headers.ETag),
    });
    expect(failed.statusCode).toBe(503);
    expect(failed.headers["Cache-Control"]).toBe("no-store");
    expect(failed.headers.ETag).toBeUndefined();
    expect(failed.body).not.toContain("private");
    resolve({
      enabled: true,
      generation: 1,
      vacancies: [{ ...publicVacancyFixture(), content: null }],
    });
    expect((await call()).statusCode).toBe(503);
  });
  it("passes bounded pagination and category filters to the database and versions each page", async () => {
    resolve({
      enabled: true,
      generation: 1,
      vacancies: [],
      total: 44,
      nextOffset: 40,
    });
    const page = await call("/api/careers?offset=20&category=administrator");
    expect(page.statusCode).toBe(200);
    expect(database).toHaveBeenCalledExactlyOnceWith(
      "recruitment_public_vacancies",
      { p_slug: null, p_offset: 20, p_category: "administrator" },
    );
    expect(JSON.parse(page.body)).toMatchObject({ total: 44, nextOffset: 40 });
    resolve({
      enabled: true,
      generation: 1,
      vacancies: [],
      total: 44,
      nextOffset: 20,
    });
    const first = await call("/api/careers?category=administrator");
    expect(first.headers.ETag).not.toBe(page.headers.ETag);
    resolve({
      enabled: true,
      generation: 1,
      vacancies: [publicVacancyFixture()],
      total: 1,
      nextOffset: null,
    });
    expect((await call("/api/careers?category=administrator")).statusCode).toBe(
      503,
    );
  });
});
