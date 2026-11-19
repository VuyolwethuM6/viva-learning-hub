import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { applicantRequest, ApplicantError, uploadApplicant, type ApplicantDocument, type ApplicantCase } from "@/lib/recruitment-applicant-client";
import { applicantEngagementInput, type EngagementSnapshot, type EngagementOffer, type EngagementTask, type EngagementTemplate } from "@/lib/recruitment-engagement";

type Interview = { id: string; type: string; round: number; startsAt: string; endsAt: string; location: string; status: string; response: string | null };
type Selection = { enabled?: boolean; stage?: string; interviews?: Interview[]; assessments?: {id:string;title:string;instructions:string;dueAt:string;state:string}[] };
type ApplicantEngagement = Pick<EngagementSnapshot, "caseId" | "revision" | "category" | "acceptedTemplateIds"> & {offers: Omit<EngagementOffer,"approved_by">[];templates: Omit<EngagementTemplate,"legal_approval_reference">[];tasks: Omit<EngagementTask,"evidence_reference"|"assigned_to">[];activation:{status:string;activated_at:string;ended_at:string|null}|null;events: never[]};
type Pending = { requestId: string; route: "selection" | "engagement" };
const pendingKey = "viva.recruitment.lifecycle.applicant";
const human = (s: string) => s.replace(/([A-Z])/g, " $1").replaceAll("_", " ");
const date = (s: string) => Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" }) : "Time unavailable; refresh your application";
function readPending(): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
    return value && ["selection", "engagement"].includes(value.route) && /^[0-9a-f-]{36}$/i.test(value.requestId) ? value : null;
  } catch { return null; }
}
const displayedTerms = ["positionTitle", "engagementType", "startDate", "workArrangement", "reportingArrangements", "compensationTerms", "sessionRateCents", "conditions", "expiresAt"] as const;

