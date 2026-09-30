// Browser-free contract checks. Canvas calls are recorded, not rasterized: these
// complement (and do not replace) the real-browser PNG and interaction suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import postcss from 'postcss';
import ts from 'typescript';
import load from './helpers/load-ts.cjs';

const renderer = load('src/lib/sessionRecapImage.ts');
const { recapMoney } = load('src/lib/sessionRecap.ts');
const css = postcss.parse(readFileSync('src/styles/sessionRecap.css', 'utf8'));
const layouts = {
  story: { height: 1920, head: 160, title: 1136, market: 1200, amount: 1416, basis: 1488, font: 202, streak: 1498, stat: 1570, label: 1616, footer: 1714, website: 1758, sample: 1812, fade: [760, 1470] },
  feed: { height: 1350, head: 86, title: 676, market: 740, amount: 952, basis: 1016, font: 192, streak: 1028, stat: 1100, label: 1142, footer: 1220, website: 1264, sample: 1310, fade: [348, 1012] },
  square: { height: 1080, head: 78, title: 432, market: 492, amount: 696, basis: 760, font: 182, streak: 772, stat: 840, label: 882, footer: 966, website: 1010, sample: 1048, fade: [170, 770] },
};
const fixture = (netCashCents = '62766') => ({
  id: 'daily:2026-09-18', kind: 'daily', date: '2026-09-18', title: 'Daily recap', dateLabel: 'Sep 18, 2026',
  windowLabel: 'UTC close date', hotStreak: { days: 3, atLeast: false },
  fees: { netCashCents, signedCents: '-1234' }, totalCents: '64000', count: 4, wins: 3, winRate: '75%',
  countLabel: 'Trade entries', markets: 'MNQ', basis: 'Gross P&L · before fees', sample: false, theme: 'new-york', details: '',
});

