import type { RecapTransform } from './recapBackground';
export type PreparedRecapGif = { file: File; poster: string; width: number; height: number };
type Result = { poster?: Blob; width?: number; height?: number; blob?: Blob; error?: string; progress?: number };
function gifJob(data: object, signal?: AbortSignal, progress?: (value: number) => void, transfers: Transferable[] = []): Promise<Result> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { transfers.forEach(t => { if (t instanceof ImageBitmap) t.close(); }); reject(new DOMException('Cancelled', 'AbortError')); return; }
    let worker: Worker;
    try { worker = new Worker(new URL('./recapGif.worker.ts', import.meta.url), { type: 'module' }); }
    catch { transfers.forEach(t => { if (t instanceof ImageBitmap) t.close(); }); reject(new Error('GIF export is unavailable in this browser. Try an updated browser or download PNG.')); return; }
    const finish = (error?: Error, result?: Result) => { clearTimeout(timer); worker.terminate(); signal?.removeEventListener('abort', cancel); error ? reject(error) : resolve(result!); };
    const cancel = () => finish(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('This GIF took too long. Choose a shorter or smaller file.')), 'overlay' in data ? 120000 : 15000);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onerror = () => finish(new Error('GIF export is unavailable in this browser. Try an updated browser or download PNG.'));
    worker.onmessage = ({ data: result }: MessageEvent<Result>) => {
      if (result.progress !== undefined) { progress?.(result.progress); return; }
      finish(result.error ? new Error(result.error) : undefined, result);
    };
    try { worker.postMessage(data, transfers); } catch { transfers.forEach(t => { if (t instanceof ImageBitmap) t.close(); }); finish(new Error('GIF export could not start. Try another file.')); }
  });
}
export async function prepareRecapGif(file: File, signal?: AbortSignal): Promise<PreparedRecapGif> {
  if (file.type !== 'image/gif' || !file.size || file.size > 8 * 1024 * 1024) throw new Error('Choose a GIF under 8 MB.');
  const buffer = await file.arrayBuffer();
  const result = await gifJob({ buffer }, signal, undefined, [buffer]);
  return { file, poster: URL.createObjectURL(result.poster!), width: result.width!, height: result.height! };
}
export async function exportRecapGif(file: File, foreground: Blob, width: number, height: number, transform: RecapTransform, signal: AbortSignal, progress: (value: number) => void) {
  const buffer = await file.arrayBuffer(), overlay = await createImageBitmap(foreground);
  const result = await gifJob({ buffer, overlay, width, height, transform }, signal, progress, [buffer, overlay]);
  return result.blob!;
}
