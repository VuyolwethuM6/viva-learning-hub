import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecruitmentEngagementWorkspace } from "@/components/admin/recruitment/RecruitmentEngagementWorkspace";
import type { RecruitmentSnapshot } from "@/lib/recruitment-types";
const { send, dialog } = vi.hoisted(() => ({ send: vi.fn(), dialog: vi.fn() }));
vi.mock("@/lib/recruitment-client", () => ({ recruitmentRequest: send }));
vi.mock("@/components/admin/recruitment/RecruitmentActionDialog", () => ({ lifecyclePendingKey: (route: string) => `viva.recruitment.${route}.pending`, RecruitmentPendingAction: () => null, RecruitmentActionDialog: (props: unknown) => { dialog(props); return <p>Review engagement action</p>; } }));
const owner = "11111111-1111-4111-8111-111111111111", caseId = "22222222-2222-4222-8222-222222222222", templateId = "33333333-3333-4333-8333-333333333333", taskId = "44444444-4444-4444-8444-444444444444", documentId = "55555555-5555-4555-8555-555555555555";
const snapshot: RecruitmentSnapshot = { user: { id: owner, email: "owner@example.test", role: "owner", revision: 0 }, settings: { revision: 0, staff_console_enabled: true, access_guards_enabled: true, privacy_policy_version: "test", draft_days: 14, unsuccessful_months: 6, talent_pool_months: 12 }, features: {}, staff: [], scopes: [], grants: [], events: [] };
const detail = { caseId, revision: 4, category: "tutor", offers: [], templates: [{ id: templateId, title: "Approved code of conduct", agreement_type: "code_of_conduct", engagement_type: "independent_contractor", body: "Reviewed terms", legal_approval_reference: "LEGAL-TEST" }], tasks: [{ id: taskId, key: "document:identity", label: "Identity", kind: "document", required: true, status: "pending" }], acceptedTemplateIds: [], activation: null, events: [] };
function mockRequests() {
 send.mockImplementation(async (route, _body, _method, _renew, _id, query) => {
   if (route === "selection") return { enabled: true, items: [{id:caseId,reference:"CASE-TEST",name:"Synthetic Applicant",stage:"approved_for_offer"}], hasMore:false };
   if (route === "applications") return {documents:[{id:documentId,key:"identity",name:"identity.pdf",state:"clean"},{id:"other",key:"identity",name:"unscanned.pdf",state:"quarantined"}],eligibleStaff:[]};
   if (query?.view === "personnel" && !query.caseId) return [{case_id:caseId,category:"tutor",status:"active",user_id:owner,tutor_id:null}];
   if (query?.view === "personnel") return {...detail, offers:[],tasks:[],templates:[],activation:{status:"active",user_id:owner}};
   return detail;
 });
}
async function open() { render(<RecruitmentEngagementWorkspace snapshot={snapshot}/>); await screen.findByRole("option",{name:/CASE-TEST/}); fireEvent.change(screen.getByLabelText("Candidate"),{target:{value:caseId}});fireEvent.click(screen.getByRole("button",{name:"Open engagement"}));await screen.findByRole("heading",{name:"Candidate engagement"}); }
beforeEach(()=>{mockRequests();sessionStorage.clear();window.history.replaceState(null,"","/");});
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe("engagement staff workspace",()=>{
 it("keeps candidate search in a POST body and opens deep-linked context",async()=>{
   window.history.replaceState(null,"",`/?caseId=${caseId}`);render(<RecruitmentEngagementWorkspace snapshot={snapshot}/>);await screen.findByRole("heading",{name:"Candidate engagement"});
   fireEvent.change(screen.getByLabelText("Search submitted applications"),{target:{value:"private@example.test"}});fireEvent.click(screen.getByRole("button",{name:"Search applications"}));
   await waitFor(()=>expect(send).toHaveBeenCalledWith("selection",{action:"list",search:"private@example.test",status:"",offset:0}));
   expect(send.mock.calls.every(c=>!JSON.stringify(c.slice(4)).includes("private@example.test"))).toBe(true);
 });
 it("prepares exact role-specific requirement and owner policy binding",async()=>{
   await open();fireEvent.click(screen.getByRole("button",{name:"onboarding"}));
   fireEvent.change(screen.getByLabelText("Requirement key"),{target:{value:"qualification"}});fireEvent.change(screen.getByLabelText("Requirement label"),{target:{value:"Qualification evidence"}});fireEvent.change(screen.getByLabelText("Requirement due date"),{target:{value:"2027-01-10T12:00"}});fireEvent.click(screen.getByRole("button",{name:"Review additional requirement"}));
   expect(dialog.mock.calls.at(-1)?.[0]).toMatchObject({operation:"task_require",data:{caseId,expectedRevision:4,key:"qualification",label:"Qualification evidence",kind:"document",required:true}});
   fireEvent.change(screen.getByLabelText("Approved policy"),{target:{value:templateId}});fireEvent.click(screen.getByRole("button",{name:"Review policy requirement"}));
   expect(dialog.mock.calls.at(-1)?.[0]).toMatchObject({operation:"policy_require",data:{templateId}});
 });
 it("selects only a clean same-case document for verification and assigns a reviewer",async()=>{
   await open();fireEvent.click(screen.getByRole("button",{name:"onboarding"}));
   expect(screen.queryByRole("option",{name:"unscanned.pdf"})).not.toBeInTheDocument();
   fireEvent.change(screen.getByLabelText("Verified document for Identity"),{target:{value:documentId}});fireEvent.change(screen.getByLabelText("Verification or approval evidence reference"),{target:{value:"VERIFY-TEST"}});fireEvent.click(screen.getByRole("button",{name:"Verify Identity"}));
   expect(dialog.mock.calls.at(-1)?.[0]).toMatchObject({operation:"task_verify",data:{taskId,documentId,evidenceReference:"VERIFY-TEST"}});
   fireEvent.change(screen.getByLabelText("Assign Identity to"),{target:{value:owner}});fireEvent.change(screen.getByLabelText("Due date for Identity"),{target:{value:"2027-01-10T12:00"}});fireEvent.click(screen.getByRole("button",{name:"Assign Identity"}));
   expect(dialog.mock.calls.at(-1)?.[0]).toMatchObject({operation:"task_assign",data:{taskId,userId:owner}});
 });
 it("prepares existing accounting bill without claiming a payment was executed",async()=>{
   await open();fireEvent.click(screen.getByRole("button",{name:"payments"}));fireEvent.change(screen.getByLabelText("Completed teaching session references (comma separated)"),{target:{value:documentId}});fireEvent.change(screen.getByLabelText("Bill issue date"),{target:{value:"2027-01-10"}});fireEvent.change(screen.getByLabelText("Bill due date"),{target:{value:"2027-01-20"}});fireEvent.change(screen.getByLabelText("Verification or approval evidence reference"),{target:{value:"PAYMENT-TEST"}});fireEvent.click(screen.getByRole("button",{name:"Review tutor payment preparation"}));
   expect(dialog.mock.calls.at(-1)?.[0]).toMatchObject({operation:"session_payment_prepare",data:{sessionIds:[documentId],issuedOn:"2027-01-10",dueOn:"2027-01-20",approvalReference:"PAYMENT-TEST"}});
   expect(screen.getByText(/does not execute a payment/)).toBeInTheDocument();
 });
 it("opens staff safety controls without reopening expired applicant data",async()=>{
   render(<RecruitmentEngagementWorkspace snapshot={snapshot}/>);fireEvent.click(screen.getByRole("button",{name:"Staff management"}));fireEvent.click(await screen.findByRole("button",{name:"Manage staff access"}));
   await screen.findByRole("heading",{name:"Staff access and offboarding"});expect(screen.queryByRole("button",{name:"offers"})).not.toBeInTheDocument();
   fireEvent.change(screen.getByLabelText("Reason for controlled changes"),{target:{value:"Owner authorised suspension"}});fireEvent.click(screen.getByRole("button",{name:"Suspend access"}));
   expect(dialog.mock.calls.at(-1)?.[0]).toMatchObject({operation:"access_suspend",data:{caseId,reason:"Owner authorised suspension"}});
   expect(send.mock.calls.some(c=>c[0]==="applications")).toBe(false);
 });
 it("hides owner personnel and policy approval from managers",async()=>{
   render(<RecruitmentEngagementWorkspace snapshot={{...snapshot,user:{...snapshot.user,role:"manager"}}}/>);
   await screen.findByRole("option",{name:/CASE-TEST/});expect(screen.queryByRole("button",{name:"Staff management"})).not.toBeInTheDocument();
   fireEvent.change(screen.getByLabelText("Candidate"),{target:{value:caseId}});fireEvent.click(screen.getByRole("button",{name:"Open engagement"}));await screen.findByRole("heading",{name:"Candidate engagement"});fireEvent.click(screen.getByRole("button",{name:"onboarding"}));
   expect(screen.queryByRole("button",{name:"Review policy requirement"})).not.toBeInTheDocument();
 });
});
