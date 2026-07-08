import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { analyze, formatMoney, formatPercent, type RiskRule, type Trade } from "../lib/risk";
import { EquityCurve, FlagStack, MetricDock, ScoreCard } from "./DashboardCards";
import { NextSessionBriefCard } from "./DashboardBriefs";
import { GlassButton } from "./GlassButton";
import { ImageAtmosphere, SectionShell } from "./LayoutShell";

const DASHBOARD_FOCUS_KEY = "cova-dashboard-focus-v1";
const DASHBOARD_RANGE_KEY = "cova-dashboard-range-v1";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";
type DashboardFocus = "health" | "risk" | "performance" | "proof";
type TimeRange = "today" | "week" | "all";
type BrokerStatus = {
  provider: string;
  connected: boolean;
  updatedAt: string;
};

export function Dashboard({ analysis, brokerStatus, rules, go }: { analysis: ReturnType<typeof analyze>; brokerStatus: BrokerStatus | null; rules: RiskRule[]; go: (section: Section) => void }) {
  const [range, setRange] = useState<TimeRange>(() => readDashboardRange());
  const [focus, setFocus] = useState<DashboardFocus>(() => readDashboardFocus());
  const scopedTrades = useMemo(() => filterTradesByRange(analysis.trades, range), [analysis.trades, range]);
  const scopedAnalysis = useMemo(() => analyze(scopedTrades, rules), [scopedTrades, rules]);
  const rangeLabel = range === "today" ? `Latest session, ${analysis.latestDate}` : range === "week" ? "Last 7 calendar days" : "All trades";
  const focusLabel = {
    health: "Account health",
    risk: "Rules",
    performance: "P&L",
    proof: "Passport proof",
  }[focus];

  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_RANGE_KEY, range);
    } catch {
      // Ignore storage failures; the dashboard still works for the current session.
    }
  }, [range]);

  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_FOCUS_KEY, focus);
    } catch {
      // Ignore storage failures; the dashboard still works for the current session.
    }
  }, [focus]);

  return (
    <SectionShell
      eyebrow="Risk desk"
      title="Know what to fix before you trade."
      variant="workspace"
      action={<GlassButton onClick={() => go("rules")}>Set rules <ArrowUpRight className="h-4 w-4" /></GlassButton>}
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" />}
    >
      <DashboardCommandCenter
        analysis={scopedAnalysis}
        brokerStatus={brokerStatus}
        focus={focus}
        go={go}
        range={range}
        rangeLabel={rangeLabel}
        setFocus={setFocus}
        setRange={setRange}
      />
      <div className="dashboard-simple-grid">
        <motion.div
          className="risk-chart-panel liquid-glass-strong motion-surface rounded-[36px] p-5 md:p-8"
          initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center justify-between gap-5">
            <div>
              <p className="font-body text-xs uppercase tracking-[0.26em] text-[#18c887]">Account path</p>
              <h3 className="mt-2 font-body text-2xl font-medium">{focusLabel}</h3>
            </div>
            <span className="liquid-glass rounded-full px-4 py-2 font-body text-sm text-white/70">{scopedAnalysis.trades.length} trades</span>
          </div>
          <EquityCurve points={scopedAnalysis.equityPoints.map((point) => point.value)} />
          <MetricDock analysis={scopedAnalysis} />
        </motion.div>

        <aside className="dashboard-simple-side" aria-label="What matters next">
          <ScoreCard analysis={scopedAnalysis} />
          <FlagStack analysis={scopedAnalysis} />
          <NextSessionBriefCard analysis={scopedAnalysis} go={go} />
        </aside>
      </div>
    </SectionShell>
  );
}

