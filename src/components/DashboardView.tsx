import type { ConfirmManualNet } from '../lib/manualTrades';
import { ArrowUpRight, ChevronDown, FileText, FileUp, MessageCircle } from "lucide-react";
import '../styles/askCovaPanel.css';
import { useAccountNames } from '../lib/useAccountNames';
import { accountDisplayName } from '../lib/accountNames';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analyze, rMultiple, type RiskRule, type Trade } from "../lib/risk";

import { journalSummary, moneyText, rowMoneyText, journalReviewEnabled } from "../lib/journalAccuracy";
import { JournalHeadlineStats, JournalDisciplineReview } from "./JournalAccuracyPanels";
import { TradeAverageStats } from "./TradeAverageStats";
import { getTradeSourceLabel } from "../lib/tradeSourceLabel";

import { RithmicAttribution } from "./RithmicAttribution";
import { AstraEquityCurve } from "./AstraEquityCurve";
import { DashboardReviewRange } from "./DashboardReviewRange";
import { accountEquityPnlCents } from "../lib/equityCurveState";
import { DashboardTradeDialog } from "./DashboardTradeDialog";
import { TradeHistoryDialog } from "./TradeHistoryDialog";

import { OaDisciplineReview } from "./OaDisciplineReview";
import { WorkspaceMenuButton } from "./WorkspaceShell";
import { MiniJournal, type JournalActions } from "./MiniJournal";
import { ManualTradeDialog, type AddManualTrade } from "./ManualTradeDialog";
import { TradingCalendar } from "./TradingCalendar";
import { SessionRecapAction } from "./SessionRecapComposer";
import { brokerCashSummary, type CashSummary } from '../lib/brokerCash';
import { signedMoney } from "../lib/dashboardPresentation";
export { signedMoney } from "../lib/dashboardPresentation";

const DASHBOARD_RANGE_KEY = "cova-dashboard-range-v1";
const AskCova = lazy(() => import('./AskCova').then(module => ({ default: module.AskCova })));
const IMPORT_PROVIDER_HINT_KEY = "cova-import-provider-v1";
type Section = "overview" | "features" | "pricing" | "resources" | "community" | "dashboard" | "import" | "oauth" | "rules" | "coach" | "passport";
type TimeRange = "today" | "week" | "all";
type Analysis = ReturnType<typeof analyze>;


