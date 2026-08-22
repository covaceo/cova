import { useEffect, useRef } from "react";
import {
  createStructureFlowRenderer,
  STRUCTURE_FLOW_DEFAULTS,
  type StructureFlowOptions,
} from "./structureFlowRenderer";

export type StructureFlowBackgroundProps = Partial<StructureFlowOptions> & {
  className?: string;
};

type StructureFlowRenderer = ReturnType<typeof createStructureFlowRenderer>;

export function StructureFlowBackground({ className = "", ...props }: StructureFlowBackgroundProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const optionsRef = useRef({ ...STRUCTURE_FLOW_DEFAULTS, ...props });
  optionsRef.current = { ...STRUCTURE_FLOW_DEFAULTS, ...props };

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderer: StructureFlowRenderer | null = null;
    let frame = 0;
    let visible = true;
    let disposed = false;

    const setRenderState = (state: "booting" | "fallback" | "running" | "static") => {
      host.dataset.renderState = state;
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const render = () => renderer?.render();

    const tick = () => {
      frame = 0;
      if (disposed || !renderer || !visible || document.hidden || reducedMotion.matches) return;
      renderer.render();
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!renderer || !visible || document.hidden || reducedMotion.matches) {
        if (renderer && reducedMotion.matches) {
          renderer.render();
          setRenderState("static");
        }
        return;
      }
      setRenderState("running");
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const resize = () => {
      if (!renderer) return;
      const bounds = host.getBoundingClientRect();
      renderer.resize(bounds.width, bounds.height);
      render();
    };

    const initialize = () => {
      stop();
      renderer?.dispose();
      renderer = null;
      setRenderState("booting");
      try {
        renderer = createStructureFlowRenderer(canvas, () => optionsRef.current);
        resize();
        start();
      } catch {
        setRenderState("fallback");
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
      else stop();
    });
    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    const handleMotion = () => {
      stop();
      if (renderer) {
        renderer.render();
        setRenderState(reducedMotion.matches ? "static" : "running");
      }
      start();
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      stop();
      setRenderState("fallback");
    };
    const handleContextRestored = () => {
      requestAnimationFrame(() => {
        if (disposed || !renderer) return;
        const bounds = host.getBoundingClientRect();
        visible = bounds.bottom > 0 && bounds.top < window.innerHeight;
        try {
          renderer.resize(bounds.width, bounds.height);
          renderer.render();
          setRenderState(reducedMotion.matches ? "static" : "running");
          start();
        } catch {
          setRenderState("fallback");
        }
      });
    };

    resizeObserver.observe(host);
    intersection.observe(host);
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotion.addEventListener("change", handleMotion);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    initialize();

    return () => {
      disposed = true;
      stop();
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", handleMotion);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      renderer?.dispose();
      renderer = null;
    };
  }, []);

  const options = optionsRef.current;
  const mask = `linear-gradient(to bottom, transparent ${options.maskStart * 100}%, black ${options.maskSolid * 100}%, black 100%)`;

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`threeui-background structure-flow${className ? ` ${className}` : ""}`}
      data-render-state="booting"
      style={{ opacity: 0.8, WebkitMaskImage: mask, maskImage: mask }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
