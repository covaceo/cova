# Same-profile draft retention correction

Base: `35387b2fa048a8ec907c86e9c51e5d048fc4bc55`. No deployment, SQL, server handler, workspace record, authentication, or broker change.

## Confirmed local reproduction

`scripts/workspace-same-profile-draft-regression.mjs` runs the actual App, Dashboard, MiniJournal and trade dialog in two Chromium pages in one browser context. It uses the existing disposable localhost workspace API/SQL fixture and synthetic auth, blocks external requests, and relies on genuine cross-tab storage events. It is not a hosted real-auth verification claim.

Before the fix: writer saved a baseline; second tab entered an unsaved daily draft; writer reloaded and saved a newer note; second tab was fenced, clicked account reload, and cancelled the discard prompt. Full refresh restored the newer saved note instead of the unsaved draft. The assertion failed with `cancelled:true`. This matches the reported hosted sequence.

Cause: `journalDrafts.ts` used one shared localStorage slot per owner/editor. The writer's edit replaced the other tab's stored draft, then a successful save unconditionally removed the shared slot. The cancelled prompt preserved the second tab's React state but could not restore the erased persistent copy after refresh. Compare-before-delete alone would not fix the preceding overwrite.

## Narrow correction

- Each tab adopts its draft into sessionStorage once; thereafter it reads its own copy, including across full refresh. Browser-defined sessionStorage isolation also keeps duplicated tabs' later edits separate.
- Editing writes and verifies that tab's copy before updating the existing shared localStorage recovery copy. The latter retains the previous last-draft recovery behavior for a new tab; it is not an archive of every closed tab's drafts.
- Saving/discarding marks only the current tab's draft cleared. A matching shared recovery copy is removed; a different recovery draft is retained. The cleared marker prevents another tab's later draft from unexpectedly appearing in this tab.
- Existing owner/account/date or owner/trade keys remain unchanged. Explicit current-owner device cleanup clears both local and current-tab session copies. Other owners remain separate.
- Drafts remain browser-only and are never uploaded automatically. The existing fencing, confirmation, hydration, and explicit save paths are unchanged. No automatic merge or remote overwrite was added.

As with browser session storage generally, a tab's private copy lasts for that tab session and refreshes. The shared recovery slot still contains only the most recent browser recovery draft; closing multiple tabs does not create a multi-draft archive. This patch addresses active-tab overwrite/clear and refresh recovery without expanding that existing recovery contract.

## Verification

- New actual-UI two-tab daily scenario passes: discard cancelled, full refresh, original unsaved draft restored and marked unsaved; newer saved daily note unchanged.
- Extended actual-UI trade scenario passes: another tab saves a newer trade note; full refresh restores the stale tab's unsaved trade draft; newer saved trade note unchanged; its daily draft also remains.
- All 7 existing full-App draft scenarios pass, including delayed saves, quota failures, same-owner invalidation, cancelled navigation, and A/B/A isolation.
- 9 focused tests pass (5 draft-storage tests plus 4 footer cases). They cover daily/trade isolation, conditional shared recovery clearing, legacy draft adoption, owner/account/date boundaries, owner cleanup, and storage failure.
- Focused account-deletion cleanup regression passes; `npm run build` passes.
- Combined draft/footer/auth suite: 44 pass, 1 pre-existing failure. Its `provider status routes share one authenticated function within the Hobby deployment limit` test expects 12 raw API source files; this branch has 13 and the previously reviewed TEST staging workflow emits 12 functions. No API source files changed in this patch, and no unrelated count assertion was relaxed.

Run the local fixture with `node scripts/workspace-browser-fixture.mjs`, then run `node scripts/workspace-same-profile-draft-regression.mjs` and `node scripts/workspace-fullapp-regression.mjs`. The fixture-generated `scripts/.workspace-fixture.tsx` is disposable and not part of the candidate.

Review and a new authorized TEST deployment are still required before repeating the exact genuine-auth hosted sequence. Independent-context HTTP 409/offline tests and phone verification are outside this correction and remain separate. This is not a production-readiness claim.
