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

const SCOPE = 'Enrollment completion';
const MAX_BODY_BYTES = 16 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

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
    const headers = serviceHeaders(supabase.key);

    const applicationResponse = await fetch(
      `${supabase.url}/rest/v1/applications?select=id,application_number,status,report_card_path,report_card_size,report_card_name&id=eq.${encodeURIComponent(applicationId)}`,
      { headers },
    );
    if (!applicationResponse.ok) {
      console.error(`[${SCOPE}] Could not read application`, { status: applicationResponse.status });
      return sendJson(response, 502, { error: 'Unable to verify the uploaded report card.' });
    }

    const applications = await applicationResponse.json() as Array<{
      id: string;
      application_number: string;
      status: string;
      report_card_path: string | null;
      report_card_size: number | null;
      report_card_name: string | null;
    }>;
    const application = applications[0];
    debug(SCOPE, 'application lookup', {
      found: Boolean(application),
      status: application?.status ?? null,
      expectedSize: application?.report_card_size ?? null,
    });
    if (!application || !application.report_card_path || !application.report_card_size) {
      return sendJson(response, 404, { error: 'The enrollment draft or report-card details were not found.' });
    }

    const learnerResponse = await fetch(
      `${supabase.url}/rest/v1/learners?select=student_number&application_id=eq.${encodeURIComponent(applicationId)}`,
      { headers },
    );
    if (!learnerResponse.ok) {
      console.error(`[${SCOPE}] Could not read learner reference`, { status: learnerResponse.status });
      return sendJson(response, 502, { error: 'Unable to verify the learner number.' });
    }
    const learners = await learnerResponse.json() as Array<{ student_number: string }>;
    const learner = learners[0];
    if (!learner?.student_number) {
      return sendJson(response, 502, { error: 'The learner number is not available yet.' });
    }

    if (application.status === 'draft') {
      const fileResponse = await fetch(
        `${supabase.url}/storage/v1/object/info/learner-documents/${encodeStoragePath(application.report_card_path)}`,
        { headers },
      );
      debug(SCOPE, 'storage info', { status: fileResponse.status });
      if (fileResponse.status === 404) {
        return sendJson(response, 409, { error: 'The report card has not finished uploading yet.' });
      }
      if (!fileResponse.ok) {
        console.error(`[${SCOPE}] Storage could not verify uploaded object`, { status: fileResponse.status });
        return sendJson(response, 502, { error: 'Unable to verify the uploaded report card.' });
      }

      const fileInfo = await fileResponse.json() as {
        size?: number;
        mimetype?: string;
        metadata?: { size?: number; mimetype?: string };
      };
      const uploadedSize = Number(fileInfo.size ?? fileInfo.metadata?.size);
      const uploadedMimeType = fileInfo.mimetype ?? fileInfo.metadata?.mimetype;
      debug(SCOPE, 'file verification', {
        uploadedSize,
        expectedSize: Number(application.report_card_size),
        uploadedMimeType: uploadedMimeType ?? null,
      });
      if (uploadedSize !== Number(application.report_card_size) || !ALLOWED_MIME_TYPES.includes(uploadedMimeType ?? '')) {
        console.error(`[${SCOPE}] Uploaded report card metadata did not match application`);
        return sendJson(response, 400, { error: 'The uploaded report card did not pass file verification.' });
      }

      const finalizeResponse = await fetch(`${supabase.url}/rest/v1/rpc/finalize_enrollment_document`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          p_application_id: applicationId,
          p_mime_type: uploadedMimeType,
        }),
      });
      debug(SCOPE, 'finalize_enrollment_document', { status: finalizeResponse.status });
      if (!finalizeResponse.ok) {
        const errorText = await finalizeResponse.text();
        console.error(`[${SCOPE}] Could not finalize application`, {
          status: finalizeResponse.status,
          error: errorText.slice(0, 300),
        });
        return sendJson(response, 502, { error: 'The report card uploaded, but enrollment finalization failed. Retry the completion step.' });
      }
    } else if (application.status !== 'pending_review') {
      return sendJson(response, 409, { error: 'This enrollment is not awaiting document completion.' });
    }

    debug(SCOPE, 'success: application is pending_review', { applicationNumber: application.application_number });
    return sendJson(response, 200, {
      success: true,
      applicationId,
      applicationNumber: application.application_number,
      studentNumber: learner.student_number,
      status: 'pending_review',
    });
  } catch (error) {
    return handleError(response, error, SCOPE, 'Unable to complete the enrollment. Please retry.');
  }
}