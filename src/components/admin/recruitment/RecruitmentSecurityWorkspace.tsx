import { useEffect, useRef, useState } from "react";
import {
  recruitmentRequest,
  RecruitmentError,
  pendingRecruitmentRequest,
  retainRecruitmentRequest,
  clearRecruitmentRequest,
} from "@/lib/recruitment-client";
import type {
  RecruitmentSnapshot,
  RecruitmentOperation,
  RecruitmentChoices,
} from "@/lib/recruitment-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { VivaLoader } from "@/components/VivaLoader";

export function RecruitmentSecurityWorkspace({
  snapshot: s,
  reload,
}: {
  snapshot: RecruitmentSnapshot;
  reload: () => Promise<void>;
}) {
  const owner = s.user.role === "owner";
  const [recovering, setRecovering] = useState(
    Boolean(pendingRecruitmentRequest()),
  );
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState(s.user.mfaFactors?.[0]?.id || "");
  const [review, setReview] = useState<{
    operation: RecruitmentOperation;
    data: RecruitmentChoices;
  } | null>(null);
  const [proof, setProof] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [selectedStaff, setSelectedStaff] = useState("new");
  const [grantTarget, setGrantTarget] = useState("");
  const [grantScope, setGrantScope] = useState("");
  useEffect(() => {
    let active = true;
    const id = pendingRecruitmentRequest();
    if (!id) return;
    setRecovering(true);
    recruitmentRequest<{
      operation: RecruitmentOperation;
      data: RecruitmentChoices;
      completed: boolean;
    }>("recover", undefined, "GET", true, id)
      .then((saved) => {
        if (!active) return;
        if (saved.completed) {
          clearRecruitmentRequest();
          setNotice(
            "The pending security change was already recorded. No operation was repeated.",
          );
        } else {
          setReview({ operation: saved.operation, data: saved.data });
          setUncertain(true);
          setNotice(
            "Pending request restored. Review and authenticate to retry the original request.",
          );
        }
        setRecovering(false);
      })
      .catch(() => {
        if (active)
          setError(
            "A pending request needs recovery. Sign in as its authorized actor or contact an owner before starting another change.",
          );
      });
    return () => {
      active = false;
    };
  }, [s.user.id]);
  function prepare(
    event: React.FormEvent<HTMLFormElement>,
    operation: RecruitmentOperation,
  ) {
    event.preventDefault();
    if (recovering || pendingRecruitmentRequest()) return;
    returnFocus.current = event.currentTarget.querySelector<HTMLElement>(
      'button[type="submit"]',
    );
    setError("");
    setNotice("");
    const f = new FormData(event.currentTarget);
    const data: RecruitmentChoices = { requestId: crypto.randomUUID() };
    if (operation === "settings")
      Object.assign(data, {
        expectedRevision: s.settings.revision,
        staffConsoleEnabled: f.get("console") === "yes",
        accessGuardsEnabled: f.get("guards") === "yes",
        privacyPolicyVersion: String(f.get("policy") || ""),
      });
    if (operation === "scope_create")
      Object.assign(data, {
        kind: String(f.get("kind")),
        label: String(f.get("label")),
      });
    if (operation === "staff_grant") {
      const target =
        selectedStaff === "new" ? String(f.get("userId")) : selectedStaff;
      const existing = s.staff.find((x) => x.user_id === target);
      Object.assign(data, {
        userId: target,
        role: String(f.get("role")),
        enabled: f.get("enabled") === "yes",
        expectedRevision: existing?.revision ?? -1,
      });
    }
    if (operation === "scope_grant") {
      const existing = s.grants.find(
        (x) => x.user_id === grantTarget && x.scope_id === grantScope,
      );
      Object.assign(data, {
        userId: grantTarget,
        scopeId: grantScope,
        enabled: f.get("enabled") === "yes",
        expectedRevision: existing?.revision ?? -1,
      });
    }
    setReview({ operation, data });
    setProof("");
    setUncertain(false);
  }
  async function confirm() {
    if (!review || busy) return;
    setBusy(true);
    setError("");
    try {
      retainRecruitmentRequest(review.data.requestId);
      let fresh = proof;
      if (!fresh) {
        fresh = (
          await recruitmentRequest<{ proof: string }>("reauthenticate", {
            ...review,
            password,
            factorId,
            code,
          })
        ).proof;
        setProof(fresh);
      }
      await recruitmentRequest("mutate", { ...review, proof: fresh });
      clearRecruitmentRequest();
      setReview(null);
      setProof("");
      setUncertain(false);
      setNotice("Security change recorded.");
      await reload().catch(() =>
        setError(
          "The change was recorded, but the refreshed view is unavailable. Refresh before making another change.",
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The change could not be confirmed.",
      );
      if (e instanceof RecruitmentError && e.confirmed) {
        setProof("");
        // A rejection of this retry cannot establish whether an earlier uncertain attempt committed.
        if (!uncertain) clearRecruitmentRequest();
        setUncertain(uncertain);
      } else setUncertain(true);
    } finally {
      setPassword("");
      setCode("");
      setBusy(false);
    }
  }
  const targets = s.staff.filter(
    (x) => x.user_id !== s.user.id && (owner || x.role === "officer"),
  );
  return (
    <>
      <section className="recruitment-card">
        <h2>Rollout readiness</h2>
        <p>
          Public intake, documents, hiring decisions, onboarding, activation and
          compensation are not released.
        </p>
        <dl className="recruitment-facts">
          <div>
            <dt>Staff console</dt>
            <dd>{s.settings.staff_console_enabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div>
            <dt>Legacy access safeguards</dt>
            <dd>{s.settings.access_guards_enabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div>
            <dt>Retention</dt>
            <dd>
              Drafts: 14 days · Unsuccessful: 6 months · Talent pool: 12 months
            </dd>
          </div>
        </dl>
        {!s.settings.access_guards_enabled && (
          <p className="recruitment-warning">
            Legacy access safeguards are off. Existing access-management
            behavior continues until an owner enables the fence.
          </p>
        )}
      </section>
      {notice && <p role="status">{notice}</p>}
      {!review && error && <p role="alert">{error}</p>}
      {recovering && (
        <p role="status">
          Recover the pending request before starting another change.
        </p>
      )}
      {owner && (
        <div className="recruitment-grid">
          <section className="recruitment-card">
            <h2>Recruitment staff</h2>
            <p>
              New grants require verified Auth identities. Existing access can
              be revoked even if the identity cannot sign in. These grants do
              not create general Admin, teaching or finance access.
            </p>
            <ul>
              {s.staff.map((x) => (
                <li key={x.user_id}>
                  {x.email} · {x.role} · {x.enabled ? "Enabled" : "Disabled"}
                </li>
              ))}
            </ul>
            <form onSubmit={(e) => prepare(e, "staff_grant")}>
              <label>
                Staff identity
                <select
                  value={selectedStaff}
                  onChange={(e) => setSelectedStaff(e.target.value)}
                >
                  <option value="new">
                    Existing Auth identity not yet granted
                  </option>
                  {targets.map((x) => (
                    <option key={x.user_id} value={x.user_id}>
                      {x.email}
                    </option>
                  ))}
                </select>
              </label>
              {selectedStaff === "new" && (
                <label>
                  Verified Auth user ID
                  <input
                    name="userId"
                    required
                    pattern="[0-9a-fA-F-]{36}"
                    placeholder="Copy the existing user UUID from Supabase Auth"
                  />
                </label>
              )}
              <label>
                Recruitment role
                <select name="role">
                  <option value="officer">Officer</option>
                  <option value="manager">Manager</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
              <label>
                Access state
                <select name="enabled">
                  <option value="no">Disabled</option>
                  <option value="yes">Enabled</option>
                </select>
              </label>
              <Button type="submit" disabled={recovering}>
                Review staff grant
              </Button>
            </form>
          </section>
          <section className="recruitment-card">
            <h2>Owner rollout controls</h2>
            <p>
              Enabling the fence creates disabled tutor records and blocks new
              Admin permissions and tutor activation. Existing active accounts
              keep their access. There is no activation bypass in this
              milestone.
            </p>
            <form
              key={s.settings.revision}
              onSubmit={(e) => prepare(e, "settings")}
            >
              <label>
                Staff console
                <select
                  name="console"
                  defaultValue={s.settings.staff_console_enabled ? "yes" : "no"}
                >
                  <option value="no">Disabled</option>
                  <option value="yes">Enabled</option>
                </select>
              </label>
              <label>
                Legacy access safeguards
                <select
                  name="guards"
                  defaultValue={s.settings.access_guards_enabled ? "yes" : "no"}
                >
                  <option
                    value="no"
                    disabled={s.settings.access_guards_mandatory}
                  >
                    Disabled
                  </option>
                  <option value="yes">Enabled</option>
                </select>
              </label>
              <label>
                Approved privacy policy version
                <input
                  name="policy"
                  maxLength={120}
                  defaultValue={s.settings.privacy_policy_version}
                />
              </label>
              <Button type="submit" disabled={recovering}>
                Review rollout controls
              </Button>
            </form>
          </section>
          <section className="recruitment-card">
            <h2>Create a scope</h2>
            <p>
              A scope is an authorization boundary, not a published vacancy.
            </p>
            <form onSubmit={(e) => prepare(e, "scope_create")}>
              <label>
                Scope kind
                <select name="kind">
                  <option value="vacancy">Vacancy</option>
                  <option value="talent_pool">Talent pool</option>
                </select>
              </label>
              <label>
                Scope label
                <input name="label" required minLength={2} maxLength={120} />
              </label>
              <Button type="submit" disabled={recovering}>
                Review new scope
              </Button>
            </form>
          </section>
        </div>
      )}
      {s.user.role !== "officer" && (
        <section className="recruitment-card">
          <h2>Scope delegation</h2>
          <p>
            Managers can delegate only their own active scopes to enabled
            officers. Self-grants are forbidden.
          </p>
          {targets.length && s.scopes.length ? (
            <form onSubmit={(e) => prepare(e, "scope_grant")}>
              <label>
                Staff member
                <select
                  required
                  value={grantTarget}
                  onChange={(e) => setGrantTarget(e.target.value)}
                >
                  <option value="">Choose staff</option>
                  {targets.map((x) => (
                    <option key={x.user_id} value={x.user_id}>
                      {x.email}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Scope
                <select
                  required
                  value={grantScope}
                  onChange={(e) => setGrantScope(e.target.value)}
                >
                  <option value="">Choose scope</option>
                  {s.scopes.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Scope access
                <select name="enabled">
                  <option value="no">Disabled</option>
                  <option value="yes">Enabled</option>
                </select>
              </label>
              <Button type="submit" disabled={recovering}>
                Review scope grant
              </Button>
            </form>
          ) : (
            <p>Add an eligible staff identity and scope first.</p>
          )}
        </section>
      )}
      <section className="recruitment-card">
        <h2>Your scopes</h2>
        {s.scopes.length ? (
          <ul>
            {s.scopes.map((x) => (
              <li key={x.id}>
                {x.label} · {x.kind.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        ) : (
          <p>No scopes assigned.</p>
        )}
      </section>
      {owner && (
        <section className="recruitment-card">
          <h2>Security audit</h2>
          <p>Most recent 200 events. Times are shown for South Africa.</p>
          <ol>
            {s.events.map((e) => (
              <li key={e.id}>
                <strong>{e.action.replaceAll("_", " ")}</strong> ·{" "}
                {new Date(e.created_at).toLocaleString("en-ZA", {
                  timeZone: "Africa/Johannesburg",
                })}
                <details>
                  <summary>Verified actor and recorded choices</summary>
                  <p>Actor: {e.actor_id}</p>
                  <pre>{JSON.stringify(e.details, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}
      <Dialog
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open && !busy && !uncertain) {
            setReview(null);
            setProof("");
            setPassword("");
            setCode("");
            setError("");
          }
        }}
      >
        <DialogContent
          className="recruitment-review"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
            else document.getElementById("main-content")?.focus();
          }}
          onEscapeKeyDown={(e) => {
            if (busy || uncertain) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy || uncertain) e.preventDefault();
          }}
        >
          <DialogTitle>Review recruitment security change</DialogTitle>
          <DialogDescription>
            Confirm the exact identity, role and scope. This does not hire
            anyone or activate teaching/Admin access.
          </DialogDescription>
          {review && (
            <>
              <p>{review.operation.replaceAll("_", " ")}</p>
              <dl>
                {Object.entries(review.data)
                  .filter(([k]) => k !== "requestId")
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
              </dl>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void confirm();
                }}
              >
                {!proof && (
                  <label>
                    Confirm staff password
                    <input
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                )}
                {!proof && owner && s.user.ownerAal2Required && (
                  <>
                    <label>
                      Verified authenticator
                      <select
                        value={factorId}
                        onChange={(e) => setFactorId(e.target.value)}
                        required
                        disabled={busy}
                      >
                        <option value="">Choose authenticator</option>
                        {s.user.mfaFactors?.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.friendlyName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Authenticator code
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        disabled={busy}
                      />
                    </label>
                  </>
                )}
                {error && <p role="alert">{error}</p>}
                {uncertain && (
                  <p>
                    The request ID is retained across reloads. Retry uses the
                    same ID and cannot duplicate a confirmed security change.
                  </p>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? <VivaLoader size="button" decorative /> : null}
                  {proof ? "Retry same request" : "Authenticate and confirm"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || uncertain}
                  onClick={() => {
                    setReview(null);
                    setPassword("");
                    setCode("");
                    setProof("");
                    setError("");
                  }}
                >
                  Cancel
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
