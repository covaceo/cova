# Features selection pill continuity

## Scope and source binding

Raf approved the whole-site preview and reported only the left Features selection pill as glitchy. Canonical discovery: `C:/Users/brook/cova-local`, clean `rescue/dirty-main-2026-07-27`. Reviewed product base: `88104aec36367ed3e1f06e7bce7a1d22382b6fb0`, tree `34bb5ab2172a8347a8c0a124d2963e4b884d3397`. Implementation is isolated at `C:/Users/brook/cova-features-pill-continuity`, branch `fix/features-pill-continuity`. No merge or production deployment is authorized.

`#features` is owned by `FeaturesShowcasePage.tsx`, re-exported by `MarketingPages.tsx`. Its five buttons select one instrument and one outcome; actions retain import/dashboard/rules/coach/passport routes. Styling is owned by `featuresShowcase.css`. No account, auth, provider, artwork, content, route or panel-motion changes are made.

## Reproduction and fix

The former active span was unmounted/remounted inside each selected button via shared `layoutId`. Live traces captured the handoff freezing at its previous position then jumping on a delayed next frame. The existing tests proved stable panel height/opacity, not selection-layer lifetime. Evidence lives outside source under Ares `previews/features-pill/`.

`FeaturesTabHighlight` retains one rail-owned span. Browser CSS transitions its transform for 260ms, without a JS-per-frame projection spring. Geometry uses rail-content coordinates so horizontal reveal scrolling does not change the target. ResizeObserver follows actual tab/rail dimensions and snaps reflow; initial mount also snaps. Reduced motion disables transition, not the transform that positions the selected state. Native button semantics, focus, selected state, rail-only reveal scrolling and instrument motion are preserved.

The span's own parent is used on first mount because React attaches the ancestor ref after a child's layout effect. The observer is disconnected on unmount.

## Verification

`node scripts/features-showcase-browser-regression.mjs --pill-only` is the tight loop (after `npm run build`). It demonstrated RED on the base for remounted selection layer and GREEN for the persistent layer. The canonical Features browser suite imports the same probe. It covers 1440, 768, 767 and 390 widths, normal/rapid/reverse clicks, initial position, actual native animation, one opaque selection layer, target alignment, document-scroll preservation and reduced motion.

Existing whole-product source/browser gates remain in `npm test`. Final exact-tree clean-install aggregate/build/audit, independent review and remote browser evidence are recorded in Ares `previews/features-pill/`. This document does not claim physical-device/native-OS testing.
