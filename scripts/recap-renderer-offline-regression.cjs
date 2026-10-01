// Actual production renderer exercised through a Skia Canvas implementation.
// Optional local QA dependency: npm install --no-save @napi-rs/canvas
// Or set RECAP_CANVAS_MODULE to an already installed package path.
// This is export verification, not a substitute for browser interaction tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createCanvas, Image: CanvasImage, GlobalFonts } = require(process.env.RECAP_CANVAS_MODULE || '@napi-rs/canvas');
const load = require('./helpers/load-ts.cjs');
const root = process.cwd();
for (const [file, family] of [['recap-space-grotesk.ttf', 'Cova Recap Space Grotesk'], ['recap-instrument-serif.ttf', 'Cova Recap Instrument Serif']]) {
  assert(GlobalFonts.registerFromPath(path.join(root, 'public/fonts', file), family), `${family} registered from real bundled font`);
}
let ink = [], draws = [], arcs = [];
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
      const ctx = getContext(kind), fill = ctx.fillText.bind(ctx), draw = ctx.drawImage.bind(ctx), arc = ctx.arc.bind(ctx);
      ctx.arc = (...args) => { arcs.push(args); return arc(...args); };
      ctx.fillText = (text, x, y) => {
        const m = ctx.measureText(text);
        ink.push({ text, x, y, font: ctx.font, color: ctx.fillStyle, width: m.width, align: ctx.textAlign, left: x - m.actualBoundingBoxLeft, right: x + m.actualBoundingBoxRight, top: y - m.actualBoundingBoxAscent, bottom: y + m.actualBoundingBoxDescent });
        return fill(text, x, y);
      };
      ctx.drawImage = (image, ...args) => { draws.push({ width: image.width, height: image.height, args }); return draw(image, ...args); };
      return ctx;
    };
    return canvas;
  },
};
const model = load('src/lib/sessionRecap.ts');
const { renderSessionRecap, recapFormats, recapBackgrounds } = load('src/lib/sessionRecapImage.ts');
const sampleRows = [200, -80, 160, 360].map((pnl, i) => ({ id: `demo-cinematic-qa-${i}`, date: '2026-09-18', market: 'MNQ', side: 'Long', contracts: 1, entry: 20000, exit: 20001, pnl, risk: 10, setup: '', notes: '' }));
const sample = model.buildSessionRecaps(sampleRows).options.find(r => r.kind === 'daily');
assert(sample.sample);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const amounts = ['64000', '-1', '0', '9007199254740991', '-9007199254740991'];
const cases = [], receipts = [];
for (const background of recapBackgrounds) for (const format of recapFormats) cases.push({ name: `${background.id}-${format.id}`, recap: sample, format: format.id, background: background.id });
for (const format of recapFormats) {
  for (const username of ['a', 'a_very_long_valid_username_123456', 'x'.repeat(200)]) cases.push({name: `identity-${username.length}-${format.id}`,recap:sample,format:format.id,background:'blue-tower',username});
  for (const totalCents of amounts) cases.push({ name: `currency-${totalCents}-${format.id}`, recap: { ...sample, totalCents }, format: format.id, background: 'plain' });
  // Synthetic unit fixtures isolate the existing conditional text paths. Never production records.
  cases.push({ name: `streak-${format.id}`, recap: { ...sample, sample: false, fees: { signedCents: '-1234', netCashCents: '62766', asOf: '2026-09-18T14:15:00.000Z' }, hotStreak: { days: 3, atLeast: false }, countLabel: 'Trade entries' }, format: format.id, background: 'cloud-towers', username: 'recap_qa' });
  cases.push({ name: `reported-${format.id}`, recap: { ...sample, sample: false }, format: format.id, background: 'blue-tower' });
  cases.push({ name: `custom-${format.id}`, recap: sample, format: format.id, background: 'custom', customPhoto: '/recaps/blue-tower.png', transform: { zoom: 2, x: 1, y: -1 } });
  cases.push({ name: `foreground-${format.id}`, recap: sample, format: format.id, background: 'custom', foregroundOnly: true });
}
(async () => {
  for (const input of cases) {
    ink = []; draws = []; arcs = [];
    const blob = await renderSessionRecap(input, undefined, input.foregroundOnly);
    const bytes = Buffer.from(await blob.arrayBuffer()), preset = recapFormats.find(f => f.id === input.format);
    assert.equal(blob.type, 'image/png'); assert.equal(bytes.readUInt32BE(16), preset.width); assert.equal(bytes.readUInt32BE(20), preset.height);
    const amount = ink.find(t => t.text === model.recapMoney(model.recapHeadlineCents(input.recap)));
    assert(amount, `${input.name}: complete signed currency present`);
    assert.match(amount.font, /^400 .*Cova Recap Instrument Serif/);
    assert.equal(amount.x, 56); assert(amount.left >= 54 && amount.right <= 1024, `${input.name}: currency stays inside safe margins`);
    const net = BigInt(model.recapHeadlineCents(input.recap));
    const amountPasses = ink.filter(t => t.text === amount.text && t.font.includes('Cova Recap Instrument Serif'));
    assert.deepEqual(amountPasses.map(t => t.color), net > 0n ? ['#76d5ad', '#f4f5f6'] : [net < 0n ? '#fdb6b5' : '#f4f5f6']);
    for (const text of ink) assert(text.left >= 0 && text.right <= 1080 && text.top >= 0 && text.bottom <= preset.height, `${input.name}: text clipped ${text.text}`);
    const identity = ink.find(t=>t.text.startsWith('@'));
    if (input.username) { const date=ink.find(t=>t.text===input.recap.dateLabel);assert.equal(identity.x,date.x);assert.equal(identity.align,'right');assert(identity.right<=1025);assert.equal(arcs[0][0]+20,identity.x-identity.width-10);assert(arcs[0][0]-20>306);assert.equal(arcs[0][1],identity.y-10); } else { assert.equal(identity,undefined);assert.equal(arcs.length,0); }
    const market = ink.find(t => t.text === input.recap.markets);
    assert(amount.top >= market.bottom + 8, `${input.name}: market and currency do not overlap`);
    const secondary = ink.find(t => t.text === model.recapHotStreakLine(input.recap) || t.text === input.recap.basis);
    if (secondary) {
      assert(secondary.top >= amount.bottom + 6, `${input.name}: conditional detail clears currency`);
      const stat = ink.find(t => t.text === input.recap.winRate);
      assert(stat.top >= secondary.bottom + 6, `${input.name}: conditional detail clears fixed stats`);
    }
    for (const text of [String(input.recap.count), input.recap.winRate, input.recap.countLabel, 'Win rate', 'covadesk.com', input.recap.dateLabel]) assert(ink.some(t => t.text === text), `${input.name}: retained ${text}`);
    assert.equal(ink.some(t => t.text === 'Sample data · Not a live account'), input.recap.sample);
    assert.equal(ink.some(t => t.text.includes('HOT STREAK')), false);
    assert(draws.some(d => d.width === 1375 && d.height === 318), `${input.name}: original Cova wordmark drawn`);
    receipts.push({ name: input.name, width: preset.width, height: preset.height, outputSha256: hash(bytes), amount, textCount: ink.length });
  }
  const blocked = { ...sample, sample: false, basis: 'Gross P&L · before fees', fees: null };
  await assert.rejects(renderSessionRecap({ recap: blocked, format: 'story', background: 'plain' }), /Sync.*fees/);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(renderSessionRecap({ recap: sample, format: 'story', background: 'plain' }, cancelled.signal), /cancelled/);
  const out = process.env.RECAP_OFFLINE_RECEIPT;
  if (out) fs.writeFileSync(out, JSON.stringify({ browserVerified: false, fixture: 'Synthetic test records only', cases: receipts, blockedMissingFees: true, cancelledRender: true }, null, 2));
  console.log(`PASS ${receipts.length} actual renderer cases, exact currency/fit/labels/identity paths, missing-fee blocking and cancellation. Browser interactions not verified.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
