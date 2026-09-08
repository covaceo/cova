import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, ChevronDown, Database, FileUp, Info, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { analyze, type RiskRule, type Trade } from "../lib/risk";
import { getActionableReviewCount, getDashboardSummaryAction } from "../lib/dashboardReviewState";
import { getTradeSourceLabel } from "../lib/tradeSourceLabel";
import { FlagStack } from "./DashboardCards";
import { RithmicAttribution } from "./RithmicAttribution";
import { AstraEquityCurve } from "./AstraEquityCurve";
import { DashboardTradeDialog } from "./DashboardTradeDialog";
import { signedMoney } from "../lib/dashboardPresentation";
export { signedMoney } from "../lib/dashboardPresentation";

const DASHBOARD_RANGE_KEY = "cova-dashboard-range-v1";
const IMPORT_PROVIDER_HINT_KEY = "cova-import-provider-v1";
type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";
type TimeRange = "today" | "week" | "all";
type Analysis = ReturnType<typeof analyze>;
const rangeOptions: { id: TimeRange; label: string }[] = [
  { id: "today", label: "Latest session" },
  { id: "week", label: "Last 7 days" },
  { id: "all", label: "All trades" },
];

export function Dashboard({ analysis, rules, go, rithmicSyncAvailable = false, onSaveTradeNote }: {
  analysis: Analysis; rules: RiskRule[]; go: (section: Section) => void; rithmicSyncAvailable?: boolean;
  onSaveTradeNote?: (id: string, notes: string) => boolean;
}) {
  const [range, setRange] = useState<TimeRange>(() => readDashboardRange());
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const noteSaveRef = useRef(onSaveTradeNote);
  function openTrade(id: string) {
    noteSaveRef.current = onSaveTradeNote;
    setSelectedTradeId(id);
  }
  const scopedTrades = useMemo(() => filterTradesByRange(analysis.trades, range), [analysis.trades, range]);
  const scopedAnalysis = useMemo(() => analyze(scopedTrades, rules), [scopedTrades, rules]);
  const hasRithmicTrades = analysis.trades.some((trade) => trade.source?.provider === "Rithmic");
  const hasRithmicSource = hasRithmicTrades || rithmicSyncAvailable;
  const sourceLabel = getTradeSourceLabel(scopedAnalysis.trades);
  const hasTradeHistory = analysis.trades.length > 0;
  const recentTrades = scopedAnalysis.trades.slice(-4).reverse();
  const journalTrade = [...scopedAnalysis.trades].reverse().find(trade => typeof trade.notes === "string" && trade.notes.trim());
  const selectedTrade = analysis.trades.find(trade => trade.id === selectedTradeId) ?? null;

  function manageSource() {
    if (hasRithmicSource) {
      try { sessionStorage.setItem(IMPORT_PROVIDER_HINT_KEY, "rithmic"); } catch { /* Selection can remain session-only. */ }
      window.dispatchEvent(new CustomEvent("cova:import-provider", { detail: "rithmic" }));
    }
    go("import");
  }
  useEffect(() => {
    try { localStorage.setItem(DASHBOARD_RANGE_KEY, range); } catch { /* Preserve in-memory range. */ }
  }, [range]);

  return <section className="dashboard-workspace astra-dashboard" data-oa-dashboard="dark" data-astra-dashboard="integrated">
    <div className="astra-deskbar">
      <div className="astra-breadcrumb"><span>Workspace</span><span>/</span><strong>Risk Desk</strong></div>
      <div className="astra-deskbar-tools">
        <span className="astra-source-label" aria-label={`Review source: ${sourceLabel}`} title={`Review source: ${sourceLabel}`}>{sourceLabel} / {scopedTrades.length} trades</span>
        <button className="astra-button" onClick={manageSource} type="button">{hasRithmicSource ? "Sync new trades" : "Import trades"}<Plus aria-hidden="true" /></button>
      </div>
    </div>
    <header className="dashboard-workspace-header astra-title">
      <div><h1>Your trading, in perspective.</h1><p>{hasTradeHistory ? "A clearer picture of what happened. Built from your trade history." : "Import trade history to begin your first risk review."}</p></div>
      {hasTradeHistory && <span className="astra-date-range"><CalendarDays aria-hidden="true" />{dateRangeLabel(scopedAnalysis.trades)}</span>}
    </header>

    {!hasTradeHistory ? <section className="dashboard-empty-state" data-dashboard-empty="true" aria-labelledby="dashboard-empty-title">
      <div className="dashboard-empty-panel">
        <span className="dashboard-empty-icon" aria-hidden="true"><FileUp /></span>
        <h2 id="dashboard-empty-title">Import trade history to start your review</h2>
        <p>Cova keeps a new account blank until you add your own trade data.</p>
        <button className="dashboard-empty-action" onClick={() => go("import")} type="button">Import trade history <ArrowUpRight aria-hidden="true" /></button>
      </div>
    </section> : <>
      <DashboardStats analysis={scopedAnalysis} />
      {hasRithmicSource && <div className="dashboard-attribution-row"><RithmicAttribution compact /></div>}
      <div className="astra-desk-grid">
        <section className="astra-panel astra-chart-panel" aria-labelledby="astra-equity-title">
          <div className="astra-panel-heading">
            <div><h2 id="astra-equity-title">Equity curve</h2><p>Cumulative reported P&amp;L from the selected trade history.</p></div>
            <div className="dashboard-range-controls astra-segmented" role="group" aria-label="Dashboard review range">
              {rangeOptions.map(option => <button aria-pressed={range === option.id} className={range === option.id ? "dashboard-range-active" : ""} key={option.id} onClick={() => setRange(option.id)} type="button">{option.label}</button>)}
            </div>
          </div>
          <AstraEquityCurve points={scopedAnalysis.equityPoints} />
          <div className="astra-chart-note"><span><i aria-hidden="true" />Reported P&amp;L</span><span data-dashboard-trade-count={scopedTrades.length}>{scopedTrades.length} trades · {signedMoney(scopedAnalysis.totalPnl)}</span></div>
        </section>
        <DisciplineReview analysis={scopedAnalysis} go={go} />
      </div>
      <div className="astra-desk-bottom">
        <section className="astra-panel astra-recent-trades" aria-labelledby="astra-recent-title">
          <div className="astra-panel-heading"><div><h2 id="astra-recent-title">Recent trades</h2><p>The record behind the review.</p></div><button className="astra-text-link" onClick={() => go("import")} type="button">View all <ArrowUpRight aria-hidden="true" /></button></div>
          <div className="astra-table-scroll"><table className="astra-trade-table"><thead><tr><th scope="col">Market</th><th scope="col">Side</th><th scope="col">Reported P&amp;L</th></tr></thead><tbody>
            {recentTrades.map(trade => <tr data-recent-trade={trade.id} key={trade.id}>
              <td><button type="button" className="astra-trade-link" onClick={() => openTrade(trade.id)} aria-label={`Review ${trade.market} trade from ${trade.date}`}><span className="astra-symbol" aria-hidden="true">{trade.market.slice(0, 2)}</span><span>{trade.market}</span></button></td>
              <td>{trade.side}</td><td className={trade.pnl < 0 ? "astra-negative" : "astra-positive"}>{signedMoney(trade.pnl, true)}</td>
            </tr>)}
          </tbody></table></div>
        </section>
        <section className="astra-panel astra-journal" aria-labelledby="astra-journal-title">
          <div className="astra-panel-heading"><h2 id="astra-journal-title">From the journal</h2><BookOpen aria-hidden="true" /></div>
          <div className="astra-mini-note">
            {journalTrade ? <><div className="astra-note-date">{shortDate(journalTrade.date)} / {journalTrade.market} trade note</div><h3>{journalTrade.setup || "Your latest note."}</h3><p className="astra-note-excerpt">“{journalTrade.notes}”</p><button className="astra-text-link" onClick={() => openTrade(journalTrade.id)} type="button">Open trade note <ArrowRight aria-hidden="true" /></button></> : <><div className="astra-note-date">Your review record</div><h3>The context starts with you.</h3><p>No journal notes in this range. Open a recent trade to add the context behind it.</p>{recentTrades[0] && <button className="astra-text-link" onClick={() => openTrade(recentTrades[0].id)} type="button">Add a trade note <ArrowRight aria-hidden="true" /></button>}</>}
          </div>
        </section>
      </div>
      <details className="astra-review-details"><summary>Next review <span>Evidence and review status</span><ChevronDown aria-hidden="true" /></summary><DashboardReviewRow analysis={scopedAnalysis} go={go} /></details>
    </>}
    <footer className="astra-dashboard-footer"><span>Retrospective review only. No live brokerage execution.</span><div className="dashboard-summary-actions"><button className="astra-text-link" onClick={manageSource} type="button">{hasRithmicSource ? "Sync new trades" : "Manage source"}<ArrowUpRight aria-hidden="true" /></button></div></footer>
    <DashboardTradeDialog trade={selectedTrade} onClose={() => setSelectedTradeId(null)} onSave={noteSaveRef.current} />
  </section>;
}

