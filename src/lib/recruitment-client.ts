export class RecruitmentError extends Error {
  constructor(
    message: string,
    public status: number,
    public confirmed = false,
  ) {
    super(message);
  }
}
let refresh: Promise<unknown> | undefined;
export async function recruitmentRequest<T>(
  route: string,
  data?: object,
  method?: string,
  renew = true,
  requestId?: string,
  query?: Record<string, string | number>,
): Promise<T> {
  const send = () =>
    fetch(
      `/api/admin/recruitment?route=${encodeURIComponent(route)}${requestId ? `&requestId=${encodeURIComponent(requestId)}` : ""}${query ? `&${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}` : ""}`,
      {
        method: method || (data ? "POST" : "GET"),
        credentials: "same-origin",
        headers: data ? { "Content-Type": "application/json" } : {},
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(30000),
      },
    );
  let response: Response;
  try {
    response = await send();
  } catch {
    throw new RecruitmentError(
      "The result is uncertain. Keep this review open and retry the same request.",
      0,
    );
  }
  if (response.status === 401 && renew && !data && method !== "DELETE") {
    if (!refresh)
      refresh = recruitmentRequest(
        "session",
        { action: "refresh" },
        "POST",
        false,
      ).finally(() => {
        refresh = undefined;
      });
    await refresh;
    try {
      response = await send();
    } catch {
      throw new RecruitmentError(
        "The result is uncertain. Retry the original request.",
        0,
      );
    }
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new RecruitmentError(
      (typeof body?.error === "string" ? body.error : body?.error?.message) ||
        "Recruitment request failed.",
      response.status,
      response.status >= 400 &&
        response.status < 500 &&
        response.headers.get("X-Recruitment-Error") === "confirmed" &&
        (typeof body?.error === "string" ||
          typeof body?.error?.code === "string"),
    );
  if (!body)
    throw new RecruitmentError(
      "The result could not be confirmed. Retry the same request.",
      0,
    );
  return body as T;
}

// Only a non-secret UUID is persisted. Choices, proofs, passwords, MFA codes and tokens stay in memory/server storage.
const pendingKey = "viva.recruitment.pendingRequestId";
export function pendingRecruitmentRequest() {
  try {
    const id = sessionStorage.getItem(pendingKey);
    return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}
export function retainRecruitmentRequest(id: string) {
  try {
    sessionStorage.setItem(pendingKey, id);
    window.dispatchEvent(new Event("recruitment-pending-changed"));
  } catch {
    throw new Error(
      "Browser session storage is required to safely recover this request. No mutation was sent.",
    );
  }
}
export function clearRecruitmentRequest() {
  sessionStorage.removeItem(pendingKey);
  window.dispatchEvent(new Event("recruitment-pending-changed"));
}

export function pendingCaseRequest() {
  try {
    return sessionStorage.getItem("viva.recruitment.case.pending") || "";
  } catch {
    return "";
  }
}
