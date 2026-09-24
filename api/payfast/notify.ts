import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
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

function amountInCents(value: string | undefined) {
  const amount = Number.parseFloat(value || '');
  return Number.isFinite(amount) ? Math.round(amount * 100) : -1;
}

function signature(fields: Record<string, string>, passphrase?: string) {
  const payload = Object.entries(fields)
    .filter(([key, value]) => key !== 'signature' && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, '+')}`)
    .join('&');
  const signedPayload = passphrase ? `${payload}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}` : payload;
  return crypto.createHash('md5').update(signedPayload).digest('hex');
}

async function sendEmail(to: string[], subject: string, text: string, attachment: { filename: string; content: string }) {
  console.info('[PayFast ITN] sending email', { recipients: to, subject, attachment: attachment.filename });
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
  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[PayFast ITN] email provider rejected request', { status: response.status, body: errorBody });
    throw new Error(`Email provider returned ${response.status}`);
  }
  console.info('[PayFast ITN] email sent', { recipients: to });
}

function sendText(response: ServerResponse, status: number, message: string) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(message);
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  console.info('[PayFast ITN] notification received', { method: request.method });
  if (request.method !== 'POST') return sendText(response, 405, 'Method not allowed');

  try {
    const raw = await readBody(request);
    const params = new URLSearchParams(raw);
    const fields = Object.fromEntries(params.entries());
    const product = products[fields.item_name];
    console.info('[PayFast ITN] payload received', {
      item: fields.item_name,
      amount: fields.amount,
      status: fields.payment_status,
      paymentId: fields.pf_payment_id,
      customerEmail: fields.email_address,
    });

    const expectedAmount = amountInCents(product?.amount);
    const receivedAmountField = fields.amount_gross || fields.amount;
    const receivedAmount = amountInCents(receivedAmountField);
    if (!product || fields.merchant_id !== process.env.PAYFAST_MERCHANT_ID || receivedAmount !== expectedAmount) {
      console.error('[PayFast ITN] purchase validation failed', {
        productFound: Boolean(product),
        merchantMatches: fields.merchant_id === process.env.PAYFAST_MERCHANT_ID,
        amountMatches: product ? receivedAmount === expectedAmount : false,
        receivedAmountField: fields.amount_gross ? 'amount_gross' : 'amount',
        receivedAmount: receivedAmount === -1 ? 'invalid' : receivedAmount,
        expectedAmount: expectedAmount === -1 ? 'invalid' : expectedAmount,
      });
      return sendText(response, 400, 'Invalid purchase');
    }
    if (signature(fields, process.env.PAYFAST_PASSPHRASE) !== fields.signature) {
      console.error('[PayFast ITN] signature mismatch');
      return sendText(response, 400, 'Invalid signature');
    }

    const validationUrl = process.env.PAYFAST_VALIDATE_URL || 'https://sandbox.payfast.co.za/eng/query/validate';
    const validation = await fetch(validationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: raw,
    });
    const validationResult = (await validation.text()).trim();
    console.info('[PayFast ITN] PayFast validation result', { validationResult });
    if (validationResult !== 'VALID') return sendText(response, 400, 'Payment not validated');
    if (fields.payment_status !== 'COMPLETE') return sendText(response, 202, 'Payment incomplete');
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.ADMIN_EMAIL) {
      console.error('[PayFast ITN] email configuration missing', {
        hasResendKey: Boolean(process.env.RESEND_API_KEY),
        hasFrom: Boolean(process.env.EMAIL_FROM),
        hasAdminEmail: Boolean(process.env.ADMIN_EMAIL),
      });
      return sendText(response, 503, 'Email service is not configured');
    }

    const filePath = path.join(process.cwd(), 'public', 'materials', product.file);
    console.info('[PayFast ITN] attempting to read PDF', { filePath, cwd: process.cwd() });
    let file: string;
    try {
      file = (await readFile(filePath)).toString('base64');
      console.info('[PayFast ITN] PDF loaded', { file: product.file, bytes: file.length });
    } catch (fileError) {
      console.error('[PayFast ITN] PDF file not found or unreadable', { filePath, error: fileError instanceof Error ? fileError.message : 'unknown' });
      return sendText(response, 200, 'OK');
    }
    const customerName = `${fields.name_first} ${fields.name_last}`.trim();
    const details = `Customer: ${customerName}\nEmail: ${fields.email_address}\nPhone: ${fields.cell_number}\nPDF: ${product.title}\nAmount: R${product.amount}\nPayment ID: ${fields.pf_payment_id || 'Sandbox transaction'}\nStatus: ${fields.payment_status}`;
    const attachment = { filename: product.file, content: file };

    try {
      await sendEmail([fields.email_address], `Your Viva Tutorials PDF: ${product.title}`, `Thank you for your payment. Your PDF is attached.\n\n${details}`, attachment);
    } catch (emailError) {
      console.error('[PayFast ITN] customer email failed', { email: fields.email_address, error: emailError instanceof Error ? emailError.message : 'unknown' });
    }
    try {
      await sendEmail([process.env.ADMIN_EMAIL], `New PDF purchase: ${product.title}`, `A paid PDF was purchased.\n\n${details}`, attachment);
    } catch (emailError) {
      console.error('[PayFast ITN] admin email failed', { email: process.env.ADMIN_EMAIL, error: emailError instanceof Error ? emailError.message : 'unknown' });
    }

    return sendText(response, 200, 'OK');
  } catch (error) {
    console.error('[PayFast ITN] unhandled exception', { error: error instanceof Error ? error.message : 'unknown error', stack: error instanceof Error ? error.stack : '' });
    return sendText(response, 200, 'OK');
  }
}
