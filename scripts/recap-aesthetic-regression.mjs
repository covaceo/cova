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
 wide: { height: 580, head: 78, amount: 319, font: 126, sample:564, fade:[0,580] },
 story: { height:1920, head:112, amount:1395, font:202, sample:1860, fade:[760,1470] },
 feed: { height:1350, head:100, amount:920, font:192, sample:1320, fade:[348,1012] },
 square: { height:1080, head:90, amount:680, font:182, sample:1050, fade:[170,770] },
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
          return { width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width + 2, actualBoundingBoxAscent: size * .72, actualBoundingBoxDescent: size * .2 };
        },
        fillText(value, x, y) { canvas.ink.push({ value, x, y, font: this.font, align: this.textAlign, color: this.fillStyle, spacing: this.letterSpacing, shadowColor: this.shadowColor, shadowBlur: this.shadowBlur, shadowOffsetX: this.shadowOffsetX, shadowOffsetY: this.shadowOffsetY, clips: structuredClone(this.activeClips), ...this.measureText(value) }); },
        drawImage(image, ...rect) { canvas.draws.push({ source: image.source, rect }); },
        fillRect(...rect) { canvas.fills.push({ style: this.fillStyle, rect }); },
        createLinearGradient(...rect) { const gradient = { type: 'linear', rect, stops: [], addColorStop(at, color) { this.stops.push([at, color]); } }; canvas.gradients.push(gradient); return gradient; },
        createRadialGradient(...rect) { const gradient = this.createLinearGradient(...rect); gradient.type = 'radial'; return gradient; },
        getImageData() { canvas.grades++; return { data: new Uint8ClampedArray([10, 20, 30, 255]) }; },
        putImageData() {}, fill() {}, beginPath() { path.length = 0; },
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
    { id: 'wide', label: 'Recap', width:1080, height:580 },
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

