export type ShareBackground = 'studio' | 'slate' | 'clean';
export type SharePrivacy = { hideIdentity: boolean; hideMarkets: boolean };
/** Serialized before any await; contains no reference to the live card. */
export type ShareSnapshot = Readonly<{ svg: string; width: 1672; height: 941 }>;

const DISCLOSURE = 'DEMO DATA · NOT ACCOUNT VERIFIED · LOCAL PNG · USER CONTROLLED';
const FACE = { width: 1672, height: 941, left: 192, right: 1476, top: 85, bottom: 846 };

function rankLight(rank: string): string {
  switch (rank.toLowerCase()) {
    case 'gold': return '196, 169, 120';
    case 'bronze': return '180, 122, 83';
    case 'silver': return '167, 184, 204';
    case 'platinum': return '155, 200, 220';
    case 'diamond': return '178, 185, 224';
    case 'ruby':
    case 'market maker': return '202, 67, 88';
    default: return '135, 153, 179';
  }
}

function paintStudio(context: CanvasRenderingContext2D, width: number, height: number, background: ShareBackground, rank: string, x: number, y: number, scale: number) {
  const slate = background === 'slate';
  const base = context.createLinearGradient(0, 0, width * 0.3, height);
  base.addColorStop(0, slate ? '#252c37' : '#19191c');
  base.addColorStop(1, slate ? '#11161e' : '#08090d');
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);
  const centerX = x + (FACE.left + FACE.right) / 2 * scale;
  const centerY = y + (FACE.top + FACE.bottom) / 2 * scale;
  const glow = context.createRadialGradient(centerX - width * 0.08, centerY - height * 0.1, 0, centerX, centerY, width * 0.76);
  const light = rankLight(rank);
  glow.addColorStop(0, `rgba(${light}, ${slate ? 0.14 : 0.32})`);
  glow.addColorStop(0.5, `rgba(${light}, ${slate ? 0.055 : 0.10})`);
  glow.addColorStop(1, `rgba(${light}, 0)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  // Authored, sparse matte grain. Fixed offsets, never random/time/assets.
  const step = Math.max(12, Math.round(width / 40));
  context.fillStyle = slate ? 'rgba(255, 255, 255, 0.026)' : 'rgba(255, 255, 255, 0.018)';
  for (let row = 0; row * step < height; row++) {
    for (let column = 0; column * step < width; column++) {
      const offset = (row * 131 + column * 197) % 17;
      context.fillRect(column * step + offset, row * step + (offset * 7) % 13, 1, 1);
    }
  }
  context.save();
  context.fillStyle = 'rgba(0, 0, 0, 0.38)';
  context.shadowColor = 'rgba(0, 0, 0, 0.65)';
  context.shadowBlur = width * 0.045;
  context.shadowOffsetY = width * 0.012;
  context.beginPath();
  context.ellipse(centerX, y + FACE.bottom * scale + width * 0.012, (FACE.right - FACE.left) * scale * 0.42, (FACE.bottom - FACE.top) * scale * 0.028, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/** Compose locally; the caller owns presenting or saving the returned PNG. */
export async function composeSharePng(
  snapshot: ShareSnapshot,
  preset: { id: string; width: number; height: number },
  background: ShareBackground,
  rank: string,
): Promise<Blob> {
  const { id, width, height } = preset;
  // Bound both dimensions and backing memory before any asynchronous work.
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
    || width > 4096 || height > 4096 || width * height > 8_388_608) {
    throw new Error('Invalid export dimensions.');
  }
  if (background !== 'clean' && background !== 'studio' && background !== 'slate') throw new Error('Invalid share background.');
  const svg = snapshot.svg;
  await document.fonts.ready;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  let image: HTMLImageElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    const vector = new Image();
    image = vector;
    await new Promise<void>((resolve, reject) => {
      vector.onload = () => resolve();
      vector.onerror = () => reject(new Error('The Passport vector could not be rendered.'));
      vector.src = url;
    });
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The export canvas is unavailable.');
    const clean = background === 'clean';
    const largeCard = !clean && id !== 'card' && height >= width;
    const scale = largeCard
      ? Math.min(width * 0.9 / (FACE.right - FACE.left), height * 0.66 / (FACE.bottom - FACE.top))
      : Math.min(width / FACE.width, height / FACE.height);
    const imageWidth = FACE.width * scale;
    const imageHeight = FACE.height * scale;
    const x = largeCard ? width / 2 - (FACE.left + FACE.right) / 2 * scale : (width - imageWidth) / 2;
    const y = largeCard ? height * 0.46 - (FACE.top + FACE.bottom) / 2 * scale : (height - imageHeight) / 2;
    if (clean) {
      context.fillStyle = '#e8e9ed';
      context.fillRect(0, 0, width, height);
    } else {
      paintStudio(context, width, height, background, rank, x, y, scale);
    }
    // Draw the full transparent SVG, not a source crop. Etch filter bounds and
    // all exact approved glyphs remain intact even when outer margins overflow.
    context.drawImage(image, x, y, imageWidth, imageHeight);
    if (id !== 'card') {
      context.textAlign = 'center';
      if (clean) {
        context.fillStyle = '#414b5b';
        context.font = '22px Arial, sans-serif';
        context.fillText(DISCLOSURE, width / 2, height - 70, width - 80);
      } else {
        const fontSize = width * 32 / 1080;
        const bottom = height - width * 0.072;
        context.fillStyle = '#bac1cc';
        context.font = `${fontSize}px Arial, sans-serif`;
        context.fillText('DEMO DATA · NOT ACCOUNT VERIFIED', width / 2, bottom - fontSize * 1.4, width * 0.88);
        context.fillText('LOCAL PNG · USER CONTROLLED', width / 2, bottom, width * 0.88);
      }
    }
    const output = canvas;
    return await new Promise<Blob>((resolve, reject) => {
      output.toBlob(blob => blob ? resolve(blob) : reject(new Error('The Passport PNG could not be encoded.')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
    if (image) image.onload = image.onerror = null;
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

/** Capture the approved vector face and its current material/engraving pose. */
export function captureShareSnapshot(node: HTMLElement, privacy: SharePrivacy): ShareSnapshot {
  const artwork = node.querySelector<SVGSVGElement>('svg.passport-holo-art');
  if (!artwork) throw new Error('The Passport artwork is not ready.');
  const clone = artwork.cloneNode(true) as SVGSVGElement;
  if (node.dataset?.optics === 'ready') {
    const material = node.querySelector<HTMLCanvasElement>('canvas.passport-optics-canvas');
    if (material) clone.querySelector('image')?.setAttribute('href', material.toDataURL('image/png'));
  }
  // Read visibility from the live tree, but remove only cloned hidden glyphs.
  // The decorative image is deliberately excluded: live CSS hides it when GPU
  // optics are ready, while the standalone SVG must retain that material layer.
  const sourceText = artwork.querySelectorAll('text, tspan');
  const clonedText = clone.querySelectorAll('text, tspan');
  sourceText.forEach((text, index) => {
    let current: Element | null = text;
    while (current) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
        || style.opacity === '0' || current.getAttribute('display') === 'none'
        || current.getAttribute('visibility') === 'hidden' || current.getAttribute('opacity') === '0') {
        clonedText[index].remove();
        break;
      }
      if (current === artwork) break;
      current = current.parentElement;
    }
  });
  const replaceText = (selector: string, replacement: (text: string) => string) => {
    clone.querySelectorAll(selector).forEach(text => {
      text.textContent = replacement(text.textContent ?? '');
      text.removeAttribute('textLength');
      text.removeAttribute('lengthAdjust');
    });
  };
  if (privacy.hideIdentity) replaceText('.passport-holo-identity', () => 'Private profile');
  if (privacy.hideMarkets) replaceText('.passport-holo-market', text => {
    const count = text.split(' · ').pop()?.trim() ?? '';
    // A truncated label cannot reveal its count. Never infer it from stale desc
    // metadata or leave part of a private market name behind.
    return /^\d[\d,]* reviewed trades?$/.test(count) ? count : 'Markets hidden';
  });
  const visibleText = Array.from(clone.querySelectorAll('text')).map(text => text.textContent?.trim()).filter(Boolean).join('. ');
  clone.querySelectorAll('metadata').forEach(metadata => metadata.remove());
  clone.querySelectorAll('title').forEach(title => { title.textContent = 'Cova Risk Passport'; });
  [clone, ...Array.from(clone.querySelectorAll('*'))].forEach(element => {
    for (const name of ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-description', 'title']) element.removeAttribute(name);
  });
  clone.querySelectorAll('desc').forEach(desc => { desc.textContent = visibleText; });
  clone.setAttribute('aria-label', visibleText);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', '1672');
  clone.setAttribute('height', '941');
  return Object.freeze({ svg: new XMLSerializer().serializeToString(clone), width: 1672, height: 941 });
}
