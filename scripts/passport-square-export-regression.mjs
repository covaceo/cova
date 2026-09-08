import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const require = createRequire(import.meta.url);
const library = new URL('../src/lib/passportSquare.ts', import.meta.url);
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const unxml = value => value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => entity[0] === '#' ? String.fromCodePoint(parseInt(entity.slice(entity[1] === 'x' ? 2 : 1), entity[1] === 'x' ? 16 : 10)) : ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[entity]);

// Browser XML primitives only, not a second renderer. This deliberately small
// parser supports the actual React SSR source fixture; parser failures surface
// as parsererror, as DOMParser does. Native parsing/raster pixels need browser QA.
class Element {
  constructor(tag, attrs = {}) { this.localName = this.tagName = tag; this.attrs = attrs; this.children = []; this.parts = []; this.namespaceURI = 'http://www.w3.org/2000/svg'; }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  get textContent() { return this.parts.map(part => typeof part === 'string' ? part : part.textContent).join(''); }
  set textContent(value) { this.parts = [String(value)]; this.children = []; }
  get parentElement() { return this.parentNode ?? null; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode.parts = this.parentNode.parts.filter(node => node !== this); } this.parentNode = null; }
  cloneNode(deep) { const clone = new Element(this.localName, { ...this.attrs }); if (deep) clone.parts = this.parts.map(part => { if (typeof part === 'string') return part; const child = part.cloneNode(true); child.parentNode = clone; clone.children.push(child); return child; }); return clone; }
  xml() { return `<${this.localName}${Object.entries(this.attrs).map(([name, value]) => ` ${name}="${xml(value)}"`).join('')}>${this.parts.map(part => typeof part === 'string' ? xml(part) : part.xml()).join('')}</${this.localName}>`; }
  hasAttribute(name) { return name in this.attrs; }
  matches(selector) { return selector.split(',').some(item => { const match = item.trim().match(/^([\w*-]+)?(?:\.([\w-]+))?$/); return match && (!match[1] || match[1] === '*' || match[1] === this.localName) && (!match[2] || (this.attrs.class ?? '').split(/\s+/).includes(match[2])); }); }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
