import type { ServerResponse } from 'node:http';
import { ApiRequest, HttpError, readJsonBody } from './_lib/http';

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

function headers(key: string) {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  };
}

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const body = await readJsonBody(request, 16 * 1024);
    const applicationId = typeof body.applicationId === 'string' ? body.applicationId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
      return sendJson(response, 400, { error: 'A valid application reference is required.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return sendJson(response, 503, { error: 'Supabase is not configured on the server.' });
    }

    const appResponse = await fetch(
      `${supabaseUrl}/rest/v1/applications?select=report_card_path,status&id=eq.${encodeURIComponent(applicationId)}`,
      { headers: headers(serviceKey) },
    );
    if (!appResponse.ok) {
      console.error('[Enrollment upload] Could not read draft', { status: appResponse.status });
      return sendJson(response, 502, { error: 'Unable to prepare a secure upload retry.' });
    }

    const applications = await appResponse.json() as Array<{ report_card_path: string | null; status: string }>;
    const application = applications[0];
    if (!application || application.status !== 'draft' || !application.report_card_path) {
      return sendJson(response, 409, { error: 'This application is not awaiting report-card upload.' });
    }

    const encodedPath = application.report_card_path.split('/').map(encodeURIComponent).join('/');
    const signedResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/upload/sign/learner-documents/${encodedPath}`,
      {
        method: 'POST',
        headers: headers(serviceKey),
        body: JSON.stringify({ upsert: false }),
      },
    );
    if (!signedResponse.ok) {
      console.error('[Enrollment upload] Could not refresh signed URL', { status: signedResponse.status });
      return sendJson(response, 502, { error: 'Unable to prepare a secure upload retry.' });
    }

    const signed = await signedResponse.json() as { url?: string; token?: string };
    if (!signed.url || !signed.token) {
      return sendJson(response, 502, { error: 'Supabase returned an incomplete secure upload link.' });
    }
    const uploadUrl = new URL(`${supabaseUrl}/storage/v1${signed.url}`);
    uploadUrl.searchParams.set('token', signed.token);
    return sendJson(response, 200, { uploadUrl: uploadUrl.toString() });
  } catch (error) {
    if (error instanceof HttpError) return sendJson(response, error.status, { error: error.message });
    console.error('[Enrollment upload] Failed to prepare retry', error instanceof Error ? error.message : 'Unknown error');
    return sendJson(response, 502, { error: 'Unable to prepare a secure upload retry.' });
  }
}
