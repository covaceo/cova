import { opticsFragmentShader, opticsVertexShader } from "./passportOpticsShader";

export type OpticsPose = { x: number; y: number };
const neutral = (): OpticsPose => ({ x: 0, y: 0 });
export function opticsTarget(x: number, y: number): OpticsPose {
  const bound = (value: number) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  return { x: bound(x), y: bound(y) };
}
export function advanceOptics(pose: OpticsPose, target: OpticsPose, elapsedMs: number): OpticsPose {
  const alpha = 1 - Math.exp(-Math.max(0, Math.min(elapsedMs, 64)) / 70);
  const advance = (from: number, to: number) => Math.abs(from - to) < 0.0005 ? to : from + (to - from) * alpha;
  return { x: advance(pose.x, target.x), y: advance(pose.y, target.y) };
}
export function opticsTransform(pose: OpticsPose) {
  return pose.x === 0 && pose.y === 0 ? "none" : `perspective(1800px) rotateX(${-pose.y * 6}deg) rotateY(${pose.x * 8}deg) scale(0.985)`;
}

/** Progressive enhancement: the SVG remains fully usable if WebGL is unavailable. */
export function mountPassportOptics(face: HTMLDivElement, canvas: HTMLCanvasElement, materialUrl: string, settings?: { film: number; refraction: number; gloss: number; finishIndex: number; tone?: [number, number, number, number]; light?: [number, number, number, number]; engraved?: boolean; onPose?: (pose: OpticsPose) => void }) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const rasterStage = settings?.engraved && face.parentElement?.matches?.('.passport-workspace-stage') ? face.parentElement : null;
  let rasterDensity = 1, displayWidth = 0;
  function clearRaster() {
    rasterDensity = 1;
    if (rasterStage) { face.style.width = ""; face.style.transformOrigin = ""; }
  }
  function faceTransform(value: OpticsPose) {
    if (rasterDensity === 1) return opticsTransform(value);
    const scale = `scale(${1 / rasterDensity})`;
    if (value.x === 0 && value.y === 0) return scale;
    // The larger paint surface has the identical projected size and perspective.
    return `translate(${displayWidth / 2}px, ${displayWidth * 941 / 1672 / 2}px) ${scale} perspective(${1800 * rasterDensity}px) rotateX(${-value.y * 6}deg) rotateY(${value.x * 8}deg) scale(0.985) translate(-50%, -50%)`;
  }
  let disposed = false, ready = false, visible = true, loaded = false;
  let pose = neutral(), target = neutral(), raf = 0, previous = 0, motion = 0;
  let activePointer: number | null = null;
  let gl: WebGLRenderingContext | null = null;
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null, texture: WebGLTexture | null = null;
  const shaders: WebGLShader[] = [];
  let tiltUniform: WebGLUniformLocation | null = null, motionUniform: WebGLUniformLocation | null = null;
  const image = new Image();
  const cleanups: (() => void)[] = [];
  const listen = (node: EventTarget, type: string, handler: EventListener) => {
    node.addEventListener(type, handler);
    cleanups.push(() => node.removeEventListener(type, handler));
  };
  const status = (value: string) => { face.dataset.optics = value; };
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; previous = 0; }
  function clearMotion() { motion = 0; face.dataset.opticsMotion = "0.0000"; settings?.onPose?.(neutral()); }
  function fallback(value = "fallback") { stop(); clearMotion(); clearRaster(); ready = false; face.style.transform = "none"; status(value); }
  function freeGpu() {
    if (!gl) return;
    shaders.splice(0).forEach(shader => gl!.deleteShader(shader));
    if (program) gl.deleteProgram(program);
    if (buffer) gl.deleteBuffer(buffer);
    if (texture) gl.deleteTexture(texture);
    program = null; buffer = null; texture = null;
  }
  function draw() {
    if (!ready || !gl || !program || reduced.matches || document.hidden || !visible) return;
    gl.useProgram(program);
    gl.uniform2f(tiltUniform, pose.x, pose.y);
    gl.uniform1f(motionUniform, motion);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    face.style.transform = faceTransform(pose);
    face.dataset.opticsX = pose.x.toFixed(4);
    face.dataset.opticsY = pose.y.toFixed(4);
    face.dataset.opticsMotion = motion.toFixed(4);
    settings?.onPose?.(pose);
    status("ready");
  }
  function frame(now: number) {
    raf = 0;
    if (disposed || !ready || reduced.matches || document.hidden || !visible) return;
    const elapsed = previous ? Math.max(1, now - previous) : 16;
    const next = advanceOptics(pose, target, elapsed);
    // Velocity, not angle: a held tilt must become exactly clean. A bounded
    // 240ms fade finishes even after the spring stops, then the RAF loop ends.
    const speed = Math.hypot(next.x - pose.x, next.y - pose.y) * 1000 / elapsed;
    motion = (settings?.finishIndex ?? 0) > 0
      ? Math.max(speed > 0.02 ? Math.min(1, speed / 1.8) : 0, motion - elapsed / 240, 0)
      : 0;
    pose = next;
    previous = now;
    draw();
    if (pose.x !== target.x || pose.y !== target.y || motion > 0) raf = requestAnimationFrame(frame);
    else previous = 0;
  }
  function schedule() {
    if (!raf && ready && !disposed && !reduced.matches && !document.hidden && visible) raf = requestAnimationFrame(frame);
  }
  function reset() { target = neutral(); activePointer = null; schedule(); }
  function resize() {
    if (!gl || !ready || reduced.matches) return;
    // Match retina displays instead of enlarging a 1.5x buffer. Keep a bounded
    // allocation and respect the device's renderbuffer limit; artwork is unchanged.
    const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const maxWidth = Math.min(3344, Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 3344);
    displayWidth = rasterStage ? rasterStage.getBoundingClientRect().width : face.clientWidth;
    const width = Math.max(1, Math.min(maxWidth, Math.round(displayWidth * pixelRatio)));
    const height = Math.round(width * 941 / 1672);
    if (rasterStage) {
      // Chromium can flatten a 3D face at CSS-pixel resolution even with a
      // retina canvas. Give text and material the same bounded raster basis.
      rasterDensity = Math.max(1, width / Math.max(1, displayWidth));
      face.style.width = rasterDensity > 1 ? `${width}px` : "";
      face.style.transformOrigin = rasterDensity > 1 ? "0 0" : "";
    }
    if (canvas.width !== width || canvas.height !== height) {
      // Resizing clears the buffer. Until draw succeeds, export the SVG fallback.
      status("suspended"); canvas.width = width; canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    draw();
  }
  function initialize() {
    if (disposed || !loaded || reduced.matches) { if (reduced.matches) status("reduced-motion"); return; }
    try {
      gl ??= canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: "low-power" });
      if (!gl || gl.isContextLost()) { fallback(); return; }
      freeGpu();
      const compile = (type: number, source: string) => {
        const shader = gl!.createShader(type);
        if (!shader) throw new Error("Shader allocation failed");
        shaders.push(shader); gl!.shaderSource(shader, source); gl!.compileShader(shader);
        if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(shader) || "Shader compilation failed");
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, opticsVertexShader), fragment = compile(gl.FRAGMENT_SHADER, opticsFragmentShader);
      program = gl.createProgram(); buffer = gl.createBuffer(); texture = gl.createTexture();
      if (!program || !buffer || !texture) throw new Error("Material allocation failed");
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Material linking failed");
      gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      gl.uniform1i(gl.getUniformLocation(program, "u_material"), 0);
      gl.uniform2f(gl.getUniformLocation(program, "u_texel"), 1 / image.naturalWidth, 1 / image.naturalHeight);
      // Etched plates are opaque: preserve their fine registered lines while
      // moving light and tilt remain active. Refraction belongs to legacy glass.
      gl.uniform4f(gl.getUniformLocation(program, "u_finish"), settings?.film ?? 1, settings?.engraved ? 0 : settings?.refraction ?? 1, settings?.gloss ?? 48, settings?.finishIndex ?? 0);
      gl.uniform4f(gl.getUniformLocation(program, "u_tone"), ...(settings?.tone ?? [1,1,1,0] as const));
      gl.uniform4f(gl.getUniformLocation(program, "u_light"), ...(settings?.light ?? [10,0.14,0.14,0.22] as const));
      gl.uniform1f(gl.getUniformLocation(program, "u_engraved"), settings?.engraved ? 1 : 0);
      tiltUniform = gl.getUniformLocation(program, "u_tilt");
      motionUniform = gl.getUniformLocation(program, "u_motion");
      clearMotion();
      ready = true; pose = neutral(); target = neutral(); resize(); schedule();
    } catch { freeGpu(); fallback(); }
  }
  function point(event: PointerEvent) {
    if (event.pointerType === "touch" && activePointer !== event.pointerId) return;
    // Use the untransformed owner, not the moving face, to avoid input feedback.
    const box = (face.parentElement ?? face).getBoundingClientRect();
    target = opticsTarget((event.clientX - box.left) / box.width * 2 - 1, (event.clientY - box.top) / box.height * 2 - 1);
    schedule();
  }
  listen(face, "pointermove", event => point(event as PointerEvent));
  listen(face, "pointerdown", event => {
    const pointer = event as PointerEvent;
    if (!pointer.isPrimary || pointer.button !== 0) return;
    if (pointer.pointerType === "touch") {
      activePointer = pointer.pointerId;
      face.setPointerCapture(pointer.pointerId);
    }
    point(pointer);
  });
  listen(face, "pointerleave", () => { if (activePointer === null) reset(); });
  const releasePointer: EventListener = event => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType === "touch" && pointer.pointerId !== activePointer) return;
    reset();
  };
  listen(face, "pointerup", releasePointer); listen(face, "pointercancel", releasePointer); listen(face, "lostpointercapture", releasePointer);
  listen(face, "blur", reset);
  listen(face, "keydown", event => {
    const key = event as KeyboardEvent;
    if (key.altKey || key.ctrlKey || key.metaKey || reduced.matches || !ready) return;
    const delta: Record<string, OpticsPose> = { ArrowLeft: {x:-0.25,y:0}, ArrowRight: {x:0.25,y:0}, ArrowUp: {x:0,y:-0.25}, ArrowDown: {x:0,y:0.25} };
    if (key.key === "Home" || key.key === "Escape") { key.preventDefault(); reset(); }
    else if (delta[key.key]) { key.preventDefault(); target = opticsTarget(target.x + delta[key.key].x, target.y + delta[key.key].y); schedule(); }
  });
  listen(document, "visibilitychange", () => { if (document.hidden) { stop(); clearMotion(); target = neutral(); pose = neutral(); face.style.transform = faceTransform(neutral()); } else { draw(); schedule(); } });
  listen(reduced, "change", () => {
    stop(); clearMotion(); clearRaster(); pose = neutral(); target = neutral(); face.style.transform = "none";
    if (reduced.matches) status("reduced-motion");
    else if (ready) { resize(); schedule(); } else initialize();
  });
  listen(canvas, "webglcontextlost", event => {
    event.preventDefault(); fallback("context-lost");
    // Context loss already destroys these resources. Deleting their old handles
    // after restoration raises INVALID_OPERATION on the new context generation.
    shaders.length = 0; program = null; buffer = null; texture = null; tiltUniform = null; motionUniform = null;
  });
  listen(canvas, "webglcontextrestored", initialize);
  const observer = new ResizeObserver(resize); observer.observe(face);
  if (rasterStage) observer.observe(rasterStage); // The raster face itself has a fixed pixel width.
  listen(window, "resize", resize); // Zoom/display density can change without a CSS-width change.
  const intersection = new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? false;
    if (!visible) { stop(); clearMotion(); target = neutral(); pose = neutral(); face.style.transform = faceTransform(neutral()); }
    else { draw(); schedule(); }
  });
  intersection.observe(face);
  image.onload = () => { if (disposed) return; loaded = true; initialize(); };
  image.onerror = () => fallback();
  status(reduced.matches ? "reduced-motion" : "loading");
  // Avoid even allocating/loading the decorative GPU texture for reduced motion.
  if (!reduced.matches) image.src = materialUrl;
  const loadWhenEnabled = () => { if (!reduced.matches && !image.src) image.src = materialUrl; };
  listen(reduced, "change", loadWhenEnabled);
  return () => {
    disposed = true; stop(); observer.disconnect(); intersection.disconnect();
    cleanups.forEach(cleanup => cleanup()); image.onload = null; image.onerror = null;
    freeGpu(); fallback();
  };
}
