import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SkipBack,
  Target,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type {
  PracticeAccount,
  PracticeAccountLimitStatus,
  PracticeAccountStats,
  PracticeAnalysis,
  PracticePosition,
  PracticeTrade,
  ReplayCandle,
  ReplayTape,
} from "../../lib/backtesting";
import { formatMoney, formatPercent } from "../../lib/risk";

type DeskTab = "positions" | "orders" | "trades" | "review";

type BacktestingTerminalProps = {
  account: PracticeAccount | null;
  accountStats: PracticeAccountStats;
  activeSetup: string;
  analysis: PracticeAnalysis;
  chart: ReactNode;
  currentCandle: ReplayCandle;
  limitStatus: PracticeAccountLimitStatus;
  mistake: string;
  onBackHour: () => void;
  onBuy: () => void;
  onChangeAccount: () => void;
  onClosePosition: () => void;
  onMistakeChange: (value: string) => void;
  onPlayToggle: () => void;
  onQuantityChange: (quantity: number) => void;
  onReset: () => void;
  onRulesFollowedChange: (value: "yes" | "no") => void;
  onSell: () => void;
  onStep: () => void;
  openingRangeBarCount: number;
  openingRangeComplete: boolean;
  orderQuantity: number;
  playing: boolean;
  position: PracticePosition | null;
  recentTrades: PracticeTrade[];
  replayTape: ReplayTape;
  rulesFollowed: "yes" | "no";
  visibleCandles: ReplayCandle[];
};

const deskTabs: Array<{ id: DeskTab; label: string }> = [
  { id: "positions", label: "Positions" },
  { id: "orders", label: "Orders" },
  { id: "trades", label: "Trades" },
  { id: "review", label: "Session review" },
];

