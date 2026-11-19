// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../api/_lib/http";
import type { RecruitmentUser } from "../lib/recruitment-types";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),limit:vi.fn()}));
vi.mock("../../api/_lib/recruitment-intake",async()=>({...await vi.importActual("../../api/_lib/recruitment-intake"),intakeRpc:mocks.rpc,intakeLimit:mocks.limit}));
import { handleLifecycleCancel } from "../../api/_lib/recruitment-lifecycle-recovery";
const user:RecruitmentUser={id:"11111111-1111-4111-8111-111111111111",email:"owner@example.test",role:"owner",revision:0,aal:"aal2"};
const requestId="22222222-2222-4222-8222-222222222222";
async function call(identity:RecruitmentUser|string,domain:"selection"|"engagement",body:unknown,method="POST"){
 const req=Object.assign(Readable.from([]),{method,headers:{}}) as ApiRequest;let content="";
 const res={statusCode:200,setHeader(){},end(v:unknown){content=String(v);}} as unknown as ServerResponse;
 await handleLifecycleCancel(req,res,identity,domain,body);return {status:res.statusCode,body:JSON.parse(content)};
}
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue({state:"cancelled"});});
it("binds staff cancellation to the authenticated actor and assurance, without private inputs",async()=>{
 expect((await call(user,"selection",{action:"cancel_pending",requestId})).body).toEqual({state:"cancelled"});
 expect(mocks.rpc).toHaveBeenCalledWith("recruitment_lifecycle_cancel",{p_domain:"selection",p_request:requestId,p_actor:user.id,p_hash:null,p_aal:"aal2"});
});
it("uses the server-derived applicant capability and rejects actor spoofing",async()=>{
 expect((await call("synthetic-hash","engagement",{action:"cancel_pending",requestId})).status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledWith("recruitment_lifecycle_cancel",{p_domain:"engagement",p_request:requestId,p_actor:null,p_hash:"synthetic-hash",p_aal:"aal1"});
 mocks.rpc.mockClear();expect((await call(user,"selection",{action:"cancel_pending",requestId,actorId:requestId})).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
 expect((await call(user,"selection",{action:"cancel_pending",requestId},"GET")).status).toBe(405);
});
