# Whole-site visual and motion polish

## Scope and provenance

Raf requested a page-by-page visual cleanup, matching font roles, removing useless/repeated information, fixing motion (especially Features), and a full-site preview. No production merge or deployment is authorized.

- Canonical discovery: `C:/Users/brook/cova-local`, clean, fetched origin/main.
- Homepage release base: `fe441cf73c394ac045056a668e242412f987dbde` (approved Option A + actual Diamond story and Features clearance).
- Approved workspace source: `f9dbd3df2c09dcf61969598e4f6f2cd34c468709` (Astra workspace, moving etched Passport and square Foil Share).
- Integrated comparison snapshot: `189820e3b2e1fe69b12de1b05d29ab1fc93c43a5`.
- Implementation branch: `fix/whole-site-visual-motion`, isolated `C:/Users/brook/cova-whole-site-polish`.
- Independent implementation lanes: public supporting copy/type and auth/connection presentation. Neither lane changes application services.

The homepage branch still contained the retired workspace. This review assembles the approved workspace with the approved homepage rather than presenting an obsolete dashboard under a fresh homepage.

## Current route and flow map

`App.tsx` and `lib/appRoutes.ts` own routing/session ingress. `LayoutShell.tsx` owns public route frames; `WorkspaceShell.tsx` owns the protected chrome. Current registered routes:

- `overview`: `LandingPage.tsx`, `HeroPreview.tsx`, `StoryStrip.tsx`, `PlanSections.tsx` and `ClosingCta.tsx`. Signed-out signup or signed-in dashboard/import actions.
- `features`: `FeaturesShowcasePage.tsx`. Trade Journal, Risk Review, Limits, Insights and Passport tabs, each with a routed CTA.
- `pricing`: `MarketingPages.tsx` + `PlanSections.tsx`. Existing plan data, billing disclosures and auth-aware actions.
- `resources`: `ResourcesQuickStartPage.tsx`. Five export/import/review/limit/share steps and existing route actions.
- `community`: `CommunityDiscordPage.tsx`. Existing Discord invite and support navigation.
- `privacy`, `terms`, `security`: `LegalPages.tsx`. Existing full legal copy, effective dates, anchor navigation and cross-document links.
- `dashboard`: `DashboardView.tsx`, `AstraEquityCurve.tsx`, `DashboardTradeDialog.tsx`. Range, filters, chart input and trade inspection.
- `import`: `WorkspaceSections.tsx` and `BrokerConnector.tsx`. History, source selection, CSV and connection presentation.
- `oauth`: `OAuthConnectPage.tsx`. Actual configured/unavailable/consent presentation, without external provider authorization in visual QA.
- `rules`: `WorkspaceSections.tsx`. Existing Limits controls and review logic.
- `coach`: `WorkspaceSections.tsx`. Existing Insights and setup links.
- `passport`: `WorkspaceSections.tsx`, `PassportHoloCard.tsx`, `PassportShareComposer.tsx`. Four modes, privacy, tilt and four export formats.
- Auth overlay: `AuthPanels.tsx`, entry from marketing/protected actions, signup/signin/reset/error states.

No unregistered experimental surface was added or represented as part of the current site.

## Executed changes and motion ledger

- All public routes: REDUCE whole-page transition from an opacity-out/in handoff to one opaque 8px/180ms arrival. REMOVE route-scroll smooth tween and cancel a stale pending route-scroll frame. Reduced motion is immediate. Existing content/reveal motion remains independently owned.
- Features: KEEP causal active pill and directional panel slide. REMOVE tab-driven layout jumps using intrinsic, overlapping sizing slots. Only one slot is visible; inactive slots are inert and aria-hidden. All five panel sizes contribute to a stable responsive frame, rather than viewport-specific fixed heights. The expensive Passport optics mount only in the active tab. Normal, rapid, reversed and keyboard paths share this owner.
- Features: replace only the retired decorative Passport with the actual approved Diamond Standard renderer. `PublicPassportExampleCard.tsx` shares the unchanged illustrative model with the homepage, retaining sample/not-account-verified provenance. Do not imply earned rank, real provider verification or tenure.
- Features: match the Bricolage display role; remove repeated system-index and selected-feature labels. Preserve the five tabs, product information, CTAs and functional provenance. Remove the retired mock-card and duplicate-rail CSS, not just its visibility.
- Features: the primary action now uses the existing signed-in state: Open dashboard for members, Sign up for signed-out visitors. Tab-specific destinations are unchanged. A real signed-in phone click reproduced the old redundant signup dialog before this correction.
- Overview: KEEP approved hero, real supplied reactions, Option A Diamond story, plan contents, closing composition, social/footer routes and signature motion. The shader signup label embeds its already-installed Inter Tight font inside the sandbox rather than falling back to a system face. Native fallback/button interactions have one CSS motion owner.
- Pricing: KEEP all prices, plans, entitlements, feature groups, billing commitments and conditional CTA behavior. STATIC commercial information. Remove only repeated introductory/closing scaffolding. Give price interval, feature labels and actions readable type/contrast and a semantic h1 on the standalone route.
- Resources: KEEP guide-step feedback and actions, STATIC instructions. Remove duplicated intro/rail/section labels and repeated supporting copy without changing the guide's five capabilities.
- Community: KEEP invite hover/press feedback, STATIC reading. Remove duplicated overlines/tagline while preserving the invite, support and four useful discussion categories.
- Privacy/Terms/Security: STATIC complete legal text; matching display/UI/technical font roles, dark/cobalt material and accessible anchors. Legal payload text, dates and obligations remain unchanged.
- Auth/OAuth: KEEP short origin-linked dialog/state feedback, STATIC fields and instructions. Bricolage/Inter/DM Mono presentation and reduced-motion-aware branches. Pointer hover on a modal surface must not replace its entry/exit transform. No auth callback, policy, connector, cookie, entitlement or server behavior is changed.
- Dashboard/History/Limits/Insights: KEEP approved persistent workspace/nav feedback, chart crosshair and dialog interactions. STATIC confirmed risk/P&L/ledger content; no artificial financial tween or new calculations.
- Passport: KEEP the previously approved horizontal card, input-driven optical materials, mode/privacy feedback, square Foil Share default and prepared-image pipeline. PNG exports remain still images. No tier, rank eligibility, finish eligibility or account-scoping change.

## Evidence and verification boundary

Evidence is recorded outside the repository under `C:/Users/brook/AppData/Local/hermes/profiles/ares/previews/site-polish/`: baseline/after route matrices, Features frame measurements, source RED/GREEN logs, source audits, isolated implementation-lane reports, aggregate/build/audit outputs, exact-tree review and final preview manifest.

Canonical `npm test` includes the new source, public browser and auth/connection visual regressions. The forged-recovery regression retains its immediate/ever-rendered fail-closed checks; after rejecting an untrusted marker it opens the normal Sign in action if needed instead of requiring a timing-dependent startup auto-open. No production recovery behavior is changed. Features browser coverage checks all five intrinsic slots, one visible instrument/outcome, rapid/reverse/reduced-motion behavior and stable heights at the existing responsive matrix. Existing approved workspace/share/auth/data tests remain registered.

This is a static, explicit demo-enabled founder review, not a real provider/account authorization or native-device Share certification. It contains no credentials or server APIs and does not execute trades, submit provider forms or collect payments. Production builds still use the real auth/capability boundaries. Final pass/fail results and immutable candidate identities belong in the external evidence record rather than a prematurely asserted source document.
