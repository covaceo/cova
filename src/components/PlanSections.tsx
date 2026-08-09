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
    priceNote: ["limited", "account"],
    badge: "Limited",
    index: "DEMO / 01",
    description: "For testing Cova with a small sample before committing to a review workflow.",
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
    price: "$29",
    priceNote: ["month", "founding price"],
    badge: "Active trader",
    index: "COVA / 02",
    description: "For funded traders who want deeper reviews, export tools, and configurable limits.",
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

export function PlanStrip({ compact = false, currentPlan, go, openAuth, proCheckoutAvailable, upgradeToPro }: { compact?: boolean; currentPlan: PlanTier | null; go: (section: PlanRoute) => void; openAuth: (mode: AuthMode) => void; proCheckoutAvailable: boolean; upgradeToPro: () => void }) {
  return (
    <section className={`deferred-paint-section plans-section pricing-showcase ${compact ? "pricing-showcase-compact" : ""}`}>
      <div aria-hidden="true" className="pricing-showcase-top-fade" />
      <div aria-hidden="true" className="pricing-showcase-bottom-fade" />
      <div className="pricing-showcase-inner">
        <div className="pricing-showcase-header">
          <h2 className="pricing-showcase-title">Try the review flow before you pay.</h2>
          <p className="pricing-showcase-summary">
            Start small enough to prove the workflow. Upgrade when Cova becomes part of every session review.
          </p>
        </div>

        <div className="pricing-plan-grid">
          {planOptions.map((plan) => {
            const isPro = plan.id === "pro";
            const isCurrentPlan = currentPlan === plan.id;
            return (
              <motion.article
                className={`plan-card ${isPro ? "plan-card-pro" : "plan-card-free"}`}
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
                <div className="plan-card-heading">
                  <span className="plan-card-badge">{isCurrentPlan ? "Current plan" : plan.badge}</span>
                  <span aria-hidden="true" className="plan-card-index">{plan.index}</span>
                </div>
                <h3 className="plan-card-name">{plan.name}</h3>
                <div className="plan-card-rule" />
                <p className="plan-card-description">{plan.description}</p>

                <div className="plan-price-row">
                  <p className="plan-price">{plan.price}</p>
                  <p className="plan-price-note">
                    {plan.priceNote.map((line) => <span key={line}>{line}</span>)}
                  </p>
                </div>

                {isPro ? currentPlan === "pro" ? (
                  <span className="plan-primary-action plan-primary-status" role="status">Pro active</span>
                ) : (
                  <button className="plan-primary-action" onClick={upgradeToPro} type="button">
                    <span>{proCheckoutAvailable ? "Upgrade to Pro" : "Pro checkout opening soon"}</span><ArrowUpRight aria-hidden="true" />
                  </button>
                ) : currentPlan ? (
                  <button className="plan-primary-action plan-primary-action-free" onClick={() => go("import")} type="button">
                    <span>Open trade import</span><ArrowUpRight aria-hidden="true" />
                  </button>
                ) : (
                  <button className="plan-primary-action plan-primary-action-free" onClick={() => openAuth("signup")} type="button">
                    <span>Start free</span><ArrowUpRight aria-hidden="true" />
                  </button>
                )}

                <div className="plan-card-rule plan-card-rule-after-action" />

                <div className="plan-feature-ledger">
                  <div className="plan-feature-group">
                    <p className="plan-feature-label">{isPro ? "Everything in Free, plus" : "What's included"}</p>
                    <div className="plan-feature-list">
                      {plan.included.map((feature) => (
                        <div className="plan-feature-row" key={feature}>
                          <span className={`plan-feature-icon ${isPro ? "plan-feature-icon-pro" : ""}`}><Check /></span>
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="plan-feature-group plan-feature-exclusions">
                    <p className="plan-feature-label">Doesn't include</p>
                    <div className="plan-feature-list">
                      {plan.notIncluded.map((feature) => (
                        <div className="plan-feature-row plan-feature-row-muted" key={feature}>
                          <span className="plan-feature-icon plan-feature-icon-muted"><X /></span>
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <button className="plan-secondary-action" onClick={() => go(isPro ? "passport" : "dashboard")} type="button">
                  {isPro ? "See Passport" : "Review Account"}<ArrowUpRight aria-hidden="true" />
                </button>
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
        <span aria-hidden="true" className="cova-closing-grid" />
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