function DashboardStats({ analysis }: { analysis: Analysis }) {
  const wins = analysis.trades.filter(trade => trade.pnl > 0).length;
  const cells = [
    { id: "pnl", label: "Reported P&L", value: signedMoney(analysis.totalPnl), detail: `${analysis.trades.length} closed trades`, negative: analysis.totalPnl < 0 },
    { id: "win-rate", label: "Win rate", value: `${Math.round(analysis.winRate * 100)}%`, detail: `${wins} wins / ${analysis.trades.length} trades` },
    { id: "profit-factor", label: "Profit factor", value: Number.isFinite(analysis.profitFactor) ? analysis.profitFactor.toFixed(2) : "∞", detail: analysis.grossLoss ? "Gross profit / gross loss" : analysis.grossProfit ? "No losing trades in this range" : "No gross profit or gross loss" },
    { id: "drawdown", label: "Max drawdown", value: signedMoney(-analysis.maxDrawdown), detail: "Closed-trade peak to trough", negative: analysis.maxDrawdown > 0 },
  ];
  return <div className="astra-stat-strip">{cells.map(cell => <div className="astra-stat-cell" data-astra-stat={cell.id} key={cell.id}><div className="astra-stat-label">{cell.label}<Info aria-hidden="true" /></div><div className={`astra-stat-value ${cell.negative ? "astra-negative" : ""}`}>{cell.value}</div><div className="astra-stat-detail">{cell.detail}</div></div>)}</div>;
}

