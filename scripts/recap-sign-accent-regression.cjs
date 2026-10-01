// Default production positive sign accent and negative currency tint QA using the production renderer and bundled fonts.
// Run: RECAP_CANVAS_MODULE=/tmp/cova-canvas/node_modules/@napi-rs/canvas node scripts/recap-sign-accent-regression.cjs
// No browser, generated preview, or approved export is modified.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createCanvas, Image: CanvasImage, GlobalFonts } = require(process.env.RECAP_CANVAS_MODULE || '@napi-rs/canvas');
const load = require('./helpers/load-ts.cjs');
const root = process.cwd();
const AMOUNT_FAMILY = 'Cova Recap Instrument Serif';
const WHITE = '#f4f5f6', GREEN = '#76d5ad', RED = '#fdb6b5';
for (const [file, family] of [['recap-space-grotesk.ttf', 'Cova Recap Space Grotesk'], ['recap-instrument-serif.ttf', AMOUNT_FAMILY]]) {
  assert(GlobalFonts.registerFromPath(path.join(root, 'public/fonts', file), family));
}
let ink = [], beforeMoney, afterMoney, moneyCanvas, neutralMoney = false;
global.Image = class Image extends CanvasImage {
  set src(value) { super.src = typeof value === 'string' && value.startsWith('/') ? path.join(root, 'public', value) : value; }
  get src() { return super.src; }
};
global.FontFace = class FontFace {
  constructor(family) { this.family = family; }
  async load() { assert(GlobalFonts.has(this.family)); return this; }
};
global.document = {
  fonts: { add() {}, async load() { return [{ status: 'loaded' }]; } },
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = createCanvas(300, 150), getContext = canvas.getContext.bind(canvas);
    canvas.getContext = kind => {
      const ctx = getContext(kind), fill = ctx.fillText.bind(ctx);
      ctx.fillText = (text, x, y) => {
        const isMoney = ctx.font.includes(AMOUNT_FAMILY), m = ctx.measureText(text);
        const call = { text, x, y, font: ctx.font, color: ctx.fillStyle, align: ctx.textAlign,
          shadowBlur: ctx.shadowBlur, shadowOffsetX: ctx.shadowOffsetX, shadowOffsetY: ctx.shadowOffsetY,
          width: m.width, left: x - m.actualBoundingBoxLeft, right: x + m.actualBoundingBoxRight,
          top: y - m.actualBoundingBoxAscent, bottom: y + m.actualBoundingBoxDescent, isMoney };
        ink.push(call);
        if (isMoney && !beforeMoney) { beforeMoney = ctx.getImageData(0, 0, canvas.width, canvas.height); moneyCanvas = canvas; }
        if (isMoney && neutralMoney) { const saved = ctx.fillStyle; ctx.fillStyle = WHITE; fill(text, x, y); ctx.fillStyle = saved; }
        else fill(text, x, y);
        if (isMoney) afterMoney = ctx.getImageData(0, 0, canvas.width, canvas.height);
      };
      return ctx;
    };
    return canvas;
  },
};
const model = load('src/lib/sessionRecap.ts');
const { renderSessionRecap, recapFormats } = load('src/lib/sessionRecapImage.ts');
const sampleRows = [200, -80, 160, 360].map((pnl, i) => ({ id: `demo-sign-qa-${i}`, date: '2026-09-18', market: 'MNQ', side: 'Long', contracts: 1, entry: 20000, exit: 20001, pnl, risk: 10, setup: '', notes: '' }));
const sample = model.buildSessionRecaps(sampleRows).options.find(r => r.kind === 'daily');
assert(sample?.sample);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const layouts = { wide: {font:126,amount:319}, story: { font: 202, amount: 1395 }, feed: { font: 192, amount: 920 }, square: { font: 182, amount: 680 } };
const amounts = ['64000', '-64000', '0', '1', '-1', '101', '-101', '9007199254740991', '-9007199254740991'];
const cases = recapFormats.flatMap(format => amounts.map(totalCents => ({ name: `${format.id}-${totalCents}`, format: format.id, background: 'plain', recap: { ...sample, totalCents } })));
for (const format of recapFormats) {
  for (const totalCents of ['64000', '-64000']) {
    cases.push({ name: `${format.id}-cloud-towers-${totalCents}`, format: format.id, background: 'cloud-towers', recap: { ...sample, totalCents } });
  }
  for (const [gross, net] of [['64000', '-1'], ['-64000', '1'], ['64000', '0']]) {
    cases.push({ name: `${format.id}-fees-${gross}-to-${net}`, format: format.id, background: 'plain', recap: { ...sample, sample: false, basis: 'Gross P&L · before fees', totalCents: gross, fees: { signedCents: (BigInt(net) - BigInt(gross)).toString(), netCashCents: net, asOf: '2026-09-18T14:15:00.000Z' } } });
  }
}
async function render(input, neutral = false, foregroundOnly = false) {
  neutralMoney = neutral;
  ink = []; beforeMoney = afterMoney = moneyCanvas = null;
  const blob = await renderSessionRecap(input, undefined, foregroundOnly);
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { ink, before: beforeMoney, after: afterMoney, final: moneyCanvas.getContext('2d').getImageData(0, 0, moneyCanvas.width, moneyCanvas.height), canvas: moneyCanvas, bytes, hash: hash(bytes) };
}
function reference(before, call, color) {
  const canvas = createCanvas(before.width, before.height), ctx = canvas.getContext('2d');
  ctx.putImageData(before, 0, 0); ctx.font = call.font; ctx.textAlign = call.align; ctx.fillStyle = color;
  ctx.fillText(call.text, call.x, call.y);
  return { canvas, ctx, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}
function pixelQa(name, result, accent, negative) {
  const calls = result.ink.filter(c => c.isMoney), call = calls[0];
  const ref = reference(result.before, call, WHITE);
  const fullWidth = ref.ctx.measureText(call.text).width;
  const suffix = call.text.slice(1), sign = call.text[0];
  const split = call.x + fullWidth - ref.ctx.measureText(suffix).width;
  const tinted = reference(result.before, call, accent || WHITE).pixels;
  const actual = result.after.data, before = result.before.data, white = ref.pixels;
  const signCanvas = createCanvas(result.before.width, result.before.height), signCtx = signCanvas.getContext('2d');
  signCtx.font = call.font; signCtx.textAlign = 'left'; signCtx.fillStyle = '#fff';
  if (accent) signCtx.fillText(sign, call.x, call.y);
  const signPixels = signCtx.getImageData(0, 0, signCanvas.width, signCanvas.height).data;
  let changed = 0, tintPixels = 0, whitePixels = 0, seamInk = 0, geometryMismatch = 0, leakage = 0, unexpected = 0;
  const same = (a, b, i, tolerance = 0) => [0, 1, 2, 3].every(c => Math.abs(a[i + c] - b[i + c]) <= tolerance);
  for (let y = Math.floor(call.top) - 3; y <= Math.ceil(call.bottom) + 3; y++) {
    for (let x = Math.floor(call.left) - 3; x <= Math.ceil(call.right) + 3; x++) {
      const i = (y * result.before.width + x) * 4;
      const whiteInk = !same(white, before, i), actualInk = !same(actual, before, i);
      if (whiteInk !== actualInk) geometryMismatch++;
      if (!same(actual, white, i)) {
        changed++;
        // A separate first-glyph mask catches a misplaced split that colors '$' or digits.
        if (!negative && (!accent || signPixels[i + 3] === 0)) leakage++;
      }
      const expected = negative || (accent && x < split) ? tinted : white;
      if (!same(actual, expected, i, 1)) unexpected++;
      if (whiteInk && Math.abs(x - split) <= 1) seamInk++;
      if (actual[i] === 244 && actual[i + 1] === 245 && actual[i + 2] === 246) whitePixels++;
      const rgb = accent ? [1, 3, 5].map(offset => parseInt(accent.slice(offset, offset + 2), 16)) : [];
      if (accent && rgb.every((value, c) => actual[i + c] === value)) tintPixels++;
    }
  }
  assert.equal(geometryMismatch, 0, `${name}: accent preserves complete glyph coverage and cent geometry`);
  assert.equal(leakage, 0, `${name}: positive accent must stay inside the first sign glyph`);
  assert.equal(unexpected, 0, `${name}: expected full-shaped-run pixel color`);
  if (negative) assert.equal(whitePixels, 0, `${name}: all negative characters are tinted`);
  else assert(whitePixels > 30, `${name}: white dollar/digits/decimal/cents present`);
  if (accent) {
    assert(changed > 0 && tintPixels > 0, `${name}: amount has requested solid tint or sign accent`);
    if (!negative) assert.equal(seamInk, 0, `${name}: clipping seam crosses no glyph ink`);
  } else assert.equal(changed, 0, `${name}: zero amount remains completely neutral`);
  return { split, changedMoneyPixels: changed, solidAccentPixels: tintPixels, whitePixels, geometryMismatch, leakage, seamInk: accent && !negative ? seamInk : null };
}
function unchangedBackgroundQa(input, result, off) {
  const call = result.ink.find(c => c.isMoney);
  assert(Buffer.from(result.before.data).equals(Buffer.from(off.before.data)), `${input.name}: background is pixel-identical with no wash or glow`);
  const maskCanvas = createCanvas(result.before.width, result.before.height), maskCtx = maskCanvas.getContext('2d');
  maskCtx.font = call.font; maskCtx.textAlign = call.align; maskCtx.fillStyle = '#fff';
  maskCtx.fillText(call.text, call.x, call.y);
  const glyphMask = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  const finalA = result.final.data, finalB = off.final.data;
  const same = (first, second, i) => first[i] === second[i] && first[i + 1] === second[i + 1] && first[i + 2] === second[i + 2] && first[i + 3] === second[i + 3];
  let finalOutsideGlyphs = 0;
  for (let i = 0; i < finalA.length; i += 4) {
    if (!same(finalA, finalB, i) && glyphMask[i + 3] === 0) finalOutsideGlyphs++;
  }
  assert.equal(finalOutsideGlyphs, 0, `${input.name}: final pixels outside exact money glyphs are unchanged`);
  for (const text of result.ink.filter(c => !c.isMoney)) {
    let changedPixels = 0;
    for (let y = Math.floor(text.top) - 2; y <= Math.ceil(text.bottom) + 2; y++) {
      for (let x = Math.floor(text.left) - 2; x <= Math.ceil(text.right) + 2; x++) {
        const i = (y * result.before.width + x) * 4;
        if (!same(finalA, finalB, i)) changedPixels++;
      }
    }
    assert.equal(changedPixels, 0, `${input.name}: protected ${text.text} pixels unchanged`);
  }
  return { backgroundPixelIdentical: true, finalChangesOutsideMoneyGlyphs: finalOutsideGlyphs, protectedLabelsHeaderStatsFooter: true };
}
(async () => {
  const receipts = [];
  for (const input of cases) {
    const headline = model.recapHeadlineCents(input.recap), amount = model.recapMoney(headline), sign = BigInt(headline);
    const result = await render(input), calls = result.ink.filter(c => c.isMoney), call = calls[0];
    assert.equal(calls.length, sign > 0n ? 2 : 1, `${input.name}: whole amount passes`);
    for (const draw of calls) {
      assert.equal(draw.text, amount, `${input.name}: full exact cents string in every pass`);
      assert.equal(draw.x, 56); assert.equal(draw.y, layouts[input.format].amount);
      assert.equal(draw.align, 'left');
      assert(draw.left >= 54 && draw.right <= 1024, `${input.name}: fit in approved safe margins`);
      assert.equal(draw.shadowBlur, 0, `${input.name}: no text glow`);
      assert.equal(draw.shadowOffsetX, 0); assert.equal(draw.shadowOffsetY, 0);
    }
    assert.match(amount, /\.\d{2}$/);
    assert.equal(calls.at(-1).color, sign < 0n ? RED : WHITE);
    if (sign > 0n) {
      assert.equal(calls[0].color, GREEN);
      for (const prop of ['text', 'x', 'y', 'font', 'align', 'left', 'right', 'top', 'bottom']) assert.equal(calls[0][prop], calls[1][prop], `${input.name}: shaped run ${prop} identical`);
    }
    const pixel = pixelQa(input.name, result, sign === 0n ? null : sign < 0n ? RED : GREEN, sign < 0n);
    // Independent neutral-color control: only the test Canvas adapter overrides
    // amount ink. Production code has no opt-in flag or alternate-color branch.
    const neutral = await render(input, true);
    const background = unchangedBackgroundQa(input, result, neutral);
    const neutralCall = neutral.ink.find(c => c.isMoney);
    for (const prop of ['text', 'x', 'y', 'font', 'align', 'left', 'right', 'top', 'bottom']) assert.equal(neutralCall[prop], call[prop], `${input.name}: approved layout ${prop} unchanged`);
    const otherText = draws => draws.filter(c => !c.isMoney);
    assert.deepEqual(otherText(result.ink), otherText(neutral.ink), `${input.name}: all other text geometry/color unchanged`);
    if (sign === 0n) assert.equal(result.hash, neutral.hash, `${input.name}: zero is neutral by default`);
    const foreground = await render(input, false, true), neutralForeground = await render(input, true, true);
    assert.deepEqual(foreground.ink.filter(c => c.isMoney), calls, `${input.name}: GIF foreground uses identical default currency styling`);
    const foregroundPixel = pixelQa(input.name + '-foreground', foreground, sign === 0n ? null : sign < 0n ? RED : GREEN, sign < 0n);
    const foregroundBackground = unchangedBackgroundQa({ ...input, name: input.name + '-foreground' }, foreground, neutralForeground);
    receipts.push({ name: input.name, amount, font: call.font, amountY: call.y, accent: sign === 0n ? null : sign < 0n ? RED : GREEN, productionDefault: true, foregroundVerified: true, ...pixel, ...background, foregroundPixel, foregroundBackground });
  }
  for (const subcent of [0.001, -0.001, 0.009, -0.009, 1.001, -1.001]) {
    const invalid = model.buildSessionRecaps([{ ...sampleRows[0], pnl: subcent }]);
    assert.equal(invalid.options.length, 0, `subcent ${subcent} cannot produce a misleading signed zero`);
    assert.match(invalid.error, /exact amounts/);
  }
  for (const [pnl, expected] of [[0.01, '+$0.01'], [-0.01, '−$0.01'], [0, '$0.00']]) {
    const built = model.buildSessionRecaps([{ ...sampleRows[0], pnl }]);
    assert.equal(model.recapMoney(built.options[0].totalCents), expected);
  }
  if (process.env.RECAP_SIGN_ACCENT_RECEIPT) fs.writeFileSync(process.env.RECAP_SIGN_ACCENT_RECEIPT, JSON.stringify({ fixture: 'Synthetic test data only', actualRenderer: true, browserVerified: false, actualRenders: receipts.length * 4, defaultStyling: true, cases: receipts, subcentRejected: 6, centsInputVerified: 3 }, null, 2));
  console.log(`PASS ${receipts.length} cases across Recap/Story/Feed/Square (${receipts.length * 4} actual renders). Pixel tests confirm green positive sign and white digits, all negative characters salmon-pink based on displayed net, neutral zero, exact shape/fit/position, no wash or text glow, untouched background/labels/header/stats/footer, active default styling shared by PNG and GIF foreground paths. Six subcent values rejected; one-cent inputs exact. Browser interactions not verified.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
