import { Activity, ArrowUpRight, BarChart3, ChevronRight, FileUp, Gauge, Search, BookUser, ArrowLeft, ArrowRight } from "lucide-react";
import { WorkspaceNavIcon } from "./WorkspaceNavIcon";
import { ProfileMenu } from "./UserProfile";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
      { id: "rules", label: "Limits", icon: Gauge },
      { id: "coach", label: "Insights", icon: Activity },
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
};

export function WorkspaceShell({ brokerLabel, children, deleteAccount, email, go, riskScore, section, signOut }: WorkspaceShellProps) {
  const reducedMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem("cova-workspace-sidebar-collapsed-v1") === "true"; }
    catch { return false; }
  });
  const searchInput = useRef<HTMLInputElement>(null);
  const focusSearch = useRef(false);
  useEffect(() => {
    try { window.localStorage.setItem("cova-workspace-sidebar-collapsed-v1", String(collapsed)); }
    catch { /* The rail still works when browser storage is unavailable. */ }
    if (!collapsed && focusSearch.current) {
      searchInput.current?.focus();
      focusSearch.current = false;
    }
  }, [collapsed]);
  const [search, setSearch] = useState("");
  const [focusSource, setFocusSource] = useState<"pointer" | "keyboard">("keyboard");
  useEffect(() => {
    // Listen outside the shell too, so the first Tab into the workspace is visible.
    const keyboard = (event: KeyboardEvent) => {
      if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) setFocusSource("keyboard");
    };
    document.addEventListener("keydown", keyboard, true);
    return () => document.removeEventListener("keydown", keyboard, true);
  }, []);
  const filteredGroups = useMemo(() => {
    const query = collapsed ? "" : search.trim().toLowerCase();
    if (!query) return workspaceNavGroups;
    return workspaceNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => `${group.label} ${item.label}`.toLowerCase().includes(query)),
      }))
      .filter((group) => group.items.length > 0);
  }, [search, collapsed]);
  const showAccounts = collapsed || !search.trim() || "accounts tradovate ninjatrader rithmic csv".includes(search.trim().toLowerCase());
  const riskScoreLabel = typeof riskScore === "number" && Number.isFinite(riskScore) ? String(riskScore) : "--";

  return (
    <motion.div className="workspace-shell operator-workspace oa-dashboard-shell" data-sidebar-state={collapsed ? "collapsed" : "expanded"} initial={false} animate={{ "--sidebar-progress": collapsed ? 0 : 1 }} transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 550, damping: 40 }} data-workspace-section={section} data-focus-source={focusSource} onPointerDownCapture={() => setFocusSource("pointer")}>
      <aside className="workspace-sidebar workspace-sidebar-motion" id="cova-workspace-sidebar" aria-label="Cova workspace navigation">
        <div className="workspace-sidebar-brand">
          <button className="workspace-brand-button" onClick={() => go("overview")} type="button" aria-label="Go to Cova home">
            <img className="workspace-brand-wordmark" src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png" alt="Cova" />
            <img className="workspace-brand-mark" src="/cova-logo-minimal-white.svg" alt="" aria-hidden="true" />
          </button>
        </div>
        <button className="workspace-sidebar-toggle" type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="cova-workspace-sidebar" title={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(value => !value)}>
          {collapsed ? <ArrowRight aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}
        </button>
        {collapsed ? <button className="workspace-sidebar-search-open" type="button" aria-label="Search workspace" title="Search workspace" onClick={() => { focusSearch.current = true; setCollapsed(false); }}><Search aria-hidden="true" /></button> : <label className="workspace-sidebar-search">
          <Search aria-hidden="true" className="h-4 w-4" />
          <input
            ref={searchInput}
            aria-label="Search workspace"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            type="search"
            value={search}
          />
        </label>}

        {showAccounts && <button className="astra-rail-account" aria-label="Accounts" title={`Accounts: ${brokerLabel}`} aria-current={isWorkspaceNavActive(section, "import") ? "page" : undefined} onClick={() => go("import")} type="button"><WorkspaceNavIcon section="import" /><span className="astra-rail-account-copy"><strong>Accounts</strong><small>{brokerLabel}</small></span><ChevronRight aria-hidden="true" /></button>}

        <nav className="workspace-sidebar-nav">
          {filteredGroups.map((group) => (
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
                      onClick={() => go(item.id)}
                      type="button"
                      aria-label={item.label}
                      title={item.label}
                      aria-current={active ? "page" : undefined}
                    >
                      {active && (
                        <motion.span
                          aria-hidden="true"
                          className="oa-workspace-nav-highlight"
                          layoutId="oa-workspace-nav-highlight"
                          transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 550, damping: 40 }}
                        />
                      )}
                      <span className="workspace-sidebar-icon"><WorkspaceNavIcon section={item.id} /></span>
                      <span className="workspace-sidebar-copy">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filteredGroups.length === 0 && !showAccounts && <p className="workspace-sidebar-empty">No matching workspace route.</p>}
        </nav>


        <div className="workspace-risk-status" aria-label={`Cova risk score ${riskScoreLabel === "--" ? "not available" : riskScoreLabel}`}>
          <span className="workspace-risk-status-copy"><Activity aria-hidden="true" className="h-4 w-4" /><span>Risk status</span></span>
          <strong>{riskScoreLabel}</strong>
        </div>

        <div className="workspace-account-menu">
          <ProfileMenu email={email} signOut={signOut} deleteAccount={deleteAccount} manageAccounts={() => go("import")} />

        </div>
      </aside>

      <motion.div
        className="workspace-content"
        key={section}
        initial={reducedMotion ? false : { y: 8 }}
        animate={{ y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
      >
        {section === "dashboard" ? children : (
          <div className="astra-workspace-page" data-astra-route={section}>
            <div className="astra-deskbar">
              <div className="astra-breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{workspaceNavGroups.flatMap<WorkspaceNavItem>(group => group.items).find(item => isWorkspaceNavActive(section,item.id))?.label || "Link account"}</strong></div>
              <div className="astra-deskbar-tools">{!isWorkspaceNavActive(section, "import") && <button type="button" className="astra-button astra-import-action" onClick={() => go("import")}><FileUp aria-hidden="true" />Import trades</button>}<button type="button" className="astra-button" onClick={() => go("dashboard")}>Risk Desk <ArrowUpRight aria-hidden="true" /></button></div>
            </div>
            {children}
          </div>
        )}
        <SiteFooter go={go} />
      </motion.div>
    </motion.div>
  );
}
