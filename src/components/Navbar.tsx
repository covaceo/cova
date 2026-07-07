import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { StartFreeButton } from "./StartFreeButton";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";
type AuthMode = "login" | "signup";
type AuthSession = { email: string } | null;

function isProtectedSection(section: Section) {
  return ["dashboard", "import", "oauth", "rules", "coach", "passport"].includes(section);
}

const appNav = [
  { id: "dashboard", label: "Dashboard" },
  { id: "import", label: "Link account" },
  { id: "rules", label: "Limits" },
  { id: "coach", label: "Insights" },
  { id: "passport", label: "Passport" },
] satisfies { id: Section; label: string }[];

const marketingNav = [
  { label: "Product", action: "overview" },
  { label: "Features", action: "features" },
  { label: "Pricing", action: "pricing" },
  { label: "Resources", action: "resources" },
  { label: "Community", action: "community", hasChevron: true },
] satisfies { action: Section; hasChevron?: boolean; label: string }[];

export function Navbar({ section, go, openAuth, mobileOpen, setMobileOpen, authSession, riskScore, signOut }: {
  section: Section;
  go: (section: Section) => void;
  openAuth: (mode: AuthMode) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  authSession: AuthSession | null;
  riskScore: number;
  signOut: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const isAppMode = Boolean(authSession) || isProtectedSection(section);
  const activeMarketingLabel = marketingNav.find((item) => item.action === section)?.label ?? "Product";
  const activeAppLabel = appNav.find((item) => item.id === section)?.label ?? "";

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
      className={`fixed left-0 right-0 top-0 z-50 px-4 pb-3 pt-6 md:px-8 ${isAppMode ? "workspace-top-header" : ""}`}
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className={`pointer-events-none absolute left-1/2 top-[1.16rem] -z-10 h-[4.1rem] w-[calc(100%-2rem)] max-w-[1370px] -translate-x-1/2 transition duration-500 ${
          scrolled ? "header-scroll-veil opacity-90" : "header-scroll-veil opacity-60"
        }`}
      />
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between md:justify-center">
        <div className={`header-orbit marketing-header hidden items-center md:flex ${isAppMode ? "product-header" : ""}`}>
          <button className="brand-lockup group flex min-w-0 shrink-0 items-center" onClick={() => go(authSession ? "dashboard" : "overview")} type="button" aria-label="Go to Cova home">
            <img
              src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png"
              alt="Cova"
              className="header-wordmark-img object-contain opacity-95 transition duration-500 group-hover:opacity-100"
            />
          </button>

          <nav className={`header-nav-group marketing-nav-group ${isAppMode ? "product-nav-group" : ""}`} aria-label="Primary navigation">
            {isAppMode ? (
              appNav.map((item) => (
                <button
                  key={item.id}
                  className={`marketing-nav-link font-body text-[14px] font-medium ${section === item.id ? "marketing-nav-link-active" : ""}`}
                  onClick={() => { setMobileOpen(false); go(item.id); }}
                  type="button"
                  aria-current={section === item.id ? "page" : undefined}
                >
                  {item.label}
                </button>
              ))
            ) : (
              marketingNav.map((item) => (
                <button
                  key={item.label}
                  className={`marketing-nav-link font-body text-[14px] font-medium ${section === item.action ? "marketing-nav-link-active" : ""}`}
                  onClick={() => handleMarketingNav(item.action)}
                  type="button"
                  aria-current={section === item.action ? "page" : undefined}
                >
                  {item.label}
                  {item.hasChevron && <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              ))
            )}
          </nav>

          <div className={`header-actions ${isAppMode ? "product-actions" : ""}`}>
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
                  <strong>{riskScore || "--"}</strong>
                </button>
              </>
            ) : (
              <>
                <button
                  className="header-link-button marketing-login font-body text-[14px] font-medium"
                  onClick={() => openAuth("login")}
                  type="button"
                >
                  Login
                </button>
                <StartFreeButton compact onClick={() => openAuth("signup")} />
              </>
            )}
          </div>
        </div>

        <button className="brand-lockup flex min-w-0 shrink-0 items-center md:hidden" onClick={() => go(authSession ? "dashboard" : "overview")} type="button" aria-label="Go to Cova home">
          <img src="/cova-logo-minimal-white.svg" alt="Cova" className="header-brand-mark h-10 w-10 object-contain opacity-95" />
        </button>

        <button className="liquid-glass mobile-menu-toggle shrink-0 rounded-full p-3 text-white md:hidden" onClick={() => setMobileOpen(!mobileOpen)} type="button" aria-label="Toggle menu">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="liquid-glass-strong mx-auto mt-3 max-w-7xl rounded-[28px] p-3 md:hidden"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
          >
            {isAppMode ? appNav.map((item) => (
              <button
                key={item.id}
                className={`flex w-full items-center justify-between rounded-full px-4 py-3 text-left font-body text-sm ${activeAppLabel === item.label ? "bg-white/8 text-white" : "text-white/68"}`}
                onClick={() => { setMobileOpen(false); go(item.id); }}
                type="button"
              >
                {item.label}
              </button>
            )) : marketingNav.map((item) => (
                <button
                  key={item.label}
                  className={`flex w-full items-center justify-between rounded-full px-4 py-3 text-left font-body text-sm ${activeMarketingLabel === item.label ? "bg-white/8 text-white" : "text-white/68"}`}
                  onClick={() => handleMarketingNav(item.action)}
                  type="button"
                >
                {item.label}
                {item.hasChevron && <ChevronDown className="h-4 w-4" />}
              </button>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
              <button className="cova-button cova-button-secondary rounded-full px-4 py-3 font-body text-sm" onClick={() => { setMobileOpen(false); authSession ? signOut() : openAuth("login"); }} type="button">
                {authSession ? "Sign out" : "Login"}
              </button>
              {!authSession ? (
                <StartFreeButton compact className="w-full" onClick={() => { setMobileOpen(false); openAuth("signup"); }} />
              ) : (
                <button className="cova-button cova-button-primary rounded-full px-4 py-3 font-body text-sm font-semibold" onClick={() => { setMobileOpen(false); go("import"); }} type="button">
                  Link account
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

