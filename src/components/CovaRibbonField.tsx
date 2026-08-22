import { useEffect, useRef, useState } from "react";
import { RIBBON_FIELD_FRAGMENT_SHADER, RIBBON_FIELD_VERTEX_SHADER } from "./covaRibbonFieldShaders";

type CovaRibbonFieldProps = {
  brightness?: number;
  className?: string;
  opacity?: number;
  pointerAmount?: number;
  smoothing?: number;
  speed?: number;
};

type RibbonOptions = Required<Omit<CovaRibbonFieldProps, "className">>;

const RIBBON_DEFAULTS: RibbonOptions = {
  brightness: 0.92,
  opacity: 0.94,
  pointerAmount: 0.72,
  smoothing: 0.035,
  speed: 0.78,
};

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create Cova Ribbon Field shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Cova Ribbon Field shader compilation failed.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function disposeRibbonResources(
  gl: WebGLRenderingContext,
  resources: {
    buffer?: WebGLBuffer | null;
    fragment?: WebGLShader | null;
    program?: WebGLProgram | null;
    vertex?: WebGLShader | null;
  },
) {
  if (resources.buffer) gl.deleteBuffer(resources.buffer);
  if (resources.program) gl.deleteProgram(resources.program);
  if (resources.vertex) gl.deleteShader(resources.vertex);
  if (resources.fragment) gl.deleteShader(resources.fragment);
}

export function createCovaRibbonFieldRenderer(canvas: HTMLCanvasElement, getOptions: () => RibbonOptions) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false });
  if (!gl) return null;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, RIBBON_FIELD_VERTEX_SHADER);
  let fragment: WebGLShader;
  try {
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, RIBBON_FIELD_FRAGMENT_SHADER);
  } catch (error) {
    gl.deleteShader(vertex);
    throw error;
  }
  const program = gl.createProgram();
  if (!program) {
    disposeRibbonResources(gl, { fragment, vertex });
    return null;
  }
  let buffer: WebGLBuffer | null = null;
  let position = -1;
  let resolution: WebGLUniformLocation | null = null;
  let time: WebGLUniformLocation | null = null;
  let pointer: WebGLUniformLocation | null = null;
  try {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Cova Ribbon Field program link failed.");
    }
    gl.useProgram(program);
    buffer = gl.createBuffer();
    if (!buffer) {
      disposeRibbonResources(gl, { fragment, program, vertex });
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    position = gl.getAttribLocation(program, "position");
    if (position < 0) throw new Error("Cova Ribbon Field position attribute is unavailable.");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    resolution = gl.getUniformLocation(program, "resolution");
    time = gl.getUniformLocation(program, "time");
    pointer = gl.getUniformLocation(program, "pointer");
    if (!resolution || !time || !pointer) throw new Error("Cova Ribbon Field uniforms are unavailable.");
  } catch (error) {
    disposeRibbonResources(gl, { buffer, fragment, program, vertex });
    throw error;
  }
  let pointerX = 0.72;
  let pointerY = 0.42;
  let targetX = 0.72;
  let targetY = 0.42;
  let startedAt = performance.now();

  const resize = (width: number, height: number) => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
  };

  const setPointer = (x: number, y: number) => {
    const amount = getOptions().pointerAmount;
    targetX = 0.72 + (x - 0.72) * amount;
    targetY = 0.42 + (y - 0.42) * amount;
  };

  const render = (now: number) => {
    const options = getOptions();
    pointerX += (targetX - pointerX) * options.smoothing;
    pointerY += (targetY - pointerY) * options.smoothing;
    gl.uniform1f(time, (now - startedAt) * 0.001 * options.speed);
    gl.uniform2f(pointer, pointerX, pointerY);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const resetClock = () => {
    startedAt = performance.now();
  };

  const dispose = () => {
    disposeRibbonResources(gl, { buffer, fragment, program, vertex });
  };

  return { dispose, render, resetClock, resize, setPointer };
}

export function CovaRibbonField({ className = "", ...props }: CovaRibbonFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const optionsRef = useRef<RibbonOptions>({ ...RIBBON_DEFAULTS, ...props });
  optionsRef.current = { ...RIBBON_DEFAULTS, ...props };
  const [renderState, setRenderState] = useState<"fallback" | "running" | "static">("fallback");

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    let renderer: ReturnType<typeof createCovaRibbonFieldRenderer>;
    try {
      renderer = createCovaRibbonFieldRenderer(canvas, () => optionsRef.current);
    } catch (error) {
      console.error("Cova Ribbon Field could not initialize.", error);
      setRenderState("fallback");
      return undefined;
    }
    if (!renderer) {
      setRenderState("fallback");
      return undefined;
    }

    let frame = 0;
    let visible = true;
    let lost = false;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;

    const resize = () => {
      if (lost) return;
      const bounds = host.getBoundingClientRect();
      renderer?.resize(bounds.width, bounds.height);
      renderer?.render(reducedMotion ? 5_400 : performance.now());
    };
    const schedule = () => {
      if (frame || !visible || document.hidden || reducedMotion || lost) return;
      frame = window.requestAnimationFrame(tick);
    };
    const tick = (now: number) => {
      frame = 0;
      renderer?.render(now);
      schedule();
    };
    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const handlePointer = (event: PointerEvent) => {
      if (reducedMotion || lost) return;
      const bounds = host.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
      const y = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / Math.max(1, bounds.height)));
      renderer?.setPointer(x, y);
      host.dataset.pointerX = x.toFixed(3);
      host.dataset.pointerY = y.toFixed(3);
    };
    const handleVisibility = () => document.hidden ? stop() : schedule();
    const handleMotionChange = () => {
      reducedMotion = motionQuery.matches;
      if (lost) {
        stop();
        setRenderState("fallback");
        return;
      }
      if (reducedMotion) {
        stop();
        setRenderState("static");
        renderer?.render(5_400);
      } else {
        renderer?.resetClock();
        setRenderState("running");
        schedule();
      }
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      stop();
      setRenderState("fallback");
    };
    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) schedule();
      else stop();
    }, { rootMargin: "100px" });

    resizeObserver.observe(host);
    intersectionObserver.observe(host);
    window.addEventListener("pointermove", handlePointer, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    motionQuery.addEventListener("change", handleMotionChange);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    resize();
    setRenderState(reducedMotion ? "static" : "running");
    schedule();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", handlePointer);
      document.removeEventListener("visibilitychange", handleVisibility);
      motionQuery.removeEventListener("change", handleMotionChange);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      renderer?.dispose();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`cova-ribbon-field${className ? ` ${className}` : ""}`}
      data-pointer-x="0.720"
      data-pointer-y="0.420"
      data-render-state={renderState}
      ref={hostRef}
    >
      <canvas ref={canvasRef} style={{ filter: `brightness(${optionsRef.current.brightness})`, opacity: optionsRef.current.opacity }} />
    </div>
  );
}
