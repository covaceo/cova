import { Glass, type GlassOptics } from "@samasante/liquid-glass";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

const START_CTA_OPTICS: Partial<GlassOptics> = {
  mapSize: 256,
  clipToShape: true,
  softEdge: true,
  strength: 0.12,
  depth: 0.2,
  curvature: 0.55,
  bend: 0.25,
  bendWidth: 0.08,
  dispersion: 0.1,
  specular: 1,
  sheenAngle: 50,
  glow: 0.1,
  glowSpread: 1,
  glowFalloff: 1.5,
  sheen: 0.95,
  sheenWidth: 2,
  sheenFalloff: 1.5,
  frost: 3,
  brightness: 0,
};

type StartFreeButtonProps = {
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  icon?: boolean;
  onClick?: () => void;
};

export function StartFreeButton({
  children = "Start for free",
  className = "",
  compact = false,
  icon = false,
  onClick,
}: StartFreeButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [glassInView, setGlassInView] = useState(false);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      setGlassInView(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setGlassInView(entry ? entry.isIntersecting : true);
    }, { rootMargin: "220px" });

    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.button
      ref={buttonRef}
      className={`native-start-button ${compact ? "native-start-button-compact" : ""} ${className}`}
      onClick={onClick}
      type="button"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      {glassInView && (
        <Glass
          aria-hidden="true"
          className="native-start-button-optics"
          behind="#030711"
          filterResolution={1}
          maxDpr={1.25}
          optics={START_CTA_OPTICS}
          radius={999}
          refract={<span className="native-start-refract-source" />}
        />
      )}
      <span className="native-start-button-bloom" />
      <span className="native-start-button-copy">
        {children}
        {icon && <ArrowUpRight className="h-4 w-4" />}
      </span>
    </motion.button>
  );
}
