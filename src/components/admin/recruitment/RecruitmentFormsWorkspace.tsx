import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  recruitmentRequest,
  retainRecruitmentRequest,
  clearRecruitmentRequest,
  pendingRecruitmentRequest,
} from "@/lib/recruitment-client";
import type {
  RecruitmentSnapshot,
  RecruitmentOperation,
} from "@/lib/recruitment-types";
import type { IntakeDefinition } from "@/lib/recruitment-applications";
type Form = {
  id: string;
  purpose: string;
  vacancy_id: string | null;
  version_id: string | null;
  privacy_notice_version: string;
  definition: IntakeDefinition;
  binding: { enabled: boolean; revision: number } | null;
};
type Workspace = {
  forms: Form[];
  settings: {
    ready: boolean;
    noticeVersion: string | null;
    evidenceDays: number | null;
    operationsApproved: boolean;
    vacancyIntake: boolean;
    talentPool: boolean;
    uploads: boolean;
    caseProcessing: boolean;
    email: boolean;
  };
  notices: { version: string; content: string }[];
};
export function RecruitmentFormsWorkspace({
  snapshot: s,
}: {
  snapshot: RecruitmentSnapshot;
}) {
  const [w, setWorkspace] = useState<Workspace | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [purpose, setPurpose] = useState("vacancy"),
    [vacancy, setVacancy] = useState(""),
    [version, setVersion] = useState(""),
    [notice, setNotice] = useState(""),
    [text, setText] = useState(""),
    [approval, setApproval] = useState(""),
    [days, setDays] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [review, setReview] = useState<{
      operation: RecruitmentOperation;
      data: Record<string, unknown>;
    } | null>(null),
    [proof, setProof] = useState("");
  async function load() {
    setWorkspace(await recruitmentRequest<Workspace>("forms"));
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to confirm.");
    } finally {
      setBusy(false);
    }
  }
  function prepare(
    operation: RecruitmentOperation,
    data: Record<string, unknown>,
  ) {
    if (pendingRecruitmentRequest())
      throw new Error(
        "Resolve the pending governance request in Security first.",
      );
    setReview({ operation, data: { requestId: crypto.randomUUID(), ...data } });
    setProof("");
  }
  async function confirm() {
    if (!review) return;
    retainRecruitmentRequest(String(review.data.requestId));
    try {
      let p = proof;
      if (!p) {
        p = (
          await recruitmentRequest<{ proof: string }>("reauthenticate", {
            ...review,
            password,
            factorId: s.user.mfaFactors?.[0]?.id || "",
            code,
          })
        ).proof;
        setProof(p);
      }
      await recruitmentRequest("mutate", { ...review, proof: p });
      clearRecruitmentRequest();
      setReview(null);
      setProof("");
      setMessage(
        "Owner governance change recorded. Rollout flags remain disabled.",
      );
      await load();
    } finally {
      setPassword("");
      setCode("");
    }
  }
  if (s.user.role !== "owner")
    return (
      <p>
        Form approval and privacy policy governance require recruitment owner
        authority.
      </p>
    );
  return (
    <section className="recruitment-card">
      <h2>Approved forms and intake governance</h2>
      <p>
        Forms are generated from reviewed templates and exact approved vacancy
        versions. No applicant PII is entered here. Approval does not enable
        public intake.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {w && (
        <>
          <p>
            Operational readiness:{" "}
            {w.settings.ready ? "recorded" : "incomplete"} · Legal evidence
            retention:{" "}
            {w.settings.evidenceDays === null
              ? "unapproved"
              : `${w.settings.evidenceDays} days`}
          </p>
          <p>
            Vacancy intake: {String(w.settings.vacancyIntake)} · Talent pool:{" "}
            {String(w.settings.talentPool)} · Uploads:{" "}
            {String(w.settings.uploads)} · Processing:{" "}
            {String(w.settings.caseProcessing)} · Email:{" "}
            {String(w.settings.email)}
          </p>
          <details>
            <summary>Record an approved privacy notice</summary>
            <p>
              Enter the actual approved notice, approval reference and legally
              authorized evidence retention. No 90-day default is assumed.
            </p>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () =>
                  prepare("intake_policy", {
                    noticeVersion: notice,
                    noticeText: text,
                    approvalReference: approval,
                    evidenceDays: Number(days),
                  }),
                );
              }}
            >
              <label>
                Unique notice version
                <input
                  required
                  maxLength={120}
                  value={notice}
                  onChange={(e) => setNotice(e.target.value)}
                />
              </label>
              <label>
                Approved notice text
                <textarea
                  required
                  minLength={100}
                  maxLength={20000}
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <label>
                Approval reference
                <input
                  required
                  value={approval}
                  maxLength={160}
                  onChange={(e) => setApproval(e.target.value)}
                />
              </label>
              <label>
                Approved evidence retention days
                <input
                  required
                  type="number"
                  min={1}
                  max={3650}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </label>
              <Button disabled={busy || Boolean(review)}>
                Review policy approval
              </Button>
            </form>
          </details>
          <form
            className="grid gap-4 my-6"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () =>
                prepare("intake_form_approve", {
                  purpose,
                  vacancyId: purpose === "vacancy" ? vacancy : null,
                  versionId: purpose === "vacancy" ? version : null,
                  noticeVersion: notice || w.settings.noticeVersion,
                }),
              );
            }}
          >
            <h3>Approve an immutable application form</h3>
            <label>
              Purpose
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              >
                <option value="vacancy">Vacancy</option>
                <option value="talent_pool">Talent pool</option>
              </select>
            </label>
            {purpose === "vacancy" && (
              <>
                <label>
                  Vacancy UUID
                  <input
                    required
                    value={vacancy}
                    onChange={(e) => setVacancy(e.target.value)}
                  />
                </label>
                <label>
                  Approved vacancy version UUID
                  <input
                    required
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              Approved privacy notice
              <select
                required
                value={notice || w.settings.noticeVersion || ""}
                onChange={(e) => setNotice(e.target.value)}
              >
                {w.notices.map((n) => (
                  <option key={n.version} value={n.version}>
                    {n.version}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={busy || Boolean(review) || !w.notices.length}>
              Review form approval
            </Button>
          </form>
          {w.forms.map((f) => (
            <article className="border rounded p-4 my-4" key={f.id}>
              <h3>
                {f.purpose} · {f.definition.category || "All roles"}
              </h3>
              <p className="break-all">Form: {f.id}</p>
              <p className="break-all">
                Vacancy version: {f.version_id || "Not applicable"}
              </p>
              <p>
                Notice: {f.privacy_notice_version} · Binding:{" "}
                {f.binding?.enabled ? "enabled" : "disabled"}
              </p>
              <details>
                <summary>
                  Immutable approved fields, questions and documents
                </summary>
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(f.definition, null, 2)}
                </pre>
              </details>
              <Button
                disabled={busy || Boolean(review)}
                variant="outline"
                onClick={() =>
                  void run(async () =>
                    prepare("intake_form_bind", {
                      formId: f.id,
                      expectedRevision: f.binding?.revision ?? -1,
                      enabled: !f.binding?.enabled,
                    }),
                  )
                }
              >
                Review {f.binding?.enabled ? "disable" : "enable"} form binding
              </Button>
            </article>
          ))}
        </>
      )}
      {review && (
        <div className="border p-5 grid gap-4">
          <h3>Confirm exact owner action</h3>
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(review, null, 2)}
          </pre>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {s.user.ownerAal2Required && (
            <label>
              Authenticator code
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          <Button
            disabled={busy || (!proof && !password)}
            onClick={() => void run(confirm)}
          >
            {proof ? "Retry original action" : "Confirm exact action"}
          </Button>
          {!pendingRecruitmentRequest() && (
            <Button variant="outline" onClick={() => setReview(null)}>
              Cancel review
            </Button>
          )}
          <p>
            Resolve uncertain governance requests in Security and governance
            after reloading. Only the opaque request ID is stored by the
            browser.
          </p>
        </div>
      )}
    </section>
  );
}
