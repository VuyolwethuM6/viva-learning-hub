import { randToCents } from "./accounting-input";

export async function financeRequest<T>(data?: object, query = ""): Promise<T> {
  const controller = new AbortController(),
    timer = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`/api/admin/accounting${query}`, {
      method: data ? "POST" : "GET",
      credentials: "same-origin",
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if ([401, 403].includes(response.status))
      window.dispatchEvent(new Event("viva-admin-expired"));
    if (!response.ok || body.success === false)
      throw new Error(
        body.error ||
          "The operation could not be confirmed. Refresh and check the records before retrying.",
      );
    return body as T;
  } catch (error) {
    if (
      error instanceof Error &&
      ["AbortError", "TimeoutError"].includes(error.name)
    )
      throw new Error(
        "The request timed out. Refresh and check whether it was recorded before retrying.",
      );
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
export const formText = (form: FormData, key: string) =>
  String(form.get(key) || "").trim();
export const formMoney = (form: FormData, key = "amount") =>
  randToCents(formText(form, key));
export const formChecked = (form: FormData, key: string) =>
  form.get(key) === "on";
