import { debug, serviceHeaders } from './http.js';
import { escapeHtml, getEmailConfig, sendEmail } from './email.js';

const SCOPE = 'Enrollment email';

export type EnrollmentEmailData = {
  applicationId: string;
  applicationNumber: string;
  studentNumber: string;
  learnerName: string;
  learnerEmail: string;
  guardianName: string;
  guardianEmail: string;
  grade: string;
  mode: string;
  subjects: string[];
  monthlyFee: number;
  reportCardPath: string;
};

type SupabaseConfig = { url: string; key: string };
type EmailKind = 'receipt' | 'admin';

const LOGO = 'https://www.vivatutorials.co.za/viva-tutorials-logo.png';

const darkModeStyles = `
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .email-body, .email-bg { background-color:#111019 !important; }
    .email-card { background-color:#1d1a27 !important; }
    .email-primary { color:#f5f1ff !important; }
    .email-secondary { color:#e2ddec !important; }
    .email-muted { color:#bcb2cf !important; }
    .email-lavender { background-color:#302741 !important; }
    .email-orange { background-color:#35261f !important; }
    .email-border { border-color:#4a4058 !important; }
  }
</style>`;

const formatFee = (fee: number) => `R${fee.toLocaleString('en-ZA')}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-ZA', { dateStyle: 'long', timeZone: 'Africa/Johannesburg' }).format(date);

function row(label: string, value: string, last = false) {
  const border = last ? '' : 'border-bottom:1px solid #eeeeee;';
  return `<tr>
    <td class="email-muted email-border" style="padding:11px 14px;${border}color:#666666;font-size:13px;width:38%;">${escapeHtml(label)}</td>
    <td class="email-primary email-border" style="padding:11px 14px;${border}color:#160F2E;font-size:13px;font-weight:700;word-break:break-word;">${escapeHtml(value)}</td>
  </tr>`;
}

function table(rows: Array<[string, string]>) {
  return `<table class="email-border" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #DDD6F0;">
    ${rows.map(([label, value], index) => row(label, value, index === rows.length - 1)).join('')}
  </table>`;
}

function shell({ title, preheader, label, body }: { title: string; preheader: string; label: string; body: string }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
${darkModeStyles}
</head>
<body class="email-body" style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f4;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
  <table class="email-bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
        <tr><td class="email-card" style="background-color:#ffffff;border-radius:12px 12px 0 0;padding:24px 28px 0 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" align="left"><img src="${LOGO}" alt="Viva Tutorials" height="48" style="display:block;height:48px;width:auto;border:0;"></td>
            <td valign="middle" align="right">
              <div style="color:#7A4AF1;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(label)}</div>
              <div class="email-muted" style="color:#666666;font-size:12px;font-weight:600;margin-top:4px;">${escapeHtml(formatDate(new Date()))}</div>
            </td>
          </tr></table>
          <div style="height:4px;margin-top:20px;border-radius:2px;background-color:#7A4AF1;background-image:linear-gradient(90deg,#7A4AF1 0%,#F27435 100%);font-size:0;line-height:0;">&nbsp;</div>
        </td></tr>
        ${body}
        <tr><td class="email-card" align="center" style="background-color:#ffffff;padding:0 28px 28px 28px;border-radius:0 0 12px 12px;">
          <p class="email-secondary" style="margin:0 0 4px 0;color:#333333;font-size:14px;font-weight:700;">The Viva Tutorials Team</p>
          <p class="email-muted" style="margin:0;color:#8878AD;font-size:12px;">Learn. Practise. Succeed.</p>
        </td></tr>
        <tr><td class="email-muted" align="center" style="padding:18px 12px 0 12px;color:#777777;font-size:12px;line-height:1.6;">
          Need help? Contact us at <a href="mailto:info@vivatutorials.co.za" style="color:#7A4AF1;text-decoration:none;font-weight:600;">info@vivatutorials.co.za</a><br>
          <a href="https://vivatutorials.co.za" style="color:#7A4AF1;text-decoration:none;">vivatutorials.co.za</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function section(content: string, padding = '20px 28px 8px 28px') {
  return `<tr><td class="email-card" style="background-color:#ffffff;padding:${padding};">${content}</td></tr>`;
}

export function receiptEmail(data: EnrollmentEmailData) {
  const fee = formatFee(data.monthlyFee);
  const greeting = `Hello ${firstName(data.guardianName)} and ${firstName(data.learnerName)},`;

  const body = [
    section(
      `<h1 class="email-primary" style="margin:0 0 12px 0;color:#160F2E;font-size:22px;line-height:1.3;font-weight:700;">Application received</h1>
       <p class="email-secondary" style="margin:0 0 10px 0;color:#333333;font-size:14px;line-height:1.7;">${escapeHtml(greeting)}</p>
       <p class="email-secondary" style="margin:0;color:#333333;font-size:14px;line-height:1.7;">Thank you for applying to Viva Tutorials. We have received the application for <strong>${escapeHtml(data.learnerName)}</strong> and it is now <strong style="color:#F27435;">pending</strong> while we review it.</p>`,
      '28px 28px 8px 28px',
    ),
    section(
      `<table class="email-lavender" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0EBFF;border-left:5px solid #7A4AF1;border-radius:8px;"><tr><td style="padding:16px 18px;">
         <div style="color:#7A4AF1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Student number</div>
         <div class="email-primary" style="color:#160F2E;font-size:22px;font-weight:800;letter-spacing:.04em;">${escapeHtml(data.studentNumber)}</div>
         <div class="email-muted" style="color:#8878AD;font-size:12px;margin-top:4px;">Keep this safe. Quote it when contacting us about your application.</div>
       </td></tr></table>`,
    ),
    section(
      `<div class="email-primary" style="color:#160F2E;font-size:16px;font-weight:700;margin-bottom:12px;">Application summary</div>
       ${table([
         ['Application reference', data.applicationNumber],
         ['Learner', data.learnerName],
         ['Grade', data.grade],
         ['Subjects', data.subjects.join(', ') || '—'],
         ['Mode', data.mode],
         ['Monthly fee', fee],
       ])}`,
    ),
    section(
      `<div class="email-primary" style="color:#160F2E;font-size:16px;font-weight:700;margin-bottom:12px;">What happens next?</div>
       <p class="email-secondary" style="color:#333333;font-size:14px;line-height:1.7;">Our team will review your application and report card and contact you about the next steps. Your place and session schedule are still subject to review.</p>
       <p class="email-secondary" style="color:#333333;font-size:14px;line-height:1.7;">No payment was taken by the enrollment form. Contact our team to confirm tuition payment instructions and enrollment arrangements. Keep your student number and application reference for your records.</p>`,
      '20px 28px 28px 28px',
    ),
  ].join('\n');

  const text = [
    greeting,
    '',
    `Thank you for applying to Viva Tutorials. We have received the application for ${data.learnerName} and it is now pending review.`,
    '',
    `Student number: ${data.studentNumber}`,
    `Application reference: ${data.applicationNumber}`,
    `Grade: ${data.grade}`,
    `Subjects: ${data.subjects.join(', ') || '-'}`,
    `Mode: ${data.mode}`,
    `Monthly fee: ${fee}`,
    '',
    'Our team will review your application and report card and contact you about the next steps.',
    'Your place and session schedule are still subject to review.',
    'No payment was taken by the enrollment form. Contact our team to confirm tuition payment instructions and enrollment arrangements.',
    'Keep your student number and application reference for your records.',
    '',
    'The Viva Tutorials Team',
  ].join('\n');

  return {
    subject: `Application received: ${data.studentNumber}`,
    html: shell({
      title: 'Application received',
      preheader: `We received the application for ${data.learnerName}. Your student number is ${data.studentNumber}.`,
      label: 'Application received',
      body,
    }),
    text,
  };
}

export function adminEmail(data: EnrollmentEmailData) {
  const fee = formatFee(data.monthlyFee);
  const body = [
    section(
      `<h1 class="email-primary" style="margin:0 0 12px 0;color:#160F2E;font-size:22px;line-height:1.3;font-weight:700;">New application to review</h1>
       <p class="email-secondary" style="margin:0;color:#333333;font-size:14px;line-height:1.7;">${escapeHtml(data.learnerName)} has applied and the report card upload is verified. Status: <strong>pending_review</strong>.</p>`,
      '28px 28px 8px 28px',
    ),
    section(
      table([
        ['Student number', data.studentNumber],
        ['Application reference', data.applicationNumber],
        ['Learner', data.learnerName],
        ['Student email', data.learnerEmail],
        ['Parent / guardian', data.guardianName],
        ['Guardian email', data.guardianEmail],
        ['Grade', data.grade],
        ['Subjects', data.subjects.join(', ') || '—'],
        ['Mode', data.mode],
        ['Monthly fee', fee],
        ['Report card (private)', data.reportCardPath],
      ]),
      '20px 28px 28px 28px',
    ),
  ].join('\n');

  const text = [
    `New application: ${data.learnerName} (${data.studentNumber})`,
    `Application reference: ${data.applicationNumber}`,
    `Student email: ${data.learnerEmail}`,
    `Guardian: ${data.guardianName} <${data.guardianEmail}>`,
    `Grade: ${data.grade}`,
    `Subjects: ${data.subjects.join(', ') || '-'}`,
    `Mode: ${data.mode}`,
    `Monthly fee: ${fee}`,
    `Report card (private storage): ${data.reportCardPath}`,
  ].join('\n');

  return {
    subject: `New application: ${data.learnerName} (${data.studentNumber})`,
    html: shell({
      title: 'New application',
      preheader: `${data.learnerName} applied for ${data.grade}.`,
      label: 'New application',
      body,
    }),
    text,
  };
}

async function callRpc(supabase: SupabaseConfig, name: string, body: Record<string, unknown>) {
  return fetch(`${supabase.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(supabase.key),
    body: JSON.stringify(body),
  });
}

