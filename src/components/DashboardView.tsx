import { motion } from "motion/react";
import { ArrowUpRight, CalendarDays, Database } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { analyze, formatMoney, type RiskRule, type Trade } from "../lib/risk";
import { getActionableReviewCount, getDashboardSummaryAction } from "../lib/dashboardReviewState";
import { getTradeSourceLabel } from "../lib/tradeSourceLabel";
import { EquityCurve, FlagStack, ScoreCard } from "./DashboardCards";
import { RithmicAttribution } from "./RithmicAttribution";

const DASHBOARD_RANGE_KEY = "cova-dashboard-range-v1";

type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "practice" | "passport";
type TimeRange = "today" | "week" | "all";

const rangeOptions: { id: TimeRange; label: string }[] = [
  { id: "today", label: "Latest session" },
  { id: "week", label: "Last 7 days" },
  { id: "all", label: "All trades" },
];

export function Dashboard({ analysis, rules, go }: { analysis: ReturnType<typeof analyze>; rules: RiskRule[]; go: (section: Section) => void }) {
  const [range, setRange] = useState<TimeRange>(() => readDashboardRange());
  const scopedTrades = useMemo(() => filterTradesByRange(analysis.trades, range), [analysis.trades, range]);
  const scopedAnalysis = useMemo(() => analyze(scopedTrades, rules), [scopedTrades, rules]);
  const hasRithmicTrades = scopedAnalysis.trades.some((trade) => trade.source?.provider === "Rithmic");
  const sourceLabel = getTradeSourceLabel(scopedAnalysis.trades);

  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_RANGE_KEY, range);
    } catch {
      // The selected range can remain session-only when storage is unavailable.
    }
  }, [range]);

  return (
    <section className="dashboard-workspace" data-oa-dashboard="dark">
      <header className="dashboard-workspace-header">
        <div>
          <h1>Risk Desk</h1>
          <p>Review trade history, risk pressure, and the evidence that needs attention.</p>
        </div>
        <div className="dashboard-range-controls" role="group" aria-label="Dashboard review range">
          <CalendarDays aria-hidden="true" className="h-4 w-4" />
          {rangeOptions.map((option) => (
            <button
              aria-pressed={range === option.id}
              className={range === option.id ? "dashboard-range-active" : ""}
              key={option.id}
              onClick={() => setRange(option.id)}
              type="button"
            >
              {range === option.id && (
                <motion.span
                  aria-hidden="true"
                  className="oa-range-highlight"
                  layoutId="oa-dashboard-range-highlight"
                  transition={{ type: "spring", stiffness: 550, damping: 40 }}
                />
              )}
              <span className="dashboard-range-label">{option.label}</span>
            </button>
          ))}
        </div>
      </header>

      <DashboardSummaryStrip analysis={scopedAnalysis} go={go} sourceLabel={sourceLabel} />

      {hasRithmicTrades && (
        <div className="dashboard-attribution-row">
          <RithmicAttribution compact />
        </div>
      )}

      <div className="dashboard-instrument-grid">
        <motion.section
          className="risk-chart-panel dashboard-equity-instrument motion-surface"
          initial={{ opacity: 0.4, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <div className="dashboard-instrument-header">
            <div>
              <h2>Equity curve</h2>
              <p>Cumulative reported P&amp;L from the selected trade history.</p>
            </div>
            <span>{scopedAnalysis.trades.length} trades</span>
          </div>
          <EquityCurve points={scopedAnalysis.equityPoints.map((point) => point.value)} />
        </motion.section>

        <aside className="dashboard-evidence-column" aria-label="Risk evidence">
          <ScoreCard analysis={scopedAnalysis} />
          <FlagStack analysis={scopedAnalysis} onReviewRisk={() => go("rules")} />
        </aside>
      </div>

      <DashboardReviewRow analysis={scopedAnalysis} go={go} />
    </section>
  );
}

function DashboardSummaryStrip({ analysis, go, sourceLabel }: { analysis: ReturnType<typeof analyze>; go: (section: Section) => void; sourceLabel: string }) {
  const action = getDashboardSummaryAction(analysis);
  const warningCount = getActionableReviewCount(analysis);
  const cells = [
    { label: "Review source", value: sourceLabel, tone: "" },
    { label: "Reported P&L", value: formatMoney(analysis.totalPnl), tone: analysis.totalPnl >= 0 ? "positive" : "negative" },
    { label: "Biggest dip", value: formatMoney(-analysis.maxDrawdown), tone: analysis.maxDrawdown > 0 ? "negative" : "positive" },
    { label: "Warnings", value: String(warningCount), tone: warningCount ? "warning" : "positive" },
  ];

  return (
    <div className="dashboard-summary-strip">
      {cells.map((cell) => (
        <div className="dashboard-summary-cell" key={cell.label}>
          <span>{cell.label}</span>
          <strong className={cell.tone}>{cell.value}</strong>
        </div>
      ))}
      <div className="dashboard-summary-actions">
        <button onClick={() => go("import")} type="button">Manage source</button>
        <button className="dashboard-summary-primary" onClick={() => go(action.target)} type="button">
          {action.label} <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function DashboardReviewRow({ analysis, go }: { analysis: ReturnType<typeof analyze>; go: (section: Section) => void }) {
  const brief = analysis.nextSessionBrief;
  const watchItem = brief.watchlist[0] || "No active historical warning in this review.";
  const status = brief.status === "ready" ? "Within limits" : brief.status === "locked" ? "Limit crossed" : "Needs review";

  return (
    <section className="dashboard-review-row">
      <header>
        <div>
          <h2>Next review</h2>
          <p>One concise handoff from this trade history.</p>
        </div>
        <button onClick={() => go("coach")} type="button">Open insights <ArrowUpRight aria-hidden="true" className="h-4 w-4" /></button>
      </header>
      <div className="dashboard-review-grid">
        <div><span>Focus</span><strong>{brief.headline}</strong></div>
        <div><span>Evidence</span><strong>{watchItem}</strong></div>
        <div><span>Review boundary</span><strong>Retrospective analysis only</strong></div>
        <div><span>Status</span><strong className={`dashboard-review-status dashboard-review-status-${brief.status}`}>{status}</strong></div>
      </div>
      <p className="dashboard-review-disclosure"><Database aria-hidden="true" className="h-3.5 w-3.5" />No live orders, broker controls, or future-result prediction.</p>
    </section>
  );
}

function filterTradesByRange(trades: Trade[], range: TimeRange) {
  if (range === "all" || trades.length <= 1) return trades;

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = sorted[sorted.length - 1]?.date;
  if (!latestDate) return sorted;
  if (range === "today") return sorted.filter((trade) => trade.date === latestDate);

  const end = new Date(`${latestDate}T00:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return sorted.filter((trade) => {
    const date = new Date(`${trade.date}T00:00:00`);
    return date >= start && date <= end;
  });
}

function readDashboardRange(): TimeRange {
  try {
    const value = localStorage.getItem(DASHBOARD_RANGE_KEY);
    if (value === "today" || value === "week" || value === "all") return value;
  } catch {
    return "all";
  }
  return "all";
}
