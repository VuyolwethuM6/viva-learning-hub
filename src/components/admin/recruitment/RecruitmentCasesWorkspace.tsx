import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  recruitmentRequest,
  RecruitmentError,
  pendingCaseRequest,
} from "@/lib/recruitment-client";
import type { Answers } from "@/lib/recruitment-applicant-client";
import type { IntakeDefinition } from "@/lib/recruitment-applications";
import { applicantDownload } from "@/lib/recruitment-applicant-client";
import type { RecruitmentSnapshot } from "@/lib/recruitment-types";
type Header = {
  id: string;
  reference: string;
  kind: string;
  state: string;
  revision: number;
  submitted_at: string;
  retention_due_at: string;
  first_name?: string;
  last_name?: string;
  normalized_email?: string;
};
type Detail = {
  case: Header;
  email: string;
  answers: Answers | null;
  form?: IntakeDefinition;
  notesHasMore?: boolean;
  notes: {
    id: string;
    kind: string;
    content: string;
    created_at: string;
    recommendation: string;
  }[];
  documents: {
    id: string;
    key: string;
    name: string;
    size: number;
    state: string;
  }[];
  assignments: { user_id: string; enabled: boolean }[];
  eligibleStaff: { id: string; email: string; role: string }[];
  audit: { id: string; action: string; created_at: string }[];
  holds: { id: string; released_at: string | null; review_at: string }[];
};
const key = "viva.recruitment.case.pending";
export function RecruitmentCasesWorkspace({
  snapshot: s,
}: {
  snapshot: RecruitmentSnapshot;
}) {
  const [rows, setRows] = useState<Header[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState(""),
    [enabled, setEnabled] = useState(false),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(pendingCaseRequest()),
    [review, setReview] = useState<{
      operation: string;
      data: Record<string, unknown>;
    } | null>(null),
    [proof, setProof] = useState(""),
    [keyVersion, setKeyVersion] = useState<number>(),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [factorId, setFactorId] = useState(s.user.mfaFactors?.[0]?.id || ""),
    [text, setText] = useState(""),
    [noteKind, setNoteKind] = useState("note"),
    [recommendation, setRecommendation] = useState("progress"),
    [target, setTarget] = useState(""),
    [reference, setReference] = useState(""),
    [evidence, setEvidence] = useState(""),
    [until, setUntil] = useState(""),
    [reason, setReason] = useState("rights_request");
  const owner = s.user.role === "owner";
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recruitment is unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function list(append = false) {
    const last = rows.at(-1),
      r = await recruitmentRequest<{
        enabled: boolean;
        cases: Header[];
        hasMore: boolean;
      }>("applications", {
        search: query,
        kind,
        ...(append && last
          ? { after: last.submitted_at, afterId: last.id }
          : {}),
      });
    setEnabled(r.enabled);
    setRows((a) => (append ? [...a, ...r.cases] : r.cases));
    setMore(r.hasMore);
  }
  const open = async (id: string) =>
    setDetail(
      await recruitmentRequest<Detail>(
        "applications",
        undefined,
        "GET",
        true,
        undefined,
        { caseId: id },
      ),
    );
  useEffect(() => {
    void recruitmentRequest<{
      enabled: boolean;
      cases: Header[];
      hasMore: boolean;
    }>("applications")
      .then((r) => {
        setEnabled(r.enabled);
        setRows(r.cases);
        setMore(r.hasMore);
      })
      .catch((e) => setError(e.message));
  }, []);
  const retain = (id: string) => {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
    setPending(id);
    window.dispatchEvent(new Event("recruitment-case-pending"));
  };
  function prepare(operation: string, data: Record<string, unknown> = {}) {
    if (!detail || pending) return;
    setProof("");
    setKeyVersion(undefined);
    setReview({
      operation,
      data: {
        requestId: crypto.randomUUID(),
        caseId: detail.case.id,
        expectedRevision: detail.case.revision,
        ...data,
      },
    });
  }
  async function recover() {
    if (!pending) return;
    const r = await recruitmentRequest<{
      state: string;
      safeToReviewAgain?: boolean;
      caseId?: string;
    }>("case-recover", undefined, "GET", true, undefined, {
      requestId: pending,
    });
    if (r.state === "committed" || r.safeToReviewAgain) {
      retain("");
      setReview(null);
      setProof("");
      setNotice(
        r.state === "committed"
          ? "Previous change is recorded."
          : "Previous proof expired without a recorded change. Refresh and review before creating another request.",
      );
      if (r.caseId) await open(r.caseId).catch(() => undefined);
    } else
      setNotice(
        "Previous action is not confirmed. Retry the original review, or wait for its four-minute proof to expire and check again.",
      );
  }
  async function confirm() {
    if (!review) return;
    retain(String(review.data.requestId));
    try {
      let current = { ...review, proof, keyVersion };
      if (!proof) {
        const p = await recruitmentRequest<{
          proof: string;
          data: Record<string, unknown>;
          keyVersion: number;
        }>("case-reauthenticate", {
          ...review,
          password,
          factorId: factorId || undefined,
          code: code || undefined,
        });
        current = {
          operation: review.operation,
          data: p.data,
          proof: p.proof,
          keyVersion: p.keyVersion,
        };
        setReview({ operation: current.operation, data: current.data });
        setProof(p.proof);
        setKeyVersion(p.keyVersion);
      }
      await recruitmentRequest("case-mutate", current);
      retain("");
      setReview(null);
      setProof("");
      setText("");
      setNotice("Case change recorded.");
      await open(String(review.data.caseId));
      await list();
    } catch (e) {
      if (e instanceof RecruitmentError && e.confirmed && !proof) {
        /* Retain UUID until recovery establishes the result. */
      }
      throw e;
    } finally {
      setPassword("");
      setCode("");
    }
  }
  async function stage() {
    if (!detail) return;
    const r = await recruitmentRequest<{
      changeId: string;
      payloadDigest: string;
    }>("case-stage", {
      caseId: detail.case.id,
      expectedRevision: detail.case.revision,
      operation: noteKind,
      payload: {
        text,
        recommendation: noteKind === "recommend" ? recommendation : "",
      },
    });
    prepare(noteKind, r);
  }
  return (
    <section className="recruitment-card">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h2>Applications and talent pool</h2>
          <p>
            Only submitted, currently authorized cases appear. Drafts remain
            private.
          </p>
        </div>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => void run(() => list())}
        >
          Refresh queue
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <div role="alert" className="border p-4">
          <p>
            Pending case request: {pending}. No new change can be created until
            resolved.
          </p>
          <Button disabled={busy} onClick={() => void run(recover)}>
            Recover original request status
          </Button>
        </div>
      )}
      {owner && s.user.ownerAal2Required && (
        <details>
          <summary>Owner assurance for private case reads</summary>
          <p>
            Confirm password and your verified authenticator before reading
            cases.
          </p>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Authenticator code
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
            />
          </label>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await recruitmentRequest("case-step-up", {
                  password,
                  factorId,
                  code,
                });
                setPassword("");
                setCode("");
                await list();
              })
            }
          >
            Verify session assurance
          </Button>
        </details>
      )}
      <form
        className="flex flex-wrap gap-3 my-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => list());
        }}
      >
        <label>
          Search authorized cases
          <input
            value={query}
            maxLength={160}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Case type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All</option>
            <option value="vacancy">Vacancy</option>
            <option value="talent_pool">Talent pool</option>
          </select>
        </label>
        <Button disabled={busy}>Search</Button>
      </form>
      {!enabled && (
        <p>
          Case processing is disabled. Public intake and rollout require
          separate approval.
        </p>
      )}
      <div className="grid gap-3">
        {rows.map((r) => (
          <button
            className="text-left border rounded-xl p-4 hover:bg-purple-50"
            key={r.id}
            disabled={busy}
            onClick={() => void run(() => open(r.id))}
          >
            <strong>
              {r.first_name} {r.last_name}
            </strong>
            <p className="break-all">{r.normalized_email}</p>
            <p>
              {r.kind} · {r.state}
            </p>
            <small className="break-all">{r.reference}</small>
          </button>
        ))}
      </div>
      {enabled && !rows.length && <p>No authorized submitted cases match.</p>}
      {more && (
        <Button disabled={busy} onClick={() => void run(() => list(true))}>
          Load more cases
        </Button>
      )}
      {owner && (
        <details className="my-5">
          <summary>Privacy governance lookup</summary>
          <p>
            Use an opaque case reference. No applicant answers are exposed by
            this lookup. Conflicts still apply.
          </p>
          <label>
            Case reference
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await recruitmentRequest<{
                  id: string;
                  reference: string;
                  state: string;
                  revision: number;
                  retentionDue: string;
                  holds: Detail["holds"];
                }>("privacy", undefined, "GET", true, undefined, { reference });
                setDetail({
                  case: {
                    id: r.id,
                    reference: r.reference,
                    state: r.state,
                    revision: r.revision,
                    kind: "privacy",
                    submitted_at: "",
                    retention_due_at: r.retentionDue,
                  },
                  email: "",
                  answers: null,
                  notes: [],
                  documents: [],
                  assignments: [],
                  eligibleStaff: [],
                  audit: [],
                  holds: r.holds,
                });
              })
            }
          >
            Open privacy metadata
          </Button>
        </details>
      )}
      {detail && (
        <article className="border-t pt-6 mt-6">
          <h2>Case {detail.case.reference}</h2>
          <p>
            {detail.email} · {detail.case.state}
          </p>
          <p>
            Retention due:{" "}
            {new Date(detail.case.retention_due_at).toLocaleString()}
          </p>
          {detail.answers !== null && (
            <details open>
              <summary>Submitted answers</summary>
              <dl className="whitespace-pre-wrap break-words">
                {Object.entries({
                  ...detail.answers?.fields,
                  ...detail.answers?.questions,
                }).map(([key, value]) => (
                  <div key={key} className="py-2 border-b">
                    <dt className="font-semibold">
                      {detail.form?.questions.find((q) => q.key === key)
                        ?.label || key.replace(/([A-Z])/g, " $1")}
                    </dt>
                    <dd>
                      {Array.isArray(value) ? value.join(", ") : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {detail.documents.map((d) => (
            <p key={d.id}>
              {d.name} · {d.state}{" "}
              {d.state === "clean" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(() => applicantDownload(d.id, d.size, true))
                  }
                >
                  Download PDF
                </Button>
              )}
            </p>
          ))}
          {detail.answers !== null && (
            <fieldset
              disabled={busy || Boolean(pending)}
              className="grid gap-4 mt-5"
            >
              <legend>Human review</legend>
              <label>
                Review type
                <select
                  value={noteKind}
                  onChange={(e) => setNoteKind(e.target.value)}
                >
                  <option value="note">Internal note</option>
                  <option value="clarify">
                    Ask applicant for clarification
                  </option>
                  <option value="recommend">Record recommendation</option>
                </select>
              </label>
              <label>
                {noteKind === "clarify"
                  ? "Message visible to applicant"
                  : "Private review note"}
                <textarea
                  maxLength={4000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              {noteKind === "recommend" && (
                <label>
                  Recommendation
                  <select
                    value={recommendation}
                    onChange={(e) => setRecommendation(e.target.value)}
                  >
                    <option value="progress">Progress</option>
                    <option value="do_not_progress">Do not progress</option>
                    <option value="hold">Hold</option>
                  </select>
                </label>
              )}
              <p>
                Recommendations are not final hiring or rejection decisions.
              </p>
              <Button disabled={!text.trim()} onClick={() => void run(stage)}>
                Review this change
              </Button>
            </fieldset>
          )}
          {(owner || s.user.role === "manager") && detail.answers !== null && (
            <fieldset
              disabled={busy || Boolean(pending)}
              className="grid gap-3 mt-6"
            >
              <legend>Scoped case assignment</legend>
              <label>
                Eligible staff
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Choose staff</option>
                  {detail.eligibleStaff.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email} · {u.role}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={!target}
                onClick={() => prepare("assign", { userId: target })}
              >
                Review assignment
              </Button>
              {detail.assignments
                .filter((a) => a.enabled)
                .map((a) => (
                  <Button
                    key={a.user_id}
                    variant="outline"
                    onClick={() =>
                      prepare("revoke_assignment", { userId: a.user_id })
                    }
                  >
                    Revoke{" "}
                    {detail.eligibleStaff.find((u) => u.id === a.user_id)
                      ?.email || a.user_id}
                  </Button>
                ))}
            </fieldset>
          )}
          {owner && (
            <fieldset
              disabled={busy || Boolean(pending)}
              className="grid gap-3 mt-6"
            >
              <legend>Privacy authority</legend>
              <label>
                Approval / evidence reference
                <input
                  value={evidence}
                  maxLength={160}
                  onChange={(e) => setEvidence(e.target.value)}
                />
              </label>
              <label>
                Review or extension date
                <input
                  type="datetime-local"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
              <label>
                Hold reason
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="rights_request">Rights request</option>
                  <option value="legal_obligation">Legal obligation</option>
                  <option value="dispute">Dispute</option>
                </select>
              </label>
              <Button
                disabled={!evidence || !until}
                onClick={() =>
                  prepare("hold", {
                    holdId: null,
                    release: false,
                    evidenceRef: evidence,
                    reasonCode: reason,
                    reviewAt: new Date(until).toISOString(),
                  })
                }
              >
                Review legal hold
              </Button>
              {detail.holds
                .filter((h) => !h.released_at)
                .map((h) => (
                  <Button
                    key={h.id}
                    variant="outline"
                    disabled={!evidence}
                    onClick={() =>
                      prepare("hold", {
                        holdId: h.id,
                        release: true,
                        evidenceRef: evidence,
                        reasonCode: reason,
                        reviewAt: h.review_at,
                      })
                    }
                  >
                    Review release of hold {h.id}
                  </Button>
                ))}
              {detail.answers !== null && (
                <Button
                  disabled={!evidence || !until}
                  onClick={() =>
                    prepare("extend_retention", {
                      until: new Date(until).toISOString(),
                      approvalReference: evidence,
                    })
                  }
                >
                  Review retention extension
                </Button>
              )}
              {["withdrawn", "expired"].includes(detail.case.state) && (
                <Button
                  disabled={!evidence || !until}
                  onClick={() =>
                    prepare("reapply", {
                      until: new Date(until).toISOString(),
                      approvalReference: evidence,
                    })
                  }
                >
                  Authorize controlled reapplication
                </Button>
              )}
              <label>
                Conflict staff UUID
                <input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>
              <Button
                disabled={!evidence || !target}
                onClick={() =>
                  prepare("resolve_conflict", {
                    userId: target,
                    approvalReference: evidence,
                  })
                }
              >
                Review independent conflict resolution
              </Button>
            </fieldset>
          )}
          <Button
            variant="outline"
            disabled={busy || Boolean(pending)}
            onClick={() => prepare("declare_conflict")}
          >
            Declare my conflict and stop access
          </Button>
          <h3 className="mt-6">Notes and messages</h3>
          {detail.notesHasMore && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void run(async () => {
                  const last = detail.notes.at(-1)!;
                  const page = await recruitmentRequest<{
                    items: Detail["notes"];
                    hasMore: boolean;
                  }>("case-messages", undefined, "GET", true, undefined, {
                    caseId: detail.case.id,
                    before: last.created_at,
                    beforeId: last.id,
                  });
                  setDetail({
                    ...detail,
                    notes: [...detail.notes, ...page.items],
                    notesHasMore: page.hasMore,
                  });
                })
              }
            >
              Load older case notes
            </Button>
          )}
          {detail.notes.map((n) => (
            <div key={n.id} className="border p-3 my-2">
              <p>
                {n.kind} {n.recommendation}
              </p>
              <p className="whitespace-pre-wrap">{n.content}</p>
            </div>
          ))}
          <details>
            <summary>Case audit history</summary>
            {detail.audit.map((e) => (
              <p key={e.id}>
                {e.action} · {new Date(e.created_at).toLocaleString()}
              </p>
            ))}
          </details>
        </article>
      )}
      <Dialog
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open && !pending && !busy) {
            setReview(null);
            setProof("");
            setPassword("");
            setCode("");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle>Confirm recruitment case change</DialogTitle>
          <DialogDescription>
            Check this action. A fresh password confirmation and required owner
            MFA authorize only this exact change.
          </DialogDescription>
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(review, null, 2)}
          </pre>
          {error && <p role="alert">{error}</p>}
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {owner && s.user.ownerAal2Required && (
            <>
              <label>
                Authenticator
                <select
                  value={factorId}
                  onChange={(e) => setFactorId(e.target.value)}
                >
                  {s.user.mfaFactors?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.friendlyName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Code
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            </>
          )}
          <Button
            disabled={busy || (!password && !proof)}
            onClick={() => void run(confirm)}
          >
            {proof ? "Retry original change" : "Confirm exact change"}
          </Button>
          {pending && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void run(recover)}
            >
              Check pending status
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
