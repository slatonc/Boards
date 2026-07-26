/**
 * Order fulfillment and shipping notifications for For The Boards.
 *
 * Two inbound webhooks:
 *   POST /      Stripe. A paid checkout creates a Lulu print job, so the book
 *               is printed and drop-shipped automatically.
 *   POST /lulu  Lulu. A shipped print job emails the buyer their tracking link.
 *
 * Together these replace what the Lulu Direct Shopify app used to do.
 */

const STRIPE_API = 'https://api.stripe.com/v1';
const BREVO_API = 'https://api.brevo.com/v3/smtp/email';
const SIGNATURE_TOLERANCE_SECONDS = 300;

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Stripe's endpoint was configured at the root before the Lulu one existed;
    // keep it there so the existing dashboard config stays valid.
    if (new URL(request.url).pathname.replace(/\/$/, '') === '/lulu') {
      return handleLulu(request, env);
    }

    const raw = await request.text();
    const signature = request.headers.get('stripe-signature');

    let event;
    try {
      event = await verifyStripeSignature(raw, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      // 400 tells Stripe not to retry — a bad signature will never become good.
      return new Response(`Signature verification failed: ${err.message}`, { status: 400 });
    }

    if (event.type !== 'checkout.session.completed') {
      return new Response('Ignored', { status: 200 });
    }

    const session = event.data.object;
    if (session.payment_status !== 'paid') {
      return new Response('Not paid, ignored', { status: 200 });
    }

    // Stripe retries webhooks on non-2xx and can deliver duplicates. Without
    // this guard a retry prints and ships a second book at our expense.
    const claimed = await claimSession(env, session.id);
    if (!claimed) {
      return new Response('Already processed', { status: 200 });
    }

    try {
      const printJob = await fulfill(env, session);
      await env.FULFILLMENT.put(
        idempotencyKey(session.id),
        JSON.stringify({ state: 'done', printJobId: printJob.id, at: new Date().toISOString() })
      );
      // Logged on success too, so an order can be traced from `wrangler tail`
      // without going digging in KV for the job id.
      console.log(`Fulfilled ${session.id} -> Lulu print job ${printJob.id}`);
      return Response.json({ ok: true, printJobId: printJob.id });
    } catch (err) {
      // Release the claim so Stripe's retry can try again.
      await env.FULFILLMENT.delete(idempotencyKey(session.id));
      console.error(`Fulfillment failed for ${session.id}: ${err.stack || err.message}`);
      // 500 asks Stripe to retry with backoff.
      return new Response(`Fulfillment failed: ${err.message}`, { status: 500 });
    }
  },
};

/**
 * Lulu fires on every print-job status change. Only SHIPPED matters — that's
 * the point there is tracking worth sending the buyer.
 */
async function handleLulu(request, env) {
  const raw = await request.text();

  try {
    await verifyLuluSignature(raw, request.headers.get('lulu-hmac-sha256'), env.LULU_CLIENT_SECRET);
  } catch (err) {
    return new Response(`Signature verification failed: ${err.message}`, { status: 400 });
  }

  const { topic, data } = JSON.parse(raw);
  if (topic !== 'PRINT_JOB_STATUS_CHANGED') {
    return new Response('Ignored', { status: 200 });
  }
  if (data?.status?.name !== 'SHIPPED') {
    return new Response('Not shipped, ignored', { status: 200 });
  }

  const key = `shipped:${data.id}`;
  if (await env.FULFILLMENT.get(key)) {
    return new Response('Already notified', { status: 200 });
  }

  const recipient = data.shipping_address?.email;
  if (!recipient) {
    // A missing buyer email will not appear on a later delivery, and Lulu
    // deactivates a webhook after 5 consecutive failures — so don't burn
    // retries on something that can never succeed.
    console.error(`Print job ${data.id} shipped with no buyer email; cannot notify.`);
    return new Response('No recipient', { status: 200 });
  }

  try {
    await sendShippingEmail(env, {
      recipient,
      name: data.shipping_address?.name,
      tracking: extractTracking(data),
    });
  } catch (err) {
    console.error(`Brevo send failed for print job ${data.id}: ${err.message}`);
    return new Response(`Email failed: ${err.message}`, { status: 500 });
  }

  await env.FULFILLMENT.put(key, JSON.stringify({ notified: recipient, at: new Date().toISOString() }));
  console.log(`Print job ${data.id} shipped -> notified ${recipient}`);
  return Response.json({ ok: true, notified: recipient });
}