export function Dashboard({ noteDraftOwner, askCovaEnabled = false, askCovaOwner, askCovaReady = false, askCovaAuthorityKey, captureAskCovaAuthority, analysis, rules, go, rithmicSyncAvailable = false, onSaveTradeNote, journalReview = journalReviewEnabled(), accountControl, journalActions, onConfirmManualNet, onAddManualTrade, onDeleteManualTrade, manualAccounts = ["local"], selectedAccount = "local" }: {
  askCovaOwner?: string;
  askCovaEnabled?: boolean;
  askCovaReady?: boolean;
  askCovaAuthorityKey?: string;
  captureAskCovaAuthority?: () => Promise<(() => boolean) | null>;
  noteDraftOwner?: string;
  journalActions?: JournalActions;
  onAddManualTrade?: AddManualTrade;
  onConfirmManualNet?: ConfirmManualNet;
  onDeleteManualTrade?: (id: string) => boolean;
  manualAccounts?: string[];
  selectedAccount?: string;
  journalReview?: boolean;
  accountControl?: ReactNode;
  analysis: Analysis; rules: RiskRule[]; go: (section: Section) => void; rithmicSyncAvailable?: boolean;
  onSaveTradeNote?: (id: string, notes: string) => boolean;
}) {
  const [range, setRange] = useState<TimeRange>(() => readDashboardRange());
  const [askOpen, setAskOpen] = useState(false);
  const askEligible = Boolean(askCovaEnabled && askCovaOwner);
  const accountNames = useAccountNames(noteDraftOwner || '');
  const askVisible = useRef(false);
  const askLauncher = useRef<HTMLButtonElement>(null);
  function toggleAsk(open: boolean) {
    askVisible.current = open;
    setAskOpen(open);
    if (!open) { releaseAskModal.current(); askLauncher.current?.focus({ preventScroll: true }); }
  }
  const askPanel = useRef<HTMLElement>(null);
  const releaseAskModal = useRef<() => void>(() => {});
  useEffect(() => {
    if (!askOpen || !askEligible) return;
    const panel = askPanel.current;
    if (!panel) return;
    const media = window.matchMedia('(max-width: 1279px)');
    let release = () => {};
    const focusPanel = () => {
      if (!panel.contains(document.activeElement) && !document.querySelector('dialog[open]'))
        (panel.querySelector<HTMLElement>('[aria-label="Close Ask Cova"]') || panel).focus({ preventScroll: true });
    };
    const update = () => {
      release();
      panel.setAttribute('role', media.matches ? 'dialog' : 'complementary');
      if (media.matches) {
        panel.setAttribute('aria-modal', 'true');
        const siblings: { el: HTMLElement; inert: boolean }[] = [];
        for (let node: HTMLElement | null = panel; node?.parentElement; node = node.parentElement) {
          for (const sibling of Array.from(node.parentElement.children)) {
            if (sibling !== node && sibling instanceof HTMLElement) { siblings.push({ el: sibling, inert: sibling.inert }); sibling.inert = true; }
          }
          if (node.parentElement === document.body) break;
        }
        // CSS owns this sheet's scroll lock. A nested native dialog can then
        // restore its own inline overflow without retaining a stale sheet lock on resize.
        release = () => { siblings.forEach(({el,inert}) => { el.inert = inert; }); panel.removeAttribute('aria-modal'); };
        focusPanel();
      } else { panel.removeAttribute('aria-modal'); release = () => {}; }
      releaseAskModal.current = release;
    };
    const viewport = () => {
      panel.style.setProperty('--ask-viewport-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
      panel.style.setProperty('--ask-viewport-top', `${window.visualViewport?.offsetTop ?? 0}px`);
    };
    const keys = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return; // Native evidence owns Escape and Tab first.
      if (event.key === 'Escape') { event.preventDefault(); toggleAsk(false); }
      if (media.matches && event.key === 'Tab') {
        const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),summary,a[href],[tabindex="0"]')).filter(el => el.checkVisibility() && !el.closest('[hidden]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    update(); viewport(); focusPanel();
    media.addEventListener('change', update); document.addEventListener('keydown', keys);
    window.visualViewport?.addEventListener('resize', viewport); window.visualViewport?.addEventListener('scroll', viewport);
    return () => { release(); releaseAskModal.current = () => {}; media.removeEventListener('change', update); document.removeEventListener('keydown', keys); window.visualViewport?.removeEventListener('resize', viewport); window.visualViewport?.removeEventListener('scroll', viewport); };
  }, [askOpen, askEligible]);
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
  const recentTrades = scopedAnalysis.trades.slice(-5).reverse();

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
      <div className="astra-header-title"><h1>Risk Desk</h1><WorkspaceMenuButton /></div>
      <div className="astra-header-controls">
        {accountControl}
        {askEligible && <button ref={askLauncher} className="astra-button ask-cova-launcher" type="button" aria-controls="ask-cova-panel" aria-expanded={askOpen} onClick={() => toggleAsk(!askVisible.current)}><MessageCircle aria-hidden="true" />Ask Cova</button>}

        {hasTradeHistory && <SessionRecapAction trades={analysis.trades} selectedAccount={selectedAccount} onConfirmManualNet={onConfirmManualNet} />}

        <div className="astra-trade-actions">
          {onAddManualTrade && <button className="astra-button astra-add-trade" type="button" onClick={() => setManualOpen(true)}>Add trade</button>}
          <button className="astra-button astra-import-action" onClick={manageSource} type="button"><FileUp aria-hidden="true" />{hasRithmicSource ? "Update trades" : "Import trades"}</button>
        </div>
      </div>
      <div className="astra-header-meta">

        <details className="astra-data-details"><summary>Data details <ChevronDown aria-hidden="true" /></summary>
          <div className="astra-data-content">
            <p>{netCash ? `Cash report ${shortDate(netCash.startDate)} – ${shortDate(netCash.endDate)} · UTC · End exclusive` : hasTradeHistory ? "Your selected trade history" : "Import trades to see your results."}</p>
            <span className="astra-source-label" aria-label={`Review source: ${sourceLabel}`} title={`Review source: ${sourceLabel}`}>{sourceLabel} / {journalReview ? scopedTrades.length : scopedAnalysis.tradeCount} {journalReview ? 'matched rows' : 'trades'}</span>
            {tradovateOnly && <p data-cash-coverage>{netCash ? `Broker cash movements · ${netCash.startDate} to ${netCash.endDate} exclusive, UTC · Synced ${new Date(netCash.asOf).toLocaleString()}. Funding excluded. Fees are not allocated to individual trades; win rate, trade statistics and discipline remain before fees.` : cash.status === 'unavailable' ? cash.reason : 'Trade results are before fees.'}</p>}
            {hasTradeHistory && !journalReview && <DashboardStats analysis={scopedAnalysis} cash={cash} tradovateOnly={tradovateOnly} detailsOnly />}
            {hasTradeHistory && !journalReview && <TradeAverageStats trades={analysis.trades} selectedTrades={scopedTrades} detailsOnly />}
            {analysis.trades.some(trade=>trade.manual) && <p>Manual entries are self-reported gross USD results, not broker-verified records. Combined results do not include reconciled account fees. Remove a manual copy if that trade imports later.</p>}
            {hasTradeHistory && <p>Red is below $0 P&amp;L; green is above. Colors follow the selected range and its gross, reported or daily-net basis, not earlier profits or drawdown.</p>}
            {hasTradeHistory && <p>{netCash ? "Daily cumulative · USD · UTC" : "Cumulative gross / reported P&L from the selected trade history."}</p>}
          </div>
        </details>
      </div>
    </header>
    <div className="dashboard-ask-layout" data-ask-open={askEligible && askOpen}>
    <div className="dashboard-ask-content">
    {hasTradeHistory && <DashboardReviewRange trades={analysis.trades} range={range} onChange={setRange} cash={netCash} />}

    {!hasTradeHistory ? <section className="dashboard-empty-state" data-dashboard-empty="true" aria-labelledby="dashboard-empty-title">
      <div className="dashboard-empty-panel">
        <span className="dashboard-empty-icon" aria-hidden="true"><FileUp /></span>
        <h2 id="dashboard-empty-title">Import trades to see your results</h2>
        <button className="dashboard-empty-action" onClick={() => go("import")} type="button">Import trade history <ArrowUpRight aria-hidden="true" /></button>
      </div>
    </section> : <>
      {journalReview ? <><p className="astra-mini-note">Data checks · Beta · Your saved history is unchanged.</p><JournalHeadlineStats journal={journal} /></> : <div className="astra-stats-panel"><DashboardStats analysis={scopedAnalysis} cash={cash} tradovateOnly={tradovateOnly} /><details className="astra-metric-details"><summary>Metric details</summary><DashboardStats analysis={scopedAnalysis} cash={cash} tradovateOnly={tradovateOnly} detailsOnly /><TradeAverageStats trades={analysis.trades} selectedTrades={scopedTrades} /></details></div>}

      {hasRithmicSource && <div className="dashboard-attribution-row"><RithmicAttribution compact /></div>}
      <div className="astra-desk-grid">
        <div className="astra-desk-column astra-desk-main">
        <section className="astra-panel astra-chart-panel" aria-labelledby="astra-equity-title">
          <div className="astra-panel-heading">
            <div><h2 id="astra-equity-title">{netCash ? "Net P&L curve" : "Equity curve"}</h2></div>

          </div>
          {journalReview && journal.money.status !== 'available' ? <p className="astra-mini-note">{journal.money.reason}</p> : <AstraEquityCurve compact accountPnlCents={accountEquityPnlCents(analysis.trades, netCash ? (range === "all" ? cash : brokerCashSummary(analysis.trades, "all")) : { status: "unavailable", reason: "Reported trade basis" })} basis={netCash ? "daily-net" : "trades"} points={netCash ? netCash.points : journalReview && journal.money.status === 'available' ? journal.money.equityPoints : scopedAnalysis.equityPoints} />}
          <div className="astra-chart-note"><span>{netCash ? "Daily · USD" : tradovateOnly ? "Gross P&L" : "Reported P&L"}</span><span data-dashboard-trade-count={journalReview ? scopedTrades.length : scopedAnalysis.tradeCount}>{journalReview ? scopedTrades.length : scopedAnalysis.tradeCount} {journalReview ? `matched rows · ${journal.money.status === 'available' ? moneyText(journal.money.totalCents) : 'Unavailable'}` : 'trades'}</span></div>
        </section>
        <section className="astra-panel astra-recent-trades" aria-labelledby="astra-recent-title">
          <div className="astra-panel-heading"><div><h2 id="astra-recent-title"><FileText aria-hidden="true" />Recent trades</h2></div><button className="astra-text-link" onClick={() => { setAttachedTradeId(null); setHistoryOpen(true); }} type="button">View all <ArrowUpRight aria-hidden="true" /></button></div>
          <div className="astra-table-scroll"><table className="astra-trade-table"><thead><tr><th scope="col">Date</th><th scope="col">Market</th><th scope="col">Side</th><th scope="col">Setup</th><th scope="col" className="seamless-number">Qty</th><th scope="col" className="seamless-number">Entry</th><th scope="col" className="seamless-number">Exit</th><th scope="col" className="seamless-number">Reported P&amp;L</th><th scope="col" className="seamless-number">R multiple</th></tr></thead><tbody>
                      {recentTrades.map(trade => <tr data-recent-trade={trade.id} key={trade.id}>
                        <td><time dateTime={trade.date}>{shortDate(trade.date)}</time></td>
                        <td><button type="button" className="astra-trade-link" onClick={() => openTrade(trade.id)} aria-label={`Review ${trade.market} trade from ${trade.date}`}><span>{trade.market}{trade.manual && <small className="astra-manual-tag">Manual</small>}</span></button></td>
                        <td><span className={`seamless-side seamless-side-${trade.side.toLowerCase()}`}>{trade.side}</span></td><td>{trade.setup || '—'}</td><td className="seamless-number">{trade.contracts}</td><td className="seamless-number">{Number.isFinite(trade.entry) ? trade.entry.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 }) : '—'}</td><td className="seamless-number">{Number.isFinite(trade.exit) ? trade.exit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 }) : '—'}</td><td className={`seamless-number ${trade.pnl < 0 ? "astra-negative" : "astra-positive"}`}>{journalReview ? rowMoneyText(trade, trade.pnl) : signedMoney(trade.pnl, true)}</td><td className="seamless-number">{rMultiple(trade)?.toFixed(2) ?? '—'}</td>
            </tr>)}
          </tbody></table></div>
        </section>
        </div>
        <div className="astra-desk-column astra-desk-side">
        {journalReview ? <JournalDisciplineReview journal={journal} rules={rules} onRules={() => go('rules')} /> : <DisciplineReview analysis={scopedAnalysis} go={go} />}
        <MiniJournal seamless initialDate={scopedAnalysis.trades[scopedAnalysis.trades.length - 1]?.date || new Date().toLocaleDateString("en-CA")} actions={journalActions} trades={analysis.trades} onOpenTrade={id => { setAttachedTradeId(id); setHistoryOpen(true); }} />
        </div>
      </div>

    </>}
    <TradingCalendar key={selectedAccount} trades={analysis.trades} />
    {!hasTradeHistory && <MiniJournal initialDate={new Date().toLocaleDateString("en-CA")} actions={journalActions} trades={analysis.trades} onOpenTrade={id => { setAttachedTradeId(id); setHistoryOpen(true); }} />}
    </div>
    {askCovaEnabled && askCovaOwner && <aside ref={askPanel} tabIndex={-1} aria-label="Ask Cova" id="ask-cova-panel" className="ask-cova-panel" hidden={!askOpen}><Suspense fallback={<p role="status">Loading Ask Cova…</p>}><AskCova visible={askOpen} interactionCurrent={() => askVisible.current} onClose={() => toggleAsk(false)} accountLabel={accountDisplayName(selectedAccount, accountNames)} onRangeChange={setRange} authorityKey={askCovaAuthorityKey} captureAuthority={captureAskCovaAuthority} ownerId={askCovaOwner} account={selectedAccount} range={range} trades={analysis.trades} ready={askCovaReady} /></Suspense></aside>}
    </div>

    {manualOpen && onAddManualTrade && <ManualTradeDialog owner={noteDraftOwner} accounts={manualAccounts} selected={selectedAccount} onSave={onAddManualTrade} onClose={() => setManualOpen(false)} />}
    {historyOpen && <TradeHistoryDialog attachedTradeId={attachedTradeId} trades={analysis.trades} journalReview={journalReview} onClose={() => setHistoryOpen(false)} />}
    <DashboardTradeDialog accountStorage={journalActions?.accountStorage} draftOwner={noteDraftOwner} journalReview={journalReview} trade={selectedTrade} onClose={() => setSelectedTradeId(null)} onSave={noteSaveRef.current} onDelete={onDeleteManualTrade} />
  </section>;
}

