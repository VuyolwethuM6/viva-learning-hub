import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { ApiRequest, HttpError, readJsonBody } from './_lib/http';

const MAX_BODY_BYTES = 256 * 1024;
const REPORT_CARD_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
} as const;
const SUBJECTS_BY_GRADE: Record<string, { maxSubjects: number; prices: number[]; subjects: string[] }> = {
  'Grade 8': {
    maxSubjects: 2,
    prices: [350, 600],
    subjects: ['Mathematics', 'Natural Sciences', 'Other academic support'],
  },
  'Grade 9': {
    maxSubjects: 2,
    prices: [350, 600],
    subjects: ['Mathematics', 'Natural Sciences', 'Other academic support'],
  },
  'Grade 10': { maxSubjects: 3, prices: [500, 800, 1100], subjects: ['Mathematics', 'Mathematical Literacy', 'Physical Sciences', 'Life Sciences'] },
  'Grade 11': { maxSubjects: 3, prices: [500, 800, 1100], subjects: ['Mathematics', 'Mathematical Literacy', 'Physical Sciences', 'Life Sciences'] },
  'Grade 12': { maxSubjects: 3, prices: [500, 800, 1100], subjects: ['Mathematics', 'Mathematical Literacy', 'Physical Sciences', 'Life Sciences'] },
  'Matric Rewrite': { maxSubjects: 3, prices: [550, 900, 1200], subjects: ['Mathematics', 'Mathematical Literacy', 'Physical Sciences', 'Life Sciences'] },
};

type JsonObject = Record<string, unknown>;

function sendJson(response: ServerResponse, status: number, body: JsonObject) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function textArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value.map((item) => item.trim()).filter(Boolean)
    : [];
}

function safeFileName(value: string) {
  return value.replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 255);
}

function createApplicationNumber() {
  const random = randomBytes(4).toString('hex').toUpperCase();
  return `VT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${random}`;
}

function encodeStoragePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export default async function handler(request: ApiRequest, response: ServerResponse) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const body = await readJsonBody(request, MAX_BODY_BYTES);
    const student = asObject(body.student);
    const guardian = asObject(body.guardian);
    const grade = text(body.grade);
    const mode = text(body.mode);
    const selectedSubjects = textArray(body.selectedSubjects);
    const goals = textArray(body.goals);
    const marks = asObject(body.marks);
    const studentName = text(student.name);
    const studentEmail = text(student.email).toLowerCase();
    const guardianName = text(guardian.name);
    const guardianEmail = text(guardian.email).toLowerCase();
    const reportCardName = safeFileName(text(body.reportCardName));
    const reportCardSize = Number(body.reportCardSize);
    const reportCardMimeType = text(body.reportCardMimeType);
    const termsAccepted = body.termsAccepted === true;
    const reportCardExtension = reportCardName.split('.').pop()?.toLowerCase() ?? '';

    const missingFields = [
      ...(!studentName ? ['student.name'] : []),
      ...(!guardianName ? ['guardian.name'] : []),
      ...(!grade ? ['grade'] : []),
      ...(!mode ? ['mode'] : []),
      ...(!selectedSubjects.length ? ['selectedSubjects'] : []),
      ...(!goals.length ? ['goals'] : []),
      ...(!termsAccepted ? ['termsAccepted'] : []),
    ];
    if (missingFields.length) {
      return sendJson(response, 400, {
        error: `Required enrollment details are missing: ${missingFields.join(', ')}.`,
        missingFields,
      });
    }
    if (!/^\S+@\S+\.\S+$/.test(studentEmail) || !/^\S+@\S+\.\S+$/.test(guardianEmail)) {
      return sendJson(response, 400, { error: 'Please provide valid email addresses.' });
    }
    if (!text(student.dob) || Number.isNaN(Date.parse(text(student.dob))) || !text(student.gender) || !text(student.school)) {
      return sendJson(response, 400, { error: 'Complete student details are required.' });
    }
    const dob = text(student.dob);
    const parsedDob = new Date(`${dob}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(parsedDob.getTime()) ||
      parsedDob.toISOString().slice(0, 10) !== dob || dob >= new Date().toISOString().slice(0, 10) || !reportCardName ||
      !Number.isInteger(reportCardSize) || reportCardSize <= 0 || reportCardSize > 10 * 1024 * 1024 ||
      !Object.hasOwn(REPORT_CARD_TYPES, reportCardExtension) ||
      REPORT_CARD_TYPES[reportCardExtension as keyof typeof REPORT_CARD_TYPES] !== reportCardMimeType) {
      return sendJson(response, 400, { error: 'The date of birth or report card details are invalid.' });
    }
    if (text(student.phone).replace(/\D/g, '').length < 9 || text(guardian.phone).replace(/\D/g, '').length < 9) {
      return sendJson(response, 400, { error: 'Student and guardian phone numbers are required.' });
    }

    const gradeRules = SUBJECTS_BY_GRADE[grade];
    if (!gradeRules || selectedSubjects.length > gradeRules.maxSubjects ||
      selectedSubjects.some((subject) => !gradeRules.subjects.includes(subject)) ||
      new Set(selectedSubjects).size !== selectedSubjects.length) {
      return sendJson(response, 400, { error: 'The selected grade and subjects are not a valid package.' });
    }

    const monthlyFee = gradeRules.prices[selectedSubjects.length - 1];
    const applicationNumber = createApplicationNumber();
    const payload = {
      application_number: applicationNumber,
      student: {
        name: studentName,
        dob: text(student.dob),
        gender: text(student.gender),
        email: studentEmail,
        phone: text(student.phone),
        school: text(student.school),
      },
      guardian: {
        name: guardianName,
        email: guardianEmail,
        phone: text(guardian.phone),
      },
      grade,
      mode,
      selected_subjects: selectedSubjects,
      goals,
      monthly_fee: monthlyFee,
      report_card_name: reportCardName,
      report_card_size: reportCardSize,
      report_card_extension: reportCardExtension,
      terms_accepted: termsAccepted,
      photo_consent: body.photoConsent === true,
      subjects: selectedSubjects.map((name) => {
        const mark = asObject(marks[name]);
        const currentMark = Number(mark.current);
        const targetMark = Number(mark.target);
        if (!Number.isFinite(currentMark) || currentMark < 0 || currentMark > 100 ||
          !Number.isFinite(targetMark) || targetMark < 0 || targetMark > 100) {
          throw new HttpError(400, `Invalid marks submitted for ${name}`);
        }
        return {
          name,
          current_mark: currentMark,
          target_mark: targetMark,
          difficulties: textArray(mark.difficulties),
        };
      }),
    };

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return sendJson(response, 503, { error: 'Supabase is not configured. Set the server-only project URL and service role key.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
    const databaseResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_enrollment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_payload: payload }),
    });

    if (!databaseResponse.ok) {
      const errorText = await databaseResponse.text();
      console.error('[Enrollment API] Supabase rejected submission', { status: databaseResponse.status, error: errorText.slice(0, 300) });
      return sendJson(response, 502, { error: 'Unable to save the enrollment. Please try again later.' });
    }

    const saved = await databaseResponse.json() as {
      id?: string;
      application_number?: string;
      student_number?: string;
      storage_path?: string;
    };
    if (!saved.id || saved.application_number !== applicationNumber || !saved.student_number || !saved.storage_path) {
      console.error('[Enrollment API] Supabase returned an invalid submission result');
      return sendJson(response, 502, { error: 'The enrollment could not be confirmed. Please contact support before retrying.' });
    }

    const signedUploadResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/upload/sign/learner-documents/${encodeStoragePath(saved.storage_path)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ upsert: false }),
      },
    );

    if (!signedUploadResponse.ok) {
      const errorText = await signedUploadResponse.text();
      console.error('[Enrollment API] Could not create private upload URL', {
        status: signedUploadResponse.status,
        error: errorText.slice(0, 300),
      });
      await fetch(`${supabaseUrl}/rest/v1/applications?id=eq.${encodeURIComponent(saved.id)}&status=eq.draft`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
      });
      return sendJson(response, 502, { error: 'Secure report-card upload could not be prepared. Please try again.' });
    }

    const signedUpload = await signedUploadResponse.json() as { url?: string; token?: string };
    if (!signedUpload.url || !signedUpload.token) {
      console.error('[Enrollment API] Supabase returned an incomplete signed upload response');
      return sendJson(response, 502, { error: 'Secure report-card upload could not be prepared. Please contact support.' });
    }

    const signedUploadUrl = new URL(`${supabaseUrl}/storage/v1${signedUpload.url}`);
    signedUploadUrl.searchParams.set('token', signedUpload.token);

    return sendJson(response, 201, {
      success: true,
      applicationId: saved.id,
      applicationNumber: saved.application_number,
      studentNumber: saved.student_number,
      uploadUrl: signedUploadUrl.toString(),
      reportCardMimeType,
      status: 'draft',
      monthlyFee,
      message: 'Enrollment details saved. Uploading the report card securely.',
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return sendJson(response, error.status, { error: error.message });
    }
    console.error('[Enrollment API] failed to save application', error instanceof Error ? error.message : 'Unknown error');
    return sendJson(response, 502, { error: 'The enrollment service could not complete your request. Please try again later.' });
  }
}
