import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const library = new URL('../src/lib/passportShare.ts', import.meta.url);
const escapeXml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Only browser primitives are doubled. The actual TypeScript library executes
// in an isolated VM; the doubles serialize real clone edits and record paints.
class Element {
  constructor(tag, attributes = {}, children = []) {
    this.tagName = this.localName = tag;
    this.attrs = { ...attributes };
    this.children = [];
    this.style = {};
    this.computed = {};
    this._text = '';
    if (typeof children === 'string') this._text = children;
    else children.forEach(child => this.appendChild(child));
  }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = value; this.children = []; }
  get parentElement() { return this.parentNode; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  hasAttribute(name) { return name in this.attrs; }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  matches(selector) {
    return selector.split(',').some(part => {
      part = part.trim();
      if (part === '*') return true;
      const match = part.match(/^([\w-]+)?(?:\.([\w-]+))?$/);
      return match && (!match[1] || this.tagName === match[1]) && (!match[2] || (this.attrs.class ?? '').split(' ').includes(match[2]));
    });
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  cloneNode(deep) {
    const clone = new Element(this.tagName, this.attrs, deep ? this.children.map(child => child.cloneNode(true)) : []);
    clone._text = this._text;
    clone.style = { ...this.style };
    return clone;
  }
  xml() {
    return `<${this.tagName}${Object.entries(this.attrs).map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join('')}>${escapeXml(this._text)}${this.children.map(child => child.xml()).join('')}</${this.tagName}>`;
  }
}
const el = (tag, attrs, children) => new Element(tag, attrs, children);
function fixture({ optics = 'ready', market = 'NQ / ES · 25 reviewed trades', identity = 'Trader 6714' } = {}) {
  let frame = 'data:image/png;base64,FRAME_AT_CLICK';
  let captures = 0;
  const art = el('svg', { class: 'passport-holo-art', viewBox: '0 0 1672 941', 'aria-labelledby': 'title description' }, [
    el('title', { id: 'title' }, 'Cova Risk Passport · Ghost'),
    el('desc', { id: 'description' }, 'STALE_HIDDEN Trader 6714. NQ / ES. +$9,999. Full untruncated private metadata.'),
    el('defs', {}, [el('filter', { id: 'glyph-etch', x: '230', y: '120', width: '1220', height: '710' }, [
      el('feDistantLight', { azimuth: '113.200', elevation: '56.700', 'data-engraving-light': 'true' }),
      el('feOffset', { dx: '1.120', dy: '-0.321', 'data-engraving-shadow': 'true' }),
    ])]),
    el('image', { href: 'data:image/webp;base64,BASE', x: '0', y: '0', width: '1672', height: '941', 'clip-path': 'url(#material-mask)', 'aria-hidden': 'true' }),
    el('g', { filter: 'url(#glyph-etch)', 'font-family': 'Cova UI, Arial, sans-serif', fill: '#27313c' }, [
      el('text', { class: 'passport-etched-signature', 'font-family': 'Cova Signature, cursive' }, 'Cova'),
      el('text', { class: 'passport-etched-rank' }, 'GOLD'),
      el('text', { class: 'passport-holo-identity', x: '271', y: '485', textLength: '560' }, identity),
      el('text', { class: 'passport-holo-market', x: '272', y: '698', textLength: '560', lengthAdjust: 'spacingAndGlyphs' }, market),
      el('text', { class: 'passport-holo-hero-value', x: '267', y: '606' }, '70+'),
      el('text', { class: 'passport-holo-hero-label' }, 'Score range'),
      el('text', { class: 'passport-holo-support' }, '4/6 rules held · 1.11 profit factor · 2 flags'),
    ]),
    el('text', { class: 'passport-holo-disclosure' }, 'Sample data · Not account verified'),
  ]);
  const canvas = { toDataURL(type) { assert.equal(type, 'image/png'); captures++; return frame; } };
  return {
    art, canvas,
    node: { dataset: { optics, passportMode: 'private' }, querySelector: selector => selector === 'svg.passport-holo-art' ? art : selector === 'canvas.passport-optics-canvas' ? canvas : null },
    setFrame(value) { frame = value; },
    get captures() { return captures; },
  };
}
function harness(extra = {}) {
  assert.ok(existsSync(library), 'A real privacy-safe share library must exist');
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(library, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const globals = {
    module, exports: module.exports, Blob,
    XMLSerializer: class { serializeToString(node) { return node.xml(); } },
    getComputedStyle: node => ({ display: 'inline', visibility: 'visible', opacity: '1', ...node.computed, ...node.style }),
    document: { createElementNS: (_ns, tag) => el(tag) },
    ...extra,
  };
  vm.runInNewContext(code, globals, { filename: 'passportShare.ts', timeout: 1000 });
  return module.exports;
}
const publicPrivacy = { hideIdentity: false, hideMarkets: false };
const presets = [
  { id: 'card', width: 1672, height: 941 },
  { id: 'feed', width: 1080, height: 1350 },
  { id: 'square', width: 1080, height: 1080 },
  { id: 'story', width: 1080, height: 1920 },
];
const disclosure = 'DEMO DATA · NOT ACCOUNT VERIFIED · LOCAL PNG · USER CONTROLLED';
function paintHarness({ imageError = false, noContext = false, noBlob = false, blobError = false, ready = Promise.resolve() } = {}) {
  const paints = [], gradients = [], canvases = [], created = [], revoked = [], images = [];
  const context = {
    fillStyle: '', font: '', textAlign: '', globalAlpha: 1,
    fillRect(...args) { paints.push({ op: 'fillRect', args, fill: this.fillStyle }); },
    drawImage(image, ...args) { paints.push({ op: 'drawImage', args }); },
    fillText(...args) { paints.push({ op: 'fillText', args, fill: this.fillStyle, font: this.font, align: this.textAlign }); },
    measureText(text) { return { width: text.length * Number.parseFloat(this.font) * 0.56 }; },
    save() { paints.push({ op: 'save' }); }, restore() { paints.push({ op: 'restore' }); },
    beginPath() { paints.push({ op: 'beginPath' }); },
    ellipse(...args) { paints.push({ op: 'ellipse', args }); },
    fill() { paints.push({ op: 'fill', fill: this.fillStyle }); },
    createLinearGradient(...args) { return gradient('linear', args); },
    createRadialGradient(...args) { return gradient('radial', args); },
  };
  function gradient(kind, args) {
    const value = { kind, args, stops: [], addColorStop(position, color) { this.stops.push([position, color]); } };
    gradients.push(value); return value;
  }
  const api = harness({
    document: {
      fonts: { ready }, createElementNS: (_ns, tag) => el(tag),
      createElement(tag) {
        assert.equal(tag, 'canvas', 'Composition may not create links or trigger a download');
        const canvas = { width: 0, height: 0, getContext(type) { assert.equal(type, '2d'); return noContext ? null : context; },
          toBlob(callback, type) {
            assert.equal(type, 'image/png');
            this.encodedSize = [this.width, this.height];
            if (blobError) throw new Error('Encoding failure');
            // A test envelope, not a rasterizer: actual PNG pixels need browser QA.
            queueMicrotask(() => callback(noBlob ? null : new Blob(['canvas-test-envelope'], { type })));
          },
        };
        canvases.push(canvas); return canvas;
      },
    },
    Image: class {
      constructor() { this.naturalWidth = 1672; this.naturalHeight = 941; images.push(this); }
      set src(url) { this.url = url; queueMicrotask(() => imageError ? this.onerror?.() : this.onload?.()); }
    },
    URL: {
      createObjectURL(blob) { const url = `blob:share-test-${created.length}`; created.push({ url, blob }); return url; },
      revokeObjectURL(url) { revoked.push(url); },
    },
  });
  return { api, paints, gradients, canvases, created, revoked, images };
}

test('clean composition returns exact PNG dimensions and the protected light exporter paint geometry', async () => {
  for (const preset of presets) {
    const h = paintHarness();
    assert.equal(typeof h.api.composeSharePng, 'function', 'Composition API must exist');
    const snapshot = h.api.captureShareSnapshot(fixture().node, publicPrivacy);
    const blob = await h.api.composeSharePng(snapshot, preset, 'clean', 'Gold');
    assert.ok(blob instanceof Blob);
    assert.equal(blob.type, 'image/png');
    assert.deepEqual(h.canvases[0].encodedSize, [preset.width, preset.height]);
    assert.deepEqual(h.paints[0], { op: 'fillRect', args: [0, 0, preset.width, preset.height], fill: '#e8e9ed' });
    const scale = Math.min(preset.width / 1672, preset.height / 941);
    assert.deepEqual(h.paints.find(paint => paint.op === 'drawImage').args, [(preset.width - 1672 * scale) / 2, (preset.height - 941 * scale) / 2, 1672 * scale, 941 * scale]);
    const text = h.paints.filter(paint => paint.op === 'fillText');
    assert.deepEqual(text, preset.id === 'card' ? [] : [{ op: 'fillText', args: [disclosure, preset.width / 2, preset.height - 70, preset.width - 80], fill: '#414b5b', font: '22px Arial, sans-serif', align: 'center' }]);
    assert.equal(h.gradients.length, 0, 'Clean is the exact light composition, not a new studio treatment');
    assert.equal(await h.created[0].blob.text(), snapshot.svg, 'Use the actual serialized face, never parallel stat recreation');
    assert.deepEqual(h.revoked, h.created.map(item => item.url));
  }
});

test('studio and slate fit the physical card at phone scale with a persistent readable disclosure', async () => {
  for (const background of ['studio', 'slate']) for (const preset of presets) {
    const h = paintHarness();
    const snapshot = h.api.captureShareSnapshot(fixture().node, publicPrivacy);
    await h.api.composeSharePng(snapshot, preset, background, 'Gold');
    assert.deepEqual(h.canvases[0].encodedSize, [preset.width, preset.height]);
    assert.equal(h.gradients.filter(item => item.kind === 'radial').length, 1, 'One rank-lit spotlight, not multiple decorative halos');
    assert.ok(h.gradients.some(item => item.kind === 'linear'), 'Authored dark studio base');
    assert.ok(h.paints.some(item => item.op === 'ellipse'), 'Soft contact shadow belongs below the physical card');
    assert.ok(h.paints.filter(item => item.op === 'fillRect').length > 50, 'Deterministic subtle surface texture');
    const draws = h.paints.filter(item => item.op === 'drawImage');
    assert.equal(draws.length, 1, 'One unmodified vector face; no duplicated card/etch layers');
    const [x, y, width, height] = draws[0].args;
    const scale = width / 1672;
    assert.ok(Math.abs(height / 941 - scale) < 1e-9, 'Never distort the etched glyphs');
    const physical = { left: x + 192 * scale, right: x + 1476 * scale, top: y + 85 * scale, bottom: y + 846 * scale };
    assert.ok(physical.left >= 0 && physical.right <= preset.width && physical.top >= 0 && physical.bottom <= preset.height, 'No physical card crop');
    const text = h.paints.filter(item => item.op === 'fillText');
    if (preset.id === 'card') {
      assert.deepEqual(draws[0].args, [0, 0, 1672, 941]);
      assert.equal(text.length, 0, 'Card already carries its exact approved sample disclosure');
    } else {
      const fraction = (physical.right - physical.left) / preset.width;
      assert.ok(fraction >= 0.88 && fraction <= 0.92, `Card width ${fraction} must use the physical bounds, not the transparent SVG margin`);
      assert.equal(text.map(item => item.args[0]).join(' · '), disclosure);
      assert.equal(text.length, 2);
      for (const item of text) {
        assert.ok(Number.parseFloat(item.font) >= 30, 'Disclosure must not shrink into an unreadable single line');
        assert.ok(item.args[2] > physical.bottom + 40 && item.args[2] < preset.height - 30);
        assert.equal(item.args[1], preset.width / 2);
      }
    }
    assert.deepEqual(h.revoked, h.created.map(item => item.url));
  }
});

test('dark backgrounds are repeatable and rank light stays cosmetic, with champagne Gold and red Ruby', async () => {
  const records = [];
  for (const [background, rank] of [['studio', 'Gold'], ['studio', 'Gold'], ['slate', 'Gold'], ['studio', 'Ruby'], ['studio', 'Market Maker'], ['studio', '__proto__']]) {
    const h = paintHarness();
    const snapshot = h.api.captureShareSnapshot(fixture().node, publicPrivacy);
    await h.api.composeSharePng(snapshot, presets[2], background, rank);
    records.push({ paints: JSON.stringify(h.paints), gradients: JSON.stringify(h.gradients), svg: await h.created[0].blob.text() });
  }
  assert.deepEqual(records[0], records[1], 'No time, random, or network dependent background');
  assert.notEqual(records[0].gradients, records[2].gradients, 'Slate has its own dark neutral treatment');
  assert.notEqual(records[0].gradients, records[3].gradients);
  assert.equal(records[3].gradients, records[4].gradients, 'Market Maker uses the Ruby light family');
  assert.match(records[0].gradients, /196, 169, 120/);
  assert.match(records[3].gradients, /202, 67, 88/);
  for (const record of records) assert.equal(record.svg, records[0].svg, 'Rank lights cannot change earned rank or vector glyphs');
});

test('invalid and excessive canvas dimensions reject before allocating URLs, images or canvases', async () => {
  for (const [width, height] of [[0, 941], [-1, 941], [1080.5, 1350], [NaN, 941], [1080, Infinity], ['1080', 1350], [4097, 941], [3000, 3000]]) {
    const h = paintHarness();
    const snapshot = h.api.captureShareSnapshot(fixture().node, publicPrivacy);
    await assert.rejects(h.api.composeSharePng(snapshot, { id: 'card', width, height }, 'studio', 'Gold'), /Invalid export dimensions/);
    assert.equal(h.created.length + h.images.length + h.canvases.length, 0);
  }
  const h = paintHarness();
  const snapshot = h.api.captureShareSnapshot(fixture().node, publicPrivacy);
  await assert.rejects(h.api.composeSharePng(snapshot, presets[0], 'remote-background', 'Gold'), /Invalid share background/);
  assert.equal(h.created.length, 0);
});

test('success and every render/encode failure release SVG URLs, image handlers and canvas memory', async () => {
  for (const [options, error] of [[{}, null], [{ imageError: true }, /could not be rendered/], [{ noContext: true }, /canvas is unavailable/], [{ noBlob: true }, /could not be encoded/], [{ blobError: true }, /Encoding failure/]]) {
    const h = paintHarness(options);
    const snapshot = h.api.captureShareSnapshot(fixture().node, publicPrivacy);
    const result = h.api.composeSharePng(snapshot, presets[0], 'clean', 'Gold');
    if (error) await assert.rejects(result, error); else await result;
    assert.equal(h.created.length, 1);
    assert.deepEqual(h.revoked, h.created.map(item => item.url));
    for (const canvas of h.canvases) assert.deepEqual([canvas.width, canvas.height], [0, 0], 'Release backing pixels after encoding or failure');
    for (const image of h.images) {
      assert.equal(image.onload, null);
      assert.equal(image.onerror, null);
    }
  }
});

test('composition never rereads live mode, privacy, engraving or a mutable preset after fonts settle', async () => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  const h = paintHarness({ ready });
  const f = fixture();
  const privacy = { hideIdentity: true, hideMarkets: true };
  const preset = { ...presets[1] };
  const snapshot = h.api.captureShareSnapshot(f.node, privacy);
  const result = h.api.composeSharePng(snapshot, preset, 'studio', 'Gold');
  preset.width = 12; preset.height = 12; preset.id = 'card';
  privacy.hideIdentity = privacy.hideMarkets = false;
  f.art.querySelector('.passport-holo-identity').textContent = 'LATER_IDENTITY';
  f.art.querySelector('.passport-holo-market').textContent = 'LATER_MARKET';
  f.art.querySelector('feDistantLight').setAttribute('azimuth', '999');
  f.setFrame('data:image/png;base64,LATER_FRAME');
  release();
  await result;
  assert.deepEqual(h.canvases[0].encodedSize, [1080, 1350]);
  assert.equal(h.paints.filter(item => item.op === 'fillText').length, 2);
  const svg = await h.created[0].blob.text();
  assert.match(svg, /Private profile/);
  assert.match(svg, /25 reviewed trades/);
  assert.match(svg, /FRAME_AT_CLICK/);
  assert.match(svg, /azimuth="113.200"/);
  assert.doesNotMatch(svg, /LATER_|NQ|Trader 6714|999/);
});

test('font readiness failure allocates no export resources', async () => {
  const h = paintHarness({ ready: Promise.reject(new Error('Fonts unavailable')) });
  const snapshot = h.api.captureShareSnapshot(fixture().node, publicPrivacy);
  await assert.rejects(h.api.composeSharePng(snapshot, presets[0], 'clean', 'Gold'), /Fonts unavailable/);
  assert.equal(h.created.length + h.images.length + h.canvases.length, 0);
});

test('independent privacy switches redact only cloned fields and rebuild every accessible description from visible glyphs', () => {
  const api = harness();
  for (const hideIdentity of [false, true]) for (const hideMarkets of [false, true]) {
    const f = fixture({ optics: 'fallback' });
    f.art.setAttribute('aria-label', 'STALE_HIDDEN Trader 6714 NQ / ES');
    f.art.querySelector('title').textContent = 'STALE_HIDDEN Trader 6714 NQ / ES';
    f.art.querySelector('.passport-holo-identity').setAttribute('aria-label', 'STALE_HIDDEN Trader 6714');
    f.art.appendChild(el('metadata', {}, 'STALE_HIDDEN Trader 6714 NQ / ES'));
    f.art.appendChild(el('g', { display: 'none' }, [el('text', {}, 'HIDDEN_ANCESTOR')]));
    const cssHidden = f.art.appendChild(el('text', {}, 'HIDDEN_CSS'));
    cssHidden.computed.visibility = 'hidden';
    const zeroOpacity = f.art.appendChild(el('g', {}, [el('text', {}, 'HIDDEN_OPACITY')]));
    zeroOpacity.computed.opacity = '0';
    const before = f.art.xml();
    const snapshot = api.captureShareSnapshot(f.node, { hideIdentity, hideMarkets });
    assert.equal(f.art.xml(), before);
    assert.equal(f.captures, 0, 'Fallback mode must not read an unavailable GPU');
    assert.match(snapshot.svg, /data:image\/webp;base64,BASE/);
    assert.doesNotMatch(snapshot.svg, /STALE_HIDDEN|HIDDEN_ANCESTOR|HIDDEN_CSS|HIDDEN_OPACITY/);
    assert.equal(snapshot.svg.includes('Trader 6714'), !hideIdentity);
    assert.equal(snapshot.svg.includes('Private profile'), hideIdentity);
    assert.equal(snapshot.svg.includes('NQ / ES'), !hideMarkets);
    assert.match(snapshot.svg, /25 reviewed trades/);
    const desc = snapshot.svg.match(/<desc[^>]*>(.*?)<\/desc>/)[1];
    assert.ok(desc.includes('Sample data · Not account verified'));
    assert.ok(desc.includes('70+'));
    assert.ok(desc.includes('4/6 rules held · 1.11 profit factor · 2 flags'));
    if (hideIdentity) assert.doesNotMatch(snapshot.svg, /class="passport-holo-identity"[^>]*textLength/);
    if (hideMarkets) assert.doesNotMatch(snapshot.svg, /class="passport-holo-market"[^>]*(?:textLength|lengthAdjust)/);
  }
});

test('market redaction keeps only an actual reviewed count, never a truncated market or guessed number', () => {
  const api = harness();
  for (const [market, expected] of [
    ['NQ · ES · 1,250 reviewed trades', '1,250 reviewed trades'],
    ['0 reviewed trades', '0 reviewed trades'],
    ['NQ · 1 reviewed trade', '1 reviewed trade'],
    ['MICRO E-MINI NASDAQ-100 SEPTEMBER 2026 / MICRO E-MINI S…', 'Markets hidden'],
  ]) {
    const snapshot = api.captureShareSnapshot(fixture({ market }).node, { hideIdentity: true, hideMarkets: true });
    assert.ok(snapshot.svg.includes(expected));
    assert.doesNotMatch(snapshot.svg, /NQ|NASDAQ|MICRO E-MINI|ES ·/);
  }
});

test('missing artwork fails synchronously and missing GPU canvas preserves the approved inline fallback', () => {
  const api = harness();
  assert.throws(() => api.captureShareSnapshot({ querySelector: () => null }, publicPrivacy), /artwork.*not ready/);
  const f = fixture();
  f.node.querySelector = selector => selector.startsWith('svg') ? f.art : null;
  assert.match(api.captureShareSnapshot(f.node, publicPrivacy).svg, /data:image\/webp;base64,BASE/);
});

test('snapshot synchronously freezes the actual mode, engraving and GPU frame without touching the live face', () => {
  const api = harness({ document: { get fonts() { throw new Error('Snapshot must not wait on fonts'); } } });
  const f = fixture();
  const before = f.art.xml();
  const snapshot = api.captureShareSnapshot(f.node, publicPrivacy);
  assert.equal(typeof snapshot.then, 'undefined');
  assert.ok(Object.isFrozen(snapshot));
  assert.equal(snapshot.width, 1672);
  assert.equal(snapshot.height, 941);
  assert.equal(f.art.xml(), before, 'Clone edits never reach the source SVG');
  assert.equal(f.captures, 1);
  f.setFrame('data:image/png;base64,LATER_FRAME');
  f.art.querySelector('.passport-holo-hero-value').textContent = '+$9,999';
  f.art.querySelector('feDistantLight').setAttribute('azimuth', '999');
  f.node.dataset.passportMode = 'flex';
  assert.match(snapshot.svg, /FRAME_AT_CLICK/);
  assert.match(snapshot.svg, /azimuth="113.200"/);
  assert.match(snapshot.svg, /dx="1.120" dy="-0.321"/);
  assert.match(snapshot.svg, /filter="url\(#glyph-etch\)"/);
  assert.match(snapshot.svg, /70\+/);
  assert.match(snapshot.svg, /Sample data · Not account verified/);
  assert.doesNotMatch(snapshot.svg, /LATER_FRAME|\+\$9,999|STALE_HIDDEN/);
});
