import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { intakeAnswersSchema } from "@/lib/recruitment-applications";
import {
  applicantDownload,
  applicantPending,
  applicantRequest,
  ApplicantError,
  retainApplicant,
  uploadApplicant,
  type Answers,
  type ApplicantCase,
  type PublicForm,
} from "@/lib/recruitment-applicant-client";
import "./recruitment-admin.css";
const label = (s: string) =>
  s
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/^./, (v) => v.toUpperCase());
const empty: Answers = { fields: {}, questions: {} };
export default function RecruitmentApplicant() {
  const location = useLocation(),
    { slug } = useParams(),
    verify = location.pathname === "/recruitment/verify",
    recover = location.pathname === "/recruitment/recover",
    workspace = location.pathname === "/recruitment/application",
    pool = location.pathname === "/recruitment/talent-pool";
  const [form, setForm] = useState<PublicForm | null>(null),
    [c, setCase] = useState<ApplicantCase | null>(null),
    [answers, setAnswers] = useState<Answers>(empty),
    [step, setStep] = useState(0),
    [email, setEmail] = useState(""),
    [reference, setReference] = useState(""),
    [roleSlug, setRoleSlug] = useState(slug || ""),
    [purpose, setPurpose] = useState(pool ? "talent_pool" : "vacancy"),
    [adult, setAdult] = useState(false),
    [consent, setConsent] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [reply, setReply] = useState(""),
    [pending, setPending] = useState(applicantPending());
  const proof = useRef<{ intentReference: string; proof: string } | null>(null),
    command = useRef<object | null>(null),
    uncertain = useRef(Boolean(applicantPending())),
    heading = useRef<HTMLHeadingElement>(null);
  const load = async () => {
    const p = applicantPending(),
      r = await applicantRequest<ApplicantCase>(
        "applicant",
        undefined,
        undefined,
        p ? { requestId: p.requestId } : undefined,
      );
    setCase(r);
    if (r.slug) setRoleSlug(r.slug);
    setAnswers(r.answers || empty);
    if (p && r.request?.state === "committed") {
      retainApplicant(null);
      setPending(null);
      command.current = null;
      uncertain.current = false;
      setMessage("The previous request was confirmed.");
    } else setPending(p);
  };
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (verify) {
          const h = new URLSearchParams(window.location.hash.slice(1));
          const intentReference = h.get("intent") || "",
            token = h.get("proof") || "";
          window.history.replaceState(null, "", "/recruitment/verify");
          if (
            !/^[0-9a-f-]{36}$/.test(intentReference) ||
            !/^[0-9a-f]{64}$/.test(token)
          )
            throw new ApplicantError(
              "verification_link_missing_or_expired",
              true,
            );
          proof.current = { intentReference, proof: token };
          const r = await applicantRequest<{
            maskedEmail: string;
            purpose: string;
          }>("email", { action: "inspect", ...proof.current });
          if (active)
            setMessage(
              `Confirm the full email address for ${r.maskedEmail}. Purpose: ${label(r.purpose)}.`,
            );
        } else if (workspace) await load();
        else if (recover) {
          const p = await applicantRequest<{
            privacyNoticeVersion: string;
            privacyNotice: string;
          }>("policy");
          if (active)
            setForm({
              ...p,
              formId: "",
              definition: null,
              title: "Recover your application",
              purpose: "recovery",
            } as unknown as PublicForm);
        } else {
          const f = await applicantRequest<PublicForm>(
            "form",
            undefined,
            undefined,
            {
              purpose: pool ? "talent_pool" : "vacancy",
              ...(slug ? { slug } : {}),
            },
          );
          if (active) setForm(f);
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to open recruitment.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      proof.current = null;
    };
  }, [verify, recover, workspace, pool, slug]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setPending(applicantPending());
      setBusy(false);
    }
  }
  async function mutate(action: string, data: object = {}) {
    if (!c) throw new Error("Open your case first.");
    if (applicantPending() && !command.current)
      throw new Error("Resolve the pending request before continuing.");
    const p = applicantPending() || { requestId: crypto.randomUUID(), action };
    if (p.action !== action)
      throw new Error("Retry the pending operation first.");
    const body = command.current || {
      action,
      ...data,
      requestId: p.requestId,
      expectedRevision: c.revision,
    };
    command.current = body;
    retainApplicant(p);
    setPending(p);
    try {
      await applicantRequest("applicant", body);
      retainApplicant(null);
      setPending(null);
      command.current = null;
      uncertain.current = false;
      await load();
      setMessage(`${label(action)} confirmed.`);
    } catch (e) {
      if (e instanceof ApplicantError && e.confirmed && !uncertain.current) {
        retainApplicant(null);
        setPending(null);
        command.current = null;
      } else if (!(e instanceof ApplicantError) || !e.confirmed)
        uncertain.current = true;
      throw e;
    }
  }
  async function resolvePending() {
    if (!pending) return;
    await load();
    const latest = await applicantRequest<ApplicantCase>(
      "applicant",
      undefined,
      undefined,
      { requestId: pending.requestId },
    );
    if (latest.request) {
      retainApplicant(null);
      setPending(null);
      command.current = null;
      uncertain.current = false;
      return;
    }
    if (command.current) {
      await mutate(pending.action);
      return;
    }
    if (
      [
        "save",
        "rebase",
        "submit",
        "withdraw",
        "request_deletion",
        "renew",
        "reserve",
        "reply",
        "reapply",
      ].includes(pending.action)
    ) {
      await applicantRequest("applicant", {
        action: "cancel_pending",
        requestId: crypto.randomUUID(),
        pendingRequestId: pending.requestId,
        operation: pending.action,
      });
      retainApplicant(null);
      setPending(null);
      command.current = null;
      uncertain.current = false;
      await load();
      setMessage(
        "Previous unsent or uncertain draft request resolved. Your server draft is loaded.",
      );
    } else {
      setError(
        "The operation is not yet confirmed. Retry status; do not create a replacement request. Recover your case or contact recruitment with your case reference if this persists.",
      );
    }
  }
  async function start(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (verify) {
        if (!proof.current) throw new Error("Request a new verification link.");
        await applicantRequest("email", {
          action: "exchange",
          ...proof.current,
          confirmedEmail: email,
          confirmation: true,
        });
        proof.current = null;
        window.location.replace("/recruitment/application");
      } else {
        await applicantRequest("email", {
          action: recover ? "recover" : "begin",
          requestId: crypto.randomUUID(),
          purpose: recover ? purpose : pool ? "talent_pool" : "vacancy",
          slug: recover ? roleSlug : slug || "",
          email,
          noticeVersion: form?.privacyNoticeVersion,
          privacyAcknowledged: true,
          adultConfirmed: true,
          caseReference: recover ? reference : "",
        });
        setMessage(
          "If your request is eligible, a verification email will arrive shortly. Check your inbox and spam folder. Links expire after 15 minutes.",
        );
      }
    });
  }
  const change = (
    area: "fields" | "questions",
    key: string,
    v: string | boolean | string[] | number,
  ) => setAnswers((a) => ({ ...a, [area]: { ...a[area], [key]: v } }));
  const save = () =>
    mutate("save", { formId: c!.formId, answersPatch: answers });
  const fields = c?.definition?.fields.filter((f) =>
    step === 0
      ? ["firstName", "lastName", "phone", "location", "availability"].includes(
          f.key,
        )
      : ![
          "firstName",
          "lastName",
          "phone",
          "location",
          "availability",
          "adultConfirmed",
          "privacyAcknowledged",
        ].includes(f.key),
  );
  return (
    <div className="recruitment-shell">
      <Helmet>
        <title>Private recruitment | Viva Tutorials</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <header>
        <a href="/">
          <img
            src="/viva-tutorials-logo.png"
            width="112"
            height="56"
            alt="Viva Tutorials"
          />
        </a>
        <span>Recruitment</span>
        <a href="/careers">Careers</a>
      </header>
      <main id="main-content" className="recruitment-main">
        <section className="recruitment-card max-w-3xl mx-auto">
          <p className="recruitment-eyebrow">Viva Tutorials · Your next step</p>
          <h1 ref={heading} tabIndex={-1}>
            {workspace
              ? "Your application"
              : verify
                ? "Verify your email"
                : form?.title || "Recruitment"}
          </h1>
          {loading && <p role="status">Opening secure recruitment…</p>}
          {error && (
            <p role="alert" className="text-red-800">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          {!loading && !workspace && (form || verify) && (
            <form onSubmit={start} className="grid gap-5">
              {form?.privacyNotice && (
                <details>
                  <summary>
                    Recruitment privacy notice · {form.privacyNoticeVersion}
                  </summary>
                  <p className="whitespace-pre-wrap">{form.privacyNotice}</p>
                </details>
              )}
              {recover && (
                <>
                  <label>
                    Application type
                    <select
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                    >
                      <option value="vacancy">Vacancy application</option>
                      <option value="talent_pool">Talent pool</option>
                    </select>
                  </label>
                  {purpose === "vacancy" && (
                    <label>
                      Vacancy URL slug
                      <input
                        required
                        maxLength={180}
                        value={roleSlug}
                        onChange={(e) => setRoleSlug(e.target.value)}
                        placeholder="From the Careers vacancy address"
                      />
                    </label>
                  )}
                  <label>
                    Case reference (optional)
                    <input
                      value={reference}
                      maxLength={36}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </label>
                </>
              )}
              <label>
                Email address
                <input
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {!verify && (
                <>
                  <label className="flex gap-3">
                    <input
                      required
                      type="checkbox"
                      checked={adult}
                      onChange={(e) => setAdult(e.target.checked)}
                    />
                    I confirm that I am 18 or older.
                  </label>
                  <label className="flex gap-3">
                    <input
                      required
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    I have read the recruitment privacy notice.
                  </label>
                  <p>
                    No account or password is needed. Verify your email before
                    entering your application or uploading documents.
                  </p>
                </>
              )}
              <Button disabled={busy || (!verify && (!adult || !consent))}>
                {verify
                  ? "Confirm this email and continue"
                  : recover
                    ? "Send recovery link"
                    : "Send verification link"}
              </Button>
            </form>
          )}
          {workspace && c && (
            <>
              <p>
                Case reference:{" "}
                <strong className="break-all">{c.caseReference}</strong>
              </p>
              <p>
                Status: {label(c.state)} · Retention due:{" "}
                {new Date(c.expiresAt).toLocaleDateString()}
              </p>
              <div className="flex flex-wrap gap-3 mb-5">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(load)}
                >
                  Refresh status
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await applicantRequest("applicant", undefined, "DELETE");
                      window.location.replace("/recruitment/recover");
                    })
                  }
                >
                  Sign out
                </Button>
              </div>
              {pending && (
                <div role="alert" className="border p-4">
                  <p>
                    A {label(pending.action)} request has an uncertain result.
                    Resolve it before another change.
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() => void run(resolvePending)}
                  >
                    Check or retry original request
                  </Button>
                </div>
              )}
              {c.receipt && (
                <div className="bg-purple-50 p-4 rounded">
                  <h2>Application received</h2>
                  <p>
                    Receipt:{" "}
                    <strong className="break-all">{c.receipt.receipt}</strong>
                  </p>
                  <p>
                    This confirms receipt. Human recruitment staff review
                    applications; no hiring decision has been made.
                  </p>
                  <Button variant="outline" onClick={() => window.print()}>
                    Print receipt
                  </Button>
                </div>
              )}
              {c.state === "draft" && c.definition && (
                <>
                  <nav
                    aria-label="Application progress"
                    className="flex flex-wrap gap-2 my-5"
                  >
                    {[
                      "About you",
                      "Role experience",
                      "Documents",
                      "Review",
                    ].map((n, i) => (
                      <Button
                        key={n}
                        variant={step === i ? "default" : "outline"}
                        aria-current={step === i ? "step" : undefined}
                        disabled={busy}
                        onClick={() => setStep(i)}
                      >
                        {i + 1}. {n}
                      </Button>
                    ))}
                  </nav>
                  <p>
                    Step {step + 1} of 4. Save your draft before leaving. Drafts
                    expire 14 days after qualifying activity.
                  </p>
                  <fieldset
                    disabled={busy || Boolean(pending)}
                    className="grid gap-5"
                  >
                    <legend className="sr-only">
                      {
                        ["About you", "Role experience", "Documents", "Review"][
                          step
                        ]
                      }
                    </legend>
                    {step < 2 && (
                      <>
                        {fields?.map((f) => (
                          <label key={f.key}>
                            {label(f.key)}
                            {f.required ? " *" : " (optional)"}
                            {f.type === "text" ? (
                              <textarea
                                rows={f.maxLength && f.maxLength > 200 ? 4 : 2}
                                maxLength={f.maxLength || 2000}
                                value={String(answers.fields[f.key] || "")}
                                onChange={(e) =>
                                  change("fields", f.key, e.target.value)
                                }
                              />
                            ) : (
                              <select
                                multiple
                                aria-label={label(f.key)}
                                value={
                                  (answers.fields[f.key] as string[]) || []
                                }
                                onChange={(e) =>
                                  change(
                                    "fields",
                                    f.key,
                                    Array.from(
                                      e.target.selectedOptions,
                                      (x) => x.value,
                                    ),
                                  )
                                }
                              >
                                {f.options.map((o) => (
                                  <option key={o} value={o}>
                                    {label(o)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </label>
                        ))}
                        {step === 1 &&
                          c.definition.questions.map((q) => (
                            <label key={q.key}>
                              {q.label}
                              {q.required ? " *" : ""}
                              {q.type === "text" ? (
                                <textarea
                                  maxLength={4000}
                                  value={String(answers.questions[q.key] ?? "")}
                                  onChange={(e) =>
                                    change("questions", q.key, e.target.value)
                                  }
                                />
                              ) : q.type === "yes_no" ? (
                                <select
                                  value={
                                    answers.questions[q.key] === undefined
                                      ? ""
                                      : String(answers.questions[q.key])
                                  }
                                  onChange={(e) => {
                                    if (e.target.value)
                                      change(
                                        "questions",
                                        q.key,
                                        e.target.value === "true",
                                      );
                                    else
                                      setAnswers((a) => ({
                                        ...a,
                                        questions: Object.fromEntries(
                                          Object.entries(a.questions).filter(
                                            ([k]) => k !== q.key,
                                          ),
                                        ),
                                      }));
                                  }}
                                >
                                  <option value="">Choose</option>
                                  <option value="true">Yes</option>
                                  <option value="false">No</option>
                                </select>
                              ) : (
                                <input
                                  type="number"
                                  value={String(answers.questions[q.key] ?? "")}
                                  onChange={(e) => {
                                    if (e.target.value !== "")
                                      change(
                                        "questions",
                                        q.key,
                                        Number(e.target.value),
                                      );
                                  }}
                                />
                              )}
                            </label>
                          ))}
                      </>
                    )}
                    {step === 2 && (
                      <>
                        <p>
                          PDF only · 10 MiB per file · 8 files maximum · 40 MiB
                          total. Password-protected PDFs are not accepted.
                          Submission requires verified clean documents.
                        </p>
                        {c.definition.requiredDocuments.length === 0 && (
                          <p>No documents are required for this form.</p>
                        )}
                        {c.definition.requiredDocuments.map((q) => {
                          const d = c.documents.find(
                            (x) =>
                              x.key === q.key &&
                              x.state !== "deleted" &&
                              x.state !== "discarded",
                          );
                          return (
                            <div key={q.key} className="border rounded p-4">
                              <h2>
                                {q.label}
                                {q.required ? " *" : " (optional)"}
                              </h2>
                              {d ? (
                                <>
                                  <p>
                                    {d.name} · {label(d.state)}
                                  </p>
                                  {d.state === "clean" && (
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        void run(() =>
                                          applicantDownload(d.id, d.size),
                                        )
                                      }
                                    >
                                      Download PDF
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    onClick={() =>
                                      void run(async () => {
                                        await applicantRequest("documents", {
                                          action: "discard",
                                          documentId: d.id,
                                          generation: d.generation,
                                        });
                                        await load();
                                      })
                                    }
                                  >
                                    Remove document
                                  </Button>
                                  {["uploading", "reserved"].includes(
                                    d.state,
                                  ) && (
                                    <p>
                                      If upload was interrupted, remove it and
                                      upload the original file again.
                                    </p>
                                  )}
                                </>
                              ) : (
                                <label>
                                  Choose PDF
                                  <input
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file)
                                        void run(async () => {
                                          await uploadApplicant(
                                            file,
                                            q.key,
                                            setMessage,
                                          );
                                          await load();
                                        });
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                    {step === 3 && (
                      <>
                        <h2>Review your application</h2>
                        <dl>
                          {Object.entries({
                            ...answers.fields,
                            ...answers.questions,
                          }).map(([k, v]) => (
                            <div className="py-2 border-b" key={k}>
                              <dt className="font-semibold">{label(k)}</dt>
                              <dd className="whitespace-pre-wrap break-words">
                                {Array.isArray(v) ? v.join(", ") : String(v)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <details>
                          <summary>Privacy notice · {c.noticeVersion}</summary>
                          <p className="whitespace-pre-wrap">{c.notice}</p>
                        </details>
                        <label className="flex gap-3">
                          <input
                            type="checkbox"
                            checked={answers.fields.adultConfirmed === true}
                            onChange={(e) =>
                              change(
                                "fields",
                                "adultConfirmed",
                                e.target.checked,
                              )
                            }
                          />
                          I confirm that I am 18 or older.
                        </label>
                        <label className="flex gap-3">
                          <input
                            type="checkbox"
                            checked={
                              answers.fields.privacyAcknowledged === true
                            }
                            onChange={(e) =>
                              change(
                                "fields",
                                "privacyAcknowledged",
                                e.target.checked,
                              )
                            }
                          />
                          I have read the privacy notice.
                        </label>
                        {c.purpose === "talent_pool" && (
                          <label className="flex gap-3">
                            <input
                              type="checkbox"
                              checked={consent}
                              onChange={(e) => setConsent(e.target.checked)}
                            />
                            I affirmatively consent to talent-pool registration
                            for 12 months. I can withdraw this consent.
                          </label>
                        )}
                        <Button
                          onClick={() =>
                            void run(async () => {
                              const valid = intakeAnswersSchema(
                                c.definition!,
                                true,
                              ).safeParse(answers);
                              if (!valid.success)
                                throw new Error(
                                  valid.error.issues
                                    .map(
                                      (i) =>
                                        `${label(String(i.path.at(-1) || "form"))}: ${i.message}`,
                                    )
                                    .join("; "),
                                );
                              await save();
                              setMessage(
                                "Draft saved. Review the saved answers, then confirm submission.",
                              );
                            })
                          }
                        >
                          Validate and save final answers
                        </Button>
                        <Button
                          disabled={
                            !answers.fields.adultConfirmed ||
                            !answers.fields.privacyAcknowledged ||
                            (c.purpose === "talent_pool" && !consent)
                          }
                          onClick={() =>
                            void run(async () => {
                              if (
                                JSON.stringify(c.answers) !==
                                JSON.stringify(answers)
                              )
                                throw new Error(
                                  "Save final answers before submitting.",
                                );
                              if (
                                !window.confirm(
                                  "Submit your saved application? The submission cannot be edited.",
                                )
                              )
                                return;
                              await mutate("submit", {
                                formId: c.formId,
                                privacyAcknowledged: true,
                                poolConsent:
                                  c.purpose === "talent_pool" && consent,
                              });
                            })
                          }
                        >
                          Confirm and submit saved application
                        </Button>
                      </>
                    )}
                    {step < 3 && (
                      <Button
                        onClick={() =>
                          void run(async () => {
                            await save();
                            setStep((s) => Math.min(s + 1, 3));
                          })
                        }
                      >
                        Save draft and continue
                      </Button>
                    )}
                  </fieldset>
                  <details className="my-5">
                    <summary>Published requirements changed?</summary>
                    <p>
                      Your saved form will never change silently. Load and
                      review current requirements before rebasing. Incompatible
                      answers and documents will need replacement.
                    </p>
                    <Button
                      disabled={busy || Boolean(pending)}
                      variant="outline"
                      onClick={() =>
                        void run(async () => {
                          const f = await applicantRequest<PublicForm>(
                            "form",
                            undefined,
                            undefined,
                            {
                              purpose: c.purpose,
                              ...(roleSlug ? { slug: roleSlug } : {}),
                            },
                          );
                          setForm(f);
                        })
                      }
                    >
                      Load current form
                    </Button>
                    {c.purpose === "vacancy" && (
                      <label>
                        Vacancy slug
                        <input
                          value={roleSlug}
                          onChange={(e) => setRoleSlug(e.target.value)}
                        />
                      </label>
                    )}
                    {form && (
                      <>
                        <pre className="whitespace-pre-wrap text-sm">
                          {JSON.stringify(form.definition, null, 2)}
                        </pre>
                        <p className="whitespace-pre-wrap">
                          {form.privacyNotice}
                        </p>
                        <Button
                          disabled={busy || Boolean(pending)}
                          onClick={() =>
                            void run(async () => {
                              if (
                                window.confirm(
                                  "I accept the current notice and explicitly rebase my draft.",
                                )
                              )
                                await mutate("rebase", {
                                  formId: form.formId,
                                  noticeVersion: form.privacyNoticeVersion,
                                  privacyAcknowledged: true,
                                });
                            })
                          }
                        >
                          Accept notice and rebase
                        </Button>
                      </>
                    )}
                  </details>
                </>
              )}
              {c.reapplicationAllowed && (
                <details className="my-5">
                  <summary>Owner-authorized reapplication</summary>
                  <p>
                    Recover this case using a fresh verification email, then
                    review the current form. Reapplication creates a separate
                    draft and preserves the prior case until its retention date.
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        setForm(
                          await applicantRequest<PublicForm>(
                            "form",
                            undefined,
                            undefined,
                            { purpose: "vacancy", slug: c.slug || roleSlug },
                          ),
                        ),
                      )
                    }
                  >
                    Review current requirements
                  </Button>
                  {form && (
                    <>
                      <p>{form.title}</p>
                      <p className="whitespace-pre-wrap">
                        {form.privacyNotice}
                      </p>
                      <Button
                        disabled={busy || Boolean(pending)}
                        onClick={() =>
                          void run(async () => {
                            if (
                              window.confirm(
                                "I accept the current privacy notice and want to create a new authorized application draft.",
                              )
                            )
                              await mutate("reapply", {
                                formId: form.formId,
                                noticeVersion: form.privacyNoticeVersion,
                                consent: true,
                              });
                          })
                        }
                      >
                        Accept notice and begin authorized reapplication
                      </Button>
                    </>
                  )}
                </details>
              )}
              {c.messages.length > 0 && (
                <section>
                  <h2>Recruitment messages</h2>
                  {c.messagesHasMore && (
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() =>
                        void run(async () => {
                          const last = c.messages.at(-1)!;
                          const page = await applicantRequest<{
                            items: ApplicantCase["messages"];
                            hasMore: boolean;
                          }>("messages", undefined, undefined, {
                            before: last.createdAt,
                            beforeId: last.id,
                          });
                          setCase({
                            ...c,
                            messages: [...c.messages, ...page.items],
                            messagesHasMore: page.hasMore,
                          });
                        })
                      }
                    >
                      Load older recruitment messages
                    </Button>
                  )}
                  {c.messages.map((m) => (
                    <article className="border p-4 my-3" key={m.id}>
                      <p>
                        {label(m.kind)} ·{" "}
                        {new Date(m.createdAt).toLocaleDateString()}
                      </p>
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      {m.kind === "clarify" && (
                        <>
                          <label>
                            Reply
                            <textarea
                              maxLength={4000}
                              value={reply}
                              onChange={(e) => setReply(e.target.value)}
                            />
                          </label>
                          <Button
                            disabled={busy || !reply.trim() || Boolean(pending)}
                            onClick={() =>
                              void run(async () => {
                                await mutate("reply", {
                                  replyTo: m.id,
                                  text: reply,
                                });
                                setReply("");
                              })
                            }
                          >
                            Send reply
                          </Button>
                        </>
                      )}
                    </article>
                  ))}
                </section>
              )}
              {c.purpose === "talent_pool" && c.state !== "draft" && (
                <details>
                  <summary>Renew talent-pool consent</summary>
                  <p>
                    First recover your case with a fresh email verification
                    link. Read the current notice and renew within 15 minutes.
                  </p>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() =>
                      void run(async () => {
                        setForm(
                          await applicantRequest<PublicForm>(
                            "form",
                            undefined,
                            undefined,
                            { purpose: "talent_pool" },
                          ),
                        );
                      })
                    }
                  >
                    Read current notice
                  </Button>
                  {form && (
                    <>
                      <p className="whitespace-pre-wrap">
                        {form.privacyNotice}
                      </p>
                      <label>
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                        />
                        I consent to another 12 months.
                      </label>
                      <Button
                        disabled={!consent || busy || Boolean(pending)}
                        onClick={() =>
                          void run(() =>
                            mutate("renew", {
                              formId: form.formId,
                              noticeVersion: form.privacyNoticeVersion,
                              consent: true,
                            }),
                          )
                        }
                      >
                        Renew consent
                      </Button>
                    </>
                  )}
                </details>
              )}
              <details className="my-5">
                <summary>Privacy and withdrawal</summary>
                <p>
                  Withdrawal stops review and schedules deletion after 30 days,
                  subject to authorized holds. You may request earlier erasure.
                  Legal obligations can require retention.
                </p>
                {[
                  "draft",
                  "submitted",
                  "under_review",
                  "recommendation_recorded",
                ].includes(c.state) && (
                  <Button
                    variant="outline"
                    disabled={busy || Boolean(pending)}
                    onClick={() =>
                      void run(async () => {
                        if (
                          window.confirm(
                            "Withdraw this application or talent-pool consent?",
                          )
                        )
                          await mutate("withdraw");
                      })
                    }
                  >
                    Withdraw
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={busy || Boolean(pending) || c.state === "purged"}
                  onClick={() =>
                    void run(async () => {
                      if (
                        window.confirm(
                          "Request deletion? This may irreversibly erase your case after applicable checks.",
                        )
                      )
                        await mutate("request_deletion");
                    })
                  }
                >
                  Request deletion
                </Button>
              </details>
            </>
          )}
          {!loading && workspace && !c && (
            <a href="/recruitment/recover">
              Verify your email to recover your application
            </a>
          )}
          <p className="recruitment-note mt-6">
            Avoid national ID numbers, banking information, health information
            and unrelated sensitive data. This workspace never creates teaching
            or administrative access.
          </p>
        </section>
      </main>
    </div>
  );
}