function DashboardCommandCenter({
  analysis,
  brokerStatus,
  focus,
  go,
  range,
  rangeLabel,
  setFocus,
  setRange,
}: {
  analysis: ReturnType<typeof analyze>;
  brokerStatus: BrokerStatus | null;
  focus: DashboardFocus;
  go: (section: Section) => void;
  range: TimeRange;
  rangeLabel: string;
  setFocus: (focus: DashboardFocus) => void;
  setRange: (range: TimeRange) => void;
}) {
  const connected = Boolean(brokerStatus?.connected);
  const provider = brokerStatus?.provider || "Trade history";
  const updated = brokerStatus?.updatedAt
    ? new Date(brokerStatus.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Not connected";
  const sourceLabel = connected ? `${provider} linked` : analysis.trades.length ? "CSV/demo review" : "No trade history";
  const sourceDetail = connected
    ? "Read-only history is connected. Cova reviews behavior only."
    : analysis.trades.length
      ? "These stats come from uploaded or demo trades."
      : "Link an account or upload a CSV to start.";
  const ranges: { id: TimeRange; label: string }[] = [
    { id: "today", label: "Latest" },
    { id: "week", label: "Week" },
    { id: "all", label: "All" },
  ];
  const options: {
    id: DashboardFocus;
    label: string;
    metric: string;
    summary: string;
    target: Section;
  }[] = [
    {
      id: "health",
      label: "Score",
      metric: `${analysis.score}/100`,
      summary: "Am I clean enough to trade?",
      target: "dashboard",
    },
    {
      id: "risk",
      label: "Rules",
      metric: `${analysis.breaches.length} warnings`,
      summary: "What rule needs attention?",
      target: "rules",
    },
    {
      id: "performance",
      label: "P&L",
      metric: Number.isFinite(analysis.profitFactor) ? `${analysis.profitFactor.toFixed(2)} PF` : "∞ PF",
      summary: "Is the account moving the right way?",
      target: "dashboard",
    },
    {
      id: "proof",
      label: "Passport",
      metric: analysis.evidenceQuality.label,
      summary: "What can I show someone else?",
      target: "passport",
    },
  ];
  const active = options.find((option) => option.id === focus) ?? options[0];
  const quickMetrics = [
    ["P&L", formatMoney(analysis.totalPnl), analysis.totalPnl >= 0 ? "text-emerald-300" : "text-red-300"],
    ["Biggest dip", formatMoney(-analysis.maxDrawdown), analysis.maxDrawdown > 0 ? "text-red-300" : "text-white"],
    ["Warnings", String(analysis.breaches.length), analysis.breaches.length ? "text-red-300" : "text-emerald-300"],
  ];
  const sourceReady = connected || analysis.trades.length > 0;
  const limitsClean = analysis.ruleStatuses.length > 0 && analysis.breaches.length === 0;
  const reviewReady = analysis.trades.length > 0;
  const passportReady = reviewReady && analysis.evidenceQuality.level === "high" && analysis.breaches.length === 0;
  const nextAction = !sourceReady
    ? {
      label: "Add trade history",
      helper: "Connect an account or upload a CSV.",
      target: "import" as Section,
    }
    : analysis.breaches.length
      ? {
        label: "Review warnings",
        helper: `${analysis.breaches.length} rule warning${analysis.breaches.length === 1 ? "" : "s"} before the next session.`,
        target: "rules" as Section,
      }
      : analysis.evidenceQuality.level !== "high"
        ? {
          label: "Add more trades",
          helper: `${analysis.evidenceQuality.label}. More trades make the Passport stronger.`,
          target: "import" as Section,
        }
        : {
          label: "Open Passport",
          helper: "Clean enough to share.",
          target: "passport" as Section,
        };


  return (
    <motion.section
      className="risk-command-center liquid-glass-strong mb-6 overflow-hidden rounded-[38px] p-4 md:p-5"
      initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="grid gap-4 xl:grid-cols-[0.84fr_1.2fr_0.96fr] xl:items-stretch">
        <div className="risk-command-cell rounded-[30px] border border-white/10 bg-black/24 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-body text-xs ${connected ? "border-emerald-300/24 bg-emerald-400/10 text-emerald-200" : "border-white/12 bg-white/[0.035] text-white/52"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-300" : "bg-white/30"}`} />
              {connected ? "Connected" : "Not linked"}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-white/34">{updated}</span>
          </div>
          <h3 className="mt-4 font-body text-2xl font-semibold leading-[1.02] tracking-[-0.035em] text-white md:text-3xl">
            {sourceLabel}
          </h3>
          <p className="mt-3 max-w-xl font-body text-sm font-light leading-relaxed text-white/56">{sourceDetail}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <GlassButton strong onClick={() => go("import")}>
              {connected ? "Manage link" : "Link account"} <ArrowUpRight className="h-4 w-4" />
            </GlassButton>
            <GlassButton onClick={() => go("passport")}>Passport</GlassButton>
          </div>
        </div>

        <div className="risk-command-cell rounded-[30px] border border-white/10 bg-black/18 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <p className="font-body text-xs uppercase tracking-[0.18em] text-[#18c887]">Focus</p>
              <p className="mt-1 font-body text-sm text-white/46">{active.summary}</p>
            </div>
            <button
              className="inline-flex items-center gap-2 font-body text-sm font-medium text-[#b9f5df] transition hover:text-white"
              onClick={() => go(active.target)}
              type="button"
            >
              Open <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {options.map((option) => {
              const selected = option.id === focus;
              return (
                <button
                  className={`rounded-[22px] border px-4 py-3 text-left transition ${selected ? "border-[#18c887]/38 bg-[#18c887]/10 shadow-[0_18px_60px_rgba(24,200,135,0.08)]" : "border-white/10 bg-black/18 hover:border-white/20 hover:bg-white/[0.035]"}`}
                  key={option.id}
                  onClick={() => setFocus(option.id)}
                  type="button"
                >
                  <span className={`font-body text-sm font-medium ${selected ? "text-white" : "text-white/62"}`}>{option.label}</span>
                  <span className={`mt-2 block font-mono text-xs ${selected ? "text-[#b9f5df]" : "text-white/36"}`}>{option.metric}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="risk-command-cell rounded-[30px] border border-white/10 bg-black/24 p-5">
          <p className="font-body text-xs uppercase tracking-[0.18em] text-[#18c887]">Time period</p>
          <p className="mt-1 font-body text-sm text-white/55">{rangeLabel}</p>
          <div className="terminal-tab-bar mt-4 inline-grid w-full grid-cols-3">
            {ranges.map((item) => {
              const activeRange = range === item.id;
              return (
                <button
                  className={`terminal-tab px-4 py-2 font-body text-sm ${activeRange ? "terminal-tab-active" : ""}`}
                  key={item.id}
                  onClick={() => setRange(item.id)}
                  type="button"
                >
                  {activeRange && (
                    <motion.span
                      className="terminal-tab-motion"
                      layoutId="range-tab-active"
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                  <span className="terminal-tab-copy">{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid gap-2">
            {quickMetrics.map(([metric, value, tone]) => (
              <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.025] px-4 py-3" key={metric}>
                <span className="font-body text-sm text-white/52">{metric}</span>
                <strong className={`font-mono text-lg ${tone}`}>{value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[0.64fr_1.36fr]">
        <button
          className="group rounded-[28px] border border-[#18c887]/18 bg-[#18c887]/[0.055] p-5 text-left transition hover:border-[#b9f5df]/34 hover:bg-[#18c887]/[0.075]"
          onClick={() => go(nextAction.target)}
          type="button"
        >
          <p className="font-body text-xs uppercase tracking-[0.18em] text-[#b9f5df]/78">Next best action</p>
          <div className="mt-3 flex items-center justify-between gap-4">
            <h3 className="font-body text-xl font-semibold tracking-[-0.025em] text-white">{nextAction.label}</h3>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-[#b9f5df] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <p className="mt-2 font-body text-sm font-light leading-relaxed text-white/52">{nextAction.helper}</p>
        </button>

      </div>
    </motion.section>
  );
}

function filterTradesByRange(trades: Trade[], range: TimeRange) {
  if (range === "all" || trades.length <= 1) {
    return trades;
  }

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = sorted[sorted.length - 1]?.date;
  if (!latestDate) {
    return sorted;
  }

  if (range === "today") {
    return sorted.filter((trade) => trade.date === latestDate);
  }

  const end = new Date(`${latestDate}T00:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  return sorted.filter((trade) => {
    const date = new Date(`${trade.date}T00:00:00`);
    return date >= start && date <= end;
  });
}


function readDashboardFocus(): DashboardFocus {
  try {
    const value = localStorage.getItem(DASHBOARD_FOCUS_KEY);
    if (value === "health" || value === "risk" || value === "performance" || value === "proof") {
      return value;
    }
  } catch {
    return "health";
  }
  return "health";
}

function readDashboardRange(): TimeRange {
  try {
    const value = localStorage.getItem(DASHBOARD_RANGE_KEY);
    if (value === "today" || value === "week" || value === "all") {
      return value;
    }
  } catch {
    return "all";
  }
  return "all";
}