class DOMParserDouble {
  parseFromString(source, type) {
    assert.equal(type, 'image/svg+xml');
    const doc = new Element('#document');
    const stack = [doc];
    try {
      const tokens = source.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) ?? [];
      for (const token of tokens) {
        if (token.startsWith('<!--') || token.startsWith('<?')) continue;
        if (token.startsWith('</')) { if (stack.length === 1 || stack.pop().localName !== token.slice(2, -1).trim()) throw Error('closing tag'); }
        else if (token.startsWith('<')) {
          const name = token.match(/^<([\w:-]+)/)?.[1];
          if (!name) throw Error('tag');
          const attrs = {};
          let rest = token.slice(name.length + 1).replace(/\/?\s*>$/, '');
          rest = rest.replace(/\s+([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, key, a, b) => { if (key in attrs) throw Error('duplicate attribute'); attrs[key] = unxml(a ?? b); return ''; });
          if (rest.trim()) throw Error('attribute');
          const node = new Element(name, attrs), parent = stack.at(-1);
          parent.children.push(node); parent.parts.push(node); node.parentNode = parent;
          if (!token.endsWith('/>')) stack.push(node);
        } else { if (/&(?!#x[\da-f]+;|#\d+;|amp;|quot;|apos;|lt;|gt;)/i.test(token)) throw Error('entity'); stack.at(-1).parts.push(unxml(token)); }
      }
      if (stack.length !== 1 || doc.children.length !== 1) throw Error('root');
    } catch { doc.children = [new Element('parsererror')]; }
    doc.documentElement = doc.children[0];
    return doc;
  }
}
function compile(url, extra = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, ...extra }, { filename: url.pathname, timeout: 2000 });
  return module.exports;
}
const engraving = compile(new URL('../src/lib/passportEngraving.ts', import.meta.url));
const { PassportEtchedContent } = compile(new URL('../src/components/PassportEtchedContent.tsx', import.meta.url), {
  require(name) {
    if (name === '../lib/passportEngraving') return engraving;
    if (name.includes('?inline')) {
      const file = new URL(`../src/${name.slice(3).replace('?inline', '')}`, import.meta.url);
      return { default: `data:font/${name.includes('.woff2') ? 'woff2' : 'ttf'};base64,${readFileSync(file).toString('base64')}` };
    }
    return require(name);
  },
});
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZQAAAABJRU5ErkJggg==';
const defaultModel = { mode: 'flex', modeLabel: 'Flex', identity: 'Trader 6714', rank: 'Gold', marketLine: 'NQ / ES · 25 reviewed trades', heroValue: '+$1,008', heroLabel: 'Reported P&L', ruleSummary: '4/6 rules held', support: ['4/6 rules held · 1.11 profit factor · 2 flags'], provenance: 'Sample data · Not account verified', sample: true };
function fixture(model = {}, mutate = source => source, ink = '#302918') {
  const content = renderToStaticMarkup(createElement('svg', null, createElement(PassportEtchedContent, { model: { ...defaultModel, ...model }, id: 'holo-test', ink, mutedInk: '#443c29' }))).replace(/^<svg>|<\/svg>$/g, '');
  return { svg: mutate(`<svg xmlns="http://www.w3.org/2000/svg" class="passport-holo-art" viewBox="0 0 1672 941" width="1672" height="941" aria-label="STALE Trader 1111 NQ"><title>STALE identity</title><desc>STALE identity NQ markets</desc><metadata>STALE secrets</metadata><defs><clipPath id="old-material-mask"><path d="M 0 0 L 1 1"/></clipPath></defs><image href="${png}" width="1672" height="941" clip-path="url(#old-material-mask)"/>${content}</svg>`), width: 1672, height: 941 };
}
function harness(extra = {}) {
  assert.ok(existsSync(library), 'The native square renderer library must exist');
  return compile(library, { Blob, atob, DOMParser: DOMParserDouble, document: { get fonts() { throw Error('Snapshot must be synchronous, without font waits'); } }, ...extra });
}
const parse = svg => new DOMParserDouble().parseFromString(svg, 'image/svg+xml').documentElement;

test('actual capture API privacy round-trip retains light and dark engraving across available parent plates', () => {
  const captureApi = compile(new URL('../src/lib/passportShare.ts', import.meta.url), {
    XMLSerializer: class { serializeToString(node) { return node.xml(); } },
    getComputedStyle: () => ({ display: 'inline', visibility: 'visible', opacity: '1' }),
  });
  const api = harness();
  for (const hideIdentity of [false, true]) for (const hideMarkets of [false, true]) for (const ink of ['#302918', '#e8f0ff']) {
    const art = parse(fixture({ mode: 'coach', heroValue: '74', heroLabel: 'Control score', support: ['2 flags · 1.11 profit factor · 0.42R average', 'Top warning: Risk above plan'] }, undefined, ink).svg);
    const node = { dataset: { optics: 'fallback' }, querySelector: selector => selector === 'svg.passport-holo-art' ? art : null };
    const before = art.xml();
    const captured = captureApi.captureShareSnapshot(node, { hideIdentity, hideMarkets });
    const result = api.createSquareSnapshot(captured, png), root = parse(result.svg);
    assert.equal(art.xml(), before);
    assert.equal(root.querySelector('.passport-holo-identity').textContent, hideIdentity ? 'Private profile' : 'Trader 6714');
    assert.equal(root.querySelector('.passport-holo-market').textContent, hideMarkets ? '25 reviewed trades' : 'NQ / ES · 25 reviewed trades');
    assert.equal(root.querySelectorAll('.passport-holo-support').length, 2);
    assert.equal(root.querySelectorAll('feOffset').length, ink === '#e8f0ff' ? 1 : 0);
    assert.doesNotMatch(root.querySelector('desc').textContent, /STALE|Trader 1111/);
  }
  // Material files belong to the parent. When present, exercise their actual
  // bytes; the isolated renderer's regression also runs before assets arrive.
  for (const name of ['neutral', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'market-maker']) {
    const file = new URL(`../src/assets/passport-square-${name}-material.webp`, import.meta.url);
    if (!existsSync(file)) continue;
    const material = `data:image/webp;base64,${readFileSync(file).toString('base64')}`;
    assert.equal(parse(api.createSquareSnapshot(fixture(), material).svg).querySelector('image').getAttribute('href'), material, name);
  }
});

const presets = [{ id: 'square', width: 1080, height: 1080 }, { id: 'feed', width: 1080, height: 1350 }, { id: 'story', width: 1080, height: 1920 }, { id: 'card', width: 1672, height: 941 }];
function paintHarness(options = {}) {
  const paints = [], canvases = [], created = [], revoked = [], images = [];
  let fontReads = 0;
  const context = {
    fillStyle: '',
    fillRect(...args) { paints.push({ op: 'fillRect', args, fill: this.fillStyle }); },
    drawImage(_image, ...args) { if (options.drawError) throw Error('Draw failure'); paints.push({ op: 'drawImage', args }); },
    fillText() { throw Error('Never add repeated technical poster disclaimers'); },
  };
  const api = harness({
    document: {
      get fonts() { fontReads++; return { ready: options.ready ?? Promise.resolve() }; },
      createElement(tag) {
        assert.equal(tag, 'canvas', 'No anchor creation or downloads in the renderer');
        if (options.canvasError) throw Error('Canvas allocation failure');
        const canvas = { width: 0, height: 0, getContext(type) { assert.equal(type, '2d'); return options.noContext ? null : context; }, toBlob(callback, type) {
          this.encodedSize = [this.width, this.height];
          if (options.encoderError) throw Error('Encoder failure');
          // Explicit test envelope, NOT fabricated PNG pixels. Native PNG QA is
          // the parent's browser lane; this proves the real compositor's calls.
          queueMicrotask(() => callback(options.noBlob ? null : new Blob(['canvas-test-envelope'], { type: options.wrongBlob ? 'image/jpeg' : type })));
        } };
        canvases.push(canvas); return canvas;
      },
    },
    Image: class {
      constructor() { if (options.constructorError) throw Error('Image construction failure'); this.naturalWidth = this.naturalHeight = options.emptyImage ? 0 : 1080; images.push(this); }
      set src(url) { if (options.srcError) throw Error('Image source failure'); this.url = url; queueMicrotask(() => options.imageError ? this.onerror?.() : this.onload?.()); }
      decode() { return options.decodeError ? Promise.reject(Error('Decode failure')) : Promise.resolve(); }
      removeAttribute(name) { assert.equal(name, 'src'); this.removedSrc = true; }
    },
    URL: { createObjectURL(blob) { if (options.urlError) throw Error('URL allocation failure'); const url = `blob:square-test-${created.length}`; created.push({ url, blob }); return url; }, revokeObjectURL(url) { revoked.push(url); } },
  });
  return { api, paints, canvases, created, revoked, images, get fontReads() { return fontReads; } };
}

test('decoder/encoder failures propagate and every created URL/image/canvas releases in finally', async () => {
  const scenarios = [[{ decodeError: true }, /Decode failure/], [{ emptyImage: true }, /could not be rendered/], [{ imageError: true }, /could not be rendered/], [{ noContext: true }, /canvas is unavailable/], [{ noBlob: true }, /could not be encoded/], [{ wrongBlob: true }, /could not be encoded/], [{ encoderError: true }, /Encoder failure/], [{ drawError: true }, /Draw failure/], [{ srcError: true }, /Image source failure/], [{ constructorError: true }, /Image construction failure/], [{ canvasError: true }, /Canvas allocation failure/], [{ urlError: true }, /URL allocation failure/], [{}, null]];
  for (const [options, error] of scenarios) {
    const h = paintHarness(options), snapshot = h.api.createSquareSnapshot(fixture(), png);
    const result = h.api.composeSquareSharePng(snapshot, presets[0], 'studio');
    if (error) await assert.rejects(result, error); else await result;
    assert.deepEqual(h.revoked, h.created.map(item => item.url));
    for (const canvas of h.canvases) assert.deepEqual([canvas.width, canvas.height], [0, 0]);
    for (const image of h.images) { assert.equal(image.onload, null); assert.equal(image.onerror, null); assert.equal(image.removedSrc, true); }
  }
});

test('async composition freezes values at invocation and font failure allocates no resources', async () => {
  let release;
  const h = paintHarness({ ready: new Promise(resolve => { release = resolve; }) });
  const snapshot = { ...h.api.createSquareSnapshot(fixture({ identity: 'Private profile', marketLine: '25 reviewed trades' }), png) };
  const original = snapshot.svg, preset = { ...presets[1] };
  const result = h.api.composeSquareSharePng(snapshot, preset, 'slate');
  snapshot.svg = 'MUTATED private identity NQ'; snapshot.width = 12; preset.width = 12; preset.height = 12; preset.id = 'card';
  release(); await result;
  assert.equal(await h.created[0].blob.text(), original); assert.deepEqual(h.canvases[0].encodedSize, [1080, 1350]);
  const failed = paintHarness({ ready: Promise.reject(Error('Fonts unavailable')) });
  await assert.rejects(failed.api.composeSquareSharePng(failed.api.createSquareSnapshot(fixture(), png), presets[0], 'clean'), /Fonts unavailable/);
  assert.equal(failed.created.length + failed.images.length + failed.canvases.length, 0);
});

test('invalid dimensions/background/square snapshots reject before font reads or allocation', async () => {
  for (const [width, height] of [[0, 1080], [-1, 1080], [1080.1, 1080], [NaN, 1080], [1080, Infinity], ['1080', 1080], [4097, 1], [3000, 3000]]) {
    const h = paintHarness(), snapshot = h.api.createSquareSnapshot(fixture(), png);
    await assert.rejects(h.api.composeSquareSharePng(snapshot, { id: 'square', width, height }, 'studio'), /Invalid export dimensions/);
    assert.equal(h.fontReads, 0); assert.equal(h.created.length + h.canvases.length + h.images.length, 0);
  }
  const h = paintHarness(), snapshot = h.api.createSquareSnapshot(fixture(), png);
  await assert.rejects(h.api.composeSquareSharePng(snapshot, presets[0], 'external'), /Invalid share background/);
  for (const corrupt of [{ ...snapshot, width: 1672 }, { ...snapshot, height: 941 }, { ...snapshot, svg: '<svg/>' }, { ...snapshot, svg: snapshot.svg.replace('</svg>', '<script>alert(1)</script></svg>') }, { ...snapshot, svg: snapshot.svg.replace(png, 'https://evil.test/a.png') }]) await assert.rejects(h.api.composeSquareSharePng(corrupt, presets[0], 'studio'), /Invalid|unsafe/);
  assert.equal(h.fontReads, 0); assert.equal(h.created.length + h.canvases.length + h.images.length, 0);
});

test('PNG composition uses full-bleed studio square, tightly inset slate/clean and contained portrait/card', async () => {
  for (const background of ['studio', 'slate', 'clean']) for (const preset of presets) {
    const h = paintHarness();
    assert.equal(typeof h.api.composeSquareSharePng, 'function', 'The square PNG composition API must exist');
    const snapshot = h.api.createSquareSnapshot(fixture(), png);
    const blob = await h.api.composeSquareSharePng(snapshot, preset, background);
    assert.equal(blob.type, 'image/png');
    assert.deepEqual(h.canvases[0].encodedSize, [preset.width, preset.height]);
    const draws = h.paints.filter(paint => paint.op === 'drawImage');
    assert.equal(draws.length, 1);
    const [x, y, width, height] = draws[0].args;
    assert.equal(width, height, 'Never stretch the square vector into another ratio');
    assert.ok(x >= 0 && y >= 0 && x + width <= preset.width && y + height <= preset.height);
    const full = background === 'studio' && preset.width === preset.height;
    if (full) assert.deepEqual(draws[0].args, [0, 0, 1080, 1080]);
    else assert.ok(width / Math.min(preset.width, preset.height) >= 0.95 && width / Math.min(preset.width, preset.height) < 1, 'Tightly contained, not a small poster card');
    if (background === 'clean') assert.equal(h.paints[0].fill, '#e8e9ed');
    if (background === 'slate') assert.equal(h.paints[0].fill, '#1b2230');
    assert.equal(await h.created[0].blob.text(), snapshot.svg, 'Composition uses the immutable actual square vector');
    assert.deepEqual(h.revoked, h.created.map(item => item.url));
    assert.deepEqual([h.canvases[0].width, h.canvases[0].height], [0, 0]);
  }
});

test('malformed, active, external, incomplete or hidden SVG fails closed before rebuilding any proof', () => {
  const api = harness(), source = fixture();
  const mutations = [
    s => s.replace('</svg>', ''),
    s => '<!DOCTYPE svg [<!ENTITY secret SYSTEM "file:///private">]>' + s,
    s => '<?xml-stylesheet href="https://evil.test/a.css"?>' + s,
    s => s.replace('</svg>', '<script>alert(1)</script></svg>'),
    s => s.replace('</svg>', '<foreignObject><div>unsafe</div></foreignObject></svg>'),
    s => s.replace('<image ', '<image onload="alert(1)" '),
    s => s.replace(png, 'https://evil.test/material.png'),
    s => s.replace('<svg ', '<svg xml:base="https://evil.test/" '),
    s => s.replace('<style>', '<style>@import "https://evil.test/font.css";'),
    s => s.replace('data:font/woff2;base64,', 'https://evil.test/font?'),
    s => s.replace('<style>', '<style>text{display:none}'),
    s => s.replace('<style>', '<style>@font-face{src:u\\72l(https://evil.test/font)}'),
    s => s.replace('<feGaussianBlur ', '<feImage href="https://evil.test/a"/><feGaussianBlur '),
    s => s.replace('stdDeviation="0.65"', 'stdDeviation="999999"'),
    s => s.replace('</feDistantLight>', 'HIDDEN_ETCH_METADATA</feDistantLight>'),
    s => s.replace('filter="url(#holo-test-glyph-etch)"', 'filter="url(https://evil.test/f)"'),
    s => s.replace('class="passport-holo-identity"', 'class="passport-holo-identity" display="none"'),
    s => s.replace('style="user-select:text"', 'style="opacity:0"'),
    s => s.replace('class="passport-holo-identity"', 'class="passport-holo-identity" transform="translate(9000)"'),
    s => s.replace('</svg>', '<text class="unexpected-proof">Unmapped field</text></svg>'),
    s => s.replace('xmlns="http://www.w3.org/2000/svg"', 'xmlns="https://evil.test/svg"'),
  ];
  for (const mutate of mutations) assert.throws(() => api.createSquareSnapshot({ ...source, svg: mutate(source.svg) }, png), /Invalid|Missing|Unsafe|Unsupported/, mutate.toString());
  for (const cls of ['passport-etched-signature', 'passport-etched-rank', 'passport-holo-identity', 'passport-holo-hero-value', 'passport-holo-hero-label', 'passport-holo-market', 'passport-holo-support', 'passport-etched-website', 'passport-holo-disclosure']) {
    const pattern = new RegExp(`<text class="${cls}"[^>]*>[\\s\\S]*?<\\/text>`, 'g');
    assert.throws(() => api.createSquareSnapshot({ ...source, svg: source.svg.replace(pattern, '') }, png), /Invalid|Missing/, cls);
    assert.throws(() => api.createSquareSnapshot({ ...source, svg: source.svg.replace(pattern, match => match.replace(/>[^<]*<\/text>/, '>   </text>')) }, png), /Invalid|Missing/, `empty ${cls}`);
    if (cls !== 'passport-holo-support') assert.throws(() => api.createSquareSnapshot({ ...source, svg: source.svg.replace(pattern, match => match + match) }, png), /Invalid|Missing/, `duplicate ${cls}`);
  }
  for (const values of [{ width: 1080 }, { height: 1080 }, { svg: '' }, { svg: '<svg/>' }, { svg: 'A'.repeat(32 * 1024 * 1024 + 1) }]) assert.throws(() => api.createSquareSnapshot({ ...source, ...values }, png), /Invalid|Missing/);
  assert.throws(() => api.createSquareSnapshot(fixture({ heroValue: 'W'.repeat(65) }), png), /Invalid.*text/);
});

test('square material accepts only bounded inline PNG/WebP with square raster headers', () => {
  const api = harness(), source = fixture();
  const webp = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  assert.equal(parse(api.createSquareSnapshot(source, webp).svg).querySelector('image').getAttribute('href'), webp);
  const nonsquare = Buffer.from(png.split(',')[1], 'base64'); nonsquare.writeUInt32BE(2, 16);
  const huge = Buffer.from(nonsquare); huge.writeUInt32BE(5000, 16); huge.writeUInt32BE(5000, 20);
  for (const material of ['', null, 'https://example.test/material.webp', '//example.test/a.png', 'blob:material', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,INVALID', 'data:image/webp;base64,' + Buffer.from('<svg/>').toString('base64'), 'data:image/png;base64,' + nonsquare.toString('base64'), 'data:image/png;base64,' + huge.toString('base64'), 'data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024).toString('base64'), 'data:image/png;base64,' + 'A'.repeat(24 * 1024 * 1024)]) {
    assert.throws(() => api.createSquareSnapshot(source, material), /Invalid square material/, String(material).slice(0, 80));
  }
});

