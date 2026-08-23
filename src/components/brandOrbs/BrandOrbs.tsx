import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import brandOrbsSource from "./brand-orbs-v2.html?raw";
import controlsSource from "./brand-orbs-controls.js?raw";

export type BrandOrbVariant = "x" | "instagram" | "email";
export type BrandOrbSize = "small" | "medium";

type BrandOrbsProps = {
  variant: BrandOrbVariant;
  size?: BrandOrbSize;
  speed?: number;
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
};

const ORB_PIXELS: Record<BrandOrbSize, number> = {
  small: 20,
  medium: 56,
};

const ORB_LABELS: Record<BrandOrbVariant, string> = {
  x: "X",
  instagram: "Instagram",
  email: "Email",
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function extractOrbEngine(source: string) {
  const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  return scripts[scripts.length - 1]?.[1] ?? "";
}

const orbEngine = extractOrbEngine(brandOrbsSource)
  .replace(/<\/script/gi, "<\\/script")
  .replace(
    "if (document.visibilityState !== \"hidden\")",
    "if (document.visibilityState !== \"hidden\" && !window.__BRAND_ORB_PAUSED)",
  );

function createOrbDocument(variant: BrandOrbVariant, size: BrandOrbSize) {
  const pixels = ORB_PIXELS[size];
  const encodedVariant = JSON.stringify(variant).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ORB_LABELS[variant]} Brand Orb</title>
<style>
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #050608; }
body { display: grid; place-items: center; }
canvas { display: block; width: ${pixels}px; height: ${pixels}px; }
</style>
<script>${controlsSource.replace(/<\/script/gi, "<\\/script")}<\/script>
</head>
<body>
<canvas data-mode=${encodedVariant} data-size="${pixels}" aria-hidden="true"></canvas>
<script>${orbEngine}<\/script>
</body>
</html>`;
}

export function BrandOrbs({
  variant,
  size = "medium",
  speed = 1,
  paused = false,
  className,
  style,
}: BrandOrbsProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const safeSpeed = clamp(speed, 0.1, 3);
  const shouldPause = paused || !isVisible || !documentVisible;
  const sourceDocument = useMemo(() => createOrbDocument(variant, size), [size, variant]);

  const syncControls = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "brand-orbs-controls",
        controls: { speed: safeSpeed, paused: shouldPause },
      },
      "*",
    );
  }, [safeSpeed, shouldPause]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry?.isIntersecting ?? true));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => setDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    syncControls();
  }, [sourceDocument, syncControls]);

  return (
    <iframe
      aria-hidden="true"
      className={className}
      loading="eager"
      onLoad={syncControls}
      ref={frameRef}
      sandbox="allow-scripts"
      srcDoc={sourceDocument}
      style={{
        display: "block",
        width: `${ORB_PIXELS[size]}px`,
        height: `${ORB_PIXELS[size]}px`,
        border: 0,
        background: "#050608",
        pointerEvents: "none",
        ...style,
      }}
      tabIndex={-1}
      title={`${ORB_LABELS[variant]} animated brand orb`}
    />
  );
}
