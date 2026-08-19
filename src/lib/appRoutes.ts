import { useEffect, useState } from "react";

export const sections = ["overview", "features", "pricing", "resources", "community", "privacy", "terms", "security", "checkout", "dashboard", "import", "oauth", "rules", "coach", "practice", "passport"] as const;
const protectedSections = ["checkout", "dashboard", "import", "oauth", "rules", "coach", "practice", "passport"] as const satisfies readonly Section[];
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
  const scrollToTop = () => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };
  const scrollToDocumentAnchor = (documentAnchor: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(documentAnchor)?.scrollIntoView({ block: "start" });
    });
  };

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