export function ApplicantLifecycle({ onDocumentPendingChange }: { onDocumentPendingChange?: () => void } = {}) {
  const [selection, setSelection] = useState<Selection | null>(null), [engagement, setEngagement] = useState<ApplicantEngagement | null>(null),
    [documents, setDocuments] = useState<ApplicantDocument[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false),
    [acknowledgements, setAcknowledgements] = useState<Record<string, boolean>>({}), [pending, setPending] = useState<Pending | null>(readPending);
  const command = useRef<{ route: string; body: Record<string, unknown> } | null>(null), working = useRef(false), uncertain = useRef(Boolean(readPending()));
  async function load() {
    const results = await Promise.allSettled([applicantRequest<Selection>("selection"), applicantRequest<ApplicantEngagement>("engagement")]);
    const expected = ["intake_disabled", "onboarding_disabled", "case_unavailable"];
    const a = results[0], b = results[1];
    if (a.status === "fulfilled") setSelection(a.value.enabled === false ? null : a.value);
    else if (a.reason instanceof ApplicantError && expected.includes(a.reason.code)) setSelection(null);
    else throw a.reason;
    if (b.status === "fulfilled") setEngagement(b.value);
    else if (b.reason instanceof ApplicantError && expected.includes(b.reason.code)) setEngagement(null);
    else throw b.reason;
    if (b.status === "fulfilled" && b.value.tasks?.some(t => t.kind === "document")) {
      const current = await applicantRequest<Pick<ApplicantCase, "documents">>("applicant");
      setDocuments(current.documents || []);
    } else setDocuments([]);
    setAcknowledgements({});
  }
  useEffect(() => {
    let active = true;
    void load().catch(e => { if (active) setError(e instanceof Error ? e.message : "Unable to open application progress."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function send(route: string, operation: string, data: Record<string, unknown>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (pending && !command.current) throw new Error("Check the previous response before another change. Keep the original review available.");
      if (!command.current) {
        const requestId = crypto.randomUUID();
        if (route === "selection") {
          if (!/^[0-9a-f-]{36}$/i.test(String(data.interviewId)) || !["confirmed", "reschedule_requested"].includes(String(data.response))) throw new Error("Choose a valid interview response.");
          command.current = { route, body: { requestId, ...data } };
        } else {
          if (!engagement) throw new Error("Refresh the current offer before responding.");
          const parsed = applicantEngagementInput(operation, { requestId, expectedRevision: engagement.revision, ...data });
          command.current = { route, body: parsed };
        }
      }
      const request = command.current, metadata = (request.body.data || request.body) as Record<string, unknown>;
      const retained = { requestId: String(metadata.requestId), route: request.route as Pending["route"] };
      sessionStorage.setItem(pendingKey, JSON.stringify(retained)); setPending(retained);
      await applicantRequest(request.route, request.body);
      sessionStorage.removeItem(pendingKey); setPending(null); command.current = null; uncertain.current = false;
      await load(); setMessage("Your response has been recorded.");
    } catch (e) {
      if (e instanceof ApplicantError && e.confirmed && !uncertain.current) {
        sessionStorage.removeItem(pendingKey); setPending(null); command.current = null;
      } else if (e instanceof ApplicantError && !e.confirmed) uncertain.current = true;
      setError(e instanceof Error ? e.message : "Your response could not be confirmed. Retry the same response.");
    } finally { setBusy(false); working.current = false; }
  }
  async function recover(cancel=false) {
    if (working.current || !pending) return;
    working.current = true; setBusy(true); setError("");
    try {
      const r = await applicantRequest<{ state: string }>(pending.route, cancel ? {action:"cancel_pending",requestId:pending.requestId} : undefined, cancel ? "POST" : "GET", cancel ? undefined : { requestId: pending.requestId });
      if (r.state === "committed" || r.state === "cancelled") {
        sessionStorage.removeItem(pendingKey); setPending(null); command.current = null; uncertain.current = false;
        await load(); setMessage(r.state === "committed" ? "Your previous response is recorded." : "The pending response was cancelled. Review the current information before responding again.");
      } else setMessage("No response is recorded yet. Keep the original review and retry the same request; a delayed request may still finish.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to check response."); }
    finally { setBusy(false); working.current = false; }
  }
  const acknowledge = (key: string, text: string) => <label className="flex items-start gap-3 my-3"><input type="checkbox" checked={Boolean(acknowledgements[key])} onChange={e => setAcknowledgements(a => ({ ...a, [key]: e.target.checked }))} />{text}</label>;
  const offers = engagement?.offers || [], issued = offers.find(o => o.status === "issued"), accepted = offers.find(o => o.status === "accepted"),
    currentOffer = accepted || issued, offerExpired = issued ? Date.parse(issued.terms.expiresAt) <= Date.now() : false;
  // Only templates tied to an accepted offer or an explicitly assigned policy can be accepted.
  const templateIds = new Set([...(accepted ? [accepted.terms.agreementTemplateId] : []), ...(engagement?.tasks || []).map(t => (t as typeof t & { template_id?: string }).template_id).filter(Boolean)]);
  return <section className="grid gap-5 mt-6" aria-label="Application progress">
    <h2>Application progress</h2>
    {loading && <p role="status">Checking your current recruitment stage…</p>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!loading && !selection && !engagement && !error && <p>Further recruitment steps will appear here when available.</p>}
    {pending && <div className="border rounded-xl p-4"><p>A previous response needs confirmation.</p><div className="flex gap-3 flex-wrap"><Button disabled={busy} onClick={() => void recover()}>Check previous response</Button><Button disabled={busy} variant="outline" onClick={() => void recover(true)}>Cancel pending response</Button>{command.current && <Button disabled={busy} onClick={() => void send(command.current!.route, "", {})}>Retry same response</Button>}</div></div>}
    {selection?.stage && <p>Current stage: {human(selection.stage)}</p>}
    {selection?.interviews?.map(i => <article key={i.id} className="border rounded-xl p-4">
      <h3>Interview round {i.round} · {i.type}</h3><p>{date(i.startsAt)} – {date(i.endsAt)} (South Africa, SAST)</p>
      <p className="whitespace-pre-wrap break-words">{i.location}</p><p>{human(i.status)} · {human(i.response || "response pending")}</p>
      {i.status === "scheduled" && Date.parse(i.startsAt) > Date.now() && <div className="flex flex-wrap gap-3"><Button disabled={busy || !!pending} onClick={() => void send("selection", "", { interviewId: i.id, response: "confirmed" })}>Confirm attendance</Button><Button disabled={busy || !!pending} variant="outline" onClick={() => void send("selection", "", { interviewId: i.id, response: "reschedule_requested" })}>Request rescheduling</Button></div>}
    </article>)}
    {selection?.assessments?.map(a => <article className="border rounded-xl p-4" key={a.id}><h3>{a.title}</h3><p className="whitespace-pre-wrap break-words">{a.instructions}</p><p>Due {date(a.dueAt)} (SAST) · {human(a.state)}</p><p>Follow the assessment instructions. Recruitment staff record the assessment outcome after human evaluation.</p></article>)}
    {offers.length > 0 && <><h3>Your offers</h3>{offers.map(o => <article key={o.id} className="border rounded-xl p-4">
      <h4>Offer version {o.version} · {human(o.status)}</h4><dl>{displayedTerms.map(key => <div key={key}><dt className="font-semibold">{key === "sessionRateCents" ? "Tutor session rate (cents)" : human(key)}</dt><dd className="whitespace-pre-wrap break-words">{key === "expiresAt" ? `${date(o.terms[key])} (SAST)` : String(o.terms[key] ?? "")}</dd></div>)}</dl>
      <a className="inline-flex mt-3 underline print:hidden" href={`/api/recruitment?route=engagement&document=offer&offerId=${encodeURIComponent(o.id)}`} download rel="noreferrer">Download offer version {o.version} PDF</a>
    </article>)}</>}
    {currentOffer && <>
      <h3>Applicable agreements and policies</h3>
      {(engagement?.templates || []).filter(t => t.id === currentOffer.terms.agreementTemplateId || templateIds.has(t.id)).map(t => <article className="border rounded-xl p-4" key={t.id}>
        <h4>{t.title}</h4><p className="whitespace-pre-wrap break-words">{t.body}</p>
        {engagement?.acceptedTemplateIds?.includes(t.id) ? <p>Agreement acceptance recorded.</p> : templateIds.has(t.id) ? <>
          {acknowledge(`agreement:${t.id}`, `I have read and accept ${t.title}.`)}
          <Button disabled={busy || !!pending || !acknowledgements[`agreement:${t.id}`]} onClick={() => void send("engagement", "agreement_accept", { templateId: t.id, acknowledged: true })}>Accept {t.title}</Button>
        </> : <p>Accept the offer before recording agreement acceptance.</p>}
      </article>)}
      {issued && <div className="border rounded-xl p-4">
        {offerExpired ? <p>The displayed offer deadline has passed. Refresh your application to check the current status.</p> : <>
          {acknowledge(`offer:${issued.id}`, `I have reviewed and accept offer version ${issued.version} and its displayed terms.`)}
          <div className="flex flex-wrap gap-3"><Button disabled={busy || !!pending || !acknowledgements[`offer:${issued.id}`]} onClick={() => void send("engagement", "offer_accept", { offerId: issued.id, acknowledged: true })}>Accept offer</Button><Button variant="outline" disabled={busy || !!pending} onClick={() => void send("engagement", "offer_decline", { offerId: issued.id })}>Decline offer</Button></div>
        </>}
      </div>}
      <p>Offer acceptance does not activate staff access. The owner must approve activation after mandatory checks.</p>
    </>}
    {!!engagement?.tasks?.length && <><h3>Your onboarding</h3>{engagement.tasks.map(t => <article key={t.id} className="border rounded-xl p-4">
      <h4>{t.label}{t.required ? " · Required" : ""}</h4><p>{human(t.status)}{t.due_at ? ` · Due ${date(t.due_at)} (SAST)` : ""}</p>
      {t.kind === "document" && t.status !== "verified" && <label>Upload {t.label} as PDF (maximum 10 MiB)<input type="file" accept="application/pdf,.pdf" disabled={busy || !!pending} onChange={async e => {
        const file = e.target.files?.[0]; if (!file || working.current) return;
        working.current = true; setBusy(true); setError("");
        try { await uploadApplicant(file, t.key.replace(/^document:/, ""), setMessage); await load(); }
        catch (err) { setError(err instanceof Error ? err.message : "Upload unavailable."); await load().catch(() => undefined); }
        finally { setBusy(false); working.current = false; e.target.value = ""; onDocumentPendingChange?.(); }
      }} /></label>}
      {t.kind === "document" && documents.filter(d => d.key === t.key.replace(/^document:/, "") && !["discarded", "deleted"].includes(d.state)).map(d => <div key={d.id}><p>{d.name} · {human(d.state)}</p>{t.status !== "verified" && ["reserved", "uploading", "rejected", "scan_error"].includes(d.state) && <details><summary>Restart an incomplete document upload</summary><p>This removes the incomplete file reservation so you can upload the required PDF again. Verified submission documents are protected by the server.</p><Button variant="outline" disabled={busy || !!pending} onClick={async () => { if (working.current) return; working.current = true; setBusy(true); setError(""); try { await applicantRequest("documents", {action:"discard",documentId:d.id,generation:d.generation}); await load(); setMessage("Incomplete file discarded. You can upload the required PDF again."); } catch(err) { setError(err instanceof Error ? err.message : "Unable to discard file."); } finally { setBusy(false); working.current=false; } }}>Discard incomplete {d.name}</Button></details>}</div>)}
      {t.kind === "document" && t.status !== "verified" && <p>Uploaded documents must pass security scanning and staff verification before this requirement is complete.</p>}
      {t.kind === "declaration" && t.status === "pending" && <>{acknowledge(`task:${t.id}`, `I confirm the declaration: ${t.label}.`)}<Button disabled={busy || !!pending || !acknowledgements[`task:${t.id}`]} onClick={() => void send("engagement", "task_complete", { taskId: t.id, acknowledged: true })}>Confirm {t.label}</Button></>}
      {t.kind === "required_check" && t.status !== "verified" && <p>Recruitment staff will complete this verification.</p>}
    </article>)}</>}
    {engagement?.activation && <p>Staff engagement status: {human(engagement.activation.status)}.</p>}
  </section>;
}
