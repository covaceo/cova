import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, ChevronDown, Database, FileText, FileUp, Info, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analyze, type RiskRule, type Trade } from "../lib/risk";
import { getActionableReviewCount, getDashboardSummaryAction } from "../lib/dashboardReviewState";
import { journalSummary, moneyText, rowMoneyText, journalReviewEnabled } from "../lib/journalAccuracy";
import { JournalHeadlineStats, JournalDisciplineReview } from "./JournalAccuracyPanels";
import { getTradeSourceLabel } from "../lib/tradeSourceLabel";
import { FlagStack } from "./DashboardCards";
import { RithmicAttribution } from "./RithmicAttribution";
import { AstraEquityCurve } from "./AstraEquityCurve";
import { DashboardTradeDialog } from "./DashboardTradeDialog";
import { brokerCashSummary, type CashSummary } from '../lib/brokerCash';
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

export function Dashboard({ analysis, rules, go, rithmicSyncAvailable = false, onSaveTradeNote, journalReview = journalReviewEnabled(), accountControl }: {
  journalReview?: boolean;
  accountControl?: ReactNode;
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
  const cash = brokerCashSummary(analysis.trades, range);
  const tradovateOnly = analysis.trades.length > 0 && analysis.trades.every(t => t.source?.provider === 'Tradovate');
  const netCash = !journalReview && cash.status === 'available' ? cash : null;
  const journal = useMemo(() => journalSummary(scopedTrades), [scopedTrades]);
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

  return <section className="dashboard-workspace astra-dashboard" data-oa-dashboard="dark" data-astra-dashboard="integrated" data-dashboard-visual="reference">
    <header className="dashboard-workspace-header astra-title astra-reference-header">
      <div className="astra-header-title"><h1>Risk Desk</h1></div>
      <div className="astra-header-controls">
        {accountControl}
        {hasTradeHistory && <span className="astra-date-range"><CalendarDays aria-hidden="true" />{dateRangeLabel(scopedAnalysis.trades)}</span>}
        <button className="astra-button astra-import-action" onClick={manageSource} type="button"><FileUp aria-hidden="true" />{hasRithmicSource ? "Sync new trades" : "Import trades"}</button>
      </div>
      <div className="astra-header-meta">
        <span>{netCash ? `Cash report ${shortDate(netCash.startDate)} – ${shortDate(netCash.endDate)} · UTC · End exclusive` : hasTradeHistory ? "Your selected trade history" : "Import trade history to begin your first risk review."}</span>
        <details className="astra-data-details"><summary>Data details <ChevronDown aria-hidden="true" /></summary>
          <div className="astra-data-content">
            <span className="astra-source-label" aria-label={`Review source: ${sourceLabel}`} title={`Review source: ${sourceLabel}`}>{sourceLabel} / {journalReview ? scopedTrades.length : scopedAnalysis.tradeCount} {journalReview ? 'matched rows' : 'trades'}</span>
            {tradovateOnly && <p data-cash-coverage>{netCash ? `Broker cash movements · ${netCash.startDate} to ${netCash.endDate} exclusive, UTC · Synced ${new Date(netCash.asOf).toLocaleString()}. Funding excluded. Fees are not allocated to individual trades; win rate, trade statistics and discipline remain before fees.` : cash.status === 'unavailable' ? cash.reason : 'Account review uses gross trade results.'}</p>}
          </div>
        </details>
      </div>
    </header>

    {!hasTradeHistory ? <section className="dashboard-empty-state" data-dashboard-empty="true" aria-labelledby="dashboard-empty-title">
      <div className="dashboard-empty-panel">
        <span className="dashboard-empty-icon" aria-hidden="true"><FileUp /></span>
        <h2 id="dashboard-empty-title">Import trade history to start your review</h2>
        <p>Cova keeps a new account blank until you add your own trade data.</p>
        <button className="dashboard-empty-action" onClick={() => go("import")} type="button">Import trade history <ArrowUpRight aria-hidden="true" /></button>
      </div>
    </section> : <>
      {journalReview ? <><p className="astra-mini-note">Account accuracy review · Beta · Your saved history is unchanged.</p><JournalHeadlineStats journal={journal} /></> : <DashboardStats analysis={scopedAnalysis} cash={cash} tradovateOnly={tradovateOnly} />}

      {hasRithmicSource && <div className="dashboard-attribution-row"><RithmicAttribution compact /></div>}
      <div className="astra-desk-grid">
        <section className="astra-panel astra-chart-panel" aria-labelledby="astra-equity-title">
          <div className="astra-panel-heading">
            <div><h2 id="astra-equity-title">{netCash ? "Net P&L curve" : "Equity curve"}</h2><p>{netCash ? "Daily cumulative · USD · UTC" : "Cumulative gross / reported P&L from the selected trade history."}</p></div>
            <div className="dashboard-range-controls astra-segmented" role="group" aria-label="Dashboard review range">
              {rangeOptions.map(option => <button aria-pressed={range === option.id} className={range === option.id ? "dashboard-range-active" : ""} key={option.id} onClick={() => setRange(option.id)} type="button">{option.label}</button>)}
            </div>
          </div>
          {journalReview && journal.money.status !== 'available' ? <p className="astra-mini-note">{journal.money.reason}</p> : <AstraEquityCurve basis={netCash ? "daily-net" : "trades"} points={netCash ? netCash.points : journalReview && journal.money.status === 'available' ? journal.money.equityPoints : scopedAnalysis.equityPoints} />}
          <div className="astra-chart-note"><span><i aria-hidden="true" />{netCash ? "Net cash P&L" : tradovateOnly ? "Gross P&L" : "Reported P&L"}</span><span data-dashboard-trade-count={journalReview ? scopedTrades.length : scopedAnalysis.tradeCount}>{journalReview ? scopedTrades.length : scopedAnalysis.tradeCount} {journalReview ? 'matched rows' : 'trades'} · {journalReview ? (journal.money.status === 'available' ? moneyText(journal.money.totalCents) : 'Unavailable') : signedMoney(netCash ? netCash.netCents / 100 : scopedAnalysis.totalPnl)}</span></div>
        </section>
        {journalReview ? <JournalDisciplineReview journal={journal} rules={rules} onRules={() => go('rules')} /> : <DisciplineReview analysis={scopedAnalysis} go={go} />}
      </div>
      <div className="astra-desk-bottom">
        <section className="astra-panel astra-recent-trades" aria-labelledby="astra-recent-title">
          <div className="astra-panel-heading"><div><h2 id="astra-recent-title"><FileText aria-hidden="true" />Recent trades</h2></div><button className="astra-text-link" onClick={() => go("import")} type="button">View all <ArrowUpRight aria-hidden="true" /></button></div>
          <div className="astra-table-scroll"><table className="astra-trade-table"><thead><tr><th scope="col">Market</th><th scope="col">Side</th><th scope="col">Reported P&amp;L</th></tr></thead><tbody>
            {recentTrades.map(trade => <tr data-recent-trade={trade.id} key={trade.id}>
              <td><button type="button" className="astra-trade-link" onClick={() => openTrade(trade.id)} aria-label={`Review ${trade.market} trade from ${trade.date}`}><span className="astra-symbol" aria-hidden="true">{trade.market.slice(0, 2)}</span><span>{trade.market}</span></button></td>
              <td>{trade.side}</td><td className={trade.pnl < 0 ? "astra-negative" : "astra-positive"}>{journalReview ? rowMoneyText(trade, trade.pnl) : signedMoney(trade.pnl, true)}</td>
            </tr>)}
          </tbody></table></div>
        </section>
        <section className="astra-panel astra-journal" aria-labelledby="astra-journal-title">
          <div className="astra-panel-heading"><h2 id="astra-journal-title"><BookOpen aria-hidden="true" />From the journal</h2></div>
          <div className="astra-mini-note">
            {journalTrade ? <><div className="astra-note-date">{shortDate(journalTrade.date)} / {journalTrade.market} trade note</div><h3>{journalTrade.setup || "Your latest note."}</h3><p className="astra-note-excerpt">“{journalTrade.notes}”</p><button className="astra-text-link" onClick={() => openTrade(journalTrade.id)} type="button">Open trade note <ArrowRight aria-hidden="true" /></button></> : <><FileText className="astra-journal-empty-icon" aria-hidden="true" /><p>No journal notes in this range. Open a recent trade to add the context behind it.</p>{recentTrades[0] && <button className="astra-text-link" onClick={() => openTrade(recentTrades[0].id)} type="button">Add a trade note <ArrowRight aria-hidden="true" /></button>}</>}
          </div>
        </section>
      </div>
      {!journalReview && <details className="astra-review-details"><summary>Next review <span>Evidence and review status</span><ChevronDown aria-hidden="true" /></summary><DashboardReviewRow analysis={scopedAnalysis} go={go} /></details>}
    </>}
    <footer className="astra-dashboard-footer"><span>Retrospective review only. No live brokerage execution.</span><div className="dashboard-summary-actions"><button className="astra-text-link" onClick={manageSource} type="button">{hasRithmicSource ? "Sync new trades" : "Manage source"}<ArrowUpRight aria-hidden="true" /></button></div></footer>
    <DashboardTradeDialog journalReview={journalReview} trade={selectedTrade} onClose={() => setSelectedTradeId(null)} onSave={noteSaveRef.current} />
  </section>;
}

function DashboardStats({ analysis, cash, tradovateOnly }: { analysis: Analysis; cash: CashSummary; tradovateOnly: boolean }) {
  const net = cash.status === 'available' ? cash : null;
  const wins = analysis.winningTradeCount;
  const entries = analysis.entryGroups.some(group => group.entryIdentified);
  const cells = [
    { id: "pnl", label: net ? "Net cash P&L" : tradovateOnly ? "Gross P&L · fees unavailable" : "Reported P&L", value: signedMoney(net ? net.netCents / 100 : analysis.totalPnl), detail: net ? `${signedMoney(net.grossCents / 100)} gross · ${signedMoney(net.feeCents / 100)} fees` : `${analysis.tradeCount} ${entries ? 'trade entries · partial exits combined' : 'closed trades'}`, negative: (net ? net.netCents : analysis.totalPnl) < 0 },
    { id: "win-rate", label: entries ? "Entry win rate" : "Win rate", value: `${entries ? (analysis.winRate * 100).toFixed(2) : Math.round(analysis.winRate * 100)}%`, detail: `${wins} wins / ${analysis.tradeCount} ${entries ? 'entries' : 'trades'}` },
    { id: "profit-factor", label: "Profit factor", value: Number.isFinite(analysis.profitFactor) ? analysis.profitFactor.toFixed(2) : "∞", detail: analysis.grossLoss ? "Gross profit / gross loss" : analysis.grossProfit ? "No losing trades in this range" : "No gross profit or gross loss" },
    { id: "drawdown", label: "Max drawdown", value: signedMoney(-analysis.maxDrawdown), detail: "Closed-trade peak to trough", negative: analysis.maxDrawdown > 0 },
  ];
  return <div className="astra-stat-strip">
    <div className="astra-stat-basis">{tradovateOnly ? "Trade statistics before fees" : "Trade statistics"}</div>
    {cells.map(cell => <div className="astra-stat-cell" data-astra-stat={cell.id} key={cell.id}>
      <div className="astra-stat-label">{cell.label}{cell.id === 'pnl' && net ? <span className="astra-net-basis">Fees included · Funding excluded</span> : <Info aria-hidden="true" />}</div>
      <div className={`astra-stat-value ${cell.negative ? "astra-negative" : ""}`}>{cell.value}</div>
      <div className="astra-stat-detail">{cell.detail}</div>
    </div>)}
  </div>;
}

function DisciplineReview({ analysis, go }: { analysis: Analysis; go: (section: Section) => void }) {
  const action = getDashboardSummaryAction(analysis);
  const warningCount = getActionableReviewCount(analysis);
  const flag = analysis.behaviorFlags.find(item => item.severity === "critical" || item.severity === "warning") ?? analysis.behaviorFlags[0];
  return <section className="astra-panel astra-discipline" aria-labelledby="astra-discipline-title">
    <div className="astra-panel-heading"><div><h2 id="astra-discipline-title"><FileText aria-hidden="true" />Discipline review</h2><p>Evidence-based review. Not a trading permission.</p></div></div>
    <div className="astra-score-row"><div className="astra-score-ring" aria-label={`Cova Score ${analysis.score} out of 100`}>
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><circle cx="50" cy="50" r="43" stroke="#2c364b" strokeWidth="3" /><circle cx="50" cy="50" r="43" stroke="#8eafff" strokeWidth="3" pathLength="100" strokeDasharray={`${analysis.score} 100`} strokeLinecap="round" transform="rotate(-90 50 50)" /><circle cx="50" cy="50" r="36" stroke="#354159" strokeWidth=".5" strokeDasharray="1 4" /></svg>
      <div><strong>{analysis.score}</strong><small>/100</small></div>
    </div><div><strong>{analysis.score >= 80 ? "Strong risk discipline" : analysis.score >= 60 ? "Room to tighten." : "Risk needs attention."}</strong><p>{analysis.evidenceQuality.label} · {analysis.tradeCount} {analysis.entryGroups.some(group => group.entryIdentified) ? 'entries' : 'trades'} checked</p></div></div>
    <div className="astra-historical-label">Historical review</div>
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
