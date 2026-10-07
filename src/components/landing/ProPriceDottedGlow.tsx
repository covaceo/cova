import { useSyncExternalStore } from "react";
import { DottedGlowBackground } from "../ui/dotted-glow-background";

const query = "(prefers-reduced-motion: reduce)";
function subscribe(notify: () => void) {
  const preference = window.matchMedia(query);
  preference.addEventListener("change", notify);
  return () => preference.removeEventListener("change", notify);
}
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => true;

export function ProPriceDottedGlow() {
  const reduced = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return <div className="minimal-pro-glow" data-pro-dotted-glow data-glow-motion={reduced ? "static" : "animated"} aria-hidden="true">
    <DottedGlowBackground
      color="rgba(112,146,195,0.45)"
      darkColor="rgba(112,146,195,0.45)"
      glowColor="rgba(77,124,255,0.6)"
      darkGlowColor="rgba(77,124,255,0.6)"
      speedScale={reduced ? 0 : 1}
    />
  </div>;
}
