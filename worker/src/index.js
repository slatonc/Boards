/**
 * Stripe -> Lulu Print API fulfillment webhook.
 *
 * When a Stripe Checkout session is paid, this creates a matching Lulu print
 * job so the book is printed and drop-shipped to the buyer automatically.
 *
 * Replaces what the Lulu Direct Shopify app used to do.
 */

const STRIPE_API = 'https://api.stripe.com/v1';
const SIGNATURE_TOLERANCE_SECONDS = 300;

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
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

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (!signatures.some((candidate) => timingSafeEqual(candidate, expected))) {
    throw new Error('no matching v1 signature');
  }

  return JSON.parse(payload);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
