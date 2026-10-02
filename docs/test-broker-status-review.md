# TEST broker availability diagnosis — 2026-10-02

Scope: Preview `dpl_AmiTgwMbWxqzsmSBa5Ngj7TokydJ`, project `prj_NkEFvGDnCANFpmiYVaLvRCZfoqaP`. Production, broker mutations, credentials and environment values are out of scope.

## Established evidence

- Supported Vercel project/deployment metadata confirms READY, Node24, CLI source, target null, and Vercel sign-in protection enabled for all except custom domains.
- This environment's direct unauthenticated requests to `/api/tradovate/status`, `/api/connectors/status?provider=tradovate`, and `/api/rithmic/status` failed at its outbound proxy (CONNECT 403). Supported Vercel fetch returned a Vercel Authentication 302 for each. These are protection/network results, not application-handler results. No returned redirect or cookie was reused.
- The original and packaged Rithmic status handler are unchanged. It requires authenticated identity, current policy acceptance, and Pro entitlement before checking service capability. Missing service configuration, unreachable service, or an unsupported capability response becomes `available:false`; free accounts receive 403 before capability inspection.
- Tradovate's status handler requires authenticated identity. Availability requires nonempty configuration for `COVA_TOKEN_ENCRYPTION_KEY`, `KV_REST_API_TOKEN`, `KV_REST_API_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `TRADOVATE_CLIENT_ID`, and `TRADOVATE_CLIENT_SECRET`. It also reads the authenticated user's saved connection, so storage/auth failures can fail the request even when configuration is present.
- Rithmic uses `RITHMIC_CONNECTOR_URL` and `COVA_RITHMIC_SERVICE_SECRET`, plus successful service status/capability validation. Merely having both names configured does not prove availability.
- `ImportDesk` maps missing capability, rejected HTTP status, malformed responses, timeout, and other request failures to the same unavailable state. `ImportPanels` renders “Sync unavailable” for that state. The label alone cannot distinguish these causes.
- Previous official local Vercel build and emitted-runtime tests passed with 12 functions, preserved Tradovate rewrite, and nine connector handler behavior comparisons. They do not establish hosted rewrite behavior.

Conclusion: configuration/entitlement failure is a plausible expected TEST result, especially for the unchanged Rithmic route. A Tradovate routing regression has not been proven or ruled out. Current connector metadata does not expose Preview environment-name inventory, and no environment values were requested.

## Supported next checks, preserving real authentication

1. On the already authorized Mac runner, use official `vercel env ls preview` against the exact existing TEST project binding. Record only required-name presence and Preview target, never values. Do not pull, decrypt, modify, or copy environment variables. Name presence is only a configuration prerequisite; do not treat it as a health check.
2. In the already Vercel-authorized, genuinely signed-in synthetic TEST browser, observe the Accounts page's existing GET status requests. Capture only pathname, HTTP status, content type, and allowlisted JSON fields (`available`, `connected`, `linked`, `ok`, `error`, `message`); omit headers, cookies, connection IDs and raw bodies. Do not export HAR or storage state. Preserve the real application's authentication boundary.
3. Before opening/reloading Accounts, block provider mutations in that browser: `/api/tradovate/connect`, `/api/tradovate/callback`, `/api/tradovate/sync`, `/api/rithmic/sync`, and `/api/connectors/disconnect`. The Accounts effect can automatically sync an existing Tradovate connection; blocking these paths prevents an incidental broker operation. Keep status GETs allowed.
4. First observe the ordinary `/api/tradovate/status` request. Then, for a separate check, use a browser automation route override on that exact GET to continue it at the same-origin `/api/connectors/status?provider=tradovate`. Use `route.continue({url: canonicalUrl})` without inspecting or replacing headers. This reuses normal application-authenticated traffic, requires no token extraction, and does not mock the server response. Remove the override afterward. Compare status and safe capability fields. A canonical success with legacy failure isolates the rewrite/dispatch path; matching responses point elsewhere.
5. Interpret application results: 200 + `available:false` means the handler was reached and reported unavailable; 401 points to app session; Rithmic 403 may be policy or Pro entitlement (use its safe error message); 404/405 points to route/method handling; 503 points to auth/storage/service dependencies. HTML or Vercel redirects mean deployment protection was not satisfied. Do not upgrade a plan or configure broker credentials as part of diagnosis.

Offline/conflict verification remains separate: use only synthetic TEST journal data in two genuinely authenticated browser contexts. Record the starting note; edit one context offline, save a distinct edit in the other, reconnect and require explicit conflict review without silent overwrite. Restore the synthetic note through the UI afterward. Never substitute a fabricated session or local-storage auth token. Parent approval and existing TEST scope determine when to run this scenario.

## Footer correction

The local patch passes an optional account-storage flag through existing journal actions. When account storage is enabled and the user has not selected browser-only mode, the daily footer says “Private · check account storage for sync status”; the trade footer points to the same status and states that unsaved drafts stay on this browser. Disabled/browser-only mode retains existing copy. No footer claims remote acknowledgement. Save behavior, records, API packaging and SQL are unchanged.

Validation: 4 rendered-component copy cases plus 8 existing daily-journal/manual-trade regressions pass; `npm run build` passes. No deployment was performed. Phone verification, hosted direct/legacy status comparison, broker configuration diagnosis, and hosted offline/conflict tests remain outstanding. This is not a production-readiness claim.
