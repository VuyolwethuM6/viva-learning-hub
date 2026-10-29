import { validateAutomationReadiness } from "./accounting-api.js";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { ServerResponse } from "node:http";
import { db, rpc, uuid } from "./admin.js";
import { getEmailConfig } from "./email.js";
import { BANK_DETAILS } from "./payment-details.js";
import { HttpError, sendJson } from "./http.js";
import { validAccountingDate } from "../../src/lib/accounting-input.js";
import type {
  SystemCheck,
  SystemConfiguration,
  SystemHealth,
  SystemSnapshot,
} from "../../src/lib/system-types.js";

export function systemConfiguration(): SystemConfiguration {
  return {
    email: !!getEmailConfig(),
    scheduler: !!process.env.CRON_SECRET,
    bankConfirmed: process.env.TUITION_BANK_DETAILS_CONFIRMED === "true",
    environment: ["production", "preview"].includes(
      process.env.VERCEL_ENV || "",
    )
      ? process.env.VERCEL_ENV!
      : "development",
    commit: /^[a-f0-9]{40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA || "")
      ? process.env.VERCEL_GIT_COMMIT_SHA!
      : null,
  };
}
export async function systemRead(
  response: ServerResponse,
  actor: string,
  section: string,
) {
  if (!["health", "settings"].includes(section))
    throw new HttpError(400, "Choose System Health or Settings.");
  const configuration = systemConfiguration();
  if (section === "settings") {
    let snapshot: SystemSnapshot;
    try {
      snapshot = await rpc<SystemSnapshot>("system_snapshot", {
        p_actor: actor,
      });
    } catch {
      throw new HttpError(
        503,
        "System settings are unavailable. Apply docs/system-setup.sql if it has not been installed, then refresh.",
      );
    }
    return sendJson(response, 200, {
      ...snapshot,
      configuration,
      bank: BANK_DETAILS,
    });
  }
  const checks: SystemCheck[] = [];
  const [
    snapshotResult,
    bucketsResult,
    authResult,
    assetsResult,
    safetyResult,
  ] = await Promise.allSettled([
    rpc<SystemSnapshot>("system_snapshot", { p_actor: actor }),
    db<{ id: string; public: boolean; file_size_limit: number | null }[]>(
      "/storage/v1/bucket",
    ),
    db<{ external?: { email?: boolean } }>("/auth/v1/settings"),
    Promise.all(
      [
        "public/viva-tutorials-logo.png",
        "private/fonts/PlusJakartaSans-Regular.ttf",
        "private/fonts/PlusJakartaSans-Bold.ttf",
      ].map((path) => access(resolve(process.cwd(), path))),
    ),
    rpc<{
      missingCurrentInvoices: number | null;
      unpostedPurchases: number;
      pendingDeliveries: number;
      deliveryAttention: number;
    }>("accounting_safety_health", { p_actor: actor }),
  ]);
  const snapshot =
    snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
  checks.push({
    id: "database",
    title: "Database & oversight setup",
    status: snapshot ? "ok" : "unavailable",
    detail: snapshot
      ? "The admin snapshot and financial integrity checks responded."
      : "System checks could not load. Apply the system setup migration if needed, or investigate database availability.",
    target: "Settings",
  });
  const expected = [
    "learner-documents",
    "accounting-documents",
    "teaching-materials",
    "academic-submissions",
  ];
  if (
    bucketsResult.status === "fulfilled" &&
    Array.isArray(bucketsResult.value)
  ) {
    const invalid = expected.filter(
      (id) =>
        !bucketsResult.value.some((b) => b.id === id && b.public === false),
    );
    checks.push({
      id: "storage",
      title: "Private document storage",
      status: invalid.length ? "attention" : "ok",
      detail: invalid.length
        ? `Missing or public buckets: ${invalid.join(", ")}. Review Supabase storage before accepting documents.`
        : "All four required buckets exist and are private. This checks bucket configuration, not individual file contents.",
    });
  } else
    checks.push({
      id: "storage",
      title: "Private document storage",
      status: "unavailable",
      detail:
        "Bucket configuration could not be verified. Check Supabase Storage.",
    });
  checks.push({
    id: "auth",
    title: "Portal authentication",
    status:
      authResult.status === "fulfilled" &&
      authResult.value?.external?.email === true
        ? "ok"
        : "attention",
    detail:
      authResult.status === "fulfilled" &&
      authResult.value?.external?.email === true
        ? "Supabase Auth responded with email sign-in enabled. SMTP delivery and redirect URLs require a real sign-in test."
        : "Email sign-in readiness could not be confirmed. Check Supabase Authentication settings.",
  });
  checks.push({
    id: "pdf",
    title: "Branded PDF assets",
    status: assetsResult.status === "fulfilled" ? "ok" : "attention",
    detail:
      assetsResult.status === "fulfilled"
        ? "The logo and both PDF font files are available to this server function."
        : "A required logo or font file is missing from the deployment. Invoice and report generation may fail.",
  });
  if (
    safetyResult.status === "fulfilled" &&
    typeof safetyResult.value.missingCurrentInvoices === "number"
  ) {
    const h = safetyResult.value;
    checks.push({
      id: "billing-coverage",
      title: "Invoice coverage & PDF purchases",
      status:
        (h.missingCurrentInvoices ?? 0) +
          h.unpostedPurchases +
          h.pendingDeliveries +
          h.deliveryAttention >
        0
          ? "attention"
          : "ok",
      detail: `${h.missingCurrentInvoices} missing current-month invoices · ${h.unpostedPurchases} PDF payments awaiting posting · ${h.pendingDeliveries} pending PDF emails · ${h.deliveryAttention} PDF emails needing provider review.`,
      target: "Finance",
    });
  } else
    checks.push({
      id: "billing-coverage",
      title: "Invoice coverage & PDF purchases",
      status: "unavailable",
      detail:
        "Recovery checks are unavailable. Apply the high-priority recovery setup if needed, then review Finance Controls.",
      target: "Finance",
    });
  const lastTest = snapshot?.emailTests[0];
  checks.push({
    id: "email",
    title: "Application & tuition email",
    status: !configuration.email
      ? "attention"
      : lastTest && ["failed", "uncertain"].includes(lastTest.state)
        ? "attention"
        : "info",
    detail: !configuration.email
      ? "The Resend sender configuration is incomplete. Set RESEND_API_KEY, EMAIL_FROM and ADMIN_EMAIL in Vercel."
      : lastTest?.state === "accepted"
        ? "Resend accepted the latest owner test. Inbox delivery is not tracked; this is separate from Supabase sign-in email."
        : lastTest?.state === "uncertain"
          ? "The last provider response was uncertain. Check Resend before sending another test."
          : "Sender configuration is present. Send a test to your own owner email and check its inbox; configuration alone does not verify delivery.",
  });
  if (snapshot) {
    const h = snapshot.health;
    const missingModules = Object.entries(h.modules)
      .filter(([, ready]) => !ready)
      .map(([name]) => name);
    checks.push({
      id: "modules",
      title: "Core module interfaces",
      status: missingModules.length ? "attention" : "ok",
      detail: missingModules.length
        ? `Missing database interfaces: ${missingModules.join(", ")}. Apply the relevant setup migration.`
        : "Enrollment, admin, parent, student, teaching and academic read interfaces are present. This checks availability, not every workflow.",
      target: "Settings",
    });
    checks.push({
      id: "ledger",
      title: "Financial record integrity",
      status: Object.values(h.integrity).some((v) => Number(v) !== 0)
        ? "attention"
        : "ok",
      detail: Object.values(h.integrity).some((v) => Number(v) !== 0)
        ? "The ledger differs from one or more tuition, credit or expense records. Review Finance Controls before posting further corrections."
        : "Receivables, family credits, deferred tuition, payables and trial balance reconcile.",
      target: "Finance",
    });
    checks.push({
      id: "queue",
      title: "Notification queue",
      status: h.failedMessages + h.ambiguousMessages > 0 ? "attention" : "ok",
      detail: `${h.queuedMessages} queued · ${h.failedMessages} failed · ${h.ambiguousMessages} older sending attempts needing provider review.`,
      target: "Notifications",
    });
    checks.push({
      id: "enrollment",
      title: "Application completion",
      status:
        h.missingReportRecords + h.enrollmentEmailErrors > 0
          ? "attention"
          : "ok",
      detail: `${h.missingReportRecords} pending-review applications missing matching report metadata · ${h.enrollmentEmailErrors} recorded enrollment email errors.`,
      target: "Applications",
    });
    checks.push({
      id: "files",
      title: "Stored document records",
      status:
        h.missingStoredFiles + h.unfinishedUploads > 0 ? "attention" : "ok",
      detail: `${h.missingStoredFiles} finalized file records lack a matching Storage object · ${h.unfinishedUploads} uploads have been unfinished for over an hour. Byte contents are not downloaded by this check.`,
      target: "Materials",
    });
    const scheduled = snapshot.scheduledJob;
    const runStale =
      scheduled &&
      Date.parse(snapshot.now) - Date.parse(scheduled.started_at) >
        27 * 3600000;
    const runningStale =
      scheduled?.state === "running" &&
      Date.parse(snapshot.now) - Date.parse(scheduled.started_at) > 15 * 60000;
    checks.push({
      id: "scheduler",
      title: "Scheduled billing & reminders",
      status: !snapshot.accounting.automation_enabled
        ? "info"
        : !configuration.scheduler ||
            !snapshot.accounting.scheduler_valid ||
            !scheduled ||
            runStale ||
            runningStale ||
            scheduled.state === "failed"
          ? "attention"
          : "ok",
      detail: !snapshot.accounting.automation_enabled
        ? "Automation is disabled. Manual Finance controls remain available."
        : !configuration.scheduler || !snapshot.accounting.scheduler_valid
          ? "Configure CRON_SECRET and save automation as an enabled finance owner."
          : !scheduled
            ? "Automation is enabled, but no scheduled heartbeat has been recorded by this release yet. Vercel runs it daily at 08:05 South African time."
            : runStale || runningStale
              ? "The last scheduled heartbeat is stale or unfinished. Inspect Vercel cron logs and the run history."
              : scheduled.state === "failed"
                ? "The latest scheduled run failed. Review Finance Controls and Vercel logs."
                : "A recent scheduled run was recorded. Inspect its result below; a heartbeat does not prove inbox delivery.",
      target: "Settings",
    });
  }
  const backup = snapshot?.backups[0];
  checks.push({
    id: "backups",
    title: "Backups & recovery",
    status: "info",
    detail: backup
      ? `Owner-reported ${backup.method.replaceAll("_", " ")} on ${backup.checked_on}. Automatic backup status, retention and restore success are not monitored by this app.`
      : "No owner backup review is recorded. Verify backups and recovery in Supabase, then record what you checked in Settings.",
    target: "Settings",
  });
  const result: SystemHealth = {
    role: snapshot?.role || null,
    checkedAt: snapshot?.now || new Date().toISOString(),
    configuration,
    checks,
    overviewAvailable: !!snapshot,
    health: snapshot?.health || null,
    issues: snapshot?.issues || [],
    jobs: snapshot?.jobs || [],
    emailTests: snapshot?.emailTests || [],
    backups: snapshot?.backups || [],
  };
  return sendJson(response, 200, result);
}

