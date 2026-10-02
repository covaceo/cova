# Consistent mobile Cova header across routes

Base: b6522650d6808f125bdc901b6357ffb3c06d43de.

The previous change limited the wordmark and veil removal to workspace chrome, leaving the homepage unchanged. Navbar now renders the authentic existing Cova wordmark in its shared mobile brand for every route. A shared header class scopes the mobile styles. The connecting veil is hidden below 768px for every header, and at the existing tablet mobile-menu breakpoints (signed-in marketing through 1100px, workspace through 850px). The ordinary desktop navigation markup, brand, veil and styling remain intact.

Menu shape, contents, handlers and home button behavior are retained for each sign-in state. Mobile branding has a 44px minimum target, bounded image width and original accessible name. No hero or other page section changed. The previously approved storage-clearance rules are unchanged. No API, sync, recap, note, data, SQL, environment or deployment changes.

Validation:
- Actual App in disposable localhost fixture, with non-local requests blocked: 48 route/viewport cases. All 9 public routes tested signed out and signed in; all 6 protected routes tested signed in. Homepage widths 320, 375, 390, 430, 768, 850, 1024, 1100, 1101 and 1440; 200% root text sizing at 320/390; scrolled homepage at 390. Tests check image loading, veil visibility, logo/menu separation, 44px targets, correct menu by auth state, menu close, navigation and home return. No page errors.
- Existing app wordmark/navigation suite: 10 passing cases.
- Existing storage-clearance suite: 24 passing layout cases plus unsupported safe-area emulation receipt. Physical safe-area verification remains outside local emulation.
- npm run build passes, with existing large-chunk warning. git diff --check passes.

Screenshots cover signed-out homepage, signed-in homepage, their open menus, desktop breakpoints, enlarged text, scrolling and app/storage states. Existing marketing/menu styling is preserved; the requested wordmark and absence of a connecting bar are consistent.

No deployment or push. No hosted user data accessed; the user's pending phone note was untouched. Focused review and subsequent physical TEST confirmation remain pending.
