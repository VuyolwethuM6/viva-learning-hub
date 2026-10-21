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
const payfastValidationUrl = 'https://www.payfast.co.za/eng/query/validate';
const deliveredPaymentIds = new Set<string>();

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

function rawSignature(rawBody: string, passphrase?: string) {
  const payload = rawBody
    .split('&')
    .filter((part) => !part.startsWith('signature='))
    .join('&');
  const encodedPassphrase = passphrase
    ? `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
    : '';
  return crypto.createHash('md5').update(`${payload}${encodedPassphrase}`).digest('hex');
}

async function sendEmail(
  to: string[],
  subject: string,
  text: string,
  attachment: { filename: string; content: string },
  html?: string,
) {
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
      ...(html ? { html } : {}),
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

const emailColorSchemeStyles = `
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
    .email-row-alt { background-color:#272331 !important; }
  }
</style>`;

function customerEmailHtml({
  customerName,
  customerFirstName,
  customerEmail,
  itemName,
  fileName,
  amount,
  paymentId,
}: {
  customerName: string;
  customerFirstName: string;
  customerEmail: string;
  itemName: string;
  fileName: string;
  amount: string;
  paymentId: string;
}) {
  const values = {
    customerName: escapeHtml(customerName),
    customerFirstName: escapeHtml(customerFirstName),
    customerEmail: escapeHtml(customerEmail),
    itemName: escapeHtml(itemName),
    fileName: escapeHtml(fileName),
    amount: escapeHtml(amount),
    paymentId: escapeHtml(paymentId),
    date: escapeHtml(new Intl.DateTimeFormat('en-ZA', {
      dateStyle: 'long',
      timeZone: 'Africa/Johannesburg',
    }).format(new Date())),
  };

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Your Viva Tutorials PDF</title>
${emailColorSchemeStyles}
</head>
<body class="email-body" style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f4;font-size:1px;line-height:1px;">
    Payment received. Your PDF, ${values.itemName}, is attached to this email.
  </div>
  <table class="email-bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
        <tr><td class="email-card" style="background-color:#ffffff;border-radius:12px 12px 0 0;padding:24px 28px 0 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" align="left"><img src="https://www.vivatutorials.co.za/viva-tutorials-logo.png" alt="Viva Tutorials" height="48" style="display:block;height:48px;width:auto;border:0;"></td>
            <td valign="middle" align="right">
              <div style="color:#7A4AF1;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Payment Received</div>
              <div class="email-muted" style="color:#666666;font-size:12px;font-weight:600;margin-top:4px;">${values.date}</div>
            </td>
          </tr></table>
          <div style="height:4px;margin-top:20px;border-radius:2px;background-color:#7A4AF1;background-image:linear-gradient(90deg,#7A4AF1 0%,#F27435 100%);font-size:0;line-height:0;">&nbsp;</div>
        </td></tr>
        <tr><td class="email-card" style="background-color:#ffffff;padding:28px 28px 8px 28px;">
          <h1 class="email-primary" style="margin:0 0 12px 0;color:#160F2E;font-size:22px;line-height:1.3;font-weight:700;">Thank you, ${values.customerFirstName}!</h1>
          <p class="email-secondary" style="margin:0;color:#333333;font-size:14px;line-height:1.7;">Your payment was successful and your study material is ready. You'll find your PDF attached to this email.</p>
        </td></tr>
        <tr><td class="email-card" style="background-color:#ffffff;padding:20px 28px 8px 28px;">
          <table class="email-lavender" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0EBFF;border-left:5px solid #7A4AF1;border-radius:8px;"><tr>
            <td style="padding:16px 18px;">
              <div style="color:#7A4AF1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Attached PDF</div>
              <div class="email-primary" style="color:#160F2E;font-size:16px;font-weight:800;line-height:1.4;">${values.itemName}</div>
              <div class="email-muted" style="color:#8878AD;font-size:12px;margin-top:4px;word-break:break-all;">${values.fileName}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td class="email-card" style="background-color:#ffffff;padding:20px 28px 8px 28px;">
          <div class="email-primary" style="color:#160F2E;font-size:16px;font-weight:700;margin-bottom:12px;">Order Summary</div>
          <table class="email-border" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #DDD6F0;">
            <tr style="background-color:#7A4AF1;">
              <td style="padding:11px 14px;color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Item</td>
              <td align="right" style="padding:11px 14px;color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Amount</td>
            </tr>
            <tr>
              <td class="email-border email-secondary" style="padding:14px;border-bottom:1px solid #eeeeee;color:#333333;font-size:14px;">${values.itemName}</td>
              <td class="email-border email-primary" align="right" style="padding:14px;border-bottom:1px solid #eeeeee;color:#160F2E;font-size:15px;font-weight:800;white-space:nowrap;">R${values.amount}</td>
            </tr>
            <tr class="email-row-alt" style="background-color:#f8f6ff;">
              <td class="email-primary" style="padding:14px;color:#160F2E;font-size:14px;font-weight:800;">TOTAL PAID</td>
              <td align="right" style="padding:14px;color:#7A4AF1;font-size:18px;font-weight:900;white-space:nowrap;">R${values.amount}</td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
            <tr><td class="email-muted" style="padding:6px 0;color:#666666;font-size:13px;width:40%;">Payment ID</td><td class="email-primary" style="padding:6px 0;color:#160F2E;font-size:13px;font-weight:700;">${values.paymentId}</td></tr>
            <tr><td class="email-muted" style="padding:6px 0;color:#666666;font-size:13px;">Name</td><td class="email-primary" style="padding:6px 0;color:#160F2E;font-size:13px;font-weight:700;">${values.customerName}</td></tr>
            <tr><td class="email-muted" style="padding:6px 0;color:#666666;font-size:13px;">Email</td><td class="email-primary" style="padding:6px 0;color:#160F2E;font-size:13px;font-weight:700;word-break:break-all;">${values.customerEmail}</td></tr>
            <tr><td style="padding:6px 0;color:#666666;font-size:13px;">Status</td><td style="padding:6px 0;"><span style="background-color:#D6F7E8;color:#0FA958;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:800;">&#10003; PAID</span></td></tr>
          </table>
        </td></tr>
        <tr><td class="email-card" style="background-color:#ffffff;padding:20px 28px 28px 28px;">
          <table class="email-orange" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff7f1;border-left:4px solid #F27435;border-radius:6px;"><tr>
            <td class="email-secondary" style="padding:14px 16px;color:#333333;font-size:13px;line-height:1.6;"><strong style="color:#F27435;">Can't see the attachment?</strong><br>Check your spam folder or download it from a desktop browser. Still stuck? Reply to this email with your Payment ID and we'll sort it out.</td>
          </tr></table>
        </td></tr>
        <tr><td class="email-card" align="center" style="background-color:#ffffff;padding:0 28px 28px 28px;border-radius:0 0 12px 12px;">
          <p class="email-secondary" style="margin:0 0 4px 0;color:#333333;font-size:14px;font-weight:700;">The Viva Tutorials Team</p>
          <p class="email-muted" style="margin:0;color:#8878AD;font-size:12px;">Learn. Practise. Succeed.</p>
        </td></tr>
        <tr><td class="email-muted" align="center" style="padding:18px 12px 0 12px;color:#777777;font-size:12px;line-height:1.6;">
          Need help? Contact us at <a href="mailto:info@vivatutorials.co.za" style="color:#7A4AF1;text-decoration:none;font-weight:600;">info@vivatutorials.co.za</a><br>
          <a href="https://vivatutorials.co.za" style="color:#7A4AF1;text-decoration:none;">vivatutorials.co.za</a>
          <div style="margin-top:10px;color:#999999;font-size:11px;">This material is for your personal use only. Please do not share or redistribute it.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function adminEmailHtml({
  customerName,
  customerEmail,
  customerPhone,
  itemName,
  fileName,
  amount,
  paymentId,
}: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  itemName: string;
  fileName: string;
  amount: string;
  paymentId: string;
}) {
  const values = {
    customerName: escapeHtml(customerName),
    customerEmail: escapeHtml(customerEmail),
    customerPhone: escapeHtml(customerPhone),
    itemName: escapeHtml(itemName),
    fileName: escapeHtml(fileName),
    amount: escapeHtml(amount),
    paymentId: escapeHtml(paymentId),
    date: escapeHtml(new Intl.DateTimeFormat('en-ZA', {
      dateStyle: 'long',
      timeZone: 'Africa/Johannesburg',
    }).format(new Date())),
  };

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>New PDF Purchase</title>
${emailColorSchemeStyles}
</head>
<body class="email-body" style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f4;font-size:1px;line-height:1px;">A new payment was confirmed for ${values.itemName}.</div>
  <table class="email-bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
        <tr><td class="email-card" style="background-color:#ffffff;border-radius:12px 12px 0 0;padding:24px 28px 0 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" align="left"><img src="https://www.vivatutorials.co.za/viva-tutorials-logo.png" alt="Viva Tutorials" height="48" style="display:block;height:48px;width:auto;border:0;"></td>
            <td valign="middle" align="right">
              <div style="color:#7A4AF1;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">New Purchase</div>
              <div class="email-muted" style="color:#666666;font-size:12px;font-weight:600;margin-top:4px;">${values.date}</div>
            </td>
          </tr></table>
          <div style="height:4px;margin-top:20px;border-radius:2px;background-color:#7A4AF1;background-image:linear-gradient(90deg,#7A4AF1 0%,#F27435 100%);font-size:0;line-height:0;">&nbsp;</div>
        </td></tr>
        <tr><td class="email-card" style="background-color:#ffffff;padding:28px 28px 8px 28px;">
          <h1 class="email-primary" style="margin:0 0 12px 0;color:#160F2E;font-size:22px;line-height:1.3;font-weight:700;">Payment confirmed</h1>
          <p class="email-secondary" style="margin:0;color:#333333;font-size:14px;line-height:1.7;">A customer has completed a purchase. The purchased PDF is attached for your records.</p>
        </td></tr>
        <tr><td class="email-card" style="background-color:#ffffff;padding:20px 28px 8px 28px;">
          <table class="email-lavender" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0EBFF;border-left:5px solid #7A4AF1;border-radius:8px;"><tr>
            <td style="padding:16px 18px;">
              <div style="color:#7A4AF1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Purchased PDF</div>
              <div class="email-primary" style="color:#160F2E;font-size:16px;font-weight:800;line-height:1.4;">${values.itemName}</div>
              <div class="email-muted" style="color:#8878AD;font-size:12px;margin-top:4px;word-break:break-all;">${values.fileName}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td class="email-card" style="background-color:#ffffff;padding:20px 28px 28px 28px;">
          <div class="email-primary" style="color:#160F2E;font-size:16px;font-weight:700;margin-bottom:12px;">Purchase details</div>
          <table class="email-border" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #DDD6F0;">
            <tr><td class="email-muted email-border" style="padding:12px 14px;border-bottom:1px solid #eeeeee;color:#666666;font-size:13px;width:38%;">Customer</td><td class="email-primary email-border" style="padding:12px 14px;border-bottom:1px solid #eeeeee;color:#160F2E;font-size:13px;font-weight:700;">${values.customerName}</td></tr>
            <tr><td class="email-muted email-border" style="padding:12px 14px;border-bottom:1px solid #eeeeee;color:#666666;font-size:13px;">Email</td><td class="email-primary email-border" style="padding:12px 14px;border-bottom:1px solid #eeeeee;color:#160F2E;font-size:13px;font-weight:700;word-break:break-all;">${values.customerEmail}</td></tr>
            <tr><td class="email-muted email-border" style="padding:12px 14px;border-bottom:1px solid #eeeeee;color:#666666;font-size:13px;">Phone</td><td class="email-primary email-border" style="padding:12px 14px;border-bottom:1px solid #eeeeee;color:#160F2E;font-size:13px;font-weight:700;">${values.customerPhone}</td></tr>
            <tr><td class="email-muted email-border" style="padding:12px 14px;border-bottom:1px solid #eeeeee;color:#666666;font-size:13px;">Payment ID</td><td class="email-primary email-border" style="padding:12px 14px;border-bottom:1px solid #eeeeee;color:#160F2E;font-size:13px;font-weight:700;">${values.paymentId}</td></tr>
            <tr><td class="email-muted" style="padding:12px 14px;color:#666666;font-size:13px;">Amount paid</td><td style="padding:12px 14px;color:#7A4AF1;font-size:16px;font-weight:800;">R${values.amount}</td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
            <tr><td><span style="background-color:#D6F7E8;color:#0FA958;padding:5px 12px;border-radius:12px;font-size:12px;font-weight:800;">&#10003; PAYMENT COMPLETE</span></td></tr>
          </table>
        </td></tr>
        <tr><td align="center" class="email-card" style="background-color:#ffffff;padding:0 28px 28px 28px;border-radius:0 0 12px 12px;">
          <p class="email-muted" style="margin:0;color:#8878AD;font-size:12px;">Viva Tutorials · Learn. Practise. Succeed.</p>
        </td></tr>
        <tr><td class="email-muted" align="center" style="padding:18px 12px 0 12px;color:#777777;font-size:12px;line-height:1.6;">
          <a href="https://vivatutorials.co.za" style="color:#7A4AF1;text-decoration:none;">vivatutorials.co.za</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function sendText(response: ServerResponse, status: number, message: string) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(message);
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error('Request body too large');
    chunks.push(buffer);
  }
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
    const expectedRawSignature = rawSignature(raw, process.env.PAYFAST_PASSPHRASE);
    const expectedParsedSignature = signature(fields, process.env.PAYFAST_PASSPHRASE);
    const signatureMatches = fields.signature === expectedRawSignature || fields.signature === expectedParsedSignature;
    if (!signatureMatches) {
      console.error('[PayFast ITN] signature mismatch', {
        received: fields.signature,
        rawMatch: fields.signature === expectedRawSignature,
        parsedMatch: fields.signature === expectedParsedSignature,
      });
      return sendText(response, 400, 'Invalid signature');
    }

    const validation = await fetch(payfastValidationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: raw,
    });
    const validationResult = (await validation.text()).trim();
    console.info('[PayFast ITN] PayFast validation result', { validationResult });
    if (validationResult !== 'VALID') return sendText(response, 400, 'Payment not validated');
    if (fields.payment_status !== 'COMPLETE') return sendText(response, 202, 'Payment incomplete');
    const paymentId = fields.pf_payment_id;
    if (paymentId && deliveredPaymentIds.has(paymentId)) return sendText(response, 200, 'Already delivered');
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.ADMIN_EMAIL) {
      console.error('[PayFast ITN] email configuration missing', {
        hasResendKey: Boolean(process.env.RESEND_API_KEY),
        hasFrom: Boolean(process.env.EMAIL_FROM),
        hasAdminEmail: Boolean(process.env.ADMIN_EMAIL),
      });
      return sendText(response, 503, 'Email service is not configured');
    }

    const filePath = path.join(process.cwd(), 'private', 'materials', product.file);
    console.info('[PayFast ITN] attempting to read PDF', { filePath, cwd: process.cwd() });
    let file: string;
    try {
      file = (await readFile(filePath)).toString('base64');
      console.info('[PayFast ITN] PDF loaded', { file: product.file, bytes: file.length });
    } catch (fileError) {
      console.error('[PayFast ITN] PDF file not found or unreadable', { filePath, error: fileError instanceof Error ? fileError.message : 'unknown' });
      return sendText(response, 503, 'Paid file is unavailable');
    }
    const customerName = `${fields.name_first} ${fields.name_last}`.trim();
    const customerPhone = fields.cell_number || 'Not provided';
    const purchaseId = fields.pf_payment_id || 'Sandbox transaction';
    const details = `Customer: ${customerName}\nEmail: ${fields.email_address}\nPhone: ${customerPhone}\nPDF: ${product.title}\nAmount: R${product.amount}\nPayment ID: ${purchaseId}\nStatus: ${fields.payment_status}`;
    const attachment = { filename: product.file, content: file };
    const customerHtml = customerEmailHtml({
      customerName,
      customerFirstName: fields.name_first || 'there',
      customerEmail: fields.email_address,
      itemName: product.title,
      fileName: product.file,
      amount: product.amount,
      paymentId: purchaseId,
    });
    const adminHtml = adminEmailHtml({
      customerName,
      customerEmail: fields.email_address,
      customerPhone,
      itemName: product.title,
      fileName: product.file,
      amount: product.amount,
      paymentId: purchaseId,
    });

    await sendEmail([fields.email_address], `Your Viva Tutorials PDF: ${product.title}`, `Thank you for your payment. Your PDF is attached.\n\n${details}`, attachment, customerHtml);
    await sendEmail([process.env.ADMIN_EMAIL], `New PDF purchase: ${product.title}`, `A paid PDF was purchased.\n\n${details}`, attachment, adminHtml);
    if (paymentId) deliveredPaymentIds.add(paymentId);

    return sendText(response, 200, 'OK');
  } catch (error) {
    console.error('[PayFast ITN] unhandled exception', { error: error instanceof Error ? error.message : 'unknown error', stack: error instanceof Error ? error.stack : '' });
    return sendText(response, 503, 'Unable to process notification');
  }
}
