import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { adminEmail, receiptEmail, sendEnrollmentEmails, type EnrollmentEmailData } from '../../api/_lib/enrollment-emails.ts';

const data: EnrollmentEmailData = {
  applicationId: '11111111-1111-4111-8111-111111111111',
  applicationNumber: 'VT-261026-ABCD1234',
  studentNumber: 'VTS-2026-0031',
  learnerName: 'Test <b>Learner</b>',
  learnerEmail: 'student@example.com',
  guardianName: 'Pat Parent',
  guardianEmail: 'Parent@Example.com',
  grade: 'Grade 11',
  mode: 'Online (Google Meet)',
  subjects: ['Mathematics', 'Physical Sciences'],
  monthlyFee: 800,
  reportCardPath: 'VTS-2026-0031/01-admin/report-card.png',
};
const supabase = { url: 'https://db.example', key: 'service-key' };

type Call = { url: string; body: Record<string, unknown> };
function mockFetch(opts: { alreadyClaimed?: Set<string>; resendStatus?: number }) {
  const calls: Call[] = [];
  const claimed = opts.alreadyClaimed ?? new Set<string>();
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body: Record<string, unknown> = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    calls.push({ url, body });
    if (url.endsWith('/rpc/claim_enrollment_email')) {
      const ok = !claimed.has(String(body.p_kind));
      if (ok) claimed.add(String(body.p_kind));
      return new Response(JSON.stringify(ok), { status: 200 });
    }
    if (url.endsWith('/rpc/release_enrollment_email')) {
      claimed.delete(String(body.p_kind));
      return new Response('null', { status: 200 });
    }
    if (url === 'https://api.resend.com/emails') {
      return new Response(JSON.stringify({ id: 'x' }), { status: opts.resendStatus ?? 200 });
    }
    return new Response('unexpected', { status: 500 });
  });
  return { calls, claimed };
}
const sends = (calls: Call[]) => calls.filter((call) => call.url === 'https://api.resend.com/emails');
const kinds = (calls: Call[], name: string) => calls.filter((call) => call.url.endsWith(name));

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('EMAIL_FROM', 'Viva <no-reply@vivatutorials.co.za>');
  vi.stubEnv('ADMIN_EMAIL', 'admin@vivatutorials.co.za');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('enrollment emails', () => {
  it('renders templates and escapes user input', () => {
    const receipt = receiptEmail(data);
    assert.ok(receipt.html.includes('VTS-2026-0031'));
    assert.ok(receipt.html.includes('No payment was taken'));
    assert.ok(!receipt.html.includes('2488806516'));
    assert.ok(!receipt.html.includes('your details will be deleted'));
    assert.ok(!receipt.html.includes('Google Classroom'));
    assert.ok(!receipt.html.includes('<b>Learner</b>'), 'learner name must be escaped');
    assert.ok(receipt.html.includes('Test &lt;b&gt;Learner&lt;/b&gt;'));
    assert.ok(receipt.text.includes('Student number: VTS-2026-0031'));
    assert.ok(receipt.text.includes('No payment was taken'));
    assert.ok(!receipt.text.includes('your details will be deleted'));
    assert.equal(receipt.subject, 'Application received: VTS-2026-0031');
    const admin = adminEmail(data);
    assert.ok(admin.html.includes('VTS-2026-0031/01-admin/report-card.png'));
  });

  it('sends receipt and admin alert with the correct recipients', async () => {
    const { calls } = mockFetch({});
    await sendEnrollmentEmails(supabase, data);
    const out = sends(calls);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0].body.to, ['parent@example.com', 'student@example.com']);
    assert.equal(out[0].body.reply_to, 'admin@vivatutorials.co.za');
    assert.deepEqual(out[1].body.to, ['admin@vivatutorials.co.za']);
    assert.equal(out[1].body.reply_to, 'Parent@Example.com');
  });

  it('does not resend emails whose claims are taken', async () => {
    const { calls } = mockFetch({ alreadyClaimed: new Set(['receipt', 'admin']) });
    await sendEnrollmentEmails(supabase, data);
    assert.equal(sends(calls).length, 0);
  });

  it('releases claims when the provider fails', async () => {
    const { calls, claimed } = mockFetch({ resendStatus: 500 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await sendEnrollmentEmails(supabase, data);
    assert.equal(kinds(calls, '/rpc/release_enrollment_email').length, 2);
    assert.equal(claimed.size, 0);
    assert.equal(kinds(calls, '/rpc/release_enrollment_email')[0].body.p_error, 'Email provider returned 500');
  });

  it('deduplicates learner and guardian addresses', async () => {
    const { calls } = mockFetch({});
    await sendEnrollmentEmails(supabase, { ...data, learnerEmail: 'PARENT@example.com' });
    assert.deepEqual(sends(calls)[0].body.to, ['parent@example.com']);
  });

  it('skips sending safely when configuration is missing', async () => {
    const { calls } = mockFetch({});
    vi.stubEnv('RESEND_API_KEY', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await sendEnrollmentEmails(supabase, data);
    assert.equal(calls.length, 0);
  });
});
