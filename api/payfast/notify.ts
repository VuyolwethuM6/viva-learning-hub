import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const products: Record<string, { title: string; amount: string; file: string }> = {
  'Analytical Geometry Practice': {
    title: 'Analytical Geometry Practice',
    amount: '299.00',
    file: '02. Analytical Geometry Practice Questions.pdf',
  },
  'Finance Practice Questions': {
    title: 'Finance Practice Questions',
    amount: '399.00',
    file: '04. Finance Practice Questions.pdf',
  },
};

function signature(fields: Record<string, string>, passphrase?: string) {
  const payload = Object.entries(fields)
    .filter(([key, value]) => key !== 'signature' && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, '+')}`)
    .join('&');
  const signedPayload = passphrase ? `${payload}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}` : payload;
  return crypto.createHash('md5').update(signedPayload).digest('hex');
}

async function sendEmail(to: string[], subject: string, text: string, attachment: { filename: string; content: string }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text,
      attachments: [attachment],
    }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const raw = await request.text();
    const params = new URLSearchParams(raw);
    const fields = Object.fromEntries(params.entries());
    const product = products[fields.item_name];

    if (!product || fields.merchant_id !== process.env.PAYFAST_MERCHANT_ID || fields.amount !== product.amount) {
      return new Response('Invalid purchase', { status: 400 });
    }
    if (signature(fields, process.env.PAYFAST_PASSPHRASE) !== fields.signature) {
      return new Response('Invalid signature', { status: 400 });
    }

    const validationUrl = process.env.PAYFAST_VALIDATE_URL || 'https://sandbox.payfast.co.za/eng/query/validate';
    const validation = await fetch(validationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: raw,
    });
    if ((await validation.text()).trim() !== 'VALID') return new Response('Payment not validated', { status: 400 });
    if (fields.payment_status !== 'COMPLETE') return new Response('Payment incomplete', { status: 202 });
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.ADMIN_EMAIL) {
      return new Response('Email service is not configured', { status: 503 });
    }

    const filePath = path.join(process.cwd(), 'public', 'materials', product.file);
    const file = (await readFile(filePath)).toString('base64');
    const customerName = `${fields.name_first} ${fields.name_last}`.trim();
    const details = `Customer: ${customerName}\nEmail: ${fields.email_address}\nPhone: ${fields.cell_number}\nPDF: ${product.title}\nAmount: R${product.amount}\nPayment ID: ${fields.pf_payment_id || 'Sandbox transaction'}\nStatus: ${fields.payment_status}`;
    const attachment = { filename: product.file, content: file };

    await sendEmail([fields.email_address], `Your Viva Tutorials PDF: ${product.title}`, `Thank you for your payment. Your PDF is attached.\n\n${details}`, attachment);
    await sendEmail([process.env.ADMIN_EMAIL], `New PDF purchase: ${product.title}`, `A paid PDF was purchased.\n\n${details}`, attachment);

    return new Response('OK', { status: 200 });
  } catch {
    return new Response('Unable to process notification', { status: 500 });
  }
}