export async function systemMutation(
  response: ServerResponse,
  actor: string,
  body: Record<string, unknown>,
) {
  const operation = body.operation;
  const input = body.data;
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HttpError(400, "Choose a valid system action.");
  const data = input as Record<string, unknown>;
  uuid(data.requestId);
  if (operation === "test_email") {
    const config = getEmailConfig();
    if (!config)
      throw new HttpError(
        503,
        "Configure RESEND_API_KEY, EMAIL_FROM and ADMIN_EMAIL before requesting a test.",
      );
    const test = await rpc<{
      send: boolean;
      id: string;
      to?: string;
      state: string;
    }>("system_email_test_claim", { p_actor: actor, p_id: data.requestId });
    if (!test.send)
      return sendJson(response, 200, {
        success: true,
        state: test.state,
        replayed: true,
      });
    let state = "uncertain",
      providerId: string | null = null;
    try {
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `viva-system-test-${test.id}`,
        },
        body: JSON.stringify({
          from: config.from,
          to: [test.to],
          subject: "Viva Tutorials email service check",
          text: "You requested this service check from System Health. Receiving this message confirms this one test reached your inbox. It does not verify Supabase sign-in email or delivery to other families.",
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (sent.ok) {
        const payload = (await sent.json().catch(() => null)) as {
          id?: unknown;
        } | null;
        if (payload && typeof payload.id === "string") {
          providerId = payload.id;
          state = "accepted";
        }
      } else if (sent.status >= 400 && sent.status < 500) state = "failed";
    } catch {
      state = "uncertain";
    }
    await rpc("system_email_test_finish", {
      p_actor: actor,
      p_id: test.id,
      p_state: state,
      p_provider_id: providerId,
    });
    return sendJson(response, 200, { success: true, state });
  }
  if (
    ![
      "admin_access",
      "automation",
      "closure_add",
      "closure_remove",
      "backup_review",
    ].includes(String(operation))
  )
    throw new HttpError(400, "Unknown system action.");
  if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 0)
    throw new HttpError(400, "Refresh settings before making a change.");
  if (
    typeof data.reason !== "string" ||
    data.reason.trim().length < 5 ||
    data.reason.length > 1000
  )
    throw new HttpError(400, "Choose a reason or record a review note.");
  if (operation === "automation") {
    for (const key of [
      "automationEnabled",
      "autoSend",
      "expectedAutomationEnabled",
      "expectedAutoSend",
    ])
      if (typeof data[key] !== "boolean")
        throw new HttpError(
          400,
          "Choose the automation settings and refresh before saving.",
        );
    validateAutomationReadiness(data);
  }
  if (operation === "admin_access") {
    if (data.userId !== undefined) uuid(data.userId);
    else if (
      typeof data.userEmail !== "string" ||
      data.userEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.userEmail.trim())
    )
      throw new HttpError(
        400,
        "Choose a verified staff account or enter its email.",
      );
    if (
      typeof data.enabled !== "boolean" ||
      !["owner", "bookkeeper", "viewer"].includes(String(data.role))
    )
      throw new HttpError(400, "Choose a finance role and access state.");
  }
  if (
    ["closure_add", "closure_remove", "backup_review"].includes(
      String(operation),
    ) &&
    !validAccountingDate(String(data.day || data.checkedOn || ""))
  )
    throw new HttpError(400, "Choose a valid date.");
  return sendJson(
    response,
    200,
    await rpc("system_mutate", {
      p_actor: actor,
      p_operation: operation,
      p_data: data,
    }),
  );
}
