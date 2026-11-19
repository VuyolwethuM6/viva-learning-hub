import { lifecyclePendingKey } from "@/lib/recruitment-lifecycle-client";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecruitmentActionDialog, RecruitmentPendingAction } from "../components/admin/recruitment/RecruitmentActionDialog";
import type { RecruitmentSnapshot } from "../lib/recruitment-types";
const request = vi.hoisted(() => vi.fn());
vi.mock("../lib/recruitment-client", async (importOriginal) => ({ ...await importOriginal<object>(), recruitmentRequest: request }));
const snapshot = { user: { id: "owner", role: "owner", email: "owner@example.test", mfaFactors: [{ id: "33333333-3333-4333-8333-333333333333", friendlyName: "Test factor" }] } } as unknown as RecruitmentSnapshot;
const data = { requestId: "11111111-1111-4111-8111-111111111111", caseId: "22222222-2222-4222-8222-222222222222", expectedRevision: 1, reason: "Authorised human decision" };
beforeEach(() => { sessionStorage.clear(); request.mockReset(); });
afterEach(cleanup);
describe("lifecycle action confirmation", () => {
    it("keeps private content and credentials out of persisted request recovery", async () => {
        request.mockResolvedValue({ ok: true });
        const onSuccess = vi.fn(), onClose = vi.fn();
        render(<RecruitmentActionDialog route="selection" operation="decide" data={data} snapshot={snapshot} onSuccess={onSuccess} onClose={onClose}/>);
        fireEvent.change(screen.getByLabelText("Staff password"), { target: { value: "secret-password" } });
        fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirm action" }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
        expect(request).toHaveBeenCalledWith("selection", expect.objectContaining({ operation: "decide", data, password: "secret-password" }));
        expect(sessionStorage.length).toBe(0);
        expect(onClose).toHaveBeenCalledOnce();
    });
    it("prevents replacing an unresolved mutation with another request", async () => {
        sessionStorage.setItem(lifecyclePendingKey("engagement"), "older-request");
        render(<RecruitmentActionDialog route="engagement" operation="offer_issue" data={data} snapshot={snapshot} onSuccess={vi.fn()} onClose={vi.fn()}/>);
        fireEvent.change(screen.getByLabelText("Staff password"), { target: { value: "secret-password" } });
        fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirm action" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Resolve the previous request");
        expect(request).not.toHaveBeenCalled();
    });
    it("recovers a committed UUID without resending a mutation", async () => {
        sessionStorage.setItem(lifecyclePendingKey("selection"), data.requestId);
        request.mockResolvedValue({ state: "committed" });
        const recovered = vi.fn();
        render(<RecruitmentPendingAction route="selection" onRecovered={recovered}/>);
        fireEvent.click(screen.getByRole("button", { name: "Check previous action" }));
        await waitFor(() => expect(recovered).toHaveBeenCalledOnce());
        expect(sessionStorage.length).toBe(0);
        expect(request).toHaveBeenCalledWith("selection", undefined, "GET", true, undefined, { requestId: data.requestId });
    });
});


it("shows pending actions created after mount and allows server-confirmed cancellation",async()=>{
 const recovered=vi.fn();request.mockResolvedValue({state:"cancelled"});
 render(<RecruitmentPendingAction route="engagement" onRecovered={recovered}/>);
 sessionStorage.setItem(lifecyclePendingKey("engagement"),data.requestId);
 fireEvent(window,new Event("recruitment-lifecycle-pending"));
 fireEvent.click(await screen.findByRole("button",{name:"Cancel pending request"}));
 await waitFor(()=>expect(recovered).toHaveBeenCalledOnce());expect(sessionStorage.length).toBe(0);
 expect(request).toHaveBeenCalledWith("engagement",{action:"cancel_pending",requestId:data.requestId},"POST",true,undefined,undefined);
});
