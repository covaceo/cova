export type RecapTransform = { zoom: number; x: number; y: number };
export const defaultRecapTransform: RecapTransform = { zoom: 1, x: 0, y: 0 };
export function clampRecapTransform(value: RecapTransform): RecapTransform {
  const clamp = (n: number, min: number, max: number, fallback: number) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  return { zoom: clamp(value.zoom, 1, 3, 1), x: clamp(value.x, -1, 1, 0), y: clamp(value.y, -1, 1, 0) };
}
/** Normalized pan reaches both crop edges at every format and zoom. */
export function recapBackgroundRect(sw: number, sh: number, width: number, height: number, value = defaultRecapTransform) {
  const t = clampRecapTransform(value);
  const scale = Math.max(width / sw, height / sh) * t.zoom;
  const w = sw * scale, h = sh * scale;
  return { x: (width - w) * (1 - t.x) / 2 || 0, y: (height - h) * (1 - t.y) / 2 || 0, width: w, height: h };
}
