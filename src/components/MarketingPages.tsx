import { PlanStrip } from "./PlanSections";
import "../styles/publicPolish.css";

export { FeaturesPage } from "./FeaturesShowcasePage";
export { ResourcesPage } from "./ResourcesQuickStartPage";
export { CommunityPage } from "./CommunityDiscordPage";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";
type AuthMode = "login" | "signup";
type PlanTier = "free" | "pro";

export function PricingPage({ currentPlan, go, openAuth, proCheckoutAvailable, upgradeToPro }: { currentPlan: PlanTier | null; go: (section: Section) => void; openAuth: (mode: AuthMode) => void; proCheckoutAvailable: boolean; upgradeToPro: () => void }) {
  return (
    <div className="public-pricing-page relative overflow-hidden">
      <PlanStrip compact currentPlan={currentPlan} go={go} openAuth={openAuth} proCheckoutAvailable={proCheckoutAvailable} upgradeToPro={upgradeToPro} />
      <section className="relative px-5 pb-28 pt-2 md:px-12 lg:px-20">
        <div className="mx-auto max-w-7xl">
          <p className="public-pricing-boundary">Cova reviews completed trades. No signals, order execution, or payout promises.</p>
        </div>
      </section>
    </div>
  );
}
