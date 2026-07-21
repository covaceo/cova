import { motion } from "motion/react";
import {
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Fingerprint,
  Play,
  Repeat2,
  Settings,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { StartFreeButton } from "./StartFreeButton";

export type MarketingSection = "dashboard" | "import";
export type MarketingAuthMode = "signup";

type HeroProps = {
  go: (section: MarketingSection) => void;
  isSignedIn: boolean;
  openAuth: (mode: MarketingAuthMode) => void;
};

type MarketCandleTone = "up" | "down";

type MarketCandle = {
  close: number;
  high: number;
  low: number;
  open: number;
  tone: MarketCandleTone;
  width: number;
};

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function buildDashboardVectorCandles(count: number): MarketCandle[] {
  const random = seededRandom(982451);
  const candles: MarketCandle[] = [];
  const marketMoves = [
    8, 10, 7, -6, 11, 13, 8, -9, -12, -14,
    -11, -8, 7, 10, 14, 19, -8, 12, 16, 11,
    -10, -15, -14, -10, -8, 9, 13, 17, 12, -16,
    -18, -15, -13, -8,
  ];
  let previousClose = 300;
  const rawMoves = marketMoves.slice(0, count).map((baseMove) => {
    const bodyNoise = (random() - 0.5) * (Math.abs(baseMove) > 15 ? 3.4 : 2.1);
    return baseMove + bodyNoise;
  });
  const loopCorrection = rawMoves.reduce((sum, move) => sum + move, 0) / Math.max(1, rawMoves.length);

  for (let index = 0; index < count; index += 1) {
    const open = previousClose;
    const move = rawMoves[index] - loopCorrection;
    const close = clampNumber(open + move, 230, 420);
    const body = Math.abs(close - open);
    const breakout = body > 16;
    const reversalProbe = index === 19 || index === 22 || index === 29;
    const upperWick = 2.2 + random() * (breakout ? 5.2 : 8.2) + (reversalProbe && close < open ? 5.5 : 0);
    const lowerWick = 2.2 + random() * (breakout ? 5.2 : 8.2) + (reversalProbe && close >= open ? 5.5 : 0);
    const width = body > 18 ? 17.2 : body > 11 ? 15.2 : 12.8;

    candles.push({
      close,
      high: Math.max(open, close) + upperWick,
      low: Math.min(open, close) - lowerWick,
      open,
      tone: close >= open ? "up" : "down",
      width,
    });
    previousClose = close;
  }

  return candles;
}
function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}


export function Hero({ go, openAuth, isSignedIn }: HeroProps) {
  function scrollHowItWorks() {
    document.querySelector(".story-strip-simple")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section
      className="market-hero relative flex min-h-[100dvh] overflow-hidden px-5 md:px-10 lg:px-[3.1rem]"
    >
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
            Review what keeps happening
          </p>

          <h1 className="market-hero-title mt-5 text-[4.35rem] font-semibold leading-[0.92] text-white md:text-[4.95rem] lg:text-[5.45rem]">
            See the <span className="market-hero-signal">patterns</span><br />
            <span className="market-hero-editorial">behind your risk.</span>
          </h1>

          <p className="market-hero-subline mt-7 font-body text-lg font-light leading-relaxed text-white/72 md:text-xl">
            Cova turns imported trade history into retrospective summaries of behavior, performance, and rule adherence.
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
        <HeroDashboardMockup revealStats={isSignedIn} />

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
          <span>Configured review limit</span>
          <strong>Size cap: 2 contracts.</strong>
        </div>
        <ArrowUpRight className="h-4 w-4" />
      </div>
    </motion.div>
  );
}

