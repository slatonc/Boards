# Stripe → Lulu fulfillment webhook

Replaces the Lulu Direct Shopify app. When someone pays through the Stripe
Payment Link on the site, this Worker creates a Lulu print job so the book is
printed and drop-shipped to them automatically.

```
Buyer → Stripe Payment Link → checkout.session.completed → Worker → Lulu print job
```

## Setup

Steps 1–3 you do yourself (they involve credentials and account settings).

### 1. Lulu API access — and a card on file

Create API credentials at <https://developers.lulu.com/>. You'll get a client
key and client secret for both sandbox and production.

**Then put a credit card on file in the Lulu developer portal.** Without one,
every print job this Worker creates sits in `UNPAID` status forever and nothing
ever prints. This is the single most common way this setup silently fails.

### 2. Get your `pod_package_id`

The Print API has no concept of your Lulu projects — it identifies a book by a
SKU built from its physical specs:

```
TRIM . COLOR . QUALITY . BIND . PAPER . FINISH
0600X0900 FC STD PB 060UW444 GXX
```

Read your book's specs off the Lulu project you already sell, then build and
verify the SKU:

```bash
cd worker && LULU_CLIENT_KEY=... LULU_CLIENT_SECRET=... node find-sku.mjs --trim 6x9 --color FC --bind PB --paper 060UW444 --finish GXX --pages 220
```

Run it with `--help` for the full code reference. Lulu's cost endpoint rejects
invalid SKUs, so a clean run is proof the value is real — and it prints your
per-book cost and margin against the $60 price, which is worth knowing for a
200+ page full-color book.

### 3. The print files — one upload, then never again

Lulu fetches the interior and cover server-side, so the **first** print job
needs public, unauthenticated URLs. R2 or any static host works. These must be
the print-ready files, not the website preview PDFs in `assets/`.

After that first job validates, Lulu keeps the normalized files permanently and
returns a `printable_id`. Read it off the print job:

```bash
cd worker && npx wrangler tail --env production
```

Set it in `wrangler.toml`:

```toml
LULU_PRINTABLE_ID = "11606ab3-9355-46d3-ae90-338db6f5d271"
```

From then on the Worker sends only that id, the PDF URLs are never fetched
again, and you can take the hosted files down. This is also faster — Lulu skips
re-normalizing the files on every order.

When you publish a new edition, clear `LULU_PRINTABLE_ID`, point the URLs at
the new PDFs, let one order through, then set the new `printable_id`.

### 4. Create the KV namespace

```bash
cd worker && npx wrangler kv namespace create FULFILLMENT
```

Paste the returned id into `wrangler.toml` (both the default and
`[[env.production.kv_namespaces]]` blocks).

### 5. Fill in `wrangler.toml`

Replace every `REPLACE_WITH_*` placeholder.

### 6. Set secrets

```bash
cd worker && npx wrangler secret put LULU_CLIENT_KEY && npx wrangler secret put LULU_CLIENT_SECRET && npx wrangler secret put STRIPE_SECRET_KEY && npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Repeat with `--env production` for the production Worker. Use Lulu's sandbox
credentials for the default environment and live ones for production.

### 7. Deploy

```bash
cd worker && npx wrangler deploy
```

### 8. Point Stripe at it

In the Stripe dashboard → Developers → Webhooks, add an endpoint at the
deployed Worker URL, subscribed to **`checkout.session.completed`** only. Copy
the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

## Testing

Test against Lulu's sandbox before touching production:

```bash
cd worker && npx wrangler tail
```

Then use Stripe's test mode to complete a checkout. You should see the print
job id in the logs, and the job appear in your Lulu sandbox dashboard.

Sandbox print jobs are free and never actually print.

## Operating it

**Watch the logs after go-live:**

```bash
cd worker && npx wrangler tail --env production
```

**A failed fulfillment is not a lost order.** The Worker returns 500 on
failure, which makes Stripe retry with backoff for up to ~3 days. Fix the
underlying problem and the retry goes through. Stripe emails you about
repeatedly failing endpoints.

**Duplicate protection.** Stripe can deliver the same event more than once. The
Worker records each session id in KV before calling Lulu, so a retry after a
successful print won't print a second book. If you ever need to re-run a
fulfillment deliberately, delete that key:

```bash
cd worker && npx wrangler kv key delete --binding FULFILLMENT "session:cs_live_..." --env production
```

**Cancelling a bad order.** `PRODUCTION_DELAY` (default 120 minutes) is your
window. Cancel from the Lulu dashboard before the job leaves
`PRODUCTION_DELAY` status and you're not charged for the print.

## Things that will bite you later

- **International shipping.** The Payment Link says "U.S. shipping is included"
  and charges a flat $60. Lulu bills you actual shipping to wherever the buyer
  is. If you ever open the Payment Link to non-US addresses without changing
  pricing, the shipping cost comes straight out of your margin.
- **Reprints of a new edition.** When you update the book, update
  `INTERIOR_PDF_URL` / `COVER_PDF_URL` and redeploy. Orders always use whatever
  the URLs point to at fulfillment time.
- **Bulk program orders** still go through the quote form, not this Worker. For
  those, Lulu's Order Import tool does batch fulfillment from a spreadsheet.
