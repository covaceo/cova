import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

const architecturePath = join(root, "src", "lib", "practiceTradingView.ts");
const hostPath = join(root, "src", "components", "practice", "LightweightReplayChart.tsx");
const terminalPath = join(root, "src", "components", "practice", "BacktestingTerminal.tsx");
const terminalCssPath = join(root, "src", "styles", "backtestingLab.css");

assert.ok(existsSync(architecturePath), "Cova should keep renderer-independent replay and execution primitives.");
assert.ok(existsSync(hostPath), "Practice should have a Lightweight Charts replay host.");
assert.ok(existsSync(terminalPath), "Practice should have a dedicated chart-first Backtesting terminal.");
assert.ok(existsSync(terminalCssPath), "Backtesting Lab should own a dedicated terminal stylesheet.");

const architecture = read("src", "lib", "practiceTradingView.ts");
const host = read("src", "components", "practice", "LightweightReplayChart.tsx");
const terminal = read("src", "components", "practice", "BacktestingTerminal.tsx");
const terminalCss = read("src", "styles", "backtestingLab.css");
const main = read("src", "main.tsx");
const workspace = read("src", "components", "WorkspaceSections.tsx");
const app = read("src", "App.tsx");
const packageJson = read("package.json");

assert.match(packageJson, /"lightweight-charts"/, "Practice should depend on TradingView's official open-source Lightweight Charts package.");
assert.match(architecture, /createReplayClock/, "Practice should have a replay clock independent of the chart renderer.");
assert.match(architecture, /createPracticeExecutionEngine/, "Practice should have a Cova-owned execution engine.");
assert.match(app, /<PracticeLab[^>]*go=\{go\}/, "The dedicated Backtesting Lab should receive navigation back to the Risk Desk.");
assert.match(app, /\(section !== "practice" \|\| !authSession\)\s*&&\s*\(\s*<Navbar/, "Backtesting Lab should suppress global navigation only after authentication, preserving signed-out escape navigation.");
assert.doesNotMatch(
  app,
  /section === "practice"[\s\S]*?<WorkspaceShell[\s\S]*?<PracticeLab[\s\S]*?<\/WorkspaceShell>/,
  "Backtesting Lab must not render inside the normal Cova workspace shell.",
);
assert.match(workspace, /className="backtesting-lab-shell"/, "Practice should render a dedicated full-screen Backtesting Lab shell.");
assert.match(workspace, /aria-label="Back to Cova risk desk"/, "Backtesting Lab should provide a clear return path to Cova.");
assert.match(terminal, /className="backtesting-terminal"/, "Backtesting Lab should use its own terminal layout.");
assert.match(terminal, /className="backtesting-chart-deck"/, "The replay chart should be the dominant terminal surface.");
assert.match(terminal, /className="backtesting-order-rail"/, "Native execution controls should live in a fixed right rail.");
assert.match(terminal, /Market[\s\S]*Limit/, "The order rail should expose explicit market and limit order modes.");
assert.match(terminal, /Buy \/ Long/, "The order rail should expose a trader-native long action.");
assert.match(terminal, /Sell \/ Short/, "The order rail should expose a trader-native short action.");
assert.match(terminal, /Close \/ Flatten/, "An open practice position should always have a clear flatten action.");
assert.match(terminal, /Daily loss remaining/, "Execution should show Cova risk capacity before the order is placed.");
assert.match(terminal, /Session P&amp;L[\s\S]*?limitStatus\.dailyPnl/, "Session P&L should use the active replay day's P&L, not cumulative account P&L.");
assert.doesNotMatch(terminal, /Session P&amp;L[\s\S]{0,220}?accountStats\.netPnl/, "Session P&L must not be labeled from cumulative account P&L.");
assert.match(terminal, /Positions[\s\S]*Orders[\s\S]*Trades[\s\S]*Session review/, "The terminal should reserve a bottom desk for trading and review evidence.");
assert.match(main, /styles\/backtestingLab\.css/, "The Backtesting Lab stylesheet should load after shared workspace styles.");
assert.match(terminalCss, /\.backtesting-lab-shell[\s\S]*min-height:\s*100dvh/, "Backtesting Lab should own the full viewport.");
assert.match(terminalCss, /\.backtesting-workbench[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(300px,\s*340px\)/, "Desktop layout should reserve a compact fixed execution rail and give the chart the remaining width.");
assert.match(terminalCss, /@media\s*\(max-width:\s*900px\)/, "The terminal should deliberately collapse for tablet and mobile.");
assert.doesNotMatch(host, /const CHART_HEIGHT = 420/, "The dominant replay chart must not retain the old fixed card height.");
assert.match(host, /contentRect\.height/, "The chart should resize from its actual terminal viewport height.");

assert.match(host, /from\s+["']lightweight-charts["']/, "Replay host should import the official Lightweight Charts package.");
assert.match(host, /createChart\(/, "Replay host should create a Lightweight Charts instance.");
assert.match(host, /CandlestickSeries/, "Replay host should render visible OHLC bars as a candlestick series.");
assert.match(host, /LineSeries/, "Replay host should render running VWAP as a time series.");
assert.match(host, /vwapSeries\.setData/, "Replay host should update VWAP only from already-visible candles.");
assert.match(host, /createSeriesMarkers/, "Replay host should render Cova execution marks through the supported marker primitive.");
assert.match(host, /attributionLogo:\s*true/, "Replay chart should satisfy Lightweight Charts attribution requirements.");
assert.match(host, /ResizeObserver/, "Replay chart should resize with its container.");
assert.match(host, /visibleCandles/, "Replay host should accept only the already-revealed replay bars.");
assert.match(host, /const openingRangeBarCount = 30 \/ tape\.dataSource\.resolutionMinutes/, "Opening-range visibility must use the tape's actual resolution.");
assert.match(host, /visibleCandles\.length >= openingRangeBarCount/, "ORH and ORL must stay hidden until the complete opening range is visible.");
assert.match(host, /\.slice\(0, 24\)/, "Execution marks should retain the newest trades from newest-first storage.");
assert.doesNotMatch(host, /\.slice\(-24\)/, "Execution marks must not discard the newest trades.");
assert.match(host, /let chart: IChartApi \| null = null/, "Chart initialization should keep a local cleanup handle.");
assert.match(host, /catch\s*\{[\s\S]*?resizeObserver\?\.disconnect\(\)[\s\S]*?markers\?\.detach\(\)[\s\S]*?chart\?\.remove\(\)/, "Partial chart initialization failures must clean up every created resource.");
assert.match(host, /chart\.remove\(\)/, "Replay host should dispose the chart on unmount.");
assert.doesNotMatch(host, /window\.TradingView|charting_library\.js|new window\.TradingView\.widget/, "Practice must not depend on proprietary Advanced Charts assets.");
assert.match(workspace, /LightweightReplayChart/, "Practice route should render through the Lightweight Charts host.");
assert.match(workspace, /setPracticeReps\(practiceReps\.filter\(\(rep\) => !simulatedIds\.has\(rep\.id\)\)\)/, "Resetting Practice should remove cleared simulator trades from readiness history too.");
assert.match(workspace, /getOpeningRangeEndIndex\(replayTape\)/, "Practice replay should derive its zero-based opening-range boundary from the tape.");
assert.match(workspace, /<LightweightReplayChart key=\{replayTape\.id\}/, "The imperative chart subtree must remount synchronously when tape identity changes.");
assert.match(workspace, /replayRuntime\.tapeId === replayTape\.id/, "Replay state must be keyed to the active tape before render, not repaired only by a passive effect.");
assert.doesNotMatch(workspace, /useState\(32\)|setPlayIndex\(32\)/, "Practice initial load and resets must not hard-code a five-minute replay index.");
assert.match(workspace, /const openingRangeComplete = visibleCandles\.length >= openingRangeBarCount/, "Replay header levels must stay hidden until the opening range is complete.");
assert.match(terminal, /openingRangeComplete\s*\?/, "The replay header must conditionally render ORH and ORL.");
assert.match(workspace, /stepReplay\(-\(60 \/ replayTape\.dataSource\.resolutionMinutes\)\)/, "Back 1h should follow the tape's actual resolution.");
assert.match(terminal, /disabled=\{Boolean\(position\)\} onClick=\{onBackHour\}/, "The Back control should be disabled while a simulated position is open.");
assert.match(workspace, /if \(!value\.trim\(\)\) return fallback/, "Empty Practice setup numbers should use safe defaults instead of coercing to zero.");
assert.match(workspace, /min="50" required step="50" value=\{accountDraft\.riskPerTrade\}/, "Default Practice risk must satisfy the browser's numeric-step constraint.");
assert.match(workspace, /min="50" required step="50" value=\{accountDraft\.maxDailyLoss\}/, "Default daily loss must satisfy the browser's numeric-step constraint.");
assert.match(workspace, /min="50" required step="50" value=\{accountDraft\.maxDrawdown\}/, "Default drawdown must satisfy the browser's numeric-step constraint.");
assert.match(workspace, /analyzePracticeReps\(simTrades\)/, "Fresh Practice readiness must use only this account's simulated trades, not generic starter reps.");
assert.match(workspace, /hasPracticeAccountConfigurationChanged\(account, nextAccount\)/, "Changing account-defining fields must isolate old simulator history.");
assert.match(workspace, /evaluatePracticeAccountLimits\(activeAccount, simTrades, replayTape\.date\)/, "Practice must evaluate configured daily loss and drawdown limits.");
assert.match(workspace, /!limitStatus\.canOpenNewPosition/, "Practice execution controls must block new positions after a configured limit is reached.");
assert.match(host, /trade\.setup === tape\.setup/, "Execution markers must stay on the matching replay setup.");
assert.match(host, /trade\.tapeId\s*\?\s*trade\.tapeId === tape\.id/, "New execution markers must be scoped to the exact tape identity.");
assert.match(host, /trade\.session === tape\.session/, "Legacy execution markers must not cross AM and PM sessions.");
assert.match(host, /tape\.dataSource\.kind === "demo"/, "Legacy marker fallback must be restricted to deterministic demo tapes.");
assert.match(app, /localStorage\.removeItem\(PRACTICE_ACCOUNT_STORAGE_KEY\)/, "Sign-out must clear the prior user's practice account from a shared browser.");
assert.match(app, /localStorage\.removeItem\(PRACTICE_TRADES_STORAGE_KEY\)/, "Sign-out must clear the prior user's simulated trade notes from a shared browser.");

console.log("practice-architecture-regression: all checks passed");
