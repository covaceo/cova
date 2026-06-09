# Cova

Cova is a static web MVP for funded and prop futures traders. It imports CSV trades, shows risk habits in plain language, checks trades against editable limits, gives coaching notes, and creates a shareable Risk Passport through the URL hash.

Run it locally with Vite:

```bash
npm install
npm run dev
```

## Wix Auth Handoff

The MVP includes a premium login/sign-up panel that does not store passwords locally. In local preview it stages the Wix handoff intent; in production, set these environment variables to your Wix-managed login/member URLs:

```bash
VITE_WIX_LOGIN_URL=/api/auth/login
VITE_WIX_SIGNUP_URL=/api/auth/login
```

Use an absolute Wix URL in local preview if you want the buttons to redirect while developing.

## Free vs Paid Direction

The current product packaging is intentionally simple:

- **Free:** manual CSV import/paste, core dashboard, editable limits, one shareable Risk Passport snapshot.
- **Cova Pro:** saved CSV history, unlimited Risk Passports, plain-English coaching notes, export/share controls, and Wix member access for saved workspaces.

Recommended early pilot price: **$29/month** for funded futures traders. The free version should show what Cova does quickly; the paid version should save history, notes, and shareable risk profiles over time.

## Tradovate Connector

The Upload tab now includes a Tradovate broker-connect lane next to the CSV fallback. The OAuth routes live under `api/tradovate/*`, which means they run through Vercel, not the plain Vite dev server.

Local UI preview:

```bash
npm run dev
```

OAuth/API testing:

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

Run `supabase/tradovate_connector.sql` in Supabase before saving OAuth tokens. The connector is read/review oriented; Cova should not place trades or expose Tradovate tokens to the browser.

## CSV Fields

Preferred headers:

```csv
date,market,side,contracts,entry,exit,pnl,risk,setup,notes
```

Common variants such as `symbol`, `qty`, `profit`, `plannedRisk`, and `strategy` are also accepted.