/**
 * Tracking shows up under the job status and, depending on the payload, under
 * each line item. Check both rather than depending on one shape.
 */
function extractTracking(job) {
  const sources = [
    ...(job.status?.line_item_statuses ?? []).map((s) => s.messages),
    ...(job.line_items ?? []).map((item) => item.status?.messages),
  ].filter(Boolean);

  for (const source of sources) {
    if (!source.tracking_id && !source.tracking_urls) continue;
    const urls = Array.isArray(source.tracking_urls)
      ? source.tracking_urls
      : source.tracking_urls
        ? [source.tracking_urls]
        : [];
    return { id: source.tracking_id || null, urls, carrier: source.carrier_name || null };
  }

  return { id: null, urls: [], carrier: null };
}

async function sendShippingEmail(env, { recipient, name, tracking }) {
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'there';
  const link = tracking.urls[0] || null;
  const carrier = tracking.carrier || 'the carrier';

  const trackingHtml = link
    ? `<p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="background:#c8102e;color:#fff;padding:12px 22px;border-radius:4px;text-decoration:none;display:inline-block">Track your package</a></p>`
    : tracking.id
      ? `<p style="margin:0 0 20px">Tracking number: <strong>${escapeHtml(tracking.id)}</strong> (${escapeHtml(carrier)})</p>`
      : '';

  const trackingText = link
    ? `Track it here: ${link}`
    : tracking.id
      ? `Tracking number: ${tracking.id} (${carrier})`
      : '';

  const body = {
    sender: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
    to: [{ email: recipient, name: name || undefined }],
    // Blind copy, so the buyer never sees an extra address on their email.
    ...(env.EMAIL_BCC ? { bcc: [{ email: env.EMAIL_BCC }] } : {}),
    subject: 'Your copy of For The Boards has shipped',
    htmlContent: `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
<h1 style="margin:0 0 16px;font-size:22px">Your book is on its way</h1>
<p style="margin:0 0 16px;line-height:1.55">Hi ${escapeHtml(firstName)}, your copy of <strong>For The Boards</strong> has shipped.</p>
${trackingHtml}
<p style="margin:0 0 16px;line-height:1.55">Delivery usually takes about a week from here, though it can vary by location.</p>
<p style="margin:0 0 16px;line-height:1.55">Questions, or something wrong with your order? Just reply to this email.</p>
<p style="margin:24px 0 0;line-height:1.55">Good luck with your studying,<br>Slaton</p>
</div></body></html>`,
    textContent: `Hi ${firstName}, your copy of For The Boards has shipped.

${trackingText}

Delivery usually takes about a week from here, though it can vary by location.

Questions, or something wrong with your order? Just reply to this email.

Good luck with your studying,
Slaton`,
    tags: ['shipping-notification'],
  };

  let lastError = 'unknown error';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt));

    const res = await fetch(BREVO_API, {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) return;
    lastError = `${res.status}: ${await res.text()}`;

    // A rejected key or malformed payload will not fix itself on retry.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
  }

  throw new Error(lastError);
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function fulfill(env, session) {
  const quantity = await getQuantity(env, session.id);
  const shippingAddress = buildShippingAddress(session, env);
  const token = await getLuluToken(env);

  const body = {
    contact_email: env.LULU_CONTACT_EMAIL,
    external_id: session.id,
    line_items: [
      {
        external_id: session.id,
        title: env.BOOK_TITLE,
        quantity,
        ...printableFor(env),
      },
    ],
    shipping_address: shippingAddress,
    shipping_level: env.SHIPPING_LEVEL || 'MAIL',
    production_delay: Number(env.PRODUCTION_DELAY || 120),
  };

  const res = await fetch(`${env.LULU_API_BASE}/print-jobs/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Lulu print-job create returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Lulu accepts either a reference to an already-normalized printable, or the
 * source PDFs to normalize.
 *
 * Once the first print job has been created and validated, Lulu stores the
 * normalized files permanently and returns a `printable_id`. Setting
 * LULU_PRINTABLE_ID switches to that path, after which the PDF URLs are never
 * fetched again and no longer need to be publicly hosted.
 */
function printableFor(env) {
  if (env.LULU_PRINTABLE_ID) {
    return { printable_id: env.LULU_PRINTABLE_ID };
  }

  if (!env.INTERIOR_PDF_URL || !env.COVER_PDF_URL) {
    throw new Error('Set LULU_PRINTABLE_ID, or both INTERIOR_PDF_URL and COVER_PDF_URL');
  }

  return {
    printable_normalization: {
      pod_package_id: env.POD_PACKAGE_ID,
      interior: { source_url: env.INTERIOR_PDF_URL },
      cover: { source_url: env.COVER_PDF_URL },
    },
  };
}

/**
 * Webhook payloads can't be expanded, so the quantity the buyer picked in the
 * Payment Link's quantity dropdown has to be read back from the API.
 */
async function getQuantity(env, sessionId) {
  const res = await fetch(`${STRIPE_API}/checkout/sessions/${sessionId}/line_items?limit=100`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Stripe line_items returned ${res.status}: ${await res.text()}`);
  }
  const { data } = await res.json();
  const total = data.reduce((sum, item) => sum + (item.quantity || 0), 0);
  if (total < 1) {
    throw new Error('Session had no line items with a quantity');
  }
  return total;
}

