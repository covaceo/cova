import { Activity, ArrowUpRight, BarChart3, ChevronRight, FileUp, Gauge, BookUser, ArrowLeft, ArrowRight, Menu, X } from "lucide-react";
import { WorkspaceNavIcon } from "./WorkspaceNavIcon";
import { GooeyInput } from "./ui/gooey-input";
import { WorkspaceSearch, type WorkspaceSearchSource, type WorkspaceSearchHandle } from "./WorkspaceSearch";
import { GooeyNavSurface, gooeyTransition } from "./ui/GooeyNavSurface";
import { ProfileMenu } from "./UserProfile";
import { motion, useReducedMotion } from "motion/react";
import { flushSync } from "react-dom";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { isWorkspaceNavActive, type Section } from "../lib/appRoutes";
import { SiteFooter } from "./PlanSections";

type WorkspaceNavItem = {
  icon: typeof BarChart3;
  id: Section;
  label: string;
};

const workspaceNavGroups = [
  {
    label: "Review",
    items: [
      { id: "dashboard", label: "Risk Desk", icon: BarChart3 },

    ],
  },
  {
    label: "Discipline",
    items: [
      { id: "coach", label: "Insights", icon: Activity },
      { id: "rules", label: "Limits", icon: Gauge },
    ],
  },
  {
    label: "Proof",
    items: [
      { id: "passport", label: "Passport", icon: BookUser },
    ],
  },
] satisfies { items: WorkspaceNavItem[]; label: string }[];

type WorkspaceShellProps = {
  brokerLabel: string;
  children: ReactNode;
  deleteAccount: () => void;
  email?: string;
  go: (section: Section) => void;
  riskScore: number | null;
  section: Section;
  signOut: () => void;
  searchSource?: WorkspaceSearchSource;
  searchRef?: RefObject<WorkspaceSearchHandle>;
};

const WorkspaceMenuContext = createContext<ReactNode>(null);
export function WorkspaceMenuButton() { return useContext(WorkspaceMenuContext); }

