import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const riskSourcePath = join(root, "src", "lib", "risk.ts");
const source = readFileSync(riskSourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const outDir = mkdtempSync(join(tmpdir(), "cova-risk-"));
const compiledPath = join(outDir, "risk.mjs");
writeFileSync(compiledPath, compiled.outputText);

const risk = await import(`${pathToFileURL(compiledPath).href}?t=${Date.now()}`);
const { analyze, defaultRules, parseCsvDetailed } = risk;

function makeTrade(overrides = {}) {
  return {
    id: overrides.id ?? `t-${Math.random().toString(16).slice(2)}`,
    date: overrides.date ?? "2026-05-01",
    market: overrides.market ?? "NQ",
    side: overrides.side ?? "Long",
    contracts: overrides.contracts ?? 1,
    entry: overrides.entry ?? 19000,
    exit: overrides.exit ?? 19010,
    pnl: overrides.pnl ?? 300,
    risk: overrides.risk ?? 250,
    setup: overrides.setup ?? "Opening range",
    notes: overrides.notes ?? "Regression trade",
  };
}

function assertIncludes(value, expected, message) {
  assert.match(String(value), expected, message);
}

const noHistory = analyze([], defaultRules);
assert.equal(noHistory.score, 0, "No trade history should not create a real risk score.");
assert.equal(noHistory.evidenceQuality.label, "No sample", "No-history evidence quality should be explicit.");
assert.equal(noHistory.scoreFactors[0].label, "No trade history", "No-history score factor should explain the missing sample.");
assert.equal(noHistory.nextSessionBrief.status, "caution", "No-history brief should ask for trades before advice.");

const intradayBreachRules = defaultRules.filter((rule) => rule.metric === "maxDailyLoss");
const intradayBreach = analyze([
  makeTrade({ id: "d1", date: "2026-05-02", pnl: -1800, risk: 600 }),
  makeTrade({ id: "d2", date: "2026-05-02", pnl: -1200, risk: 600 }),
  makeTrade({ id: "d3", date: "2026-05-02", pnl: 1000, risk: 500 }),
], intradayBreachRules);
const dailyLossBreach = intradayBreach.breaches.find((status) => status.rule.metric === "maxDailyLoss");
assert.ok(dailyLossBreach, "Daily loss rule should catch intraday lows even if the day closes above the limit.");
assertIncludes(dailyLossBreach.evidence.join(" "), /intraday low -\$3,000/, "Daily loss evidence should show the intraday low.");
assertIncludes(dailyLossBreach.evidence.join(" "), /closed -\$2,000/, "Daily loss evidence should preserve the closing P&L.");

const parsed = parseCsvDetailed(`Date,Symbol,Qty,Entry,Exit,P&L,Risk,Side
05/06/26,NQ,2,19000,18990,"($520.50)",250,Long
2026-05-07,ES,1,5300,5298,120-,200,Short
2026-05-08,GC,1,2400,2405,$450,225,Buy`);
assert.equal(parsed.issues.length, 0, `CSV parser should accept common broker number formats: ${JSON.stringify(parsed.issues)}`);
assert.equal(parsed.trades.length, 3, "CSV parser should keep all valid rows.");
assert.equal(parsed.trades[0].pnl, -520.5, "Parser should treat parenthesized P&L as negative.");
assert.equal(parsed.trades[1].pnl, -120, "Parser should treat trailing-minus P&L as negative.");
assert.equal(parsed.trades[2].side, "Long", "Parser should default buy rows to long.");

const propStyleParsed = parseCsvDetailed(`Execution Time;Instrument Name;Filled Qty;Avg Entry;Avg Exit;Net Profit/Loss;Trade Action;Strategy
2026-05-09 09:45:11;NQ;3;18990.25;19020.50;$1,210.00;BOT;Opening drive
2026-05-09 10:12:44;NQ;2;19012.00;18986.00;($1,040.00);SLD;Failed breakout`);
assert.equal(propStyleParsed.issues.length, 0, `CSV parser should accept semicolon prop export aliases: ${JSON.stringify(propStyleParsed.issues)}`);
assert.equal(propStyleParsed.trades.length, 2, "Parser should keep prop-style rows.");
assert.equal(propStyleParsed.trades[0].market, "NQ", "Parser should map Instrument Name to market.");
assert.equal(propStyleParsed.trades[0].contracts, 3, "Parser should map Filled Qty to contracts.");
assert.equal(propStyleParsed.trades[1].pnl, -1040, "Parser should map Net Profit/Loss to P&L.");
assert.equal(propStyleParsed.trades[1].side, "Short", "Parser should map SLD rows to short.");

const cleanTrades = Array.from({ length: 30 }, (_, index) => {
  const isLoss = index % 5 === 4;
  return makeTrade({
    id: `clean-${index}`,
    date: `2026-05-${String(1 + Math.floor(index / 3)).padStart(2, "0")}`,
    market: index % 2 ? "ES" : "NQ",
    contracts: index % 3 === 0 ? 2 : 1,
    pnl: isLoss ? -180 : 420,
    risk: 250,
    setup: index % 2 ? "VWAP rejection" : "Opening range",
  });
});
const cleanAnalysis = analyze(cleanTrades, defaultRules);
assert.equal(cleanAnalysis.evidenceQuality.label, "Good sample", "30 clean trades should be treated as a good sample.");
assert.ok(cleanAnalysis.score >= 80, `Clean rule-following sample should score strongly, got ${cleanAnalysis.score}.`);
assert.equal(cleanAnalysis.breaches.filter((status) => status.rule.severity === "critical").length, 0, "Clean sample should not have critical breaches.");
assert.ok(cleanAnalysis.scoreFactors.some((factor) => factor.label === "Rule discipline"), "Score factors should explain rule discipline.");

const recentCritical = analyze([
  ...cleanTrades.slice(0, 18),
  makeTrade({ id: "recent-critical", date: "2026-06-15", pnl: -2700, risk: 600, setup: "Revenge trade" }),
], defaultRules);
assert.equal(recentCritical.nextSessionBrief.status, "locked", "A recent critical breach should lock the next-session brief.");
assert.ok(recentCritical.scoreFactors.some((factor) => factor.label === "Limit severity" && factor.impact === "negative"), "Score factors should explain critical/warning limit severity.");

const oldCriticalWithRecovery = analyze([
  makeTrade({ id: "old-critical", date: "2026-05-01", pnl: -1700, risk: 500, setup: "Opening range" }),
  ...Array.from({ length: 14 }, (_, index) => makeTrade({
    id: `recovery-${index}`,
    date: `2026-05-${String(2 + index).padStart(2, "0")}`,
    pnl: 360,
    risk: 300,
    setup: index % 2 ? "VWAP rejection" : "Level reclaim",
  })),
], defaultRules);
assert.notEqual(oldCriticalWithRecovery.nextSessionBrief.status, "locked", "Older critical breaches should stay visible without permanently locking a recovered account.");

const missingRiskAnalysis = analyze([
  makeTrade({ id: "mr1", pnl: 300, risk: 0 }),
  makeTrade({ id: "mr2", pnl: -120, risk: Number.NaN }),
  makeTrade({ id: "mr3", pnl: 260, risk: 200 }),
], defaultRules);
assert.ok(missingRiskAnalysis.evidenceQuality.caveats.some((caveat) => /inferred risk/i.test(caveat)), "Evidence quality should warn when Cova has to infer missing risk values.");

const smallLuckySample = analyze(Array.from({ length: 4 }, (_, index) => makeTrade({
  id: `small-lucky-${index}`,
  date: `2026-05-0${index + 1}`,
  pnl: 650,
  risk: 250,
})), defaultRules);
assert.equal(smallLuckySample.evidenceQuality.label, "Small sample", "Four trades should still be called a small sample.");
assert.ok(smallLuckySample.score <= 72, `Small samples should not receive overconfident scores, got ${smallLuckySample.score}.`);

const oversized = analyze([
  makeTrade({ id: "s1", contracts: 1, pnl: 200 }),
  makeTrade({ id: "s2", contracts: 6, pnl: -300 }),
], defaultRules);
assert.ok(oversized.breaches.some((status) => status.rule.metric === "maxContracts"), "Position-size breaches should be visible.");
assert.ok(oversized.behaviorFlags.some((flag) => /size/i.test(flag.label)), "Behavior flags should translate size breaches into customer-facing language.");

const behaviorPatternAnalysis = analyze([
  makeTrade({ id: "bp1", date: "2026-05-03", contracts: 1, pnl: -250, risk: 250 }),
  makeTrade({ id: "bp2", date: "2026-05-03", contracts: 3, pnl: -900, risk: 300 }),
  makeTrade({ id: "bp3", date: "2026-05-04", contracts: 1, pnl: 300, risk: 250 }),
], defaultRules);
assert.ok(behaviorPatternAnalysis.behaviorFlags.some((flag) => flag.id === "size-up-after-loss"), "Behavior flags should catch sizing up immediately after a loss.");
assert.ok(behaviorPatternAnalysis.behaviorFlags.some((flag) => flag.id === "r-outlier-loss"), "Behavior flags should catch losses that are large in R terms.");

const improvingTrades = Array.from({ length: 24 }, (_, index) => makeTrade({
  id: `improve-${index}`,
  date: `2026-06-${String(1 + index).padStart(2, "0")}`,
  market: index % 2 ? "ES" : "NQ",
  pnl: index < 12 ? -120 : 360,
  risk: 300,
  setup: index % 2 ? "VWAP rejection" : "Opening range",
}));
const improvingAnalysis = analyze(improvingTrades, defaultRules);
assert.ok(improvingAnalysis.avgRTrend > 0.5, "Analysis should measure recent R improvement across the sample.");
assert.ok(improvingAnalysis.scoreFactors.some((factor) => factor.label === "Recent improvement" && factor.impact === "positive"), "Score factors should explain when recent behavior improves.");

const concentratedTrades = Array.from({ length: 20 }, (_, index) => makeTrade({
  id: `concentrated-${index}`,
  date: `2026-07-${String(1 + index).padStart(2, "0")}`,
  market: index % 3 === 0 ? "ES" : "NQ",
  pnl: index < 12 ? -180 : 240,
  risk: 300,
  setup: index < 12 ? "Breakout continuation" : "VWAP rejection",
}));
const concentratedAnalysis = analyze(concentratedTrades, defaultRules);
assert.ok(concentratedAnalysis.setupConcentration?.name === "Breakout continuation", "Analysis should identify the dominant setup.");
assert.ok(concentratedAnalysis.behaviorFlags.some((flag) => flag.id === "setup-concentration"), "Behavior flags should explain concentrated setup risk.");

const overtradingAnalysis = analyze(Array.from({ length: 9 }, (_, index) => makeTrade({
  id: `overtrade-${index}`,
  date: "2026-08-01",
  market: "NQ",
  pnl: index % 3 === 0 ? 90 : -180,
  risk: 300,
  setup: index % 2 ? "Chop reclaim" : "Opening range",
})), defaultRules);
assert.ok(overtradingAnalysis.behaviorFlags.some((flag) => flag.id === "overtrading-session"), "Behavior flags should call out high-count red sessions.");

console.log("risk-regression: all checks passed");
