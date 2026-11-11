import { useEffect, useState } from "react";
import { recruitmentRequest } from "@/lib/recruitment-client";
import { Button } from "@/components/ui/button";

type Document = { path: string; sha256?: string; bytes?: number };
export type DeploymentInventory = {
  sourceCommit: string;
  sourceSetSha256: string;
  migrations: (Document & { order: number })[];
  documents: Document[];
  flags: Record<string, boolean>;
  approvals: Record<string, boolean>;
  environment: { name: string; present: boolean }[];
  databaseVerification: string;
};

// Render tokens as React text nodes, never HTML. Preserve exact bytes for copy/download.
export function SqlSource({ content }: { content: string }) {
  const tokens = content.split(
    /(--[^\n]*|'(?:[^']|'')*'|\b(?:begin|commit|rollback|select|from|where|create|alter|drop|grant|revoke|insert|update|delete|do|declare|if|then|end|raise|exception|perform|values|set|check|not|null|true|false|and|or|as|into|returns|function|table|policy)\b)/gi,
  );
  return (
    <pre
      className="deployment-source"
      tabIndex={0}
      aria-label="Repository script content"
    >
      <code>
        {tokens.map((token, i) => (
          <span
            key={i}
            className={
              token.startsWith("--")
                ? "sql-comment"
                : token.startsWith("'")
                  ? "sql-string"
                  : /^(begin|commit|rollback|select|from|where|create|alter|drop|grant|revoke|insert|update|delete|do|declare|if|then|end|raise|exception|perform|values|set|check|not|null|true|false|and|or|as|into|returns|function|table|policy)$/i.test(
                        token,
                      )
                    ? "sql-keyword"
                    : undefined
            }
          >
            {token}
          </span>
        ))}
      </code>
    </pre>
  );
}

const steps = [
  [
    "1. Database installation",
    "Review 00 preflight, run the complete approved 01 transaction, then run all 02 verification queries in Supabase SQL Editor. Preserve the four existing buckets. No CLI migration history is fabricated.",
  ],
  [
    "2. Owner bootstrap",
    "Use 03 only with separately approved identity and operator references. Establish two independent verified owners. Test TOTP enrollment, recovery, password confirmation, session refresh and logout before requiring AAL2.",
  ],
  [
    "3. Deployment and configuration",
    "Deploy the reviewed commit only after approval. Configure server-side variables below; accept real email, private Storage, scanner and workers. Keep all five intake flags off.",
  ],
  [
    "4. Operational attestations",
    "Approve the privacy notice and evidence retention period. Test DB and Storage restore plus erasure reconciliation. Record genuine operations and scanner acceptance with 04.",
  ],
  [
    "5. Public applicant intake",
    "Approve a real vacancy, immutable form and current binding. Review and separately authorize 05. Public intake is open to everyone; there is no test-email allowlist. Talent pool requires separate 06 approval.",
  ],
  [
    "6. Acceptance and emergency pause",
    "Run the production testing checklist below. On failure use separately approved 07 pause instructions; preserve retention, recovery and existing platform access. No M4 activation or hiring operations.",
  ],
];
const checklist = [
  "Careers list and vacancy details expose only approved published content; server deadlines remain authoritative.",
  "Email proof, expiry, replay, recovery and case-scoped cookies work without applicant accounts; tracking is disabled on proof links.",
  "Tutor, administrator and support forms use approved versions; drafts, recovery, revision conflicts and explicit rebasing work on mobile.",
  "Private PDF quarantine enforces 10 MiB/file, eight files and 40 MiB/case. Real accepted scanner promotes clean files only; malware, stale definitions, unknown results and downtime fail closed.",
  "Submission requires all mandatory clean documents; immutable receipt and sanitized confirmation survive uncertain responses and retries.",
  "Owners, scoped managers and officers have correct queues, assignments and notes; conflict-of-interest and unrelated document access are denied.",
  "Talent-pool consent, renewal and withdrawal work only after separate activation.",
  "Mail, scan and retention authenticated POST workers run independently and recover expired leases; existing accounting cron is unchanged.",
  "Retention, holds, deletion barriers, late objects, signed erasure evidence and DB/Storage backup reconciliation are tested with approved policies.",
  "Enrollment, existing tutor/admin access, learner/parent portals, academic work and accounting regressions pass without test financial postings.",
];

