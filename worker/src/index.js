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
    const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
    if (!['/', '/lulu'].includes(path)) return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (Number(request.headers.get('content-length')) > 262144) return new Response('Too large', { status: 413 });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 262144) return new Response('Too large', { status: 413 });
    let event;
    try {
      if (path === '/lulu') {
        await verifyLuluSignature(raw, request.headers.get('lulu-hmac-sha256'), env.LULU_CLIENT_SECRET);
        event = JSON.parse(raw);
      } else {
        event = await verifyStripeSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
      }
    } catch {
      return new Response('Invalid webhook', { status: 400 });
    }
    if (path === '/lulu') {
      if (event.topic !== 'PRINT_JOB_STATUS_CHANGED') return new Response('Ignored');
      const sessionId = event.data?.external_id;
      // Only this storefront's Stripe-linked jobs belong to this service.
      if (!/^cs_[a-zA-Z0-9_]+$/.test(sessionId || '')) return new Response('Unrelated print job');
      return routeOrder(env, sessionId, '/status', event.data);
    }
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      return new Response('Ignored');
    }
    const session = event.data?.object;
    if (!/^cs_[a-zA-Z0-9_]+$/.test(session?.id || '')) return new Response('Invalid session', { status: 400 });
    if (session.payment_status !== 'paid') return new Response('Not paid, ignored');
    return routeOrder(env, session.id, '/checkout', session);
  },
};

async function routeOrder(env, sessionId, path, body) {
  if (!env.ORDERS) return new Response('Fulfillment unavailable', { status: 503 });
  try {
    const stub = env.ORDERS.get(env.ORDERS.idFromName(sessionId));
    return await stub.fetch(new Request(`https://order.internal${path}`, {
      method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    }));
  } catch (error) {
    console.error(`Order service failed for ${sessionId}: ${error.message}`);
    return new Response('Fulfillment temporarily unavailable', { status: 503 });
  }
}

const MONITOR_INTERVAL = 6 * 60 * 60 * 1000;

/**
 * One globally unique Durable Object per Stripe session. The in-memory busy
 * flag serializes network work; persistent phases protect against restarts.
 * Never issue another create after an uncertain Lulu submission.
 */
export class OrderFulfillment {
  constructor(ctx, env) {
    this.storage = ctx.storage;
    this.env = env;
    this.busy = false;
  }

  async fetch(request) {
    if (this.busy) return new Response('Order processing; retry', { status: 503 });
    this.busy = true;
    try {
      const body = await request.json();
      return new URL(request.url).pathname === '/checkout'
        ? await this.checkout(body)
        : await this.status(body);
    } catch (error) {
      console.error(`Order processing failed: ${error.message}`);
      return new Response('Order requires retry or review', { status: 503 });
    } finally {
      this.busy = false;
    }
  }

  async checkout(session) {
    let order = await this.storage.get('order');
    if (order?.printJobId) return Response.json({ ok: true, printJobId: order.printJobId });
    if (!(await allowedPaymentLink(this.env, session))) return new Response('Unrelated payment link');

    // Import the previous KV record; never forget an already-created job.
    const legacyRaw = !order && await this.env.FULFILLMENT.get(idempotencyKey(session.id));
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
    if (legacy?.state === 'done' && legacy.printJobId) {
      await this.storage.put('order', { sessionId: session.id, phase: 'submitted', printJobId: legacy.printJobId, createdAt: legacy.at });
      return Response.json({ ok: true, printJobId: legacy.printJobId });
    }

    // Also catches historical orders whose legacy record is missing.
    const matches = await findPrintJobs(this.env, session.id);
    if (matches.length) {
      order = { sessionId: session.id, phase: 'submitted', printJobId: matches[0].id, createdAt: order?.createdAt || new Date().toISOString() };
      await this.storage.put('order', order);
      await this.storage.setAlarm(Date.now() + MONITOR_INTERVAL);
      if (matches.length > 1) await this.alert('duplicate-jobs', 'Multiple Lulu jobs reference this payment. Review and cancel any unwanted copies.');
      return Response.json({ ok: true, printJobId: order.printJobId });
    }
    if (order?.phase === 'creating' || legacy?.state === 'processing') {
      await this.storage.put('order', order || { sessionId: session.id, phase: 'creating', createdAt: legacy.at || new Date().toISOString() });
      await this.storage.setAlarm(Date.now() + MONITOR_INTERVAL);
      await this.alert('uncertain-submission', 'A print submission was interrupted. No matching job is visible yet. Check Lulu and Stripe before attempting any reprint; automatic resubmission has been stopped to prevent duplicates.');
      return new Response('Submission requires review', { status: 503 });
    }

    // Preparation failures are safe to retry because Lulu has not been called.
    let prepared;
    try {
      prepared = await preparePrintJob(this.env, session);
    } catch (error) {
      await this.storage.put('order', { sessionId: session.id, phase: 'preparing', createdAt: new Date().toISOString() });
      await this.alert('preparation-failed', 'A paid order could not be prepared. Check the shipping details, Stripe access, and print-file configuration. Stripe will retry.');
      throw error;
    }
    order = { sessionId: session.id, phase: 'creating', createdAt: new Date().toISOString() };
    // Schedule recovery before the write that permits the external side effect.
    await this.storage.setAlarm(Date.now() + MONITOR_INTERVAL);
    await this.storage.put('order', order);
    try {
      const job = await createPrintJob(this.env, prepared);
      if (!job.id) throw new Error('Lulu response did not contain a job ID');
      order = { ...order, phase: 'submitted', printJobId: job.id };
      await this.storage.put('order', order);
      console.log(`Submitted ${session.id} -> Lulu ${job.id}`);
      return Response.json({ ok: true, printJobId: job.id });
    } catch (error) {
      // Keep the creating record even if the response or final storage write
      // fails. A subsequent request reconciles; it must not blindly reprint.
      await this.alert('uncertain-submission', 'Lulu submission did not complete cleanly. Check whether a job exists before reprinting. Automatic resubmission has been stopped to prevent duplicates.');
      throw error;
    }
  }

