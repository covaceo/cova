import { useLayoutEffect, useRef } from "react";

/** One retained compositor layer, independent of tab/panel mount lifecycles. */
export function FeaturesTabHighlight({ activeId }: { activeId: string }) {
  const highlightRef = useRef<HTMLSpanElement>(null);
  const geometryRef = useRef("");

  function position(animate: boolean) {
    const highlight = highlightRef.current;
    const rail = highlight?.parentElement;
    const tab = rail?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
    if (!rail || !highlight || !tab) return;
    const bounds = rail.getBoundingClientRect();
    const target = tab.getBoundingClientRect();
    const css = getComputedStyle(tab);
    const left = parseFloat(css.borderLeftWidth), top = parseFloat(css.borderTopWidth);
    // Rail-content coordinates: horizontal reveal scrolling must not retarget
    // the pill, and route entrance translation must cancel out of measurement.
    const x = target.left - bounds.left + rail.scrollLeft - rail.clientLeft + left;
    const y = target.top - bounds.top + rail.scrollTop - rail.clientTop + top;
    const width = target.width - left - parseFloat(css.borderRightWidth);
    const height = target.height - top - parseFloat(css.borderBottomWidth);
    const geometry = [x, y, width, height].join(",");
    if (geometry === geometryRef.current) return;
    geometryRef.current = geometry;
    const snap = !animate || highlight.dataset.ready !== "true";
    if (snap) highlight.style.transition = "none";
    highlight.style.width = `${width}px`;
    highlight.style.height = `${height}px`;
    highlight.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    highlight.dataset.ready = "true";
    if (snap) {
      // Commit first mount / responsive reflow without a diagonal fly-in.
      highlight.getBoundingClientRect();
      highlight.style.removeProperty("transition");
    }
  }

  useLayoutEffect(() => {
    const rail = highlightRef.current?.parentElement;
    if (!rail) return;
    position(false);
    const observer = new ResizeObserver(() => position(false));
    observer.observe(rail);
    rail.querySelectorAll('[role="tab"]').forEach(tab => observer.observe(tab));
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => { position(true); }, [activeId]);

  return <span aria-hidden="true" className="features-system-tab-highlight" ref={highlightRef} />;
}
