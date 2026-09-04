# For The Boards fulfillment

Stripe Payment Link → signed Stripe webhook → one Durable Object per Checkout session → Lulu print job. Lulu status notifications and a six-hour status check deliver shipping emails and seller alerts through Brevo.

## Production configuration

The production Worker is `fortheboards-fulfillment-prod`, with two public routes:

- `POST /`: signed `checkout.session.completed` and `checkout.session.async_payment_succeeded` notifications. Only paid sessions from `ALLOWED_PAYMENT_LINK_URL` may print.
- `POST /lulu`: signed `PRINT_JOB_STATUS_CHANGED` notifications. The service retrieves the job from Lulu before trusting its current status and recipient.

Secrets are managed with Wrangler: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LULU_CLIENT_KEY`, `LULU_CLIENT_SECRET`, and `BREVO_API_KEY`. The Stripe key must be allowed to retrieve Payment Links and Checkout line items. `ALERT_EMAIL` receives operational alerts; `EMAIL_BCC` controls the existing copy of buyer shipping mail. Both are currently the seller's address.

The storefront remains hosted separately on Cloudflare Pages. `node build-site.mjs` builds only intended public files into `dist/`; the Worker, local credentials, recorder, and private output must never be part of that deployment.

## Duplicate protection and recovery

`ORDERS` binds the `OrderFulfillment` Durable Object class. Each Stripe session gets one object with a persistent order phase. Concurrent requests receive a retry response while the first request is active. Only a confirmed Lulu job ID is acknowledged as submitted.

The old `FULFILLMENT` KV namespace is retained for migration. Completed legacy orders and shipping notifications are honored. Legacy processing claims are treated as uncertain, not completed. Do not delete old KV records to force a reprint.

Before a new create request, the service searches Lulu and matches the exact external reference. Immediately before creating a job, it durably records the `creating` phase. If Lulu accepts a job but the response or final storage write is lost, the next notification or alarm reconciles it against Lulu without creating another book.

An ambiguous create with no visible Lulu match is held for seller review. This intentionally favors avoiding duplicate printing over blindly retrying an uncertain external side effect. After notifying the seller and one scheduled reconciliation, automatic polling of an unconfirmed submission stops. Stripe may still retry its original event, and each retry checks again for a matching job.

To resolve an alert, inspect both Stripe and Lulu using the payment reference. If a job exists, resend the Stripe event to let the service find it. If multiple jobs exist, inspect their state before canceling any unwanted copy. If no job exists and a manual order is necessary, use the same Checkout session ID as Lulu's external reference so reconciliation can find it. Never erase a durable order record simply to retry payment fulfillment. Refunds and deliberate reprints require a human decision.

## Monitoring and email

After submission, an alarm checks Lulu every six hours as a fallback when a webhook is delayed or disabled. Seller alerts cover rejected/canceled jobs, unpaid jobs older than six hours, jobs not shipped after 14 days, missing buyer email, uncertain submissions, and duplicate references. Routine polling stops after shipment, rejection/cancellation, or a final escalation after 30 days. Alerts are deduplicated per reason in the order record. An email provider response lost after acceptance can still lead to a repeated email on retry; email delivery is not an exactly-once guarantee.

A `SHIPPED` job triggers the buyer email. Tracking is included when Lulu provides it; `MAIL` shipping does not guarantee tracking for every destination. Missing recipient email alerts the seller instead of silently discarding the issue. Brevo's sender must be verified, and domain authentication should be checked in Brevo. Configured credentials alone do not prove inbox delivery.

Lulu automatic payment must be enabled with an appropriate saved payment method. Creating a print job is not proof that Lulu has been paid, printed it, or shipped it. Lulu also deactivates webhooks after repeated failed deliveries; the status alarm provides a fallback for orders submitted by this service.

## Validation and release

```sh
cd worker
npm test
node test-runtime.mjs
npx wrangler deploy --env production --dry-run
npx wrangler deploy --env production
```

`npm test` covers signatures, old/new Stripe shipping fields, quantity and country validation, concurrent/repeated notifications, legacy migration, lost responses, storage failure, shipping mail, operational alerts, and monitoring. `test-runtime.mjs` uses Miniflare supplied with Wrangler to exercise real Durable Object and KV bindings. Both mock all external HTTP: neither creates real orders nor sends email.

The first deployment creates a SQLite-backed Durable Object namespace with the `v1-order-fulfillment` migration. Preserve that namespace on later releases. Do not roll back to the old KV-only fulfillment algorithm after accepting orders with the new service.

In Stripe, subscribe the existing endpoint to both `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Keep any other existing subscriptions unless intentionally changing them. Receipt settings and delayed-payment behavior need verification in the Stripe account.

## Sandbox and final acceptance

The sandbox is a separate Lulu account with separate credentials and printables. Configure its own `ALLOWED_PAYMENT_LINK_URL` and either `LULU_PRINTABLE_ID` or the two PDF URLs before running a sandbox checkout. Production printables do not substitute for sandbox assets. `ALERT_EMAIL` is not set in the default environment, so sandbox issues only log unless explicitly configured.

Final live acceptance requires an authorized purchase: verify one Stripe payment maps to one Lulu job, confirm automatic payment/production, then shipment, buyer email, tracking where available, and physical arrival. The automated checks do not certify the quality of the printed book or real inbox delivery.
