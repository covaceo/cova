import { decompressFrame } from 'gifuct-js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { inspectRecapGif, recapGifDelay } from './recapGifData';
import { recapBackgroundRect, type RecapTransform } from './recapBackground';

type Job = { buffer: ArrayBuffer; overlay?: ImageBitmap; width?: number; height?: number; transform?: RecapTransform };
self.onmessage = async ({ data }: MessageEvent<Job>) => {
  try {
    const { parsed, frames, width, height } = inspectRecapGif(data.buffer);
    const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d')!;
    const patch = new OffscreenCanvas(1, 1), pctx = patch.getContext('2d')!;
    const out = data.overlay ? new OffscreenCanvas(data.width!, data.height!) : null;
    const octx = out?.getContext('2d', { willReadFrequently: true });
    const encoder = data.overlay ? GIFEncoder() : null;
    const background = parsed.gct?.[parsed.lsd.backgroundColorIndex];
    const clear = (transparent: boolean, x: number, y: number, w: number, h: number) => {
      ctx.clearRect(x, y, w, h);
      if (!transparent && background) { ctx.fillStyle = `rgb(${background.join(',')})`; ctx.fillRect(x, y, w, h); }
    };
    clear(Boolean(frames[0].gce?.extras.transparentColorGiven), 0, 0, width, height);
    for (let i = 0; i < frames.length; i++) {
      const frame = decompressFrame(frames[i], parsed.gct, true);
      const d = frame.dims;
      const previous = frame.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;
      patch.width = d.width; patch.height = d.height;
      pctx.putImageData(new ImageData(new Uint8ClampedArray(frame.patch), d.width, d.height), 0, 0);
      ctx.drawImage(patch, d.left, d.top);
      if (!encoder) {
        // Decode the first frame to a deterministic PNG for paused preview and still export.
        const poster = await canvas.convertToBlob({ type: 'image/png' });
        self.postMessage({ poster, width, height });
        return;
      }
      const r = recapBackgroundRect(width, height, out!.width, out!.height, data.transform);
      octx!.fillStyle = '#080d12'; octx!.fillRect(0, 0, out!.width, out!.height);
      octx!.drawImage(canvas, r.x, r.y, r.width, r.height);
      octx!.drawImage(data.overlay!, 0, 0, out!.width, out!.height);
      const pixels = octx!.getImageData(0, 0, out!.width, out!.height).data;
      const palette = quantize(pixels, 256, { format: 'rgb565' });
      encoder.writeFrame(applyPalette(pixels, palette, 'rgb565'), out!.width, out!.height, { palette, delay: recapGifDelay(frames[i]), repeat: 0, dispose: 1 });
      if (encoder.bytesView().length > 40 * 1024 * 1024) throw new Error('This export is too large. Choose a shorter or smaller GIF.');
      self.postMessage({ progress: Math.round((i + 1) / frames.length * 100) });
      if (frame.disposalType === 2) clear(frame.transparentIndex !== undefined, d.left, d.top, d.width, d.height);
      else if (previous) ctx.putImageData(previous, 0, 0);
    }
    encoder!.finish();
    self.postMessage({ blob: new Blob([encoder!.bytes()], { type: 'image/gif' }) });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : 'This GIF could not be prepared. Choose another file.' }); }
  finally { data.overlay?.close(); }
};
