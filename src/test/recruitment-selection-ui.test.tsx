import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RecruitmentSelectionWorkspace } from "@/components/admin/recruitment/RecruitmentSelectionWorkspace";
import type { RecruitmentSnapshot } from "@/lib/recruitment-types";
const { send, dialog } = vi.hoisted(() => ({ send: vi.fn(), dialog: vi.fn() }));
vi.mock("@/lib/recruitment-client", () => ({ recruitmentRequest: send }));
vi.mock("@/components/admin/recruitment/RecruitmentActionDialog", () => ({ lifecyclePendingKey: (route: string) => `viva.recruitment.${route}.pending`, RecruitmentPendingAction: () => null, RecruitmentActionDialog: (props: unknown) => { dialog(props); return <p>Review selection action</p>; } }));
const owner = "11111111-1111-4111-8111-111111111111", caseId = "22222222-2222-4222-8222-222222222222";
const snapshot: RecruitmentSnapshot = { user: { id: owner, email: "owner@example.test", role: "owner", revision: 0 }, settings: { revision: 0, staff_console_enabled: true, access_guards_enabled: true, privacy_policy_version: "test", draft_days: 14, unsuccessful_months: 6, talent_pool_months: 12 }, features: {}, staff: [], scopes: [], grants: [], events: [] };
const detail = { enabled: true, selection: { case_id: caseId, revision: 2, stage: "screening", decision: null }, screening: [], interviews: [], evaluations: [], recommendations: [], decisions: [], history: [] };
const profile = { case: { id: caseId, reference: "VIVA-CASE-TEST", kind: "vacancy", state: "submitted", revision: 1, submitted_at: "2026-11-15T09:00:00Z" }, email: "applicant@example.test", answers: { fields: { firstName: "Synthetic", lastName: "Applicant", qualifications: "Teaching degree" }, questions: {} }, documents: [{ id: "doc-id", key: "cv", name: "cv.pdf", size: 100, state: "quarantined" }], assignments: [], eligibleStaff: [], notes: [] };
function renderWorkspace(role: "owner" | "manager" = "owner", section?: "reports") { return render(<MemoryRouter><RecruitmentSelectionWorkspace snapshot={{ ...snapshot, user: { ...snapshot.user, role } }} section={section}/></MemoryRouter>); }
beforeEach(() => { send.mockImplementation(async (route, body, _method, _renew, _id, query) => route === "applications" ? profile : query?.report ? { byStage: [{ stage: "screening", count: 3 }], byVacancy: [], interviews: [{ status: "scheduled", count: 2 }], processing: { averageDays: 4, count: 1 } } : query?.caseId ? detail : { enabled: true, items: [{ id: caseId, reference: "VIVA-CASE-TEST", name: "Synthetic Applicant", submitted_at: "2026-11-15T09:00:00Z", stage: "screening", revision: 2, document_ready: false }], hasMore: false }); });
afterEach(() => { cleanup(); vi.resetAllMocks(); sessionStorage.clear(); });
describe("selection staff workspace", () => {
    it("submits candidate search in a POST body without applicant data in URLs", async () => {
        renderWorkspace();
        await screen.findByRole("button", { name: "Open candidate" });
        fireEvent.change(screen.getByLabelText("Search candidates"), { target: { value: "private@example.test" } });
        fireEvent.click(screen.getByRole("button", { name: "Search applications" }));
        await waitFor(() => expect(send).toHaveBeenCalledWith("selection", expect.objectContaining({ action: "list", search: "private@example.test" })));
        expect(send.mock.calls.every(c => !JSON.stringify(c.slice(4)).includes("private@example.test"))).toBe(true);
    });
    it("provides scoped candidate profile and prevents downloads of unscanned documents", async () => {
        renderWorkspace();
        fireEvent.click(await screen.findByRole("button", { name: "Open candidate" }));
        expect(await screen.findByText("Teaching degree")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Download verified document" })).toBeDisabled();
        expect(screen.getByRole("link", { name: "Offers and onboarding" })).toHaveAttribute("href", `/admin/recruitment/engagement?caseId=${caseId}`);
    });
    it("validates screening evidence before preparing a fresh revision-bound action", async () => {
        renderWorkspace();
        fireEvent.click(await screen.findByRole("button", { name: "Open candidate" }));
        await screen.findByText("Teaching degree");
        fireEvent.click(screen.getByRole("tab", { name: "Screening" }));
        fireEvent.change(screen.getByLabelText("Review notes and evidence"), { target: { value: "All qualifications verified against supporting evidence" } });
        fireEvent.click(screen.getByLabelText("Completeness"));
        fireEvent.click(screen.getByRole("button", { name: "Review screening record" }));
        expect(await screen.findByText("Review selection action")).toBeInTheDocument();
        expect(dialog.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ route: "selection", operation: "screen", data: expect.objectContaining({ caseId, expectedRevision: 2, checks: expect.arrayContaining([expect.objectContaining({ key: "completeness", complete: true })]) }) }));
        expect(sessionStorage.length).toBe(0);
    });
    it("requires a separate applicant-facing message for requests for information", async () => {
        renderWorkspace();
        fireEvent.click(await screen.findByRole("button", {name:"Open candidate"}));
        await screen.findByText("Teaching degree");
        fireEvent.click(screen.getByRole("tab", {name:"Screening"}));
        fireEvent.change(screen.getByLabelText("Outcome"), {target:{value:"information_requested"}});
        fireEvent.change(screen.getByLabelText("Message to applicant",{exact:false}), {target:{value:"Please clarify your qualification date."}});
        fireEvent.change(screen.getByLabelText("Reason or supporting evidence"), {target:{value:"Private internal review rationale"}});
        fireEvent.click(screen.getByRole("button", {name:"Review shortlist decision"}));
        expect(await screen.findByText("Review selection action")).toBeInTheDocument();
        expect(dialog.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({operation:"shortlist",data:expect.objectContaining({applicantMessage:"Please clarify your qualification date.",reason:"Private internal review rationale"})}));
    });
    it("hides final approval controls from managers and preserves human recommendation", async () => {
        renderWorkspace("manager");
        fireEvent.click(await screen.findByRole("button", { name: "Open candidate" }));
        await screen.findByText("Teaching degree");
        fireEvent.click(screen.getByRole("tab", { name: "Decisions" }));
        expect(screen.getByRole("button", { name: "Review recommendation" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Review owner decision" })).not.toBeInTheDocument();
        expect(screen.getByText("Only an authorised owner may record a final hiring decision.")).toBeInTheDocument();
    });
    it("renders aggregate scoped reports with no candidate names and keyboard tabs", async () => {
        renderWorkspace("owner", "reports");
        await screen.findByRole("heading", { name: "Applications by stage" });
        const row = screen.getByText("Screening").closest("tr")!;
        expect(within(row).getByText("3")).toBeInTheDocument();
        expect(screen.queryByText("Synthetic Applicant")).not.toBeInTheDocument();
        expect(screen.getByText("Average processing time: 4.0 days across 1 completed cases.")).toBeInTheDocument();
    });
    it("prepares a role-specific assessment with assigned evaluator and evidence requirements", async () => {
        renderWorkspace();
        fireEvent.click(await screen.findByRole("button", {name:"Open candidate"}));
        await screen.findByText("Teaching degree");
        fireEvent.click(screen.getByRole("tab", {name:"Assessments"}));
        fireEvent.change(screen.getByLabelText("Assessment title"), {target:{value:"CAPS demonstration lesson"}});
        fireEvent.change(screen.getByLabelText("Instructions"), {target:{value:"Prepare and present a Grade 12 lesson with assessment evidence."}});
        fireEvent.change(screen.getByLabelText("Due date and time"), {target:{value:"2099-11-20T15:00"}});
        fireEvent.click(screen.getByRole("button", {name:"Tutor assessment criteria"}));
        fireEvent.click(screen.getByLabelText("owner@example.test (you)"));
        fireEvent.click(screen.getByRole("button", {name:"Review assessment assignment"}));
        expect(await screen.findByText("Review selection action")).toBeInTheDocument();
        expect(dialog.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({operation:"assessment_create",data:expect.objectContaining({caseId,expectedRevision:2,evaluatorIds:[owner],evidenceRequired:true,criteria:expect.arrayContaining(["CAPS curriculum understanding"])})}));
    });
    it("keeps disabled processing explicit and supports keyboard candidate tabs", async () => {
        send.mockImplementationOnce(async () => ({vacancies:[]}));
        send.mockImplementationOnce(async () => ({enabled:false,items:[],hasMore:false}));
        renderWorkspace();
        expect(await screen.findByText("Selection processing is disabled. Production acceptance and activation remain separate owner-controlled steps.")).toBeInTheDocument();
        cleanup();
        renderWorkspace();
        fireEvent.click(await screen.findByRole("button", {name:"Open candidate"}));
        await screen.findByText("Teaching degree");
        fireEvent.keyDown(screen.getByRole("tab", {name:"Profile"}), {key:"ArrowRight"});
        expect(screen.getByRole("tab", {name:"Screening"})).toHaveAttribute("aria-selected","true");
        expect(screen.getByRole("button", {name:"Review screening record"})).toBeInTheDocument();
    });
    it("handles a default-disabled report without rendering assumed aggregate data", async () => {
        send.mockImplementation(async (_route,_body,_method,_renew,_id,query) => query?.report ? {enabled:false} : {vacancies:[]});
        renderWorkspace("owner","reports");
        expect(await screen.findByText("Recruitment reporting is disabled. Selection rollout requires separate owner approval.")).toBeInTheDocument();
        expect(screen.queryByRole("heading",{name:"Applications by stage"})).not.toBeInTheDocument();
    });
    it("fails closed on forbidden case detail without showing old private profile", async () => {
        send.mockImplementation(async (_route, _body, _method, _renew, _id, query) => query?.caseId ? Promise.reject(new Error("Access denied")) : { enabled: true, items: [{ id: caseId, reference: "TEST", name: "Synthetic Applicant", submitted_at: "2026-11-15T09:00:00Z", stage: "screening", document_ready: false }], hasMore: false });
        renderWorkspace();
        fireEvent.click(await screen.findByRole("button", { name: "Open candidate" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
        expect(screen.queryByText("Teaching degree")).not.toBeInTheDocument();
    });
});