function DashboardStats({ analysis, cash, tradovateOnly, detailsOnly = false }: { analysis: Analysis; cash: CashSummary; tradovateOnly: boolean; detailsOnly?: boolean }) {
  const net = cash.status === 'available' ? cash : null;
  const wins = analysis.winningTradeCount;
  const losses = analysis.entryGroups.filter(group => group.pnl < 0).length;
  const entries = analysis.entryGroups.some(group => group.entryIdentified);
  const cells = [
    { id: "pnl", label: net ? "Net cash P&L" : tradovateOnly ? "Gross P&L" : "Reported P&L", value: signedMoney(net ? net.netCents / 100 : analysis.totalPnl), detail: net ? `${signedMoney(net.grossCents / 100)} gross · ${signedMoney(net.feeCents / 100)} fees` : `${analysis.tradeCount} ${entries ? 'trade entries · partial exits combined' : 'closed trades'}`, negative: (net ? net.netCents : analysis.totalPnl) < 0 },
    { id: "win-rate", label: entries ? "Entry win rate" : "Win rate", value: `${entries ? (analysis.winRate * 100).toFixed(2) : Math.round(analysis.winRate * 100)}%`, detail: `${wins} ${wins === 1 ? 'win' : 'wins'} · ${losses} ${losses === 1 ? 'loss' : 'losses'} / ${analysis.tradeCount} ${entries ? 'entries' : 'trades'}` },
    { id: "profit-factor", label: "Profit factor", value: Number.isFinite(analysis.profitFactor) ? analysis.profitFactor.toFixed(2) : "∞", detail: analysis.grossLoss ? "Gross profit / gross loss" : analysis.grossProfit ? "No losing trades in this range" : "No gross profit or gross loss" },
    { id: "drawdown", label: "Max drawdown", value: signedMoney(-analysis.maxDrawdown), detail: "Closed-trade peak to trough", negative: analysis.maxDrawdown > 0 },
  ];
  return detailsOnly ? <dl className="astra-metric-explanations">{cells.map(cell => <div data-metric={cell.id} key={cell.id}><dt>{cell.label}</dt><dd className="astra-stat-detail">{cell.detail}</dd></div>)}</dl> : <div className="astra-stat-strip">

    {cells.map(cell => <div className="astra-stat-cell" data-astra-stat={cell.id} key={cell.id}>
      <div className="astra-stat-label">{cell.label}{cell.id === 'pnl' && net && <span className="astra-net-basis">Fees included</span>}</div>
      <div className={`astra-stat-value ${cell.negative ? "astra-negative" : ""}`}>{cell.value}</div>


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
