export type HoloExportPreset = { id: string; width: number; height: number };

/** Serialize the actual vector face: one artwork, no parallel fallback recreation. */
export async function downloadHoloPassportPng(node: HTMLElement, preset: HoloExportPreset, filename: string, disclosure: string) {
  const artwork = node.querySelector<SVGSVGElement>("svg.passport-holo-art");
  if (!artwork) throw new Error("The Passport artwork is not ready.");
  if (!Number.isInteger(preset.width) || !Number.isInteger(preset.height) || preset.width <= 0 || preset.height <= 0) throw new Error("Invalid export dimensions.");
  // Freeze the selected mode before any await. Later UI changes must not
  // expose Flex fields in a download initiated from Ghost.
  const clone = artwork.cloneNode(true) as SVGSVGElement;
  // Capture material pixels synchronously too. The canvas is decorative only,
  // so changing privacy modes cannot introduce hidden text into this layer.
  if (node.dataset?.optics === "ready") {
    const canvas = node.querySelector<HTMLCanvasElement>("canvas.passport-optics-canvas");
    if (canvas) clone.querySelector("image")?.setAttribute("href", canvas.toDataURL("image/png"));
  }
  await document.fonts.ready;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "1672");
  clone.setAttribute("height", "941");
  // Live CSS is intentionally not copied. Every export-critical paint/font is
  // an SVG presentation attribute so the chosen viewport cannot alter the PNG.
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The Passport vector could not be rendered."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = preset.width;
    canvas.height = preset.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The export canvas is unavailable.");
    context.fillStyle = "#e8e9ed";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    context.drawImage(image, x, y, width, height);
    if (preset.id !== "card") {
      context.fillStyle = "#414b5b";
      context.font = "22px Arial, sans-serif";
      context.textAlign = "center";
      context.fillText(disclosure, canvas.width / 2, canvas.height - 70, canvas.width - 80);
    }
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
