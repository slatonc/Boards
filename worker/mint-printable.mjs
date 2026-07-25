#!/usr/bin/env node
/**
 * Mints a permanent Lulu printable_id from your print-ready PDFs, so the
 * Worker never has to fetch them again.
 *
 * Lulu normalizes source files once, at print-job creation, and stores the
 * result forever behind a printable_id. This creates one throwaway job purely
 * to trigger that, reads the id, then cancels the job — nothing prints and
 * nothing is charged.
 *
 *   LULU_CLIENT_KEY=... LULU_CLIENT_SECRET=... \
 *     node mint-printable.mjs --interior <url> --cover <url>
 *
 * Add --live to run against production (that's where your real credentials
 * work, and where the id needs to exist).
 *
 * Credentials are prompted for if not already in the environment.
 */

import readline from 'node:readline';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) =>
    a.startsWith('--') ? [[a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]]] : []
  )
);

if (!args.interior || !args.cover) {
  console.error('Usage: node mint-printable.mjs --interior <url> --cover <url> [--live]');
  process.exit(1);
}

const base = args.live ? 'https://api.lulu.com' : 'https://api.sandbox.lulu.com';
const POD_PACKAGE_ID = args.sku || '0850X1100FCSTDPB060UW444MXX';
/**
 * Prompts without echoing. Keeps credentials out of shell history, out of the
 * process list, and off the screen. Cloudflare Worker secrets are write-only,
 * so there is nothing to read them back from.
 */
function promptHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

    // Mute only the echo of what's typed — never the prompt itself. Muting
    // before rl.question() lets readline's redraw wipe the prompt off screen,
    // leaving a blank line that looks like a hang.
    let muted = false;
    rl._writeToOutput = (s) => {
      if (!muted) rl.output.write(s);
    };

    // Without this, a closed stdin (piped input, ^D) leaves the promise pending
    // and the script hangs with no explanation.
    rl.on('close', () => resolve(''));
    rl.question(query, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = true;
  });
}

const needsPrompt = !process.env.LULU_CLIENT_KEY || !process.env.LULU_CLIENT_SECRET;

// A non-TTY stdin makes readline resolve instantly with nothing, which looks
// like the prompt was skipped. Say so plainly instead of failing blank.
if (needsPrompt && !process.stdin.isTTY) {
  console.error('\nNo interactive terminal available, so credentials cannot be prompted for.');
  console.error('Pass them on the command line instead:\n');
  console.error('  LULU_CLIENT_KEY=xxx LULU_CLIENT_SECRET=xxx node mint-printable.mjs --live \\');
  console.error('    --interior <url> --cover <url>\n');
  process.exit(1);
}

if (needsPrompt) console.log('\nLulu credentials (typing is hidden — paste and press Enter):\n');

const clientKey = process.env.LULU_CLIENT_KEY || (await promptHidden('  Lulu client key:    '));
const clientSecret = process.env.LULU_CLIENT_SECRET || (await promptHidden('  Lulu client secret: '));

if (!clientKey || !clientSecret) {
  console.error('\nBoth a client key and secret are required.');
  process.exit(1);
}

const token = await (async () => {
  const res = await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientKey}:${clientSecret}`).toString('base64')}`,
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
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
};

console.log(`\n  env    ${args.live ? 'PRODUCTION' : 'sandbox'}`);
console.log(`  sku    ${POD_PACKAGE_ID}`);
console.log(`\nCreating a throwaway print job to trigger normalization...`);

const job = await api('/print-jobs/', {
  method: 'POST',
  body: JSON.stringify({
    contact_email: 'slaton@fortheboards.com',
    external_id: `printable-mint-${Date.now()}`,
    line_items: [
      {
        title: 'For The Boards',
        quantity: 1,
        printable_normalization: {
          pod_package_id: POD_PACKAGE_ID,
          interior: { source_url: args.interior },
          cover: { source_url: args.cover },
        },
      },
    ],
    shipping_address: {
      name: 'Slaton Case',
      street1: '111 N Wabash Ave',
      city: 'Chicago',
      state_code: 'IL',
      postcode: '60602',
      country_code: 'US',
      phone_number: '773-543-0603',
    },
    shipping_level: 'MAIL',
    // Max delay, so there is no realistic chance of this reaching production
    // before it is cancelled below.
    production_delay: 2880,
  }),
});

console.log(`  job id ${job.id}  (will be cancelled)`);

let printableId = null;
let rejection = null;

try {
  process.stdout.write('  normalizing');
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    process.stdout.write('.');
    const current = await api(`/print-jobs/${job.id}/`);
    const status = current.status?.name;
    printableId = current.line_items?.[0]?.printable_id;

    if (printableId) break;

    if (status === 'REJECTED' || status === 'ERROR') {
      rejection = JSON.stringify(current.line_items?.[0]?.status ?? current.status, null, 2);
      break;
    }
  }
} finally {
  // REJECTED and ERROR are terminal — the job is already dead, nothing prints,
  // nothing is charged, and Lulu refuses a transition out of them. Only a job
  // that is still alive needs cancelling.
  if (rejection) {
    console.log('\n\nJob was rejected by Lulu, so it is already dead — nothing to cancel,');
    console.log('nothing will print, and you have not been charged.');
  } else {
    process.stdout.write('\n\nCancelling the throwaway job...');
    try {
      await api(`/print-jobs/${job.id}/status/`, {
        method: 'PUT',
        body: JSON.stringify({ name: 'CANCELED' }),
      });
      console.log(' cancelled. Nothing will print, nothing charged.');
    } catch (err) {
      console.log(`\n  ⚠ Could not cancel automatically: ${err.message}`);
      console.log(`  ⚠ CANCEL PRINT JOB ${job.id} IN YOUR LULU DASHBOARD NOW.`);
    }
  }
}

if (rejection) {
  console.error(`\n✗ Lulu rejected the files:\n${rejection}`);
  console.error('\nUsually this means the URL served something other than the PDF itself.');
  process.exit(1);
}

if (!printableId) {
  console.error('\n✗ Normalization did not finish in time. Check the job in your Lulu dashboard.');
  process.exit(1);
}

console.log(`\n✓ printable_id: ${printableId}\n`);
console.log(`Put this in wrangler.toml under [env.production.vars]:`);
console.log(`  LULU_PRINTABLE_ID = "${printableId}"\n`);
console.log(`Once set, the PDF URLs are never fetched again — let the temp links expire.\n`);