export function WorkspaceShell({ brokerLabel, children, deleteAccount, email, go: navigate, riskScore, section, signOut, searchSource, searchRef }: WorkspaceShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuDialog = useRef<HTMLDialogElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const compactNavigation = section === 'dashboard';
  const go = (target: Section) => { setMenuOpen(false); navigate(target); };
  useEffect(() => {
    if (!menuOpen || !compactNavigation) return;
    const dialog = menuDialog.current;
    if (!dialog) return;
    const overflow = document.body.style.overflow;
    dialog.inert = false;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    const media = window.matchMedia('(max-width: 850px)');
    const resize = () => { if (media.matches && !dialog.querySelector('dialog[open]')) setMenuOpen(false); };
    media.addEventListener('change', resize);
    return () => {
      // The native close releases modality immediately; the CSS exit is paint-only.
      dialog.inert = true;
      dialog.close(); document.body.style.overflow = overflow;
      media.removeEventListener('change', resize);
      const target = menuTrigger.current?.checkVisibility() ? menuTrigger.current : document.querySelector<HTMLButtonElement>('.workspace-top-header .operator-mobile-menu-toggle');
      if (target?.checkVisibility() && !document.querySelector('dialog[open]')) target.focus({ preventScroll: true });
    };
  }, [menuOpen, compactNavigation]);
  useEffect(() => { if (!compactNavigation) setMenuOpen(false); }, [compactNavigation]);
  const reducedMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem("cova-workspace-sidebar-collapsed-v1") === "true"; }
    catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem("cova-workspace-sidebar-collapsed-v1", String(collapsed)); }
    catch { /* The rail still works when browser storage is unavailable. */ }
  }, [collapsed]);
  const fallbackSearchRef = useRef<WorkspaceSearchHandle>(null);
  const searchController = searchRef || fallbackSearchRef;
  const openSearch = () => {
    // The existing search intentionally refuses to open over another dialog.
    // Finish this menu's focus/scroll cleanup before handing off to it.
    if (menuOpen) flushSync(() => setMenuOpen(false));
    searchController.current?.open();
  };
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusSource, setFocusSource] = useState<"pointer" | "keyboard">("keyboard");
  useEffect(() => {
    // Listen outside the shell too, so the first Tab into the workspace is visible.
    const keyboard = (event: KeyboardEvent) => {
      if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) setFocusSource("keyboard");
    };
    document.addEventListener("keydown", keyboard, true);
    return () => document.removeEventListener("keydown", keyboard, true);
  }, []);

  const riskScoreLabel = typeof riskScore === "number" && Number.isFinite(riskScore) ? String(riskScore) : "--";

  const navigation = <aside className="workspace-sidebar workspace-sidebar-motion" id="cova-workspace-sidebar" aria-label="Cova workspace navigation">
        <div className="workspace-sidebar-brand">
          <button className="workspace-brand-button" onClick={() => go("overview")} type="button" aria-label="Go to Cova home">
            <img className="workspace-brand-wordmark" src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png" alt="Cova" />
            <img className="workspace-brand-mark" src="/cova-logo-minimal-white.svg" alt="" aria-hidden="true" />
          </button>
        </div>
        <button className="workspace-sidebar-toggle" hidden={compactNavigation} type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="cova-workspace-sidebar" title={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(value => !value)}>
          {collapsed ? <ArrowRight aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}
        </button>
        <GooeyInput open={searchOpen} onActivate={openSearch} placeholder="Search" className="cova-gooey-search" classNames={{trigger:"cova-gooey-search-surface",input:"cova-gooey-search-input",bubbleSurface:"cova-gooey-search-bubble"}} />

        <button className="astra-rail-account" aria-label="Accounts" title={`Accounts: ${brokerLabel}`} aria-current={isWorkspaceNavActive(section, "import") ? "page" : undefined} onClick={() => go("import")} type="button"><WorkspaceNavIcon section="import" /><span className="astra-rail-account-copy"><strong>Accounts</strong><small>{brokerLabel}</small></span><ChevronRight aria-hidden="true" /></button>

        <nav className="workspace-sidebar-nav">
          <GooeyNavSurface active={section === "oauth" ? "import" : section} className="cova-gooey-sidebar">
          {workspaceNavGroups.map((group) => (
            <div className="workspace-sidebar-group" key={group.label}>
              <p className="workspace-sidebar-group-label">{({ Review: "Workspace", Proof: "Your record" }[group.label] || group.label)}</p>
              <div className="workspace-sidebar-group-links">
                {group.items.map((item) => {
                  // Route identity is unchanged by the new presentation.
                  const active = isWorkspaceNavActive(section, item.id);
                  return (
                    <button
                      className={`workspace-sidebar-link ${active ? "workspace-sidebar-link-active" : ""}`}
                      key={item.id}
                      data-gooey-key={item.id}
                      onClick={() => go(item.id)}
                      type="button"
                      aria-label={item.label}
                      title={item.label}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="workspace-sidebar-icon"><WorkspaceNavIcon section={item.id} /></span>
                      <span className="workspace-sidebar-copy">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          </GooeyNavSurface>
        </nav>


        <div className="workspace-risk-status" aria-label={`Cova risk score ${riskScoreLabel === "--" ? "not available" : riskScoreLabel}`}>
          <span className="workspace-risk-status-copy"><Activity aria-hidden="true" className="h-4 w-4" /><span>Risk status</span></span>
          <strong>{riskScoreLabel}</strong>
        </div>

        <div className="workspace-account-menu">
          <ProfileMenu email={email} signOut={signOut} deleteAccount={deleteAccount} manageAccounts={() => go("import")} />

        </div>
      </aside>;
  return (
    <motion.div className="workspace-shell operator-workspace oa-dashboard-shell" data-sidebar-state={compactNavigation ? 'expanded' : collapsed ? "collapsed" : "expanded"} data-compact-navigation={compactNavigation || undefined} initial={false} animate={{ "--sidebar-progress": compactNavigation ? 1 : collapsed ? 0 : 1 }} transition={reducedMotion ? { duration: 0 } : gooeyTransition} data-workspace-section={section} data-focus-source={focusSource} onPointerDownCapture={() => setFocusSource("pointer")}>
      {compactNavigation ? <dialog ref={menuDialog} className="workspace-menu-dialog" aria-label="Workspace menu" onKeyDownCapture={event => { if (event.currentTarget.querySelector('dialog[open]')) return; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); openSearch(); } }} onCancel={event => { if (event.target === event.currentTarget) { event.preventDefault(); setMenuOpen(false); } }} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setMenuOpen(false); } }}>
        <button className="workspace-menu-close" type="button" aria-label="Close workspace menu" onClick={() => setMenuOpen(false)}><X aria-hidden="true" /></button>
        {navigation}
      </dialog> : navigation}
      <WorkspaceSearch ref={searchController} source={searchSource} go={go} onOpenChange={setSearchOpen} />
      <motion.div
        className="workspace-content"
        key={section}
        initial={reducedMotion ? false : { y: 8 }}
        animate={{ y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
      >
        <WorkspaceMenuContext.Provider value={compactNavigation ? <button ref={menuTrigger} type="button" className="workspace-menu-trigger" aria-label="Open workspace menu" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu aria-hidden="true" /></button> : null}>
        {section === "dashboard" ? children : (
          <div className="astra-workspace-page" data-astra-route={section}>
            <div className="astra-deskbar">
              <div className="astra-breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{workspaceNavGroups.flatMap<WorkspaceNavItem>(group => group.items).find(item => isWorkspaceNavActive(section,item.id))?.label || "Link account"}</strong></div>
              <div className="astra-deskbar-tools">{!isWorkspaceNavActive(section, "import") && <button type="button" className="astra-button astra-import-action" onClick={() => go("import")}><FileUp aria-hidden="true" />Import trades</button>}<button type="button" className="astra-button" onClick={() => go("dashboard")}>Risk Desk <ArrowUpRight aria-hidden="true" /></button></div>
            </div>
            {children}
          </div>
        )}
        </WorkspaceMenuContext.Provider>
        <SiteFooter go={go} />
      </motion.div>
    </motion.div>
  );
}
