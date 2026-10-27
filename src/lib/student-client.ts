export class StudentError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let refreshing: Promise<void> | undefined;
async function raw(path: string, data?: object, method?: string) {
  return fetch(`/api/student${path}`, {
    method: method || (data ? "POST" : "GET"),
    credentials: "same-origin",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(30000),
  });
}
async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new StudentError(
      body.error || "The request could not be completed. Please try again.",
      response.status,
    );
  }
  return response;
}
export async function studentFetch(
  path = "",
  data?: object,
  method?: string,
  renew = true,
): Promise<Response> {
  try {
    let response = await raw(path, data, method);
    if (response.status === 401 && renew && !data && method !== "DELETE") {
      if (!refreshing)
        refreshing = raw("", { action: "refresh" })
          .then(checked)
          .then(() => undefined)
          .finally(() => {
            refreshing = undefined;
          });
      await refreshing;
      response = await raw(path, data, method);
    }
    return await checked(response);
  } catch (error) {
    if (
      error instanceof DOMException &&
      ["AbortError", "TimeoutError"].includes(error.name)
    )
      throw new StudentError(
        "The connection timed out. Please try again.",
        504,
      );
    throw error;
  }
}
export async function studentRequest<T>(
  data?: object,
  path = "",
  method?: string,
): Promise<T> {
  return (await studentFetch(path, data, method)).json();
}