  async alert(reason, message) {
    const key = `alert:${reason}`;
    if (await this.storage.get(key)) return;
    const order = await this.storage.get('order');
    console.error(`Order attention: ${order?.sessionId || 'unknown'}: ${reason}`);
    if (!this.env.ALERT_EMAIL) return;
    await sendEmail(this.env, {
      sender: { email: this.env.EMAIL_FROM, name: this.env.EMAIL_FROM_NAME },
      to: [{ email: this.env.ALERT_EMAIL }],
      subject: 'For The Boards order needs attention',
      textContent: `Payment: ${order?.sessionId || 'unknown'}\nLulu job: ${order?.printJobId || 'not confirmed'}\n\n${message}`,
      tags: ['fulfillment-alert'],
    });
    await this.storage.put(key, new Date().toISOString());
  }

  async status(job) {
    let order = await this.storage.get('order');
    // Authenticate the association against Lulu, even for a validly signed
    // webhook, so stale/wrong account data cannot choose arbitrary recipients.
    const verified = await getPrintJob(this.env, job.id);
    if (verified.external_id !== job.external_id) return new Response('Unrelated job');
    job = verified;
    if (order?.printJobId && String(order.printJobId) !== String(job.id)) {
      await this.alert('duplicate-jobs', 'Another Lulu job references this payment. Review for duplicate printing.');
      return new Response('Duplicate job requires review');
    }
    order = { ...order, sessionId: job.external_id, printJobId: job.id, phase: 'submitted', createdAt: order?.createdAt || job.date_created || new Date().toISOString(), status: job.status?.name };
    await this.storage.put('order', order);
    await this.observe(job);
    return Response.json({ ok: true });
  }

  async observe(job) {
    const state = job.status?.name;
    if (['REJECTED', 'CANCELED'].includes(state)) {
      await this.alert(state, `Lulu reports ${state}. Check the order and contact the buyer or arrange a refund/reprint as appropriate.`);
      await this.storage.deleteAlarm();
      return;
    }
    if (state === 'SHIPPED') {
      const key = `shipped:${job.id}`;
      // Honor old notification records when upgrading the service.
      if (!(await this.storage.get(key)) && !(await this.env.FULFILLMENT.get(key))) {
        const recipient = job.shipping_address?.email;
        if (!recipient) {
          await this.alert('missing-buyer-email', 'The book shipped but no buyer email was provided for the shipping notification.');
        } else {
          await sendShippingEmail(this.env, { recipient, name: job.shipping_address.name, tracking: extractTracking(job) });
          await this.storage.put(key, true);
        }
      }
      await this.storage.deleteAlarm();
      return;
    }
    const age = Date.now() - Date.parse(job.date_created || (await this.storage.get('order'))?.createdAt);
    if (state === 'UNPAID' && age > 6 * 60 * 60 * 1000) {
      await this.alert('unpaid', 'The print job is still unpaid after six hours. Check Lulu automatic payments and the saved payment method.');
    }
    if (age > 14 * 86400000) await this.alert('delayed', 'The print job has not shipped after 14 days. Check its status and contact Lulu as needed.');
    if (age > 30 * 86400000) {
      await this.alert('monitor-ended', 'This job is over 30 days old and still not shipped. Manual follow-up is required; routine status polling has stopped.');
      await this.storage.deleteAlarm();
    } else {
      await this.storage.setAlarm(Date.now() + MONITOR_INTERVAL);
    }
  }

