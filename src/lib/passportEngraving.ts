import type { OpticsPose } from './passportOptics';

/** Same directional light as the material shader, expressed for SVG's glyph
 * height-map lighting. No account data or glyph pixels enter the WebGL texture. */
export function engravingLight(pose: OpticsPose) {
  const finite = (n: number) => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  const x = -0.55 + finite(pose.x) * 1.7;
  const y = -0.6 + finite(pose.y) * 1.5;
  return {
    azimuth: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360,
    elevation: Math.atan2(1, Math.hypot(x, y)) * 180 / Math.PI,
  };
}

/** Pale pigment needs a dark cut wall because additive highlights saturate. */
export function isPaleEngravingInk(ink: string) {
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(ink)) return false;
  const hex = ink.length === 4 ? [...ink.slice(1)].map(c => c + c).join('') : ink.slice(1);
  const channels = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.7;
}

export function engravingShadowOffset(pose: OpticsPose) {
  const light = engravingLight(pose);
  const azimuth = light.azimuth * Math.PI / 180;
  const spread = 2.4 * Math.cos(light.elevation * Math.PI / 180);
  // Subtracting the oppositely shifted glyph reveals the inner incident-light wall.
  return { dx: -Math.cos(azimuth) * spread, dy: -Math.sin(azimuth) * spread };
}

export function paintEngravingLight(face: HTMLElement, pose: OpticsPose) {
  const light = engravingLight(pose);
  face.querySelectorAll('[data-engraving-light]').forEach(node => {
    node.setAttribute('azimuth', light.azimuth.toFixed(3));
    node.setAttribute('elevation', light.elevation.toFixed(3));
  });
  const shadow = engravingShadowOffset(pose);
  face.querySelectorAll('[data-engraving-shadow]').forEach(node => {
    node.setAttribute('dx', shadow.dx.toFixed(3));
    node.setAttribute('dy', shadow.dy.toFixed(3));
  });
}
