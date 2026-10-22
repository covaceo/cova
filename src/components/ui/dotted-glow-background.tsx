"use client";

import React, { useEffect, useRef, useState } from "react";

type DottedGlowBackgroundProps = {
  className?: string;
  /** distance between dot centers in pixels */
  gap?: number;
  /** base radius of each dot in CSS px */
  radius?: number;
  /** dot color (will pulse by alpha) */
  color?: string;
  /** optional dot color for dark mode */
  darkColor?: string;
  /** shadow/glow color for bright dots */
  glowColor?: string;
  /** optional glow color for dark mode */
  darkGlowColor?: string;
  /** optional CSS variable name for light dot color (e.g. --color-zinc-900) */
  colorLightVar?: string;
  /** optional CSS variable name for dark dot color (e.g. --color-zinc-100) */
  colorDarkVar?: string;
  /** optional CSS variable name for light glow color */
  glowColorLightVar?: string;
  /** optional CSS variable name for dark glow color */
  glowColorDarkVar?: string;
  /** global opacity for the whole layer */
  opacity?: number;
  /** background radial fade opacity (0 = transparent background) */
  backgroundOpacity?: number;
  /** minimum per-dot speed in rad/s */
  speedMin?: number;
  /** maximum per-dot speed in rad/s */
  speedMax?: number;
  /** global speed multiplier for all dots */
  speedScale?: number;
};

/**
 * Canvas-based dotted background that randomly glows and dims.
 * - Uses a stable grid of dots.
 * - Each dot gets its own phase + speed producing organic shimmering.
 * - Handles high-DPI and resizes via ResizeObserver.
 */
