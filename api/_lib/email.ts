// Shared Resend helper. Uses the same env vars as contact.ts: RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAIL.

export type EmailConfig = { key: string; from: string; admin: string };

export function getEmailConfig(): EmailConfig | null {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const admin = process.env.ADMIN_EMAIL;
  return key && from && admin ? { key, from, admin } : null;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

export async function sendEmail(
  config: EmailConfig,
  message: { to: string[]; subject: string; text: string; html: string; replyTo?: string },
) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[Email] provider rejected request', { status: response.status, body: body.slice(0, 200) });
    throw new Error(`Email provider returned ${response.status}`);
  }
}