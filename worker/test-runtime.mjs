// Runs the real Durable Object and KV bindings locally; all outbound HTTP is mocked.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
const expected = new Map([
  ['GET https://api.stripe.com/v1/payment_links/plink_book', [200, { url: 'https://buy.stripe.com/book' }]],
  ['GET https://api.stripe.com/v1/checkout/sessions/cs_test_runtime/line_items?limit=100', [200, { data: [{ quantity: 1 }] }]],
  ['POST https://lulu.test/auth/realms/glasstree/protocol/openid-connect/token', [200, { access_token: 'test', expires_in: 3600 }]],
  ['GET https://lulu.test/print-jobs/?search=cs_test_runtime&page_size=100', [200, { results: [], next: null }]],
  ['POST https://lulu.test/print-jobs/', [201, { id: 123 }]],
]);
const unexpected = [];
function outboundService(request) {
  const key = `${request.method} ${request.url}`;
  const reply = expected.get(key);
  if (!reply) {
    unexpected.push(key);
    return new Response('Unexpected or repeated outbound request', { status: 500 });
  }
  expected.delete(key);
  return Response.json(reply[1], { status: reply[0] });
}
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, scriptPath: new URL('./src/index.js', import.meta.url).pathname,
  compatibilityDate: '2026-07-01', outboundService,
  kvNamespaces: ['FULFILLMENT'], durableObjects: { ORDERS: { className: 'OrderFulfillment', useSQLite: true } },
  bindings: { STRIPE_WEBHOOK_SECRET: 'test', STRIPE_SECRET_KEY: 'test', LULU_CLIENT_KEY: 'test', LULU_CLIENT_SECRET: 'test', LULU_API_BASE: 'https://lulu.test', LULU_PRINTABLE_ID: 'test', ALLOWED_PAYMENT_LINK_URL: 'https://buy.stripe.com/book', BOOK_TITLE: 'Test', LULU_CONTACT_EMAIL: 'test@example.com' },
}));
const session = { id: 'cs_test_runtime', payment_link: 'plink_book', payment_status: 'paid', shipping_details: { name: 'Test', address: { line1: '123 Test St', city: 'Boston', state: 'MA', postal_code: '02115', country: 'US' } } };
const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: session } });
const t = Math.floor(Date.now() / 1000);
const sig = createHmac('sha256', 'test').update(`${t}.${body}`).digest('hex');
const send = () => mf.dispatchFetch('http://localhost/', { method: 'POST', body, headers: { 'stripe-signature': `t=${t},v1=${sig}` } });
try {
  const pair = await Promise.all([send(), send()]);
  assert.ok(pair.some(r => r.status === 200), 'one request must submit');
  assert.ok(pair.every(r => [200, 503].includes(r.status)));
  const replay = await send(); assert.equal(replay.status, 200); assert.equal((await replay.json()).printJobId, 123);
  assert.deepEqual(unexpected, [], 'no unexpected or repeated outbound requests');
  assert.equal(expected.size, 0, 'all expected requests were made');
  console.log('Real Cloudflare runtime: signed checkout, Durable Object, KV migration read, concurrency and replay passed with exactly one mocked Lulu creation.');
} finally { await mf.dispose(); }
