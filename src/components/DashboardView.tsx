import { ArrowUpRight, ChevronDown, FileText, FileUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analyze, type RiskRule, type Trade } from "../lib/risk";

import { journalSummary, moneyText, rowMoneyText, journalReviewEnabled } from "../lib/journalAccuracy";
import { JournalHeadlineStats, JournalDisciplineReview } from "./JournalAccuracyPanels";
import { TradeAverageStats } from "./TradeAverageStats";
import { getTradeSourceLabel } from "../lib/tradeSourceLabel";

import { RithmicAttribution } from "./RithmicAttribution";
import { AstraEquityCurve } from "./AstraEquityCurve";
import { accountEquityPnlCents } from "../lib/equityCurveState";
import { DashboardTradeDialog } from "./DashboardTradeDialog";
import { TradeHistoryDialog } from "./TradeHistoryDialog";
import { OaDisciplineReview } from "./OaDisciplineReview";
import { MiniJournal, type JournalActions } from "./MiniJournal";
import { ManualTradeDialog, type AddManualTrade } from "./ManualTradeDialog";
import { SessionRecapAction } from "./SessionRecapComposer";
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

export function Dashboard({ analysis, rules, go, rithmicSyncAvailable = false, onSaveTradeNote, journalReview = journalReviewEnabled(), accountControl, journalActions, onAddManualTrade, onDeleteManualTrade, manualAccounts = ["local"], selectedAccount = "local" }: {
  journalActions?: JournalActions;
  onAddManualTrade?: AddManualTrade;
  onDeleteManualTrade?: (id: string) => boolean;
  manualAccounts?: string[];
  selectedAccount?: string;
  journalReview?: boolean;
  accountControl?: ReactNode;
  analysis: Analysis; rules: RiskRule[]; go: (section: Section) => void; rithmicSyncAvailable?: boolean;
  onSaveTradeNote?: (id: string, notes: string) => boolean;
}) {
  const [range, setRange] = useState<TimeRange>(() => readDashboardRange());
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachedTradeId, setAttachedTradeId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
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

        {hasTradeHistory && <SessionRecapAction trades={analysis.trades} />}

        <div className="astra-trade-actions">
          {onAddManualTrade && <button className="astra-button astra-add-trade" type="button" onClick={() => setManualOpen(true)}>Add trade</button>}
          <button className="astra-button astra-import-action" onClick={manageSource} type="button"><FileUp aria-hidden="true" />{hasRithmicSource ? "Update trades" : "Import trades"}</button>
        </div>
      </div>
      <div className="astra-header-meta">

        <details className="astra-data-details"><summary>Data details <ChevronDown aria-hidden="true" /></summary>
          <div className="astra-data-content">
            <p>{netCash ? `Cash report ${shortDate(netCash.startDate)} – ${shortDate(netCash.endDate)} · UTC · End exclusive` : hasTradeHistory ? "Your selected trade history" : "Import trade history to begin your first risk review."}</p>
            <span className="astra-source-label" aria-label={`Review source: ${sourceLabel}`} title={`Review source: ${sourceLabel}`}>{sourceLabel} / {journalReview ? scopedTrades.length : scopedAnalysis.tradeCount} {journalReview ? 'matched rows' : 'trades'}</span>
            {tradovateOnly && <p data-cash-coverage>{netCash ? `Broker cash movements · ${netCash.startDate} to ${netCash.endDate} exclusive, UTC · Synced ${new Date(netCash.asOf).toLocaleString()}. Funding excluded. Fees are not allocated to individual trades; win rate, trade statistics and discipline remain before fees.` : cash.status === 'unavailable' ? cash.reason : 'Account review uses gross trade results.'}</p>}
            {hasTradeHistory && !journalReview && <DashboardStats analysis={scopedAnalysis} cash={cash} tradovateOnly={tradovateOnly} detailsOnly />}
            {hasTradeHistory && !journalReview && <TradeAverageStats trades={analysis.trades} selectedTrades={scopedTrades} detailsOnly />}
            {analysis.trades.some(trade=>trade.manual) && <p>Manual entries are self-reported gross USD results, not broker-verified records. Combined results do not include reconciled account fees. Remove a manual copy if that trade imports later.</p>}
            {hasTradeHistory && <p>Curve color follows the selected range: red below the displayed $0 P&amp;L line, green above. Colors use the plotted gross/reported or reconciled daily-net basis, not earlier account profits or drawdown from a previous peak.</p>}
            {hasTradeHistory && <p>{netCash ? "Daily cumulative · USD · UTC" : "Cumulative gross / reported P&L from the selected trade history."}</p>}
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
      {journalReview ? <><p className="astra-mini-note">Account accuracy review · Beta · Your saved history is unchanged.</p><JournalHeadlineStats journal={journal} /></> : <div className="astra-stats-panel"><DashboardStats analysis={scopedAnalysis} cash={cash} tradovateOnly={tradovateOnly} /><TradeAverageStats trades={analysis.trades} selectedTrades={scopedTrades} /></div>}

      {hasRithmicSource && <div className="dashboard-attribution-row"><RithmicAttribution compact /></div>}
      <div className="astra-desk-grid">
        <div className="astra-desk-column astra-desk-main">
        <section className="astra-panel astra-chart-panel" aria-labelledby="astra-equity-title">
          <div className="astra-panel-heading">
            <div><h2 id="astra-equity-title">{netCash ? "Net P&L curve" : "Equity curve"}</h2></div>
            <div className="dashboard-range-controls astra-segmented" role="group" aria-label="Dashboard review range">
              {rangeOptions.map(option => <button aria-pressed={range === option.id} className={range === option.id ? "dashboard-range-active" : ""} key={option.id} onClick={() => setRange(option.id)} type="button">{option.label}</button>)}
            </div>
          </div>
          {journalReview && journal.money.status !== 'available' ? <p className="astra-mini-note">{journal.money.reason}</p> : <AstraEquityCurve accountPnlCents={accountEquityPnlCents(analysis.trades, netCash ? (range === "all" ? cash : brokerCashSummary(analysis.trades, "all")) : { status: "unavailable", reason: "Reported trade basis" })} basis={netCash ? "daily-net" : "trades"} points={netCash ? netCash.points : journalReview && journal.money.status === 'available' ? journal.money.equityPoints : scopedAnalysis.equityPoints} />}
          <div className="astra-chart-note"><span>{netCash ? "Daily · USD" : tradovateOnly ? "Gross P&L" : "Reported P&L"}</span><span data-dashboard-trade-count={journalReview ? scopedTrades.length : scopedAnalysis.tradeCount}>{journalReview ? scopedTrades.length : scopedAnalysis.tradeCount} {journalReview ? `matched rows · ${journal.money.status === 'available' ? moneyText(journal.money.totalCents) : 'Unavailable'}` : 'trades'}</span></div>
        </section>
        <section className="astra-panel astra-recent-trades" aria-labelledby="astra-recent-title">
          <div className="astra-panel-heading"><div><h2 id="astra-recent-title"><FileText aria-hidden="true" />Recent trades</h2></div><button className="astra-text-link" onClick={() => { setAttachedTradeId(null); setHistoryOpen(true); }} type="button">View all <ArrowUpRight aria-hidden="true" /></button></div>
          <div className="astra-table-scroll"><table className="astra-trade-table"><thead><tr><th scope="col">Market</th><th scope="col">Side</th><th scope="col">Reported P&amp;L</th></tr></thead><tbody>
            {recentTrades.map(trade => <tr data-recent-trade={trade.id} key={trade.id}>
              <td><button type="button" className="astra-trade-link" onClick={() => openTrade(trade.id)} aria-label={`Review ${trade.market} trade from ${trade.date}`}><span className="astra-symbol" aria-hidden="true">{trade.market.slice(0, 2)}</span><span>{trade.market}{trade.manual && <small className="astra-manual-tag">Manual</small>}</span></button></td>
              <td>{trade.side}</td><td className={trade.pnl < 0 ? "astra-negative" : "astra-positive"}>{journalReview ? rowMoneyText(trade, trade.pnl) : signedMoney(trade.pnl, true)}</td>
            </tr>)}
          </tbody></table></div>
        </section>
        </div>
        <div className="astra-desk-column astra-desk-side">
        {journalReview ? <JournalDisciplineReview journal={journal} rules={rules} onRules={() => go('rules')} /> : <DisciplineReview analysis={scopedAnalysis} go={go} />}
        <MiniJournal initialDate={scopedAnalysis.trades[scopedAnalysis.trades.length - 1]?.date || new Date().toLocaleDateString("en-CA")} actions={journalActions} trades={analysis.trades} onOpenTrade={id => { setAttachedTradeId(id); setHistoryOpen(true); }} />
        </div>
      </div>

    </>}
    <footer className="astra-dashboard-footer"><span>Retrospective review only. No live brokerage execution.</span></footer>
    {manualOpen && onAddManualTrade && <ManualTradeDialog accounts={manualAccounts} selected={selectedAccount} onSave={onAddManualTrade} onClose={() => setManualOpen(false)} />}
    {!hasTradeHistory && <MiniJournal initialDate={new Date().toLocaleDateString("en-CA")} actions={journalActions} trades={analysis.trades} onOpenTrade={id => { setAttachedTradeId(id); setHistoryOpen(true); }} />}
    {historyOpen && <TradeHistoryDialog attachedTradeId={attachedTradeId} trades={analysis.trades} journalReview={journalReview} onClose={() => setHistoryOpen(false)} />}
    <DashboardTradeDialog journalReview={journalReview} trade={selectedTrade} onClose={() => setSelectedTradeId(null)} onSave={noteSaveRef.current} onDelete={onDeleteManualTrade} />
  </section>;
}

