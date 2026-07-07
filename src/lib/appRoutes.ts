import { useEffect, useState } from "react";

export const sections = ["overview", "features", "pricing", "resources", "community", "dashboard", "import", "oauth", "rules", "coach", "passport"] as const;
const protectedSections = ["dashboard", "import", "oauth", "rules", "coach", "passport"] as const satisfies readonly Section[];
export type Section = (typeof sections)[number];
export function isProtectedSection(section: Section) {
  return protectedSections.includes(section as (typeof protectedSections)[number]);
}

export function useHashSection(): [Section, (section: Section) => void] {
  const read = () => {
    const raw = window.location.hash.replace("#", "");
    return sections.includes(raw as Section) ? raw as Section : "overview";
  };
  const [section, setSectionState] = useState<Section>(read);
  const scrollToTop = () => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };
  useEffect(() => {
    const onHash = () => {
      setSectionState(read());
      scrollToTop();
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);
  const setSection = (next: Section) => {
    if (read() === next) {
      scrollToTop();
      return;
    }
    window.history.pushState(null, "", `#${next}`);
    setSectionState(next);
    scrollToTop();
  };
  return [section, setSection];
}