test('native square reflows actual redacted etched content, retaining embedded fonts and light pose', () => {
  const api = harness();
  assert.equal(typeof api.createSquareSnapshot, 'function');
  const source = fixture({ identity: 'Private profile', marketLine: '25 reviewed trades' });
  const before = source.svg;
  const result = api.createSquareSnapshot(source, png);
  assert.equal(typeof result.then, 'undefined');
  assert.ok(Object.isFrozen(result));
  assert.equal(result.width, 1080); assert.equal(result.height, 1080);
  assert.equal(source.svg, before);
  const root = parse(result.svg);
  assert.equal(root.getAttribute('viewBox'), '0 0 1080 1080');
  const image = root.querySelector('image');
  assert.equal(image.getAttribute('href'), png);
  assert.equal(image.getAttribute('width'), '1080'); assert.equal(image.getAttribute('height'), '1080');
  assert.equal(root.querySelectorAll('image').length, 1);
  assert.equal(root.querySelector('clipPath'), null);
  assert.doesNotMatch(result.svg.replace(/<style>[\s\S]*?<\/style>/g, ''), /STALE|Trader 1111|NQ|old-material-mask|1672|941/);
  const original = parse(source.svg);
  assert.equal(root.querySelector('style').textContent, original.querySelector('style').textContent);
  assert.equal(root.querySelector('feDistantLight').getAttribute('azimuth'), original.querySelector('feDistantLight').getAttribute('azimuth'));
  assert.equal(root.querySelector('filter').getAttribute('width'), '1080');
  for (const node of original.querySelectorAll('text')) assert.equal(root.querySelector(`.${node.getAttribute('class')}`).textContent, node.textContent);
  assert.ok(root.querySelector('.passport-profile-hero-stat'));
  for (const [selector, x, y] of [['.passport-etched-signature', 88, 150], ['.passport-etched-rank', 90, 198], ['.passport-holo-identity', 88, 570], ['.passport-holo-hero-value', 84, 728], ['.passport-holo-hero-label', 90, 792], ['.passport-holo-market', 90, 859], ['.passport-holo-support', 90, 960], ['.passport-etched-website', 1004, 1018], ['.passport-holo-disclosure', 92, 1018]]) {
    const node = root.querySelector(selector); assert.equal(node.getAttribute('x'), String(x)); assert.equal(node.getAttribute('y'), String(y));
  }
  const visible = root.querySelectorAll('text').map(node => node.textContent).join('. ');
  assert.equal(root.querySelector('desc').textContent, visible);
  assert.equal(root.getAttribute('aria-label'), visible);
});

