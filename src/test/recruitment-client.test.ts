import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  recruitmentRequest,
  RecruitmentError,
  pendingRecruitmentRequest,
  retainRecruitmentRequest,
  clearRecruitmentRequest,
} from "@/lib/recruitment-client";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.stubGlobal("AbortSignal", { timeout: () => undefined });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
});
describe("recruitment request recovery transport", () => {
  it.each([408, 429, 502])(
    "treats unmarked intermediary HTTP %i as uncertain",
    async (status) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "Gateway error" }), { status }),
      );
      await expect(recruitmentRequest("mutate", {})).rejects.toMatchObject({
        status,
        confirmed: false,
      });
    },
  );
  it("accepts only marked structured application rejections as definitive", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Permission denied" }), {
        status: 403,
        headers: { "X-Recruitment-Error": "confirmed" },
      }),
    );
    await expect(recruitmentRequest("mutate", {})).rejects.toMatchObject({
      status: 403,
      confirmed: true,
    });
    fetcher.mockResolvedValueOnce(
      new Response("Gateway timeout", {
        status: 408,
        headers: { "X-Recruitment-Error": "confirmed" },
      }),
    );
    await expect(recruitmentRequest("mutate", {})).rejects.toMatchObject({
      status: 408,
      confirmed: false,
    });
  });
  it("persists only the UUID and retrieves choices from the authorized server after reload", async () => {
    retainRecruitmentRequest(id);
    expect(pendingRecruitmentRequest()).toBe(id);
    expect(Object.values(sessionStorage)).toEqual([id]);
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ completed: false })));
    await recruitmentRequest("recover", undefined, "GET", true, id);
    expect(String(fetcher.mock.calls[0][0])).toContain(
      "route=recover&requestId=" + id,
    );
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
    clearRecruitmentRequest();
    expect(pendingRecruitmentRequest()).toBe(null);
  });
  it("never automatically resends consequential mutations or assigns another ID", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Lost response"));
    await expect(
      recruitmentRequest("mutate", { requestId: id }),
    ).rejects.toBeInstanceOf(RecruitmentError);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
