declare module 'gifenc' {
  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: 'rgb565' | 'rgb444' }): number[][];
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: number[][], format?: 'rgb565' | 'rgb444'): Uint8Array;
  export function GIFEncoder(): {
    writeFrame(pixels: Uint8Array, width: number, height: number, options: { palette: number[][]; delay?: number; repeat?: number; dispose?: number }): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
    bytesView(): Uint8Array;
  };
}
