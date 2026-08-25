import { BadgeCheck } from "lucide-react";
import { PlanStrip } from "./PlanSections";

export { FeaturesPage } from "./FeaturesShowcasePage";
export { ResourcesPage } from "./ResourcesQuickStartPage";
export { CommunityPage } from "./CommunityDiscordPage";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";
type AuthMode = "login" | "signup";
type PlanTier = "free" | "pro";

export function PricingPage({ currentPlan, go, openAuth, proCheckoutAvailable, upgradeToPro }: { currentPlan: PlanTier | null; go: (section: Section) => void; openAuth: (mode: AuthMode) => void; proCheckoutAvailable: boolean; upgradeToPro: () => void }) {
  return (
    <div className="relative overflow-hidden">
      <PlanStrip compact currentPlan={currentPlan} go={go} openAuth={openAuth} proCheckoutAvailable={proCheckoutAvailable} upgradeToPro={upgradeToPro} />
      <section className="relative px-5 pb-28 pt-2 md:px-12 lg:px-20">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-3">
          {[
            ["Start small", "Free is intentionally limited so new traders can test the workflow without turning Cova into another cluttered dashboard."],
            ["Upgrade when it matters", "Pro is for traders who want stored history, more Passport control, and a fuller review trail."],
            ["No hidden trading layer", "Cova does not sell signals, place trades, or promise payouts. It reviews behavior after execution."],
          ].map(([title, body]) => (
            <div className="liquid-glass rounded-[32px] p-6" key={title}>
              <BadgeCheck className="h-7 w-7 text-[#18c887]" />
              <h3 className="mt-5 font-body text-xl font-semibold text-white">{title}</h3>
              <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
