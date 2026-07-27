import { motion } from "motion/react";
import { ArrowUpRight, Check, X } from "lucide-react";
import { GlassButton } from "./GlassButton";
import { StartFreeButton } from "./StartFreeButton";

type PlanTier = "free" | "pro";
type PlanRoute = "dashboard" | "import" | "passport";
type FooterRoute = PlanRoute | "privacy" | "terms" | "security";
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
      "1 workspace",
      "25 stored trades total",
      "Up to 25 trades per import",
      "1 current Risk Passport view",
      "2 current insight notes",
      "Starter risk limits",
    ],
    notIncluded: [
      "Advanced limit editing",
      "Passport image export",
      "Direct account sync",
    ],
  },
  {
    id: "pro",
    name: "Cova Pro",
    price: "$29/mo",
    priceNote: "founding price",
    badge: "Active trader",
    description: "For funded traders who want a larger review workspace, export tools, and configurable risk checks.",
    included: [
      "Unlimited trade imports",
      "Unlimited reviewed trades",
      "Unlimited Passport image exports",
      "Full editable risk limits",
      "Full three-part insight brief",
      "Direct sync access when configured",
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
    <section className={`deferred-paint-section plans-section relative overflow-hidden px-5 md:px-12 lg:px-20 ${compact ? "pb-8 pt-28 md:pb-10 md:pt-36" : "py-28"}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-64 bg-[linear-gradient(180deg,#000_0%,rgba(0,0,0,0.8)_34%,rgba(0,0,0,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-72 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.74)_64%,#000_100%)]" />
      <div className="relative z-10 mx-auto w-full max-w-[calc(100vw-2.5rem)] md:max-w-7xl">
        <div className={`${compact ? "mb-7 max-w-3xl" : "mb-10 max-w-4xl"}`}>
          <span className="liquid-glass mb-5 inline-flex rounded-full px-4 py-2 font-body text-xs uppercase tracking-[0.22em] text-[#18c887]">Plans</span>
          <h2 className={`max-w-[12ch] break-words font-heading italic leading-[1.05] tracking-[0.012em] [word-spacing:0.04em] md:max-w-none md:[word-spacing:0.14em] ${compact ? "text-[40px] md:text-7xl" : "text-[48px] md:text-8xl"}`}>Try the review flow before you pay.</h2>
          <p className="mt-6 max-w-[31ch] font-body font-light leading-relaxed text-white/58 md:max-w-2xl">
            The free account is intentionally small: enough to see whether Cova helps you review risk.
            Upgrade for a larger trade workspace, Passport image export, advanced limit editing, configured direct sync, and the full current brief.
          </p>
          <div className="pricing-quick-actions mt-7 flex flex-wrap items-center gap-3">
            {currentPlan ? (
              <GlassButton strong onClick={() => go("import")}>Open your workspace <ArrowUpRight className="h-4 w-4" /></GlassButton>
            ) : (
              <StartFreeButton icon onClick={() => openAuth("signup")}>Start free</StartFreeButton>
            )}
            <span className="font-body text-xs leading-relaxed text-white/42">Free includes 25 stored trades, 25 trades per CSV import, the current Passport view, and 2 current insight notes. No card required.</span>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {planOptions.map((plan) => {
            const isPro = plan.id === "pro";
            const isCurrentPlan = currentPlan === plan.id;
            return (
              <motion.article
                className={`plan-card ${isPro ? "plan-card-pro liquid-glass-strong" : "liquid-glass"} relative rounded-[28px] p-5 md:rounded-[40px] md:p-8`}
                key={plan.name}
                initial={compact ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 30, filter: "blur(10px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
              >
                {isPro && (
                  <span className="plan-recommendation-tab">
                    <span aria-hidden="true" className="plan-recommendation-dot" />
                    MOST CHOSEN BY ACTIVE TRADERS
                  </span>
                )}
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
                  {isPro ? currentPlan === "pro" ? (
                    <span className="inline-flex min-h-11 items-center border border-[#18c887]/28 bg-[#18c887]/10 px-5 font-body text-sm font-medium text-[#b9f5df]" role="status">Pro active</span>
                  ) : (
                    <GlassButton strong onClick={upgradeToPro}>Upgrade to Pro <ArrowUpRight className="h-4 w-4" /></GlassButton>
                  ) : currentPlan ? (
                    <GlassButton strong onClick={() => go("import")}>Open trade import <ArrowUpRight className="h-4 w-4" /></GlassButton>
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

export function CtaFooter({ go, isSignedIn, openAuth, openPassport }: { go: (section: FooterRoute) => void; isSignedIn: boolean; openAuth: (mode: AuthMode) => void; openPassport: () => void }) {
  return (
    <>
      <section aria-labelledby="cova-closing-title" className="cova-closing-section">
        <div className="cova-closing-dock">
          <span aria-hidden="true" className="cova-closing-dock-line" />
          <div className="cova-closing-dock-tab">
            <p className="cova-closing-label">One better decision at a time</p>
          </div>
          <span aria-hidden="true" className="cova-closing-dock-line" />
        </div>
        <div className="cova-closing-content">
          <h2 className="cova-closing-title" id="cova-closing-title">
            <span>Stop repeating the trade</span>{" "}
            <span>that keeps costing you.</span>
          </h2>
          <p className="cova-closing-summary">Review behavior. Tighten limits. Build proof of discipline.</p>
          <div className="cova-closing-actions">
            <StartFreeButton className="cova-closing-primary" icon onClick={isSignedIn ? () => go("dashboard") : () => openAuth("signup")}>
              {isSignedIn ? "Open dashboard" : "Start for free"}
            </StartFreeButton>
            <button className="cova-closing-secondary" onClick={openPassport} type="button">
              {isSignedIn ? "Open Risk Passport" : "Explore Risk Passport"} <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>
      <footer className="cova-site-footer">
        <div className="cova-site-footer-inner">
          <span>© 2026 Cova. Built for risk review, not trade signals.</span>
          <div className="cova-site-footer-meta">
            <span>Trade history · Risk limits · Shareable Passport</span>
            <nav aria-label="Legal and support">
              <button onClick={() => go("privacy")} type="button">Privacy</button>
              <button onClick={() => go("terms")} type="button">Terms</button>
              <button onClick={() => go("security")} type="button">Security</button>
              <a href="mailto:support@covadesk.com">Support</a>
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}

