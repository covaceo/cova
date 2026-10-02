# Project binding guard and production privilege proposal

Local review candidate based on `27724e8c48ade380795c382d7c27449d66bdf919`. No environment, project, database, permission, or deployment changes were made.

## Workspace endpoint guard

When `WORKSPACE_SYNC_ENABLED` is exactly `true`, `/api/workspace` now requires an explicit 20-character lowercase alphanumeric `WORKSPACE_SYNC_PROJECT_REF` and a `SUPABASE_URL` equal to `https://<ref>.supabase.co` (an optional final `/` is accepted). It rejects HTTP, embedded credentials, ports, other hosts, paths, queries, fragments, whitespace and URL-normalization tricks. The check runs before authentication, policy/billing lookup, or workspace storage calls. Invalid/missing binding returns generic 503 with zero upstream calls and no configuration values in the response.

Disabled mode retains 404 without consulting the binding or upstream services. Authentication, owner/plan derivation, consent, validation, snapshots, atomic saves and browser behavior otherwise remain unchanged. The server bundler and 12-function TEST packaging are unchanged. Only the workspace endpoint is guarded; this does not change unrelated application routes.

The check proves agreement between the explicit server project ref and server URL. It does not prove that an operator chose the correct expected ref for a deployment, that a credential belongs to that project, or that the browser was built against the same project. Production staging must separately verify browser build URL, server URL/credential destination, approved expected ref, and exact Vercel project/team/target. Do not treat two consistently misbound settings as safe.

## Existing TEST configuration

The saved Mac evidence already reports these nonsecret settings on TEST Preview:

- `WORKSPACE_SYNC_ENABLED=true`
- `VITE_WORKSPACE_SYNC_ENABLED=true`
- `WORKSPACE_SYNC_PROJECT_REF=dubfbadtuzkhrkfcvncd`
- `SUPABASE_URL=https://dubfbadtuzkhrkfcvncd.supabase.co`

No TEST configuration update is expected if those verified bindings remain unchanged. The guard accepts the optional URL root slash. Existing credentials are not copied, printed, changed or hardcoded. Reconfirm binding equality privately before an authorized TEST deployment; do not pull secret values into evidence.

Parent's production names/targets inventory (Library `libfile_94776ecb67008191b4e2524a7faf0fbe` v10) reports `SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` present for Preview and Production. `SUPABASE_ANON_KEY` and all three workspace flags/ref are absent. Names do not prove destinations. The absent server/browser flags keep this feature off; this patch creates no production settings. After separate approval, the intended production ref would be `jrlunkaoghamiuzdfyov`, with the corresponding canonical server URL, subject to actual destination/credential and Vercel target verification.

## PostgreSQL 17 MAINTAIN correction

`docs/workspace-production-proposal.sql` is a complete, transaction-wrapped **proposal**, not an applied or registered migration. It incorporates the exact three reviewed historical workspace SQL files and the unchanged atomic wrapper, followed by an explicit `REVOKE ALL PRIVILEGES ... FROM service_role` and `GRANT SELECT, INSERT, UPDATE, DELETE`. This removes PostgreSQL 17+ MAINTAIN as well as TRUNCATE, REFERENCES, TRIGGER and other default grants. It does not change owner keys/cascades, RLS policies, existing inner/outer function bodies, SECURITY INVOKER, empty search_path, or restricted RPC EXECUTE privileges.

Parent's read-only catalog review reports production workspace tables/RPCs absent and PostgreSQL 17.6 default grants including MAINTAIN. No production catalog was queried here. Recheck the catalog before an approved migration; do not replay blindly over existing objects. The TEST QA baseline and disposable auth fixtures are excluded. Existing TEST SQL remains unchanged; the privilege correction is in the production proposal only. A registered production migration filename/history entry must be prepared through the supported migration workflow after review, not invented here.

## Verification and boundaries

The API suite tests missing/malformed settings, both TEST-to-production mismatch directions, valid matching refs (with/without slash), zero auth/storage/fetch calls on rejection, and disabled compatibility. Fixture environments use synthetic refs and mocked services, not credentials.

`scripts/workspace-production-sql-regression.mjs` executes the exact proposal in disposable PGlite. It first demonstrates that the old three-privilege revoke leaves MAINTAIN granted, then asserts exact service-role table ACLs, effective denial of MAINTAIN/TRUNCATE/REFERENCES/TRIGGER, owner SELECT RLS, service-only RPC grants, SECURITY INVOKER/search_path, successful service writes, owner separation and anonymous denial. It runs with the repository's PostgreSQL 18.3 engine and an isolated `@electric-sql/pglite@0.3.14` PostgreSQL 17.5 engine. This tests the PostgreSQL 17 privilege feature, not a claim of execution on production's exact 17.6 minor version. No dependency or lockfile upgrade was needed.

The previous final rollout review's statement that `WORKSPACE_SYNC_PROJECT_REF` is unused is superseded for this candidate only. Hosted independent-profile 409/offline/lost-response tests, reviewed production packaging, production binding verification and production activation approval remain outstanding. No broker keys or broker capability changes are included.
