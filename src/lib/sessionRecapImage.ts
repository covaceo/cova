import { recapExportError, recapHeadlineCents, recapHotStreakLine, recapMoney, type SessionRecap, type RecapBackground } from './sessionRecap';
import { recapBackgroundRect, type RecapTransform } from './recapBackground';
export { recapBackgroundRect } from './recapBackground';
export type RecapFormat = 'story' | 'feed' | 'square';
export const recapFormats = [{ id: 'story' as const, label: 'Story', width: 1080, height: 1920 }, { id: 'feed' as const, label: 'Feed', width: 1080, height: 1350 }, { id: 'square' as const, label: 'Square', width: 1080, height: 1080 }];
export const recapBackgrounds = [{ id: 'new-york' as const, label: 'New York', src: '/recaps/new-york.webp' }, { id: 'london' as const, label: 'London', src: '/recaps/london.webp' }, { id: 'asia' as const, label: 'Asia', src: '/recaps/asia.webp' }, { id: 'plain' as const, label: 'Plain', src: '' }];
export type RecapRenderInput = { recap: SessionRecap; format: RecapFormat; background: RecapBackground; customPhoto?: string; transform?: RecapTransform; username?: string | null; avatar?: string | null };
const displayFamily = 'Cova Recap Space Grotesk';
let fontReady: Promise<void> | null = null;
function loadRecapFont(): Promise<void> {
  if (!fontReady) fontReady = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The recap font could not be loaded. Please retry.')), 12000);
    new FontFace(displayFamily, 'url("/fonts/recap-space-grotesk.ttf")', { style: 'normal', weight: '300 700' }).load()
      .then(face => { document.fonts.add(face); resolve(); }, () => reject(new Error('The recap font could not be loaded. Please retry.')))
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
  const fonts = await document.fonts.load(`700 40px "${displayFamily}"`);
  if (!fonts.length) throw new Error('The recap font could not be loaded. Please retry.');
  if (signal?.aborted) throw new Error('Render cancelled');
  const canvas = document.createElement('canvas'); canvas.width = preset.width; canvas.height = preset.height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('This browser could not create an image.');
  const w = canvas.width, h = canvas.height, pad = 76;
  const layout = format === 'story' ? { head: 160, title: 1160, market: 1210, amount: 1360, basis: 1416, stat: 1526, label: 1570, footer: 1688, sample: 1776, font: 180 }
    : format === 'feed' ? { head: 86, title: 720, market: 768, amount: 928, basis: 983, stat: 1066, label: 1112, footer: 1212, sample: 1300, font: 176 }
      : { head: 78, title: 472, market: 522, amount: 668, basis: 720, stat: 792, label: 834, footer: 948, sample: 1036, font: 164 };
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
      const edge = ctx.createRadialGradient(w / 2, layout.title * .35, w * .14, w / 2, layout.title * .35, w * .72);
      edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(.45, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,.32)');
      ctx.fillStyle = edge; ctx.fillRect(0, 0, w, h);
    }
    const fade = ctx.createLinearGradient(0, layout.title - 420, 0, layout.basis + 20);
    fade.addColorStop(0, 'rgba(8,13,18,0)'); fade.addColorStop(.5, 'rgba(8,13,18,.65)'); fade.addColorStop(.8, 'rgba(8,13,18,.97)'); fade.addColorStop(1, '#080d12');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h);
    const top = ctx.createLinearGradient(0, 0, 0, layout.head + 160); top.addColorStop(0, 'rgba(8,13,18,.75)'); top.addColorStop(1, 'rgba(8,13,18,0)'); ctx.fillStyle = top; ctx.fillRect(0, 0, w, layout.head + 160);
  }
  const text = (value: string, x: number, y: number, size: number, color = '#f0f2f5', weight = 400, max = w - pad * 2, align: CanvasTextAlign = 'left') => {
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 300);
    ctx.textAlign = align; ctx.fillStyle = color; ctx.font = `${weight} ${size}px "${displayFamily}", sans-serif`;
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
  ctx.letterSpacing = '3px'; text(recap.title.toUpperCase(), w / 2, layout.title - 60, 30, '#bac3ce', 600, w - pad * 2, 'center'); ctx.letterSpacing = '0px';
  text(recap.markets, w / 2, layout.market - 60, 34, '#4f7dff', 600, w - pad * 2, 'center');
  const amount = recapMoney(headline);
  let size = 168;
  while (true) {
    ctx.font = `700 ${size}px "${displayFamily}"`;
    const m = ctx.measureText(amount);
    if (Math.max(m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight) <= w - pad * 2) break;
    if (size <= 42) throw new Error('The exact amount does not fit this format.');
    size -= 2;
  }
  text(amount, w / 2, layout.amount - 24, size, BigInt(headline) < 0n ? '#ffb7b7' : '#f4f5f6', 700, w - pad * 2, 'center');
  if (!recap.fees && !recap.sample) text(recap.basis, w / 2, layout.basis, 36, '#bac3ce', 400, w - pad * 2, 'center');
  const streak = recapHotStreakLine(recap);
  if (streak) text(streak, w / 2, layout.amount + 64, 44, '#9fb2ff', 700, w - pad * 2, 'center');
  const statY = layout.stat + (format === 'square' ? 32 : 20), labelY = layout.label + (format === 'square' ? 24 : 12);
  const left = pad + (w - pad * 2) / 4, right = w - left;
  text(String(recap.count), left, statY, 72, '#f4f5f6', 700, 360, 'center');
  text(recap.winRate, right, statY, 72, '#f4f5f6', 700, 360, 'center');
  text(recap.countLabel, left, labelY, 32, '#bac3ce', 400, 380, 'center');
  text('Win rate', right, labelY, 32, '#bac3ce', 400, 380, 'center');
  ctx.strokeStyle = '#34404d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2, statY - 56); ctx.lineTo(w / 2, labelY + 2); ctx.stroke();
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
