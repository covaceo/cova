import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = mkdtempSync(join(tmpdir(), "cova-practice-datafeed-"));

function compile(sourceRelativePath, outputName, replacements = []) {
  const source = readFileSync(join(root, sourceRelativePath), "utf8");
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [from, to] of replacements) output = output.replaceAll(from, to);
  const outputPath = join(outDir, outputName);
  writeFileSync(outputPath, output);
  return outputPath;
}

const backtestingPath = compile("src/lib/backtesting.ts", "backtesting.mjs");
const architecturePath = compile(
  "src/lib/practiceTradingView.ts",
  "practiceTradingView.mjs",
  [["./backtesting", "./backtesting.mjs"]],
);
const backtesting = await import(`${pathToFileURL(backtestingPath).href}?t=${Date.now()}`);
const architecture = await import(`${pathToFileURL(architecturePath).href}?t=${Date.now()}`);

const tape = backtesting.buildReplayTape({ market: "NQ", date: "2025-03-14", setup: "ORH rejection", year: 2025 });
let currentIndex = 20;
const matchingTrade = backtesting.createPracticeTrade({
  account: backtesting.createDefaultPracticeAccount({ riskPerTrade: 500 }),
  tape,
  direction: "Long",
  entryIndex: 10,
  entryPrice: tape.candles[10].close,
  exitIndex: 15,
  exitPrice: tape.candles[15].close,
});
const otherSetupTape = backtesting.buildReplayTape({ market: "NQ", date: "2025-03-14", setup: "VWAP reclaim", year: 2025 });
const otherSetupTrade = backtesting.createPracticeTrade({
  account: backtesting.createDefaultPracticeAccount({ riskPerTrade: 500 }),
  tape: otherSetupTape,
  direction: "Short",
  entryIndex: 10,
  entryPrice: otherSetupTape.candles[10].close,
  exitIndex: 15,
  exitPrice: otherSetupTape.candles[15].close,
});
const datafeed = architecture.createCovaReplayDatafeed({
  tape,
  getCurrentIndex: () => currentIndex,
  getTrades: () => [matchingTrade, otherSetupTrade],
});

const configuration = await new Promise((resolve) => datafeed.onReady(resolve));
assert.deepEqual(configuration.supported_resolutions, ["5"], "Replay datafeed must advertise only the five-minute bars it actually serves.");

const bars = await new Promise((resolve, reject) => {
  datafeed.getBars({}, "5", { from: 0, to: 4102444800, firstDataRequest: true, countBack: 500 }, resolve, reject);
});
assert.equal(bars.length, currentIndex + 1, "Replay history must stop at the current replay index instead of leaking future candles.");
assert.equal(bars.at(-1).time, Date.parse(`${tape.candles[currentIndex].time.replace(" ", "T")}:00Z`), "The newest hosted bar must equal the visible replay candle.");

const marks = await new Promise((resolve) => datafeed.getMarks({}, 0, 4102444800, resolve));
assert.deepEqual(marks.map((mark) => mark.id), [matchingTrade.id], "Execution marks must be scoped to the active tape setup.");
const timescaleMarks = await new Promise((resolve) => datafeed.getTimescaleMarks({}, 0, 4102444800, resolve));
assert.deepEqual(timescaleMarks.map((mark) => mark.id), ["ORH"], "Future timescale annotations must stay hidden until their replay candle is visible.");

const realtimeIndexes = [];
let resetCount = 0;
datafeed.subscribeBars({}, "5", (bar) => realtimeIndexes.push(bar.time), "regression", () => { resetCount += 1; });
await new Promise((resolve) => setTimeout(resolve, 300));
currentIndex = 32;
await new Promise((resolve) => setTimeout(resolve, 300));
const callbackCountBeforeRewind = realtimeIndexes.length;
currentIndex = 20;
await new Promise((resolve) => setTimeout(resolve, 300));
assert.equal(resetCount, 1, "Rewinding must reset TradingView cache instead of emitting an older realtime bar.");
assert.equal(realtimeIndexes.length, callbackCountBeforeRewind, "Rewinding must not emit a time-regressing realtime candle.");
datafeed.unsubscribeBars("regression");
datafeed.destroy();

console.log("practice-datafeed-regression: all checks passed");
