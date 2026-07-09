import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

const architecturePath = join(root, "src", "lib", "practiceTradingView.ts");
const hostPath = join(root, "src", "components", "practice", "TradingViewChartHost.tsx");
const cssPath = join(root, "public", "trading_view", "cova-practice.css");
const placeholderPath = join(root, "public", "trading_platform", "README.md");

assert.ok(existsSync(architecturePath), "Cova should have a TradingView-practice architecture module.");
assert.ok(existsSync(hostPath), "Practice should have a TradingView chart host component.");
assert.ok(existsSync(cssPath), "Practice should ship a TradingView custom CSS slot.");
assert.ok(existsSync(placeholderPath), "Practice should reserve /trading_platform/ for licensed TradingView assets.");

const architecture = read("src", "lib", "practiceTradingView.ts");
const host = read("src", "components", "practice", "TradingViewChartHost.tsx");
const workspace = read("src", "components", "WorkspaceSections.tsx");
const app = read("src", "App.tsx");

assert.match(architecture, /TRADINGVIEW_LIBRARY_PATH\s*=\s*"\/trading_platform\/"/, "TradingView assets should be self-hosted under /trading_platform/ like TradeZella.");
assert.match(architecture, /TRADINGVIEW_CUSTOM_CSS_PATH\s*=\s*"\/trading_view\/cova-practice\.css"/, "TradingView custom CSS should be app-hosted.");
assert.match(architecture, /createCovaReplayDatafeed/, "Cova should expose a custom replay datafeed factory.");
assert.match(architecture, /getBars/, "Datafeed should implement TradingView getBars.");
assert.match(architecture, /subscribeBars/, "Datafeed should implement TradingView subscribeBars.");
assert.match(architecture, /resolveSymbol/, "Datafeed should implement TradingView resolveSymbol.");
assert.match(architecture, /getServerTime/, "Datafeed should expose server/replay time.");
assert.match(architecture, /getMarks/, "Datafeed should support execution marks.");
assert.match(architecture, /getTimescaleMarks/, "Datafeed should support timescale marks.");
assert.match(architecture, /createReplayClock/, "Practice should have a replay clock independent of the chart renderer.");
assert.match(architecture, /createPracticeExecutionEngine/, "Practice should have a Cova-owned execution engine.");
assert.match(architecture, /createChartLayoutAdapter/, "Practice should have chart layout persistence adapter seam.");
assert.match(architecture, /createSettingsAdapter/, "Practice should have chart settings adapter seam.");

assert.match(host, /new window\.TradingView\.widget/, "Chart host should instantiate the official TradingView widget when assets are available.");
assert.match(host, /library_path:\s*TRADINGVIEW_LIBRARY_PATH/, "Chart host should point the widget at self-hosted TradingView assets.");
assert.match(host, /custom_css_url:\s*TRADINGVIEW_CUSTOM_CSS_PATH/, "Chart host should apply Cova TradingView CSS.");
assert.match(host, /datafeed(?:\s*:|,)/, "Chart host should pass Cova's datafeed into TradingView.");
assert.match(host, /fallback/, "Chart host should degrade gracefully while licensed TradingView assets are absent.");
assert.match(workspace, /TradingViewChartHost/, "Practice route should render through the TradingView architecture host, not only the local SVG replay chart.");
assert.match(workspace, /setPracticeReps\(practiceReps\.filter\(\(rep\) => !simulatedIds\.has\(rep\.id\)\)\)/, "Resetting Practice should remove cleared simulator trades from readiness history too.");
assert.match(workspace, /const earliestIndex = position \? position\.entryIndex : 6/, "Practice should not replay backward past an open position's entry.");
assert.match(workspace, /disabled=\{Boolean\(position\)\} type="button" onClick=\{\(\) => stepReplay\(-12\)\}/, "The Back control should be disabled while a simulated position is open.");
assert.match(workspace, /if \(!value\.trim\(\)\) return fallback/, "Empty Practice setup numbers should use safe defaults instead of coercing to zero.");
assert.match(workspace, /analyzePracticeReps\(simTrades\)/, "Fresh Practice readiness must use only this account's simulated trades, not generic starter reps.");
assert.match(workspace, /hasPracticeAccountConfigurationChanged\(account, nextAccount\)/, "Changing account-defining fields must isolate old simulator history.");
assert.match(workspace, /evaluatePracticeAccountLimits\(activeAccount, simTrades, replayTape\.date\)/, "Practice must evaluate configured daily loss and drawdown limits.");
assert.match(workspace, /!limitStatus\.canOpenNewPosition/, "Practice execution controls must block new positions after a configured limit is reached.");
assert.match(workspace, /trade\.setup === tape\.setup/, "Fallback execution markers must stay on the matching replay setup.");
assert.match(app, /localStorage\.removeItem\(PRACTICE_ACCOUNT_STORAGE_KEY\)/, "Sign-out must clear the prior user's practice account from a shared browser.");
assert.match(app, /localStorage\.removeItem\(PRACTICE_TRADES_STORAGE_KEY\)/, "Sign-out must clear the prior user's simulated trade notes from a shared browser.");
assert.match(host, /datafeed\.destroy\(\)/, "TradingView host must dispose outstanding datafeed subscriptions.");
assert.match(host, /onChartReady/, "Hosted chart must not replace the working fallback before TradingView reports readiness.");
assert.match(host, /catch/, "TradingView construction failures must keep the fallback available.");

console.log("practice-architecture-regression: all checks passed");
