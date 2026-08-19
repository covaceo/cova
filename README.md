# Cova

Cova is a static web MVP for funded and prop futures traders. It imports CSV trades, shows risk habits in plain language, checks trades against editable limits, gives coaching notes, and creates a shareable Risk Passport through the URL hash.

Run it locally with Vite:

```bash
npm install
npm run dev
```

## Auth Gate

The MVP includes a premium login/sign-up panel that does not store passwords locally. In local preview it starts a temporary local session. Production Supabase magic-link auth requires browser-safe project values and server-side account access:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

For `SUPABASE_SERVICE_ROLE_KEY`, use a dedicated backend-only `sb_secret_...` key (recommended) or the legacy JWT `service_role` key. Cova sends opaque `sb_secret_...` values only as `apikey`; they are not JWT bearer tokens. Never expose either server key to the browser.

Login magic links set `shouldCreateUser: false`. Signup magic links may create a Supabase user, but the workspace remains locked after email verification. The authenticated member must then affirm the current Terms and Privacy Policy through Cova; `/api/auth/consent` records that direct authenticated action in the immutable, owner-scoped `policy_acceptances` table before the workspace unlocks. Apply `supabase/migrations/20260807010000_auth_policy_acceptances.sql` and `supabase/migrations/20260807020000_unique_broker_provider_connections.sql` to the target Supabase project before enabling production or preview auth.

Optional hosted-auth redirect URLs still work if Supabase is not configured:

```bash
VITE_AUTH_LOGIN_URL=
VITE_AUTH_SIGNUP_URL=
VITE_AUTH_LOGOUT_URL=
```

Local development also exposes a **Dev preview** button on locked screens and in the auth panel. It signs in as `dev@cova.local` with demo trade data so the logged-in workspace can be reviewed without creating a real account. It only appears on localhost-style hosts.

## Free vs Paid Direction

The app now has a small entitlement layer, so plan copy and behavior stay aligned:

- **Free:** manual CSV import/paste, up to 25 stored trades, starter limits, two insight notes, one Risk Passport preview.
- **Cova Pro:** unlimited imports/history, advanced limits, full insight notes, Passport export/share controls, and direct sync eligibility when connectors are live.

Recommended early pilot price: **$29/month** for funded futures traders. The free version should show what Cova does quickly; the paid version should save history, notes, and shareable risk profiles over time.

Stripe uses a server-owned Checkout Session and webhook entitlement loop. The browser never chooses a Stripe Price or writes its own plan. Configure these server-only values:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
APP_ORIGIN=https://covadesk.com
```

In Stripe test mode:

1. Create an active recurring Cova Pro Price. A recurring `$0` Price is supported by Cova for the first end-to-end account-upgrade test; change `STRIPE_PRO_PRICE_ID` to the paid recurring Price before launch.
2. Add `https://covadesk.com/api/billing/webhook` as a webhook destination for `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
3. Copy that destination's signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Enable the Stripe Customer Portal so Pro members can manage or cancel billing.
5. Set all four values in the Vercel environment and redeploy. Never prefix Stripe secret or webhook values with `VITE_`.

The direct flow is Pricing → Cova order review → Stripe-hosted payment → signed webhook → Supabase `app_metadata.plan=pro` → Cova success confirmation. Checkout is idempotent for repeat clicks, reuses a known Stripe Customer, and account deletion cancels a stored Stripe subscription before deleting the Cova owner.

## Prop Firm Connect

The Upload tab includes a prop-firm selector next to the universal CSV lane. TopstepX, Apex, MyFundedFutures, Tradeify, and other firms are CSV-guided paths. Cova does not offer a direct TopstepX connector.

Current connector strategy:

- **TopstepX, Apex, MyFundedFutures, Tradeify, and other firms:** use CSV or platform exports. No Cova-held provider credentials are required.
- **Rithmic:** a private, fail-closed Test connector exists for controlled verification only. It is not publicly available and is not a production availability claim. See `docs/rithmic-connector.md`.
- **Tradovate:** the OAuth scaffold remains available for eligible users with approved API access, but it is not the default path.

The Tradovate OAuth routes live under `api/tradovate/*`, which means they run through Vercel, not the plain Vite development server. Other firm buttons lead users to export guidance unless a reviewed provider URL is explicitly configured.

Local UI preview:

```bash
npm run dev
```

Optional reviewed provider redirects:

```bash
VITE_APEX_CONNECT_URL=
VITE_MFFU_CONNECT_URL=
VITE_TRADEIFY_CONNECT_URL=
VITE_RITHMIC_CONNECT_URL=
VITE_TRADOVATE_CONNECT_URL=
```

API testing:

```bash
vercel dev
```

Required environment variables:

```bash
TRADOVATE_CLIENT_ID=
TRADOVATE_CLIENT_SECRET=
TRADOVATE_REDIRECT_URI=http://localhost:3000/api/tradovate/callback
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
COVA_TOKEN_ENCRYPTION_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Optional override if Tradovate gives you a different token-exchange host:

```bash
TRADOVATE_TOKEN_URL=https://live.tradovateapi.com/auth/oauthtoken
TRADOVATE_API_BASE_URL=https://live.tradovateapi.com/v1
```

Generate the 32-byte token-encryption value with:

```bash
openssl rand -base64 32
```

Run `supabase/tradovate_connector.sql` in Supabase before saving broker tokens; it creates the shared `broker_connections` table. Before enabling member auth, apply `supabase/migrations/20260807010000_auth_policy_acceptances.sql`, `supabase/migrations/20260807020000_unique_broker_provider_connections.sql`, and `supabase/migrations/20260807030000_retire_projectx_connector.sql`; together they enforce the auth-owner cascade, immutable owner-only policy acceptance, one credential row per owner/provider, and a fail-closed Tradovate-only connector schema. Any connector should stay read/review oriented; Cova should not place trades or expose broker tokens to the browser.

## CSV Fields

Preferred headers:

```csv
date,market,side,contracts,entry,exit,pnl,risk,setup,notes
```

Common variants such as `symbol`, `qty`, `profit`, `plannedRisk`, and `strategy` are also accepted.
