import { motion } from "motion/react";
import { ArrowUpRight, Fingerprint, Play } from "lucide-react";
import { StartFreeButton } from "./StartFreeButton";
import { HeroRiskCore } from "./HeroRiskCore";

export type MarketingSection = "dashboard" | "import";
export type MarketingAuthMode = "signup";

type HeroProps = {
  go: (section: MarketingSection) => void;
  isSignedIn: boolean;
  openAuth: (mode: MarketingAuthMode) => void;
};

export function Hero({ go, openAuth, isSignedIn }: HeroProps) {
  const followerReviews = [
    {
      name: "Marcus R.",
      quote: "Cova showed me patterns in my trading I never noticed before. My risk management has improved a lot.",
      rating: 5,
    },
    {
      name: "Daniel C.",
      quote: "It’s more than a trade tracker. Cova helps me understand why I keep making the same mistakes.",
      rating: 5,
    },
    {
      name: "Jasmine B.",
      quote: "Cova made my trade reviews faster, clearer, and way more useful.",
      rating: 5,
    },
  ];

  function scrollHowItWorks() {
    document.querySelector(".story-strip-simple")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="market-hero relative flex min-h-[100dvh] overflow-hidden px-5 md:px-10 lg:px-[3.1rem]">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_75%_38%,rgba(24,200,135,0.13),transparent_38%),radial-gradient(ellipse_at_23%_58%,rgba(185,245,223,0.06),transparent_32%),linear-gradient(180deg,#020403_0%,#07110d_54%,#000_100%)]" />
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgba(0,0,0,0.98)_0%,rgba(0,0,0,0.72)_34%,rgba(0,0,0,0.2)_72%,rgba(0,0,0,0.46)_100%)]" />
      <div className="market-hero-grid absolute inset-0 z-[2]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-[-1px] z-[5] h-64 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.72)_62%,#000_100%)]" />

      <div className="market-hero-layout relative z-10 grid gap-10 md:grid-cols-[0.76fr_1.24fr]">
        <motion.div
          className="market-hero-copy"
          initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.82, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="market-hero-eyebrow font-body text-xs font-medium uppercase tracking-[0.28em] text-[#18c887] md:text-sm">
            See what keeps going wrong
          </p>

          <h1 className="market-hero-title mt-5 text-[4.35rem] font-semibold leading-[0.92] text-white md:text-[4.95rem] lg:text-[5.45rem]">
            See the <span className="market-hero-signal">rule</span><br />
            <span className="market-hero-editorial">costing you payouts.</span>
          </h1>

          <p className="market-hero-subline mt-7 font-body text-lg font-light leading-relaxed text-white/72 md:text-xl">
            Cova reviews your trade history, finds the habits hurting your results, and shows you what to fix next.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-5">
            <span className="hero-primary-cta-wrap">
              {isSignedIn ? (
                <StartFreeButton icon onClick={() => go("dashboard")}>Open dashboard</StartFreeButton>
              ) : (
                <StartFreeButton icon onClick={() => openAuth("signup")} />
              )}
            </span>
            <button className="market-hero-action flex items-center gap-4 font-body text-base font-light text-white" onClick={isSignedIn ? () => go("import") : scrollHowItWorks} type="button">
              <span className="market-play-dot grid place-items-center">
                {isSignedIn ? <Fingerprint className="h-4 w-4 text-[#18c887]" /> : <Play className="h-4 w-4 fill-[#18c887] text-[#18c887]" />}
              </span>
              <span className="market-hero-action-label">{isSignedIn ? "Link account" : "See how it works"}</span>
            </button>
          </div>
          <p className="market-hero-proof mt-5 font-body text-sm text-white/48">
            <span /> {isSignedIn ? "Dashboard ready" : "No credit card required."}
          </p>
        </motion.div>

        <HeroMobileDossier />
        <HeroRiskCore />

        <motion.div
          className="market-reaction-band hidden xl:block"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.74, delay: 0.38, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="market-reaction-heading">
            <span>What people are saying</span>
          </div>
          <div className="market-reaction-strip">
            {followerReviews.map(({ name, quote, rating }) => (
              <blockquote className="market-reaction-item" key={name}>
                <p>“{quote}”</p>
                <footer>
                  <strong>{name}</strong>
                  <span className="market-reaction-rating" role="img" aria-label={`${rating} out of 5 stars`}>
                    <span aria-hidden="true">{"★".repeat(rating)}</span>
                    <small aria-hidden="true">{rating}/5</small>
                  </span>
                </footer>
              </blockquote>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function HeroMobileDossier() {
  return (
    <motion.div
      className="mobile-hero-dossier"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.68, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Sample Cova risk review"
    >
      <div className="mobile-hero-dossier-head">
        <div>
          <span>COVA / REVIEW 04</span>
          <strong>Funded account dossier</strong>
        </div>
        <small>Sample</small>
      </div>

      <div className="mobile-hero-alert">
        <div className="mobile-hero-alert-code">02</div>
        <div>
          <span>Rule pressure detected</span>
          <strong>Size increased after a red trade.</strong>
          <p>Three occurrences across the last seven sessions.</p>
        </div>
      </div>

      <div className="mobile-hero-metrics">
        <div><span>Risk score</span><strong>82</strong></div>
        <div><span>Rules kept</span><strong>74%</strong></div>
        <div><span>Net P&amp;L</span><strong>+$4,820</strong></div>
      </div>

      <div className="mobile-hero-next-action">
        <div>
          <span>Next review action</span>
          <strong>Cap size at 2 contracts.</strong>
        </div>
        <ArrowUpRight className="h-4 w-4" />
      </div>
    </motion.div>
  );
}
