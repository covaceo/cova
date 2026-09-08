import type { ShareBackground, ShareSnapshot } from './passportShare';

/** Detached, privacy-redacted vector captured before any asynchronous work. */
export type SquareShareSnapshot = Readonly<{ svg: string; width: 1080; height: 1080 }>;

const NS = 'http://www.w3.org/2000/svg';
const MAX_INLINE = 24 * 1024 * 1024;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_SVG = 32 * 1024 * 1024;
const FILTER_TAGS = new Set(['filter', 'feGaussianBlur', 'feSpecularLighting', 'feDistantLight', 'feComposite', 'feOffset', 'feFlood', 'feMerge', 'feMergeNode']);
const SAFE_TAGS = new Set(['svg', 'g', 'defs', 'style', 'title', 'desc', 'metadata', 'image', 'clipPath', 'path', 'text', 'tspan', ...FILTER_TAGS]);
const SAFE_ATTRS = new Set(('xmlns xmlns:xlink width height viewBox class role id x y d clipPathUnits clip-path href xlink:href preserveAspectRatio filter filterUnits color-interpolation-filters font-family font-size font-weight letter-spacing textLength lengthAdjust text-anchor fill style in in2 stdDeviation result surfaceScale specularConstant specularExponent lighting-color azimuth elevation operator k1 k2 k3 k4 dx dy flood-color flood-opacity data-engraving-light data-engraving-shadow').split(' '));
const FIELD_LIMITS: Record<string, number> = {
  'passport-etched-signature': 4, 'passport-etched-rank': 40, 'passport-holo-identity': 32,
  'passport-holo-hero-value': 32, 'passport-holo-hero-label': 48, 'passport-holo-market': 54,
  'passport-holo-support': 72, 'passport-etched-website': 12, 'passport-holo-disclosure': 80,
};

