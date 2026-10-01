# Workspace sync candidate — newly implemented, not recovered source

Base: `9ff6647fd15080a9928e7507d72051f72c7df4a5`. This candidate retains the current recap implementation. It does not claim byte equivalence with deployment `dpl_GoqJsSvXXbTYpxxY5zzjoyZWpF5c`, and that deployment's previous tests do not validate this code.

## Behavior

Sync is disabled by default. The browser requires `VITE_WORKSPACE_SYNC_ENABLED=true`, and the server independently requires `WORKSPACE_SYNC_ENABLED=true`. No environment settings were changed in preparing this candidate. The API authenticates through the existing policy-accepted user guard and derives owner and plan from that verified user, never a payload claim.

Before first copy, the user chooses account storage or browser-only storage. Exact allowlisted browser originals are retained in a verified backup. Differences and pending browser deletions require review; cloud-only rows are retained when copying browser changes. Deleted trades are not revived; fixed-key daily notes require explicit review of the current tombstone before recreation. Normal edits keep a persisted operation plan until a complete authoritative snapshot verifies the write. Ambiguous responses replay the same operation ID; definitive revision conflicts return to review. Loading/failed snapshots cannot imply deletion.

A new browser loads the consented account workspace. The Dashboard exposes both All accounts and CSV / local history even for manual-only trades, preserving separate daily notes in each scope. Account switches and explicit reloads prompt before discarding an unsaved journal draft. Edits are temporarily blocked while saving or reconciling. Browser-only mode remains available. Other-device changes are loaded at sign-in or with **Reload account and review**; this candidate does not use realtime subscriptions.

Browser hydration uses a verified undo journal for the ledger, auxiliary cache, and acknowledged remote cache. Failed writes restore old values; an interrupted rollback is recovered before further cloud operations. Backups and unfinished operations use owner-scoped keys removed by the existing account-storage cleanup.

## Data and recap boundaries

Uploaded: validated trades (including their notes), risk rules, daily notes, account names. IDs are preserved; no inferred trade deduplication or execution equivalence is introduced. Invalid/unsupported payloads stop the operation and retain originals.

Not uploaded: credentials, sessions, broker freshness receipts, identity/connection leases, custom pictures/GIFs, existing manual-net confirmation receipts, and CSV ingestion receipts. Existing cloud broker cash records are retained without treating them as fresh broker evidence; this candidate does not upload or activate fee evidence on a new device. Reconnect/reload broker evidence locally when needed.

New manual trades retain their explicit `manual.pnlBasis=reported_net` field. Existing gross-marked trades are not relabelled. Their local fingerprint-bound confirmation metadata remains separate and may need reconfirmation on another device. CSV provenance on one device does not become verified provenance merely by cloud restore. Existing verification checks, 256 KiB metadata budgets, ledger-priority reclamation, source separation, assets, artwork, and export behavior remain in place.

## Database prerequisite — approval required before any remote application

The read-only TEST contract comes from project `dubfbadtuzkhrkfcvncd`; production `jrlunkaoghamiuzdfyov` was not queried. Three existing migrations supply workspace tables, service grants, revision-checked writes and legacy batch manifests. The exact observed TEST write function is retained in `scripts/fixtures/workspace-test-rpc.sql`; the three historical migrations are in `scripts/fixtures/workspace-contract/` for disposable local tests only.

The new API calls `cova_apply_workspace_plan`, proposed in `docs/workspace-atomic-plan.sql`. It wraps all <=500-row inner chunks in ONE transaction. This avoids the legacy protocol's possibility of an early committed chunk followed by a later conflict, leaving a partial migration. New copies either commit completely or roll back, including receipts. Existing legacy pending manifests block new work and require their original recovery procedure; this candidate cannot safely abandon an unknown old migration.

The SQL proposal is **not applied anywhere**. The Supabase CLI migration-create command failed because its global config directory is read-only, including after a filesystem-permission attempt. The proposal is therefore not represented as an already-generated/applied migration. Before approved isolated TEST verification, generate a migration with the working official CLI, place this reviewed SQL in it, and apply only to TEST. Production also needs the original three workspace migrations before this wrapper; those are not present in current main and must be reviewed as a separate production change.

