import type { ServerResponse } from 'node:http';
import {
  type ApiRequest,
  debug,
  describeRequest,
  encodeStoragePath,
  getSupabaseConfig,
  handleError,
  readJsonBody,
  sendJson,
  serviceHeaders,
} from './_lib/http.js';

const SCOPE = 'Enrollment upload';
const MAX_BODY_BYTES = 16 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });

  debug(SCOPE, 'request received', describeRequest(request));

  try {
    const body = await readJsonBody(request, MAX_BODY_BYTES, SCOPE);
    const applicationId = typeof body.applicationId === 'string' ? body.applicationId : '';
    if (!UUID_PATTERN.test(applicationId)) {
      debug(SCOPE, 'validation failed: applicationId not a UUID', { receivedKeys: Object.keys(body) });
      return sendJson(response, 400, { error: 'A valid application reference is required.' });
    }

    const supabase = getSupabaseConfig();
    if (!supabase) {
      console.error(`[${SCOPE}] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set`);
      return sendJson(response, 503, { error: 'Supabase is not configured on the server.' });
    }

    const appResponse = await fetch(
      `${supabase.url}/rest/v1/applications?select=report_card_path,status&id=eq.${encodeURIComponent(applicationId)}`,
      { headers: serviceHeaders(supabase.key) },
    );
    if (!appResponse.ok) {
      console.error(`[${SCOPE}] Could not read draft`, { status: appResponse.status });
      return sendJson(response, 502, { error: 'Unable to prepare a secure upload retry.' });
    }

    const applications = await appResponse.json() as Array<{ report_card_path: string | null; status: string }>;
    const application = applications[0];
    debug(SCOPE, 'application lookup', {
      found: Boolean(application),
      status: application?.status ?? null,
      hasReportCardPath: Boolean(application?.report_card_path),
    });
    if (!application || application.status !== 'draft' || !application.report_card_path) {
      return sendJson(response, 409, { error: 'This application is not awaiting report-card upload.' });
    }

    const signedResponse = await fetch(
      `${supabase.url}/storage/v1/object/upload/sign/learner-documents/${encodeStoragePath(application.report_card_path)}`,
      {
        method: 'POST',
        headers: serviceHeaders(supabase.key),
        body: JSON.stringify({ upsert: false }),
      },
    );
    if (!signedResponse.ok) {
      const errorText = await signedResponse.text();
      console.error(`[${SCOPE}] Could not refresh signed URL`, { status: signedResponse.status, error: errorText.slice(0, 300) });
      return sendJson(response, 502, { error: 'Unable to prepare a secure upload retry.' });
    }

    const signed = await signedResponse.json() as { url?: string; token?: string };
    if (!signed.url || !signed.token) {
      console.error(`[${SCOPE}] Supabase returned an incomplete signed upload response`);
      return sendJson(response, 502, { error: 'Supabase returned an incomplete secure upload link.' });
    }

    const uploadUrl = new URL(`${supabase.url}/storage/v1${signed.url}`);
    uploadUrl.searchParams.set('token', signed.token);
    debug(SCOPE, 'success: fresh signed upload URL issued');
    return sendJson(response, 200, { uploadUrl: uploadUrl.toString() });
  } catch (error) {
    return handleError(response, error, SCOPE, 'Unable to prepare a secure upload retry.');
  }
}