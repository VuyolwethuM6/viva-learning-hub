import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicantLifecycle } from "@/components/careers/ApplicantLifecycle";
import { ApplicantError } from "@/lib/recruitment-applicant-client";
const {send,upload}=vi.hoisted(()=>({send:vi.fn(),upload:vi.fn()}));
vi.mock("@/lib/recruitment-applicant-client",async original=>({...await original<object>(),applicantRequest:send,uploadApplicant:upload}));
const id="11111111-1111-4111-8111-111111111111",templateId="22222222-2222-4222-8222-222222222222",taskId="33333333-3333-4333-8333-333333333333";
const terms={positionTitle:"Synthetic Tutor",engagementType:"independent_contractor",startDate:"2027-01-01",workArrangement:"Online",reportingArrangements:"Teaching lead",compensationTerms:"Reviewed agreed rate",sessionRateCents:10000,conditions:"Verified onboarding",expiresAt:"2099-01-01T10:00:00Z",agreementTemplateId:templateId};
let accepted=false;
function engagement(){return {caseId:id,revision:4,category:"tutor",offers:[{id,version:1,terms,status:accepted?"accepted":"issued",issued_at:"2026-11-15T09:00:00Z",accepted_at:accepted?"2026-11-16T09:00:00Z":null}],templates:[{id:templateId,title:"Reviewed agreement",body:"Exact reviewed agreement wording",agreement_type:"independent_contractor",engagement_type:"independent_contractor"}],tasks:accepted?[{id:taskId,key:"document:identity",label:"Identity verification",kind:"document",required:true,status:"pending"}]:[],acceptedTemplateIds:[],activation:null,events:[]};}
beforeEach(()=>{accepted=false;sessionStorage.clear();send.mockImplementation(async(route,body)=>{if(body){if(body.operation==="offer_accept")accepted=true;return {ok:true};}if(route==="selection")return {enabled:true,stage:"interview",interviews:[{id,type:"Teaching interview",round:1,startsAt:"2099-01-01T10:00:00Z",endsAt:"2099-01-01T11:00:00Z",location:"Private interview arrangements",status:"scheduled",response:null}],assessments:[{id,title:"Demonstration lesson",instructions:"Prepare a CAPS lesson for review",dueAt:"2099-01-02T10:00:00Z",state:"assigned"}]};return engagement();});upload.mockResolvedValue(undefined);});
afterEach(()=>{cleanup();vi.resetAllMocks();sessionStorage.clear();});
describe("private applicant lifecycle",()=>{
 it("renders safe interview dates and assessment instructions and responds through case session",async()=>{
   render(<ApplicantLifecycle/>);await screen.findByText("Teaching interview",{exact:false});expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();expect(screen.getByText("Prepare a CAPS lesson for review")).toBeInTheDocument();
   fireEvent.click(screen.getByRole("button",{name:"Confirm attendance"}));await waitFor(()=>expect(send).toHaveBeenCalledWith("selection",expect.objectContaining({interviewId:id,response:"confirmed"})));
 });
 it("requires separate explicit offer and agreement acknowledgements",async()=>{
   render(<ApplicantLifecycle/>);await screen.findByRole("button",{name:"Accept offer"});expect(screen.getByRole("button",{name:"Accept offer"})).toBeDisabled();expect(screen.queryByRole("button",{name:"Accept Reviewed agreement"})).not.toBeInTheDocument();
   fireEvent.click(screen.getByLabelText("I have reviewed and accept offer version 1 and its displayed terms."));fireEvent.click(screen.getByRole("button",{name:"Accept offer"}));
   await waitFor(()=>expect(send).toHaveBeenCalledWith("engagement",expect.objectContaining({operation:"offer_accept",data:expect.objectContaining({offerId:id,expectedRevision:4,acknowledged:true})})));
   const acceptAgreement=await screen.findByRole("button",{name:"Accept Reviewed agreement"});expect(acceptAgreement).toBeDisabled();fireEvent.click(screen.getByLabelText("I have read and accept Reviewed agreement."));fireEvent.click(acceptAgreement);
   await waitFor(()=>expect(send).toHaveBeenCalledWith("engagement",expect.objectContaining({operation:"agreement_accept",data:expect.objectContaining({templateId,acknowledged:true})})));
   expect(sessionStorage.length).toBe(0);expect(screen.getByRole("link",{name:"Download offer version 1 PDF"})).toHaveAttribute("href",`/api/recruitment?route=engagement&document=offer&offerId=${id}`);
 });
 it("uploads an assigned onboarding PDF through existing scanned document pipeline",async()=>{
   accepted=true;render(<ApplicantLifecycle/>);const input=await screen.findByLabelText("Upload Identity verification as PDF (maximum 10 MiB)");const file=new File(["%PDF synthetic"],"identity.pdf",{type:"application/pdf"});fireEvent.change(input,{target:{files:[file]}});
   await waitFor(()=>expect(upload).toHaveBeenCalledWith(file,"identity",expect.any(Function)));expect(screen.getByText(/pass security scanning and staff verification/)).toBeInTheDocument();
 });
 it("retains and retries the exact uncertain response without persisting private content",async()=>{
   const base=send.getMockImplementation()!;let writes=0;send.mockImplementation(async(route,body,...rest)=>{if(body?.operation==="offer_accept"&&writes++===0)throw new ApplicantError("outcome_uncertain");return base(route,body,...rest);});
   render(<ApplicantLifecycle/>);await screen.findByRole("button",{name:"Accept offer"});fireEvent.click(screen.getByLabelText("I have reviewed and accept offer version 1 and its displayed terms."));fireEvent.click(screen.getByRole("button",{name:"Accept offer"}));await screen.findByRole("button",{name:"Retry same response"});
   const stored=JSON.parse(sessionStorage.getItem("viva.recruitment.lifecycle.applicant")!);expect(Object.keys(stored).sort()).toEqual(["requestId","route"]);const first=send.mock.calls.find(c=>c[1]?.operation==="offer_accept")![1];
   fireEvent.click(screen.getByRole("button",{name:"Retry same response"}));await waitFor(()=>expect(send.mock.calls.filter(c=>c[1]?.operation==="offer_accept")).toHaveLength(2));expect(send.mock.calls.filter(c=>c[1]?.operation==="offer_accept")[1][1]).toEqual(first);
 });
 it("does not clear an unrecorded recovered response or permit another acceptance",async()=>{
   sessionStorage.setItem("viva.recruitment.lifecycle.applicant",JSON.stringify({requestId:id,route:"engagement"}));const base=send.getMockImplementation()!;send.mockImplementation(async(route,body,method,query)=>query?.requestId?{state:"not_recorded"}:base(route,body,method,query));
   render(<ApplicantLifecycle/>);fireEvent.click(await screen.findByRole("button",{name:"Check previous response"}));expect(await screen.findByText(/No response is recorded yet/)).toBeInTheDocument();expect(sessionStorage.getItem("viva.recruitment.lifecycle.applicant")).not.toBeNull();expect(screen.getByRole("button",{name:"Accept offer"})).toBeDisabled();
 });
 it("can discard an incomplete same-case onboarding file before restarting",async()=>{
   accepted=true;const base=send.getMockImplementation()!;let discarded=false;send.mockImplementation(async(route,body,...rest)=>{if(route==="documents"&&body?.action==="discard"){discarded=true;return {ok:true};}if(route==="applicant")return {documents:discarded?[]:[{id:taskId,key:"identity",name:"incomplete.pdf",state:"reserved",generation:id}]};return base(route,body,...rest);});
   render(<ApplicantLifecycle/>);fireEvent.click(await screen.findByText("Restart an incomplete document upload"));fireEvent.click(screen.getByRole("button",{name:"Discard incomplete incomplete.pdf"}));
   await waitFor(()=>expect(send).toHaveBeenCalledWith("documents",{action:"discard",documentId:taskId,generation:id}));expect(await screen.findByText("Incomplete file discarded. You can upload the required PDF again.")).toBeInTheDocument();
 });
 it("notifies the parent when an uncertain document reservation needs existing recovery",async()=>{
   accepted=true;const notify=vi.fn();upload.mockRejectedValue(new ApplicantError("outcome_uncertain"));render(<ApplicantLifecycle onDocumentPendingChange={notify}/>);
   fireEvent.change(await screen.findByLabelText("Upload Identity verification as PDF (maximum 10 MiB)"),{target:{files:[new File(["%PDF test"],"identity.pdf",{type:"application/pdf"})]}});
   await waitFor(()=>expect(notify).toHaveBeenCalledOnce());expect(await screen.findByRole("alert")).toHaveTextContent("outcome uncertain");
 });
 it("shows disabled lifecycle without an apparent submission form",async()=>{
   send.mockRejectedValue(new ApplicantError("intake_disabled",true));render(<ApplicantLifecycle/>);expect(await screen.findByText("Further recruitment steps will appear here when available.")).toBeInTheDocument();expect(screen.queryByRole("button")).not.toBeInTheDocument();
 });
});