export function BacktestingTerminal({
  account,
  accountStats,
  activeSetup,
  analysis,
  chart,
  currentCandle,
  limitStatus,
  mistake,
  onBackHour,
  onBuy,
  onChangeAccount,
  onClosePosition,
  onMistakeChange,
  onPlayToggle,
  onQuantityChange,
  onReset,
  onRulesFollowedChange,
  onSell,
  onStep,
  openingRangeBarCount,
  openingRangeComplete,
  orderQuantity,
  playing,
  position,
  recentTrades,
  replayTape,
  rulesFollowed,
  visibleCandles,
}: BacktestingTerminalProps) {
  const [deskTab, setDeskTab] = useState<DeskTab>("positions");
  const canOpen = Boolean(account) && !position && limitStatus.canOpenNewPosition;
  const dailyLossRemaining = Math.max(0, account ? account.maxDailyLoss + Math.min(0, limitStatus.dailyPnl) : 0);
  const drawdownRemaining = Math.max(0, account ? account.maxDrawdown - accountStats.maxDrawdown : 0);
  const unrealizedPnl = position
    ? calculateUnrealizedPnl(position, currentCandle.close, replayTape.market)
    : 0;

  return (
    <main className="backtesting-terminal">
      <section className="backtesting-command-strip" aria-label="Replay session controls">
        <div className="backtesting-instrument">
          <span>Instrument</span>
          <strong>{replayTape.market}</strong>
          <small>Simulated · {replayTape.dataSource.resolutionMinutes}m</small>
        </div>
        <div className="backtesting-command-cell">
          <CalendarDays className="h-4 w-4" />
          <span>Session</span>
          <strong>{replayTape.date}</strong>
        </div>
        <div className="backtesting-command-cell backtesting-command-setup">
          <Target className="h-4 w-4" />
          <span>Setup</span>
          <strong>{activeSetup}</strong>
        </div>
        <div className="backtesting-command-cell">
          <Clock3 className="h-4 w-4" />
          <span>Replay time</span>
          <strong>{currentCandle.time.slice(-5)}</strong>
        </div>
        <div className="backtesting-command-cell backtesting-command-pnl">
          <CircleDollarSign className="h-4 w-4" />
          <span>Session P&amp;L</span>
          <strong className={limitStatus.dailyPnl >= 0 ? "is-positive" : "is-negative"}>{formatMoney(limitStatus.dailyPnl)}</strong>
        </div>
        <button className="backtesting-account-button" onClick={onChangeAccount} type="button">
          <Settings2 className="h-4 w-4" />
          Account
        </button>
      </section>

      <div className="backtesting-workbench">
        <section className="backtesting-chart-deck">
          <header className="backtesting-chart-toolbar">
            <div>
              <span className="backtesting-live-dot" />
              <strong>{replayTape.market} · {replayTape.dataSource.resolutionMinutes}m</strong>
              <small>{activeSetup}</small>
            </div>
            <div className="backtesting-level-readout">
              <span>{openingRangeComplete ? `ORH ${replayTape.levels.openingRangeHigh.toFixed(2)}` : `OR ${visibleCandles.length}/${openingRangeBarCount}`}</span>
              <span>{openingRangeComplete ? `ORL ${replayTape.levels.openingRangeLow.toFixed(2)}` : "Building"}</span>
              <span>VWAP {(currentCandle.vwap ?? currentCandle.close).toFixed(2)}</span>
            </div>
          </header>

          <div className="backtesting-chart-viewport">{chart}</div>

          <footer className="backtesting-transport">
            <div className="backtesting-transport-controls">
              <button disabled={Boolean(position)} onClick={onBackHour} title="Back one hour" type="button"><SkipBack className="h-4 w-4" /><span>1h</span></button>
              <button onClick={onStep} title="Reveal next candle" type="button"><ChevronRight className="h-4 w-4" /><span>Step</span></button>
              <button className="backtesting-play" onClick={onPlayToggle} type="button">
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                <span>{playing ? "Pause" : "Play"}</span>
              </button>
              <button onClick={onReset} title="Reset replay" type="button"><RotateCcw className="h-4 w-4" /><span>Reset</span></button>
            </div>
            <div className="backtesting-speed-control" aria-label="Replay speed">
              <span>Speed</span>
              <button className="is-active" type="button">1×</button>
              <button disabled title="Faster replay is coming next" type="button">2×</button>
              <button disabled title="Faster replay is coming next" type="button">5×</button>
            </div>
            <div className="backtesting-bar-count"><Activity className="h-4 w-4" /> Bar {visibleCandles.length} / {replayTape.candles.length}</div>
          </footer>
        </section>

        <aside className="backtesting-order-rail" aria-label="Simulated order ticket">
          <header>
            <div>
              <span>Order ticket</span>
              <strong>{replayTape.market}</strong>
            </div>
            <span className="backtesting-sim-badge">SIM</span>
          </header>

          <div className="backtesting-order-tabs" role="tablist" aria-label="Order type">
            <button aria-selected="true" className="is-active" role="tab" type="button">Market</button>
            <button aria-disabled="true" disabled role="tab" title="Limit-order fill logic is not active yet" type="button">Limit <small>Next</small></button>
          </div>

          <div className="backtesting-quote">
            <span>Current price</span>
            <strong>{currentCandle.close.toFixed(2)}</strong>
            <small>{currentCandle.time}</small>
          </div>

          <div className="backtesting-quantity-control">
            <div>
              <span>Quantity</span>
              <small>Contracts</small>
            </div>
            <div>
              <button aria-label="Decrease quantity" disabled={orderQuantity <= 1 || Boolean(position)} onClick={() => onQuantityChange(Math.max(1, orderQuantity - 1))} type="button"><ChevronLeft className="h-4 w-4" /></button>
              <strong>{orderQuantity}</strong>
              <button aria-label="Increase quantity" disabled={orderQuantity >= 20 || Boolean(position)} onClick={() => onQuantityChange(Math.min(20, orderQuantity + 1))} type="button"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="backtesting-risk-capacity">
            <div><span>Risk / trade</span><strong>{account ? formatMoney(account.riskPerTrade) : "—"}</strong></div>
            <div><span>Daily loss remaining</span><strong>{formatMoney(dailyLossRemaining)}</strong></div>
            <div><span>Drawdown remaining</span><strong>{formatMoney(drawdownRemaining)}</strong></div>
          </div>

          <div className="backtesting-side-actions">
            <button className="backtesting-buy" disabled={!canOpen} onClick={onBuy} type="button"><span>Buy / Long</span><small>Market</small></button>
            <button className="backtesting-sell" disabled={!canOpen} onClick={onSell} type="button"><span>Sell / Short</span><small>Market</small></button>
          </div>

          <section className={`backtesting-position-card ${position ? "has-position" : ""}`}>
            <div className="backtesting-position-heading">
              <span>Open position</span>
              <strong>{position ? position.direction.toUpperCase() : "FLAT"}</strong>
            </div>
            {position ? (
              <>
                <div className="backtesting-position-price">
                  <div><span>Entry</span><strong>{position.entryPrice.toFixed(2)}</strong></div>
                  <div><span>Mark</span><strong>{currentCandle.close.toFixed(2)}</strong></div>
                  <div><span>Qty</span><strong>{position.contracts}</strong></div>
                </div>
                <div className="backtesting-position-pnl">
                  <span>Unrealized P&amp;L</span>
                  <strong className={unrealizedPnl >= 0 ? "is-positive" : "is-negative"}>{formatMoney(unrealizedPnl)}</strong>
                </div>
              </>
            ) : <p>No exposure. Choose a side when the setup is valid.</p>}
          </section>

          <button className="backtesting-flatten" disabled={!position} onClick={onClosePosition} type="button"><X className="h-4 w-4" /> Close / Flatten</button>

          <div className="backtesting-discipline-ticket">
            <label>
              <span>Rules followed?</span>
              <select value={rulesFollowed} onChange={(event) => onRulesFollowedChange(event.target.value as "yes" | "no")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label>
              <span>Mistake / leak</span>
              <input value={mistake} onChange={(event) => onMistakeChange(event.target.value)} placeholder="Optional session note" />
            </label>
          </div>

          <div className={`backtesting-risk-status ${limitStatus.canOpenNewPosition ? "is-clear" : "is-blocked"}`}>
            <ShieldCheck className="h-4 w-4" />
            <span>{limitStatus.label}</span>
          </div>
        </aside>
      </div>

      <section className="backtesting-bottom-desk">
        <nav aria-label="Backtesting evidence desk">
          {deskTabs.map((tab) => (
            <button aria-selected={deskTab === tab.id} className={deskTab === tab.id ? "is-active" : ""} key={tab.id} onClick={() => setDeskTab(tab.id)} type="button">{tab.label}</button>
          ))}
        </nav>
        <div className="backtesting-desk-content">
          {deskTab === "positions" && (
            <div className="backtesting-desk-position">
              <Gauge className="h-5 w-5" />
              <div><span>Current exposure</span><strong>{position ? `${position.direction} ${position.contracts} ${replayTape.market} @ ${position.entryPrice.toFixed(2)}` : "Flat · waiting for a valid execution"}</strong></div>
              <div><span>Account balance</span><strong>{formatMoney(accountStats.balance)}</strong></div>
              <div><span>Max drawdown</span><strong>{formatMoney(accountStats.maxDrawdown)}</strong></div>
            </div>
          )}
          {deskTab === "orders" && (
            <div className="backtesting-empty-desk"><BarChart3 className="h-5 w-5" /><div><strong>Market fills execute immediately.</strong><span>Working limit and bracket orders will appear here when their fill engine is active.</span></div></div>
          )}
          {deskTab === "trades" && (
            recentTrades.length ? <div className="backtesting-trade-ledger">{recentTrades.map((trade) => (
              <div key={trade.id}><span>{trade.direction} {trade.market}</span><span>{trade.entryTime.slice(-5)} → {trade.exitTime.slice(-5)}</span><strong className={trade.pnl >= 0 ? "is-positive" : "is-negative"}>{formatMoney(trade.pnl)} · {trade.resultR.toFixed(2)}R</strong></div>
            ))}</div> : <div className="backtesting-empty-desk"><Clock3 className="h-5 w-5" /><div><strong>No executions yet.</strong><span>Your completed simulated trades will build this ledger automatically.</span></div></div>
          )}
          {deskTab === "review" && (
            <div className="backtesting-review-desk">
              <div><span>Practice status</span><strong>{analysis.readiness.label}</strong></div>
              <div><span>Win rate</span><strong>{formatPercent(analysis.winRate)}</strong></div>
              <div><span>Average R</span><strong>{analysis.avgR.toFixed(2)}R</strong></div>
              <div><span>Rules kept</span><strong>{formatPercent(analysis.ruleFollowRate)}</strong></div>
              <p>{analysis.practiceBrief}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function calculateUnrealizedPnl(position: PracticePosition, markPrice: number, market: ReplayTape["market"]) {
  const pointValue = market.includes("NQ") ? 20 : 50;
  const microMultiplier = market.startsWith("M") ? 0.1 : 1;
  const direction = position.direction === "Long" ? 1 : -1;
  return (markPrice - position.entryPrice) * direction * pointValue * microMultiplier * position.contracts;
}