export function RecruitmentDeploymentWorkspace() {
  const [inventory, setInventory] = useState<DeploymentInventory | null>(null);
  const [selected, setSelected] = useState("01-install-m1-through-m3.sql");
  const [document, setDocument] = useState<{
    content: string;
    sha256: string;
    path: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  const progress = inventory
    ? [
        "Recruitment owner connection verified; complete catalog verification remains manual.",
        "Current owner authenticated; two-owner MFA and recovery acceptance still required.",
        `${inventory.environment.filter((item) => item.present).length}/${inventory.environment.length} configuration entries present; services not probed.`,
        `${Object.values(inventory.approvals).filter(Boolean).length}/${Object.keys(inventory.approvals).length} approval fields recorded; confirm their scope and currency.`,
        inventory.flags.vacancy_intake_enabled ||
        inventory.flags.talent_pool_intake_enabled
          ? "Public intake flag enabled; operational acceptance must remain current."
          : "Public applicant intake disabled.",
        "Browser acceptance and incident recovery require operator evidence.",
      ]
    : [];
  useEffect(() => {
    let active = true;
    setError("");
    recruitmentRequest<DeploymentInventory>("deployment")
      .then((data) => {
        if (active) setInventory(data);
      })
      .catch((e) => {
        if (active) {
          setInventory(null);
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [version]);
  useEffect(() => {
    let active = true;
    setDocument(null);
    setMessage("");
    if (inventory)
      recruitmentRequest<{ content: string; sha256: string; path: string }>(
        "deployment",
        undefined,
        undefined,
        true,
        undefined,
        { document: selected },
      )
        .then((data) => {
          if (active) setDocument(data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [inventory, selected]);
  return (
    <section
      className="deployment-workspace"
      aria-label="Recruitment deployment"
    >
      <div className="recruitment-title">
        <div>
          <p className="recruitment-eyebrow">
            Owner only · Read-only preparation
          </p>
          <h2>Production deployment dashboard</h2>
        </div>
        <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
          Refresh readiness
        </Button>
      </div>
      <p className="recruitment-note">
        This dashboard cannot install SQL, change settings, attest a service or
        enable public intake. Copy and download contain reviewed templates,
        including placeholders that must be completed privately after approval.
        Before initial bootstrap, use the offline installation package; this
        screen requires an existing recruitment owner.
      </p>
      {error && <p role="alert">{error}</p>}
      {!inventory ? (
        <p role="status">
          {error
            ? "Readiness could not be verified. No installation status is assumed."
            : "Checking owner authorization and loading repository inventory…"}
        </p>
      ) : (
        <>
          <p>{inventory.databaseVerification}</p>
          <div className="deployment-grid">
            {steps.map(([title, text], index) => (
              <article className="recruitment-card" key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
                <p className="recruitment-note">
                  <strong>{progress[index]}</strong>
                </p>
              </article>
            ))}
          </div>
          <section className="recruitment-card">
            <h3>Observed database controls</h3>
            <p>
              Current flags and recorded approvals, not a migration or
              external-service health check.
            </p>
            <div className="deployment-grid">
              <div>
                <h4>Rollout flags</h4>
                <ul>
                  {Object.entries(inventory.flags).map(([key, on]) => (
                    <li key={key}>
                      <code>{key}</code>:{" "}
                      <strong>{on ? "Enabled" : "Disabled"}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Recorded approval status</h4>
                <ul>
                  {Object.entries(inventory.approvals).map(
                    ([key, approved]) => (
                      <li key={key}>
                        {key}:{" "}
                        <strong>
                          {approved
                            ? "Recorded — verify scope and currency"
                            : "Not recorded"}
                        </strong>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            </div>
          </section>
          <section className="recruitment-card">
            <h3>M1–M3 migration inventory</h3>
            <p>
              11 committed source migrations, 42 expected recruitment tables.
              Installation and activation are separate. Approved source commit{" "}
              <code>{inventory.sourceCommit}</code>
            </p>
            <p className="deployment-hash">
              Source-set SHA-256: {inventory.sourceSetSha256}
            </p>
            <ol>
              {inventory.migrations.map((migration) => (
                <li key={migration.path}>
                  <strong>
                    {migration.order}. [
                    {migration.order <= 4
                      ? "M1"
                      : migration.order === 5
                        ? "M2"
                        : migration.order <= 7
                          ? "M3.1"
                          : "M3.2–M3.6"}
                    ] {migration.path.split("/").pop()}
                  </strong>
                  <p className="deployment-hash">{migration.sha256}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className="recruitment-card">
            <h3>Repository SQL and documentation</h3>
            <label htmlFor="deployment-document">
              Choose a script or guide
            </label>
            <select
              id="deployment-document"
              value={selected}
              onChange={(e) => {
                setError("");
                setSelected(e.target.value);
              }}
            >
              {inventory.documents.map((doc) => (
                <option key={doc.path} value={doc.path}>
                  {doc.path}
                </option>
              ))}
            </select>
            {document ? (
              <>
                <p className="deployment-hash">SHA-256: {document.sha256}</p>
                <div className="flex flex-wrap gap-3 my-3">
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(document.content);
                        setMessage("Exact repository content copied.");
                      } catch {
                        setMessage(
                          "Clipboard unavailable. Use Download or select the script text.",
                        );
                      }
                    }}
                  >
                    Copy {selected.includes(".sql") ? "SQL" : "document"}
                  </Button>
                  <Button asChild variant="outline">
                    <a
                      href={`/api/admin/recruitment?route=deployment&document=${encodeURIComponent(selected)}&download=1`}
                    >
                      Download {selected.includes(".sql") ? "SQL" : "document"}
                    </a>
                  </Button>
                </div>
                <p role="status">{message}</p>
                {selected.includes(".sql") ? (
                  <SqlSource content={document.content} />
                ) : (
                  <pre
                    className="deployment-source"
                    tabIndex={0}
                    aria-label="Repository document content"
                  >
                    {document.content}
                  </pre>
                )}
              </>
            ) : (
              <p role="status">Loading authenticated repository content…</p>
            )}
          </section>
          <section className="recruitment-card">
            <h3>Deployment environment checklist</h3>
            <p>
              Presence checks only. No variable values are exposed. A present
              credential or URL does not establish a functioning service.
            </p>
            <ul>
              {inventory.environment.map((item) => (
                <li key={item.name}>
                  <code>{item.name}</code>:{" "}
                  {item.present
                    ? "Present — acceptance still required"
                    : "Missing"}
                </li>
              ))}
            </ul>
            <p>
              Vercel: reviewed work commit, Node 24 compatibility, npm ci / npm
              run build / dist, private route rewrites and 300-second
              recruitment API capacity. Keep production secrets out of previews
              and VITE_* variables.
            </p>
            <p>
              Email: verified Resend sender and domain DNS, proof-link tracking
              disabled. Scanner: real ClamAV gateway, TLS, fresh definitions,
              signed responses and operational acceptance. Storage: two private
              recruitment buckets, restrictive policies, immutable chunks and
              clean-file authorization. Workers: three independent authenticated
              POST timers; no new Vercel GET cron. Backups: accepted DB and
              Storage restore, external signed erasure ledger, approved
              retention horizon.
            </p>
          </section>
          <section className="recruitment-card">
            <h3>Production testing checklist</h3>
            <p>
              Review checklist only; ticks are not persisted as operational
              attestations.
            </p>
            <ul className="deployment-checklist">
              {checklist.map((text, i) => (
                <li key={text}>
                  <label>
                    <input type="checkbox" />{" "}
                    <span>
                      {i + 1}. {text}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
          <section className="recruitment-card">
            <h3>Codebase documentation</h3>
            <ul>
              {inventory.documents
                .filter((doc) => doc.path.endsWith(".md"))
                .map((doc) => (
                  <li key={doc.path}>
                    <button
                      type="button"
                      className="deployment-doc-link"
                      onClick={() => {
                        setSelected(doc.path);
                        window.document
                          .getElementById("deployment-document")
                          ?.focus();
                      }}
                    >
                      {doc.path}
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
