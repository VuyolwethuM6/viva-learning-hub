import type { IntakeDefinition } from "./recruitment-applications";
export type Answers = {
  fields: Record<string, string | boolean | string[]>;
  questions: Record<string, string | boolean | number>;
};
export type ApplicantDocument = {
  id: string;
  key: string;
  name: string;
  size: number;
  state: string;
  generation: string;
};
export type ApplicantCase = {
  id: string;
  slug?: string;
  reapplicationAllowed?: boolean;
  caseReference: string;
  state: string;
  purpose: "vacancy" | "talent_pool";
  revision: number;
  expiresAt: string;
  formId: string;
  definition: IntakeDefinition | null;
  noticeVersion: string;
  notice: string | null;
  answers: Answers | null;
  request: { state: string; operation: string; resultRef: string } | null;
  documents: ApplicantDocument[];
  receipt: { receipt: string; submittedAt: string } | null;
  messagesHasMore?: boolean;
  messages: {
    id: string;
    kind: string;
    text: string;
    replyTo: string | null;
    createdAt: string;
  }[];
};
export type PublicForm = {
  formId: string;
  definition: IntakeDefinition;
  privacyNoticeVersion: string;
  privacyNotice: string;
  title: string;
  purpose: string;
};
export class ApplicantError extends Error {
  constructor(
    public code: string,
    public confirmed = false,
  ) {
    super(code.replaceAll("_", " "));
  }
}
export async function applicantRequest<T>(
  route: string,
  data?: object,
  method?: string,
  query?: Record<string, string>,
): Promise<T> {
  let r: Response;
  try {
    r = await fetch(
      `/api/recruitment?${new URLSearchParams({ route, ...query })}`,
      {
        method: method || (data ? "POST" : "GET"),
        credentials: "same-origin",
        cache: "no-store",
        headers: data ? { "Content-Type": "application/json" } : {},
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(60000),
      },
    );
  } catch {
    throw new ApplicantError("outcome_uncertain");
  }
  const b = await r.json().catch(() => null);
  if (!r.ok)
    throw new ApplicantError(
      b?.error?.code || "outcome_uncertain",
      r.headers.get("X-Recruitment-Error") === "confirmed",
    );
  if (!b) throw new ApplicantError("outcome_uncertain");
  return b;
}
const pendingKey = "viva.recruitment.applicant.pending";
export type PendingApplicant = { requestId: string; action: string };
export function applicantPending(): PendingApplicant | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
    return p &&
      /^[0-9a-f-]{36}$/.test(p.requestId) &&
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
      ].includes(p.action)
      ? p
      : null;
  } catch {
    return null;
  }
}
export function retainApplicant(p: PendingApplicant | null) {
  if (p) sessionStorage.setItem(pendingKey, JSON.stringify(p));
  else sessionStorage.removeItem(pendingKey);
}
export async function applicantDownload(
  id: string,
  size: number,
  staff = false,
) {
  const parts: BlobPart[] = [];
  for (let part = 0; part < Math.ceil(size / 2097152); part++) {
    const r = await fetch(
      `${staff ? "/api/admin/recruitment?route=case-documents" : "/api/recruitment?route=documents"}&documentId=${encodeURIComponent(id)}&part=${part}`,
      { credentials: "same-origin", cache: "no-store" },
    );
    if (!r.ok) throw new ApplicantError("document_unavailable");
    parts.push(await r.arrayBuffer());
  }
  const url = URL.createObjectURL(new Blob(parts, { type: "application/pdf" })),
    a = document.createElement("a");
  a.href = url;
  a.download = "recruitment-document.pdf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function uploadApplicant(
  file: File,
  key: string,
  onProgress: (v: string) => void,
) {
  if (
    file.type !== "application/pdf" ||
    !file.name.toLowerCase().endsWith(".pdf") ||
    file.size > 10485760 ||
    file.size < 1
  )
    throw new ApplicantError("pdf_only_maximum_10_mib", true);
  const bytes = new Uint8Array(await file.arrayBuffer()),
    checksum = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
  const old = applicantPending();
  if (old) throw new ApplicantError("resolve_pending_request_first");
  const requestId = crypto.randomUUID();
  retainApplicant({ requestId, action: "reserve" });
  const d = await applicantRequest<{ documentId: string; generation: string }>(
    "documents",
    {
      action: "reserve",
      requestId,
      requirementKey: key,
      name: file.name,
      size: file.size,
      checksum,
    },
  );
  retainApplicant(null);
  for (let index = 0; index < Math.ceil(bytes.length / 2097152); index++) {
    onProgress(`Uploading part ${index + 1}…`);
    const part = bytes.subarray(index * 2097152, (index + 1) * 2097152);
    let binary = "";
    for (let i = 0; i < part.length; i += 16384)
      binary += String.fromCharCode(...part.subarray(i, i + 16384));
    await applicantRequest("documents", {
      action: "chunk",
      documentId: d.documentId,
      generation: d.generation,
      index,
      data: btoa(binary),
    });
  }
  await applicantRequest("documents", {
    action: "finalize",
    documentId: d.documentId,
    generation: d.generation,
  });
  onProgress("Uploaded. Security scanning is pending.");
}