test('Discipline and Coach retain every support row with width-safe live glyphs and a clear footer', () => {
  const api = harness();
  for (const mode of ['discipline', 'coach', 'private', 'flex']) {
    const source = fixture({ mode, identity: 'W'.repeat(32), marketLine: 'MICRO E-MINI NASDAQ / S&P · 1,250 reviewed trades', heroValue: '+$123,456,789.99', heroLabel: 'Control score', support: ['4/6 rules held · 0.42R average', 'Top warning: ' + 'W'.repeat(59)] });
    const result = api.createSquareSnapshot(source, png), root = parse(result.svg), original = parse(source.svg);
    const support = root.querySelectorAll('.passport-holo-support');
    assert.deepEqual(support.map(node => node.textContent), original.querySelectorAll('.passport-holo-support').map(node => node.textContent));
    assert.equal(new Set(support.map(node => node.getAttribute('y'))).size, support.length, 'Support baselines must not overlap');
    for (const node of root.querySelectorAll('text')) {
      const x = Number(node.getAttribute('x')), width = Number(node.getAttribute('textLength')), y = Number(node.getAttribute('y')), size = Number(node.getAttribute('font-size'));
      assert.ok(width > 0, `${node.getAttribute('class')} needs an explicit bounded glyph advance`);
      const left = node.getAttribute('text-anchor') === 'end' ? x - width : x;
      assert.ok(left >= 68 && left + width <= 1012, 'All glyph advances stay inside the foil');
      assert.ok(y - size >= 35 && y + size * 0.25 <= 1045, 'No vertical clipping');
    }
    const disclosure = root.querySelector('.passport-holo-disclosure'), website = root.querySelector('.passport-etched-website');
    assert.ok(Number(disclosure.getAttribute('x')) + Number(disclosure.getAttribute('textLength')) + 40 < Number(website.getAttribute('x')) - Number(website.getAttribute('textLength')), 'Disclosure must clear website');
    assert.ok(Math.max(...support.map(node => Number(node.getAttribute('y')))) + 25 < Number(disclosure.getAttribute('y')) - Number(disclosure.getAttribute('font-size')), 'Proof must clear the disclosure');
  }
});
