import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  RecruitmentDeploymentWorkspace,
  SqlSource,
} from "../components/admin/recruitment/RecruitmentDeploymentWorkspace";
import RecruitmentAdmin from "../pages/RecruitmentAdmin";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../lib/recruitment-client", async (original) => ({
  ...(await original<typeof import("../lib/recruitment-client")>()),
  recruitmentRequest: send,
}));
const sql =
  "-- exact bytes\nbegin;\nselect '<script>alert(1)</script>';\ncommit;\n";
const inventory = {
  sourceCommit: "a".repeat(40),
  sourceSetSha256: "b".repeat(64),
  migrations: [{ order: 1, path: "M1.sql", sha256: "c".repeat(64) }],
  documents: [
    { path: "01-install-m1-through-m3.sql" },
    { path: "DEPLOYMENT.md" },
  ],
  flags: { vacancy_intake_enabled: false },
  approvals: { scanner: false },
  environment: [{ name: "RECRUITMENT_SCANNER_KEY", present: false }],
  databaseVerification:
    "Run the post-installation SQL to verify installed objects.",
};
beforeEach(() => {
  sessionStorage.clear();
  send.mockReset();
  send.mockImplementation((route, _data, _method, _renew, _id, query) =>
    Promise.resolve(
      query?.document
        ? { content: sql, path: query.document, sha256: "d".repeat(64) }
        : inventory,
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("renders full SQL safely without interpreting markup", () => {
  const { container } = render(<SqlSource content={sql} />);
  expect(container.querySelector("code")?.textContent).toBe(sql);
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector(".sql-keyword")).not.toBeNull();
});
it("copies exact SQL, links authenticated download and never offers execution", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<RecruitmentDeploymentWorkspace />);
  await screen.findByRole("button", { name: "Copy SQL" });
  fireEvent.click(screen.getByRole("button", { name: "Copy SQL" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(sql));
  expect(screen.getByRole("link", { name: "Download SQL" })).toHaveAttribute(
    "href",
    "/api/admin/recruitment?route=deployment&document=01-install-m1-through-m3.sql&download=1",
  );
  expect(
    screen.queryByRole("button", { name: /execute|activate|install SQL/i }),
  ).toBeNull();
  expect(screen.getByText(/Presence checks only/)).toBeInTheDocument();
});
it("fails closed on unreadable inventory and makes no document request", async () => {
  send.mockRejectedValue(new Error("Owner access unavailable"));
  render(<RecruitmentDeploymentWorkspace />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Owner access unavailable",
  );
  expect(screen.queryByRole("button", { name: "Copy SQL" })).toBeNull();
  expect(send).toHaveBeenCalledTimes(1);
});
it.each(["manager", "officer"])(
  "does not load deployment files for %s",
  async (role) => {
    send.mockResolvedValue({
      user: { email: "staff@example.test", role },
      settings: {},
      features: {},
      scopes: [],
      grants: [],
      staff: [],
      events: [],
    });
    render(
      <MemoryRouter initialEntries={["/admin/recruitment/deployment"]}>
        <RecruitmentAdmin />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Recruitment owner access is required",
    );
    expect(send.mock.calls.every(([route]) => route === "snapshot")).toBe(true);
  },
);