test('PNG and GIF foreground composition use the same default signed-money rendering with the same privacy setting', () => {
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
  for (const [call, expected] of [[foreground, ['recap', 'format', 'background', 'username', 'avatar', 'showPnl', 'verificationCurrent']], [normal, ['recap', 'format', 'background', 'customPhoto', 'transform', 'username', 'avatar', 'showPnl', 'verificationCurrent']]]) {
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

test('all formats preserve exact net money, sign treatment, truthful metrics, privacy and actual branding', async t => {
 const state=installCanvasRecorder(t);
 for(const [format,layout] of Object.entries(layouts)) for(const cents of ['62766','-1000','0','9007199254740991','-9007199254740991']) {
  const recap=fixture(cents), before=structuredClone(recap);
  await renderer.renderSessionRecap({recap,format,background:'plain'});
  assert.deepEqual(recap,before);
  const canvas=state.canvases.at(-1), ink=canvas.ink;
  assert.deepEqual([canvas.width,canvas.height],[1080,layout.height]);
  const money=ink.filter(x=>x.value===recapMoney(cents));assert(money.length);
  assert.equal(money[0].x,56);assert.equal(money[0].align,'left');assert.equal(money[0].y,layout.amount);
  assert(money[0].width <= (format==='wide'?640:968));
  assert.match(money[0].font,/400 .*Instrument Serif/);
  assert.deepEqual(money.map(x=>x.color),BigInt(cents)>0n?['#76d5ad','#f4f5f6']:[BigInt(cents)<0n?'#fdb6b5':'#f4f5f6']);
  assert(money.every(x=>x.shadowBlur===0));
  for(const label of ['Daily recap','Trade entries','4','Win rate','75%','NET P&L · USD']) assert(ink.some(x=>x.value===label),label);
  assert(!ink.some(x=>/HOT STREAK|R multiple|Net return|Return unavailable|capital|SESSION RECAP|UTC close date|\(gross\)|\(reported\)/.test(x.value)));
  assert.equal(ink.find(x=>x.value==='Trade entries').x,56);assert.equal(ink.find(x=>x.value==='Win rate').x,316);
  const logo=canvas.draws.find(x=>x.source.includes('wordmark'));assert.equal(logo.rect[0],56);assert.equal(logo.rect[2],182);
  for(const foregroundOnly of [false,true]) {
   await renderer.renderSessionRecap({recap,format,background:foregroundOnly?'custom':'plain',showPnl:false},undefined,foregroundOnly);
   const hidden=state.canvases.at(-1).ink.map(x=>x.value);
   assert(hidden.includes('P&L HIDDEN'));assert(!hidden.some(x=>/\$|627|1000|900719/.test(x)));
  }
 }
 const reported={...fixture(),fees:null,basis:'Reported P&L · fees unconfirmed'};
 await renderer.renderSessionRecap({recap:reported,format:'wide',background:'plain'});
 assert(state.canvases.at(-1).ink.some(x=>x.value==='REPORTED P&L · USD · FEES UNCONFIRMED'));
});

test('identity right edge follows the date in all formats with short, long and hidden names', async t => {
 const state=installCanvasRecorder(t);
 for(const format of renderer.recapFormats.map(f=>f.id)) for(const username of ['a','recap_qa','a_very_long_valid_username_123456','x'.repeat(200),null]) {
  await renderer.renderSessionRecap({recap:fixture(),format,background:'plain',username});
  const c=state.canvases.at(-1),date=c.ink.find(i=>i.value===fixture().dateLabel),identity=c.ink.find(i=>i.value.startsWith('@'));
  assert.equal(date.x,1024);assert.equal(date.align,'right');
  if(!username){assert.equal(identity,undefined);assert.equal(c.arcs.length,0);continue;}
  assert.equal(identity.x,date.x);assert.equal(identity.align,'right');assert(identity.width<=360);
  const avatar=c.arcs[0];assert.equal(avatar[0]+20,identity.x-identity.width-10);assert.equal(avatar[1],identity.y-10);
  assert(avatar[0]-20>306,'Avatar cannot overlap website even with long names');
  assert.equal(identity.y,({wide:535,story:1780,feed:1260,square:1000})[format],'Existing bottom placement retained');
 }
});

test('curated, custom, plain and foreground-only paths retain crop and black fade contracts', async t => {
  const state = installCanvasRecorder(t);
  for (const [format, layout] of Object.entries(layouts)) for (const background of [...renderer.recapBackgrounds.map(item => item.id), 'custom']) {
    const input = { recap: fixture(), format, background, customPhoto: 'data:image/jpeg;base64,custom', transform: { zoom: 2, x: .4, y: -.2 } };
    await renderer.renderSessionRecap(input);
    const canvas = state.canvases.at(-1);
    if (background === 'plain') { assert.equal(canvas.gradients.length, 0); assert.equal(canvas.fills[0].style, '#000'); continue; }
    if (format === 'wide') { assert(canvas.gradients.some(g=>g.type==='linear'&&g.rect.join() === '0,0,1080,0')); continue; }
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

test('one identical badge renderer for broker and owner approval; long markets and hidden identity/money remain safe',async t=>{
 const {canvases}=installCanvasRecorder(t);
 for(const format of Object.keys(layouts))for(const basis of ['tradovate','owner-approved'])for(const hidden of [false,true]){
  const now=Date.now();const recap={...fixture(),markets:'MNQ · ES · NQ · MES · A VERY LONG INSTRUMENT NAME',verification:{owner:'synthetic-owner',basis,accountId:'7',connectionId:basis==='tradovate'?'synthetic-connection':'',checkedAt:now,expiresAt:now+30000}};
  await renderer.renderSessionRecap({recap,format,background:'plain',username:hidden?null:'long_profile_username_abcdefgh',showPnl:!hidden});
  const c=canvases.at(-1),badge=c.ink.find(i=>i.value==='Verified trade'),market=c.ink.find(i=>i.value.startsWith('MNQ'));
  assert(badge);assert.equal(badge.x,1024);assert.equal(badge.color,'#b9ddff');assert(market.y<badge.y,'Badge sits in footer above identity');const center=({wide:535,story:1780,feed:1260,square:1000})[format]-55;assert.equal(badge.y+(badge.actualBoundingBoxDescent-badge.actualBoundingBoxAscent)/2,center,'Measured glyph center aligns with badge');assert.equal(badge.align,'right');assert(c.arcs.some(a=>a[2]===8&&a[1]===center&&a[0]===1024-badge.width-18),'Icon stays adjacent to fitted right-aligned text');
  assert.equal(c.arcs.filter(a=>a[2]===3).length,8,'Same light-blue scalloped check');
  assert.equal(c.ink.some(i=>i.value.includes('$')),!hidden);assert(!c.ink.some(i=>/owner-approved|Tradovate|lino@/.test(i.value)),'No special-account qualifier or private email on image');
 }
});
