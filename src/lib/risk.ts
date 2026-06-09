export type Trade = {
  id: string;
  date: string;
  market: string;
  side: "Long" | "Short";
  contracts: number;
  entry: number;
  exit: number;
  pnl: number;
  risk: number;
  setup: string;
  notes: string;
};

export type RiskRule = {
  id: string;
  name: string;
  metric: "maxDailyLoss" | "maxTradeLoss" | "maxContracts" | "maxLossStreak" | "minProfitFactor" | "minAvgR";
  limit: number;
  severity: "critical" | "warning" | "info";
  enabled: boolean;
};

export type RuleStatus = {
  rule: RiskRule;
  breached: boolean;
  summary: string;
  evidence: string[];
};

export type CsvParseIssue = {
  row: number;
  message: string;
};

export type CsvParseResult = {
  trades: Trade[];
  issues: CsvParseIssue[];
  headers: string[];
  rowCount: number;
};

export const defaultRules: RiskRule[] = [
  { id: "daily-loss", name: "Daily loss limit", metric: "maxDailyLoss", limit: 2500, severity: "critical", enabled: true },
  { id: "trade-loss", name: "Single-trade loss limit", metric: "maxTradeLoss", limit: 1600, severity: "critical", enabled: true },
  { id: "size", name: "Max contracts", metric: "maxContracts", limit: 5, severity: "warning", enabled: true },
  { id: "streak", name: "Pause after loss streak", metric: "maxLossStreak", limit: 3, severity: "warning", enabled: true },
  { id: "profit-factor", name: "Minimum profit factor", metric: "minProfitFactor", limit: 1.05, severity: "info", enabled: true },
  { id: "average-r", name: "Minimum average R", metric: "minAvgR", limit: 0.1, severity: "info", enabled: true },
];

export const sampleTrades: Trade[] = [
  ["2026-04-17", "NQ", "Long", 2, 18460.25, 18483.75, 940, 500, "Opening range", "Waited for first pullback."],
  ["2026-04-17", "ES", "Short", 3, 5235.5, 5229.25, 937.5, 540, "VWAP rejection", "Clean rejection after failed high."],
  ["2026-04-18", "NQ", "Long", 2, 18512, 18493, -760, 520, "Opening range", "Late entry after extension."],
  ["2026-04-18", "NQ", "Long", 4, 18498.5, 18484.25, -1140, 600, "Breakout continuation", "Added size after first loss."],
  ["2026-04-21", "CL", "Short", 2, 81.24, 80.92, 640, 460, "Level reclaim", "Oil inventory fade."],
  ["2026-04-21", "NQ", "Short", 1, 18420.75, 18406, 295, 350, "VWAP rejection", "Reduced size into chop."],
  ["2026-04-22", "ES", "Long", 4, 5216.25, 5211.75, -900, 500, "Breakout continuation", "Breakout failed under prior high."],
  ["2026-04-22", "ES", "Long", 6, 5214.75, 5209.5, -1575, 650, "Breakout continuation", "Size exceeded plan."],
  ["2026-04-23", "GC", "Long", 1, 2398.1, 2407.4, 930, 420, "Level reclaim", "Held through retest."],
  ["2026-04-24", "NQ", "Short", 3, 18610.5, 18620.75, -615, 510, "VWAP rejection", "Invalidation respected."],
  ["2026-04-24", "NQ", "Short", 3, 18618, 18629.25, -675, 500, "VWAP rejection", "Second attempt was lower quality."],
  ["2026-04-24", "NQ", "Short", 5, 18625, 18638.5, -1350, 650, "Opening range", "Third attempt after two losses."],
  ["2026-04-25", "ES", "Short", 2, 5254.75, 5248.25, 650, 420, "Opening range", "Smaller size after drawdown."],
  ["2026-04-28", "NQ", "Long", 2, 18704.25, 18726.75, 900, 520, "Opening range", "Good stop discipline."],
  ["2026-04-28", "NQ", "Long", 2, 18735, 18745.25, 410, 450, "Breakout continuation", "Scaled quickly near target."],
  ["2026-04-29", "CL", "Long", 1, 80.44, 80.07, -370, 360, "Level reclaim", "No follow-through."],
  ["2026-04-30", "GC", "Short", 1, 2412.5, 2402.9, 960, 430, "VWAP rejection", "Best execution of week."],
  ["2026-05-01", "ES", "Long", 3, 5260.25, 5256.75, -525, 390, "Opening range", "No second entry taken."],
  ["2026-05-01", "NQ", "Long", 2, 18820.5, 18843.75, 930, 510, "Level reclaim", "Followed higher low."],
  ["2026-05-04", "NQ", "Short", 3, 18880, 18861.25, 1125, 540, "VWAP rejection", "Let winner reach planned target."],
  ["2026-05-04", "ES", "Short", 2, 5282, 5278, 400, 340, "VWAP rejection", "Partial near prior low."],
  ["2026-05-05", "NQ", "Long", 4, 18905.5, 18897.75, -620, 500, "Breakout continuation", "Small false break."],
  ["2026-05-05", "NQ", "Long", 4, 18900, 18888.25, -940, 520, "Breakout continuation", "Repeated setup without confirmation."],
  ["2026-05-06", "GC", "Long", 1, 2421.7, 2430.3, 860, 390, "Level reclaim", "Clean reclaim after London low."],
  ["2026-05-06", "NQ", "Short", 2, 18862.5, 18850, 500, 440, "Opening range", "Stopped trading after target window."],
].map(([date, market, side, contracts, entry, exit, pnl, risk, setup, notes], index) => ({
  id: `demo-${index + 1}`,
  date: String(date),
  market: String(market),
  side: side as "Long" | "Short",
  contracts: Number(contracts),
  entry: Number(entry),
  exit: Number(exit),
  pnl: Number(pnl),
  risk: Number(risk),
  setup: String(setup),
  notes: String(notes),
}));

