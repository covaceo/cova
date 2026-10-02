# Cova account-sync handoff

Reviewed application source: `5786a3d3d359c5e254d15892726b5896f839dfaf`.
Reviewed tree: `7c34157552cf25b06d16ddcc2f576b5337f1d799`.
The commit following that source adds this document only. No application changes are introduced by the handoff.

## Release status

Production SQL has NOT been applied. The new production build has NOT been deployed or activated. The user accepted proceeding without a verified backup, but release execution stopped for this handoff. No backup, credential export, production data export, or paid upgrade was performed. Keep Git connected; do not merge or push this source to main before addressing packaging below.

Fresh read-only preflight on 2026-10-02 confirmed production Supabase `jrlunkaoghamiuzdfyov` healthy on PostgreSQL 17.6, `auth.users`/`auth.uid()` present, and all proposed workspace tables/index/RPCs absent. Production Vercel: `cova`, project `prj_73tdqlj9eqJ3mo0lvAwBXKCpnTRk`, team `team_G2DpzsjRplHt0ndCXyVId4qi`, Vite, Node 24. Recheck current metadata before mutation. Do not touch the isolated TEST project/origin or any existing pending browser drafts.

## Required packaging

The raw reviewed source has 13 API entries; the verified deployment transformation has 12 functions. Do NOT deploy raw source or merge it into main without a reviewed durable packaging integration. Current connected main is a separate working baseline.

From a clean checkout, install the lockfile dependencies and run `node scripts/prepare-test-deployment.mjs /absolute/new-stage`. Despite the script's TEST name, its verified transformation is the same one used for the production release package: bundle Passport/workspace to native JS and combine connector status/disconnect. Preserve runtime bytes, routes, billing raw-body handling, headers and timeouts. The generated TEST project binding must never be reused for production; explicitly bind a separate production stage to the production project/team above. Verify with official Vercel CLI 62.1.0 and `node scripts/verify-test-deployment.mjs STAGE`. Local credential-free build output is for verification only, not production `--prebuilt` upload.

The immutable production stage based on the reviewed commit has archive SHA256 `f44c01fd97e6e712cb4e076cff4db7b6ff7eb8a91a98b29261e29dd15e395f7f`; source-file-set SHA256 `c0fac3e3689e8973c85dca8278a40ebe7877cca78f3be5825eb7ad61543806c1`. The handoff-only commit changes documentation, so rebuilding from it changes the documentation manifest. Use the exact reviewed commit for byte-identical release packaging.

## Ordered production procedure

1. Confirm release authorization/current target metadata and coordinate one executor per step. No simultaneous SQL/deployment work.
2. Initially set Production `VITE_WORKSPACE_SYNC_ENABLED=false`, `WORKSPACE_SYNC_ENABLED=false`, and `WORKSPACE_SYNC_PROJECT_REF=jrlunkaoghamiuzdfyov`. Preserve all existing secret values; never extract or print them.
3. Deploy a SAME-source flags-off candidate FIRST with production settings and `--prod --skip-domain`. Verify READY, correct project/team, 12 functions, and disabled workspace endpoint; record its exact deployment ID as rollback. Do not substitute the older main deployment: rollback must retain the reviewed draft-aware implementation.
4. Apply `docs/workspace-production-proposal.sql` once, only if preflight still shows the objects absent. SHA256: `8cb9781803ae4f2b076fb551b26481f569ea69312c0257e8acd62722271344d3`. This transaction includes the three contract SQL prerequisites, atomic-plan wrapper, and final scoped service-role privilege reset to SELECT/INSERT/UPDATE/DELETE on the three workspace tables. Do not apply the synthetic fixture auth schema. Verify RLS, owner SELECT policies, empty-search-path SECURITY INVOKER RPCs and service-role-only execution.
5. Only after flags-off rollback is pinned and SQL verification passes, change both sync flags to true. Create a fresh hosted Production candidate with `--skip-domain`; verify the guard/authenticated workspace access without extracting credentials. Pin READY identity before promotion.
6. Promote the exact verified flags-on candidate, then run a small synthetic A/B and second-device restore/conflict pilot. Existing secret values and Supabase project binding must remain consistent. No old TEST-note cleanup is required.

## Emergency pause and rollback

If verification fails, first revoke EXECUTE on `public.cova_apply_workspace(uuid,uuid,text,jsonb,integer,jsonb)` and `public.cova_apply_workspace_plan(uuid,uuid,text,jsonb,integer,jsonb)` from `service_role`, and revoke INSERT/UPDATE/DELETE from `service_role` on ONLY `workspace_settings`, `workspace_records`, `workspace_operations`, in one transaction. Retain SELECT, RLS, tables and every record. Then promote the exact pinned SAME-source flags-off deployment and restore the three added settings to their prior state. No drops, truncation, restore-over-live, draft clearing or automatic privilege regrant. This limits application damage; it cannot recover lost database records without a backup.

## Verification already completed and limits

- Both TEST and production local official builds: 12 Node 24 functions; all 462 staged source files equivalent. Deployable build bytes matched; only build metadata/traces differed.
- Emitted runtime checks: 15 API tests per build, nine connector comparisons, billing raw-body config, routes, headers and timeouts.
- Flags-off same-source build: 12 functions, 15 API tests, disabled workspace 404 with zero external calls.
- Exact SQL checked on disposable PostgreSQL 17 and 18; emergency pause verified to preserve records, SELECT and RLS.
- Header coverage: 48 route/viewport cases, ten app-header cases, 24 storage-layout cases; build passed.
- Hosted TEST A/B isolation and restore, real Mac restore, and two-tab dirty-draft recovery observed. Mac/phone stale edit preserved the Mac remote value while phone showed local/attention. Full phone review-resolution was NOT observed. Offline/lost-response end-to-end trials remain unrun. Do not report these as passing.

The self-contained reviewed rollout package is `cova-production-rollout-5786a3d-v2.tgz`, SHA256 `99b5b2c431ac65dba632bcc5d3ad5857e0bf01d376a329b2d359ade07c471e8e`; the user has it in ChatGPT Library. No credentials or user records belong in this repository or handoff.
