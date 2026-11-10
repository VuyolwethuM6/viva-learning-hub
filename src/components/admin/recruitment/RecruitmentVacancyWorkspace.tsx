import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { VivaLoader } from "@/components/VivaLoader";
import {
  clearRecruitmentRequest,
  pendingRecruitmentRequest,
  recruitmentRequest,
  RecruitmentError,
  retainRecruitmentRequest,
} from "@/lib/recruitment-client";
import type { RecruitmentSnapshot } from "@/lib/recruitment-types";
import {
  validateVacancyContent,
  vacancyCategories,
  vacancyStatuses,
  type RecruitmentVacancy,
  type VacancyContent,
  type VacancyOperation,
  type VacancyVersion,
  type VacancyWorkspace,
} from "@/lib/recruitment-vacancies";
import { VacancyContentView, VacancyWizard } from "./VacancyWizard";
import "./vacancy-workspace.css";

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
type Review = {
  operation: VacancyOperation;
  data: Record<string, unknown> & { requestId: string };
  heading: string;
  content?: VacancyContent;
};
type Query = {
  search: string;
  status: string;
  category: string;
  offset: number;
};

export function RecruitmentVacancyWorkspace({
  snapshot: s,
  reload,
}: {
  snapshot: RecruitmentSnapshot;
  reload: () => Promise<void>;
}) {
  const owner = s.user.role === "owner";
  const officer = s.user.role === "officer";
  const [workspace, setWorkspace] = useState<VacancyWorkspace | null>(null);
  const [detail, setDetail] = useState<VacancyWorkspace | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState<Query>({
    search: "",
    status: "",
    category: "",
    offset: 0,
  });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [historyVersions, setHistoryVersions] = useState<VacancyVersion[]>([]);
  const [historyBefore, setHistoryBefore] = useState<number | null>(null);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [previewId, setPreviewId] = useState("");
  const [wizard, setWizard] = useState<"create" | "edit" | null>(null);
  const [reason, setReason] = useState("");
  const [assignUser, setAssignUser] = useState("");
  const [assignEnabled, setAssignEnabled] = useState(true);
  const [review, setReview] = useState<Review | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState(s.user.mfaFactors?.[0]?.id || "");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const requestSequence = useRef(0);
  const detailSequence = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const scopes = s.scopes.filter((scope) => scope.kind === "vacancy");

  const fetchWorkspace = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const data = await recruitmentRequest<VacancyWorkspace>(
        "vacancies",
        undefined,
        "GET",
        true,
        undefined,
        {
          ...query,
        },
      );
      if (sequence !== requestSequence.current) return;
      setWorkspace(data);
      setError("");
      setSelectedId((previous) =>
        data.vacancies.some((vacancy) => vacancy.id === previous)
          ? previous
          : data.vacancies[0]?.id || "",
      );
    } catch (e) {
      if (sequence !== requestSequence.current) return;
      setWorkspace(null);
      setDetail(null);
      setHistoryVersions([]);
      setSelectedId("");
      setError(
        e instanceof Error ? e.message : "Vacancies could not be loaded.",
      );
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    const generation = requestSequence;
    void fetchWorkspace();
    return () => {
      ++generation.current;
    };
  }, [fetchWorkspace]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== query.search) {
        setQuery((previous) => ({ ...previous, search, offset: 0 }));
        setSelectedId("");
        setPreviewId("");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, query.search]);

  const fetchDetail = useCallback(async () => {
    const sequence = ++detailSequence.current;
    setHistoryBusy(false);
    if (!selectedId) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const data = await recruitmentRequest<VacancyWorkspace>(
        "vacancies",
        undefined,
        "GET",
        true,
        undefined,
        { vacancyId: selectedId },
      );
      if (sequence !== detailSequence.current) return;
      setDetail(data);
      setHistoryVersions(data.versions);
      setHistoryBefore(data.historyBefore ?? null);
      setHistoryMore(Boolean(data.versionsHasMore));
    } catch (e) {
      if (sequence !== detailSequence.current) return;
      setDetail(null);
      setHistoryVersions([]);
      setError(
        e instanceof Error ? e.message : "Vacancy details could not be loaded.",
      );
    } finally {
      if (sequence === detailSequence.current) setDetailLoading(false);
    }
  }, [selectedId]);
  useEffect(() => {
    const generation = detailSequence;
    void fetchDetail();
    return () => {
      ++generation.current;
    };
  }, [fetchDetail]);
  const selected = detail?.vacancies.find(
    (vacancy) => vacancy.id === selectedId,
  );
  const versions = historyVersions
    .filter((version) => version.vacancyId === selectedId)
    .sort((a, b) => b.number - a.number);
  const currentVersion = historyVersions.find(
    (version) => version.id === selected?.draftVersionId,
  );
  const previewVersion =
    versions.find((version) => version.id === previewId) || currentVersion;
  const historicalPreview = Boolean(
    previewVersion && currentVersion && previewVersion.id !== currentVersion.id,
  );
  const editable =
    selected &&
    ["draft", "revision_requested"].includes(selected.reviewState) &&
    !["closed", "archived"].includes(selected.status);
  const canCreate = !officer && (owner || scopes.length > 0);
  const unresolved = Boolean(pendingRecruitmentRequest());
  const existingAssignments =
    detail?.assignments.filter(
      (assignment) => assignment.vacancyId === selected?.id,
    ) || [];
  const assignmentTargets = assignEnabled
    ? s.staff
        .filter(
          (staff) =>
            staff.role === "officer" &&
            staff.enabled &&
            s.grants.some(
              (grant) =>
                grant.user_id === staff.user_id &&
                grant.scope_id === selected?.scopeId &&
                grant.enabled,
            ),
        )
        .map((staff) => ({ id: staff.user_id, label: staff.email }))
    : existingAssignments.map((assignment) => ({
        id: assignment.userId,
        label:
          s.staff.find((staff) => staff.user_id === assignment.userId)?.email ||
          assignment.userId,
      }));

  function prepare(
    operation: VacancyOperation,
    data: Record<string, unknown>,
    heading: string,
    content?: VacancyContent,
  ) {
    if (pendingRecruitmentRequest() || busy) {
      setError(
        "Resolve the pending recruitment request in Governance before starting another change.",
      );
      return;
    }
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setReview({
      operation,
      data: { requestId: crypto.randomUUID(), ...structuredClone(data) },
      heading,
      content: content ? structuredClone(content) : undefined,
    });
    setProof("");
    setPassword("");
    setCode("");
    setError("");
    setUncertain(false);
    setNotice("");
  }
  function transition(
    operation: VacancyOperation,
    title: string,
    needsReason = false,
  ) {
    if (!selected) return;
    if (needsReason && reason.trim().length < 10) {
      setError(
        "Give a reason of at least 10 characters for this lifecycle change.",
      );
      return;
    }
    if (operation === "vacancy_submit" && currentVersion) {
      const problems = validateVacancyContent(currentVersion.content, true);
      if (problems.length) {
        setError(problems.join(" "));
        return;
      }
    }
    prepare(
      operation,
      {
        vacancyId: selected.id,
        expectedRevision: selected.revision,
        reason: reason.trim(),
      },
      `${title}: ${currentVersion?.content.title || selected.reference} (version ${currentVersion?.number || "—"})`,
    );
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
            operation: review.operation,
            data: review.data,
            password,
            factorId,
            code,
          })
        ).proof;
        setProof(fresh);
      }
      const outcome = await recruitmentRequest<{
        result: { vacancyId?: string };
      }>("mutate", {
        operation: review.operation,
        data: review.data,
        proof: fresh,
      });
      clearRecruitmentRequest();
      setReview(null);
      setProof("");
      setUncertain(false);
      setWizard(null);
      setReason("");
      setNotice("Vacancy change recorded.");
      if (outcome.result?.vacancyId) setSelectedId(outcome.result.vacancyId);
      const created = review.operation === "vacancy_create";
      if (created) {
        setSearch("");
        setQuery({ search: "", status: "", category: "", offset: 0 });
      }
      try {
        await reload();
        if (!created) await fetchWorkspace();
        if (
          !outcome.result?.vacancyId ||
          outcome.result.vacancyId === selectedId
        )
          await fetchDetail();
      } catch {
        setError(
          "The change was recorded, but the refreshed view is unavailable. Refresh before making another change.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The vacancy change could not be confirmed.",
      );
      if (e instanceof RecruitmentError && e.confirmed) {
        setProof("");
        if (!uncertain) clearRecruitmentRequest();
        setUncertain(uncertain);
      } else setUncertain(true);
    } finally {
      setPassword("");
      setCode("");
      setBusy(false);
    }
  }
  async function earlierVersions() {
    if (!detail || !selected || historyBefore === null || historyBusy) return;
    const generation = detailSequence.current;
    setHistoryBusy(true);
    try {
      const data = await recruitmentRequest<VacancyWorkspace>(
        "vacancies",
        undefined,
        "GET",
        true,
        undefined,
        { vacancyId: selected.id, historyBefore },
      );
      if (generation !== detailSequence.current) return;
      setHistoryVersions((previous) => [
        ...new Map(
          [...previous, ...data.versions].map((version) => [
            version.id,
            version,
          ]),
        ).values(),
      ]);
      setHistoryBefore(data.historyBefore ?? null);
      setHistoryMore(Boolean(data.versionsHasMore));
    } catch (e) {
      if (generation !== detailSequence.current) return;
      setError(
        e instanceof Error ? e.message : "Version history could not be loaded.",
      );
    } finally {
      if (generation === detailSequence.current) setHistoryBusy(false);
    }
  }
  function choose(vacancy: RecruitmentVacancy) {
    setSelectedId(vacancy.id);
    setPreviewId("");
    setWizard(null);
    setReason("");
    setAssignUser("");
  }

  return (
    <div className="vacancy-workspace">
      <section
        className="recruitment-card"
        aria-labelledby="vacancy-management-heading"
      >
        <div className="vacancy-section-heading">
          <div>
            <p className="recruitment-eyebrow">Vacancy management</p>
            <h2 id="vacancy-management-heading">Opportunities at Viva</h2>
            <p>
              Draft, review and publish vacancies. Applications, uploads and
              hiring remain unavailable.
            </p>
          </div>
          <div className="vacancy-actions">
            {canCreate && (
              <Button
                disabled={busy || unresolved}
                onClick={() => {
                  setWizard("create");
                  setError("");
                  setNotice("");
                }}
              >
                Create vacancy
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy || loading || Boolean(wizard)}
              onClick={() => {
                void fetchWorkspace();
                void fetchDetail();
              }}
            >
              Refresh vacancies
            </Button>
          </div>
        </div>
        {workspace && (
          <>
            <dl className="vacancy-overview">
              <div>
                <dt>Matching vacancies</dt>
                <dd>{workspace.total ?? workspace.vacancies.length}</dd>
              </div>
              <div>
                <dt>Public visibility</dt>
                <dd>
                  {workspace.publicVacanciesEnabled ? "Enabled" : "Hidden"}
                </dd>
              </div>
              <div>
                <dt>Application intake</dt>
                <dd>Not available</dd>
              </div>
            </dl>
            {owner && (
              <div className="vacancy-actions">
                <Button
                  variant="outline"
                  disabled={busy || unresolved}
                  onClick={() =>
                    prepare(
                      "vacancy_settings",
                      {
                        expectedRevision: workspace.settingsRevision,
                        publicVacanciesEnabled:
                          !workspace.publicVacanciesEnabled,
                      },
                      workspace.publicVacanciesEnabled
                        ? "Hide public vacancies"
                        : "Enable public vacancy visibility",
                    )
                  }
                >
                  {workspace.publicVacanciesEnabled
                    ? "Review hiding public vacancies"
                    : "Review public visibility"}
                </Button>
                <small>
                  Only approved, published versions can appear publicly.
                  Application intake stays disabled.
                </small>
              </div>
            )}
          </>
        )}
      </section>
      {notice && (
        <p role="status" className="vacancy-notice">
          {notice}
        </p>
      )}
      {!review && error && (
        <p role="alert" className="vacancy-error">
          {error}
        </p>
      )}
      {unresolved && !review && (
        <p className="vacancy-info">
          A recruitment request is unresolved. Open Governance to recover its
          original request ID before making another change.
        </p>
      )}
      {wizard && (
        <VacancyWizard
          key={wizard === "create" ? "create" : selected?.id}
          initialContent={
            wizard === "edit" ? currentVersion?.content : undefined
          }
          scopeOptions={scopes}
          allowNewScope={owner}
          initialScopeId={wizard === "edit" ? selected?.scopeId : undefined}
          editing={wizard === "edit"}
          onCancel={() => setWizard(null)}
          onReview={(content, scopeId) => {
            if (wizard === "edit" && selected)
              prepare(
                "vacancy_save",
                {
                  vacancyId: selected.id,
                  expectedRevision: selected.revision,
                  content,
                },
                `Save a new draft version: ${content.title}`,
                content,
              );
            else
              prepare(
                "vacancy_create",
                { scopeId, content },
                `Create private vacancy: ${content.title}`,
                content,
              );
          }}
        />
      )}
      <section
        className="recruitment-card"
        aria-labelledby="vacancy-list-heading"
      >
        <h2 id="vacancy-list-heading">Vacancies</h2>
        <div className="vacancy-filters">
          <label>
            Search vacancies
            <input
              type="search"
              value={search}
              maxLength={160}
              placeholder="Title or public reference"
              onChange={(e) => {
                setSearch(e.target.value);
                setWizard(null);
              }}
            />
          </label>
          <label>
            Category filter
            <select
              value={query.category}
              onChange={(e) => {
                setQuery((previous) => ({
                  ...previous,
                  category: e.target.value,
                  offset: 0,
                }));
                setSelectedId("");
                setPreviewId("");
                setWizard(null);
              }}
            >
              <option value="">All categories</option>
              {vacancyCategories.map((category) => (
                <option key={category} value={category}>
                  {label(category)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status filter
            <select
              value={query.status}
              onChange={(e) => {
                setQuery((previous) => ({
                  ...previous,
                  status: e.target.value,
                  offset: 0,
                }));
                setSelectedId("");
                setPreviewId("");
                setWizard(null);
              }}
            >
              <option value="">All statuses</option>
              {vacancyStatuses.map((status) => (
                <option key={status} value={status}>
                  {label(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <VivaLoader size="section" label="Loading vacancies…" />
        ) : workspace?.vacancies.length ? (
          <ul className="vacancy-list">
            {workspace.vacancies.map((vacancy) => {
              const version = workspace.versions.find(
                (item) => item.id === vacancy.draftVersionId,
              );
              return (
                <li key={vacancy.id}>
                  <button
                    type="button"
                    aria-pressed={selectedId === vacancy.id}
                    onClick={() => choose(vacancy)}
                  >
                    <span>
                      <small>{vacancy.reference}</small>
                      <strong>
                        {version?.content.title || vacancy.reference}
                      </strong>
                      <span>
                        {version
                          ? `${label(version.content.category)} · ${label(version.content.engagementType)}`
                          : "View vacancy details"}
                      </span>
                    </span>
                    <span className="vacancy-status">
                      {label(vacancy.status)}
                      <small>{label(vacancy.reviewState)}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="vacancy-empty">
            <h3>No matching vacancies</h3>
            <p>
              {officer
                ? "An owner or manager must explicitly assign a vacancy before you can work on it."
                : "Create a vacancy or adjust your filters. Existing drafts are private until owner approval and publication."}
            </p>
          </div>
        )}
        {workspace &&
          (query.offset > 0 ||
            (workspace.nextOffset !== null &&
              workspace.nextOffset !== undefined)) && (
            <div className="vacancy-actions">
              <Button
                variant="outline"
                disabled={loading || query.offset === 0}
                onClick={() => {
                  setQuery((previous) => ({
                    ...previous,
                    offset: Math.max(0, previous.offset - 50),
                  }));
                  setSelectedId("");
                  setPreviewId("");
                }}
              >
                Previous page
              </Button>
              <span>Page {Math.floor(query.offset / 50) + 1}</span>
              <Button
                variant="outline"
                disabled={
                  loading ||
                  workspace.nextOffset === null ||
                  workspace.nextOffset === undefined
                }
                onClick={() => {
                  setQuery((previous) => ({
                    ...previous,
                    offset: workspace.nextOffset ?? previous.offset,
                  }));
                  setSelectedId("");
                  setPreviewId("");
                }}
              >
                Next page
              </Button>
            </div>
          )}
      </section>
      {!wizard && detailLoading && (
        <VivaLoader size="section" label="Loading vacancy details…" />
      )}
      {!wizard && !detailLoading && selected && previewVersion && (
        <section
          className="recruitment-card"
          aria-labelledby="vacancy-detail-heading"
        >
          <div className="vacancy-section-heading">
            <div>
              <p className="recruitment-eyebrow">
                {selected.reference} · revision {selected.revision}
              </p>
              <h2 id="vacancy-detail-heading">
                {currentVersion?.content.title || selected.reference}
              </h2>
            </div>
            <div className="vacancy-badges">
              <span>{label(selected.status)}</span>
              <span>{label(selected.reviewState)}</span>
            </div>
          </div>
          <p>
            Stable public URL: <code>/careers/{selected.slug}</code>
          </p>
          {selected.publishedVersionId &&
            selected.publishedVersionId !== selected.draftVersionId && (
              <p className="vacancy-info">
                The public page keeps its previously approved, published
                version. This working version will appear only after owner
                approval and republication.
              </p>
            )}
          {historicalPreview ? (
            <div className="vacancy-info">
              <p>
                Historical version {previewVersion.number}. This snapshot cannot
                be edited.
              </p>
              <Button variant="outline" onClick={() => setPreviewId("")}>
                Return to current working version
              </Button>
            </div>
          ) : (
            <>
              <div className="vacancy-actions">
                {editable && (
                  <Button
                    variant="outline"
                    disabled={busy || unresolved}
                    onClick={() => setWizard("edit")}
                  >
                    Edit draft
                  </Button>
                )}
                {editable && (
                  <Button
                    disabled={busy || unresolved}
                    onClick={() =>
                      transition("vacancy_submit", "Submit for owner approval")
                    }
                  >
                    Submit for approval
                  </Button>
                )}
                {selected.reviewState === "approved" &&
                  ["approved", "published", "paused"].includes(
                    selected.status,
                  ) && (
                    <Button
                      variant="outline"
                      disabled={busy || unresolved}
                      onClick={() =>
                        transition("vacancy_revise", "Start a working revision")
                      }
                    >
                      Create new revision
                    </Button>
                  )}
                {owner && selected.reviewState === "submitted" && (
                  <>
                    <Button
                      disabled={busy || unresolved}
                      onClick={() =>
                        transition("vacancy_approve", "Approve vacancy version")
                      }
                    >
                      Approve version
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || unresolved}
                      onClick={() =>
                        transition(
                          "vacancy_return",
                          "Return for revision",
                          true,
                        )
                      }
                    >
                      Return for revision
                    </Button>
                  </>
                )}
                {owner &&
                  selected.reviewState === "approved" &&
                  !["closed", "archived"].includes(selected.status) &&
                  (selected.status !== "published" ||
                    selected.publishedVersionId !==
                      selected.approvedVersionId) && (
                    <Button
                      disabled={busy || unresolved}
                      onClick={() =>
                        transition(
                          "vacancy_publish",
                          selected.publishedVersionId
                            ? "Republish approved version"
                            : "Publish approved version",
                        )
                      }
                    >
                      {selected.publishedVersionId
                        ? "Republish approved version"
                        : "Publish approved version"}
                    </Button>
                  )}
                {owner && selected.status === "published" && (
                  <Button
                    variant="outline"
                    disabled={busy || unresolved}
                    onClick={() =>
                      transition("vacancy_pause", "Pause publication", true)
                    }
                  >
                    Pause vacancy
                  </Button>
                )}
                {owner && !["closed", "archived"].includes(selected.status) && (
                  <Button
                    variant="outline"
                    disabled={busy || unresolved}
                    onClick={() =>
                      transition("vacancy_close", "Close vacancy", true)
                    }
                  >
                    Close vacancy
                  </Button>
                )}
                {owner && selected.status === "closed" && (
                  <Button
                    variant="outline"
                    disabled={busy || unresolved}
                    onClick={() =>
                      transition(
                        "vacancy_archive",
                        "Archive closed vacancy",
                        true,
                      )
                    }
                  >
                    Archive vacancy
                  </Button>
                )}
              </div>
              {owner && selected.status !== "archived" && (
                <label className="vacancy-reason">
                  Reason for lifecycle change
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <small>
                    At least 10 characters when returning, pausing, closing or
                    archiving. The reason is included in the audited review.
                  </small>
                </label>
              )}
            </>
          )}
          <VacancyContentView content={previewVersion.content} />
          <section
            className="vacancy-history"
            aria-labelledby="vacancy-version-heading"
          >
            <h3 id="vacancy-version-heading">Version history</h3>
            <p>
              Saved snapshots are immutable. Approval and publication point to
              exact versions.
            </p>
            <ol>
              {versions.map((version) => (
                <li key={version.id}>
                  <div>
                    <strong>Version {version.number}</strong>
                    <span>
                      {new Date(version.createdAt).toLocaleString("en-ZA", {
                        timeZone: "Africa/Johannesburg",
                      })}{" "}
                      SAST
                    </span>
                    <span>
                      {[
                        version.id === selected.draftVersionId &&
                          "Current working version",
                        version.id === selected.approvedVersionId && "Approved",
                        version.id === selected.publishedVersionId &&
                          "Published",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setPreviewId(version.id)}
                  >
                    Preview version {version.number}
                  </Button>
                </li>
              ))}
            </ol>
            {historyMore && (
              <Button
                variant="outline"
                disabled={historyBusy}
                onClick={() => void earlierVersions()}
              >
                {historyBusy ? "Loading history…" : "Load earlier versions"}
              </Button>
            )}
          </section>
          {!officer && (
            <section className="vacancy-history">
              <h3>Officer assignments</h3>
              <p>
                Officers need both an active scope grant and an explicit
                assignment to this vacancy. Owners introduce scope relationships
                through Governance. Removing an assignment remains possible when
                the target can no longer authenticate; it does not change the
                staff role or parent scope grant.
              </p>
              <ul>
                {detail?.assignments
                  .filter((assignment) => assignment.vacancyId === selected.id)
                  .map((assignment) => (
                    <li key={assignment.userId}>
                      {s.staff.find(
                        (staff) => staff.user_id === assignment.userId,
                      )?.email || assignment.userId}{" "}
                      · {assignment.enabled ? "Assigned" : "Removed"}
                    </li>
                  ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!assignUser) return;
                  prepare(
                    "vacancy_assign",
                    {
                      vacancyId: selected.id,
                      expectedRevision: selected.revision,
                      userId: assignUser,
                      enabled: assignEnabled,
                    },
                    assignEnabled
                      ? "Assign officer to vacancy"
                      : "Remove officer assignment",
                  );
                }}
                className="vacancy-assignment-form"
              >
                <label>
                  Officer
                  <select
                    required
                    value={assignUser}
                    onChange={(e) => setAssignUser(e.target.value)}
                  >
                    <option value="">Choose a scoped officer</option>
                    {assignmentTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Assignment state
                  <select
                    value={assignEnabled ? "yes" : "no"}
                    onChange={(e) => {
                      setAssignEnabled(e.target.value === "yes");
                      setAssignUser("");
                    }}
                  >
                    <option value="yes">Assigned</option>
                    <option value="no">Removed</option>
                  </select>
                </label>
                <Button
                  type="submit"
                  disabled={busy || unresolved || !assignUser}
                >
                  Review assignment
                </Button>
              </form>
            </section>
          )}
          <section className="vacancy-history">
            <h3>Vacancy audit history</h3>
            <p>
              Most recent authorized events returned by the server. Times are
              shown for South Africa.
            </p>
            {detail?.events.filter(
              (event) =>
                event.target_id === selected.id ||
                event.details.vacancyId === selected.id,
            ).length ? (
              <ol>
                {detail.events
                  .filter(
                    (event) =>
                      event.target_id === selected.id ||
                      event.details.vacancyId === selected.id,
                  )
                  .map((event) => (
                    <li key={event.id}>
                      <details>
                        <summary>
                          {label(event.action.replace(/^vacancy_/, ""))} ·{" "}
                          {new Date(event.created_at).toLocaleString("en-ZA", {
                            timeZone: "Africa/Johannesburg",
                          })}{" "}
                          SAST
                        </summary>
                        <p>Verified actor: {event.actor_id}</p>
                        <pre>{JSON.stringify(event.details, null, 2)}</pre>
                      </details>
                    </li>
                  ))}
              </ol>
            ) : (
              <p>No vacancy events to display.</p>
            )}
          </section>
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
          className="recruitment-review vacancy-review"
          onEscapeKeyDown={(e) => {
            if (busy || uncertain) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy || uncertain) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
            else document.getElementById("main-content")?.focus();
          }}
        >
          <DialogTitle>Review vacancy change</DialogTitle>
          <DialogDescription>
            {review?.heading}. Confirm the exact version, scope and public
            effect before authenticating.
          </DialogDescription>
          {review && (
            <>
              <dl>
                <div>
                  <dt>Operation</dt>
                  <dd>{label(review.operation.replace(/^vacancy_/, ""))}</dd>
                </div>
                {Object.entries(review.data)
                  .filter(([key]) => key !== "requestId" && key !== "content")
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>
                        {value === null
                          ? "Create dedicated scope"
                          : String(value)}
                      </dd>
                    </div>
                  ))}
              </dl>
              {review.content && (
                <VacancyContentView content={review.content} />
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void confirm();
                }}
              >
                {!proof && (
                  <>
                    <label>
                      Confirm staff password
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        required
                        maxLength={1024}
                        disabled={busy}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    {owner && s.user.ownerAal2Required && (
                      <>
                        <label>
                          Verified authenticator
                          <select
                            value={factorId}
                            required
                            disabled={busy}
                            onChange={(e) => setFactorId(e.target.value)}
                          >
                            <option value="">Choose authenticator</option>
                            {s.user.mfaFactors?.map((factor) => (
                              <option key={factor.id} value={factor.id}>
                                {factor.friendlyName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Authenticator code
                          <input
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            required
                            disabled={busy}
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                          />
                        </label>
                      </>
                    )}
                  </>
                )}
                {error && <p role="alert">{error}</p>}
                {uncertain && (
                  <p className="vacancy-info">
                    The outcome is uncertain. Retry uses this same request ID.
                    After reload, Governance restores it; no credentials or
                    choice payload are stored in this browser.
                  </p>
                )}
                <div className="vacancy-actions">
                  <Button type="submit" disabled={busy}>
                    {busy && <VivaLoader size="button" decorative />}
                    {proof ? "Retry same request" : "Authenticate and confirm"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || uncertain}
                    onClick={() => {
                      setReview(null);
                      setProof("");
                      setPassword("");
                      setCode("");
                      setError("");
                    }}
                  >
                    Cancel review
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