function buildShippingAddress(session, env) {
  // Newer Stripe API versions moved this under collected_information.
  const shipping = session.collected_information?.shipping_details || session.shipping_details;
  const address = shipping?.address || session.customer_details?.address;

  if (!address?.line1 || !address?.country) {
    throw new Error(
      `Session ${session.id} has no shipping address — enable shipping address collection on the Payment Link`
    );
  }

  const name = shipping?.name || session.customer_details?.name;
  if (!name) {
    throw new Error(`Session ${session.id} has no recipient name`);
  }

  return {
    name,
    street1: address.line1,
    street2: address.line2 || '',
    city: address.city || '',
    // Lulu requires state_code for US/CA/AU/MX; Stripe already returns the
    // 2-letter subdivision code in `state`.
    state_code: address.state || '',
    postcode: address.postal_code || '',
    country_code: address.country,
    // Carriers require both; Lulu falls back to the API profile if omitted,
    // but delivery-issue contact is much better with the buyer's own details.
    phone_number: shipping?.phone || session.customer_details?.phone || env.FALLBACK_PHONE,
    email: session.customer_details?.email || undefined,
  };
}

let cachedToken = null;

async function getLuluToken(env) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const credentials = btoa(`${env.LULU_CLIENT_KEY}:${env.LULU_CLIENT_SECRET}`);
  const res = await fetch(`${env.LULU_API_BASE}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`Lulu auth returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

const idempotencyKey = (sessionId) => `session:${sessionId}`;

/**
 * Returns true if this invocation is the one that gets to fulfill the session.
 */
async function claimSession(env, sessionId) {
  const key = idempotencyKey(sessionId);
  const existing = await env.FULFILLMENT.get(key);
  if (existing) return false;

  await env.FULFILLMENT.put(
    key,
    JSON.stringify({ state: 'processing', at: new Date().toISOString() }),
    // If we crash mid-flight the claim expires and Stripe's retry can recover.
    { expirationTtl: 3600 }
  );
  return true;
}

async function verifyStripeSignature(payload, header, secret) {
  if (!header) throw new Error('missing Stripe-Signature header');

  let timestamp;
  const signatures = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error('malformed Stripe-Signature header');
  }

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error('timestamp outside tolerance');
  }

  const expected = await hmacSha256(secret, `${timestamp}.${payload}`);

  if (!signatures.some((candidate) => timingSafeEqual(candidate, expected.hex))) {
    throw new Error('no matching v1 signature');
  }

  return JSON.parse(payload);
}

/**
 * Lulu signs the raw request body with the account's API secret and sends it in
 * Lulu-HMAC-SHA256. The docs don't pin the digest encoding, so accept either
 * hex or base64 rather than guessing wrong and rejecting every delivery.
 */
async function verifyLuluSignature(payload, header, secret) {
  if (!header) throw new Error('missing Lulu-HMAC-SHA256 header');

  const expected = await hmacSha256(secret, payload);
  const candidate = header.trim();

  if (!timingSafeEqual(candidate, expected.hex) && !timingSafeEqual(candidate, expected.base64)) {
    throw new Error('signature mismatch');
  }
}

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));

  return {
    hex: [...mac].map((b) => b.toString(16).padStart(2, '0')).join(''),
    base64: btoa(String.fromCharCode(...mac)),
  };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
