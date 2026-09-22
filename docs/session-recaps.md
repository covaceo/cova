# Session recaps

Risk Desk → Share recap opens a standalone native dialog. Passport remains a separate broader-record artifact. Select a dated recap, background, and Story (1080×1920), Feed (1080×1350), or Square (1080×1080). The actual generated PNG is also the preview. Download is always available once rendering completes; Web Share appears only when the browser accepts that PNG file. No social account connection or automatic posting is implied.

## Accounting and dates

- Consume only the already owner/account-scoped complete history. Group known same-opening-fill partial exits before choosing a day or region. Counts are trade entries, not certified flat-to-flat positions; unmatched rows are reported trades. Win rate includes breakevens in the denominator and does not round a losing record to 100%.
- Keep cents in integer arithmetic. Reject duplicates, mixed accounts, unsupported/unknown currencies, invalid cents/dates and malformed/partial timing evidence. Do not change risk, broker cash, the source ledger, or existing Passport calculations.
- Tradovate reports **Gross P&L · before fees**. Other verified USD records use **Reported P&L · fees unconfirmed**. Cash-day charges cannot safely be allocated to individual sessions, so recaps do not claim net or include funding/open-position P&L.
- A daily bucket uses a group's final observed exit date (UTC with validated timestamps, otherwise the coherent imported date). Whole groups crossing days remain together on the final date. Date-only histories do not gain invented intraday timestamps.
- Named regional recaps require *every* contributing entry and exit to be in the same dated, half-open review window. New York: 09:30–16:00 America/New_York. London: 08:00 Europe/London until 09:30 America/New_York. Asia: 09:00 Asia/Tokyo until 08:00 Europe/London. IANA zones handle DST, including weeks when US and UK changes differ. These are review windows, not exchange calendars or assertions a market was open. Off-window or cross-region groups remain Daily-only.
- Pure demo histories carry an unavoidable Sample data mark in every format. Mixed sample/imported histories cannot be shared.

## Identity, artwork and lifecycle

Saved username/avatar are read through the existing owner-guarded profile provider. Hiding identity removes both from pixels and accessible preview text. Filenames never include usernames, original photo names, or account IDs. Background photos themselves are user-controlled and may reveal identity.

Bundled city artwork is illustrative. Changing artwork never changes the selected financial session. JPG/PNG/WebP uploads are limited to 8 MB / 40 decoded megapixels, downsampled to a maximum dimension of 1920, re-encoded to JPEG to remove metadata, and kept only in the current dialog. No upload endpoint or remote image URL is used.

Owner/account changes dismiss the composer. Pixel-input changes invalidate export eligibility immediately. Rendering uses cancellation and exact input keys; a completed artifact must also own a still-live object URL. Closing, replacing a render, or changing scope revokes URLs. Late photo decoding cannot replace a newer background choice. Already handed-off downloaded/shared files cannot be recalled.

## Verification

`npm run test:recap` executes source/model and real-component browser regressions. `RECAP_COMPILED=1 node scripts/session-recap-browser-regression.mjs` additionally builds the real-component fixture and serves it under the exact production CSP/headers. Both use synthetic fixtures, real Canvas image generation, trusted pointer/keyboard input, measured desktop/laptop/phone/short-phone viewports, and actual PNG downloads. Only profile persistence boundaries and the device share transport are synthetic; no real broker account is synced and no social post is made.
