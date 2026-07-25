#!/usr/bin/env node
/**
 * Builds a Lulu pod_package_id from readable book specs and verifies it against
 * Lulu's cost-calculation endpoint. A wrong SKU is rejected there, so a clean
 * run is proof the value is real — and it prints your actual unit cost.
 *
 *   LULU_CLIENT_KEY=... LULU_CLIENT_SECRET=... \
 *     node find-sku.mjs --trim 6x9 --color FC --bind PB --paper 060UW444 \
 *                       --finish GXX --pages 220
 *
 * Add --live to price against production instead of sandbox.
 */

const OPTIONS = {
  trim: {
    '6x9': '0600X0900', '5.5x8.5': '0550X0850', '5x8': '0500X0800',
    '8.5x11': '0850X1100', '8x10': '0800X1000', '7x10': '0700X1000',
    '8.5x8.5': '0850X0850', '6.14x9.21': '0614X0921', 'a5': '0583X0827',
  },
  color: { BW: 'black & white', FC: 'full color' },
  quality: { STD: 'standard', PRE: 'premium' },
  bind: {
    PB: 'perfect bound paperback', CO: 'coil bound', WO: 'wire-o',
    SS: 'saddle stitch', CW: 'case wrap hardcover', LW: 'linen wrap hardcover',
  },
  paper: {
    '060UW444': '60# uncoated white, 444 ppi',
    '060UC444': '60# uncoated cream, 444 ppi',
    '080CW444': '80# coated white, 444 ppi',
    '100CW444': '100# coated white, 444 ppi',
  },
  finish: {
    GXX: 'gloss cover, no linen, no foil',
    MXX: 'matte cover, no linen, no foil',
  },
};

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg, i, all) =>
    arg.startsWith('--') ? [[arg.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]]] : []
  )
);

function reference() {
  console.log('\npod_package_id = TRIM . COLOR . QUALITY . BIND . PAPER . FINISH\n');
  for (const [group, values] of Object.entries(OPTIONS)) {
    console.log(`  --${group}`);
    for (const [code, label] of Object.entries(values)) {
      console.log(`      ${code.padEnd(10)} ${typeof label === 'string' ? label : ''}`);
    }
  }
  console.log('\nCheck your book\'s specs in the Lulu project you already sell.\n');
}

if (args.help || !args.pages) {
  console.log('Usage: node find-sku.mjs --trim 6x9 --color FC --bind PB --paper 060UW444 --finish GXX --pages 220');
  reference();
  process.exit(args.help ? 0 : 1);
}

const trim = OPTIONS.trim[args.trim];
if (!trim) {
  console.error(`Unknown --trim "${args.trim}". Known: ${Object.keys(OPTIONS.trim).join(', ')}`);
  process.exit(1);
}

const quality = args.quality || 'STD';
const sku = `${trim}${args.color || 'FC'}${quality}${args.bind || 'PB'}${args.paper || '060UW444'}${args.finish || 'GXX'}`;
const pageCount = Number(args.pages);

const base = args.live ? 'https://api.lulu.com' : 'https://api.sandbox.lulu.com';
console.log(`\n  SKU        ${sku}`);
console.log(`  pages      ${pageCount}`);
console.log(`  env        ${args.live ? 'PRODUCTION' : 'sandbox'}`);

const { LULU_CLIENT_KEY, LULU_CLIENT_SECRET } = process.env;

if (!LULU_CLIENT_KEY || !LULU_CLIENT_SECRET) {
  console.error('\nSet LULU_CLIENT_KEY and LULU_CLIENT_SECRET to price-check it against Lulu.');
  process.exit(1);
}

console.log(`\nVerifying against Lulu...`);

const auth = await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${Buffer.from(`${LULU_CLIENT_KEY}:${LULU_CLIENT_SECRET}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials',
});

if (!auth.ok) {
  console.error(`\n✗ Auth failed (${auth.status}). Check your credentials match the ${args.live ? 'production' : 'sandbox'} environment.`);
  console.error(await auth.text());
  process.exit(1);
}

const { access_token } = await auth.json();

const res = await fetch(`${base}/print-job-cost-calculations/`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    line_items: [{ page_count: pageCount, pod_package_id: sku, quantity: 1 }],
    shipping_address: {
      city: 'Boston', country_code: 'US', postcode: '02115',
      state_code: 'MA', street1: '123 Main St',
    },
    shipping_option: 'MAIL',
  }),
});

const body = await res.json().catch(() => null);

if (!res.ok) {
  console.error(`\n✗ Lulu rejected this SKU (${res.status}):\n`);
  console.error(JSON.stringify(body, null, 2));
  reference();
  process.exit(1);
}

const print = Number(body.line_item_costs?.[0]?.total_cost_incl_tax ?? 0);
const shipping = Number(body.shipping_cost?.total_cost_incl_tax ?? 0);
const total = Number(body.total_cost_incl_tax ?? print + shipping);

console.log(`\n✓ Valid SKU — Lulu priced it.\n`);
console.log(`  print            $${print.toFixed(2)}`);
console.log(`  shipping (MAIL)  $${shipping.toFixed(2)}`);
console.log(`  ─────────────────────────`);
console.log(`  cost per book    $${total.toFixed(2)}`);
console.log(`  margin at $60    $${(60 - total).toFixed(2)}  (before Stripe fees, ~$2.04 on $60)\n`);
console.log(`Put this in wrangler.toml:\n  POD_PACKAGE_ID = "${sku}"\n`);
