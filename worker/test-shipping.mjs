#!/usr/bin/env node
/**
 * Fires a realistic SHIPPED webhook at the live endpoint, signed exactly the
 * way Lulu signs its own, so the whole notification path runs for real:
 * HMAC verification, tracking extraction, Brevo send, and the seller BCC.
 *
 * Lulu's own test-submission sends dummy data with no buyer email, so it can
 * never reach the sending code. This can.
 *
 *   LULU_CLIENT_SECRET=... node test-shipping.mjs --to you@example.com
 *
 * Each run uses a fresh print job id, so it is safe to repeat.
 */

const DEFAULT_URL = 'https://fortheboards-fulfillment-prod.slaton-case.workers.dev/lulu';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith('--') ? [[a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]]] : []
  )
);

const endpoint = args.url || DEFAULT_URL;
const recipient = args.to || 'slaton@fortheboards.com';
const secret = process.env.LULU_CLIENT_SECRET;

if (!secret) {
  console.error('Set LULU_CLIENT_SECRET — it is the key Lulu signs webhooks with.');
  process.exit(1);
}

const jobId = Number(`9${Date.now().toString().slice(-8)}`);

const payload = JSON.stringify({
  topic: 'PRINT_JOB_STATUS_CHANGED',
  data: {
    id: jobId,
    external_id: `e2e-test-${Date.now()}`,
    status: {
      name: 'SHIPPED',
      message: 'All line-items were shipped',
      changed: new Date().toISOString(),
      line_item_statuses: [
        {
          name: 'SHIPPED',
          line_item_id: 1,
          messages: {
            tracking_id: '1Z999AA10123456784',
            tracking_urls: ['https://www.ups.com/track?tracknum=1Z999AA10123456784'],
            carrier_name: 'UPS',
          },
        },
      ],
    },
    line_items: [{ title: 'For The Boards', quantity: 1 }],
    shipping_address: {
      name: args.name || 'Test Buyer',
      email: recipient,
      street1: '123 Main St',
      city: 'Chicago',
      state_code: 'IL',
      postcode: '60602',
      country_code: 'US',
    },
  },
});

const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign']
);
const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
const signature = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');

console.log(`\n  endpoint   ${endpoint}`);
console.log(`  recipient  ${recipient}`);
console.log(`  job id     ${jobId}\n`);

const res = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Lulu-HMAC-SHA256': signature },
  body: payload,
});

const text = await res.text();
console.log(`  -> ${res.status} ${text}\n`);

if (res.ok && text.includes('notified')) {
  console.log(`✓ Brevo accepted the email. Check ${recipient} — and confirm the BCC arrived too.\n`);
} else if (res.status === 500) {
  console.error('✗ Brevo rejected the send. Most often: the sender address is not');
  console.error('  verified in Brevo, or the API key is wrong.\n');
  process.exit(1);
} else {
  console.error('✗ Unexpected response — see above.\n');
  process.exit(1);
}
