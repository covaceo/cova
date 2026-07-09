import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(root, "src", "lib", "backtesting.ts");
const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const outDir = mkdtempSync(join(tmpdir(), "cova-backtest-"));
const compiledPath = join(outDir, "backtesting.mjs");
writeFileSync(compiledPath, compiled.outputText);

const backtesting = await import(`${pathToFileURL(compiledPath).href}?t=${Date.now()}`);
const {
  analyzePracticeReps,
  buildReplayTape,
  calculatePracticeAccountStats,
  createDefaultPracticeAccount,
  createPracticeTrade,
  evaluatePracticeAccountLimits,
  hasPracticeAccountConfigurationChanged,
  samplePracticeReps,
} = backtesting;

assert.ok(Array.isArray(samplePracticeReps), "Backtesting module should ship starter practice reps.");
assert.ok(samplePracticeReps.length >= 5, "Starter practice sample should be large enough to show the lab.");

const summary = analyzePracticeReps([
  { id: "r1", date: "2026-07-01", market: "NQ", setup: "ORH rejection", session: "New York AM", direction: "Short", plannedEntry: 20000, stop: 20035, target: 19920, resultR: 1.8, rulesFollowed: true, mistake: "", screenshotUrl: "", notes: "Waited for failed acceptance." },
  { id: "r2", date: "2026-07-02", market: "NQ", setup: "ORH rejection", session: "New York AM", direction: "Short", plannedEntry: 20120, stop: 20145, target: 20060, resultR: -1, rulesFollowed: false, mistake: "Entered before rejection confirmed", screenshotUrl: "", notes: "Early entry." },
  { id: "r3", date: "2026-07-03", market: "NQ", setup: "ORH rejection", session: "New York AM", direction: "Short", plannedEntry: 20200, stop: 20228, target: 20130, resultR: 1.2, rulesFollowed: true, mistake: "", screenshotUrl: "", notes: "Clean replay." },
  { id: "r4", date: "2026-07-04", market: "NQ", setup: "VWAP reclaim", session: "New York AM", direction: "Long", plannedEntry: 19980, stop: 19955, target: 20040, resultR: 0.4, rulesFollowed: true, mistake: "", screenshotUrl: "", notes: "Smaller sample." },
]);

assert.equal(summary.totalReps, 4, "Practice summary should count reps.");
assert.equal(summary.bestSetup?.setup, "ORH rejection", "Best setup should be selected by sample-adjusted expectancy.");
assert.equal(summary.bySetup[0].setup, "ORH rejection", "Setup rows should be sorted with the strongest practiced setup first.");
assert.equal(summary.bySetup[0].sampleSize, 3, "Setup row should count practice reps.");
assert.equal(summary.bySetup[0].ruleFollowRate, 2 / 3, "Rule-follow rate should track disciplined practice, not only wins.");
assert.equal(summary.bySetup[0].leak, "Entered before rejection confirmed", "Most common mistake should be surfaced as the setup leak.");
assert.match(summary.readiness.label, /Practice only|Live-size ready|Building/i, "Readiness label should explain whether the setup can graduate.");
assert.ok(summary.practiceBrief.includes("ORH rejection"), "Practice brief should tell the trader which setup to drill next.");

const account = createDefaultPracticeAccount({
  accountSize: 50000,
  riskPerTrade: 500,
  maxDailyLoss: 1500,
  maxDrawdown: 2500,
  market: "NQ",
  contracts: 1,
});
assert.equal(account.accountSize, 50000, "Practice account should store selected starting size.");
assert.equal(account.balance, 50000, "New practice account should start at selected balance.");
assert.equal(account.riskPerTrade, 500, "Practice account should keep risk-per-trade budget.");

const clampedAccount = createDefaultPracticeAccount({ accountSize: 0, riskPerTrade: 0, maxDailyLoss: 0, maxDrawdown: 0, contracts: 0 });
assert.equal(clampedAccount.accountSize, 1000, "Practice account size must remain positive and usable.");
assert.equal(clampedAccount.riskPerTrade, 1, "Practice R math must reject a zero-dollar risk denominator.");
assert.equal(clampedAccount.maxDailyLoss, 1, "Daily-loss guard must remain enforceable.");
assert.equal(clampedAccount.maxDrawdown, 1, "Drawdown guard must remain enforceable.");

