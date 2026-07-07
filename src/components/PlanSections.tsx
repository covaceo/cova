import { motion } from "motion/react";
import { ArrowUpRight, Check, X } from "lucide-react";
import { GlassButton } from "./GlassButton";
import { StartFreeButton } from "./StartFreeButton";

type PlanTier = "free" | "pro";
type PlanRoute = "dashboard" | "import" | "passport";
type AuthMode = "signup";

const planOptions = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceNote: "limited account",
    badge: "Limited",
    description: "For trying Cova with a small sample before you commit to a real review workflow.",
    included: [
      "1 limited workspace",
      "Up to 25 trades per import",
      "1 active Risk Passport",
      "Basic dashboard view",
      "Starter risk limits only",
    ],
    notIncluded: [
      "No saved import history",
      "No unlimited Passport links",
      "No export library",
      "No saved insight history",
      "No saved member sync",
    ],
  },
  {
    id: "pro",
    name: "Cova Pro",
    price: "$29/mo",
    priceNote: "founding price",
    badge: "Active trader",
    description: "For funded traders who want history, cleaner reviews, and stronger proof of discipline.",
    included: [
      "Unlimited trade imports",
      "Saved CSV and review history",
      "Unlimited Risk Passports",
      "Full editable risk limits",
      "Plain-English insight notes",
      "Export tools and member access",
    ],
    notIncluded: [
      "No trade signals",
      "No auto-trading",
      "No brokerage order execution",
      "No payout guarantee",
      "No financial advice",
    ],
  },
] as const;

export function PlanStrip({ compact = false, currentPlan, go, openAuth, upgradeToPro }: { compact?: boolean; currentPlan: PlanTier | null; go: (section: PlanRoute) => void; openAuth: (mode: AuthMode) => void; upgradeToPro: () => void }) {
  return (
    <section className={`deferred-paint-section plans-section relative overflow-hidden px-5 md:px-12 lg:px-20 ${compact ? "pb-10 pt-32 md:pt-36" : "py-28"}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-64 bg-[linear-gradient(180deg,#000_0%,rgba(0,0,0,0.8)_34%,rgba(0,0,0,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-72 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.74)_64%,#000_100%)]" />
      <div className="relative z-10 mx-auto w-full max-w-[calc(100vw-2.5rem)] md:max-w-7xl">
        <div className={`${compact ? "mb-7 max-w-3xl" : "mb-10 max-w-4xl"}`}>
          <span className="liquid-glass mb-5 inline-flex rounded-full px-4 py-2 font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Plans</span>
          <h2 className={`max-w-[10ch] break-words font-heading italic leading-[1.05] tracking-[0.012em] [word-spacing:0.04em] md:max-w-none md:[word-spacing:0.14em] ${compact ? "text-[42px] md:text-7xl" : "text-[48px] md:text-8xl"}`}>Try the review flow before you pay.</h2>
          <p className="mt-6 max-w-[31ch] font-body font-light leading-relaxed text-white/58 md:max-w-2xl">
            The free account is intentionally small: enough to see whether Cova helps you review risk.
            Upgrade when you want saved history, more Passport exports, and ongoing insight notes.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {planOptions.map((plan) => {
            const isPro = plan.id === "pro";
            const isCurrentPlan = currentPlan === plan.id;
            return (
              <motion.article
                className={`${isPro ? "liquid-glass-strong" : "liquid-glass"} rounded-[40px] p-5 md:p-8`}
                key={plan.name}
                initial={compact ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 30, filter: "blur(10px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div>
                    <span className={`rounded-full px-3 py-1 font-body text-xs uppercase tracking-[0.2em] ${isPro ? "bg-[#18c887]/18 text-[#b9f5df]" : "bg-white/8 text-white/50"}`}>
                      {isCurrentPlan ? "Current plan" : plan.badge}
                    </span>
                    <h3 className="mt-6 font-body text-3xl font-medium text-white">{plan.name}</h3>
                    <p className="mt-3 max-w-[28ch] font-body text-sm font-light leading-relaxed text-white/55 md:max-w-md">{plan.description}</p>
                  </div>
                  <div className="shrink-0 text-left md:text-right">
                    <p className="font-mono text-4xl leading-none text-white md:text-5xl">{plan.price}</p>
                    <p className="mt-2 max-w-[120px] font-body text-xs uppercase tracking-[0.18em] text-white/38 md:ml-auto">
                      {plan.priceNote}
                    </p>
                  </div>
                </div>

                <div className="my-7 h-px bg-white/10" />

                <div className="grid gap-6 xl:grid-cols-2">
                  <div>
                    <p className="mb-3 font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Comes with</p>
                    <div className="grid gap-3">
                      {plan.included.map((feature) => (
                        <div className="flex items-center gap-3 font-body text-sm text-white/72" key={feature}>
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${isPro ? "border-[#18c887]/35 bg-[#18c887]/10 text-[#b9f5df]" : "border-white/12 bg-white/5 text-white/58"}`}>
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 font-body text-xs uppercase tracking-[0.22em] text-white/34">Doesn't include</p>
                    <div className="grid gap-3">
                      {plan.notIncluded.map((feature) => (
                        <div className="flex items-center gap-3 font-body text-sm text-white/46" key={feature}>
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-black/20 text-white/34">
                            <X className="h-3.5 w-3.5" />
                          </span>
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  {isPro ? (
                    <GlassButton strong onClick={upgradeToPro}>{currentPlan === "pro" ? "Pro active" : "Upgrade to Pro"} <ArrowUpRight className="h-4 w-4" /></GlassButton>
                  ) : currentPlan ? (
                    <GlassButton strong onClick={() => go("import")}>Upload Sample Trades <ArrowUpRight className="h-4 w-4" /></GlassButton>
                  ) : (
                    <StartFreeButton icon onClick={() => openAuth("signup")}>Start free</StartFreeButton>
                  )}
                  <GlassButton onClick={() => go(isPro ? "passport" : "dashboard")}>{isPro ? "See Passport" : "Review Account"}</GlassButton>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function CtaFooter({ openAuth, sharePassport }: { openAuth: (mode: AuthMode) => void; sharePassport: () => void }) {
  return (
    <section className="deferred-paint-section relative overflow-hidden px-5 py-32 md:px-12 lg:px-20">
      <img src="/media/cova-dashboard-plate.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.18] grayscale" loading="lazy" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#000_0%,rgba(0,0,0,0.86)_52%,#000_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-96 bg-[linear-gradient(180deg,#000_0%,rgba(0,0,0,0.88)_28%,rgba(0,0,0,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-64 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,#000_100%)]" />
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-12 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="max-w-5xl font-heading text-6xl italic leading-[1.08] tracking-[0.012em] [word-spacing:0.16em] md:text-7xl lg:text-8xl">Stop repeating the trade that keeps costing you.</h2>
          <p className="mt-6 max-w-lg font-body font-light leading-relaxed text-white/58">Cova helps funded futures traders review behavior, tighten limits, and share proof of discipline without pretending to predict the market.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <StartFreeButton onClick={() => openAuth("signup")} />
          <GlassButton onClick={sharePassport}>Share Risk Passport</GlassButton>
        </div>
      </div>
      <footer className="relative mx-auto mt-28 flex max-w-7xl flex-col gap-5 border-t border-white/10 pt-7 font-body text-xs text-white/38 md:flex-row md:items-center md:justify-between">
        <span>© 2026 Cova. Built for risk review, not trade signals.</span>
        <span>Trade history · Risk limits · Shareable Passport</span>
      </footer>
    </section>
  );
}

