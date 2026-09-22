import { recapFeeLine, recapMoney, type SessionRecap, type RecapBackground } from './sessionRecap';
export type RecapFormat = 'story' | 'feed' | 'square';
export const recapFormats = [{ id: 'story' as const, label: 'Story', width: 1080, height: 1920 }, { id: 'feed' as const, label: 'Feed', width: 1080, height: 1350 }, { id: 'square' as const, label: 'Square', width: 1080, height: 1080 }];
export const recapBackgrounds = [{ id: 'new-york' as const, label: 'New York', src: '/recaps/new-york.webp' }, { id: 'london' as const, label: 'London', src: '/recaps/london.webp' }, { id: 'asia' as const, label: 'Asia', src: '/recaps/asia.webp' }, { id: 'plain' as const, label: 'Plain', src: '' }];
export type RecapRenderInput = { recap: SessionRecap; format: RecapFormat; background: RecapBackground; customPhoto?: string; username?: string | null; avatar?: string | null };
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
export async function renderSessionRecap(input: RecapRenderInput, signal?: AbortSignal) {
  const { recap, format, background, username, avatar } = input;
  const preset = recapFormats.find(f => f.id === format)!;
  const source = background === 'custom' ? input.customPhoto : recapBackgrounds.find(b => b.id === background)?.src;
  const [photo, face] = await Promise.all([source ? image(source, signal) : null, username && avatar ? image(avatar, signal) : null]);
  await document.fonts.load('500 40px "Inter Tight Variable"');
  if (signal?.aborted) throw new Error('Render cancelled');
  const canvas = document.createElement('canvas'); canvas.width = preset.width; canvas.height = preset.height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('This browser could not create an image.');
  const w = canvas.width, h = canvas.height, pad = 76;
  const layout = format === 'story' ? { head: 160, title: 1160, market: 1210, amount: 1360, basis: 1416, stat: 1526, label: 1570, footer: 1688, sample: 1735, font: 180 }
    : format === 'feed' ? { head: 86, title: 720, market: 768, amount: 928, basis: 983, stat: 1102, label: 1148, footer: 1244, sample: 1291, font: 176 }
      : { head: 78, title: 472, market: 522, amount: 668, basis: 720, stat: 828, label: 870, footer: 980, sample: 1025, font: 164 };
  ctx.fillStyle = '#080d12'; ctx.fillRect(0, 0, w, h);
  if (photo) {
    cover(ctx, photo, 0, 0, w, h);
    const fade = ctx.createLinearGradient(0, layout.title - 420, 0, layout.basis + 20);
    fade.addColorStop(0, 'rgba(8,13,18,0)'); fade.addColorStop(.5, 'rgba(8,13,18,.65)'); fade.addColorStop(.8, 'rgba(8,13,18,.97)'); fade.addColorStop(1, '#080d12');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h);
    const top = ctx.createLinearGradient(0, 0, 0, layout.head + 160); top.addColorStop(0, 'rgba(8,13,18,.75)'); top.addColorStop(1, 'rgba(8,13,18,0)'); ctx.fillStyle = top; ctx.fillRect(0, 0, w, layout.head + 160);
  }
  const text = (value: string, x: number, y: number, size: number, color = '#f0f2f5', weight = 400, max = w - pad * 2, align: CanvasTextAlign = 'left') => {
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 300);
    ctx.textAlign = align; ctx.fillStyle = color; ctx.font = `${weight} ${size}px "Inter Tight Variable", sans-serif`;
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
  text(recap.title, pad, layout.title, 38, '#bac3ce'); text(recap.markets, pad, layout.market, 36);
  const amount = recapMoney(recap.totalCents); let size = layout.font;
  do { ctx.font = `600 ${size}px "Inter Tight Variable", sans-serif`; if (ctx.measureText(amount).width <= w - pad * 2) break; size -= 2; } while (size > 42);
  text(amount, pad - 5, layout.amount, size, BigInt(recap.totalCents) < 0n ? '#ffb7b7' : '#f4f5f6', 600);
  text(recap.basis, pad, layout.basis, 36, '#bac3ce');
  const feeLine = recapFeeLine(recap); let feeSize = 32;
  do { ctx.font = `400 ${feeSize}px "Inter Tight Variable", sans-serif`; if (ctx.measureText(feeLine).width <= w - pad * 2) break; feeSize--; } while (feeSize > 22);
  text(feeLine, pad, layout.basis + 43, feeSize, '#bac3ce');
  const left = 278, right = 788;
  text(String(recap.count), left, layout.stat, 72, '#f4f5f6', 500, 360, 'center');
  text(recap.winRate, right, layout.stat, 72, '#f4f5f6', 500, 360, 'center');
  text(recap.countLabel, left, layout.label, 32, '#bac3ce', 400, 380, 'center');
  text(recap.basis.startsWith('Gross') ? 'Gross entry win rate' : 'Entry win rate', right, layout.label, 32, '#bac3ce', 400, 380, 'center');
  ctx.strokeStyle = '#34404d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2, layout.stat - 56); ctx.lineTo(w / 2, layout.label + 2); ctx.stroke();
  text('Cova', pad, layout.footer, 45, '#f4f5f6', 500); text('covadesk.com', w - pad, layout.footer, 27, '#bac3ce', 400, 250, 'right');
  text(recap.sample ? 'Sample data · Not a live account' : `${recap.windowLabel}${recap.fees ? ` · Cash snapshot ${recap.fees.asOf.slice(0, 10)}` : ''}`, w / 2, layout.sample, 24, '#a5b1bf', 400, 850, 'center');
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
