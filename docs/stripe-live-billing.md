# Cova live billing release

Raf approved real customer billing at **USD 29 per month** on September 28, 2026. This is separate from the existing USD 30 sandbox price and its isolated provider account and records.

## Activation contract

Production billing is opt-in and fails closed. Required production settings:

- `COVA_BILLING_MODE=live`
- `COVA_BILLING_LIVE_ENABLED=true`
- `COVA_BILLING_ORIGIN=https://covadesk.com`
- `VERCEL_ENV=production` (provided by Vercel)
- `STRIPE_SECRET_KEY`: a live secret/restricted key, stored as sensitive
- `STRIPE_ACCOUNT_ID`: the verified live account, with charges enabled
- `STRIPE_PRO_PRICE_ID`: active, live USD 2900 monthly recurring price, interval count 1
- `STRIPE_PORTAL_CONFIGURATION_ID`: the live portal configuration
- `STRIPE_WEBHOOK_SECRET`: the live endpoint signing secret, stored as sensitive
- `VITE_COVA_BILLING_ENABLED=true`
- Existing production Upstash and Supabase configuration

Do not reuse sandbox price, portal, account, webhook or entitlement records. Sandbox remains preview-only and owner-allowlisted. Live billing is available only to authenticated Cova owners, with server-owned customer mapping. Live and sandbox durable records are namespaced independently.

Webhook endpoint: `https://covadesk.com/api/billing?webhook=1`. Configure the same supported subscription, invoice and checkout events documented in `stripe-sandbox-billing.md`.

## Preserved safeguards

- Checkout cannot grant Pro from a redirect, client cache or unsigned event.
- Current provider state and a paid matching invoice determine subscription access.
- Scheduled cancellation honors both `cancel_at` and `cancel_at_period_end`.
- Duplicate and reordered events cannot restore canceled access.
- Account deletion checks all live billing owners, not only sandbox allowlisted users.
- Other-owner customer records, test objects in live mode, mismatched accounts and unexpected prices fail closed.
- Existing manual administrator Pro entitlements remain independent.
- Subscription checkout retains the existing card-only, no-promotion, no-automatic-tax configuration; this is not a determination of the business's tax obligations.

## Verification and launch boundary

`npm run test:billing` covers sandbox and live-mode contract tests, raw signed webhook verification, real React desktop/mobile billing with synthetic transport, price/mode presentation, owner switching, revocation and deletion protection. The live-mode browser fixture performs **no real charges**.

The original deployed sandbox hosted checkout, paid Pro grant, portal cancellation, terminal revocation and old-event replay were exercised separately. Those results do not claim a live payment occurred.

At creation of this document, production billing is not published. A read-only build of the existing deployed main commit confirmed that the saved Production Stripe key was a test key. Raf was asked to replace only that Production value with the live key. Remaining launch gates are provider readiness/configuration, the final candidate's full checks, normal merge/deploy and canonical-domain authenticated checkout/portal verification. Do not charge the owner or any customer merely to generate a launch-test receipt.

## Customer lifecycle contract

- Billing distinguishes subscription-derived access from independent administrator-included Pro.
- Incomplete, past-due and unpaid subscriptions expose actionable payment-needed states rather than another checkout.
- The recover action accepts no customer, subscription, invoice, price or redirect from the caller. It resolves a single open matching USD subscription invoice from the authenticated owner, checks provider mode and ownership, and returns only its verified Stripe-hosted invoice link. Opening that link never grants access.
- Manage billing continues to use the configured customer portal for payment details and invoice history.
- Status requests are single-flight per owner. An action invalidates stale reads, and focus refresh cannot overwrite a confirmed cancellation.
- Subscription-derived access is rechecked at its paid-through deadline even in an already-open tab. An expired subscription response cannot re-grant Pro. Included grants are independent.
- Cancellation, expiry and failed payments do not delete trades, journal entries, account ownership or saved history.
- The canonical billing suite includes the customer-lifecycle security regressions plus actual desktop/laptop/phone component interaction. Real hosted sandbox checks, signed-webhook receipts and canonical production checks remain separate release evidence, not claims made by synthetic tests.
