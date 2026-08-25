import {
  ArrowUpRight,
  BadgeCheck,
  ShieldCheck,
  Target,
} from "lucide-react";
import { GlassButton } from "./GlassButton";
import { ImageAtmosphere, SectionShell } from "./LayoutShell";
import { PlanStrip } from "./PlanSections";

export { FeaturesPage } from "./FeaturesShowcasePage";
export { ResourcesPage } from "./ResourcesQuickStartPage";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";
type AuthMode = "login" | "signup";
type PlanTier = "free" | "pro";
const COVA_DISCORD_INVITE_URL = "https://discord.gg/B83Czu3pAf";

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

export function CommunityPage({ go }: { go: (section: Section) => void }) {
  const communityItems = [
    ["#trade-review", "Completed trades, screenshots, context, execution notes, and what you would change."],
    ["#risk-discipline", "Sizing, drawdown decisions, rule breaks, and the habits behind consistent risk."],
    ["#passport-showcase", "Privacy-checked Cova Passports and progress worth documenting."],
    ["#product-feedback", "Show what is not working, the outcome you expected, and the evidence behind it."],
  ];

  const openDiscord = () => {
    const discordWindow = window.open(COVA_DISCORD_INVITE_URL, "_blank", "noopener,noreferrer");
    if (discordWindow) {
      discordWindow.opener = null;
    }
  };

  return (
    <SectionShell
      title="Review the decision behind the trade."
      action={<GlassButton strong onClick={openDiscord}>Join Cova on Discord <ArrowUpRight className="h-4 w-4" /></GlassButton>}
      backdrop={<ImageAtmosphere src="/media/cova-story-frame-04.png" align="right" opacity="opacity-[0.28]" />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_0.78fr]">
        <div className="liquid-glass-strong rounded-[32px] p-5 md:rounded-[42px] md:p-10">
          <h3 className="max-w-[16ch] font-body text-3xl font-semibold leading-[1.04] tracking-[-0.035em] text-white md:max-w-3xl md:text-6xl md:leading-[1.02]">
            Bring the screenshot. Explain what you saw and what you did.
          </h3>
          <p className="mt-6 max-w-[31ch] font-body text-base font-light leading-relaxed text-white/62 md:max-w-2xl">
            Good trade, bad trade, clean execution, rule break. The point is to understand the decision and leave with something useful for the next session.
          </p>
          <div className="mt-8 divide-y divide-white/10 border-y border-white/10 md:grid md:grid-cols-2 md:divide-x md:divide-y-0">
            {communityItems.map(([title, body]) => (
              <div className="py-4 md:px-4" key={title}>
                <p className="font-body text-sm font-semibold text-white">{title}</p>
                <p className="mt-2 font-body text-xs leading-relaxed text-white/46">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5">
          <div className="liquid-glass rounded-[30px] p-5 md:rounded-[36px] md:p-7">
            <Target className="h-9 w-9 text-[#18c887]" />
            <h3 className="mt-6 font-body text-2xl font-semibold text-white">What belongs here</h3>
            <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">
              Completed trades, rule breaks, sizing work, Cova questions, and product feedback backed by evidence.
            </p>
          </div>
          <div className="liquid-glass rounded-[30px] p-5 md:rounded-[36px] md:p-7">
            <ShieldCheck className="h-9 w-9 text-emerald-300" />
            <h3 className="mt-6 font-body text-2xl font-semibold text-white">The boundaries</h3>
            <p className="mt-3 font-body text-sm font-light leading-relaxed text-white/54">
              No live entry calls, paid signals, copy trading, account management, broker solicitation, or requests for private account information.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <GlassButton strong onClick={openDiscord}>Open Discord <ArrowUpRight className="h-4 w-4" /></GlassButton>
            <GlassButton onClick={() => go("resources")}>Read resources <ArrowUpRight className="h-4 w-4" /></GlassButton>
          </div>
          <p className="font-body text-xs leading-relaxed text-white/42">
            The invite opens #start-here with the channel map and posting boundaries.
          </p>
        </div>
      </div>
    </SectionShell>
  );
}