function validateFonts(css: string): void {
  const fail = (): never => { throw new Error('Invalid embedded Passport fonts.'); };
  if (css.length > 2 * 1024 * 1024 || /[\\<>]/.test(css)) fail();
  const families = new Set<string>();
  let count = 0;
  const remainder = css.replace(/@font-face\s*\{([^{}]*)\}/g, (_, body: string) => {
    count++;
    let urls = 0;
    const safe = body.replace(/url\(\s*(["'])(.*?)\1\s*\)/g, (_url, _quote: string, url: string) => {
      urls++;
      const match = url.match(/^data:(?:font\/(?:woff2|ttf)|application\/(?:font-woff2|x-font-ttf));base64,(.+)$/);
      if (!match || !BASE64.test(match[1])) fail();
      return 'INLINE_FONT';
    });
    if (urls !== 1) fail();
    const values = new Map<string, string>();
    for (const declaration of safe.split(';').map(value => value.trim()).filter(Boolean)) {
      const colon = declaration.indexOf(':');
      const key = declaration.slice(0, colon).trim(), value = declaration.slice(colon + 1).trim();
      if (values.has(key)) fail();
      values.set(key, value);
    }
    const family = (values.get('font-family') ?? '').replace(/^["']|["']$/g, '');
    if (!['Cova UI', 'Cova Signature'].includes(family) || families.has(family) || values.size !== 5
      || !/^INLINE_FONT\s+format\(["'](?:woff2|truetype)["']\)$/.test(values.get('src') ?? '')
      || !/^\d{3}(?:\s+\d{3})?$/.test(values.get('font-weight') ?? '')
      || values.get('font-style') !== 'normal' || values.get('font-display') !== 'block') fail();
    families.add(family);
    return '';
  });
  if (remainder.trim() || count !== 2 || families.size !== 2) fail();
}

/** Inert XML only: never mount the source or allow a loader-capable construct. */
function parseSafeSvg(svg: string, width: number, height: number): Element {
  const fail = (): never => { throw new Error('Invalid or unsafe Passport SVG.'); };
  if (typeof svg !== 'string' || !svg || svg.length > MAX_SVG || /<!|<\?/.test(svg)) fail();
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || doc.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== NS
    || root.getAttribute('xmlns') !== NS || root.getAttribute('viewBox') !== `0 0 ${width} ${height}`
    || root.getAttribute('width') !== String(width) || root.getAttribute('height') !== String(height)) fail();
  const nodes = [root, ...Array.from(root.querySelectorAll('*'))];
  if (nodes.length > 128) fail();
  const ids = new Set<string>();
  for (const node of nodes) {
    if (!SAFE_TAGS.has(node.localName) || node.namespaceURI !== NS || (node !== root && node.localName === 'svg')) fail();
    let depth = 0;
    for (let current: Element | null = node; current && current !== root; current = current.parentElement) if (++depth > 12) fail();
    for (const { name, value } of Array.from(node.attributes)) {
      if (/^aria-[a-z-]+$/.test(name) || name === 'title') continue; // Rebuilt, never copied.
      if (!SAFE_ATTRS.has(name)) fail();
      if (name === 'xmlns' && value !== NS) fail();
      if (name === 'xmlns:xlink' && value !== 'http://www.w3.org/1999/xlink') fail();
      if (name === 'style' && !/^\s*user-select\s*:\s*text\s*;?\s*$/.test(value)) fail();
      if (name === 'class' && !/^[\w -]+$/.test(value)) fail();
      if (name === 'id') { if (!/^[A-Za-z_][\w.:-]*$/.test(value) || ids.has(value)) fail(); ids.add(value); }
      if (name === 'href' || name === 'xlink:href') { if (node.localName !== 'image') fail(); validateRaster(value, width === 1080); }
      if ((name === 'filter' || name === 'clip-path') && !/^url\(#[A-Za-z_][\w.:-]*\)$/.test(value)) fail();
      if (['fill', 'lighting-color', 'flood-color'].includes(name) && !/^#[\da-f]{3,8}$/i.test(value)) fail();
      if (name === 'font-family' && !/^Cova (?:UI, Arial, sans-serif|Signature, cursive)$/.test(value)) fail();
      if (['x', 'y', 'width', 'height', 'font-size', 'font-weight', 'letter-spacing', 'textLength', 'stdDeviation', 'surfaceScale', 'specularConstant', 'specularExponent', 'azimuth', 'elevation', 'k1', 'k2', 'k3', 'k4', 'dx', 'dy', 'flood-opacity'].includes(name)
        && (!value.trim() || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > (['stdDeviation', 'surfaceScale', 'dx', 'dy'].includes(name) ? 8 : 10000))) fail();
    }
  }
  for (const node of nodes) for (const name of ['filter', 'clip-path']) {
    const value = node.getAttribute(name);
    if (value && !ids.has(value.slice(5, -1))) fail();
  }
  if (root.querySelectorAll('image').length !== 1 || root.querySelectorAll('style').length !== 1 || root.querySelectorAll('filter').length !== 1) fail();
  const image = root.querySelector('image')!;
  if (!image.getAttribute('href') && !image.getAttribute('xlink:href')) fail();
  validateFonts(root.querySelector('style')!.textContent ?? '');
  const filter = root.querySelector('filter')!;
  if (filter.textContent?.trim() || !filter.getAttribute('id') || filter.getAttribute('filterUnits') !== 'userSpaceOnUse'
    || filter.querySelectorAll('feGaussianBlur').length !== 1 || filter.querySelectorAll('feDistantLight').length !== 1
    || !filter.querySelector('feComposite') || Array.from(filter.querySelectorAll('*')).some(node => !FILTER_TAGS.has(node.localName))) fail();
  return root;
}

function validateContent(root: Element): void {
  let count = 0;
  for (const [className, limit] of Object.entries(FIELD_LIMITS)) {
    const matches = Array.from(root.querySelectorAll(`.${className}`));
    if (!matches.length || matches.length > (className === 'passport-holo-support' ? 4 : 1)) throw new Error(`Missing or invalid Passport text: ${className}.`);
    count += matches.length;
    for (const node of matches) {
      const text = (node.textContent ?? '').trim();
      if (node.localName !== 'text' || !text || Array.from(text).length > limit || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(text)) throw new Error(`Invalid Passport text: ${className}.`);
      if (className === 'passport-etched-signature' && text !== 'Cova') throw new Error('Invalid Passport signature text.');
      if (className === 'passport-etched-website' && text !== 'covadesk.com') throw new Error('Invalid Passport website text.');
    }
  }
  if (root.querySelectorAll('text').length !== count) throw new Error('Unsupported Passport text content.');
}
function validateRaster(url: string, square: boolean): void {
  const fail = (): never => { throw new Error(square ? 'Invalid square material.' : 'Invalid Passport source material.'); };
  if (typeof url !== 'string' || url.length > MAX_INLINE) fail();
  const comma = url.indexOf(',');
  const mime = url.slice(0, comma);
  const encoded = url.slice(comma + 1);
  if (!['data:image/png;base64', 'data:image/webp;base64'].includes(mime) || !encoded || !BASE64.test(encoded)) fail();
  // Header/container validation is synchronous; the native image decoder is
  // still authoritative for compressed-pixel corruption at composition time.
  let bytes: string;
  try { bytes = atob(encoded); } catch { return fail(); }
  const n = (offset: number) => bytes.charCodeAt(offset);
  const le = (offset: number, length: number) => Array.from({ length }, (_, index) => n(offset + index) * 2 ** (index * 8)).reduce((a, b) => a + b, 0);
  const be = (offset: number) => n(offset) * 2 ** 24 + n(offset + 1) * 2 ** 16 + n(offset + 2) * 256 + n(offset + 3);
  let width = 0, height = 0;
  if (mime === 'data:image/png;base64') {
    if (bytes.length < 45 || bytes.slice(0, 8) !== '\x89PNG\r\n\x1a\n' || be(8) !== 13 || bytes.slice(12, 16) !== 'IHDR' || bytes.slice(-8, -4) !== 'IEND') fail();
    width = be(16); height = be(20);
  } else {
    if (bytes.length < 30 || bytes.slice(0, 4) !== 'RIFF' || bytes.slice(8, 12) !== 'WEBP' || le(4, 4) + 8 !== bytes.length) fail();
    const chunk = bytes.slice(12, 16);
    if (le(16, 4) + 20 > bytes.length) fail();
    if (chunk === 'VP8X') {
      if (le(16, 4) !== 10 || (n(20) & 2)) fail(); // No animated materials.
      width = le(24, 3) + 1; height = le(27, 3) + 1;
    } else if (chunk === 'VP8L') {
      if (n(20) !== 0x2f) fail();
      width = 1 + (le(21, 2) & 0x3fff); height = 1 + ((le(22, 3) >> 6) & 0x3fff);
    } else if (chunk === 'VP8 ') {
      if (bytes.slice(23, 26) !== '\x9d\x01\x2a') fail();
      width = le(26, 2) & 0x3fff; height = le(28, 2) & 0x3fff;
    } else fail();
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 4096 || height > 4096 || width * height > 8_388_608 || (square && width !== height)) fail();
}
const escapeXml = (value: string | number): string => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function tag(name: string, attrs: Record<string, string | number>, content = ''): string {
  return `<${name}${Object.entries(attrs).map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join('')}>${content}</${name}>`;
}
function serialize(node: Element, override: Record<string, string | number> = {}): string {
  const attrs = Object.fromEntries(Array.from(node.attributes).filter(attr => !/^(?:aria-|title$)/.test(attr.name)).map(attr => [attr.name, attr.value]));
  return tag(node.localName, { ...attrs, ...override }, node.children.length ? Array.from(node.children).map(child => serialize(child)).join('') : escapeXml(node.textContent ?? ''));
}
function inherited(node: Element, name: string, fallback: string): string {
  for (let current: Element | null = node; current; current = current.parentElement) {
    const value = current.getAttribute(name);
    if (value !== null) return value;
  }
  return fallback;
}

/** Reflow actual captured glyphs; the old rectangular face is never rasterized. */
export function createSquareSnapshot(snapshot: ShareSnapshot, materialUrl: string): SquareShareSnapshot {
  validateRaster(materialUrl, true);
  if (!snapshot || snapshot.width !== 1672 || snapshot.height !== 941) throw new Error('Invalid Passport snapshot dimensions.');
  const root = parseSafeSvg(snapshot.svg, 1672, 941);
  validateContent(root);
  const get = (className: string): Element => {
    const node = root.querySelector(`.${className}`);
    if (!node) throw new Error(`Missing Passport text: ${className}.`);
    return node;
  };
  const filter = root.querySelector('filter');
  const font = root.querySelector('style');
  if (!filter || !font) throw new Error('Missing Passport fonts or engraving.');
  const supports = Array.from(root.querySelectorAll('.passport-holo-support'));
  const shift = Math.max(0, supports.length - 2) * 45;
  const rendered: string[] = [], texts: string[] = [];
  const place = (className: string, x: number, y: number, size: number, maxWidth: number, node = get(className)): string => {
    const text = (node.textContent ?? '').trim();
    // Explicit glyph advances make fitting independent of font readiness. This
    // is native SVG text, not a stretched bitmap. Long captured values shrink
    // uniformly first, then bounded lengthAdjust prevents residual overflow.
    const spacing = Number(inherited(node, 'letter-spacing', '0'));
    const units = Array.from(text).reduce((sum, char) => sum + (/[ilI1.,:;'|! ]/.test(char) ? 0.28 : /[MW@%]/.test(char) ? 0.9 : /[A-Z0-9+$]/.test(char) ? 0.62 : 0.5), 0);
    const advance = Math.max(1, units * size + Math.max(0, text.length - 1) * spacing);
    const fittedSize = Math.max(Math.min(size, 20), Math.min(size, size * maxWidth / advance));
    const fittedWidth = Math.min(maxWidth, advance * fittedSize / size);
    texts.push(text);
    return tag('text', {
      class: node.getAttribute('class') ?? className, x, y,
      'font-size': Number(fittedSize.toFixed(3)), textLength: Number(fittedWidth.toFixed(3)), lengthAdjust: 'spacingAndGlyphs',
      'font-family': inherited(node, 'font-family', 'Cova UI, Arial, sans-serif'),
      'font-weight': inherited(node, 'font-weight', '400'), fill: inherited(node, 'fill', '#302918'),
      'letter-spacing': inherited(node, 'letter-spacing', '0'),
      'text-anchor': className === 'passport-etched-website' ? 'end' : 'start',
    }, escapeXml(text));
  };
  rendered.push(place('passport-etched-signature', 88, 150, 92, 215));
  rendered.push(place('passport-etched-rank', 90, 198, 24, 390));
  rendered.push(place('passport-holo-identity', 88, 570 - shift, 50, 460));
  rendered.push(tag('g', { class: get('passport-holo-hero-value').parentElement?.getAttribute('class') ?? 'passport-profile-hero-stat passport-holo-result' },
    place('passport-holo-hero-value', 84, 728 - shift, 148, 560) + place('passport-holo-hero-label', 90, 792 - shift, 39, 910)));
  rendered.push(place('passport-holo-market', 90, 859 - shift, 34, 910));
  supports.forEach((node, index) => rendered.push(place('passport-holo-support', 90, 960 - (supports.length - index - 1) * 45, supports.length === 1 ? 38 : 28, 910, node)));
  rendered.push(place('passport-etched-website', 1004, 1018, 37, 250));
  const disclosure = place('passport-holo-disclosure', 92, 1018, 23, 560);
  const visible = texts.join('. ');
  const svg = tag('svg', { xmlns: NS, class: 'passport-holo-art passport-square-art', width: 1080, height: 1080, viewBox: '0 0 1080 1080', role: 'img', 'aria-label': visible },
    tag('title', {}, 'Cova Risk Passport') + tag('desc', {}, escapeXml(visible)) + tag('style', {}, escapeXml(font.textContent ?? '')) +
    tag('defs', {}, serialize(filter, { x: 0, y: 0, width: 1080, height: 1080, filterUnits: 'userSpaceOnUse' })) +
    tag('image', { href: materialUrl, x: 0, y: 0, width: 1080, height: 1080, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' }) +
    tag('g', { filter: `url(#${filter.getAttribute('id')})` }, rendered.join('')) + disclosure);
  return Object.freeze({ svg, width: 1080, height: 1080 });
}

/** Local PNG composition; callers retain ownership of saving/cancellation UI. */
export async function composeSquareSharePng(
  snapshot: SquareShareSnapshot,
  preset: { id: string; width: number; height: number },
  background: ShareBackground,
): Promise<Blob> {
  const { width, height } = preset;
  // Bound both dimensions and total RGBA backing pixels before any font wait,
  // parsing, URL, image or canvas allocation. id cannot override aspect safety.
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
    || width > 4096 || height > 4096 || width * height > 8_388_608) throw new Error('Invalid export dimensions.');
  if (background !== 'studio' && background !== 'slate' && background !== 'clean') throw new Error('Invalid share background.');
  if (!snapshot || snapshot.width !== 1080 || snapshot.height !== 1080) throw new Error('Invalid square snapshot dimensions.');
  const svg = snapshot.svg;
  validateContent(parseSafeSvg(svg, 1080, 1080));
  await document.fonts.ready;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  let image: HTMLImageElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    const vector = new Image();
    image = vector;
    await new Promise<void>((resolve, reject) => {
      vector.onload = () => resolve();
      vector.onerror = () => reject(new Error('The square Passport vector could not be rendered.'));
      vector.src = url;
    });
    await vector.decode();
    if (vector.naturalWidth !== 1080 || vector.naturalHeight !== 1080) throw new Error('The square Passport vector could not be rendered.');
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The export canvas is unavailable.');
    context.fillStyle = background === 'clean' ? '#e8e9ed' : background === 'slate' ? '#1b2230' : '#101217';
    context.fillRect(0, 0, width, height);
    const side = Math.min(width, height) * (background === 'studio' && width === height ? 1 : 0.952);
    context.drawImage(vector, (width - side) / 2, (height - side) / 2, side, side);
    // Provenance is already real SVG text on the foil. Never add a second
    // technical poster footer or replace the user's visible sample line.
    const output = canvas;
    return await new Promise<Blob>((resolve, reject) => {
      output.toBlob(blob => blob?.type === 'image/png' ? resolve(blob) : reject(new Error('The square Passport PNG could not be encoded.')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
    if (image) { image.onload = image.onerror = null; image.removeAttribute('src'); }
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