function HeroDashboardMockup({ revealStats }: { revealStats: boolean }) {
  const heroDashboardNav = [
    { label: "Overview", Icon: FileText },
    { label: "Trades", Icon: Repeat2 },
    { label: "Calendar", Icon: CalendarDays },
    { label: "Insights", Icon: ChartNoAxesColumnIncreasing },
    { label: "Goals", Icon: Target },
    { label: "Review", Icon: ClipboardCheck },
  ] satisfies { Icon: LucideIcon; label: string }[];
  const heroDashboardTrades = [
    ["ES", "Long", "+$320"],
    ["NQ", "Short", "-$180"],
    ["GC", "Long", "+$410"],
    ["MES", "Long", "+$95"],
  ];
  const heroMetrics = [
    ["Net P&L", "+$4,820"],
    ["Win rate", "61%"],
    ["Risk score", "82"],
    ["Rules kept", "74%"],
  ];

  return (
    <motion.div
      className="hero-dashboard-stage"
      initial={{ opacity: 0, x: 52, rotate: -1.5 }}
      animate={{ opacity: 1, x: 0, rotate: 0 }}
      transition={{ duration: 0.98, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
      aria-hidden="true"
    >
      <div className="hero-dashboard-glow" />
      <div className="hero-dashboard-shell">
        <div className="hero-dashboard-screen">
          <aside className="hero-dashboard-sidebar">
            <img src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png" alt="" className="hero-dashboard-wordmark" draggable={false} />
            <div className="hero-dashboard-nav-stack">
              {heroDashboardNav.map(({ label, Icon }, index) => (
                <span className={`hero-dashboard-nav ${index === 0 ? "hero-dashboard-nav-active" : ""}`} key={label}>
                  <Icon className="hero-dashboard-nav-icon" strokeWidth={1.85} />
                  {label}
                </span>
              ))}
            </div>
            <div className="hero-dashboard-sidebar-footer">
              <span className="hero-dashboard-settings">
                <Settings className="hero-dashboard-settings-icon" strokeWidth={1.8} />
                Settings
              </span>
              <div className="hero-dashboard-user">
                <img src="/media/cova-avatar-alex-r.png" alt="" className="hero-dashboard-avatar" draggable={false} />
                <span>Alex R.</span>
                <ChevronDown className="hero-dashboard-user-chevron" strokeWidth={1.8} />
              </div>
            </div>
          </aside>

          <main className="hero-dashboard-main">
            <div className="hero-dashboard-panel-title">Performance</div>
            <div className="hero-dashboard-metrics">
              {heroMetrics.map(([label, value]) => (
                <div className="hero-dashboard-metric" key={label}>
                  <span>{label}</span>
                  <strong className={label === "Net P&L" || label === "Rules kept" ? "text-[#39e3a6]" : "text-white"}>{value}</strong>
                </div>
              ))}
            </div>

            <div className="hero-dashboard-chart">
              <div className="hero-chart-toolbar">
                <span>Sample account</span>
                <div>
                  {["1W", "1M", "3M", "1Y", "All"].map((range) => (
                    <span className={range === "1M" ? "active" : ""} key={range}>{range}</span>
                  ))}
                </div>
              </div>
              <DashboardCandlestickChart />
            </div>

            <div className="hero-dashboard-cards">
              <div className="hero-dashboard-card hero-trades-card">
                <h4>Recent trades</h4>
                <div className="hero-trade-row hero-trade-row-head">
                  <span>Symbol</span>
                  <span>Status</span>
                  <strong>Access</strong>
                </div>
                {heroDashboardTrades.map(([market, side, pnl]) => (
                  <div className="hero-trade-row" key={`${market}-${pnl}`}>
                    <span>{market}</span>
                    <span className={side === "Long" ? "text-[#39e3a6]" : side === "Short" ? "text-[#ff5f7b]" : "text-white/54"}>{side}</span>
                    <strong className={pnl.startsWith("+") ? "text-[#39e3a6]" : pnl.startsWith("-") ? "text-[#ff5f7b]" : "text-white/48"}>{pnl}</strong>
                  </div>
                ))}
              </div>

              <div className="hero-dashboard-card hero-journal-card">
                <h4>Daily Journal</h4>
                <p>Execution grade</p>
                <div className="hero-stars" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, index) => <span key={index}>★</span>)}
                </div>
                <p>Main note</p>
                <strong>Waited for A+ setups.</strong>
              </div>

              <div className="hero-dashboard-card hero-risk-card">
                <h4>Risk breakdown</h4>
                <div className="hero-risk-donut">
                  <span>1.7%</span>
                  <small>Avg risk</small>
                </div>
                <div className="hero-risk-legend">
                  <span><i className="win" /> Win</span>
                  <span><i className="loss" /> Loss</span>
                  <span><i /> Scratch</span>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </motion.div>
  );
}

