import crypto from 'node:crypto';

const products: Record<string, { title: string; amount: string }> = {
  'Analytical Geometry Practice': { title: 'Analytical Geometry Practice', amount: '299.00' },
  'Finance Practice Questions': { title: 'Finance Practice Questions', amount: '399.00' },
};

function payfastSignature(fields: Record<string, string>, passphrase?: string) {
  const payload = Object.entries(fields)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, '+')}`)
    .join('&');
  const withPassphrase = passphrase ? `${payload}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}` : payload;
  return crypto.createHash('md5').update(withPassphrase).digest('hex');
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  try {
    const body = await request.json();
    const product = products[String(body.material || '')];
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();

    if (!product || !firstName || !lastName || !email || !phone || !/^\S+@\S+\.\S+$/.test(email)) {
      return Response.json({ error: 'Complete customer and product details are required.' }, { status: 400 });
    }

    const origin = process.env.PUBLIC_SITE_URL || new URL(request.url).origin;
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

    if (!fields.merchant_id || !fields.merchant_key || !process.env.PAYFAST_NOTIFY_URL) {
      return Response.json({ error: 'PayFast server configuration is incomplete.' }, { status: 503 });
    }

    const { merchant_key: _merchantKey, ...signedFields } = fields;
    return Response.json({
      endpoint: process.env.PAYFAST_ENDPOINT || 'https://sandbox.payfast.co.za/eng/process',
      fields: { ...signedFields, signature: payfastSignature(signedFields, process.env.PAYFAST_PASSPHRASE) },
    });
  } catch {
    return Response.json({ error: 'Unable to create checkout.' }, { status: 400 });
  }
}
