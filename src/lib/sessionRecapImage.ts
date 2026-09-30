import { recapExportError, recapHeadlineCents, recapHotStreakLine, recapMoney, type SessionRecap, type RecapBackground } from './sessionRecap';
import { recapBackgroundRect, type RecapTransform } from './recapBackground';
export { recapBackgroundRect } from './recapBackground';
export type RecapFormat = 'story' | 'feed' | 'square';
export const recapFormats = [{ id: 'story' as const, label: 'Story', width: 1080, height: 1920 }, { id: 'feed' as const, label: 'Feed', width: 1080, height: 1350 }, { id: 'square' as const, label: 'Square', width: 1080, height: 1080 }];
export const recapBackgrounds = [{ id: 'new-york' as const, label: 'New York', src: '/recaps/new-york.webp' }, { id: 'london' as const, label: 'London', src: '/recaps/london.webp' }, { id: 'asia' as const, label: 'Asia', src: '/recaps/asia.webp' }, { id: 'blue-tower' as const, label: 'Blue Tower', src: '/recaps/blue-tower.png' }, { id: 'cloud-towers' as const, label: 'Cloud Towers', src: '/recaps/cloud-towers.png' }, { id: 'plain' as const, label: 'Plain', src: '' }];
export type RecapRenderInput = { recap: SessionRecap; format: RecapFormat; background: RecapBackground; customPhoto?: string; transform?: RecapTransform; username?: string | null; avatar?: string | null };
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
  const w = canvas.width, h = canvas.height, pad = 76;
  // Keep the photograph open above a calm, format-specific editorial result block.
  // Coordinates are baselines, not CSS boxes; the full signed currency amount is fitted below.
  const layout = format === 'story' ? { head: 160, title: 1136, market: 1200, amount: 1416, basis: 1488, streak: 1498, stat: 1570, label: 1616, footer: 1714, sample: 1812, font: 202, fadeStart: 760, fadeEnd: 1470 }
    : format === 'feed' ? { head: 86, title: 676, market: 740, amount: 952, basis: 1016, streak: 1028, stat: 1100, label: 1142, footer: 1220, sample: 1310, font: 192, fadeStart: 348, fadeEnd: 1012 }
      : { head: 78, title: 432, market: 492, amount: 696, basis: 760, streak: 772, stat: 840, label: 882, footer: 966, sample: 1048, font: 182, fadeStart: 170, fadeEnd: 770 };
  if (!foregroundOnly) { ctx.fillStyle = '#080d12'; ctx.fillRect(0, 0, w, h); }
  if (photo || foregroundOnly) {
    if (photo) {
      const r = recapBackgroundRect(photo.width, photo.height, w, h, input.transform);
      ctx.drawImage(photo, r.x, r.y, r.width, r.height);
    }
    if (photo && background !== 'custom') {
      // Grade only the curated photographs, before any identity or text is drawn.
      // A tiny channel lookup keeps this consistent without Canvas filter support.
      const tone = Uint8ClampedArray.from({ length: 256 }, (_, value) => ((value - 127.5) * 1.1 + 127.5) * 1.07);
      const frame = ctx.getImageData(0, 0, w, h), pixels = frame.data;
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
    const fade = ctx.createLinearGradient(0, layout.fadeStart, 0, layout.fadeEnd);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(.42, 'rgba(0,0,0,.32)'); fade.addColorStop(.72, 'rgba(0,0,0,.88)'); fade.addColorStop(1, '#000');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h);
    const top = ctx.createLinearGradient(0, 0, 0, layout.head + 160); top.addColorStop(0, 'rgba(8,13,18,.75)'); top.addColorStop(1, 'rgba(8,13,18,0)'); ctx.fillStyle = top; ctx.fillRect(0, 0, w, layout.head + 160);
  }
  const text = (value: string, x: number, y: number, size: number, color = '#f0f2f5', weight = 400, max = w - pad * 2, align: CanvasTextAlign = 'left', family = displayFamily) => {
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 300);
    ctx.textAlign = align; ctx.fillStyle = color; ctx.font = `${weight} ${size}px "${family}"`;
    let label = clean;
    while (ctx.measureText(label).width > max && label.length > 1) label = label.slice(0, -2) + '…';
    ctx.fillText(label, x, y);
  };
  if (username) {
    ctx.save(); ctx.beginPath(); ctx.arc(pad + 28, layout.head - 10, 28, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#f0f2f5'; ctx.fillRect(pad, layout.head - 38, 56, 56);
    if (face) cover(ctx, face, pad, layout.head - 38, 56, 56);
    else text(username.replace(/^@/, '').charAt(0).toUpperCase(), pad + 28, layout.head + 1, 30, '#080d12', 500, 50, 'center');
    ctx.restore(); text(`@${username.replace(/^@/, '')}`, pad + 77, layout.head, 32, '#f0f2f5', 400, 480);
  }
  text(recap.dateLabel, w - pad, layout.head, 30, '#f0f2f5', 400, 320, 'right');
  // Small labels need their own contrast against bright windows and clouds.
  // A soft text shadow preserves the landmark instead of adding an opaque badge.
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.95)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 3;
  ctx.letterSpacing = '3px'; text(recap.title.toUpperCase(), w / 2, layout.title, 32, '#f4f6fa', 600, w - pad * 2, 'center'); ctx.letterSpacing = '0px';
  text(recap.markets, w / 2, layout.market, 36, '#9bbcff', 600, w - pad * 2, 'center');
  ctx.restore();
  const amount = recapMoney(headline);
  let size = layout.font;
  while (true) {
    ctx.font = `400 ${size}px "${amountFamily}"`;
    const m = ctx.measureText(amount);
    if (Math.max(m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight) <= w - pad * 2) break;
    if (size <= 42) throw new Error('The exact amount does not fit this format.');
    size -= 2;
  }
  if (BigInt(headline) < 0n) {
    // Losses tint the complete currency line; the background stays untouched.
    text(amount, w / 2, layout.amount, size, '#fdb6b5', 400, w - pad * 2, 'center', amountFamily);
  } else if (BigInt(headline) > 0n) {
    // Profits color only the sign. Both passes draw the complete shaped
    // string through disjoint clips, so currency, cent precision and kerning stay exact.
    const fullWidth = ctx.measureText(amount).width;
    const signEnd = w / 2 - fullWidth / 2 + fullWidth - ctx.measureText(amount.slice(1)).width;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, signEnd, h); ctx.clip();
    text(amount, w / 2, layout.amount, size, '#76d5ad', 400, w - pad * 2, 'center', amountFamily);
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(signEnd, 0, w - signEnd, h); ctx.clip();
    text(amount, w / 2, layout.amount, size, '#f4f5f6', 400, w - pad * 2, 'center', amountFamily);
    ctx.restore();
  } else {
    text(amount, w / 2, layout.amount, size, '#f4f5f6', 400, w - pad * 2, 'center', amountFamily);
  }
  if (!recap.fees && !recap.sample) text(recap.basis, w / 2, layout.basis, 32, '#bac3ce', 400, w - pad * 2, 'center');
  const streak = recapHotStreakLine(recap);
  if (streak) { ctx.letterSpacing = '3px'; text(streak, w / 2, layout.streak, 36, '#9fb2ff', 500, w - pad * 2, 'center'); ctx.letterSpacing = '0px'; }
  const statY = layout.stat, labelY = layout.label;
  const left = pad + (w - pad * 2) / 4, right = w - left;
  text(String(recap.count), left, statY, 64, '#f4f5f6', 500, 360, 'center');
  text(recap.winRate, right, statY, 64, '#f4f5f6', 500, 360, 'center');
  text(recap.countLabel, left, labelY, 30, '#bac3ce', 400, 380, 'center');
  text('Win rate', right, labelY, 30, '#bac3ce', 400, 380, 'center');
  ctx.strokeStyle = '#414753'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2, statY - 44); ctx.lineTo(w / 2, labelY + 2); ctx.stroke();
  const logoWidth = 220, logoHeight = logoWidth * logo.height / logo.width;
  ctx.drawImage(logo, (w - logoWidth) / 2, layout.footer - logoHeight + 6, logoWidth, logoHeight);
  text('covadesk.com', w / 2, layout.footer + 44, 27, '#a5b1bf', 400, 250, 'center');
  if (recap.sample) text('Sample data · Not a live account', w / 2, layout.sample, 24, '#a5b1bf', 400, 850, 'center');
  if (signal?.aborted) throw new Error('Render cancelled');
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The image could not be saved. Try again.')), 'image/png'));
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