function installCanvasRecorder(t) {
  const originals = Object.fromEntries(['document', 'Image', 'FontFace'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const canvases = [], loadedFonts = [], fontRequests = [], images = [];
  const face = { load: async font => { fontRequests.push(font); return [{}]; }, add: font => loadedFonts.push(font) };
  class FontFace {
    constructor(family, source, descriptors) { Object.assign(this, { family, source, descriptors }); }
    async load() { return this; }
  }
  class Image {
    width = 1920; height = 1080;
    set src(value) {
      this.source = value;
      if (!value) return;
      images.push(value);
      if (value.includes('wordmark')) { this.width = 600; this.height = 200; }
      queueMicrotask(() => this.onload?.());
    }
  }
  const document = {
    fonts: face,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = { width: 0, height: 0, ink: [], draws: [], fills: [], gradients: [], arcs: [], strokes: [], grades: 0 };
      const stack = [], path = [];
      const context = {
        font: '', textAlign: 'left', fillStyle: '', letterSpacing: '0px', shadowColor: 'rgba(0,0,0,0)', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, activeClips: [], canvas,
        measureText(value) {
          // Deliberately wide deterministic metrics exercise font fitting without
          // pretending to measure browser kerning or final raster appearance.
          const size = Number(this.font.match(/([\d.]+)px/)[1]);
          const width = value.length * size * .5;
          return { width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width + 2 };
        },
        fillText(value, x, y) { canvas.ink.push({ value, x, y, font: this.font, align: this.textAlign, color: this.fillStyle, spacing: this.letterSpacing, shadowColor: this.shadowColor, shadowBlur: this.shadowBlur, shadowOffsetX: this.shadowOffsetX, shadowOffsetY: this.shadowOffsetY, clips: structuredClone(this.activeClips), ...this.measureText(value) }); },
        drawImage(image, ...rect) { canvas.draws.push({ source: image.source, rect }); },
        fillRect(...rect) { canvas.fills.push({ style: this.fillStyle, rect }); },
        createLinearGradient(...rect) { const gradient = { type: 'linear', rect, stops: [], addColorStop(at, color) { this.stops.push([at, color]); } }; canvas.gradients.push(gradient); return gradient; },
        createRadialGradient(...rect) { const gradient = this.createLinearGradient(...rect); gradient.type = 'radial'; return gradient; },
        getImageData() { canvas.grades++; return { data: new Uint8ClampedArray([10, 20, 30, 255]) }; },
        putImageData() {}, beginPath() { path.length = 0; },
        rect(...args) { path.push({ kind: 'rect', args }); },
        clip() { this.activeClips.push(structuredClone(path)); },
        arc(...args) { canvas.arcs.push(args); path.push({ kind: 'arc', args }); },
        moveTo(...args) { canvas.strokes.push(['move', ...args]); }, lineTo(...args) { canvas.strokes.push(['line', ...args]); }, stroke() {},
        save() { stack.push({ font: this.font, textAlign: this.textAlign, fillStyle: this.fillStyle, letterSpacing: this.letterSpacing, shadowColor: this.shadowColor, shadowBlur: this.shadowBlur, shadowOffsetX: this.shadowOffsetX, shadowOffsetY: this.shadowOffsetY, activeClips: structuredClone(this.activeClips) }); },
        restore() { Object.assign(this, stack.pop()); },
      };
      canvas.getContext = kind => { assert.equal(kind, '2d'); return context; };
      canvas.toBlob = (callback, type) => { assert.equal(type, 'image/png'); callback(new Blob(['recorded canvas'], { type })); };
      canvases.push(canvas);
      return canvas;
    },
  };
  for (const [key, value] of Object.entries({ document, Image, FontFace })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => { for (const [key, descriptor] of Object.entries(originals)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; });
  return { canvases, loadedFonts, fontRequests, images, fonts: face };
}

test('all production formats and six existing background choices remain available', () => {
  assert.deepEqual(renderer.recapFormats, [
    { id: 'story', label: 'Story', width: 1080, height: 1920 },
    { id: 'feed', label: 'Feed', width: 1080, height: 1350 },
    { id: 'square', label: 'Square', width: 1080, height: 1080 },
  ]);
  assert.deepEqual(renderer.recapBackgrounds, [
    { id: 'new-york', label: 'New York', src: '/recaps/new-york.webp' },
    { id: 'london', label: 'London', src: '/recaps/london.webp' },
    { id: 'asia', label: 'Asia', src: '/recaps/asia.webp' },
    { id: 'blue-tower', label: 'Blue Tower', src: '/recaps/blue-tower.png' },
    { id: 'cloud-towers', label: 'Cloud Towers', src: '/recaps/cloud-towers.png' },
    { id: 'plain', label: 'Plain', src: '' },
  ]);
  for (const background of renderer.recapBackgrounds) if (background.src) assert(existsSync('public' + background.src), background.src);
});

test('PNG and GIF foreground composition use the same default signed-money rendering without a toggle', () => {
  const composer = readFileSync('src/components/SessionRecapComposer.tsx', 'utf8');
  const source = ts.createSourceFile('SessionRecapComposer.tsx', composer, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'renderSessionRecap') calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(calls.length, 2, 'Normal PNG and foreground-only export share the production renderer');
  const foreground = calls.find(call => call.arguments.length === 3), normal = calls.find(call => call.arguments.length === 2);
  assert(foreground && normal);
  assert.equal(foreground.arguments[2].kind, ts.SyntaxKind.TrueKeyword);
  for (const [call, expected] of [[foreground, ['recap', 'format', 'background', 'username', 'avatar']], [normal, ['recap', 'format', 'background', 'customPhoto', 'transform', 'username', 'avatar']]]) {
    assert(ts.isObjectLiteralExpression(call.arguments[0]));
    assert.deepEqual(call.arguments[0].properties.map(property => property.name?.getText(source)), expected, 'No sign-color override or spread can bypass the default');
  }
  for (const content of [composer, readFileSync('src/lib/sessionRecapImage.ts', 'utf8')]) assert.doesNotMatch(content, /signAccent/, 'No optional sign-accent feature flag or UI toggle');
});

test('bundled amount face is actual regular Instrument Serif with its redistribution license', () => {
  const font = readFileSync('public/fonts/recap-instrument-serif.ttf');
  assert.equal(font.readUInt32BE(0), 0x00010000, 'Valid TrueType signature');
  const tables = new Map();
  for (let i = 0; i < font.readUInt16BE(4); i++) {
    const at = 12 + i * 16, offset = font.readUInt32BE(at + 8), size = font.readUInt32BE(at + 12);
    assert(offset + size <= font.length, 'Complete bundled font table');
    tables.set(font.toString('ascii', at, at + 4), font.subarray(offset, offset + size));
  }
  const names = tables.get('name'), strings = names.readUInt16BE(4), found = [];
  for (let i = 0; i < names.readUInt16BE(2); i++) {
    const at = 6 + i * 12, platform = names.readUInt16BE(at), id = names.readUInt16BE(at + 6), length = names.readUInt16BE(at + 8), offset = names.readUInt16BE(at + 10);
    const bytes = Buffer.from(names.subarray(strings + offset, strings + offset + length));
    found.push([id, platform === 0 || platform === 3 ? bytes.swap16().toString('utf16le') : bytes.toString('latin1')]);
  }
  assert(found.some(([id, value]) => id === 1 && value === 'Instrument Serif'));
  assert(found.some(([id, value]) => id === 2 && value === 'Regular'));
  assert.equal(tables.get('OS/2').readUInt16BE(4), 400, 'Regular weight, not synthetic bold');
  assert.equal(tables.get('head').readUInt16BE(44) & 3, 0, 'Neither bold nor italic');
  assert.match(readFileSync('public/fonts/recap-instrument-serif-OFL.txt', 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(readFileSync('public/fonts/recap-instrument-serif-OFL.txt', 'utf8'), /Instrument Serif Project Authors/);
  assert(existsSync('public/fonts/recap-space-grotesk.ttf'));
  assert.match(readFileSync('public/fonts/recap-space-grotesk-OFL.txt', 'utf8'), /SIL OPEN FONT LICENSE/);
});

test('the production renderer preserves exact net money, authored typography, identity and branding in all formats', async t => {
  const state = installCanvasRecorder(t);
  for (const [format, layout] of Object.entries(layouts)) for (const cents of ['62766', '-1000', '0', '1234567890123']) {
    const recap = fixture(cents), before = structuredClone(recap);
    const blob = await renderer.renderSessionRecap({ recap, format, background: 'plain', username: 'recap_qa', avatar: 'data:image/jpeg;base64,test' });
    assert.equal(blob.type, 'image/png');
    assert.deepEqual(recap, before, 'Rendering does not mutate financial evidence');
    const canvas = state.canvases.at(-1), ink = value => canvas.ink.find(item => item.value === value);
    assert.deepEqual([canvas.width, canvas.height], [1080, layout.height]);
    const amount = ink(recapMoney(cents));
    assert(amount, 'Complete signed amount survives fitting without an ellipsis');
    assert.match(amount.font, /^400 \d+px "Cova Recap Instrument Serif"$/);
    assert.equal(amount.y, layout.amount); assert.equal(amount.x, 540); assert.equal(amount.align, 'center');
    assert(Math.max(amount.width, amount.actualBoundingBoxLeft + amount.actualBoundingBoxRight) <= 928);
    assert(Number(amount.font.match(/(\d+)px/)[1]) <= layout.font);
    const passes = canvas.ink.filter(item => item.value === recapMoney(cents));
    if (BigInt(cents) > 0n) {
      assert.equal(passes.length, 2, 'Positive money uses two complete shaped-string passes');
      assert.deepEqual(passes.map(pass => pass.color), ['#76d5ad', '#f4f5f6']);
      const signEnd = 540 - amount.width / 2 + Number(amount.font.match(/(\d+)px/)[1]) * .5;
      assert.deepEqual(passes[0].clips, [[{ kind: 'rect', args: [0, 0, signEnd, layout.height] }]], 'Only the positive sign receives green');
      assert.deepEqual(passes[1].clips, [[{ kind: 'rect', args: [signEnd, 0, 1080 - signEnd, layout.height] }]], 'The complementary clip keeps all currency digits white');
      for (const key of ['value', 'x', 'y', 'font', 'align', 'width']) assert.equal(passes[0][key], passes[1][key], 'No reshaping between clipped passes: ' + key);
    } else {
      assert.equal(passes.length, 1, 'Negative and zero money remain complete single-pass lines');
      assert.equal(amount.color, BigInt(cents) < 0n ? '#fdb6b5' : '#f4f5f6');
      assert.deepEqual(amount.clips, []);
    }
    assert(canvas.fills.every(fill => !['#76d5ad', '#fdb6b5'].includes(fill.style)), 'No positive or negative background wash');
    for (const [value, key] of [['DAILY RECAP', 'title'], ['MNQ', 'market'], ['3 DAY HOT STREAK', 'streak'], ['4', 'stat'], ['75%', 'stat'], ['Trade entries', 'label'], ['Win rate', 'label'], ['covadesk.com', 'website']]) {
      assert.equal(ink(value).y, layout[key], value + ' baseline');
      assert.match(ink(value).font, /Cova Recap Space Grotesk/);
      assert.deepEqual(ink(value).clips, [], 'Amount clipping never leaks onto labels or stats');
    }
    assert.equal(ink('Trade entries').x, 308); assert.equal(ink('Win rate').x, 772);
    assert.equal(ink('MNQ').color, '#9bbcff'); assert.equal(ink('DAILY RECAP').color, '#f4f6fa'); assert.equal(ink('3 DAY HOT STREAK').color, '#9fb2ff');
    assert.equal(ink('DAILY RECAP').font, '600 32px \"Cova Recap Space Grotesk\"');
    assert.equal(ink('DAILY RECAP').spacing, '3px');
    assert.equal(ink('MNQ').font, '600 36px \"Cova Recap Space Grotesk\"');
    assert.equal(ink('MNQ').spacing, '0px');
    for (const value of ['DAILY RECAP', 'MNQ']) assert.deepEqual([ink(value).shadowColor, ink(value).shadowBlur, ink(value).shadowOffsetX, ink(value).shadowOffsetY], ['rgba(0,0,0,.95)', 18, 0, 3], value + ' keeps a soft contrast shadow');
    assert.deepEqual([amount.shadowColor, amount.shadowBlur, amount.shadowOffsetX, amount.shadowOffsetY], ['rgba(0,0,0,0)', 0, 0, 0], 'Label shadow never leaks onto the money');
    assert.equal(ink('@recap_qa').y, layout.head); assert.equal(ink('Sep 18, 2026').y, layout.head);
    assert.deepEqual(canvas.arcs[0], [104, layout.head - 10, 28, 0, Math.PI * 2]);
    const logo = canvas.draws.find(item => item.source.includes('wordmark'));
    assert.deepEqual(logo.rect, [430, layout.footer - 220 / 3 + 6, 220, 220 / 3]);
    assert(!canvas.ink.some(item => /Gross|Net cash|Posted fees|UTC close date/.test(item.value)));
  }
  for (const [format, layout] of Object.entries(layouts)) {
    const recap = { ...fixture(), fees: null, hotStreak: null, basis: 'Reported P&L · fees unconfirmed' };
    await renderer.renderSessionRecap({ recap, format, background: 'plain' });
    assert.equal(state.canvases.at(-1).ink.find(item => item.value === recap.basis).y, layout.basis, 'Conditional basis moves with the result group');
  }
  assert.deepEqual(state.loadedFonts.map(font => [font.family, font.descriptors]), [
    ['Cova Recap Space Grotesk', { style: 'normal', weight: '300 700' }],
    ['Cova Recap Instrument Serif', { style: 'normal', weight: '400' }],
  ]);
  assert(state.fontRequests.some(font => font === '400 40px "Cova Recap Instrument Serif"'));
});

test('curated, custom, plain and foreground-only paths retain crop and black fade contracts', async t => {
  const state = installCanvasRecorder(t);
  for (const [format, layout] of Object.entries(layouts)) for (const background of [...renderer.recapBackgrounds.map(item => item.id), 'custom']) {
    const input = { recap: fixture(), format, background, customPhoto: 'data:image/jpeg;base64,custom', transform: { zoom: 2, x: .4, y: -.2 } };
    await renderer.renderSessionRecap(input);
    const canvas = state.canvases.at(-1);
    if (background === 'plain') { assert.equal(canvas.gradients.length, 0); assert.equal(canvas.fills[0].style, '#080d12'); continue; }
    const fade = canvas.gradients.find(gradient => gradient.type === 'linear' && gradient.stops.at(-1)[1] === '#000');
    assert.deepEqual(fade.rect, [0, layout.fade[0], 0, layout.fade[1]]);
    assert.deepEqual(fade.stops, [[0, 'rgba(0,0,0,0)'], [.42, 'rgba(0,0,0,.32)'], [.72, 'rgba(0,0,0,.88)'], [1, '#000']]);
    assert.equal(canvas.grades, background === 'custom' ? 0 : 1, 'Only curated photos receive grading');
    const crop = renderer.recapBackgroundRect(1920, 1080, 1080, layout.height, input.transform);
    assert.deepEqual(canvas.draws[0].rect, [crop.x, crop.y, crop.width, crop.height]);
  }
  await renderer.renderSessionRecap({ recap: fixture(), format: 'square', background: 'custom' }, undefined, true);
  const overlay = state.canvases.at(-1);
  assert.equal(overlay.grades, 0); assert.equal(overlay.draws.length, 1, 'Only the logo is raster imagery in the anonymous foreground');
  assert(overlay.fills.every(fill => typeof fill.style === 'object'), 'Foreground does not paint an opaque base over an animated photo');
});

test('missing fees and unloaded amount font fail closed; anonymous and sample rendering retain disclosures', async t => {
  const state = installCanvasRecorder(t), input = { recap: fixture(), format: 'square', background: 'plain' };
  await assert.rejects(renderer.renderSessionRecap({ ...input, recap: { ...input.recap, fees: null } }), /reconcile fees/);
  assert.equal(state.canvases.length, 0);
  state.fonts.load = async font => font.includes('Instrument Serif') ? [] : [{}];
  await assert.rejects(renderer.renderSessionRecap(input), /font could not be loaded/);
  assert.equal(state.canvases.length, 0, 'No fallback-font artifact created');
  state.fonts.load = async () => [{}];
  const sample = { ...input.recap, fees: null, sample: true, hotStreak: null };
  await renderer.renderSessionRecap({ ...input, recap: sample });
  const canvas = state.canvases.at(-1);
  assert.equal(canvas.arcs.length, 0, 'Anonymous export has no avatar');
  assert(!canvas.ink.some(item => item.value.includes('@') || item.value.includes('HOT STREAK')));
  assert(canvas.ink.some(item => item.value === 'Sample data · Not a live account' && item.y === layouts.square.sample));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(renderer.renderSessionRecap(input, controller.signal), /Render cancelled/);
});

function rule(selector, condition) {
  let result;
  css.walkRules(item => { if (item.selector === selector && (condition ? item.parent.params === condition : item.parent.type === 'root')) result = item; });
  assert(result, 'Rule exists: ' + selector);
  return Object.fromEntries(result.nodes.filter(item => item.type === 'decl').map(item => [item.prop, item.value]));
}
test('editor styles remain scoped, keyboard-visible, touch-sized, scrollable and responsive', () => {
  css.walkRules(item => { for (const selector of postcss.list.comma(item.selector)) assert(selector.startsWith('.recap-'), 'No global selector leakage: ' + selector); });
  assert.equal(rule('.recap-dialog button')['min-height'], '44px');
  assert.match(rule('.recap-dialog :is(button, select, input, summary):focus-visible').outline, /2px solid/);
  assert.equal(rule('.recap-editor:focus-visible')['outline-offset'], '-4px', 'Crop focus stays visible within clipped stage');
  assert.equal(rule('.recap-body', '(max-width: 820px)')['grid-template-columns'], 'minmax(0, 1fr)');
  assert.equal(rule('.recap-stage', '(max-width: 820px)').position, 'relative');
  assert.equal(rule('.recap-field select', '(max-width: 820px)')['font-size'], '16px', 'Mobile selects avoid focus zoom');
  const media = []; css.walkAtRules('media', item => media.push(item.params));
  for (const query of ['(prefers-reduced-motion: reduce)', '(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)', '(forced-colors: active)']) assert(media.includes(query), query);
  const dialog = css.nodes.find(item => item.type === 'rule' && item.selector === '.recap-dialog');
  const properties = Object.fromEntries(dialog.nodes.filter(item => item.type === 'decl').map(item => [item.prop, item.value]));
  assert.equal(properties.overflow, 'auto'); assert.match(properties['max-height'], /100dvh/);
  assert.equal(rule('.recap-stage .recap-editor img')['pointer-events'], 'none');
  assert.equal(rule('.recap-stage .recap-still-proof').display, 'none');
});
