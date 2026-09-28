# Stripe sandbox billing preview

This branch is **not a live billing release**. No production environment changes, Supabase migrations, user metadata grants, broker changes, or financial calculations are required. Existing manually granted Pro survives unchanged. The dashboard is preserved; Billing is a new optional settings tab plus an upgrade dialog.

## Server configuration (this preview branch only)

- `COVA_BILLING_MODE=sandbox`
- `STRIPE_SECRET_KEY`: sandbox restricted/secret key, never a CLI personal OAuth token. Store as a sensitive Vercel Preview variable. Never prefix secrets with VITE.
- `STRIPE_ACCOUNT_ID`: expected sandbox account, checked against Stripe before operations.
- `STRIPE_PRO_PRICE_ID`: active USD 3000 monthly recurring price. This implementation deliberately accepts only the sandbox price/interval agreed for testing.
- `STRIPE_PORTAL_CONFIGURATION_ID`: explicit sandbox configuration. Enable invoice history/card updates/cancel at period end; disable plan and quantity changes.
- `STRIPE_WEBHOOK_SECRET`: signing secret for this endpoint, not an API key.
- `COVA_BILLING_ORIGIN`: exact isolated HTTPS preview origin, never covadesk.com. Checkout success/cancel and portal return URLs use this configured origin, not request Host or user input.
- `COVA_BILLING_ALLOWED_USERS`: comma-separated Supabase UUIDs of designated test accounts. Use synthetic test users. Preview grants must not be applied to general customer accounts.
- Existing `KV_REST_API_URL` and `KV_REST_API_TOKEN`: server-only durable Upstash storage.
- `VITE_COVA_BILLING_ENABLED=true`: reveal Billing and route upgrade through the authenticated API. Not an authorization control.

The server rejects any live key, live object, wrong account, non-allowlisted user, production Vercel environment, or live mode. The client never unlocks from the success URL. Production ignores the sandbox entitlement namespace even if it shares Auth/KV.

## Endpoint setup

POST `/api/billing?webhook=1`. Both authenticated billing and raw signed webhooks share one deployed function to preserve the existing 12-function ceiling. API version `2026-08-26.dahlia`. Events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed; customer.subscription.created/updated/deleted; invoice.paid/payment_failed/payment_action_required. Use the exact endpoint signing secret. Raw body and timestamped signature are verified by the official Stripe SDK. The endpoint must be reachable by Stripe, not behind Vercel's interactive deployment protection. Do not weaken protection account-wide; use an isolated preview or a scoped bypass configuration when approved.

Hosted checkout uses `ui_mode=hosted_page`, explicitly disables Managed Payments for this session, uses the existing Cova wordmark, near-black background, cobalt button, system font and rounded controls. The account's global Managed Payments settings are not changed. Tax collection is disabled only for sandbox, not a production tax recommendation.

## Correctness

The authenticated Supabase UUID determines the customer; email is not an ownership key. No caller-supplied customer, price, subscription, plan or redirect is accepted. Durable customer/checkout attempt IDs are saved before Stripe calls and reused as provider idempotency keys. Open sessions are reused. A renewable or unresolved subscription blocks duplicate purchases. Unresolved attempts older than 23 hours fail closed for reconciliation rather than silently recreating a charge.

The Upstash namespace is `cova:billing:v1:sandbox:<account>:`. Records and reverse customer ownership do not expire. Each owner has a 120-second token lease. Every update checks the token inside Redis Lua, so expired workers cannot overwrite newer state. Customer ownership and state commit atomically. Recent event receipts are stored in the same record; older replayed events still fetch current provider truth and cannot restore stale entitlement. Provider/storage failures remain retryable, never acknowledged as successful processing.

Pro requires an active subscription with the exact price and quantity one, plus a paid matching invoice line whose entitlement period has not ended. Scheduled cancellation preserves paid access until that period ends. Canceled, incomplete, unpaid and past-due subscriptions do not grant Pro. Server entitlement checks use verified records for at most 60 seconds, then reconcile; direct Billing refresh always reconciles. Manual Pro is unaffected by billing outages.

Preview account deletion blocks all billing-linked test users. A durable deletion tombstone blocks concurrent checkout for previously unlinked users. **Unchanged production deletion routes sharing Supabase cannot honor a preview-only guard. Therefore synthetic test accounts only; live release requires cross-route deletion/cancellation handling and durable storage operational review.** Do not call this production-ready billing.

## Verification commands

`npm run test:billing` checks owner/mode isolation, duplicate and ambiguous checkout, paid/failed/canceled states, stale event replay, portal ownership, lease fencing, HTTP auth/method gates, UI source integration, and actual desktop/phone React interaction.

`node scripts/billing-stripe-sandbox.mjs` is opt-in and requires `COVA_STRIPE_CLI`, `COVA_STRIPE_CLI_CONFIG`, `COVA_BILLING_EVIDENCE`. It uses the already approved sandbox CLI session, creates synthetic customers/subscriptions/configuration, pays using Stripe's token fixture, tests actual provider lifecycle, cancels the subscription and expires the unused checkout. It uses a local owner/storage fixture, so **does not prove deployed Supabase authentication, real webhook delivery, hosted card entry or durable Redis execution**. Receipt explicitly names those boundaries. No personal OAuth credential is deployed.

Before calling the remote flow complete: provision/allowlist a synthetic Supabase test user, complete signup/policy flow, create Checkout from the preview, complete hosted test payment, observe the real signed webhook, reload to verify paid access, verify another owner cannot access billing, schedule cancellation in the real portal, confirm access timing, and verify no production entitlement changed.

## Opt-in deployed QA identities

`billing-preview-provision.mjs` is an operational helper, not an HTTP route or part of the default build. A one-off preview build override may call `provision()` with `COVA_BILLING_QA_FIXTURE` stored as a sensitive variable on this branch. It only runs in sandbox mode on `feat/stripe-sandbox-billing` in Vercel Preview. It checks Redis PING and creates at most two marked `billing-qa-<uuid>@example.invalid` identities with random private credentials, no manual Pro, and explicit IDs. Existing identities must match exactly and are never reset. Only IDs and PING status may appear in logs. Admin-created QA identities prove real authentication, not customer email verification/signup. Remove the temporary fixture variable after provisioning. Never add this override to the project-wide build command.

`node --test scripts/billing-preview-provision-regression.mjs` verifies its fail-closed environment guard, synthetic identity restriction, idempotence and readback.