function DisciplineReview({ analysis, go }: { analysis: Analysis; go: (section: Section) => void }) {
  const action = getDashboardSummaryAction(analysis);
  const warningCount = getActionableReviewCount(analysis);
  const flag = analysis.behaviorFlags.find(item => item.severity === "critical" || item.severity === "warning") ?? analysis.behaviorFlags[0];
  return <section className="astra-panel astra-discipline" aria-labelledby="astra-discipline-title">
    <div className="astra-panel-heading"><div><h2 id="astra-discipline-title">Discipline review</h2><p>Evidence-based review. Not a trading permission.</p></div></div>
    <div className="astra-score-row"><div className="astra-score-ring" aria-label={`Cova Score ${analysis.score} out of 100`}>
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><circle cx="50" cy="50" r="43" stroke="#2c364b" strokeWidth="3" /><circle cx="50" cy="50" r="43" stroke="#8eafff" strokeWidth="3" pathLength="100" strokeDasharray={`${analysis.score} 100`} strokeLinecap="round" transform="rotate(-90 50 50)" /><circle cx="50" cy="50" r="36" stroke="#354159" strokeWidth=".5" strokeDasharray="1 4" /></svg>
      <div><strong>{analysis.score}</strong><small>Discipline</small></div>
    </div><div><strong>{analysis.score >= 80 ? "Strong risk discipline" : analysis.score >= 60 ? "Room to tighten." : "Risk needs attention."}</strong><p>{analysis.evidenceQuality.label} · {analysis.trades.length} trades checked</p></div></div>
    <div className="astra-score-scale" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <i key={index} className={index < Math.round(analysis.score / 100 * 16) ? "astra-lit" : ""} />)}</div>
    <div className="astra-scale-ends"><span>0 / Needs review</span><span>100 / Consistent</span></div>
    <button className="astra-warning-link dashboard-summary-primary" onClick={() => go(action.target)} type="button"><TriangleAlert aria-hidden="true" /><span><strong>{flag?.label || action.label}</strong><span>{flag?.summary || analysis.evidenceQuality.summary}</span><small>{action.label} <ArrowUpRight aria-hidden="true" /></small></span></button>
    <details className="astra-evidence-details"><summary><span>{warningCount} {warningCount === 1 ? "warning" : "warnings"} · Evidence &amp; score factors</span><ChevronDown aria-hidden="true" /></summary><p>{analysis.evidenceQuality.summary}</p><div className="astra-factor-list">{analysis.scoreFactors.slice(0, 3).map(factor => <div key={factor.label}><span>{factor.label}</span><strong className={factor.impact === "negative" ? "astra-negative" : factor.impact === "positive" ? "astra-positive" : ""}>{factor.impact}</strong></div>)}</div><FlagStack analysis={analysis} onReviewRisk={() => go("rules")} /></details>
  </section>;
}

