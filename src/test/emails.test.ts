// Run from the project root:
//   node --experimental-strip-types --no-warnings tests/emails.test.ts
// (imports use .js because Vercel needs that; the runner script below rewrites them for Node.)
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

type Call = { url: string; body: any };
function mockFetch(opts: { alreadyClaimed?: Set<string>; resendStatus?: number }) {
  const calls: Call[] = [];
  const claimed = opts.alreadyClaimed ?? new Set<string>();
  globalThis.fetch = (async (url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ url, body });
    if (url.endsWith('/rpc/claim_enrollment_email')) {
      const ok = !claimed.has(body.p_kind);
      if (ok) claimed.add(body.p_kind);
      return new Response(JSON.stringify(ok), { status: 200 });
    }
    if (url.endsWith('/rpc/release_enrollment_email')) {
      claimed.delete(body.p_kind);
      return new Response('null', { status: 200 });
    }
    if (url === 'https://api.resend.com/emails') {
      return new Response(JSON.stringify({ id: 'x' }), { status: opts.resendStatus ?? 200 });
    }
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;
  return { calls, claimed };
}
const sends = (calls: Call[]) => calls.filter((call) => call.url === 'https://api.resend.com/emails');
const kinds = (calls: Call[], name: string) => calls.filter((call) => call.url.endsWith(name));

process.env.RESEND_API_KEY = 're_test';
process.env.EMAIL_FROM = 'Viva <no-reply@vivatutorials.co.za>';
process.env.ADMIN_EMAIL = 'admin@vivatutorials.co.za';

// 1. Templates: content present, user input escaped.
const receipt = receiptEmail(data, new Date('2026-10-26T10:00:00Z'));
assert.ok(receipt.html.includes('VTS-2026-0031'));
assert.ok(receipt.html.includes('2488806516'));
assert.ok(!receipt.html.includes('<b>Learner</b>'), 'learner name must be escaped');
assert.ok(receipt.html.includes('Test &lt;b&gt;Learner&lt;/b&gt;'));
assert.ok(receipt.text.includes('Payment reference: VTS-2026-0031'));
assert.ok(receipt.html.includes('25 November 2026') || receipt.html.includes('25 November'), '30-day date');
assert.equal(receipt.subject, 'Application received: VTS-2026-0031');
const admin = adminEmail(data);
assert.ok(admin.html.includes('VTS-2026-0031/01-admin/report-card.png'));
console.log('ok  templates render and escape input');

// 2. First call sends both emails; recipients lower-cased; admin reply-to is the guardian.
{
  const { calls } = mockFetch({});
  await sendEnrollmentEmails(supabase, data);
  const out = sends(calls);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].body.to, ['parent@example.com', 'student@example.com']);
  assert.equal(out[0].body.reply_to, 'admin@vivatutorials.co.za');
  assert.deepEqual(out[1].body.to, ['admin@vivatutorials.co.za']);
  assert.equal(out[1].body.reply_to, 'Parent@Example.com');
  console.log('ok  first completion sends receipt + admin alert');
}

// 3. Retry after success sends nothing (claims already taken).
{
  const { calls } = mockFetch({ alreadyClaimed: new Set(['receipt', 'admin']) });
  await sendEnrollmentEmails(supabase, data);
  assert.equal(sends(calls).length, 0);
  console.log('ok  retry sends no duplicates');
}

// 4. Resend failing: does not throw, releases both claims so a later call can retry.
{
  const { calls, claimed } = mockFetch({ resendStatus: 500 });
  const realError = console.error;
  console.error = () => {};
  await sendEnrollmentEmails(supabase, data);
  console.error = realError;
  assert.equal(kinds(calls, '/rpc/release_enrollment_email').length, 2);
  assert.equal(claimed.size, 0);
  assert.equal(kinds(calls, '/rpc/release_enrollment_email')[0].body.p_error, 'Email provider returned 500');
  console.log('ok  provider failure never throws and releases the claim');
}

// 5. Student and guardian share an address: one recipient only.
{
  const { calls } = mockFetch({});
  await sendEnrollmentEmails(supabase, { ...data, learnerEmail: 'PARENT@example.com' });
  assert.deepEqual(sends(calls)[0].body.to, ['parent@example.com']);
  console.log('ok  duplicate addresses collapse');
}

// 6. Not configured: nothing sent, nothing claimed, no throw.
{
  const { calls } = mockFetch({});
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const realError = console.error;
  console.error = () => {};
  await sendEnrollmentEmails(supabase, data);
  console.error = realError;
  process.env.RESEND_API_KEY = saved;
  assert.equal(calls.length, 0);
  console.log('ok  missing configuration is skipped safely');
}
console.log('\nall email checks passed');