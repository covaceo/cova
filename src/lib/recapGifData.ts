import { parseGIF, type ParsedGif } from 'gifuct-js';
type GifFrame = Extract<ParsedGif['frames'][number], { image: unknown }>;
export const recapGifDelay = (frame: GifFrame) => frame.gce?.delay >= 2 ? frame.gce.delay * 10 : 100;
/** Inspect compressed frame descriptors before any decompression/allocation. Run in a worker. */
export function inspectRecapGif(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const header = String.fromCharCode(...bytes.slice(0, 6));
  if (!['GIF87a', 'GIF89a'].includes(header) || bytes.length < 14 || bytes[bytes.length - 1] !== 0x3b) throw new Error('Choose a valid GIF.');
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Choose a GIF under 8 MB.');
  const raw = new DataView(buffer), width = raw.getUint16(6, true), height = raw.getUint16(8, true);
  if (!width || !height || width * height > 4000000) throw new Error('Choose a smaller GIF (up to 4 megapixels).');
  let parsed: ParsedGif;
  try { parsed = parseGIF(buffer); } catch { throw new Error('Choose a valid GIF.'); }
  const frames = parsed.frames.filter((f): f is GifFrame => 'image' in f);
  if (!frames.length) throw new Error('Choose a valid GIF.');
  if (frames.length > 180 || width * height * frames.length > 80000000) throw new Error('Choose a shorter or smaller GIF (up to 180 frames).');
  let duration = 0;
  for (const frame of frames) {
    const d = frame.image.descriptor;
    if (!d.width || !d.height || d.left + d.width > width || d.top + d.height > height || frame.image.data.minCodeSize < 2 || frame.image.data.minCodeSize > 8 || !frame.image.data.blocks.length) throw new Error('Choose a valid GIF.');
    duration += recapGifDelay(frame);
  }
  if (duration > 15000) throw new Error('Choose a GIF up to 15 seconds long.');
  return { parsed, frames, width, height, duration };
}
