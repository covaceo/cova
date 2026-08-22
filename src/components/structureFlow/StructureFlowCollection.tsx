import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { StructureFlowBackgroundProps } from "./StructureFlowBackground";

const StructureVariant = lazy(() =>
  import("./StructureFlowBackground").then((module) => ({ default: module.StructureFlowBackground })),
);

export type StructureFlowCollectionProps = StructureFlowBackgroundProps & {
  variant?: "structure-flow";
};

export function StructureFlowCollection({ className = "", variant: _variant = "structure-flow", ...props }: StructureFlowCollectionProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return undefined;
    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: "600px 0px" });
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  const fallback = (
    <div
      aria-hidden="true"
      className={`threeui-background structure-flow${className ? ` ${className}` : ""}`}
      data-render-state="booting"
    />
  );

  return (
    <div ref={slotRef} aria-hidden="true" className="structure-flow-collection-slot">
      {shouldLoad ? (
        <Suspense fallback={fallback}>
          <StructureVariant {...props} className={className} />
        </Suspense>
      ) : fallback}
    </div>
  );
}
