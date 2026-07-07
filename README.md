# Cova

Cova is a static web MVP for funded and prop futures traders. It imports CSV trades, shows risk habits in plain language, checks trades against editable limits, gives coaching notes, and creates a shareable Risk Passport through the URL hash.

Run it locally with Vite:

```bash
npm install
npm run dev
```

## Auth Gate

The MVP includes a premium login/sign-up panel that does not store passwords locally. In local preview it starts a temporary local session. For production, prefer Supabase magic-link auth:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

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

For Stripe, set one of these client-visible redirect targets:

```bash
VITE_STRIPE_PRO_PAYMENT_LINK=
VITE_STRIPE_CHECKOUT_URL=
```

## Prop Firm Connect

The Upload tab now includes a prop-firm selector next to the universal CSV lane. The current UI supports TopstepX / ProjectX, Apex, MyFundedFutures, Tradeify, Rithmic, Tradovate, and an Other Firm fallback.

Current connector strategy:

- **TopstepX / ProjectX:** first real connector. Users paste the TopstepX username and API key from account settings; Cova validates it against ProjectX, encrypts the session token, and imports trade history read-only.
- **Apex, MyFundedFutures, Tradeify, and other firms:** use CSV or platform exports first, then add templates as real user files come in.
- **Rithmic:** high-value later connector, but heavier infrastructure than a simple web auth flow.
- **Tradovate:** scaffold remains available for users who already have API access, but it is no longer the default path.

The existing Tradovate OAuth routes live under `api/tradovate/*`, which means they run through Vercel, not the plain Vite dev server.

Local UI preview:

```bash
npm run dev
```

The TopstepX connector lives under `api/projectx/*`, which means it runs through Vercel, not the plain Vite dev server. The other firm buttons intentionally lead users to export guidance unless a real provider URL is configured:

```bash
VITE_TOPSTEPX_CONNECT_URL=
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
PROJECTX_API_BASE_URL=https://api.topstepx.com/api
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

Generate a 32-byte encryption key with:

```bash
openssl rand -base64 32
```

Run `supabase/tradovate_connector.sql` in Supabase before saving broker tokens; it creates the shared `broker_connections` table. Any connector should stay read/review oriented; Cova should not place trades or expose broker tokens to the browser.

## CSV Fields

Preferred headers:

```csv
date,market,side,contracts,entry,exit,pnl,risk,setup,notes
```

Common variants such as `symbol`, `qty`, `profit`, `plannedRisk`, and `strategy` are also accepted.
