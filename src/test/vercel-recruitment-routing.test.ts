// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../api/_lib/http";
import handler from "../../api/recruitment";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const { staff, careers, applicant } = vi.hoisted(() => ({
  staff: vi.fn(),
  careers: vi.fn(),
  applicant: vi.fn(),
}));
vi.mock("../../api/_lib/recruitment-admin-handler", () => ({ default: staff }));
vi.mock("../../api/_lib/recruitment-careers-handler", () => ({
  default: careers,
}));
vi.mock("../../api/_lib/recruitment-applicant-handler", () => ({
  default: applicant,
}));
beforeEach(() => {
  for (const [name, mock] of Object.entries({ staff, careers, applicant })) {
    mock.mockReset();
    mock.mockImplementation((req, res) =>
      res.end(
        JSON.stringify({
          name,
          url: req.url,
          cookie: req.headers.cookie,
          method: req.method,
        }),
      ),
    );
  }
});
async function call(url: string, method = "GET") {
  const req = Object.assign(Readable.from([]), {
    url,
    method,
    headers: { cookie: "synthetic-original-cookie" },
  }) as ApiRequest;
  const res = {
    statusCode: 200,
    body: "",
    headers: {} as Record<string, unknown>,
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end(v: unknown) {
      this.body = String(v);
    },
  };
  await handler(req, res as unknown as ServerResponse);
  expect(req.url).toBe(url);
  return res;
}
it.each([
  [
    "/api/admin/recruitment?route=snapshot",
    "staff",
    "/api/admin/recruitment?route=snapshot",
  ],
  [
    "/api/recruitment?__viva_recruitment=staff&route=session",
    "staff",
    "/api/admin/recruitment?route=session",
  ],
  ["/api/careers?category=tutor", "careers", "/api/careers?category=tutor"],
  [
    "/api/recruitment?__viva_recruitment=careers&category=tutor",
    "careers",
    "/api/careers?category=tutor",
  ],
  [
    "/api/recruitment?route=worker",
    "applicant",
    "/api/recruitment?route=worker",
  ],
])(
  "dispatches %s without changing cookie or method boundaries",
  async (path, name, normalized) => {
    const result = await call(path, "POST");
    expect(JSON.parse(result.body)).toEqual({
      name,
      url: normalized,
      cookie: "synthetic-original-cookie",
      method: "POST",
    });
    expect(
      staff.mock.calls.length +
        careers.mock.calls.length +
        applicant.mock.calls.length,
    ).toBe(1);
  },
);
it.each([
  "/api/recruitment?__viva_recruitment=staff&__viva_recruitment=careers",
  "/api/recruitment?__viva_recruitment=",
  "/api/recruitment?__viva_recruitment=worker",
  "/api/admin/recruitment?__viva_recruitment=careers",
  "/api/careers?__viva_recruitment=staff",
  "/api/other?__viva_recruitment=staff",
])(
  "rejects ambiguous or invalid dispatch %s before any handler",
  async (path) => {
    const result = await call(path);
    expect(result.statusCode).toBe(400);
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(staff).not.toHaveBeenCalled();
    expect(careers).not.toHaveBeenCalled();
    expect(applicant).not.toHaveBeenCalled();
  },
);
it("keeps the actual Vercel rewrites narrow and the recruitment worker duration intact", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(config.rewrites).toContainEqual({
    source: "/api/admin/recruitment",
    destination: "/api/recruitment?__viva_recruitment=staff",
  });
  expect(config.rewrites).toContainEqual({
    source: "/api/careers",
    destination: "/api/recruitment?__viva_recruitment=careers",
  });
  expect(config.functions["api/recruitment.ts"].maxDuration).toBe(300);
  expect(config.functions["api/recruitment.ts"].includeFiles).toContain(
    "docs/recruitment/production-installation/**",
  );
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  expect(pkg.scripts.prebuild).toBe("npm run check:vercel");
});
it("typechecks every API against the root config and enforces the twelve-function deployment budget", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/check-vercel-api.mjs"],
    { encoding: "utf8" },
  );
  expect(output).toContain(
    "12/12 function entries; zero TypeScript diagnostics",
  );
}, 20000);
