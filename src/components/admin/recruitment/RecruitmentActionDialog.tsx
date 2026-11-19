import { lifecyclePendingKey } from "@/lib/recruitment-lifecycle-client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { recruitmentRequest, RecruitmentError } from "@/lib/recruitment-client";
import type { RecruitmentSnapshot } from "@/lib/recruitment-types";
const pendingChanged = () => window.dispatchEvent(new Event("recruitment-lifecycle-pending"));
function readPending(route: string) { try {
    return sessionStorage.getItem(lifecyclePendingKey(route));
}
catch {
    return null;
} }
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
function ReviewValues({ value }: {
    value: unknown;
}) {
    if (value === null || value === undefined)
        return <span>None</span>;
    if (typeof value === "boolean")
        return <span>{value ? "Yes" : "No"}</span>;
    if (Array.isArray(value))
        return <ul>{value.map((item, index) => <li key={index}><ReviewValues value={item}/></li>)}</ul>;
    if (typeof value === "object")
        return <dl className="grid gap-2">{Object.entries(value).filter(([key]) => !["requestId", "expectedRevision", "caseId"].includes(key)).map(([key, item]) => <div key={key}><dt className="font-semibold capitalize">{label(key)}</dt><dd className="whitespace-pre-wrap break-words"><ReviewValues value={item}/></dd></div>)}</dl>;
    return <span>{String(value)}</span>;
}
export function RecruitmentActionDialog({ route, operation, data, snapshot, onSuccess, onClose }: {
    route: string;
    operation: string;
    data: Record<string, unknown>;
    snapshot: RecruitmentSnapshot;
    onSuccess: () => void | Promise<void>;
    onClose: () => void;
}) {
    const [password, setPassword] = useState(""), [code, setCode] = useState(""), [factorId, setFactorId] = useState(snapshot.user.mfaFactors?.[0]?.id || ""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [uncertain, setUncertain] = useState(false);
    async function confirm() {
        if (busy)
            return;
        setBusy(true);
        setError("");
        try {
            // Only an opaque UUID is persisted; credentials and case content remain in memory.
            const key = lifecyclePendingKey(route), old = sessionStorage.getItem(key);
            if (old && old !== data.requestId)
                throw new Error("Resolve the previous request before making another change.");
            sessionStorage.setItem(key, String(data.requestId));
            pendingChanged();
            await recruitmentRequest(route, { operation, data, password, ...(factorId ? { factorId } : {}), ...(code ? { code } : {}) });
            sessionStorage.removeItem(key);
            pendingChanged();
            setPassword("");
            setCode("");
            await onSuccess();
            onClose();
        }
        catch (e) {
            if (e instanceof RecruitmentError && e.confirmed && !uncertain) {
                sessionStorage.removeItem(lifecyclePendingKey(route));
                pendingChanged();
            }
            else if (e instanceof RecruitmentError && !e.confirmed)
                setUncertain(true);
            setError(e instanceof Error ? e.message : "The result could not be confirmed. Retry this same review.");
        }
        finally {
            setBusy(false);
        }
    }
    return <Dialog open onOpenChange={(open) => { if (!open && !busy)
        onClose(); }}>
    <DialogContent className="recruitment-review max-h-[90dvh] overflow-y-auto">
      <DialogTitle>Confirm {operation.replaceAll("_", " ")}</DialogTitle>
      <DialogDescription>Review this action, then confirm your recruitment identity. Your current permissions and record revision are checked again by the server.</DialogDescription>
      <p>Case reference: {String(data.caseId || "Template governance")}</p>
      <details open><summary>Reviewed action details</summary><ReviewValues value={data}/></details>
      {error && <p role="alert">{error}</p>}
      {uncertain && <p role="status">The outcome is uncertain. Retry this exact action or close and check the recorded request before making another change.</p>}
      <form onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
        <label>Staff password<input type="password" required autoComplete="current-password" maxLength={1024} value={password} onChange={(e) => setPassword(e.target.value)}/></label>
        {snapshot.user.role === "owner" && <>
          <label>Authenticator<select required value={factorId} onChange={(e) => setFactorId(e.target.value)}>{snapshot.user.mfaFactors?.map((f) => <option key={f.id} value={f.id}>{f.friendlyName || "Authenticator"}</option>)}</select></label>
          <label>Authenticator code<input required inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)}/></label>
        </>}
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy}>{busy ? "Confirming…" : uncertain ? "Retry same action" : "Confirm action"}</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Close review</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
export function RecruitmentPendingAction({route,onRecovered}:{route:string;onRecovered:()=>void|Promise<void>}) {
 const [id,setId]=useState(()=>readPending(route)),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{const sync=()=>setId(readPending(route));window.addEventListener("recruitment-lifecycle-pending",sync);window.addEventListener("storage",sync);sync();return()=>{window.removeEventListener("recruitment-lifecycle-pending",sync);window.removeEventListener("storage",sync);};},[route]);
 async function resolve(cancel=false){if(!id||busy)return;setBusy(true);try{
  const result=await recruitmentRequest<{state:string}>(route,cancel?{action:"cancel_pending",requestId:id}:undefined,cancel?"POST":"GET",true,undefined,cancel?undefined:{requestId:id});
  if(result.state==="committed"||result.state==="cancelled"){sessionStorage.removeItem(lifecyclePendingKey(route));pendingChanged();setId(null);await onRecovered();}
  else setMessage("No action is recorded yet. Retry the original review, or cancel this pending request before reviewing another action.");
 }catch(e){setMessage(e instanceof Error?e.message:"Unable to check the request.");}finally{setBusy(false);}}
 if(!id)return null;
 return <section className="recruitment-card" aria-label="Pending action"><p>A previous action needs confirmation before another change.</p>{message&&<p role="status">{message}</p>}<p>Cancellation keeps a completed change. If it has not completed, cancellation prevents the original request from executing later.</p><div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={()=>void resolve()}>Check previous action</Button><Button variant="outline" disabled={busy} onClick={()=>void resolve(true)}>Cancel pending request</Button></div></section>;
}
