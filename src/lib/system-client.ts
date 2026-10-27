export async function systemRequest<T>(
  section: "health" | "settings",
  body?: object,
): Promise<T> {
  const controller = new AbortController(),
    timer = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch("/api/admin/records?system=" + section, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify({ action: "system", ...body }) : undefined,
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if ([401, 403].includes(response.status))
      window.dispatchEvent(new Event("viva-admin-expired"));
    if (!response.ok)
      throw new Error(
        result.error ||
          "System information could not be confirmed. Refresh and try again.",
      );
    return result as T;
  } catch (e) {
    if (e instanceof Error && ["AbortError", "TimeoutError"].includes(e.name))
      throw new Error(
        "The request timed out. Refresh to check the latest record before retrying.",
      );
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}