const tape = buildReplayTape({ market: "NQ", date: "2025-03-14", setup: "ORH rejection", year: 2025 });
assert.equal(tape.market, "NQ", "Replay tape should preserve selected market.");
assert.equal(tape.date, "2025-03-14", "Replay tape should preserve selected date.");
assert.equal(tape.year, 2025, "Replay tape should preserve selected year.");
assert.equal(tape.candles.length, 78, "New York AM replay must stay inside the 09:30–16:00 session.");
assert.match(tape.candles.at(-1).time, /15:55$/, "The final five-minute AM candle should start at 15:55.");
assert.ok(tape.levels.openingRangeHigh > tape.levels.openingRangeLow, "Replay tape should expose OR levels for the chart overlay.");
assert.ok(tape.candles.every((candle) => candle.high >= Math.max(candle.open, candle.close) && candle.low <= Math.min(candle.open, candle.close)), "Generated candles must be valid OHLC bars.");
assert.deepEqual(
  buildReplayTape({ market: "NQ", date: "2025-03-14", setup: "ORH rejection", year: 2025 }).candles.slice(0, 8),
  tape.candles.slice(0, 8),
  "Replay tape should be deterministic for a selected date so practice can be reviewed."
);

const longWin = createPracticeTrade({
  account,
  tape,
  direction: "Long",
  entryIndex: 20,
  entryPrice: 20000,
  exitIndex: 30,
  exitPrice: 20025,
  contracts: 1,
  rulesFollowed: true,
});
assert.equal(longWin.pnl, 500, "NQ one-contract 25-point long should make $500.");
assert.equal(longWin.resultR, 1, "A $500 win with $500 risk should equal 1R.");
assert.equal(longWin.entryTime, tape.candles[20].time, "Trade should record chart entry time.");
assert.equal(longWin.exitTime, tape.candles[30].time, "Trade should record chart exit time.");
assert.throws(() => createPracticeTrade({
  account,
  tape,
  direction: "Long",
  entryIndex: 30,
  entryPrice: 20025,
  exitIndex: 20,
  exitPrice: 20000,
}), /exit cannot precede entry/i, "Practice engine must reject time-travel closes.");

const shortLoss = createPracticeTrade({
  account,
  tape,
  direction: "Short",
  entryIndex: 35,
  entryPrice: 20010,
  exitIndex: 42,
  exitPrice: 20030,
  contracts: 1,
  rulesFollowed: false,
  mistake: "Held past invalidation",
});
assert.equal(shortLoss.pnl, -400, "NQ one-contract 20-point short loss should lose $400.");
assert.equal(shortLoss.resultR, -0.8, "Loss should convert into R using account risk-per-trade budget.");

const stats = calculatePracticeAccountStats(account, [longWin, shortLoss]);
assert.equal(stats.tradeCount, 2, "Practice account should track closed sim trades.");
assert.equal(stats.balance, 50100, "Practice account balance should update from simulated trades.");
assert.equal(stats.netPnl, 100, "Practice account should calculate net P&L.");
assert.equal(stats.winRate, 0.5, "Practice account should calculate win rate.");
assert.equal(stats.ruleFollowRate, 0.5, "Practice account should calculate rule-follow rate from sim trades.");
assert.equal(stats.maxDrawdown, 400, "Practice account should calculate drawdown from equity curve.");
assert.equal(calculatePracticeAccountStats(account, [longWin]).worstTrade, 500, "An all-winning sample must report its smallest real win as the worst trade.");
assert.equal(calculatePracticeAccountStats(account, [shortLoss]).bestTrade, -400, "An all-losing sample must report its least-bad real loss as the best trade.");

const breachedAccount = createDefaultPracticeAccount({ ...account, maxDailyLoss: 300, maxDrawdown: 350 });
const limitStatus = evaluatePracticeAccountLimits(breachedAccount, [shortLoss], tape.date);
assert.equal(limitStatus.dailyLossBreached, true, "Configured daily loss must be evaluated against closed practice trades.");
assert.equal(limitStatus.drawdownBreached, true, "Configured max drawdown must be evaluated against practice equity.");
assert.equal(limitStatus.canOpenNewPosition, false, "A breached practice account must block new simulator positions.");

const sameConfig = createDefaultPracticeAccount({ ...account });
assert.equal(hasPracticeAccountConfigurationChanged(account, sameConfig), false, "Generated account IDs must not make an unchanged setup look new.");
const changedConfig = createDefaultPracticeAccount({ ...account, market: "MNQ" });
assert.equal(hasPracticeAccountConfigurationChanged(account, changedConfig), true, "Changing account market must require isolated simulator history.");

console.log("backtest-regression: all checks passed");
