// @vitest-environment node
import { it,expect,vi,beforeEach } from "vitest";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../api/_lib/http";
import type { RecruitmentUser } from "../lib/recruitment-types";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),limit:vi.fn(),fresh:vi.fn()}));
vi.mock("../../api/_lib/recruitment-intake",async()=>({...await vi.importActual("../../api/_lib/recruitment-intake"),intakeRpc:mocks.rpc,intakeLimit:mocks.limit}));
vi.mock("../../api/_lib/recruitment-case-service",()=>({fresh:mocks.fresh}));
import { handleRecruitmentSelection } from "../../api/_lib/recruitment-selection";
const user:RecruitmentUser={id:randomUUID(),email:"synthetic@example.test",role:"owner",revision:0,aal:"aal2"};
async function call(method:string,body?:unknown,query="") {
 const req=Object.assign(Readable.from([]),{method,body,url:"/api/admin/recruitment?route=selection"+query,headers:{host:"localhost",origin:"http://localhost","content-type":"application/json"}}) as ApiRequest;
 let content="";const headers:Record<string,unknown>={};
 const res={statusCode:200,setHeader(k:string,v:unknown){headers[k]=v;},end(v:unknown){content=String(v||"");}} as ServerResponse;
 await handleRecruitmentSelection(req,res,user,new URL(req.url!,"http://localhost"));
 return {status:res.statusCode,body:JSON.parse(content||"{}"),headers};
}
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue({saved:true});mocks.fresh.mockImplementation(async(_req,_res,verified,_credentials,callback)=>callback(verified,"a".repeat(64),"b".repeat(64)));});
it("keeps applicant names out of query strings and accepts bounded POST search",async()=>{
 expect((await call("GET",undefined,"&search=Synthetic")).status).toBe(400);
 expect(mocks.rpc).not.toHaveBeenCalled();
 expect((await call("POST",{action:"list",search:"Synthetic",status:"screening",offset:0})).status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledWith("recruitment_selection_read",expect.objectContaining({p_actor:user.id,p_search:"Synthetic"}));
 expect(mocks.fresh).not.toHaveBeenCalled();
});
it("rejects unknown fields, actor spoofing and unbounded searches before calling SQL",async()=>{
 expect((await call("POST",{action:"list",search:"x".repeat(161)})).status).toBe(400);
 expect((await call("POST",{action:"list",search:"",actorId:randomUUID()})).status).toBe(400);
 expect((await call("POST",{operation:"decide",data:{},password:"synthetic"})).status).toBe(400);
 expect(mocks.rpc).not.toHaveBeenCalled();
});
it("requires fresh credentials and validates complete scoring criteria",async()=>{
 const data={requestId:randomUUID(),caseId:randomUUID(),expectedRevision:0,interviewId:randomUUID(),templateName:"Tutor",criteria:[{key:"Subject knowledge",score:6,maximum:5,weight:1,feedback:"Evidence"}],comments:"Evidence recorded"};
 expect((await call("POST",{operation:"evaluate",data,password:"synthetic"})).status).toBe(400);
 expect((await call("POST",{operation:"evaluate",data:{...data,criteria:[{...data.criteria[0],score:4}]}})).status).toBe(400);
 expect(mocks.fresh).not.toHaveBeenCalled();
});
it("uses verified actor and fresh assurance for owner decisions without forwarding credentials to SQL",async()=>{
 const data={requestId:randomUUID(),caseId:randomUUID(),expectedRevision:2,outcome:"approved_for_offer",reason:"Evidence reviewed",recommendationId:randomUUID()};
 expect((await call("POST",{operation:"decide",data,password:"synthetic-only"})).status).toBe(200);
 expect(mocks.fresh.mock.calls[0][5]).toBe(true);
 expect(mocks.rpc.mock.calls.map(x=>x[0])).toEqual(["recruitment_selection_prepare","recruitment_selection_mutate"]);
 const args=mocks.rpc.mock.calls[1][1];expect(args.p_actor).toBe(user.id);expect(args.d).toEqual(data);expect(JSON.stringify(args)).not.toContain("synthetic-only");
});
it("provides scoped recovery and summary without accepting arbitrary SQL arguments",async()=>{
 const requestId=randomUUID();
 expect((await call("GET",undefined,"&requestId="+requestId)).status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledWith("recruitment_selection_recover",{p_actor:user.id,p_request:requestId,p_aal:"aal2"});
 expect((await call("GET",undefined,"&report=summary")).status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledWith("recruitment_lifecycle_summary",{p_actor:user.id,p_aal:"aal2"});
});