  async alarm() {
    if (this.busy) { await this.storage.setAlarm(Date.now() + 60000); return; }
    this.busy = true;
    try {
      // Persist the next attempt first so an API/email outage cannot end monitoring.
      await this.storage.setAlarm(Date.now() + MONITOR_INTERVAL);
      let order = await this.storage.get('order');
      if (!order) { await this.storage.deleteAlarm(); return; }
      if (!order.printJobId) {
        const matches = await findPrintJobs(this.env, order.sessionId);
        if (!matches.length) {
          await this.alert('uncertain-submission', 'No print job could be confirmed after an interrupted submission. Check Lulu and Stripe manually before reprinting.');
          await this.storage.deleteAlarm();
          return;
        }
        order = { ...order, phase: 'submitted', printJobId: matches[0].id };
        await this.storage.put('order', order);
        if (matches.length > 1) await this.alert('duplicate-jobs', 'Multiple Lulu jobs reference this payment. Review for duplicate printing.');
      }
      await this.observe(await getPrintJob(this.env, order.printJobId));
    } finally {
      this.busy = false;
    }
  }
}

async function allowedPaymentLink(env, session) {
  if (!env.ALLOWED_PAYMENT_LINK_URL) throw new Error('Allowed Payment Link is not configured');
  if (!/^plink_[a-zA-Z0-9]+$/.test(session.payment_link || '')) return false;
  const res = await fetch(`${STRIPE_API}/payment_links/${session.payment_link}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Stripe Payment Link lookup failed (${res.status})`);
  const link = await res.json();
  return link.url === env.ALLOWED_PAYMENT_LINK_URL;
}

async function findPrintJobs(env, sessionId) {
  const token = await getLuluToken(env);
  const res = await fetch(`${env.LULU_API_BASE}/print-jobs/?search=${encodeURIComponent(sessionId)}&page_size=100`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Lulu reconciliation failed (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data.results) || data.next) throw new Error('Lulu reconciliation requires manual review');
  return data.results.filter(job => job.external_id === sessionId);
}

async function getPrintJob(env, id) {
  if (!/^[0-9]+$/.test(String(id))) throw new Error('Invalid Lulu job ID');
  const token = await getLuluToken(env);
  const res = await fetch(`${env.LULU_API_BASE}/print-jobs/${id}/`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Lulu status lookup failed (${res.status})`);
  return res.json();
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
  const link = tracking.urls.find(url => { try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; } }) || null;
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

  await sendEmail(env, body);
}

async function sendEmail(env, body) {
  let lastError = 'unknown error';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt));

    const res = await fetch(BREVO_API, {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });

    if (res.ok) return;
    lastError = `Email provider returned ${res.status}`;

    // A rejected key or malformed payload will not fix itself on retry.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
  }

  throw new Error(lastError);
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function preparePrintJob(env, session) {
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

  return { body, token };
}

async function createPrintJob(env, { body, token }) {
  const res = await fetch(`${env.LULU_API_BASE}/print-jobs/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(`Lulu print-job create returned ${res.status}`);
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
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Stripe line_items returned ${res.status}`);
  }
  const { data, has_more } = await res.json();
  if (has_more || !Array.isArray(data) || data.length !== 1) throw new Error('Expected one book product');
  const total = data[0].quantity;
  if (!Number.isSafeInteger(total) || total < 1) {
    throw new Error('Session had no line items with a quantity');
  }
  return total;
}

function buildShippingAddress(session, env) {
  // Newer Stripe API versions moved this under collected_information.
  const shipping = session.collected_information?.shipping_details || session.shipping_details;
  const address = shipping?.address;

  if (!address?.line1 || !address?.country) {
    throw new Error(
      `Session ${session.id} has no shipping address — enable shipping address collection on the Payment Link`
    );
  }

  if (address.country !== 'US') throw new Error('Only US shipping is supported');
  if (!address.city || !address.state || !address.postal_code) throw new Error('Incomplete shipping address');

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
  if (cachedToken && cachedToken.account === `${env.LULU_API_BASE}:${env.LULU_CLIENT_KEY}` && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const credentials = btoa(`${env.LULU_CLIENT_KEY}:${env.LULU_CLIENT_SECRET}`);
  const res = await fetch(`${env.LULU_API_BASE}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials', signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Lulu auth returned ${res.status}`);
  }

  const data = await res.json();
  cachedToken = {
    account: `${env.LULU_API_BASE}:${env.LULU_CLIENT_KEY}`,
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

const idempotencyKey = (sessionId) => `session:${sessionId}`;

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
  if (typeof secret !== 'string' || !secret) throw new Error('Webhook secret is not configured');
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
