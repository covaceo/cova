import { recapVerificationCurrent } from './recapVerification';
import { recapExportError, recapHeadlineCents, recapMoney, type SessionRecap, type RecapBackground } from './sessionRecap';
import { recapBackgroundRect, type RecapTransform } from './recapBackground';
export { recapBackgroundRect } from './recapBackground';
export type RecapFormat = 'wide' | 'story' | 'feed' | 'square';
export const recapFormats = [{ id: 'wide' as const, label: 'Recap', width: 2160, height: 1160 }, { id: 'story' as const, label: 'Story', width: 1080, height: 1920 }, { id: 'feed' as const, label: 'Feed', width: 1080, height: 1350 }, { id: 'square' as const, label: 'Square', width: 1080, height: 1080 }];
export const recapBackgrounds = [{ id: 'new-york' as const, label: 'New York', src: '/recaps/new-york.webp' }, { id: 'london' as const, label: 'London', src: '/recaps/london.webp' }, { id: 'asia' as const, label: 'Asia', src: '/recaps/asia.webp' }, { id: 'blue-tower' as const, label: 'Blue Tower', src: '/recaps/blue-tower.png' }, { id: 'cloud-towers' as const, label: 'Cloud Towers', src: '/recaps/cloud-towers.png' }, { id: 'plain' as const, label: 'Plain', src: '' }];
export type RecapRenderInput = { recap: SessionRecap; format: RecapFormat; background: RecapBackground; customPhoto?: string; transform?: RecapTransform; username?: string | null; avatar?: string | null; showPnl?: boolean; verificationCurrent?: () => boolean };
const displayFamily = 'Cova Recap Space Grotesk';
const amountFamily = 'Cova Recap Instrument Serif';
let fontReady: Promise<void> | null = null;
function loadRecapFont(): Promise<void> {
  if (!fontReady) fontReady = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The recap font could not be loaded. Please retry.')), 12000);
    Promise.all([
      new FontFace(displayFamily, 'url("/fonts/recap-space-grotesk.ttf")', { style: 'normal', weight: '300 700' }).load(),
      new FontFace(amountFamily, 'url("/fonts/recap-instrument-serif.ttf")', { style: 'normal', weight: '400' }).load(),
    ])
      .then(faces => { faces.forEach(face => document.fonts.add(face)); resolve(); }, () => reject(new Error('The recap font could not be loaded. Please retry.')))
      .finally(() => clearTimeout(timer));
  }).catch(error => { fontReady = null; throw error; });
  return fontReady;
}
function image(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const finish = (error?: Error) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); img.onload = null; img.onerror = null; error ? reject(error) : resolve(img); };
    const abort = () => { img.src = ''; finish(new Error('Render cancelled')); };
    const timer = setTimeout(() => finish(new Error('The background could not be loaded. Choose another photo or Plain.')), 12000);
    img.onload = () => finish(); img.onerror = () => finish(new Error('The photo could not be loaded. Choose another photo or Plain.'));
    if (signal?.aborted) { abort(); return; } signal?.addEventListener('abort', abort, { once: true }); img.src = src;
  });
}
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / img.width, height / img.height), sw = width / scale, sh = height / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, width, height);
}
/** Each format has an authored composition; only the underlying photograph is cropped. */
export async function renderSessionRecap(input: RecapRenderInput, signal?: AbortSignal, foregroundOnly = false) {
  const { recap, format, background, username, avatar } = input;
  const issue = recapExportError(recap); if (issue) throw new Error(issue);
  const headline = recapHeadlineCents(recap)!;
  const preset = recapFormats.find(f => f.id === format)!;
  const source = foregroundOnly ? null : background === 'custom' ? input.customPhoto : recapBackgrounds.find(b => b.id === background)?.src;
  const [photo, face, logo] = await Promise.all([source ? image(source, signal) : null, username && avatar ? image(avatar, signal) : null, image('/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png', signal)]);
  await loadRecapFont();
  const fonts = await Promise.all([document.fonts.load(`700 40px "${displayFamily}"`), document.fonts.load(`400 40px "${amountFamily}"`)]);
  if (fonts.some(faces => !faces.length)) throw new Error('The recap font could not be loaded. Please retry.');
  if (signal?.aborted) throw new Error('Render cancelled');
  const canvas = document.createElement('canvas'); canvas.width = preset.width; canvas.height = preset.height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('This browser could not create an image.');
  // Wide keeps its approved logical layout while rendering at 2x for full-width Retina previews.
  const scale = format === 'wide' ? 2 : 1;
  if (scale !== 1) ctx.scale(scale, scale);
  const w = canvas.width / scale, h = canvas.height / scale, pad = 56;
  const showPnl = input.showPnl !== false;
  const proofCurrent = () => input.verificationCurrent ? input.verificationCurrent() : recapVerificationCurrent(recap.verification);
  const verified = Boolean(recap.verification && proofCurrent());
  // Keep the photograph open above a calm, format-specific editorial result block.
  // Coordinates are baselines, not CSS boxes; the full signed currency amount is fitted below.
  const layout = format === 'wide'
    ? { head: 78, title: 128, market: 181, amount: 319, basis: 367, stat: 469, label: 425, footer: 535, sample: 564, font: 126, fadeStart: 0, fadeEnd: 580 }
    : format === 'story' ? { head: 112, title: 1100, market: 1170, amount: 1395, basis: 1470, stat: 1625, label: 1545, footer: 1780, sample: 1860, font: 202, fadeStart: 760, fadeEnd: 1470 }
    : format === 'feed' ? { head: 100, title: 640, market: 710, amount: 920, basis: 995, stat: 1150, label: 1070, footer: 1260, sample: 1320, font: 192, fadeStart: 348, fadeEnd: 1012 }
    : { head: 90, title: 410, market: 480, amount: 680, basis: 745, stat: 900, label: 820, footer: 1000, sample: 1050, font: 182, fadeStart: 170, fadeEnd: 770 };
  if (!foregroundOnly) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
  if (photo || foregroundOnly) {
    if (photo) {
      const r = format === 'wide' && background !== 'custom'
        ? { x: w - h * photo.width / photo.height * 1.7, y: -h * .35, width: h * photo.width / photo.height * 1.7, height: h * 1.7 }
        : recapBackgroundRect(photo.width, photo.height, w, h, input.transform);
      ctx.drawImage(photo, r.x, r.y, r.width, r.height);
    }
    if (photo && background !== 'custom') {
      // Grade only the curated photographs, before any identity or text is drawn.
      // A tiny channel lookup keeps this consistent without Canvas filter support.
      const tone = Uint8ClampedArray.from({ length: 256 }, (_, value) => ((value - 127.5) * 1.1 + 127.5) * 1.07);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height), pixels = frame.data;
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = tone[pixels[i]]; pixels[i + 1] = tone[pixels[i + 1]]; pixels[i + 2] = tone[pixels[i + 2]];
      }
      ctx.putImageData(frame, 0, 0);
      // The photo treatment stays fixed when the result block is repositioned.
      const vignetteY = (format === 'story' ? 1100 : format === 'feed' ? 648 : 410) * .35;
      const edge = ctx.createRadialGradient(w / 2, vignetteY, w * .14, w / 2, vignetteY, w * .72);
      edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(.45, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,.32)');
      ctx.fillStyle = edge; ctx.fillRect(0, 0, w, h);
    }
    const fade = format === 'wide' ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(0, layout.fadeStart, 0, layout.fadeEnd);
    if (format === 'wide') { fade.addColorStop(0, '#000'); fade.addColorStop(.4, 'rgba(0,0,0,.86)'); fade.addColorStop(.75, 'rgba(0,0,0,.12)'); fade.addColorStop(1, 'rgba(0,0,0,.1)'); }
    else { fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(.42, 'rgba(0,0,0,.32)'); fade.addColorStop(.72, 'rgba(0,0,0,.88)'); fade.addColorStop(1, '#000'); }
    ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h);
    const top = ctx.createLinearGradient(0, 0, 0, layout.head + 160); top.addColorStop(0, 'rgba(8,13,18,.75)'); top.addColorStop(1, 'rgba(8,13,18,0)'); ctx.fillStyle = top; ctx.fillRect(0, 0, w, layout.head + 160);
  }
  const text = (value: string, x: number, y: number, size: number, color = '#f0f2f5', weight = 400, max = w - pad * 2, align: CanvasTextAlign = 'left', family = displayFamily) => {
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 300);
    ctx.textAlign = align; ctx.fillStyle = color; ctx.font = `${weight} ${size}px "${family}"`;
    let label = clean;
    while (ctx.measureText(label).width > max && label.length > 1) label = label.slice(0, -2) + '…';
    ctx.fillText(label, x, y);
    return label;
  };
  const logoWidth = 182, logoHeight = logoWidth * logo.height / logo.width;
  ctx.drawImage(logo, pad, layout.head - logoHeight, logoWidth, logoHeight);
  text(recap.dateLabel, w - pad, layout.head - 4, 23, '#bac3ce', 400, 300, 'right');
  text(recap.title, pad, layout.title, 25, '#d3dae4', 400, 760);
  text(recap.markets, pad, layout.market, format === 'wide' ? 44 : 52, '#f4f5f6', 500, 900);
  const amountX = pad, amountMax = format === 'wide' ? 640 : w - pad * 2;
  const amount = showPnl ? recapMoney(headline) : '—';
  let size = layout.font;
  while (true) {
    ctx.font = `400 ${size}px "${amountFamily}"`;
    const m = ctx.measureText(amount);
    if (Math.max(m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight) <= amountMax) break;
    if (size <= 42) throw new Error('The exact amount does not fit this format.');
    size -= 2;
  }
  if (showPnl && BigInt(headline) < 0n) {
    // Losses tint the complete currency line; the background stays untouched.
    text(amount, amountX, layout.amount, size, '#fdb6b5', 400, amountMax, 'left', amountFamily);
  } else if (showPnl && BigInt(headline) > 0n) {
    // Profits color only the sign. Both passes draw the complete shaped
    // string through disjoint clips, so currency, cent precision and kerning stay exact.
    const fullWidth = ctx.measureText(amount).width;
    const signEnd = amountX + fullWidth - ctx.measureText(amount.slice(1)).width;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, signEnd, h); ctx.clip();
    text(amount, amountX, layout.amount, size, '#76d5ad', 400, amountMax, 'left', amountFamily);
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(signEnd, 0, w - signEnd, h); ctx.clip();
    text(amount, amountX, layout.amount, size, '#f4f5f6', 400, amountMax, 'left', amountFamily);
    ctx.restore();
  } else {
    text(amount, amountX, layout.amount, size, '#f4f5f6', 400, amountMax, 'left', amountFamily);
  }
  const basis = !showPnl ? 'P&L HIDDEN' : (recap.fees || recap.reportedNet) ? 'NET P&L · USD' : recap.sample ? 'SAMPLE P&L · USD' : 'REPORTED P&L · USD · FEES UNCONFIRMED';
  text(basis, pad, layout.basis, 23, '#d3dae4', 400, 940);
  if (verified) {
    ctx.save();
    const y = layout.footer - 55;
    ctx.font = `400 17px "${displayFamily}"`;
    const glyph = ctx.measureText('Verified'), x = w - pad - glyph.width - 18;
    const baseline = y + (glyph.actualBoundingBoxAscent - glyph.actualBoundingBoxDescent) / 2;
    text('Verified', w - pad, baseline, 17, '#b9ddff', 400, 170, 'right');
    ctx.fillStyle = '#80c5ff';
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; ctx.beginPath(); ctx.arc(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - 3.5, y); ctx.lineTo(x - 1, y + 2.5); ctx.lineTo(x + 4, y - 3); ctx.stroke(); ctx.restore();
  }
  const columns = [pad, pad + 260];
  const values = [String(recap.count), recap.winRate];
  const labels = [recap.countLabel, 'Win rate'];
  columns.forEach((x, i) => {
    text(labels[i], x, layout.label, 23, '#bac3ce', 400, 228);
    text(values[i], x, layout.stat, 49, '#f4f5f6', 400, 228);
    if (i) { ctx.strokeStyle = '#414753'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 28, layout.label - 21); ctx.lineTo(x - 28, layout.stat + 5); ctx.stroke(); }
  });
  text('covadesk.com', pad, layout.footer, 24, '#f4f5f6', 400, 250);
  if (username) {
    // Anchor the identity to the date inset; place the avatar beside the fitted
    // username rather than reserving a fixed-width block that leaves a right gap.
    const label = text(`@${username.replace(/^@/, '')}`, w - pad, layout.footer, 22, '#f4f5f6', 400, 360, 'right');
    const x = w - pad - ctx.measureText(label).width - 30, y = layout.footer - 10;
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#f0f2f5'; ctx.fillRect(x - 20, y - 20, 40, 40);
    if (face) cover(ctx, face, x - 20, y - 20, 40, 40);
    ctx.restore();
  }
  if (recap.sample) text('Sample data · Not a live account', pad, layout.sample, 20, '#a5b1bf', 400, 850);
  if (signal?.aborted) throw new Error('Render cancelled');
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => verified && !proofCurrent() ? reject(new Error('Verification expired. Refresh the recap.')) : blob ? resolve(blob) : reject(new Error('The image could not be saved. Try again.')), 'image/png'));
}
/** Decode/re-encode to strip metadata, reject SVG/remote URLs, and bound final memory. */
export async function prepareRecapPhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP image under 8 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) throw new Error('Choose a photo smaller than 40 megapixels.');
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Your image could not be prepared.');
    ctx.fillStyle = '#080d12'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .9);
  } finally { bitmap.close(); }
}