async function claim(supabase: SupabaseConfig, applicationId: string, kind: EmailKind) {
  const response = await callRpc(supabase, 'claim_enrollment_email', { p_application_id: applicationId, p_kind: kind });
  if (!response.ok) throw new Error(`claim_enrollment_email returned ${response.status}`);
  return (await response.json()) === true;
}

async function release(supabase: SupabaseConfig, applicationId: string, kind: EmailKind, reason: string) {
  try {
    await callRpc(supabase, 'release_enrollment_email', {
      p_application_id: applicationId,
      p_kind: kind,
      p_error: reason,
    });
  } catch (error) {
    console.error(`[${SCOPE}] could not release claim`, { kind, error: error instanceof Error ? error.message : 'unknown' });
  }
}

async function sendOnce(
  supabase: SupabaseConfig,
  data: EnrollmentEmailData,
  kind: EmailKind,
  send: () => Promise<void>,
) {
  let claimed = false;
  try {
    claimed = await claim(supabase, data.applicationId, kind);
    if (!claimed) {
      debug(SCOPE, 'already sent, skipping', { kind });
      return;
    }
    await send();
    console.log(`[${SCOPE}] sent`, { kind, applicationNumber: data.applicationNumber });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    console.error(`[${SCOPE}] failed`, { kind, applicationNumber: data.applicationNumber, reason });
    if (claimed) await release(supabase, data.applicationId, kind, reason);
  }
}

/**
 * Sends the family receipt and the admin alert, each at most once per application.
 * Never throws: the enrollment is already saved, so an email problem must not fail it.
 */
export async function sendEnrollmentEmails(supabase: SupabaseConfig, data: EnrollmentEmailData) {
  const config = getEmailConfig();
  if (!config) {
    console.error(`[${SCOPE}] not configured`, {
      hasResendKey: Boolean(process.env.RESEND_API_KEY),
      hasFrom: Boolean(process.env.EMAIL_FROM),
      hasAdminEmail: Boolean(process.env.ADMIN_EMAIL),
    });
    return;
  }

  const recipients = Array.from(new Set([data.guardianEmail, data.learnerEmail].map((email) => email.trim().toLowerCase()).filter(Boolean)));

  await sendOnce(supabase, data, 'receipt', async () => {
    const message = receiptEmail(data);
    await sendEmail(config, { to: recipients, replyTo: config.admin, ...message });
  });

  await sendOnce(supabase, data, 'admin', async () => {
    const message = adminEmail(data);
    await sendEmail(config, { to: [config.admin], replyTo: data.guardianEmail, ...message });
  });
}