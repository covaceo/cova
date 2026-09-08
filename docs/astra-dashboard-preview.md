# Approved Astra dashboard integration

This changes the real React workspace, not the standalone visual study. The approved Risk Desk is the visual reference for the shared rail and existing Trade History, Limits, Insights and Passport routes. Their product components and behavior remain intact.

## Owners and behavior

- `DashboardView.tsx`: four calculated metrics, selected-range review, discipline evidence, recent trades, journal, source and review handoffs.
- `AstraEquityCurve.tsx` and `dashboardPresentation.ts`: the existing closed-trade equity values, responsive coordinates, pointer/keyboard inspection, and consistent currency formatting.
- `DashboardTradeDialog.tsx`, `dashboardTradeNotes.ts`, and the callback in `App.tsx`: browser-local journal editing under the existing account/generation boundary. This does not introduce cloud journal storage.
- `WorkspaceShell.tsx` and the final `astraDashboard.css`: the approved shared workspace chrome, with search, account actions, mobile navigation, and short-window reachability preserved. `astraWorkspace.css` and `astraWorkspaceContent.css` adapt the non-dashboard route layouts and controls without altering Risk Desk composition or Passport artwork. Signed-in marketing utility buttons use the same compact scale.
- Risk calculations, API handlers, auth-environment rules, Import Desk, Limits and Insights implementations are unchanged.
- `WorkspaceSections.tsx` now integrates the approved etched horizontal Passport with the existing account analysis. `PassportShareComposer.tsx` opens the full-bleed square foil for sharing, with retained modes, privacy, dimensions, and prepared PNG actions. The normal route has no rank/tenure study selectors, no border choices, and no external study links. Existing rank calculations are unchanged; Standard is the applied finish, not a tenure claim.
- `passportWorkspace.css` is scoped to Passport. Dashboard overview source remains unchanged. Review details retain the setup, metrics, account path, next-target guidance and rule receipt.
- The disposable export has no review-only top strip, reserved banner space or study link. The data-source disclosures in the real components remain intact. No real production/auth/broker/payment configuration is added.

## Founder preview

- Integrated app: https://cova-astra-integrated-20260904.vercel.app/#dashboard
- Original reference, preserved: https://cova-astra-study-20260904.vercel.app/#dashboard

The dedicated preview uses sample trades and the existing explicit demo build flag. Its export adds a preview-only first-visit local demo session without changing production auth initialization. It has no configured live Supabase backend, broker transport, or payments. Never promote this demo export to `covadesk.com`. This consistency-review branch is local and unmerged; publishing requires separate authorization. A temporary HTTPS tunnel may serve the compiled static export for owner review without a Vercel deployment.

## Reproduce

```sh
npm ci
npm test
npm run build
VITE_ENABLE_DEMO_PREVIEW=true VITE_SUPABASE_URL='' VITE_SUPABASE_ANON_KEY='' node node_modules/vite/bin/vite.js build --outDir dist-astra-preview
node scripts/export-astra-dashboard-preview.mjs /path/to/disposable-export
npx vercel deploy /path/to/disposable-export --project cova-astra-integrated-20260904 --yes --prod
```

The final command targets only the dedicated review project. Its Vercel `Production` label is not Cova production. Preserve the original reference project and do not deploy from the canonical product project for preview work.

Use a physical, lockfile-installed `node_modules` in this worktree. A junction to a sibling tree can make Vite dev-harness font requests fail its filesystem allowlist even when production builds and deployed assets work.
