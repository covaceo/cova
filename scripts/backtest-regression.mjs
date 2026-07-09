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
const { analyzePracticeReps, samplePracticeReps } = backtesting;

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

console.log("backtest-regression: all checks passed");
