# Approved homepage Diamond card reuse

Raf selected the homepage card-first Option A composition, followed by Diamond.
The homepage story is a public illustrative product example, not a real customer account or an earned-rank claim. It does not read browser account/session storage, derive a user's rank, open sharing controls, or mutate review data.

Source provenance: PassportHoloCard, PassportEtchedContent, passportHolo, passportMaterials, passportEngraving, passportOptics, passportOpticsShader, inline asset declarations, the existing rank material catalog and self-hosted fonts are copied from the separately approved Cova card tree:

- commit f9dbd3df2c09dcf61969598e4f6f2cd34c468709
- tree 596cd90a10f36cb1163eb6c50850cb2c209ba63d
- branch fix/passport-moving-clarity

The shared renderer and material catalog remain unchanged. Only the public StoryStrip binding and scoped homeStory.css are new product behavior. All rank plates are retained because the unchanged catalog resolves them; the homepage uses Diamond/Standard only. No rank picker, tenure unlock, eligibility change, entitlement, workspace transplant or share-format change is introduced. Font rights notices accompany the embedded Allura and Inter Tight font files.

`test:homepage-story` renders the real StoryStrip via Vite SSR and validates one actual etched Diamond, exact public workflow text, the four-stage list, the public Features link and illustrative provenance. `scripts/fixtures/homepage-story-preservation.json` pins unchanged card source/assets and protected adjacent source (text normalized to LF, binary assets exact).

`test:homepage-story-browser` exercises the production bundle at the explicitly enumerated viewport cases, observes the actual CSS cascade and meaningful-child geometry, then verifies pointer, keyboard, held-state settling, touch/release, WebGL-loss/restoration, reduced motion and the actual public CTA. Both tests belong to the existing aggregate. Existing Features layout and continuity checks are retained unchanged. Legacy story source assertions are revised only where the approved replacement makes the old stats panel obsolete.

Hero, pricing/footer, Features, navigation, App route order, auth, analytics and dashboard owners are unchanged. The existing .story-strip-simple hook is preserved for the hero's public scroll action.
