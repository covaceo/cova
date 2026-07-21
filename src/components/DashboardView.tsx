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

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "practice" | "passport";
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
      title="Review what your trade history shows."
      variant="workspace"
      action={<GlassButton onClick={() => go("rules")}>Set rules <ArrowUpRight className="h-4 w-4" /></GlassButton>}
      backdrop={<ImageAtmosphere src="/media/cova-dashboard-plate.jpg" />}
    >
      <DashboardCommandCenter
        analysis={scopedAnalysis}
        brokerStatus={brokerStatus}
        go={go}
      />
      <div className="dashboard-simple-grid">
        <motion.div
          className="risk-chart-panel risk-os-panel motion-surface p-5 md:p-7"
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
  go,
}: {
  analysis: ReturnType<typeof analyze>;
  brokerStatus: BrokerStatus | null;
  go: (section: Section) => void;
}) {
  const connected = Boolean(brokerStatus?.connected);
  const provider = brokerStatus?.provider || "Trade history";
  const updated = brokerStatus?.updatedAt
    ? new Date(brokerStatus.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Not connected";
  const hasSampleTrades = analysis.trades.some((trade) => trade.id.startsWith("demo-"));
  const hasReviewedTrades = analysis.trades.some((trade) => !trade.id.startsWith("demo-"));
  const sourceLabel = connected ? `${provider} linked` : hasSampleTrades ? hasReviewedTrades ? "Sample + CSV review" : "Sample funded review" : analysis.trades.length ? "CSV trade review" : "No trade history";
  const quickMetrics = [
    ["P&L", formatMoney(analysis.totalPnl), analysis.totalPnl >= 0 ? "text-emerald-300" : "text-red-300"],
    ["Biggest dip", formatMoney(-analysis.maxDrawdown), analysis.maxDrawdown > 0 ? "text-red-300" : "text-white"],
    ["Warnings", String(analysis.breaches.length), analysis.breaches.length ? "text-red-300" : "text-emerald-300"],
  ];
  const sourceReady = connected || analysis.trades.length > 0;
  const nextAction = !sourceReady
    ? {
      label: "Add trade history",
      target: "import" as Section,
    }
    : analysis.breaches.length
      ? {
        label: "Review warnings",
        target: "rules" as Section,
      }
      : analysis.evidenceQuality.level !== "high"
        ? {
          label: "Add more trades",
          target: "import" as Section,
        }
        : {
          label: "Open Passport",
          target: "passport" as Section,
        };


  return (
    <motion.section
      className="risk-command-center risk-os-panel mb-6 overflow-hidden p-4 md:p-5"
      initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="risk-command-primary-grid grid gap-4 xl:items-center">
        <div>
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
          <div className="mt-4 flex flex-wrap gap-3">
            <GlassButton strong onClick={() => go("import")}>
              {connected ? "Manage link" : "Link account"} <ArrowUpRight className="h-4 w-4" />
            </GlassButton>
            <GlassButton onClick={() => go("passport")}>Passport</GlassButton>
          </div>
        </div>

        <button
          className="group min-w-[220px] rounded-[24px] border border-[#18c887]/18 bg-[#18c887]/[0.055] p-5 text-left transition hover:border-[#b9f5df]/34 hover:bg-[#18c887]/[0.075]"
          onClick={() => go(nextAction.target)}
          type="button"
        >
          <p className="font-body text-xs uppercase tracking-[0.18em] text-[#b9f5df]/78">Next</p>
          <div className="mt-3 flex items-center justify-between gap-4">
            <h3 className="font-body text-xl font-semibold tracking-[-0.025em] text-white">{nextAction.label}</h3>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-[#b9f5df] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </button>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-3">
        {quickMetrics.map(([metric, value, tone]) => (
          <div className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/[0.025] px-4 py-3" key={metric}>
            <span className="font-body text-sm text-white/52">{metric}</span>
            <strong className={`font-mono text-lg ${tone}`}>{value}</strong>
          </div>
        ))}
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

