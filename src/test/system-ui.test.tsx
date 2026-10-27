import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import { SystemWorkspace } from "@/components/admin/SystemWorkspace";
import { systemFixture, systemActor, systemStaff } from "./system-fixture";
import type { SystemSettings } from "@/lib/system-types";
let snapshot: SystemSettings;
beforeEach(() => {
  snapshot = systemFixture();
  if (!HTMLDialogElement.prototype.showModal)
    HTMLDialogElement.prototype.showModal = function () {};
  if (!HTMLDialogElement.prototype.close)
    HTMLDialogElement.prototype.close = function () {};
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(
    function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function network() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, options) => {
      if (options?.method === "POST") {
        const body = JSON.parse(String(options.body));
        if (body.operation === "closure_add") {
          snapshot.closures.push({
            day: body.data.day,
            reason: body.data.reason,
          });
          snapshot.revision++;
        }
        return new Response(
          JSON.stringify({ success: true, revision: snapshot.revision }),
        );
      }
      return new Response(JSON.stringify(snapshot));
    });
}
const props = {
  user: { id: systemActor, email: "owner@example.test" },
  onNavigate: vi.fn(),
  changed: vi.fn(async () => {}),
};
describe("admin oversight interface", () => {
  it("requires review before saving a calendar change and then shows its stored date", async () => {
    const fetch = network();
    render(
      <div className="admin-shell">
        <SystemWorkspace section="Settings" {...props} />
      </div>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Add closure" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Closure date"), {
      target: { value: "2027-03-02" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Review choices" }),
    );
    expect(
      fetch.mock.calls.filter(([, o]) => o?.method === "POST"),
    ).toHaveLength(0);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm and save" }),
    );
    await screen.findByText("Settings saved and recorded in Audit.");
    expect(screen.getByText("2027-03-02")).toBeInTheDocument();
    const payload = JSON.parse(
      String(fetch.mock.calls.find(([, o]) => o?.method === "POST")![1]?.body),
    );
    expect(payload).toMatchObject({
      action: "system",
      operation: "closure_add",
      data: { revision: 2, day: "2027-03-02" },
    });
    expect(payload.data.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("shows genuine role boundaries and prevents editing your own access", async () => {
    network();
    render(<SystemWorkspace section="Settings" {...props} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Staff access" }),
    );
    expect(
      screen.getByRole("button", { name: "Review access" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Grant staff access" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Verified staff account"), {
      target: { value: systemStaff },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Review choices" }),
    );
    expect(within(dialog).getByText("staff@example.test")).toBeInTheDocument();
    expect(within(dialog).queryByText(systemStaff)).not.toBeInTheDocument();
  });
  it("keeps configuration editable only by owners and hides staff identities from viewers", async () => {
    snapshot.role = "viewer";
    snapshot.admins = [];
    snapshot.candidates = [];
    network();
    render(<SystemWorkspace section="Settings" {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Automation" }));
    expect(
      screen.getByRole("button", { name: "Configure automation" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Staff access" }));
    expect(
      screen.getByRole("button", { name: "Grant staff access" }),
    ).toBeDisabled();
    expect(
      screen.queryByText("owner@example.test · You"),
    ).not.toBeInTheDocument();
  });
  it("retains the same change request after a failed response so a retry cannot create another change", async () => {
    const fetch = network(),
      original = fetch.getMockImplementation()!;
    let first = true;
    fetch.mockImplementation(async (url, options) => {
      if (options?.method === "POST" && first) {
        first = false;
        return new Response(
          JSON.stringify({ error: "The response was lost; retry safely." }),
          { status: 502 },
        );
      }
      return original(url, options);
    });
    render(<SystemWorkspace section="Settings" {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Add closure" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Closure date"), {
      target: { value: "2027-03-02" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Review choices" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm and save" }),
    );
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Confirm and save" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm and save" }),
    );
    await screen.findByText("Settings saved and recorded in Audit.");
    const calls = fetch.mock.calls
      .filter(([, o]) => o?.method === "POST")
      .map(([, o]) => JSON.parse(String(o?.body)));
    expect(calls).toHaveLength(2);
    expect(calls[0].data.requestId).toBe(calls[1].data.requestId);
  });
});
