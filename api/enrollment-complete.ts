import type { ServerResponse } from 'node:http';
import { ApiRequest, HttpError, readJsonBody } from './_lib/http';

type JsonObject = Record<string, unknown>;

function sendJson(response: ServerResponse, status: number, body: JsonObject) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

function serviceHeaders(key: string) {
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

    const headers = serviceHeaders(serviceKey);
    const applicationResponse = await fetch(
      `${supabaseUrl}/rest/v1/applications?select=id,application_number,status,report_card_path,report_card_size,report_card_name&id=eq.${encodeURIComponent(applicationId)}`,
      { headers },
    );
    if (!applicationResponse.ok) {
      console.error('[Enrollment completion] Could not read application', { status: applicationResponse.status });
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
    if (!application || !application.report_card_path || !application.report_card_size) {
      return sendJson(response, 404, { error: 'The enrollment draft or report-card details were not found.' });
    }

    const learnerResponse = await fetch(
      `${supabaseUrl}/rest/v1/learners?select=student_number&application_id=eq.${encodeURIComponent(applicationId)}`,
      { headers },
    );
    if (!learnerResponse.ok) {
      console.error('[Enrollment completion] Could not read learner reference', { status: learnerResponse.status });
      return sendJson(response, 502, { error: 'Unable to verify the learner number.' });
    }
    const learners = await learnerResponse.json() as Array<{ student_number: string }>;
    const learner = learners[0];
    if (!learner?.student_number) {
      return sendJson(response, 502, { error: 'The learner number is not available yet.' });
    }

    if (application.status === 'draft') {
      const encodedPath = application.report_card_path.split('/').map(encodeURIComponent).join('/');
      const fileResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/info/learner-documents/${encodedPath}`,
        { headers },
      );
      if (fileResponse.status === 404) {
        return sendJson(response, 409, { error: 'The report card has not finished uploading yet.' });
      }
      if (!fileResponse.ok) {
        console.error('[Enrollment completion] Storage could not verify uploaded object', { status: fileResponse.status });
        return sendJson(response, 502, { error: 'Unable to verify the uploaded report card.' });
      }

      const fileInfo = await fileResponse.json() as {
        size?: number;
        mimetype?: string;
        metadata?: { size?: number; mimetype?: string };
      };
      const uploadedSize = Number(fileInfo.size ?? fileInfo.metadata?.size);
      const uploadedMimeType = fileInfo.mimetype ?? fileInfo.metadata?.mimetype;
      if (uploadedSize !== Number(application.report_card_size) ||
        !['application/pdf', 'image/jpeg', 'image/png'].includes(uploadedMimeType ?? '')) {
        console.error('[Enrollment completion] Uploaded report card metadata did not match application');
        return sendJson(response, 400, { error: 'The uploaded report card did not pass file verification.' });
      }

      const finalizeResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/finalize_enrollment_document`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          p_application_id: applicationId,
          p_mime_type: uploadedMimeType,
        }),
      });
      if (!finalizeResponse.ok) {
        const errorText = await finalizeResponse.text();
        console.error('[Enrollment completion] Could not finalize application', {
          status: finalizeResponse.status,
          error: errorText.slice(0, 300),
        });
        return sendJson(response, 502, { error: 'The report card uploaded, but enrollment finalization failed. Retry the completion step.' });
      }
    } else if (application.status !== 'pending_review') {
      return sendJson(response, 409, { error: 'This enrollment is not awaiting document completion.' });
    }

    return sendJson(response, 200, {
      success: true,
      applicationId,
      applicationNumber: application.application_number,
      studentNumber: learner.student_number,
      status: 'pending_review',
    });
  } catch (error) {
    if (error instanceof HttpError) return sendJson(response, error.status, { error: error.message });
    console.error('[Enrollment completion] Request failed', error instanceof Error ? error.message : 'Unknown error');
    return sendJson(response, 502, { error: 'Unable to complete the enrollment. Please retry.' });
  }
}