The candidate limits one atomic transfer to 25,000 changes and 2.8 MB of serialized client changes (server request <=4 MB). Larger copies stop before network writes and retain browser data. Browser storage quota may impose a lower migration limit because backup, operation plan and recovery journal need room. No unsupported partial migration is attempted as a fallback.

## Local validation

Install pinned dependencies: `npm ci --ignore-scripts`.

Run `npm run test:workspace` for pure model/payload, API fixture, actual TEST SQL in disposable PGlite, atomic-plan rollback/replay, and hydration rollback tests. No remote database is contacted.

Run `npm run test:workspace-browser:fixture` in one terminal and `npm run test:workspace-browser` in another. It serves only `127.0.0.1:4179`, substitutes synthetic authentication, and executes the real candidate API against disposable PGlite. Browser contexts represent separate desktop and phone storage. Chromium must be available at `/usr/bin/chromium` (or update the local harness executable path). These tests do not establish real Supabase authentication or deployed Vercel compatibility; isolated TEST verification is still required.

With the same fixture running, run `node scripts/workspace-fullapp-regression.mjs` for actual App editor tests using synthetic auth. The fixture blocks external calls in that browser test.

Also run the existing recap verification, session recap, entry grouping, daily journal, manual trades, and account names regression files, plus `npm run build`.

Before any release, approve and perform isolated TEST verification of real auth/session expiry, A/B isolation, desktop/phone restoration, existing local migration, quota handling, conflicting edits and reconnects, and the new transactional migration. No production schema change, deployment, push, customer write, or persistent authentication grant was performed for this candidate.


## Independent review fixes (supersedes b55670d behavior)

- Fixed-key daily notes can be explicitly recreated after reviewing the exact current tombstone. The API carries `recreateDailyNote: true` with its expected revision; the atomic wrapper permits only that owner/account/date daily-note tombstone. Ordinary/stale writes and deleted trade revival remain rejected. A later failure rolls back the temporary recreation as well.
- Trade entitlement is checked against the final whole-plan count, with the original downgrade rule (no growth above the cap). Inner chunks run without a cap inside the same outer transaction; failure of the final cap check rolls back every chunk and receipt.
- Only server-attested rollback of the exact operation (specific revision/deletion conflicts or trade-cap rejection) permits archiving and clearing its pending plan. Browser data and a verified rejected-plan archive are retained. Reload/review builds a corrected plan. Network failures, malformed responses, and unknown outcomes retain the original ID and payload for replay.
- GET now returns revision-bound NDJSON byte fragments: at most 1 MiB of raw bytes per response, encoded as base64; the complete JSON response is explicitly limited to 1,500,000 bytes. A cursor includes row offset, byte offset, and workspace revision. Owner, settings and revision are checked for every fragment. The client restarts on revision conflict and validates the complete snapshot before returning any rows for hydration or diffing. Even one large multibyte record can span fragments. Apply returns a compact acknowledgement; authoritative records come through paginated GET, avoiding large deletion receipts in Vercel responses.
- App mutation authorization is checked through current refs, including in-flight busy state. A trade-note success requires verified synchronous ledger persistence, using current rules/account fields. Editor drafts are separately stored per owner/account/date or owner/trade, stay browser-only, and never become verification evidence.
- Same-owner storage invalidation retains mounted editors while locking commits. Daily drafts survive refresh; navigation/account selection uses the existing explicit discard guard. Owner switches hide the old workspace and use separate draft keys.

Validation now includes the exact three prior TEST migrations in disposable PGlite, service-role writes and authenticated/anon denial, true Chromium fixture scenarios, and actual App delayed-native-dialog, refresh, quota, navigation and same-browser A→B→A checks. Auth remains synthetic; these tests do not replace approved live TEST verification. See the immutable review package for exact totals and receipts.