export function analyze(trades: Trade[], rules: RiskRule[]) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const totalPnl = sorted.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossProfit = sorted.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(sorted.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0));
  const profitFactor = grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0;
  const winRate = sorted.length ? sorted.filter((trade) => trade.pnl > 0).length / sorted.length : 0;
  const avgR = sorted.length ? sorted.reduce((sum, trade) => sum + trade.pnl / Math.max(1, trade.risk), 0) / sorted.length : 0;

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let lossStreak = 0;
  let worstLossStreak = 0;
  const equityPoints = [{ label: "Start", value: 0 }];
  for (const trade of sorted) {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    equityPoints.push({ label: trade.date, value: equity });
    if (trade.pnl < 0) {
      lossStreak += 1;
      worstLossStreak = Math.max(worstLossStreak, lossStreak);
    } else {
      lossStreak = 0;
    }
  }

  const daily = Object.entries(groupBy(sorted, (trade) => trade.date)).map(([date, rows]) => ({
    date,
    pnl: rows.reduce((sum, trade) => sum + trade.pnl, 0),
    trades: rows.length,
  }));

  const ruleStatuses = rules.filter((rule) => rule.enabled).map((rule) => evaluateRule(rule, sorted, daily, { profitFactor, avgR, worstLossStreak }));
  const breaches = ruleStatuses.filter((status) => status.breached);
  const compliance = ruleStatuses.length ? (ruleStatuses.length - breaches.length) / ruleStatuses.length : 1;
  const score = clamp(Math.round(76 + compliance * 18 + Math.max(0, avgR) * 10 + Math.min(8, Math.max(0, profitFactor - 1) * 4) - breaches.length * 8 - maxDrawdown / 650), 0, 100);

  const bySetup = summarize(sorted, (trade) => trade.setup);
  const byMarket = summarize(sorted, (trade) => trade.market);

  return {
    trades: sorted,
    totalPnl,
    grossProfit,
    grossLoss,
    profitFactor,
    winRate,
    avgR,
    equityPoints,
    maxDrawdown,
    worstLossStreak,
    daily,
    ruleStatuses,
    breaches,
    compliance,
    score,
    bySetup,
    byMarket,
    latestDate: sorted[sorted.length - 1]?.date ?? "No trades yet",
  };
}

