// @vitest-environment node
import { Readable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/enrollment-complete';
import { sendEnrollmentEmails } from '../../api/_lib/enrollment-emails';
import type { ApiRequest } from '../../api/_lib/http';
vi.mock('../../api/_lib/enrollment-emails', () => ({ sendEnrollmentEmails: vi.fn() }));
const id = '11111111-1111-4111-8111-111111111111';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function request() { return Object.assign(Readable.from([]), { method: 'POST', headers: {}, body: { applicationId: id } }) as ApiRequest; }
function response() {
  const result = { statusCode: 0, body: '', setHeader() {}, end(value: string) { this.body = value; } };
  return result as unknown as ServerResponse & typeof result;
}
function mock(status: string, final = { application_id: id, application_number: 'VT-TEST', student_number: 'VT-STUDENT', status: 'pending_review', document_id: 'doc-id' }, storage = { size: 100, mimetype: 'application/pdf' }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.includes('/rest/v1/applications?')) return json([{ id, application_number: 'VT-TEST', status, report_card_path: 'test/report.pdf', report_card_size: 100, report_card_name: 'report.pdf', monthly_fee: 800 }]);
    if (url.includes('/rest/v1/learners?')) return json([{ student_number: 'VT-STUDENT' }]);
    if (url.includes('/storage/v1/object/info/')) return json(storage);
    if (url.endsWith('/rpc/finalize_enrollment_document')) return json(final);
    throw new Error('Unexpected request');
  });
}
beforeEach(() => { vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('enrollment completion document invariant', () => {
  it.each(['draft', 'pending_review'])('requires verified metadata even when status is %s', async status => {
    const fetch = mock(status); const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(200);
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/rpc/finalize_enrollment_document'))).toBe(true);
    expect(sendEnrollmentEmails).toHaveBeenCalledOnce();
  });
  it('does not accept an old RPC response without a document identifier', async () => {
    const final = { application_id: id, application_number: 'VT-TEST', student_number: 'VT-STUDENT', status: 'pending_review', document_id: '' };
    mock('pending_review', final); const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(502);
    expect(sendEnrollmentEmails).not.toHaveBeenCalled();
  });
  it('rejects mismatched finalization references before sending email', async () => {
    mock('draft', { application_id: id, application_number: 'OTHER', student_number: 'VT-STUDENT', status: 'pending_review', document_id: 'doc-id' });
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(502); expect(sendEnrollmentEmails).not.toHaveBeenCalled();
  });
  it('does not finalize mismatched upload sizes on a pending-review retry', async () => {
    const fetch = mock('pending_review', undefined, { size: 101, mimetype: 'application/pdf' });
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(400);
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/rpc/finalize_enrollment_document'))).toBe(false);
  });
  it('does not reopen approved or active applications', async () => {
    const fetch = mock('active'); const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(409); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
