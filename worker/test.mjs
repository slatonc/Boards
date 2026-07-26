import worker from './src/index.js';
import assert from 'node:assert';

const SECRET = 'whsec_test_secret';

function makeKV() {
  const store = new Map();
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => void store.set(k, v),
    delete: async (k) => void store.delete(k),
  };
}

const env = () => ({
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_SECRET_KEY: 'sk_test_x',
  LULU_CLIENT_KEY: 'ck',
  LULU_CLIENT_SECRET: 'cs',
  LULU_API_BASE: 'https://api.sandbox.lulu.com',
  LULU_CONTACT_EMAIL: 'slaton@fortheboards.com',
  BOOK_TITLE: 'For The Boards',
  POD_PACKAGE_ID: '0600X0900FCSTDPB060UW444MXX',
  INTERIOR_PDF_URL: 'https://cdn.example.com/interior.pdf',
  COVER_PDF_URL: 'https://cdn.example.com/cover.pdf',
  SHIPPING_LEVEL: 'MAIL',
  PRODUCTION_DELAY: '120',
  FALLBACK_PHONE: '555-000-0000',
  BREVO_API_KEY: 'brevo-test-key',
  EMAIL_FROM: 'slaton@fortheboards.com',
  EMAIL_FROM_NAME: 'For The Boards',
  FULFILLMENT: makeKV(),
});

const session = {
  id: 'cs_test_abc123',
  payment_status: 'paid',
  customer_details: { email: 'buyer@example.com', name: 'Jane Resident', phone: '+12015550123' },
  collected_information: {
    shipping_details: {
      name: 'Jane Resident',
      address: {
        line1: '123 Main St', line2: 'Apt 4', city: 'Boston',
        state: 'MA', postal_code: '02115', country: 'US',
      },
    },
  },
};

const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: session } });

