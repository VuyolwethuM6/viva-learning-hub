export class RecruitmentError extends Error {
  constructor(
    message: string,
    public status: number,
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
): Promise<T> {
  const send = () =>
    fetch(`/api/admin/recruitment?route=${encodeURIComponent(route)}`, {
      method: method || (data ? "POST" : "GET"),
      credentials: "same-origin",
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(30000),
    });
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
    response = await send();
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new RecruitmentError(
      body?.error || "Recruitment request failed.",
      response.status,
    );
  if (!body)
    throw new RecruitmentError(
      "The result could not be confirmed. Retry the same request.",
      0,
    );
  return body as T;
}
