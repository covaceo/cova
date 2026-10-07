import { ArrowUpRight, Check, ChevronDown, Plus, X } from "lucide-react";
import "../../styles/landingPricing.css";
import { ProPriceDottedGlow } from "./ProPriceDottedGlow";

type MinimalPlan = {
  readonly id: "free" | "pro";
  readonly name: string;
  readonly price: string;
  readonly priceNote: readonly string[];
  readonly description: string;
  readonly included: readonly string[];
  readonly notIncluded: readonly string[];
};

type MinimalPricingProps = {
  page?: boolean;
  plans: readonly MinimalPlan[];
  currentPlan: "free" | "pro" | null;
  go: (section: "dashboard" | "import" | "passport") => void;
  openAuth: (mode: "signup") => void;
  proCheckoutAvailable: boolean;
  upgradeToPro: () => void;
};

function FeatureList({ items, additional = false }: { items: readonly string[]; additional?: boolean }) {
  return (
    <ul className={`minimal-plan-features${additional ? " minimal-plan-features-additional" : ""}`}>
      {items.map((feature) => (
        <li key={feature}>
          <span className="minimal-plan-check" aria-hidden="true"><Check /></span>
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

export function MinimalPlanPricing({ plans, currentPlan, go, openAuth, proCheckoutAvailable, upgradeToPro, page = false }: MinimalPricingProps) {
  const Heading = page ? "h1" : "h2";
  return (
    <section id="plans" className="deferred-paint-section plans-section pricing-showcase cova-minimal-pricing" data-pricing-layout="minimal" data-pricing-page={page || undefined} aria-labelledby="minimal-pricing-title">
      <header className="minimal-pricing-header">
        <Heading id="minimal-pricing-title">Try the review flow before you pay.</Heading>
        <p>Start small enough to prove the workflow. Upgrade when Cova becomes part of every session review.</p>
      </header>
      <div className="minimal-pricing-grid">
        {plans.map((plan) => {
          const isPro = plan.id === "pro";
          const isCurrentPlan = currentPlan === plan.id;
          return (
            <article key={plan.id} className={`minimal-plan${isPro ? " minimal-plan-pro" : ""}`} data-minimal-plan={plan.id} aria-labelledby={`minimal-plan-${plan.id}`}>
              {isPro && <ProPriceDottedGlow />}
              <div className="minimal-plan-heading">
                <h3 id={`minimal-plan-${plan.id}`}>{plan.name}</h3>
                {(isPro || isCurrentPlan) && (
                  <span className="minimal-plan-badge">{isCurrentPlan ? "Current plan" : "Most chosen by active traders"}</span>
                )}
              </div>
              <p className="minimal-plan-description">{plan.description}</p>
              <div className="minimal-plan-price-block">
                <p className="minimal-plan-price">{plan.price}</p>
                <p className="minimal-plan-period">
                  {isPro ? <><span>per {plan.priceNote[0]}</span><span aria-hidden="true"> · </span><span>{plan.priceNote[1]}</span></> : plan.priceNote.join(" ")}
                </p>
              </div>
              {isPro ? currentPlan === "pro" ? (
                <span className="minimal-plan-action minimal-plan-status" role="status">Pro active</span>
              ) : (
                <button className="minimal-plan-action" onClick={upgradeToPro} type="button">
                  {proCheckoutAvailable ? "Upgrade to Pro" : "Pro checkout opening soon"}
                </button>
              ) : currentPlan ? (
                <button className="minimal-plan-action" onClick={() => go("import")} type="button">Open trade import</button>
              ) : (
                <button className="minimal-plan-action" onClick={() => openAuth("signup")} type="button">Sign up</button>
              )}
              <div className="minimal-plan-feature-body">
                <FeatureList items={isPro ? plan.included.slice(0, 3) : plan.included} />
                {isPro && <>
                  <div className="minimal-plan-plus-divider" aria-hidden="true"><span /><Plus /><span /></div>
                  <FeatureList items={plan.included.slice(3)} additional />
                </>}
              </div>
              <details className="minimal-plan-boundaries">
                <summary>Doesn't include<ChevronDown aria-hidden="true" /></summary>
                <ul>{plan.notIncluded.map((feature) => <li key={feature}><X aria-hidden="true" /><span>{feature}</span></li>)}</ul>
              </details>
              <button className="minimal-plan-secondary" onClick={() => go(isPro ? "passport" : "dashboard")} type="button">
                {isPro ? "See Passport" : "Review Account"}<ArrowUpRight aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
