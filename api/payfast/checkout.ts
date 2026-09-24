import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const products: Record<string, { title: string; amount: string }> = {
  'Analytical Geometry Practice': { title: 'Analytical Geometry Practice', amount: '299.00' },
  'Finance Practice Questions': { title: 'Finance Practice Questions', amount: '399.00' },
};

type CheckoutPayload = {
  material?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
};

function payfastSignature(fields: Record<string, string>, passphrase?: string) {
  const payload = Object.entries(fields)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, '+')}`)
    .join('&');
  const withPassphrase = passphrase ? `${payload}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}` : payload;
  return crypto.createHash('md5').update(withPassphrase).digest('hex');
}

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as CheckoutPayload;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  console.info('[PayFast API] checkout request', { method: request.method });
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(request);
    const product = products[String(body.material || '')];
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();

    if (!product || !firstName || !lastName || !email || !phone || !/^\S+@\S+\.\S+$/.test(email)) {
      console.warn('[PayFast API] invalid checkout details', { product: Boolean(product), email: Boolean(email) });
      return sendJson(response, 400, { error: 'Complete customer and product details are required.' });
    }

    const protocol = request.headers['x-forwarded-proto'] || 'http';
    const host = request.headers.host || 'localhost:8080';
    const origin = process.env.PUBLIC_SITE_URL || `${protocol}://${host}`;
    const fields: Record<string, string> = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID || '',
      merchant_key: process.env.PAYFAST_MERCHANT_KEY || '',
      return_url: `${origin}/payment-success`,
      cancel_url: `${origin}/payment-cancelled`,
      notify_url: process.env.PAYFAST_NOTIFY_URL || `${origin}/api/payfast/notify`,
      name_first: firstName,
      name_last: lastName,
      email_address: email,
      cell_number: phone,
      amount: product.amount,
      item_name: product.title,
      custom_str1: product.title,
      custom_str2: email,
    };

    if (!fields.merchant_id || !process.env.PAYFAST_MERCHANT_KEY) {
      console.error('[PayFast API] missing server credentials');
      return sendJson(response, 503, { error: 'PayFast server configuration is incomplete.' });
    }

    const { merchant_key: _merchantKey, ...signedFields } = fields;
    console.info('[PayFast API] checkout payload signed', { product: product.title, amount: product.amount });
    return sendJson(response, 200, {
      endpoint: process.env.PAYFAST_ENDPOINT || 'https://sandbox.payfast.co.za/eng/process',
      fields: { ...fields, signature: payfastSignature(signedFields, process.env.PAYFAST_PASSPHRASE) },
    });
  } catch (error) {
    console.error('[PayFast API] checkout failed', error instanceof Error ? error.message : 'unknown error');
    return sendJson(response, 400, { error: 'Unable to create checkout.' });
  }
}
