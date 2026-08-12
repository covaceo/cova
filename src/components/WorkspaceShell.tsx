import { Activity, BarChart3, FileUp, Gauge, LogOut, Network, Search, ShieldCheck, Target, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { isWorkspaceNavActive, type Section } from "../lib/appRoutes";

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
      { id: "import", label: "Trade History", icon: FileUp },
    ],
  },
  {
    label: "Discipline",
    items: [
      { id: "rules", label: "Limits", icon: Gauge },
      { id: "coach", label: "Insights", icon: Activity },
      { id: "practice", label: "Practice", icon: Target },
    ],
  },
  {
    label: "Proof",
    items: [
      { id: "passport", label: "Passport", icon: ShieldCheck },
    ],
  },
] satisfies { items: WorkspaceNavItem[]; label: string }[];

type WorkspaceShellProps = {
  brokerLabel: string;
  children: ReactNode;
  deleteAccount: () => void;
  email?: string;
  go: (section: Section) => void;
  riskScore: number;
  section: Section;
  signOut: () => void;
};

export function WorkspaceShell({ brokerLabel, children, deleteAccount, email, go, riskScore, section, signOut }: WorkspaceShellProps) {
  const [search, setSearch] = useState("");
  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return workspaceNavGroups;
    return workspaceNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => `${group.label} ${item.label}`.toLowerCase().includes(query)),
      }))
      .filter((group) => group.items.length > 0);
  }, [search]);
  const riskScoreLabel = Number.isFinite(riskScore) ? String(riskScore) : "--";

  return (
    <div className="workspace-shell operator-workspace" data-workspace-section={section}>
      <aside className="workspace-sidebar" aria-label="Cova workspace navigation">
        <div className="workspace-sidebar-brand">
          <button className="workspace-brand-button" onClick={() => go("dashboard")} type="button" aria-label="Go to Cova risk desk">
            <img src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png" alt="Cova" />
          </button>
        </div>

        <label className="workspace-sidebar-search">
          <Search aria-hidden="true" className="h-4 w-4" />
          <input
            aria-label="Search workspace"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            type="search"
            value={search}
          />
        </label>

        <nav className="workspace-sidebar-nav">
          {filteredGroups.map((group) => (
            <div className="workspace-sidebar-group" key={group.label}>
              <p className="workspace-sidebar-group-label">{group.label}</p>
              <div className="workspace-sidebar-group-links">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isWorkspaceNavActive(section, item.id);
                  return (
                    <button
                      className={`workspace-sidebar-link ${active ? "workspace-sidebar-link-active" : ""}`}
                      key={item.id}
                      onClick={() => go(item.id)}
                      type="button"
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="workspace-sidebar-icon"><Icon className="h-4 w-4" /></span>
                      <span className="workspace-sidebar-copy">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filteredGroups.length === 0 && <p className="workspace-sidebar-empty">No matching workspace route.</p>}
        </nav>

        <div className="workspace-risk-status" aria-label={`Cova risk score ${riskScoreLabel === "--" ? "not available" : riskScoreLabel}`}>
          <span className="workspace-risk-status-copy"><Activity aria-hidden="true" className="h-4 w-4" />Risk status</span>
          <strong>{riskScoreLabel}</strong>
        </div>

        <div className="workspace-account-menu">
          <div className="workspace-account-identity">
            <span className="workspace-account-avatar" aria-hidden="true">{(email || "C").slice(0, 1).toUpperCase()}</span>
            <span className="workspace-account-copy">
              <strong>{email || "Cova user"}</strong>
              <small>{brokerLabel}</small>
            </span>
          </div>
          <div className="workspace-account-actions">
            <button onClick={deleteAccount} type="button" aria-label="Delete account" title="Delete account">
              <Trash2 className="h-4 w-4" />
              <span>Delete account</span>
            </button>
            <button onClick={signOut} type="button" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
          <div className="workspace-sidebar-watermark">
            <Network aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Review + simulated practice. No live brokerage execution.</span>
          </div>
        </div>
      </aside>

      <div className="workspace-content">
        {children}
      </div>
    </div>
  );
}