function DashboardCandlestickChart() {
  const candles = useMemo(() => buildDashboardVectorCandles(34), []);
  const prefersReducedMotion = usePrefersReducedMotion();
  const chartRef = useRef<SVGSVGElement | null>(null);
  const loopRef = useRef<SVGGElement | null>(null);
  const width = 760;
  const height = 218;
  const chartTop = 20;
  const chartBottom = 204;
  const minPrice = Math.min(...candles.map((candle) => candle.low)) - 4;
  const maxPrice = Math.max(...candles.map((candle) => candle.high)) + 4;
  const priceRange = Math.max(1, maxPrice - minPrice);
  const priceToY = (value: number) => chartTop + (1 - (value - minPrice) / priceRange) * (chartBottom - chartTop);
  const trackWidth = width;
  const candleStep = trackWidth / candles.length;
  const loopDistance = trackWidth - candleStep;

  useEffect(() => {
    const loop = loopRef.current;
    const chart = chartRef.current;
    if (!loop) {
      return;
    }

    if (prefersReducedMotion) {
      loop.setAttribute("transform", "translate(0 0)");
      return;
    }

    let frame = 0;
    let frameTimeout = 0;
    let startTime = 0;
    let isInView = true;
    const duration = 42000;
    const frameInterval = 1000 / 20;

    const clearScheduledFrame = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(frameTimeout);
      frame = 0;
      frameTimeout = 0;
    };

    const scheduleFrame = () => {
      if (frame || frameTimeout || !isInView || document.hidden) {
        return;
      }

      frameTimeout = window.setTimeout(() => {
        frameTimeout = 0;
        frame = window.requestAnimationFrame(animate);
      }, frameInterval);
    };

    const animate = (time: number) => {
      frame = 0;
      if (!startTime) {
        startTime = time;
      }
      const progress = ((time - startTime) % duration) / duration;
      loop.setAttribute("transform", `translate(${-progress * loopDistance} 0)`);
      scheduleFrame();
    };

    const observer = chart ? new IntersectionObserver(([entry]) => {
      isInView = entry ? entry.isIntersecting : true;
      if (isInView) {
        scheduleFrame();
      } else {
        clearScheduledFrame();
      }
    }, { rootMargin: "80px" }) : null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearScheduledFrame();
      } else {
        scheduleFrame();
      }
    };

    if (chart && observer) {
      observer.observe(chart);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleFrame();

    return () => {
      clearScheduledFrame();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [prefersReducedMotion, loopDistance]);

  const renderCandleTrack = (offset: number, copyIndex: number) => candles.map((candle, index) => {
    const x = offset + index * candleStep + candleStep * 0.3;
    const openY = priceToY(candle.open);
    const closeY = priceToY(candle.close);
    const highY = priceToY(candle.high);
    const lowY = priceToY(candle.low);
    const isUp = candle.close >= candle.open;
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(8.4, Math.abs(closeY - openY));
    const bodyWidth = candle.width;
    const bodyX = x - bodyWidth / 2;
    const wickClass = isUp ? "dashboard-candle-wick-up" : "dashboard-candle-wick-down";
    const bodyClass = isUp ? "dashboard-candle-body-up" : "dashboard-candle-body-down";

    return (
      <g className="dashboard-candle" key={`${copyIndex}-${index}-${candle.open.toFixed(2)}`}>
        <line className={`dashboard-candle-wick ${wickClass}`} x1={x} x2={x} y1={highY} y2={lowY} />
        <rect
          className={`dashboard-candle-body ${bodyClass}`}
          x={bodyX}
          y={bodyTop}
          width={bodyWidth}
          height={bodyHeight}
          rx="1.2"
        />
      </g>
    );
  });

  return (
    <svg
      ref={chartRef}
      className="hero-dashboard-vector-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Sample trading performance candlestick chart"
    >
      <defs>
        <clipPath id="dashboard-candlestick-clip">
          <rect x="0" y="0" width={width} height={height} rx="18" />
        </clipPath>
      </defs>
      <g className="hero-dashboard-vector-grid" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <line key={`h-${index}`} x1="0" x2={width} y1={32 + index * 31} y2={32 + index * 31} />
        ))}
        {Array.from({ length: 11 }).map((_, index) => (
          <line key={`v-${index}`} x1={index * 76} x2={index * 76} y1="0" y2={height} />
        ))}
      </g>
      <g clipPath="url(#dashboard-candlestick-clip)">
        <g className="dashboard-candle-loop" ref={loopRef}>
          {renderCandleTrack(-loopDistance, -1)}
          {renderCandleTrack(0, 0)}
          {renderCandleTrack(loopDistance, 1)}
          {renderCandleTrack(loopDistance * 2, 2)}
        </g>
      </g>
    </svg>
  );
}
