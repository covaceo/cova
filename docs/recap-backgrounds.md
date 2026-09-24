# Recap background uploads

Uploaded JPG/PNG/WebP stills and GIFs stay in composer memory only. No remote upload, persistence, profile write, trade write or AI service is involved. Closing the composer or changing owner/account clears the custom background. Existing curated backgrounds, report math, labels, identity gates and fees remain unchanged.

## Editing

An uploaded background can be dragged with a mouse or touch. Keyboard users focus the preview and use arrows (Shift for larger moves); Home or Reset restores center/1x. Zoom is 1–3x. A shared cover-crop transform clamps pan so no empty edges appear. Story, Feed and Square keep their existing 1080-wide compositions. Only the background transforms; identity, numbers, streak and Cova branding are stationary.

The native GIF preview can be paused to its first frame. It starts paused when reduced motion is enabled. PNG download/device image sharing remains a still image of that first frame. Download GIF renders all frames with the same selected crop and overlay, including source delays, transparency, and restore-background/restore-previous disposal. Output loops continuously. GIF uses a 256-color palette per frame; unlike PNG, it is not a lossless full-color export. Not every social app accepts animated GIF uploads.

## Bounds and cancellation

- GIF input: up to 8 MiB, 4 megapixels per logical canvas, 180 frames, 15 seconds and 80 million total logical-canvas pixels.
- Reject malformed headers, out-of-canvas descriptors, unsupported LZW code sizes, missing frames and over-budget input before decompression.
- Parse/decode/encode in a bundled same-origin Worker. Preview preparation has a 15-second ceiling; exports have a 120-second ceiling and a 40-MiB output cap. Cancellation terminates the Worker.
- All GIF frames are composed sequentially, not retained as a full RGBA animation. Only the current canvas, patch, optional previous canvas and export surface are needed.
- Background/session/format/identity/crop changes, owner/account changes and close invalidate pending results. Late uploads cannot override a newer selection. Blob URLs and transferred bitmaps are released.

## Executable proof

`npm run test:recap-gif` runs crop/validation tests plus compiled real-browser upload, mouse/touch/keyboard editing, repeated reset, pause/play, malformed/oversized inputs, three real animated downloads, decoded frame timing/motion, GIF disposal 2/3, unchanged overlay, cancellation and owner isolation. The browser fixture serves the production CSP. `npm run test:recap` also covers original PNG layouts, fee/identity gates, linked entries, streaks and four viewport sizes. All browser financial records are explicitly synthetic QA fixtures.

Dependencies: `gifuct-js` 2.1.2 and `gifenc` 1.0.3 (MIT). The package audit has one existing moderate `fflate` issue under `three-stdlib`; it is not in the GIF dependency path. No unrelated dependency upgrade is bundled into this feature.
