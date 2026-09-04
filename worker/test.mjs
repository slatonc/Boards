import worker, { OrderFulfillment } from './src/index.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const session = {
  id: 'cs_test_order', payment_status: 'paid', payment_link: 'plink_book',
  customer_details: { email: 'buyer@example.com', name: 'Test Buyer', phone: '+12015550123' },
  collected_information: { shipping_details: { name: 'Test Buyer', address: {
    line1: '123 Test St', line2: 'Apt 4', city: 'Boston', state: 'MA', postal_code: '02115', country: 'US',
  } } },
};
function harness() {
  const records = new Map(), legacy = new Map(), objects = new Map();
  const calls = { creates: [], emails: [], jobs: [] };
  const options = { quantity: 2, link: 'https://buy.stripe.com/book', failEmail: false, failCreate: false, timeoutAfterCreate: false, holdCreate: null, failSave: false, searchFails: false };
  const storage = {
    get: async k => structuredClone(records.get(k)),
    put: async (k, v) => {
      if (options.failSave && k === 'order' && v.printJobId) { options.failSave = false; throw new Error('storage unavailable'); }
      records.set(k, structuredClone(v));
    },
    setAlarm: async t => records.set('alarm', t),
    deleteAlarm: async () => records.delete('alarm'),
  };
  const env = {
    STRIPE_WEBHOOK_SECRET: 'stripe-secret', STRIPE_SECRET_KEY: 'test', LULU_CLIENT_KEY: 'test', LULU_CLIENT_SECRET: 'lulu-secret',
    LULU_API_BASE: 'https://mock.lulu', BOOK_TITLE: 'For The Boards', LULU_CONTACT_EMAIL: 'seller@example.com',
    LULU_PRINTABLE_ID: 'printable', ALLOWED_PAYMENT_LINK_URL: 'https://buy.stripe.com/book',
    SHIPPING_LEVEL: 'MAIL', PRODUCTION_DELAY: '120', FALLBACK_PHONE: '555-0100', BREVO_API_KEY: 'test',
    EMAIL_FROM: 'seller@example.com', EMAIL_FROM_NAME: 'For The Boards', EMAIL_BCC: 'seller@example.com', ALERT_EMAIL: 'seller@example.com',
    FULFILLMENT: { get: async k => legacy.get(k) ?? null },
  };
  env.ORDERS = {
    idFromName: id => id,
    get: id => { if (!objects.has(id)) objects.set(id, new OrderFulfillment({ storage }, env)); return objects.get(id); },
  };
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('/payment_links/')) return Response.json({ url: options.link });
    if (url.includes('/line_items?')) return Response.json({ data: [{ quantity: options.quantity }], has_more: false });
    if (url.includes('openid-connect/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
    if (url.includes('/print-jobs/?')) {
      if (options.searchFails) return new Response('down', { status: 503 });
      return Response.json({ results: calls.jobs, next: null });
    }
    if (/\/print-jobs\/\d+\/$/.test(url)) {
      const id = Number(url.match(/(\d+)\/$/)[1]);
      const job = calls.jobs.find(j => j.id === id);
      return job ? Response.json(job) : new Response('missing', { status: 404 });
    }
    if (url.endsWith('/print-jobs/')) {
      const body = JSON.parse(init.body); calls.creates.push(body);
      if (options.holdCreate) await options.holdCreate;
      if (options.failCreate) return new Response('down', { status: 503 });
      const job = { ...body, id: calls.creates.length + 100, date_created: new Date().toISOString(), status: { name: 'PRODUCTION_DELAY' } };
      calls.jobs.push(job);
      if (options.timeoutAfterCreate) throw new Error('response lost');
      return Response.json(job, { status: 201 });
    }
    if (url.includes('api.brevo.com')) {
      if (options.failEmail) return new Response('down', { status: 503 });
      calls.emails.push(JSON.parse(init.body)); return Response.json({ messageId: 'test-message' });
    }
    throw new Error('Unexpected fetch: ' + url);
  };
  return { env, records, legacy, objects, calls, options, storage };
}
function stripeRequest(value = session, type = 'checkout.session.completed', timestamp = Math.floor(Date.now() / 1000)) {
  const body = JSON.stringify({ type, data: { object: value } });
  const signature = createHmac('sha256', 'stripe-secret').update(`${timestamp}.${body}`).digest('hex');
  return new Request('https://worker.test/', { method: 'POST', body, headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` } });
}
function luluRequest(job, encoding = 'hex') {
  const body = JSON.stringify({ topic: 'PRINT_JOB_STATUS_CHANGED', data: job });
  return new Request('https://worker.test/lulu', { method: 'POST', body, headers: { 'lulu-hmac-sha256': createHmac('sha256', 'lulu-secret').update(body).digest(encoding) } });
}
async function checkout(h, value = session, type) { return worker.fetch(stripeRequest(value, type), h.env); }
async function shipped(h) {
  await checkout(h);
  Object.assign(h.calls.jobs[0], { status: { name: 'SHIPPED', line_item_statuses: [{ messages: { tracking_id: 'TRACK1', tracking_urls: ['https://tracking.example/1'] } }] } });
  return h.calls.jobs[0];
}

test('paid checkout submits one book product with exact quantity and shipping details', async () => {
  const h = harness(), response = await checkout(h);
  assert.equal(response.status, 200); assert.equal(h.calls.creates.length, 1);
  const body = h.calls.creates[0]; assert.equal(body.line_items[0].quantity, 2); assert.equal(body.line_items[0].printable_id, 'printable');
  assert.equal(body.shipping_address.email, 'buyer@example.com'); assert.equal(body.shipping_address.street2, 'Apt 4');
  assert.equal(body.shipping_level, 'MAIL'); assert.equal(body.production_delay, 120); assert.equal(body.external_id, session.id);
  assert.equal(h.records.get('order').phase, 'submitted'); assert.ok(h.records.get('alarm'));
});
test('sequential replay does not create another job', async () => {
  const h = harness(); await checkout(h); assert.equal((await checkout(h)).status, 200); assert.equal(h.calls.creates.length, 1);
});
test('concurrent duplicate returns retry while only one creation proceeds', async () => {
  const h = harness(); let release; h.options.holdCreate = new Promise(r => { release = r; });
  const first = checkout(h);
  while (!h.calls.creates.length) await new Promise(r => setImmediate(r));
  assert.equal((await checkout(h)).status, 503); release(); assert.equal((await first).status, 200);
  assert.equal(h.calls.creates.length, 1);
});
test('storage failure after acceptance reconciles across object restart without reprinting', async () => {
  const h = harness(); h.options.failSave = true; assert.equal((await checkout(h)).status, 503);
  assert.equal(h.records.get('order').phase, 'creating'); h.objects.clear();
  assert.equal((await checkout(h)).status, 200); assert.equal(h.calls.creates.length, 1); assert.equal(h.records.get('order').printJobId, 101);
});
test('lost Lulu response is reconciled without reprinting', async () => {
  const h = harness(); h.options.timeoutAfterCreate = true; assert.equal((await checkout(h)).status, 503);
  h.objects.clear(); assert.equal((await checkout(h)).status, 200); assert.equal(h.calls.creates.length, 1);
});
test('ambiguous submission with no visible job remains held and alerts once', async () => {
  const h = harness(); h.options.failCreate = true; assert.equal((await checkout(h)).status, 503);
  h.options.failCreate = false; h.objects.clear(); assert.equal((await checkout(h)).status, 503);
  assert.equal(h.calls.creates.length, 1); assert.equal(h.calls.emails.length, 1);
});
test('legacy completed records are respected', async () => {
  const h = harness(); h.legacy.set('session:' + session.id, JSON.stringify({ state: 'done', printJobId: 88, at: new Date().toISOString() }));
  assert.equal((await checkout(h)).status, 200); assert.equal(h.calls.creates.length, 0); assert.equal(h.records.get('order').printJobId, 88);
});
test('legacy processing claims are never acknowledged as fulfilled or blindly reprinted', async () => {
  const h = harness(); h.legacy.set('session:' + session.id, JSON.stringify({ state: 'processing', at: new Date().toISOString() }));
  assert.equal((await checkout(h)).status, 503); assert.equal(h.calls.creates.length, 0);
});
test('historical Lulu match without a storage record is imported', async () => {
  const h = harness(); h.calls.jobs.push({ id: 99, external_id: session.id, status: { name: 'CANCELED' } });
  assert.equal((await checkout(h)).status, 200); assert.equal(h.calls.creates.length, 0); assert.equal(h.records.get('order').printJobId, 99);
});
test('reconciliation failure never falls through to creation', async () => {
  const h = harness(); h.options.searchFails = true; assert.equal((await checkout(h)).status, 503); assert.equal(h.calls.creates.length, 0);
});
test('delayed payment success fulfills; unpaid and unrelated event types do not', async () => {
  const h = harness(); await checkout(h, { ...session, payment_status: 'unpaid' }); assert.equal(h.calls.creates.length, 0);
  await checkout(h, session, 'checkout.session.async_payment_failed'); assert.equal(h.calls.creates.length, 0);
  assert.equal((await checkout(h, session, 'checkout.session.async_payment_succeeded')).status, 200); assert.equal(h.calls.creates.length, 1);
});
test('unrelated Payment Link cannot trigger a book', async () => {
  const h = harness(); h.options.link = 'https://buy.stripe.com/other'; assert.equal((await checkout(h)).status, 200); assert.equal(h.calls.creates.length, 0);
  await checkout(h, { ...session, payment_link: null }); assert.equal(h.calls.creates.length, 0);
});
test('missing allowed link configuration fails closed', async () => {
  const h = harness(); delete h.env.ALLOWED_PAYMENT_LINK_URL; assert.equal((await checkout(h)).status, 503); assert.equal(h.calls.creates.length, 0);
});
test('missing shipping data and billing-only address do not create jobs', async () => {
  const h = harness(); const bad = { ...session, collected_information: {}, customer_details: { ...session.customer_details, address: session.collected_information.shipping_details.address } };
  assert.equal((await checkout(h, bad)).status, 503); assert.equal(h.calls.creates.length, 0);
  assert.equal((await checkout(h)).status, 200); assert.equal(h.calls.creates.length, 1);
});
test('non-US destination and invalid quantities are rejected before printing', async () => {
  const h = harness(); const nonUS = structuredClone(session); nonUS.collected_information.shipping_details.address.country = 'CA';
  assert.equal((await checkout(h, nonUS)).status, 503); assert.equal(h.calls.creates.length, 0);
  h.options.quantity = 1.5; assert.equal((await checkout(h)).status, 503); assert.equal(h.calls.creates.length, 0);
});
test('source PDF mode works and absent print configuration fails before creation', async () => {
  const h = harness(); delete h.env.LULU_PRINTABLE_ID;
  assert.equal((await checkout(h)).status, 503); assert.equal(h.calls.creates.length, 0);
  Object.assign(h.env, { INTERIOR_PDF_URL: 'https://example.com/interior.pdf', COVER_PDF_URL: 'https://example.com/cover.pdf', POD_PACKAGE_ID: 'sku' });
  assert.equal((await checkout(h)).status, 200); assert.equal(h.calls.creates[0].line_items[0].printable_normalization.interior.source_url, h.env.INTERIOR_PDF_URL);
});
test('invalid and stale signatures are rejected', async () => {
  const h = harness(); const forged = stripeRequest(); forged.headers.set('stripe-signature', 't=1,v1=wrong');
  assert.equal((await worker.fetch(forged, h.env)).status, 400);
  assert.equal((await worker.fetch(stripeRequest(session, undefined, 1), h.env)).status, 400);
  const badLulu = luluRequest({}); badLulu.headers.set('lulu-hmac-sha256', 'wrong');
  assert.equal((await worker.fetch(badLulu, h.env)).status, 400); assert.equal(h.calls.creates.length, 0);
});
test('method, route and request-size restrictions', async () => {
  const h = harness(); assert.equal((await worker.fetch(new Request('https://worker.test/'), h.env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://worker.test/other'), h.env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://worker.test/', { method: 'POST', body: 'x'.repeat(262145) }), h.env)).status, 413);
});
test('verified shipped job sends buyer tracking and seller BCC only once', async () => {
  const h = harness(), job = await shipped(h);
  assert.equal((await worker.fetch(luluRequest(job, 'base64'), h.env)).status, 200);
  assert.equal(h.calls.emails.length, 1); assert.equal(h.calls.emails[0].to[0].email, 'buyer@example.com');
  assert.deepEqual(h.calls.emails[0].bcc, [{ email: 'seller@example.com' }]); assert.match(h.calls.emails[0].textContent, /https:\/\/tracking.example\/1/);
  await worker.fetch(luluRequest(job), h.env); assert.equal(h.calls.emails.length, 1); assert.equal(h.records.has('alarm'), false);
});
test('notification uses Lulu API data, not unverified webhook recipient', async () => {
  const h = harness(), job = await shipped(h); const payload = { ...job, shipping_address: { email: 'wrong@example.com' } };
  await worker.fetch(luluRequest(payload), h.env); assert.equal(h.calls.emails[0].to[0].email, 'buyer@example.com');
});
test('legacy shipped record suppresses repeat notification', async () => {
  const h = harness(), job = await shipped(h); h.legacy.set(`shipped:${job.id}`, 'done');
  await worker.fetch(luluRequest(job), h.env); assert.equal(h.calls.emails.length, 0);
});
test('missing buyer email alerts seller instead of silently losing notification', async () => {
  const h = harness(), job = await shipped(h); delete job.shipping_address.email;
  assert.equal((await worker.fetch(luluRequest(job), h.env)).status, 200); assert.equal(h.calls.emails[0].to[0].email, 'seller@example.com');
});
test('email failure remains retryable and unmarked', async () => {
  const h = harness(), job = await shipped(h); h.options.failEmail = true;
  assert.equal((await worker.fetch(luluRequest(job), h.env)).status, 503); assert.equal(h.records.has(`shipped:${job.id}`), false);
  h.options.failEmail = false; assert.equal((await worker.fetch(luluRequest(job), h.env)).status, 200); assert.equal(h.calls.emails.length, 1);
});
test('unsafe tracking links are not included in email HTML', async () => {
  const h = harness(), job = await shipped(h); job.status.line_item_statuses[0].messages.tracking_urls = ['javascript:alert(1)'];
  await worker.fetch(luluRequest(job), h.env); assert.doesNotMatch(h.calls.emails[0].htmlContent, /javascript:/);
});
test('rejected and canceled jobs generate one seller alert per status', async () => {
  const h = harness(); await checkout(h); const job = h.calls.jobs[0]; job.status = { name: 'REJECTED' };
  await worker.fetch(luluRequest(job), h.env); await worker.fetch(luluRequest(job), h.env);
  assert.equal(h.calls.emails.length, 1); assert.equal(h.calls.emails[0].to[0].email, 'seller@example.com'); assert.equal(h.records.has('alarm'), false);
});
test('alarm reconciles a lost response and monitors unpaid orders', async () => {
  const h = harness(); h.options.timeoutAfterCreate = true; await checkout(h);
  const job = h.calls.jobs[0]; job.date_created = new Date(Date.now() - 7 * 3600000).toISOString(); job.status = { name: 'UNPAID' };
  await h.env.ORDERS.get(session.id).alarm(); assert.equal(h.records.get('order').printJobId, 101);
  assert.ok(h.calls.emails.some(e => /still unpaid/.test(e.textContent))); assert.ok(h.records.get('alarm')); assert.equal(h.calls.creates.length, 1);
});
test('alarm can deliver shipping mail even without a Lulu webhook', async () => {
  const h = harness(); await shipped(h); await h.env.ORDERS.get(session.id).alarm();
  assert.equal(h.calls.emails[0].to[0].email, 'buyer@example.com'); assert.equal(h.records.has('alarm'), false);
});
test('alarm stops long-running polling after seller escalation', async () => {
  const h = harness(); await checkout(h); h.calls.jobs[0].date_created = new Date(Date.now() - 31 * 86400000).toISOString();
  await h.env.ORDERS.get(session.id).alarm(); assert.equal(h.records.has('alarm'), false); assert.ok(h.calls.emails.some(e => /30 days/.test(e.textContent)));
});