function DashboardReviewRow({ analysis, go }: { analysis: Analysis; go: (section: Section) => void }) {
  const brief = analysis.nextSessionBrief;
  const watchItem = brief.watchlist[0] || "No active historical warning in this review.";
  const status = brief.status === "ready" ? "Within limits" : brief.status === "locked" ? "Limit crossed" : "Needs review";
  return <section className="dashboard-review-row"><header><div><h2>Next review</h2><p>One concise handoff from this trade history.</p></div><button onClick={() => go("coach")} type="button">Open insights <ArrowUpRight aria-hidden="true" /></button></header><div className="dashboard-review-grid"><div><span>Focus</span><strong>{brief.headline}</strong></div><div><span>Evidence</span><strong>{watchItem}</strong></div><div><span>Review boundary</span><strong>Retrospective analysis only</strong></div><div><span>Status</span><strong className={`dashboard-review-status dashboard-review-status-${brief.status}`}>{status}</strong></div></div><p className="dashboard-review-disclosure"><Database aria-hidden="true" />No live orders, broker controls, or future-result prediction.</p></section>;
}


function shortDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
}
function dateRangeLabel(trades: Trade[]) {
  if (!trades.length) return "No trades in range";
  return trades[0].date === trades[trades.length - 1].date ? shortDate(trades[0].date) : `${shortDate(trades[0].date)} – ${shortDate(trades[trades.length - 1].date)}`;
}
function filterTradesByRange(trades: Trade[], range: TimeRange) {
  if (range === "all" || trades.length <= 1) return trades;
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = sorted[sorted.length - 1]?.date;
  if (!latestDate) return sorted;
  if (range === "today") return sorted.filter((trade) => trade.date === latestDate);
  const end = new Date(`${latestDate}T00:00:00`);
  const start = new Date(end); start.setDate(start.getDate() - 6);
  return sorted.filter((trade) => { const date = new Date(`${trade.date}T00:00:00`); return date >= start && date <= end; });
}
function readDashboardRange(): TimeRange {
  try { const value = localStorage.getItem(DASHBOARD_RANGE_KEY); if (value === "today" || value === "week" || value === "all") return value; } catch { return "all"; }
  return "all";
}
