#!/usr/bin/env node
/**
 * Registers (or inspects) the Lulu webhook that drives shipping notifications.
 *
 *   LULU_CLIENT_KEY=... LULU_CLIENT_SECRET=... node register-webhook.mjs --live
 *
 * Flags:
 *   --list          show existing webhooks and exit
 *   --test          fire a dummy PRINT_JOB_STATUS_CHANGED at the endpoint
 *   --url <url>     override the endpoint (defaults to the production Worker)
 */

const DEFAULT_URL = 'https://fortheboards-fulfillment-prod.slaton-case.workers.dev/lulu';
const TOPIC = 'PRINT_JOB_STATUS_CHANGED';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith('--') ? [[a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]]] : []
  )
);

const base = args.live ? 'https://api.lulu.com' : 'https://api.sandbox.lulu.com';
const endpoint = args.url || DEFAULT_URL;
const { LULU_CLIENT_KEY, LULU_CLIENT_SECRET } = process.env;

if (!LULU_CLIENT_KEY || !LULU_CLIENT_SECRET) {
  console.error('Set LULU_CLIENT_KEY and LULU_CLIENT_SECRET in your environment.');
  process.exit(1);
}

const token = await (async () => {
  const res = await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${LULU_CLIENT_KEY}:${LULU_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Auth failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
})();

const api = async (path, init = {}) => {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text}`);
  return body;
};

console.log(`\n  env       ${args.live ? 'PRODUCTION' : 'sandbox'}`);
console.log(`  endpoint  ${endpoint}\n`);

const existing = await api('/webhooks/');
const hooks = existing.results ?? existing ?? [];

if (args.list) {
  if (!hooks.length) console.log('No webhooks registered.\n');
  for (const hook of hooks) {
    console.log(`  ${hook.id}  ${hook.is_active ? 'active  ' : 'INACTIVE'}  ${hook.url}`);
    console.log(`      topics: ${(hook.topics || []).join(', ')}\n`);
  }
  process.exit(0);
}

let hook = hooks.find((h) => h.url === endpoint);

if (hook) {
  console.log(`Already registered as webhook ${hook.id} (${hook.is_active ? 'active' : 'INACTIVE'}).`);

  // Lulu deactivates a webhook after 5 consecutive delivery failures; flipping
  // is_active back is how you bring it out of that state.
  if (!hook.is_active) {
    console.log('Reactivating...');
    hook = await api(`/webhooks/${hook.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: true }),
    });
    console.log('Reactivated.');
  }
} else {
  hook = await api('/webhooks/', {
    method: 'POST',
    body: JSON.stringify({ topics: [TOPIC], url: endpoint }),
  });
  console.log(`✓ Registered webhook ${hook.id} for ${TOPIC}`);
}

if (args.test) {
  console.log('\nFiring a test submission...');
  await api(`/webhooks/${hook.id}/test-submission/${TOPIC}/`, { method: 'POST' });
  console.log('Sent. Check `npx wrangler tail --env production` for the delivery.');
  console.log('Dummy data has no buyer email, so expect "No recipient" — that means');
  console.log('the signature verified and routing works.\n');
} else {
  console.log('\nRe-run with --test to fire a dummy delivery at the endpoint.\n');
}
