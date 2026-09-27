import type { IncomingMessage, ServerResponse } from 'node:http';

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 16 * 1024) throw new Error('Request body too large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function respond(response: ServerResponse, status: number, body: Record<string, string>) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') return respond(response, 405, { error: 'Method not allowed' });
  try {
    const body = await readBody(request);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const subject = String(body.subject || '').trim();
    const message = String(body.message || '').trim();
    if (!name || !subject || !message || !/^\S+@\S+\.\S+$/.test(email)) return respond(response, 400, { error: 'Complete contact details are required.' });
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.ADMIN_EMAIL) return respond(response, 503, { error: 'Email service is not configured.' });
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [process.env.ADMIN_EMAIL],
        reply_to: email,
        subject: `Website contact: ${subject}`,
        text: `Name: ${name}\nEmail: ${email}\nPhone: ${String(body.phone || '').trim()}\n\n${message}`,
      }),
    });
    if (!emailResponse.ok) return respond(response, 502, { error: 'Email provider rejected the message.' });
    return respond(response, 200, { message: 'Message sent.' });
  } catch {
    return respond(response, 400, { error: 'Invalid request.' });
  }
}
