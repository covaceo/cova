# Passport session progression

The original shareable Passport remains visible before progression. Existing rank, identity editing and PNG exports are separate from the new process level. Accounts and the sidebar use the approved utility layout; broker logos identify providers, not endorsements.

## Reward contract

- One level, one progress bar, one review flow for the latest imported UTC session in the selected account.
- Each level requires 100 XP. A qualifying green session earns 60 XP; a qualifying red or flat session earns 15 XP. Dollar amount, trade count and position size do not scale rewards.
- The owner's enabled daily-loss, trade-loss, position-size and loss-streak limits must have been saved on the server before the session's first entry. No retroactive pre-session plans are invented.
- The server reconstructs closed-entry evidence and replays the existing cash-window reconciliation. Missing or inconsistent after-fee evidence cannot earn XP. Trade-level limits use the existing imported entry facts, without inventing fee allocations.
- Imported facts remain user supplied. Server scoring is not independent broker verification and does not certify profitability or live-trading readiness.
- A reward day is permanently bound to the first positively rewarded account. A second account cannot stack XP for that UTC day. Saving the same review again does not add XP.
- Later complete evidence can revise an existing award downward or upward. Stale evidence and conflicting revisions are rejected. XP is not part of the financial ledger or the Bronze–Diamond rank.

## Storage and privacy

`20260923010000_passport_progress.sql` adds owner-isolated plans, session receipts and reward-day bindings. Authenticated clients may read their own rows and save timestamped plans; only the server's service role can score and commit rewards. Review notes are stored with the profile. The existing browser-local journal is updated only after an explicit review save, for the selected account. Imported trade rows, broker credentials and cash movements are not stored in the progression tables.

Owner changes abort pending UI requests and clear the previous owner's display. API requests verify the signed-in owner before reading or writing. Deleting the auth user cascades the new records.

## Server packaging

The server imports the committed, reproducible `api/_lib/passport-runtime.mjs` bundle. `npm run build` regenerates it from shared source without changing financial modules. A native Node ESM startup regression and a generated-source freshness check prevent a Vite-only test from hiding extensionless-import failures in Vercel.

## Verification

- `npm run test:passport-progress`: scoring, cash evidence, PostgreSQL permissions/RLS, idempotence, account binding, revisions and compiled API authentication/server-scored success.
- `node scripts/passport-utility-browser-regression.mjs`: real component desktop/phone rendering, card-first order, privacy and native PNG downloads in all formats; transport-mocked review, reload, duplicate-award, owner-switch and error-recovery UI cases. Synthetic fixtures are not authenticated customer evidence.
- `node scripts/accounts-browser-regression.mjs`: provider controls, Manage/confirmation flows, reconnect/unavailable/busy states and viewport containment.
- Production database setup must be checked independently of local tests. Transactional fixture tests must roll back all synthetic rows.

Production UI release uses the normal reviewed branch/PR deployment path. A successful database migration alone is not an application deployment.