export const DottedGlowBackground = ({
  className,
  gap = 12,
  radius = 2,
  color = "rgba(0,0,0,0.7)",
  darkColor,
  glowColor = "rgba(0, 170, 255, 0.85)",
  darkGlowColor,
  colorLightVar,
  colorDarkVar,
  glowColorLightVar,
  glowColorDarkVar,
  opacity = 0.6,
  backgroundOpacity = 0,
  speedMin = 0.4,
  speedMax = 1.3,
  speedScale = 1,
}: DottedGlowBackgroundProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [resolvedColor, setResolvedColor] = useState<string>(color);
  const [resolvedGlowColor, setResolvedGlowColor] = useState<string>(glowColor);

  // Resolve CSS variable value from the container or root
  const resolveCssVariable = (
    el: Element,
    variableName?: string,
  ): string | null => {
    if (!variableName) return null;
    const normalized = variableName.startsWith("--")
      ? variableName
      : `--${variableName}`;
    const fromEl = getComputedStyle(el as Element)
      .getPropertyValue(normalized)
      .trim();
    if (fromEl) return fromEl;
    const root = document.documentElement;
    const fromRoot = getComputedStyle(root).getPropertyValue(normalized).trim();
    return fromRoot || null;
  };

  const detectDarkMode = (): boolean => {
    const root = document.documentElement;
    if (root.classList.contains("dark")) return true;
    if (root.classList.contains("light")) return false;
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  };

  // Keep resolved colors in sync with theme changes and prop updates
  useEffect(() => {
    const container = containerRef.current ?? document.documentElement;

    const compute = () => {
      const isDark = detectDarkMode();

      let nextColor: string = color;
      let nextGlow: string = glowColor;

      if (isDark) {
        const varDot = resolveCssVariable(container, colorDarkVar);
        const varGlow = resolveCssVariable(container, glowColorDarkVar);
        nextColor = varDot || darkColor || nextColor;
        nextGlow = varGlow || darkGlowColor || nextGlow;
      } else {
        const varDot = resolveCssVariable(container, colorLightVar);
        const varGlow = resolveCssVariable(container, glowColorLightVar);
        nextColor = varDot || nextColor;
        nextGlow = varGlow || nextGlow;
      }

      setResolvedColor(nextColor);
      setResolvedGlowColor(nextGlow);
    };

    compute();

    const mql = window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
    const handleMql = () => compute();
    mql?.addEventListener?.("change", handleMql);

    const mo = new MutationObserver(() => compute());
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => {
      mql?.removeEventListener?.("change", handleMql);
      mo.disconnect();
    };
  }, [
    color,
    darkColor,
    glowColor,
    darkGlowColor,
    colorLightVar,
    colorDarkVar,
    glowColorLightVar,
    glowColorDarkVar,
  ]);

  useEffect(() => {
    const el = canvasRef.current;
    const container = containerRef.current;
    if (!el || !container) return;

    const ctx = el.getContext("2d");
    if (!ctx) return;

    let raf = 0, stopped = false, isVisible = false;
    let width = 0, height = 0;
    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);
    let lastPaint = -Infinity;
    let dots: { x: number; y: number; phase: number; speed: number }[] = [];
    let backdrop: CanvasGradient | null = null;
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const draw = (now: number) => {
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = 1;
      if (backdrop) { ctx.globalAlpha = opacity; ctx.fillStyle = backdrop; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1; }
      const time = now / 1000 * Math.max(speedScale, 0);
      for (const dot of dots) {
        const mod = (time * dot.speed + dot.phase) % 2;
        const alpha = .25 + .55 * (mod < 1 ? mod : 2 - mod);
        ctx.fillStyle = resolvedColor;
        ctx.shadowColor = alpha > .6 ? resolvedGlowColor : 'transparent';
        ctx.shadowBlur = alpha > .6 ? 6 * ((alpha - .6) / .4) : 0;
        ctx.globalAlpha = alpha * opacity;
        ctx.beginPath(); ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2); ctx.fill();
      }
    };
    const schedule = () => {
      if (!raf && !stopped && isVisible && !document.hidden && speedScale > 0) raf = requestAnimationFrame(frame);
    };
    // Slow opacity shimmer does not need one paint per 120/180Hz display tick.
    // Wall-clock phase preserves the original speed; scrolling keeps full refresh.
    const frame = (now: number) => {
      raf = 0; if (stopped || !isVisible || document.hidden) return;
      if (now - lastPaint >= 1000 / 30) { draw(now); lastPaint = now; }
      schedule();
    };
    const sync = () => { stop(); lastPaint = -Infinity; if (!stopped && isVisible && !document.hidden) { draw(performance.now()); schedule(); } };
    const resize = () => {
      const bounds = container.getBoundingClientRect();
      if (width === bounds.width && height === bounds.height) return;
      width = bounds.width; height = bounds.height;
      el.width = Math.max(1, Math.floor(width * dpr));
      el.height = Math.max(1, Math.floor(height * dpr));
      el.style.width = `${Math.floor(width)}px`; el.style.height = `${Math.floor(height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      const cols = Math.ceil(width / gap) + 2, rows = Math.ceil(height / gap) + 2;
      const min = Math.min(speedMin, speedMax), max = Math.max(speedMin, speedMax);
      for (let i = -1; i < cols; i++) for (let j = -1; j < rows; j++) {
        dots.push({ x: i * gap + (j % 2 === 0 ? 0 : gap * .5), y: j * gap,
          phase: Math.random() * Math.PI * 2, speed: min + Math.random() * Math.max(max - min, 0) });
      }
      backdrop = null;
      if (backgroundOpacity > 0) {
        backdrop = ctx.createRadialGradient(width * .5, height * .4, Math.min(width, height) * .1, width * .5, height * .5, Math.max(width, height) * .7);
        backdrop.addColorStop(0, 'rgba(0,0,0,0)');
        backdrop.addColorStop(1, `rgba(0,0,0,${Math.min(Math.max(backgroundOpacity, 0), 1)})`);
      }
      sync();
    };
    const observer = new IntersectionObserver(entries => { isVisible = entries[0]?.isIntersecting ?? false; sync(); }, { threshold: 0 });
    const ro = new ResizeObserver(resize);
    resize(); ro.observe(container); observer.observe(container);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', sync);
    return () => { stopped = true; stop(); observer.disconnect(); ro.disconnect(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', sync); };
  }, [
    gap,
    radius,
    resolvedColor,
    resolvedGlowColor,
    opacity,
    backgroundOpacity,
    speedMin,
    speedMax,
    speedScale,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "absolute", inset: 0 }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
};
