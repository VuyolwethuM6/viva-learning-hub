import { lifecyclePendingKey } from "@/lib/recruitment-lifecycle-client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { recruitmentRequest } from "@/lib/recruitment-client";
import { applicantDownload, type Answers } from "@/lib/recruitment-applicant-client";
import type { RecruitmentSnapshot } from "@/lib/recruitment-types";
import { selectionCommands, selectionStages, selectionAssessmentPresets, type SelectionOperation, type SelectionWorkspace, type SelectionEvaluation } from "@/lib/recruitment-selection";
import { RecruitmentActionDialog, RecruitmentPendingAction } from "./RecruitmentActionDialog";
const human = (s: string) => s.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
const date = (s: string) => new Date(s).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" });
const tabs = ["Profile", "Screening", "Interviews", "Assessments", "Evaluations", "Decisions", "Communications", "History"] as const;
type Tab = typeof tabs[number];
type CaseDetail = {
    case: {
        id: string;
        reference: string;
        kind: string;
        state: string;
        revision: number;
        submitted_at: string;
    };
    email: string;
    answers: Answers | null;
    form?: { category: string | null };
    documents: {
        id: string;
        key: string;
        name: string;
        size: number;
        state: string;
    }[];
    eligibleStaff: {
        id: string;
        email: string;
        role: string;
    }[];
    assignments: {
        user_id: string;
        enabled: boolean;
    }[];
    notes: {
        id: string;
        kind: string;
        content: string;
        created_at: string;
    }[];
};
type Criterion = {
    key: string;
    score: number;
    maximum: number;
    weight: number;
    feedback: string;
};
const criteriaFor = (category: string): Criterion[] => (category === "tutor" ? ["Subject knowledge", "CAPS curriculum understanding", "Teaching methodology", "Communication", "Lesson planning", "Learner engagement", "Classroom management", "Assessment development", "Professional conduct", "Demonstration lesson performance"] : category === "administrator" ? ["Administrative accuracy", "Computer literacy", "Communication", "Organisation", "Data management", "Problem-solving", "Confidentiality", "Professionalism"] : ["Role knowledge", "Communication", "Professional conduct"]).map(key => ({ key, score: 0, maximum: 5, weight: 1, feedback: "" }));
type Report = {
    enabled?: boolean;
    byStage: {
        stage: string;
        count: number;
    }[];
    byVacancyStatus?: { status: string; count: number }[];
    byVacancy: {
        vacancyId: string;
        count: number;
    }[];
    interviews: {
        status: string;
        count: number;
    }[];
    processing: {
        averageDays: number | null;
        count: number;
    };
    screeningCompleted?: number;
    onboardingProgress?:{status:string;count:number}[];
    offersIssued?: number;
    offersAccepted?: number;
    offersDeclined?: number;
    onboarding?: number;
    activations?: number;
};
export function RecruitmentSelectionWorkspace({ snapshot, section }: {
    snapshot: RecruitmentSnapshot;
    section?: "reports";
}) {
    const [list, setList] = useState<SelectionWorkspace | null>(null), [detail, setDetail] = useState<SelectionWorkspace | null>(null), [profile, setProfile] = useState<CaseDetail | null>(null);
    const [vacancies, setVacancies] = useState<{id:string;reference:string}[]>([]);
    const [assessmentSupersedes,setAssessmentSupersedes] = useState(""),[assessmentTitle,setAssessmentTitle] = useState(""),[assessmentInstructions,setAssessmentInstructions] = useState(""),[assessmentDue,setAssessmentDue] = useState(""),[assessmentCriteria,setAssessmentCriteria] = useState(""),[evidenceRequired,setEvidenceRequired] = useState(true),[assessmentEvidence,setAssessmentEvidence] = useState(""),[assessmentFeedback,setAssessmentFeedback] = useState(""),[assessmentResult,setAssessmentResult] = useState("completed");
    const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [vacancyId, setVacancyId] = useState(""), [offset, setOffset] = useState(0);
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState(""), [tab, setTab] = useState<Tab>("Profile");
    const [review, setReview] = useState<{
        operation: SelectionOperation;
        data: Record<string, unknown>;
    } | null>(null);
    const [reason, setReason] = useState(""), [checks, setChecks] = useState<Record<string, boolean>>({ completeness: false, required_documents: false, qualifications: false, experience: false, role_requirements: false });
    const [applicantMessage,setApplicantMessage] = useState(""),[screenNotes, setScreenNotes] = useState(""), [outcome, setOutcome] = useState("shortlisted");
    const [interviewId, setInterviewId] = useState(""), [round, setRound] = useState(1), [interviewType, setInterviewType] = useState("Online interview"), [start, setStart] = useState(""), [duration, setDuration] = useState(45), [location, setLocation] = useState(""), [interviewers, setInterviewers] = useState<string[]>([]);
    const [criteria, setCriteria] = useState<Criterion[]>(criteriaFor("tutor")), [templateName, setTemplateName] = useState("Tutor assessment"), [comments, setComments] = useState(""), [replacesId, setReplacesId] = useState(""), [correctionReason, setCorrectionReason] = useState("");
    const [evaluationIds, setEvaluationIds] = useState<string[]>([]), [recommendation, setRecommendation] = useState("recommended"), [recommendationId, setRecommendationId] = useState(""), [decision, setDecision] = useState("approved_for_offer");
    const [password, setPassword] = useState(""), [code, setCode] = useState(""), [report, setReport] = useState<Report | null>(null);
    const owner = snapshot.user.role === "owner";
    const run = async (action: () => Promise<void>) => {
        if (busy)
            return;
        setBusy(true);
        setError("");
        try {
            await action();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Recruitment is unavailable.");
        }
        finally {
            setBusy(false);
        }
    };
    const load = useCallback(async (page = 0) => {
        setLoading(true);
        try {
            if (section === "reports") {
                const r = await recruitmentRequest<Report>("selection", undefined, "GET", true, undefined, { report: "summary" });
                setReport(r.enabled === false ? {...r,byStage:[],byVacancy:[],interviews:[],processing:{averageDays:null,count:0}} : r);
            }
            else
                setList(await recruitmentRequest<SelectionWorkspace>("selection", { action: "list", search, status, offset: page, ...(vacancyId ? { vacancyId } : {}) }));
            setOffset(page);
        }
        catch (e) { setList(null); setReport(null); setDetail(null); setProfile(null); throw e; }
        finally {
            setLoading(false);
        }
    }, [search, status, vacancyId, section]);
    useEffect(() => { void recruitmentRequest<{vacancies?:{id:string;reference:string}[]}>("vacancies").then(r => setVacancies(r.vacancies || [])).catch(() => undefined); }, []);
    useEffect(() => { void load().catch(e => setError(e.message)); /* Search is deliberately submitted, never sent in URLs. */ }, [section]); // eslint-disable-line react-hooks/exhaustive-deps
    const open = async (id: string) => {
        setDetail(null);
        setProfile(null);
        setTab("Profile");
        const [selection, p] = await Promise.all([
            recruitmentRequest<SelectionWorkspace>("selection", undefined, "GET", true, undefined, { caseId: id }),
            recruitmentRequest<CaseDetail>("applications", undefined, "GET", true, undefined, { caseId: id }),
        ]);
        setDetail(selection);
        setProfile(p);
        setInterviewId("");
        setEvaluationIds([]);
        setRecommendationId("");
        setReason(""); setApplicantMessage(""); setScreenNotes(""); setChecks({ completeness: false, required_documents: false, qualifications: false, experience: false, role_requirements: false, ...(p.form?.category === "tutor" ? {subject_specialisation:false,applicable_grades:false} : {}) });
        setAssessmentSupersedes("");setAssessmentTitle("");setAssessmentInstructions("");setAssessmentDue("");setAssessmentCriteria("");setAssessmentEvidence("");setAssessmentFeedback("");setAssessmentResult("completed");setOutcome("shortlisted");setRecommendation("recommended");setDecision("approved_for_offer");
        setCriteria(criteriaFor(p.form?.category || "support_staff")); setTemplateName(`${human(p.form?.category || "Role-specific")} assessment`); setComments("");setReplacesId("");setCorrectionReason("");setLocation("");setStart("");setInterviewers([]);setRound(1);
    };
    const prepare = (operation: SelectionOperation, data: Record<string, unknown>) => {
        if (!profile)
            return;
        if (sessionStorage.getItem(lifecyclePendingKey("selection"))) { setError("Check the previous action before making another change."); return; }
        const full = { requestId: crypto.randomUUID(), caseId: profile.case.id, expectedRevision: detail?.selection?.revision || 0, ...data };
        const validated = selectionCommands[operation].safeParse(full);
        if (!validated.success) {
            setError(validated.error.issues.map(i => `${i.path.join(" ")}: ${i.message}`).join("; "));
            return;
        }
        setError("");
        setReview({ operation, data: validated.data });
    };
    const submit = (e: FormEvent, operation: SelectionOperation, data: Record<string, unknown>) => { e.preventDefault(); prepare(operation, data); };
    const completed = detail?.interviews?.filter(i => i.status === "completed") || [];
    const currentEvaluations = (detail?.evaluations || []).filter(e => !detail?.evaluations?.some(other => other.replaces_id === e.id));
    const interviewerOptions = detail?.eligibleInterviewers || [{ id: snapshot.user.id, email: `${snapshot.user.email} (you)`, role: snapshot.user.role }, ...(profile?.eligibleStaff || []).filter(s => s.id !== snapshot.user.id)];
    const reasonField = <label>Reason or supporting evidence<textarea required minLength={3} maxLength={4000} value={reason} onChange={e => setReason(e.target.value)}/></label>;
    const categoryTemplate = (category: string) => { setCriteria(criteriaFor(category)); setTemplateName(`${human(category)} assessment`); };
    const correction = (evaluation: SelectionEvaluation) => { setCriteria(evaluation.criteria); setTemplateName(evaluation.template_name); setComments(evaluation.comments); setInterviewId(evaluation.interview_id); setReplacesId(evaluation.id); setCorrectionReason(""); setNotice("Editing a correction. The original submitted scorecard will remain in history."); };
    return <section className="recruitment-card">
    <div className="flex flex-wrap justify-between gap-3"><div><h2>{section === "reports" ? "Recruitment reports" : "Screening, interviews and decisions"}</h2><p>Submitted applications in your authorised scopes. Human decisions remain separate from recorded scores.</p></div><Button variant="outline" disabled={busy || loading} onClick={() => void run(() => load(offset))}>Refresh</Button></div>
    {error && <p role="alert" className="my-4">{error}</p>}{notice && <p role="status">{notice}</p>}
    {owner && snapshot.user.ownerAal2Required && <details className="my-4"><summary>Verify owner session assurance</summary><p>Confirm your password and authenticator before private case reads.</p><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label><label>Authenticator code<input inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)}/></label><Button disabled={busy || !password || !code} onClick={() => void run(async () => { await recruitmentRequest("case-step-up", { password, code, factorId: snapshot.user.mfaFactors?.[0]?.id }); setPassword(""); setCode(""); await load(); })}>Verify session</Button></details>}
    <RecruitmentPendingAction key={String(Boolean(review))} route="selection" onRecovered={() => load(offset)} />
    {loading && <p role="status">Loading authorised recruitment records…</p>}
    {section === "reports" ? report?.enabled === false ? <p>Recruitment reporting is disabled. Selection rollout requires separate owner approval.</p> : report && <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 my-5">{Object.entries({ "Screening completed":report.screeningCompleted, "Submitted applications": report.byStage.reduce((sum, item) => sum + item.count, 0), "Scheduled interviews": report.interviews.filter(i => i.status === "scheduled").reduce((sum, item) => sum + item.count, 0), "Completed interviews": report.interviews.filter(i => i.status === "completed").reduce((sum, item) => sum + item.count, 0), "Offers issued": report.offersIssued, "Offers accepted": report.offersAccepted, "Offers declined": report.offersDeclined, "Onboarding cases": report.onboarding, "Staff activations": report.activations }).filter(([, value]) => value !== undefined).map(([name, value]) => <article className="border rounded-xl p-4" key={name}><h3>{name}</h3><strong className="text-2xl">{value}</strong></article>)}</div><h3>Applications by stage</h3><table className="w-full"><thead><tr><th className="text-left">Stage</th><th className="text-left">Applications</th></tr></thead><tbody>{report.byStage.map(({ stage, count }) => <tr key={stage}><td>{human(stage)}</td><td>{count}</td></tr>)}</tbody></table>{report.processing.averageDays != null && <p>Average processing time: {report.processing.averageDays.toFixed(1)} days across {report.processing.count} completed cases.</p>}<h3 className="mt-5">Vacancies by status</h3><ul>{report.byVacancyStatus?.map(v => <li key={v.status}>{human(v.status)}: {v.count}</li>)}</ul><h3 className="mt-5">Applications per vacancy</h3><ul>{report.byVacancy.map(v => <li key={v.vacancyId}>{vacancies.find(row => row.id === v.vacancyId)?.reference || "Authorised vacancy"}: {v.count}</li>)}</ul>{report.onboardingProgress && <><h3 className="mt-5">Onboarding task progress</h3><ul>{report.onboardingProgress.map(t=><li key={t.status}>{human(t.status)}: {t.count}</li>)}</ul></>}<p className="mt-4">Counts reflect only currently authorised records. Historical financial records are managed in Accounting.</p></> : <>
    <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 my-5" onSubmit={e => { e.preventDefault(); void run(() => load()); }}><label>Search candidates<input maxLength={160} value={search} onChange={e => setSearch(e.target.value)}/></label><label>Selection stage<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All stages</option>{selectionStages.map(s => <option key={s} value={s}>{human(s)}</option>)}</select></label><label>Vacancy<select value={vacancyId} onChange={e => setVacancyId(e.target.value)}><option value="">All vacancies</option>{vacancies.map(v => <option key={v.id} value={v.id}>{v.reference}</option>)}</select></label><Button disabled={busy || loading}>Search applications</Button></form>
    {list && !list.enabled && <p>Selection processing is disabled. Production acceptance and activation remain separate owner-controlled steps.</p>}
    <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Candidate</th><th>Submitted</th><th>Stage</th><th>Documents</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{list?.items?.map(item => <tr key={item.id}><td className="p-2">{item.name}<small className="block">{item.reference}</small></td><td className="p-2">{date(item.submitted_at)}</td><td className="p-2">{human(item.stage)}</td><td className="p-2">{item.document_ready ? "Ready" : "Review required"}</td><td className="p-2"><Button variant="outline" disabled={busy} onClick={() => void run(() => open(item.id))}>Open candidate</Button></td></tr>)}</tbody></table></div>
    {!loading && list?.enabled && !list.items?.length && <p>No submitted candidates match your authorised filters.</p>}
    <div className="flex gap-3 my-4"><Button variant="outline" disabled={busy || loading || offset === 0} onClick={() => void run(() => load(Math.max(0, offset - 30)))}>Previous page</Button><Button variant="outline" disabled={busy || loading || !list?.hasMore} onClick={() => void run(() => load(offset + 30))}>Next page</Button></div>
    {profile && detail && <article className="border-t mt-6 pt-6"><div className="flex flex-wrap justify-between gap-3"><div><h3>{String(profile.answers?.fields.firstName || "")} {String(profile.answers?.fields.lastName || "Candidate")}</h3><p>{profile.case.reference} · {human(detail.selection?.stage || "screening")}</p></div><Link to={`/admin/recruitment/engagement?caseId=${profile.case.id}`} className="underline">Offers and onboarding</Link></div>
      <div role="tablist" aria-label="Candidate details" className="flex flex-wrap gap-2 my-4">{tabs.map(t => <Button key={t} role="tab" aria-selected={tab === t} id={`candidate-tab-${t}`} aria-controls="candidate-panel" variant={tab === t ? "default" : "outline"} tabIndex={tab === t ? 0 : -1} onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const next = tabs[(tabs.indexOf(t) + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                setTab(next);
                document.getElementById(`candidate-tab-${next}`)?.focus();
            } }} onClick={() => setTab(t)}>{t}</Button>)}</div>
      <div role="tabpanel" id="candidate-panel" aria-labelledby={`candidate-tab-${tab}`}>
      {tab === "Profile" && <><h4>Submitted application</h4><p>{profile.email}</p><dl className="grid gap-3 sm:grid-cols-2 my-4">{Object.entries(profile.answers?.fields || {}).map(([key, value]) => <div key={key}><dt className="font-semibold">{human(key)}</dt><dd className="break-words">{Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? value ? "Yes" : "No" : value}</dd></div>)}</dl>{Object.entries(profile.answers?.questions || {}).map(([key, value]) => <p key={key}><strong>{human(key)}: </strong>{String(value)}</p>)}<h4>Documents</h4>{profile.documents.map(d => <div key={d.id} className="flex flex-wrap gap-3 items-center my-3"><span>{d.name} · {human(d.state)}</span><Button variant="outline" disabled={busy || d.state !== "clean"} onClick={() => void run(() => applicantDownload(d.id, d.size, true))}>Download verified document</Button></div>)}<h4>Assigned reviewers</h4><ul>{profile.assignments.filter(a => a.enabled).map(a => <li key={a.user_id}>{interviewerOptions.find(o => o.id === a.user_id)?.email || a.user_id}</li>)}</ul><Link to="/admin/recruitment/applications" className="underline">Manage case assignments, notes and clarifications</Link></>}
      {tab === "Screening" && <div className="grid gap-6 lg:grid-cols-2"><form className="grid gap-3" onSubmit={e => submit(e, "screen", { checks: Object.entries(checks).map(([key, complete]) => ({ key, complete, evidence: screenNotes })), notes: screenNotes })}><h4>Objective completeness review</h4>{Object.entries(checks).map(([key, complete]) => <label className="flex gap-2" key={key}><input type="checkbox" checked={complete} onChange={e => setChecks({ ...checks, [key]: e.target.checked })}/>{human(key)}</label>)}<label>Review notes and evidence<textarea required minLength={3} maxLength={1000} value={screenNotes} onChange={e => setScreenNotes(e.target.value)}/></label><Button disabled={busy}>Review screening record</Button><p>Completeness checks do not decide suitability.</p></form><form className="grid gap-3 content-start" onSubmit={e => submit(e, "shortlist", { outcome, reason, ...(outcome === "information_requested" ? {applicantMessage} : {}) })}><h4>Human shortlisting decision</h4><label>Outcome<select value={outcome} onChange={e => setOutcome(e.target.value)}><option value="shortlisted">Shortlist</option><option value="not_shortlisted">Do not shortlist</option><option value="information_requested">Request information</option><option value="screening">Return for review</option></select></label>{outcome === "information_requested" && <label>Message to applicant<textarea required minLength={3} maxLength={4000} value={applicantMessage} onChange={e => setApplicantMessage(e.target.value)} /><span>Only this message is shared with the applicant. Internal reasons stay private.</span></label>}{reasonField}<Button disabled={busy}>Review shortlist decision</Button></form><div className="lg:col-span-2"><h4>Screening history</h4>{detail.screening?.map(record => <article key={record.id} className="border rounded p-3 my-3"><p>{date(record.created_at)}</p><p>{record.notes}</p><ul>{record.checks.map(check => <li key={check.key}>{human(check.key)}: {check.complete ? "Complete" : "Outstanding"}</li>)}</ul></article>)}</div></div>}
      {tab === "Interviews" && <><h4>Interview rounds</h4>{detail.interviews?.map(i => <article key={i.id} className="border rounded p-4 my-3"><h5>Round {i.round}: {i.type}</h5><p>{date(i.starts_at)} – {date(i.ends_at)} (South African time)</p><p className="break-words">{i.location}</p><p>{human(i.status)} · Candidate: {human(i.candidate_response || "awaiting response")}</p><div className="flex flex-wrap gap-2 mt-2"><Button variant="outline" onClick={() => { setInterviewId(i.id); setRound(i.round); setInterviewType(i.type); setStart(new Date(new Date(i.starts_at).getTime() - new Date(i.starts_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16)); setDuration(Math.round((Date.parse(i.ends_at) - Date.parse(i.starts_at)) / 60000)); setLocation(i.location); setInterviewers(i.interviewer_ids); }}>Reschedule this round</Button>{["completed", "no_show", "cancelled"].map(s => <Button key={s} variant="outline" disabled={busy || i.status === s} onClick={() => prepare("interview_update", { interviewId: i.id, status: s, reason })}>{human(s)}</Button>)}</div></article>)}<form className="grid gap-3 my-5" onSubmit={e => { e.preventDefault(); try {
                prepare("interview_schedule", { ...(interviewId ? { interviewId } : {}), round, type: interviewType, startsAt: new Date(start).toISOString(), durationMinutes: duration, location, interviewerIds: interviewers, reason });
            }
            catch {
                setError("Choose a valid interview date and time.");
            } }}><h4>{interviewId ? "Reschedule interview" : "Schedule interview"}</h4><p>Times use your browser's local timezone. Known interviewer conflicts are checked; external calendars are not connected.</p><div className="grid gap-3 sm:grid-cols-2"><label>Round<input type="number" min={1} max={20} value={round} onChange={e => setRound(Number(e.target.value))}/></label><label>Interview type<input required value={interviewType} maxLength={100} onChange={e => setInterviewType(e.target.value)}/></label><label>Start date and time<input required type="datetime-local" value={start} onChange={e => setStart(e.target.value)}/></label><label>Duration in minutes<input type="number" min={10} max={480} value={duration} onChange={e => setDuration(Number(e.target.value))}/></label></div><label>Location or private meeting link<input required minLength={3} maxLength={1000} value={location} onChange={e => setLocation(e.target.value)}/></label><fieldset><legend>Interviewers</legend>{interviewerOptions.map(staff => <label className="flex gap-2" key={staff.id}><input type="checkbox" checked={interviewers.includes(staff.id)} onChange={e => setInterviewers(old => e.target.checked ? [...old, staff.id] : old.filter(id => id !== staff.id))}/>{staff.email}</label>)}</fieldset>{reasonField}<div className="flex gap-3"><Button disabled={busy}>Review interview schedule</Button>{interviewId && <Button type="button" variant="outline" onClick={() => setInterviewId("")}>Create another round</Button>}</div></form></>}
      {tab === "Assessments" && <><h4>Role-specific assessments</h4><p>Use instructions and criteria appropriate to the vacancy. Assigned evaluators record human results and supporting evidence.</p>{detail.assessments?.map(a => <article key={a.id} className="border rounded p-4 my-3"><h5>{a.title}</h5><p>{a.instructions}</p><p>Due {date(a.due_at)} · {human(a.state)}</p><ul>{a.criteria.map(c => <li key={c}>{c}</li>)}</ul>{a.results.map(r => <div key={r.evaluator_id}><p>{human(r.result)}: {r.feedback}</p>{r.evidence_ref && <p>Evidence: {r.evidence_ref}</p>}</div>)}{a.state === "scheduled" && !a.results.some(r => r.evaluator_id === snapshot.user.id) && a.evaluator_ids.includes(snapshot.user.id) && <form className="grid gap-3 mt-3" onSubmit={e => submit(e,"assessment_complete",{assessmentId:a.id,result:assessmentResult,feedback:assessmentFeedback,...(assessmentEvidence ? {evidenceRef:assessmentEvidence} : {})})}><label>Assessment result<select value={assessmentResult} onChange={e => setAssessmentResult(e.target.value)}><option value="completed">Completed</option><option value="not_completed">Not completed</option></select></label><label>Assessment feedback<textarea required minLength={3} maxLength={4000} value={assessmentFeedback} onChange={e => setAssessmentFeedback(e.target.value)} /></label><label>Supporting evidence reference<input required={a.evidence_required} minLength={3} maxLength={160} value={assessmentEvidence} onChange={e => setAssessmentEvidence(e.target.value)} /></label><Button disabled={busy}>Review assessment result</Button></form>}</article>)}<form className="grid gap-3 my-4" onSubmit={e => { e.preventDefault();try {prepare("assessment_create",{...(assessmentSupersedes ? {supersedesId:assessmentSupersedes} : {}),title:assessmentTitle,instructions:assessmentInstructions,dueAt:new Date(assessmentDue).toISOString(),evaluatorIds:interviewers,criteria:assessmentCriteria.split("\n").map(c => c.trim()).filter(Boolean),evidenceRequired});}catch{setError("Choose a valid assessment due date.");}}}><h4>Assign assessment</h4>{owner && <label>Replace an earlier assessment (owner approval required)<select value={assessmentSupersedes} onChange={e=>setAssessmentSupersedes(e.target.value)}><option value="">New assessment requirement</option>{detail.assessments?.filter(a=>a.state!=="superseded").map(a=><option key={a.id} value={a.id}>{a.title} · {human(a.state)}</option>)}</select><span>Earlier instructions and evaluator results remain in history.</span></label>}<label>Assessment title<input required minLength={3} maxLength={160} value={assessmentTitle} onChange={e => setAssessmentTitle(e.target.value)} /></label><label>Instructions<textarea required minLength={3} maxLength={4000} value={assessmentInstructions} onChange={e => setAssessmentInstructions(e.target.value)} /></label><label>Due date and time<input type="datetime-local" required value={assessmentDue} onChange={e => setAssessmentDue(e.target.value)} /></label><div className="flex flex-wrap gap-2">{Object.entries(selectionAssessmentPresets).map(([role,keys]) => <Button key={role} type="button" variant="outline" onClick={() => setAssessmentCriteria(keys.join("\n"))}>{human(role)} assessment criteria</Button>)}</div><label>Assessment criteria (one per line)<textarea required value={assessmentCriteria} onChange={e => setAssessmentCriteria(e.target.value)} /></label><fieldset><legend>Assigned evaluators</legend>{interviewerOptions.map(staff => <label key={staff.id} className="flex gap-2"><input type="checkbox" checked={interviewers.includes(staff.id)} onChange={e => setInterviewers(old => e.target.checked ? [...old,staff.id] : old.filter(id => id !== staff.id))} />{staff.email}</label>)}</fieldset><label className="flex gap-2"><input type="checkbox" checked={evidenceRequired} onChange={e => setEvidenceRequired(e.target.checked)} />Supporting evidence is mandatory</label><Button disabled={busy}>Review assessment assignment</Button></form></>}
      {tab === "Evaluations" && <><h4>Independent interviewer scorecards</h4><p>Submitted evaluations are immutable. Corrections preserve the original. Scores never approve or reject an applicant.</p>{currentEvaluations.map(e => <article key={e.id} className="border rounded p-4 my-3"><h5>{e.template_name}</h5><p>Recorded summary: {e.total_score} · {date(e.created_at)}</p><p>{e.comments}</p><ul>{e.criteria.map((c, i) => <li key={i}>{c.key}: {c.score}/{c.maximum} (weight {c.weight}) — {c.feedback}</li>)}</ul>{e.evaluator_id === snapshot.user.id && <Button variant="outline" onClick={() => correction(e)}>Create correction</Button>}</article>)}<form className="grid gap-3 mt-5" onSubmit={e => submit(e, "evaluate", { interviewId, templateName, criteria, comments, ...(replacesId ? { replacesId, correctionReason } : {}) })}><h4>{replacesId ? "Correct submitted evaluation" : "Record evaluation"}</h4><label>Completed interview<select required value={interviewId} onChange={e => setInterviewId(e.target.value)}><option value="">Choose interview</option>{completed.map(i => <option key={i.id} value={i.id}>Round {i.round}: {i.type}</option>)}</select></label><div className="flex flex-wrap gap-2">{["tutor", "administrator", "support_staff"].map(c => <Button key={c} type="button" variant="outline" onClick={() => categoryTemplate(c)}>{human(c)} criteria</Button>)}</div><label>Assessment template name<input required minLength={3} maxLength={160} value={templateName} onChange={e => setTemplateName(e.target.value)}/></label>{criteria.map((c, index) => <fieldset className="border rounded p-3 grid gap-3" key={index}><legend>Criterion {index + 1}</legend><label>Criterion name<input required value={c.key} maxLength={100} onChange={e => setCriteria(old => old.map((x, i) => i === index ? { ...x, key: e.target.value } : x))}/></label><div className="grid grid-cols-3 gap-2">{(["score", "maximum", "weight"] as const).map(k => <label key={k}>{human(k)}<input type="number" min={k === "score" ? 0 : 1} max={k === "score" ? c.maximum : 100} step="any" value={c[k]} onChange={e => setCriteria(old => old.map((x, i) => i === index ? { ...x, [k]: Number(e.target.value) } : x))}/></label>)}</div><label>Evidence and feedback<textarea required minLength={3} maxLength={4000} value={c.feedback} onChange={e => setCriteria(old => old.map((x, i) => i === index ? { ...x, feedback: e.target.value } : x))}/></label><Button type="button" variant="outline" disabled={criteria.length === 1} onClick={() => setCriteria(old => old.filter((_, i) => i !== index))}>Remove criterion {index + 1}</Button></fieldset>)}<Button type="button" variant="outline" disabled={criteria.length >= 30} onClick={() => setCriteria(old => [...old, { key: "", score: 0, maximum: 5, weight: 1, feedback: "" }])}>Add criterion</Button><label>Evaluator comments<textarea required minLength={3} maxLength={4000} value={comments} onChange={e => setComments(e.target.value)}/></label>{replacesId && <label>Reason for correction<textarea required minLength={3} maxLength={4000} value={correctionReason} onChange={e => setCorrectionReason(e.target.value)}/></label>}<div className="flex gap-3"><Button disabled={busy}>Review evaluation submission</Button>{replacesId && <Button variant="outline" type="button" onClick={() => { setReplacesId(""); setComments(""); setCriteria(criteriaFor("tutor")); }}>Cancel correction</Button>}</div></form></>}
      {tab === "Decisions" && <div className="grid gap-6 lg:grid-cols-2"><form className="grid gap-3 content-start" onSubmit={e => submit(e, "recommend", { outcome: recommendation, reason, evaluationIds })}><h4>Hiring recommendation</h4><label>Recommendation<select value={recommendation} onChange={e => setRecommendation(e.target.value)}><option value="recommended">Recommended</option><option value="not_recommended">Not recommended</option><option value="further_assessment">Further assessment required</option></select></label><fieldset><legend>Supporting evaluations</legend>{currentEvaluations.map(e => <label className="flex gap-2" key={e.id}><input type="checkbox" checked={evaluationIds.includes(e.id)} onChange={event => setEvaluationIds(old => event.target.checked ? [...old, e.id] : old.filter(id => id !== e.id))}/>{e.template_name} ({date(e.created_at)})</label>)}</fieldset>{reasonField}<Button disabled={busy}>Review recommendation</Button></form>{owner ? <form className="grid gap-3 content-start" onSubmit={e => submit(e, "decide", { outcome: decision, reason, recommendationId })}><h4>Owner final decision</h4><label>Supporting recommendation<select required value={recommendationId} onChange={e => setRecommendationId(e.target.value)}><option value="">Choose recommendation</option>{detail.recommendations?.map(r => <option key={r.id} value={r.id}>{human(r.outcome)} · {date(r.created_at)}</option>)}</select></label><label>Decision<select value={decision} onChange={e => setDecision(e.target.value)}><option value="approved_for_offer">Approve for offer</option><option value="unsuccessful">Unsuccessful</option><option value="further_assessment">Further assessment required</option></select></label>{reasonField}<Button disabled={busy}>Review owner decision</Button></form> : <p>Only an authorised owner may record a final hiring decision.</p>}<div className="lg:col-span-2"><h4>Recommendations and decisions</h4>{detail.recommendations?.map(r => <p key={r.id}>{human(r.outcome)}: {r.reason} · {date(r.created_at)}</p>)}{detail.decisions?.map(d => <p key={d.id}><strong>{human(d.outcome)}</strong>: {d.reason} · {date(d.created_at)}</p>)}</div></div>}
      {tab === "Communications" && <><h4>Case communications and notes</h4><p>Only applicant-visible clarifications and approved status messages reach candidates. Internal evaluations stay private.</p>{profile.notes.map(n => <article key={n.id} className="border rounded p-3 my-3"><strong>{human(n.kind)}</strong><p>{n.content}</p><small>{date(n.created_at)}</small></article>)}<Link to="/admin/recruitment/applications" className="underline">Open case messaging and additional information requests</Link></>}
      {tab === "History" && <><h4>Selection audit history</h4>{!detail.history?.length && <p>No selection actions have been recorded.</p>}<ol>{detail.history?.map(h => <li key={h.id} className="border-b p-3"><strong>{human(h.action)}</strong> · {human(h.previous_stage)} → {human(h.new_stage)}<p>{date(h.created_at)} · {h.actor_id}</p></li>)}</ol></>}
      </div></article>}
    </>}
    {review && <RecruitmentActionDialog route="selection" operation={review.operation} data={review.data} snapshot={snapshot} onClose={() => setReview(null)} onSuccess={async () => { const id = profile?.case.id; setReview(null); setNotice("The selection change was recorded."); await load(offset); if (id)
        await open(id); }}/>}
  </section>;
}
