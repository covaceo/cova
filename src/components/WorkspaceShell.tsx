import { Activity, BarChart3, FileUp, Gauge, LogOut, Network, ShieldCheck, Target } from "lucide-react";
import type { ReactNode } from "react";
import type { Section } from "../lib/appRoutes";

const workspaceNav = [
  {
    id: "dashboard",
    label: "Risk Desk",
    kicker: "Account review",
    icon: BarChart3,
  },
  {
    id: "import",
    label: "Trade History",
    kicker: "Connect / CSV",
    icon: FileUp,
  },
  {
    id: "rules",
    label: "Limits",
    kicker: "Guardrails",
    icon: Gauge,
  },
  {
    id: "coach",
    label: "Insights",
    kicker: "Plain English",
    icon: Activity,
  },
  {
    id: "practice",
    label: "Practice",
    kicker: "Backtesting Lab",
    icon: Target,
  },
  {
    id: "passport",
    label: "Passport",
    kicker: "Share proof",
    icon: ShieldCheck,
  },
] satisfies { icon: typeof BarChart3; id: Section; kicker: string; label: string }[];

type WorkspaceShellProps = {
  brokerLabel: string;
  children: ReactNode;
  email?: string;
  go: (section: Section) => void;
  riskScore: number;
  section: Section;
  signOut: () => void;
};

export function WorkspaceShell({ brokerLabel, children, email, go, riskScore, section, signOut }: WorkspaceShellProps) {
  return (
    <div className="workspace-shell operator-workspace" data-workspace-section={section}>
      <aside className="workspace-sidebar" aria-label="Cova workspace navigation">
        <div className="workspace-sidebar-brand">
          <button className="workspace-brand-button" onClick={() => go("dashboard")} type="button" aria-label="Go to Cova risk desk">
            <img src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png" alt="Cova" />
          </button>
          <span>Risk OS</span>
        </div>

        <div className="workspace-risk-card">
          <span className="workspace-risk-label">Account Risk</span>
          <strong>{riskScore || "--"}</strong>
          <p>{brokerLabel}</p>
        </div>

        <nav className="workspace-sidebar-nav">
          {workspaceNav.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                className={`workspace-sidebar-link ${active ? "workspace-sidebar-link-active" : ""}`}
                key={item.id}
                onClick={() => go(item.id)}
                type="button"
                aria-current={active ? "page" : undefined}
              >
                <span className="workspace-sidebar-icon"><Icon className="h-4 w-4" /></span>
                <span className="workspace-sidebar-copy">
                  <strong>{item.label}</strong>
                  <small>{item.kicker}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="workspace-sidebar-footer">
          <div>
            <span>Signed in</span>
            <strong>{email || "Cova user"}</strong>
          </div>
          <button onClick={signOut} type="button" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        <div className="workspace-sidebar-watermark">
          <Network className="h-4 w-4" />
          <span>Risk review + simulated practice. No live brokerage execution.</span>
        </div>
      </aside>

      <div className="workspace-content">
        {children}
      </div>
    </div>
  );
}
