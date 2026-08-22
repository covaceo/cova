import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import covaLiquidMetalSource from "./cova-liquid-metal-signup.html?raw";

type CovaLiquidMetalSignupButtonProps = {
  className?: string;
  onClick: () => void;
  text?: string;
};

const BUTTON_HEIGHT = 52;
const SOURCE_HEIGHT_UNITS = 516;
const MIN_PILL_WIDTH_UNITS = 1407;
const FRAME_PADDING_PX = 46;

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export function CovaLiquidMetalSignupButton({
  className = "",
  onClick,
  text = "Sign up",
}: CovaLiquidMetalSignupButtonProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const intersectsRef = useRef(true);
  const [mounted, setMounted] = useState(true);
  const [ready, setReady] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const safeText = String(text).slice(0, 24) || "Sign up";
  const pillWidthUnits = Math.min(3000, Math.max(MIN_PILL_WIDTH_UNITS, 820 + safeText.length * 94));
  const pillWidthPx = Math.ceil(pillWidthUnits * (BUTTON_HEIGHT / SOURCE_HEIGHT_UNITS));
  const frameWidth = pillWidthPx + FRAME_PADDING_PX;
  const frameStyle = useMemo(() => ({
    "--cova-liquid-control-width": `${pillWidthPx}px`,
    "--cova-liquid-frame-width": `${frameWidth}px`,
  }) as CSSProperties, [frameWidth, pillWidthPx]);

  const syncConfig = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({
      liquidMetalButton: {
        idleMotionScale: 0.12,
        pillWidthUnits,
        reducedMotion,
        text: safeText,
      },
    }, "*");
  }, [pillWidthUnits, reducedMotion, safeText]);

  useEffect(() => {
    const receiveMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = event.data?.liquidMetalButton;
      if (!message) return;
      if (message.type === "activate") {
        onClick();
        return;
      }
      if (message.type === "ready") {
        setReady(Boolean(message.webgl));
        return;
      }
      if (message.type === "unavailable") setReady(false);
    };
    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, [onClick]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const syncVisibility = () => setMounted(intersectsRef.current && document.visibilityState !== "hidden");
    const observer = new IntersectionObserver(([entry]) => {
      intersectsRef.current = entry?.isIntersecting ?? true;
      syncVisibility();
    }, { rootMargin: "80px" });
    observer.observe(host);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (!mounted) setReady(false);
  }, [mounted]);

  useEffect(() => {
    if (mounted) syncConfig();
  }, [mounted, syncConfig]);

  return (
    <div
      className={`cova-liquid-metal-signup${className ? ` ${className}` : ""}`}
      data-state={!mounted ? "paused" : ready ? "ready" : "fallback"}
      ref={hostRef}
      style={frameStyle}
    >
      <button
        aria-hidden={ready}
        className="cova-liquid-metal-signup__fallback"
        onClick={onClick}
        tabIndex={ready ? -1 : 0}
        type="button"
      >
        <span>{safeText}</span>
        <ArrowUpRight aria-hidden="true" />
      </button>
      {mounted ? (
        <iframe
          aria-hidden={!ready}
          className={`cova-liquid-metal-signup__frame${ready ? " is-ready" : ""}`}
          onLoad={syncConfig}
          ref={frameRef}
          sandbox="allow-scripts"
          srcDoc={covaLiquidMetalSource}
          title={`Cova ${safeText} button`}
        />
      ) : null}
    </div>
  );
}