function DashboardStats({ analysis, cash, tradovateOnly, detailsOnly = false }: { analysis: Analysis; cash: CashSummary; tradovateOnly: boolean; detailsOnly?: boolean }) {
  const net = cash.status === 'available' ? cash : null;
  const wins = analysis.winningTradeCount;
  const losses = analysis.entryGroups.filter(group => group.pnl < 0).length;
  const entries = analysis.entryGroups.some(group => group.entryIdentified);
  const cells = [
    { id: "pnl", label: net ? "Net cash P&L" : tradovateOnly ? "Gross P&L · fees unavailable" : "Reported P&L", value: signedMoney(net ? net.netCents / 100 : analysis.totalPnl), detail: net ? `${signedMoney(net.grossCents / 100)} gross · ${signedMoney(net.feeCents / 100)} fees` : `${analysis.tradeCount} ${entries ? 'trade entries · partial exits combined' : 'closed trades'}`, negative: (net ? net.netCents : analysis.totalPnl) < 0 },
    { id: "win-rate", label: entries ? "Entry win rate" : "Win rate", value: `${entries ? (analysis.winRate * 100).toFixed(2) : Math.round(analysis.winRate * 100)}%`, detail: `${wins} wins / ${analysis.tradeCount} ${entries ? 'entries' : 'trades'}` },
    { id: "profit-factor", label: "Profit factor", value: Number.isFinite(analysis.profitFactor) ? analysis.profitFactor.toFixed(2) : "∞", detail: analysis.grossLoss ? "Gross profit / gross loss" : analysis.grossProfit ? "No losing trades in this range" : "No gross profit or gross loss" },
    { id: "drawdown", label: "Max drawdown", value: signedMoney(-analysis.maxDrawdown), detail: "Closed-trade peak to trough", negative: analysis.maxDrawdown > 0 },
  ];
  return detailsOnly ? <dl className="astra-metric-explanations">{cells.map(cell => <div data-metric={cell.id} key={cell.id}><dt>{cell.label}</dt><dd className="astra-stat-detail">{cell.detail}</dd></div>)}</dl> : <div className="astra-stat-strip">

    {cells.map(cell => <div className="astra-stat-cell" data-astra-stat={cell.id} key={cell.id}>
      <div className="astra-stat-label">{cell.label}{cell.id === 'pnl' && net && <span className="astra-net-basis">Fees included</span>}</div>
      <div className={`astra-stat-value ${cell.negative ? "astra-negative" : ""}`}>{cell.value}</div>
      {cell.id === "win-rate" && <div className="astra-win-loss" data-win-loss>{wins} {wins === 1 ? "win" : "wins"} · {losses} {losses === 1 ? "loss" : "losses"}</div>}

    </div>)}
  </div>;
}

function DisciplineReview({ analysis, go }: { analysis: Analysis; go: (section: Section) => void }) {
  return <OaDisciplineReview analysis={analysis} go={go} />;
}


function shortDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
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
