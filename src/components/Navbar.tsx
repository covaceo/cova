import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ProfileMenu } from "./UserProfile";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isWorkspaceNavActive, type Section } from "../lib/appRoutes";
import { StartFreeButton } from "./StartFreeButton";
import { PublicNavbarSurface } from "./PublicNavbarSurface";
import { GooeyNavSurface } from "./ui/GooeyNavSurface";

type AuthMode = "login" | "signup";
type AuthSession = { email: string } | null;

function isProtectedSection(section: Section) {
  return ["dashboard", "import", "oauth", "rules", "coach", "passport"].includes(section);
}

const appNav = [
  { id: "dashboard", label: "Risk Desk" },

  { id: "rules", label: "Limits" },
  { id: "coach", label: "Insights" },
  { id: "passport", label: "Passport" },
] satisfies { id: Section; label: string }[];

const marketingNav = [
  { label: "Home", action: "overview" },
  { label: "Features", action: "features" },
  { label: "Pricing", action: "pricing" },
  { label: "Resources", action: "resources" },
  { label: "Community", action: "community" },
] satisfies { action: Section; label: string }[];

export function Navbar({ section, go, openAuth, mobileOpen, setMobileOpen, authSession, riskScore, signOut, deleteAccount }: {
  section: Section;
  go: (section: Section) => void;
  openAuth: (mode: AuthMode) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  authSession: AuthSession | null;
  riskScore: number | null;
  signOut: () => void;
  deleteAccount: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [hoveredNav, setHoveredNav] = useState<Section | null>(null);
  const reducedMotion = useReducedMotion();
  const usesWorkspaceChrome = Boolean(authSession) && isProtectedSection(section);
  const isAppMode = Boolean(authSession) || usesWorkspaceChrome;
  const riskScoreLabel = typeof riskScore === "number" && Number.isFinite(riskScore) ? String(riskScore) : "--";

  useEffect(() => {
    const marker = document.createElement("span");
    marker.setAttribute("aria-hidden", "true");
    marker.style.cssText = "position:absolute;top:28px;left:0;width:1px;height:1px;pointer-events:none;opacity:0;";
    document.body.prepend(marker);

    const observer = new IntersectionObserver(([entry]) => {
      setScrolled(entry ? !entry.isIntersecting : false);
    });
    observer.observe(marker);

    return () => {
      observer.disconnect();
      marker.remove();
    };
  }, []);

  function handleMarketingNav(action: (typeof marketingNav)[number]["action"]) {
    setMobileOpen(false);
    go(action);
  }

  return (
    <motion.header
      data-section={section}
      data-nav-design={usesWorkspaceChrome ? undefined : "pill-hover"}
      data-nav-scrolled={scrolled}
      className={`cova-site-header fixed left-0 right-0 top-0 z-50 px-4 pb-3 pt-6 md:px-8 ${usesWorkspaceChrome ? "workspace-top-header" : ""} ${authSession && !usesWorkspaceChrome ? "signed-in-marketing-header-shell" : ""}`}
      initial={reducedMotion ? false : { opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className={`header-scroll-veil pointer-events-none absolute left-1/2 top-[1.16rem] -z-10 h-[4.1rem] w-[calc(100%-2rem)] max-w-[1370px] -translate-x-1/2 ${
          scrolled ? "header-scroll-veil-scrolled" : "header-scroll-veil-top"
        }`}
      />
      <PublicNavbarSurface enabled={!usesWorkspaceChrome} open={mobileOpen}>
      <div className="header-layout-row mx-auto flex w-full max-w-[1400px] items-center justify-between md:justify-center">
        <div className={`header-orbit marketing-header hidden items-center md:flex ${usesWorkspaceChrome ? "product-header" : ""} ${authSession && !usesWorkspaceChrome ? "marketing-header-signed-in" : ""}`}>
          <button className="brand-lockup group flex min-w-0 shrink-0 items-center" onClick={() => go("overview")} type="button" aria-label="Go to Cova home">
            <img
              src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png"
              alt="Cova"
              className="header-wordmark-img object-contain opacity-95 transition duration-500 group-hover:opacity-100"
            />
          </button>

          <nav className={`header-nav-group marketing-nav-group ${usesWorkspaceChrome ? "product-nav-group" : ""}`} aria-label="Primary navigation" onPointerLeave={() => setHoveredNav(null)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoveredNav(null); }}>
            <GooeyNavSurface active={hoveredNav ?? section} className="cova-gooey-header">
            {usesWorkspaceChrome ? (
              appNav.map((item) => (
                <button
                  key={item.id}
                  data-gooey-key={item.id}
                  className={`marketing-nav-link font-body text-[14px] font-medium ${isWorkspaceNavActive(section, item.id) ? "marketing-nav-link-active" : ""}`}
                  onClick={() => { setMobileOpen(false); go(item.id); }}
                  type="button"
                  aria-current={isWorkspaceNavActive(section, item.id) ? "page" : undefined}
                >
                  {item.label}
                </button>
              ))
            ) : (
              marketingNav.map((item) => (
                <button
                  key={item.label}
                  data-gooey-key={item.action}
                  className={`marketing-nav-link font-body text-[14px] font-medium ${section === item.action ? "marketing-nav-link-active" : ""}`}
                  onClick={() => handleMarketingNav(item.action)}
                  onPointerEnter={(event) => { if (event.pointerType === "mouse") setHoveredNav(item.action); }}
                  onFocus={() => setHoveredNav(item.action)}
                  type="button"
                  aria-current={section === item.action ? "page" : undefined}
                >
                  <span className="cova-nav-item-label">{item.label}</span>
                </button>
              ))
            )}
            </GooeyNavSurface>
          </nav>

          <div className={`header-actions ${usesWorkspaceChrome ? "product-actions" : ""}`}>
            {authSession ? (
              <>
                <button
                  className="header-workspace-button font-body text-[14px] font-medium"
                  onClick={() => go("dashboard")}
                  type="button"
                >
                  Dashboard
                </button>
                <button
                  className="header-workspace-button header-workspace-button-primary font-body text-[14px] font-medium"
                  onClick={() => go("import")}
                  type="button"
                >
                  Link account
                </button>
                <button
                  className="header-link-button marketing-login font-body text-[14px] font-medium"
                  onClick={signOut}
                  type="button"
                >
                  Sign out
                </button>
                <button
                  className="header-risk-button font-body text-[14px] font-medium"
                  onClick={() => go("dashboard")}
                  type="button"
                  aria-label="View dashboard risk score"
                >
                  <span className="header-risk-dot" />
                  <span>Risk</span>
                  <strong>{riskScoreLabel}</strong>
                </button>
              </>
            ) : (
              <>
                <button
                  className="header-link-button marketing-login font-body text-[14px] font-medium"
                  onClick={() => openAuth("login")}
                  type="button"
                >
                  Sign in
                </button>
                <StartFreeButton compact onClick={() => openAuth("signup")} />
              </>
            )}
          </div>
        </div>

        <button className="header-mobile-brand brand-lockup flex min-w-0 shrink-0 items-center md:hidden" onClick={() => go("overview")} type="button" aria-label="Go to Cova home">
          <img src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png" alt="Cova" className="header-mobile-wordmark object-contain opacity-95" />
        </button>

        <button
          aria-controls="operator-mobile-menu"
          aria-expanded={mobileOpen}
          className="liquid-glass mobile-menu-toggle operator-mobile-menu-toggle shrink-0 p-3 text-white md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          type="button"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            aria-label={isAppMode ? "Workspace navigation" : "Site navigation"}
            className="liquid-glass-strong operator-mobile-menu-panel mx-auto mt-3 max-w-7xl p-3 md:hidden"
            id="operator-mobile-menu"
            role="navigation"
            initial={reducedMotion ? false : { opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
            transition={{duration:reducedMotion ? 0 : .2}}
          >
            {isAppMode ? appNav.map((item) => (
              <button
                key={item.id}
                aria-current={isWorkspaceNavActive(section, item.id) ? "page" : undefined}
                className={`operator-mobile-menu-link flex w-full items-center justify-between px-4 py-3 text-left font-body text-sm ${isWorkspaceNavActive(section, item.id) ? "operator-mobile-menu-link-active" : "operator-mobile-menu-link-inactive"}`}
                onClick={() => { setMobileOpen(false); go(item.id); }}
                type="button"
              >
                {item.label}
              </button>
            )) : marketingNav.map((item) => (
                <button
                  key={item.label}
                  data-gooey-key={item.action}
                  aria-current={section === item.action ? "page" : undefined}
                  className={`operator-mobile-menu-link flex w-full items-center justify-between px-4 py-3 text-left font-body text-sm ${section === item.action ? "operator-mobile-menu-link-active" : "operator-mobile-menu-link-inactive"}`}
                  onClick={() => handleMarketingNav(item.action)}
                  type="button"
                >
                {item.label}
              </button>
            ))}
            {authSession && <ProfileMenu mobile email={authSession.email} signOut={signOut} deleteAccount={deleteAccount} manageAccounts={() => { setMobileOpen(false); go("import"); }} />}
            <div className="operator-mobile-account-actions mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
              {authSession && (
                <button className="cova-button cova-button-secondary operator-mobile-delete-account col-span-2 px-4 py-3 font-body text-sm" onClick={() => { setMobileOpen(false); deleteAccount(); }} type="button">
                  Delete account
                </button>
              )}
              <button className="cova-button cova-button-secondary px-4 py-3 font-body text-sm" onClick={() => { setMobileOpen(false); authSession ? signOut() : openAuth("login"); }} type="button">
                {authSession ? "Sign out" : "Sign in"}
              </button>
              {!authSession ? (
                <StartFreeButton compact className="w-full" onClick={() => { setMobileOpen(false); openAuth("signup"); }} />
              ) : (
                <button className="cova-button cova-button-primary operator-mobile-link-account px-4 py-3 font-body text-sm font-semibold" aria-current={isAppMode && isWorkspaceNavActive(section, "import") ? "page" : undefined} onClick={() => { setMobileOpen(false); go("import"); }} type="button">
                  Link account
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </PublicNavbarSurface>
    </motion.header>
  );
}

