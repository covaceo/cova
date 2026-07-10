import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "src", "lib", "backtesting.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const outDir = mkdtempSync(join(tmpdir(), "cova-practice-history-"));
const compiledPath = join(outDir, "backtesting.mjs");
writeFileSync(compiledPath, compiled.outputText);
const backtesting = await import(`${pathToFileURL(compiledPath).href}?t=${Date.now()}`);

const demoTape = backtesting.buildReplayTape({ market: "NQ", date: "2025-03-14", setup: "ORH rejection", year: 2025 });
assert.equal(demoTape.dataSource.kind, "demo", "Generated Practice tapes must identify themselves as demo data.");
assert.equal(demoTape.dataSource.provider, "cova-deterministic-demo", "Demo provenance must be explicit and stable.");
assert.equal(demoTape.dataSource.resolutionMinutes, 5, "Demo tape provenance should expose its actual resolution.");

const bars = Array.from({ length: 8 }, (_, index) => {
  const minute = 30 + index * 5;
  const hours = 9 + Math.floor(minute / 60);
  const minutes = minute % 60;
  const open = 20000 + index * 2;
  const close = open + (index % 2 ? -1 : 3);
  return {
    time: `2025-03-14 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    open,
    high: Math.max(open, close) + 2,
    low: Math.min(open, close) - 2,
    close,
    volume: 1000 + index * 100,
  };
});

const historicalTape = backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14",
  market: "NQ",
  setup: "ORH rejection",
  session: "New York AM",
  provider: "licensed-fixture",
  contract: "NQH5",
  resolutionMinutes: 5,
  bars,
});

assert.equal(historicalTape.dataSource.kind, "historical", "Provider tapes must be distinguishable from generated demo data.");
assert.equal(historicalTape.dataSource.provider, "licensed-fixture", "Historical provenance should retain the provider name.");
assert.equal(historicalTape.dataSource.contract, "NQH5", "Historical provenance should retain the actual futures contract.");
assert.equal(historicalTape.levels.overnightResistance, undefined, "Historical replay must not fabricate ONR from opening-range data when overnight data is absent.");
assert.equal(historicalTape.candles.length, bars.length, "Historical conversion must preserve every validated bar.");
assert.deepEqual(historicalTape.candles.map((bar) => bar.index), bars.map((_, index) => index), "Historical bars should receive stable replay indexes.");
assert.ok(historicalTape.candles.every((bar) => Number.isFinite(bar.vwap)), "Every historical replay candle should carry running VWAP without future leakage.");
assert.notEqual(historicalTape.candles[0].vwap, historicalTape.candles.at(-1).vwap, "Running VWAP should evolve as visible volume arrives.");
assert.equal(historicalTape.levels.openingRangeHigh, Math.max(...bars.slice(0, 6).map((bar) => bar.high)), "Five-minute opening range should use the first thirty minutes only.");
assert.equal(historicalTape.levels.openingRangeLow, Math.min(...bars.slice(0, 6).map((bar) => bar.low)), "Opening-range low should come from the same first thirty minutes.");

assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 5,
  bars: [bars[0], { ...bars[1], time: "2025-03-14 09:25" }],
}), /chronological/i, "Historical bars must be strictly chronological.");

assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 5,
  bars: [bars[0], { ...bars[1], time: bars[0].time }],
}), /duplicate|chronological/i, "Duplicate bar timestamps must fail closed.");

assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 5,
  bars: [{ ...bars[0], high: bars[0].low - 1 }],
}), /OHLC/i, "Impossible OHLC bars must be rejected before replay.");

assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 5,
  bars: [{ ...bars[0], time: "2025-03-13 09:30" }],
}), /selected date/i, "A provider response for the wrong session date must fail closed.");

assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-02-31", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 5,
  bars: [{ ...bars[0], time: "2025-02-31 09:30" }],
}), /calendar|timestamp/i, "Impossible calendar dates must not cross the historical boundary.");

assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 5,
  bars: [{ ...bars[0], time: "2025-03-14 99:99" }],
}), /clock|timestamp/i, "Impossible clock times must not cross the historical boundary.");

assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 5,
  bars: [bars[1], bars[2]],
}), /session boundary|09:30/i, "Historical replay must begin at the configured session boundary.");

assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 5,
  bars: [bars[0], bars[2]],
}), /cadence|resolution|gap/i, "Missing bars or mismatched provider cadence must fail closed.");

assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 7,
  bars: [bars[0]],
}), /divide|opening range/i, "Replay resolutions must divide the thirty-minute opening range exactly.");

const fallbackYear = new Date().getFullYear();
const malformedDateBars = bars.map((bar) => ({ ...bar, time: bar.time.replace("2025-03-14", `${fallbackYear}-03-14`) }));
assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "not-a-date", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 5,
  bars: malformedDateBars,
}), /selected date|YYYY-MM-DD|calendar/i, "Malformed selected dates must fail closed instead of normalizing to a fallback date.");

assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", session: "New York Morning", provider: "fixture", resolutionMinutes: 5,
  bars,
}), /unsupported (historical )?session/i, "Unknown historical session labels must fail closed.");

const pmBars = bars.map((bar, index) => ({ ...bar, time: `2025-03-14 13:${String(index * 5).padStart(2, "0")}` }));
const pmTape = backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", session: "New York PM", provider: "fixture", resolutionMinutes: 5,
  bars: pmBars,
});
assert.equal(pmTape.candles[0].time, "2025-03-14 13:00", "The supported PM session should begin at 13:00.");
const amFixtureTape = backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", session: "New York AM", provider: "fixture", resolutionMinutes: 5,
  bars,
});
assert.notEqual(pmTape.id, amFixtureTape.id, "Historical tape identity must include the replay session.");
const demoAmTape = backtesting.buildReplayTape({ date: "2025-03-14", market: "NQ", setup: "ORH rejection", session: "New York AM" });
const demoPmTape = backtesting.buildReplayTape({ date: "2025-03-14", market: "NQ", setup: "ORH rejection", session: "New York PM" });
assert.notEqual(demoAmTape.id, demoPmTape.id, "Demo tape identity must include the replay session.");
const demoPlusSetupTape = backtesting.buildReplayTape({ date: "2025-03-14", market: "NQ", setup: "A+B", session: "New York AM" });
const demoSpaceSetupTape = backtesting.buildReplayTape({ date: "2025-03-14", market: "NQ", setup: "A B", session: "New York AM" });
assert.notEqual(demoPlusSetupTape.id, demoSpaceSetupTape.id, "Tape identity must preserve distinct setup values instead of using a lossy slug.");
const demoBoundaryLeft = backtesting.buildReplayTape({ date: "2025-03-14", market: "NQ", session: "A-5m-B", setup: "C" });
const demoBoundaryRight = backtesting.buildReplayTape({ date: "2025-03-14", market: "NQ", session: "A", setup: "B-5m-C" });
assert.notEqual(demoBoundaryLeft.id, demoBoundaryRight.id, "Demo tape identity must be unambiguous across component boundaries.");

const plusProviderTape = backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", session: "New York AM", provider: "A+B", resolutionMinutes: 5, bars,
});
const spaceProviderTape = backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", session: "New York AM", provider: "A B", resolutionMinutes: 5, bars,
});
assert.notEqual(plusProviderTape.id, spaceProviderTape.id, "Tape identity must preserve distinct provider values instead of using a lossy slug.");

const alternateContractTape = backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", session: "New York AM", provider: "licensed-fixture", contract: "NQM5", resolutionMinutes: 5,
  bars,
});
assert.notEqual(alternateContractTape.id, historicalTape.id, "Historical tape identity must include the futures contract.");
const historicalBoundaryLeft = backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", session: "New York AM", provider: "fixture", contract: "A-B", setup: "C", resolutionMinutes: 5, bars,
});
const historicalBoundaryRight = backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", session: "New York AM", provider: "fixture", contract: "A", setup: "B-C", resolutionMinutes: 5, bars,
});
assert.notEqual(historicalBoundaryLeft.id, historicalBoundaryRight.id, "Historical tape identity must be unambiguous across contract/setup boundaries.");
const literalContinuousTape = backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", session: "New York AM", provider: "fixture", contract: "continuous", resolutionMinutes: 5, bars,
});
assert.notEqual(literalContinuousTape.id, amFixtureTape.id, "An omitted contract must remain distinct from the literal contract named continuous.");

const oneMinuteBars = Array.from({ length: 30 }, (_, index) => {
  const sessionMinute = 9 * 60 + 30 + index;
  return { ...bars[0], time: `2025-03-14 ${String(Math.floor(sessionMinute / 60)).padStart(2, "0")}:${String(sessionMinute % 60).padStart(2, "0")}` };
});
const oneMinuteTape = backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", session: "New York AM", provider: "licensed-fixture", contract: "NQH5", resolutionMinutes: 1,
  bars: oneMinuteBars,
});
assert.notEqual(oneMinuteTape.id, historicalTape.id, "Historical tape identity must include source resolution.");

assert.equal(backtesting.getOpeningRangeEndIndex({ dataSource: { resolutionMinutes: 1 } }), 29, "One-minute replay should complete the opening range at zero-based index 29.");
assert.equal(backtesting.getOpeningRangeEndIndex({ dataSource: { resolutionMinutes: 5 } }), 5, "Five-minute replay should complete the opening range at zero-based index 5.");

const afterHoursBars = Array.from({ length: 79 }, (_, index) => {
  const sessionMinute = 9 * 60 + 30 + index * 5;
  const hour = Math.floor(sessionMinute / 60);
  const minute = sessionMinute % 60;
  return { ...bars[0], time: `2025-03-14 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
});
assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 5,
  bars: afterHoursBars,
}), /session end|16:00/i, "Historical bars must not extend beyond the supported session close.");

assert.throws(() => backtesting.buildReplayTapeFromHistory({
  date: "2025-03-14", market: "NQ", setup: "ORH rejection", provider: "fixture", resolutionMinutes: 5,
  bars: bars.slice(0, 5),
}), /complete 30-minute opening range/i, "Historical replay must not derive ORH/ORL from an incomplete opening range.");

console.log("practice-history-regression: all checks passed");