async function sign(body, secret, ts = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${ts},v1=${hex}`;
}

const req = async (body, sig) =>
  new Request('https://w.dev/', { method: 'POST', body, headers: { 'stripe-signature': sig } });

let luluBody = null;
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.includes('/line_items')) return Response.json({ data: [{ quantity: 2 }] });
  if (url.includes('openid-connect/token')) return Response.json({ access_token: 'tok', expires_in: 3600 });
  if (url.endsWith('/print-jobs/')) {
    luluBody = JSON.parse(init.body);
    return Response.json({ id: 55501 }, { status: 201 });
  }
  throw new Error(`unexpected fetch: ${url}`);
};

// 1. Happy path
const e1 = env();
let res = await worker.fetch(await req(payload, await sign(payload, SECRET)), e1);
assert.strictEqual(res.status, 200, 'happy path should be 200');
assert.strictEqual((await res.json()).printJobId, 55501);
console.log('✓ happy path returns print job id');

assert.deepStrictEqual(luluBody.shipping_address, {
  name: 'Jane Resident', street1: '123 Main St', street2: 'Apt 4', city: 'Boston',
  state_code: 'MA', postcode: '02115', country_code: 'US',
  phone_number: '+12015550123', email: 'buyer@example.com',
});
assert.strictEqual(luluBody.line_items[0].quantity, 2, 'quantity must come from Stripe line items');
assert.strictEqual(luluBody.line_items[0].printable_normalization.pod_package_id, env().POD_PACKAGE_ID);
assert.strictEqual(luluBody.external_id, 'cs_test_abc123');
assert.strictEqual(luluBody.shipping_level, 'MAIL');
assert.strictEqual(luluBody.production_delay, 120);
console.log('✓ Lulu request body matches spec (address, qty, sku, external_id)');

// 2. Idempotency — replay the exact same event
luluBody = null;
res = await worker.fetch(await req(payload, await sign(payload, SECRET)), e1);
assert.strictEqual(res.status, 200);
assert.strictEqual(luluBody, null, 'replay must NOT hit Lulu again');
console.log('✓ duplicate delivery does not create a second print job');

// 3. Bad signature
res = await worker.fetch(await req(payload, 't=1,v1=deadbeef'), env());
assert.strictEqual(res.status, 400, 'forged signature must be rejected');
console.log('✓ forged signature rejected with 400');

// 4. Stale timestamp (replay attack)
res = await worker.fetch(await req(payload, await sign(payload, SECRET, 1700000000)), env());
assert.strictEqual(res.status, 400);
console.log('✓ stale timestamp rejected');

// 5. Unpaid session
const unpaid = JSON.stringify({
  type: 'checkout.session.completed',
  data: { object: { ...session, payment_status: 'unpaid' } },
});
luluBody = null;
res = await worker.fetch(await req(unpaid, await sign(unpaid, SECRET)), env());
assert.strictEqual(res.status, 200);
assert.strictEqual(luluBody, null, 'unpaid session must not print');
console.log('✓ unpaid session ignored');

// 6. Lulu failure releases the claim so Stripe can retry
const e6 = env();
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.includes('/line_items')) return Response.json({ data: [{ quantity: 1 }] });
  if (url.includes('openid-connect/token')) return Response.json({ access_token: 'tok', expires_in: 3600 });
  return new Response('upstream boom', { status: 503 });
};
res = await worker.fetch(await req(payload, await sign(payload, SECRET)), e6);
assert.strictEqual(res.status, 500, 'Lulu failure should 500 so Stripe retries');
assert.strictEqual(e6.FULFILLMENT.store.size, 0, 'claim must be released for the retry');
console.log('✓ Lulu outage returns 500 and releases the idempotency claim');

// 7. Missing shipping address is a clear error, not a malformed Lulu call
const noAddr = JSON.stringify({
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_noaddr', payment_status: 'paid', customer_details: { email: 'a@b.c' } } },
});
res = await worker.fetch(await req(noAddr, await sign(noAddr, SECRET)), env());
assert.strictEqual(res.status, 500);
assert.match(await res.text(), /no shipping address/);
console.log('✓ missing shipping address surfaces a clear error');

// 8. printable_id mode: reuse Lulu's stored files, send no PDF URLs at all
luluBody = null;
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.includes('/line_items')) return Response.json({ data: [{ quantity: 1 }] });
  if (url.includes('openid-connect/token')) return Response.json({ access_token: 'tok', expires_in: 3600 });
  if (url.endsWith('/print-jobs/')) {
    luluBody = JSON.parse(init.body);
    return Response.json({ id: 55502 }, { status: 201 });
  }
  throw new Error(`unexpected fetch: ${url}`);
};
const e8 = { ...env(), LULU_PRINTABLE_ID: '11606ab3-9355-46d3-ae90-338db6f5d271' };
delete e8.INTERIOR_PDF_URL;
delete e8.COVER_PDF_URL;
res = await worker.fetch(await req(payload, await sign(payload, SECRET)), e8);
assert.strictEqual(res.status, 200);
assert.strictEqual(luluBody.line_items[0].printable_id, '11606ab3-9355-46d3-ae90-338db6f5d271');
assert.ok(!luluBody.line_items[0].printable_normalization, 'must omit normalization when reusing a printable');
console.log('✓ printable_id mode reuses stored files, no PDF hosting needed');

// 9. Neither printable_id nor PDF URLs is a clear config error
const e9 = env();
delete e9.INTERIOR_PDF_URL;
res = await worker.fetch(await req(payload, await sign(payload, SECRET)), e9);
assert.strictEqual(res.status, 500);
assert.match(await res.text(), /Set LULU_PRINTABLE_ID/);
console.log('✓ missing file config gives an actionable error');

// ---------------------------------------------------------------------------
// Lulu shipping notifications (POST /lulu)
// ---------------------------------------------------------------------------

const shipped = {
  topic: 'PRINT_JOB_STATUS_CHANGED',
  data: {
    id: 998877,
    external_id: 'cs_test_abc123',
    status: {
      name: 'SHIPPED',
      line_item_statuses: [
        {
          name: 'SHIPPED',
          line_item_id: 1,
          messages: {
            tracking_id: 'TRK123',
            tracking_urls: ['https://track.example/TRK123'],
            carrier_name: 'UPS',
          },
        },
      ],
    },
    shipping_address: { name: 'Jane Resident', email: 'buyer@example.com' },
  },
};

async function luluHmac(body, secret, encoding = 'hex') {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return encoding === 'hex'
    ? [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
    : Buffer.from(mac).toString('base64');
}

const luluReq = async (body, sig) =>
  new Request('https://w.dev/lulu', { method: 'POST', body, headers: { 'lulu-hmac-sha256': sig } });

let brevoBody = null;
let brevoStatus = 201;
const mockBrevo = async (url, init) => {
  url = String(url);
  if (url.includes('api.brevo.com')) {
    brevoBody = JSON.parse(init.body);
    return brevoStatus === 201
      ? Response.json({ messageId: 'msg-1' }, { status: 201 })
      : new Response('brevo down', { status: brevoStatus });
  }
  throw new Error(`unexpected fetch: ${url}`);
};

// 10. Shipped job emails the buyer with their tracking link
globalThis.fetch = mockBrevo;
const shippedRaw = JSON.stringify(shipped);
const e10 = env();
res = await worker.fetch(await luluReq(shippedRaw, await luluHmac(shippedRaw, 'cs')), e10);
assert.strictEqual(res.status, 200, 'shipped notification should succeed');
assert.strictEqual(brevoBody.to[0].email, 'buyer@example.com');
assert.match(brevoBody.htmlContent, /https:\/\/track\.example\/TRK123/);
assert.match(brevoBody.textContent, /https:\/\/track\.example\/TRK123/);
assert.match(brevoBody.subject, /shipped/i);
assert.strictEqual(brevoBody.sender.email, 'slaton@fortheboards.com');
console.log('✓ shipped job emails the buyer their tracking link');

// 11. Lulu redelivery does not email twice
brevoBody = null;
res = await worker.fetch(await luluReq(shippedRaw, await luluHmac(shippedRaw, 'cs')), e10);
assert.strictEqual(res.status, 200);
assert.strictEqual(brevoBody, null, 'redelivery must not send a second email');
console.log('✓ duplicate shipping webhook does not email twice');

// 12. Base64 digest accepted (Lulu does not document the encoding)
brevoBody = null;
res = await worker.fetch(await luluReq(shippedRaw, await luluHmac(shippedRaw, 'cs', 'base64')), env());
assert.strictEqual(res.status, 200);
assert.ok(brevoBody, 'base64-encoded HMAC should verify');
console.log('✓ accepts both hex and base64 HMAC encodings');

// 13. Forged Lulu signature rejected
res = await worker.fetch(await luluReq(shippedRaw, 'not-a-real-hmac'), env());
assert.strictEqual(res.status, 400);
console.log('✓ forged Lulu signature rejected with 400');

// 14. Non-shipped status ignored
const created = JSON.stringify({
  topic: 'PRINT_JOB_STATUS_CHANGED',
  data: { ...shipped.data, status: { name: 'IN_PRODUCTION' } },
});
brevoBody = null;
res = await worker.fetch(await luluReq(created, await luluHmac(created, 'cs')), env());
assert.strictEqual(res.status, 200);
assert.strictEqual(brevoBody, null, 'only SHIPPED should notify');
console.log('✓ non-shipped status changes ignored');

// 15. No buyer email returns 200, not 500 — Lulu deactivates a webhook after
//     5 consecutive failures, and this can never succeed on retry.
const noEmail = JSON.stringify({
  topic: 'PRINT_JOB_STATUS_CHANGED',
  data: { ...shipped.data, id: 998878, shipping_address: { name: 'Jane Resident' } },
});
res = await worker.fetch(await luluReq(noEmail, await luluHmac(noEmail, 'cs')), env());
assert.strictEqual(res.status, 200, 'unsendable notification must not burn Lulu retries');
console.log('✓ missing buyer email does not risk webhook deactivation');

// 16. Brevo outage returns 500 so Lulu retries, and does not mark as notified
brevoStatus = 503;
const e16 = env();
res = await worker.fetch(await luluReq(shippedRaw, await luluHmac(shippedRaw, 'cs')), e16);
assert.strictEqual(res.status, 500, 'Brevo outage should ask Lulu to retry');
assert.strictEqual(e16.FULFILLMENT.store.size, 0, 'must not record a notification that never sent');
brevoStatus = 201;
console.log('✓ Brevo outage retries instead of silently dropping the email');

console.log('\nAll 16 checks passed.');