function evaluateRule(rule: RiskRule, trades: Trade[], daily: { date: string; pnl: number; trades: number }[], metrics: { profitFactor: number; avgR: number; worstLossStreak: number }): RuleStatus {
  let breached = false;
  let summary = "Looks within your limits.";
  let evidence: string[] = [];
  if (rule.metric === "maxDailyLoss") {
    const offenders = daily.filter((day) => day.pnl <= -rule.limit);
    breached = offenders.length > 0;
    evidence = offenders.map((day) => `${day.date}: ${formatMoney(day.pnl)}`);
    summary = breached ? `${offenders.length} day${offenders.length === 1 ? "" : "s"} lost more than ${formatMoney(rule.limit)}.` : `Daily losses stayed under ${formatMoney(rule.limit)}.`;
  }
  if (rule.metric === "maxTradeLoss") {
    const offenders = trades.filter((trade) => trade.pnl <= -rule.limit);
    breached = offenders.length > 0;
    evidence = offenders.map((trade) => `${trade.date} ${trade.market}: ${formatMoney(trade.pnl)}`);
    summary = breached ? `${offenders.length} trade${offenders.length === 1 ? "" : "s"} lost more than ${formatMoney(rule.limit)}.` : `Single-trade losses stayed under ${formatMoney(rule.limit)}.`;
  }
  if (rule.metric === "maxContracts") {
    const offenders = trades.filter((trade) => trade.contracts > rule.limit);
    breached = offenders.length > 0;
    evidence = offenders.map((trade) => `${trade.date} ${trade.market}: ${trade.contracts} contracts`);
    summary = breached ? `${offenders.length} trade${offenders.length === 1 ? "" : "s"} used more than ${rule.limit} contracts.` : `Position size stayed at or below ${rule.limit} contracts.`;
  }
  if (rule.metric === "maxLossStreak") {
    breached = metrics.worstLossStreak > rule.limit;
    evidence = [`Worst loss streak: ${metrics.worstLossStreak}`];
    summary = breached ? `Loss streak went past ${rule.limit}.` : `Loss streak stayed at or below ${rule.limit}.`;
  }
  if (rule.metric === "minProfitFactor") {
    breached = metrics.profitFactor < rule.limit;
    evidence = [`Profit factor: ${Number.isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : "∞"}`];
    summary = breached ? `Profit factor is below ${rule.limit}.` : `Profit factor is above ${rule.limit}.`;
  }
  if (rule.metric === "minAvgR") {
    breached = metrics.avgR < rule.limit;
    evidence = [`Average R: ${metrics.avgR.toFixed(2)}R`];
    summary = breached ? `Average R is below ${rule.limit}.` : `Average R is above ${rule.limit}.`;
  }
  return { rule, breached, summary, evidence };
}

function summarize(trades: Trade[], getKey: (trade: Trade) => string) {
  return Object.entries(groupBy(trades, getKey))
    .map(([name, rows]) => {
      const pnl = rows.reduce((sum, trade) => sum + trade.pnl, 0);
      return {
        name,
        count: rows.length,
        pnl,
        winRate: rows.filter((trade) => trade.pnl > 0).length / rows.length,
        avgR: rows.reduce((sum, trade) => sum + trade.pnl / Math.max(1, trade.risk), 0) / rows.length,
      };
    })
    .sort((a, b) => b.count - a.count || b.pnl - a.pnl);
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {});
}

export function parseCsv(text: string): Trade[] {
  return parseCsvDetailed(text).trades;
}

export function parseCsvDetailed(text: string): CsvParseResult {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim().length);
  if (!lines.length) {
    return { trades: [], issues: [{ row: 0, message: "CSV is empty." }], headers: [], rowCount: 0 };
  }

  const rawHeaders = splitCsvLine(lines[0]);
  const headers = rawHeaders.map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const issues: CsvParseIssue[] = [];
  const trades: Trade[] = [];

  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const row = splitCsvLine(line);
    const record = Object.fromEntries(headers.map((header, i) => [header, row[i] ?? ""]));
    const pnl = Number(record.pnl || record.profit || 0);
    const contracts = Number(record.contracts || record.qty || 1);
    const entry = Number(record.entry || 0);
    const exit = Number(record.exit || 0);
    const market = (record.market || record.symbol || "").trim().toUpperCase();
    const date = record.date || "";

    const rowIssues = [
      !date ? "missing date" : "",
      !market ? "missing market/symbol" : "",
      !Number.isFinite(pnl) ? "invalid P&L" : "",
      !Number.isFinite(contracts) || contracts <= 0 ? "invalid contracts" : "",
    ].filter(Boolean);

    if (rowIssues.length) {
      issues.push({ row: rowNumber, message: rowIssues.join(", ") });
      return;
    }

    const risk = Math.max(1, Number(record.risk || record.plannedrisk || (Math.abs(pnl) || 500)));
    const side: "Long" | "Short" = record.side?.toLowerCase() === "short" ? "Short" : "Long";
    trades.push({
      id: `csv-${Date.now()}-${index}`,
      date,
      market,
      side,
      contracts: Math.max(1, contracts),
      entry: Number.isFinite(entry) ? entry : 0,
      exit: Number.isFinite(exit) ? exit : 0,
      pnl,
      risk,
      setup: record.setup || record.strategy || "Imported",
      notes: record.notes || "",
    });
  });

  return { trades, issues, headers: rawHeaders, rowCount: Math.max(0, lines.length - 1) };
}

export function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2 })}`;
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }

  cells.push(cell.trim());
  return cells;
}
