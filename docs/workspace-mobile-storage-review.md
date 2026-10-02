# Mobile account-storage panel clearance

Based on the reviewed project-guard candidate `1fba17a885bafc04313052d933ea4550f0134e4f`. Local presentation change only; no deployment, configuration/SQL changes, or hosted note/pending-state access.

The parent inspected the user's `IMG_9465.png` (Library `libfile_b786accaf728819186fe1e0cc5e67046`, v0) and confirmed the floating Cova navigation overlaps the storage panel. Local materialization of that image failed, so this executor did not inspect the original pixels. The fix is supported by the parent's visual assessment, source inspection and an actual-App local reproduction; locally generated screenshots were inspected directly.

The storage panel precedes Dashboard, but the old mobile navigation clearance belonged to Dashboard's own padding. In the local 390px reproduction the panel began at y=16 while the floating navigation extended to y=76.8. The panel now starts at y=96, below the navigation, with safe-area inset added when available. Dashboard's redundant top padding is reduced only when the panel precedes it on mobile. No header z-index, fixed positioning or desktop layout is changed.

Mobile storage actions are separate full-width tap targets at least 44px high, with wrapping text and spacing. The panel and actions have scroll margins below the floating navigation. Clearance scales with rem text size and includes `env(safe-area-inset-top)`. Long content remains ordinary scrollable document content; the panel is not fixed or clipped.

Verification uses the actual App, navbar, shell and WorkspaceSyncPanel against the existing disposable localhost fixture with synthetic authentication. It never accesses hosted user notes. `scripts/workspace-mobile-storage-regression.mjs` verifies:

- saved/review at 320, 375, 390, 430, 768, 850 and 1440px;
- error at 320, 375, 390, 430 and 1440px;
- error/review at 320 and 390px with root text size doubled;
- browser-only at 390px;
- panel/navigation non-overlap, no horizontal overflow, action containment and hit-testing after scrolling each action into view;
- desktop panel/Dashboard bounding boxes exactly equal with the new styling marker removed/restored;
- no page errors or Vite error overlay.

There are **24 passing layout cases** plus one recorded limitation: this Chromium version cannot emulate native safe-area insets. The CSS accounts for those insets, but physical iPhone/Safari verification remains required. The original layout overlap is separately reproduced by disabling only the newly added styling marker; this does not alter application state. Enlarged-text screenshots include both panel heading and scrolled action views.

Run the local fixture (`node scripts/workspace-browser-fixture.mjs`), then `node scripts/workspace-mobile-storage-regression.mjs`. Add `--baseline` to capture the original overlap. The generated `.workspace-fixture.tsx` is disposable and excluded from the commit.

This patch does not interpret “Saved on this browser only” as conflict resolution: that text still represents browser-only mode. It changes no save, conflict, consent, retry, account selection or draft behavior. Both hosted user test notes and any pending operation must remain intact for the next supervised test. The guard and proposed production DML privilege reset from the base candidate are preserved unchanged.
