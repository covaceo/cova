import { useEffect, useRef, useState } from "react";

export const sections = ["overview", "features", "pricing", "resources", "community", "privacy", "terms", "security", "disclosures", "dashboard", "import", "oauth", "rules", "coach", "passport"] as const;
const protectedSections = ["dashboard", "import", "oauth", "rules", "coach", "passport"] as const satisfies readonly Section[];
export type Section = (typeof sections)[number];
export function isWorkspaceNavActive(section: Section, itemId: Section) {
  return section === itemId || (section === "oauth" && itemId === "import");
}
export function isProtectedSection(section: Section) {
  return protectedSections.includes(section as (typeof protectedSections)[number]);
}

type HashSection = {
  section: Section;
  documentAnchor: string | null;
};

function readHashSection(): HashSection {
  const raw = window.location.hash.replace("#", "");
  if (sections.includes(raw as Section)) {
    return { section: raw as Section, documentAnchor: null };
  }
  const legalAnchor = raw.match(/^legal-(privacy|terms|security)-\d+$/);
  if (legalAnchor) {
    return { section: legalAnchor[1] as Section, documentAnchor: raw };
  }
  return { section: "overview", documentAnchor: null };
}

export function useHashSection(): [Section, (section: Section) => void] {
  const [section, setSectionState] = useState<Section>(() => readHashSection().section);
  const scrollFrame = useRef<number | null>(null);
  const scheduleScroll = (action: () => void) => {
    if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = null;
      action();
    });
  };
  // Runs after the destination commit; no smooth transit over the outgoing page.
  const scrollToTop = () => scheduleScroll(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const scrollToDocumentAnchor = (documentAnchor: string) => scheduleScroll(() => {
    document.getElementById(documentAnchor)?.scrollIntoView({ block: "start", behavior: "instant" });
  });

  useEffect(() => {
    const syncHash = () => {
      const next = readHashSection();
      setSectionState(next.section);
      if (next.documentAnchor) {
        scrollToDocumentAnchor(next.documentAnchor);
      } else {
        scrollToTop();
      }
    };
    const initial = readHashSection();
    if (initial.documentAnchor) {
      scrollToDocumentAnchor(initial.documentAnchor);
    }
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current);
    };
  }, []);

  const setSection = (next: Section) => {
    const current = readHashSection();
    if (current.section === next && !current.documentAnchor) {
      scrollToTop();
      return;
    }
    window.history.pushState(null, "", `#${next}`);
    setSectionState(next);
    scrollToTop();
  };
  return [section, setSection];
}
