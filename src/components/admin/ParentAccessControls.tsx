import { VivaLoader } from "@/components/VivaLoader";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import type { Application } from "@/lib/admin-types";
type Access = {
  email: string;
  enabled: boolean;
  registered: boolean;
  eligible: boolean;
  lastSignedInAt: string | null;
};
export function ParentAccessControls({
  application,
  role,
}: {
  application: Application;
  role?: string;
}) {
  const [access, setAccess] = useState<Access | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  async function request(change = false) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/records", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "parent_access",
          applicationId: application.id,
          ...(change ? { enabled: !access?.enabled, reason } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Parent access could not be loaded.");
      setAccess(body);
      if (change) {
        setEditing(false);
        setReason("");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Parent access is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    setAccess(null);
    setError("");
    fetch("/api/admin/records", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "parent_access",
        applicationId: application.id,
      }),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Parent access could not be loaded.");
        if (active) setAccess(body);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Parent access is unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [application.id]);
  return (
    <section className="profile-section">
      <h3>
        <KeyRound size={18} /> Parent portal access
      </h3>
      <p>
        Access covers all reviewed learners sharing{" "}
        <strong>{application.guardian_email}</strong>. Verify this guardian
        email before enabling it.
      </p>
      {error && (
        <p role="alert" className="admin-error">
          {error} <button onClick={() => void request()}>Retry</button>
        </p>
      )}
      {access && (
        <>
          <p>
            <strong>{access.enabled ? "Enabled" : "Disabled"}</strong> ·{" "}
            {access.registered
              ? "Guardian has signed in"
              : "Guardian has not signed in yet"}
          </p>
          <p>
            Parents use{" "}
            <a href="/parent" target="_blank" rel="noopener noreferrer">
              the parent portal
            </a>{" "}
            and an email sign-in link. Disabling access blocks the whole family
            account, including existing sessions.
          </p>
          {role !== "viewer" &&
            (!access.enabled && !access.eligible ? (
              <p>Approve the application before enabling parent access.</p>
            ) : !editing ? (
              <button onClick={() => setEditing(true)}>
                {access.enabled
                  ? "Disable parent access"
                  : "Enable parent access"}
              </button>
            ) : (
              <form
                className="finance-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void request(true);
                }}
              >
                <label>
                  Reason / guardian verification
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={3}
                  />
                </label>
                <p>
                  {access.enabled
                    ? "This will immediately block this guardian’s portal access for every linked learner."
                    : "Confirm that this is the correct guardian email. This grants access to learner details and family financial documents."}
                </p>
                <div className="confirm-actions">
                  <button
                    className={
                      access.enabled ? "admin-danger" : "admin-primary"
                    }
                    disabled={busy}
                  >
                    {busy ? <VivaLoader size="button" decorative /> : null}{" "}
                    Confirm {access.enabled ? "disable" : "enable"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ))}
        </>
      )}
      {!access && !error && <p role="status">Checking parent access…</p>}
    </section>
  );
}
