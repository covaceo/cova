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

export type SessionSummary = {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  maxContracts: number;
  largestWin: number;
  largestLoss: number;
  netR: number;
  avgR: number;
  worstCumulativePnl: number;
};

export type BehaviorFlag = {
  id: string;
  label: string;
  severity: "critical" | "warning" | "info" | "positive";
  summary: string;
  evidence: string[];
};

export type NextSessionBrief = {
  status: "locked" | "caution" | "ready";
  headline: string;
  summary: string;
  watchlist: string[];
  guardrails: string[];
  evidence: string[];
};

export type EvidenceQuality = {
  label: "No sample" | "Small sample" | "Building sample" | "Good sample" | "High confidence";
  level: "none" | "low" | "medium" | "high";
  summary: string;
  caveats: string[];
};

export type ScoreFactor = {
  label: string;
  impact: "positive" | "negative" | "neutral";
  summary: string;
  evidence: string;
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
  const avgR = averageR(sorted);
  const recentTrades = sorted.slice(-7);
  const recentPnl = recentTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const recentAvgR = averageR(recentTrades);
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalfAvgR = midpoint ? averageR(sorted.slice(0, midpoint)) : 0;
  const secondHalfAvgR = sorted.length - midpoint ? averageR(sorted.slice(midpoint)) : 0;
  const avgRTrend = sorted.length >= 12 ? secondHalfAvgR - firstHalfAvgR : 0;

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

  const sessions = buildSessionSummaries(sorted);
  const latestSession = sessions[sessions.length - 1] ?? null;
  const daily = sessions.map((session) => ({
    date: session.date,
    pnl: session.pnl,
    trades: session.trades,
  }));

  const ruleStatuses = rules.filter((rule) => rule.enabled).map((rule) => evaluateRule(rule, sorted, sessions, { profitFactor, avgR, worstLossStreak }));
  const breaches = ruleStatuses.filter((status) => status.breached);
  const compliance = ruleStatuses.length ? (ruleStatuses.length - breaches.length) / ruleStatuses.length : 1;
  const bySetup = summarize(sorted, (trade) => trade.setup);
  const byMarket = summarize(sorted, (trade) => trade.market);
  const setupConcentration = getConcentration(bySetup, sorted.length);
  const criticalBreaches = breaches.filter((status) => status.rule.severity === "critical").length;
  const warningBreaches = breaches.filter((status) => status.rule.severity === "warning").length;
  const infoBreaches = breaches.filter((status) => status.rule.severity === "info").length;
  const worstSessionLoss = Math.max(0, ...sessions.map((session) => Math.abs(Math.min(0, session.pnl))));
  const recentPenalty = recentAvgR < 0 ? Math.abs(recentAvgR) * 8 : 0;
  const trendAdjustment = sorted.length >= 12 ? clamp(avgRTrend * 6, -6, 6) : 0;
  const concentrationPenalty = setupConcentration && setupConcentration.share >= 0.45 && setupConcentration.avgR < 0 ? 4 : 0;
  const sessionPenalty = Math.min(10, worstSessionLoss / 700);
  const samplePenalty = getSamplePenalty(sorted.length);
  const evidenceQuality = buildEvidenceQuality(sorted.length, rules.filter((rule) => rule.enabled).length, sorted);
  const rawScore = sorted.length
    ? clamp(
      Math.round(
        70 +
          compliance * 20 +
          Math.max(0, avgR) * 11 +
          Math.max(0, recentAvgR) * 5 +
          Math.min(8, Math.max(0, profitFactor - 1) * 4) -
          criticalBreaches * 10 -
          warningBreaches * 5 -
          infoBreaches * 2 -
          recentPenalty -
          concentrationPenalty +
          trendAdjustment -
          sessionPenalty -
          samplePenalty -
          maxDrawdown / 850,
      ),
      0,
      100,
    )
    : 0;
  const score = applyEvidenceScoreCap(rawScore, evidenceQuality);
  const scoreFactors = buildScoreFactors({
    avgR,
    breaches,
    compliance,
    evidenceQuality,
    maxDrawdown,
    avgRTrend,
    profitFactor,
    recentAvgR,
    recentPnl,
    score,
    sorted,
  });
  const behaviorFlags = buildBehaviorFlags({
    bySetup,
    maxDrawdown,
    recentAvgR,
    recentPnl,
    rules,
    sessions,
    sorted,
    breaches,
    setupConcentration,
  });
  const nextSessionBrief = buildNextSessionBrief({
    behaviorFlags,
    breaches,
    latestSession,
    maxDrawdown,
    recentAvgR,
    recentPnl,
    rules,
    score,
    sorted,
  });

  return {
    trades: sorted,
    totalPnl,
    grossProfit,
    grossLoss,
    profitFactor,
    winRate,
    avgR,
    avgRTrend,
    firstHalfAvgR,
    secondHalfAvgR,
    equityPoints,
    maxDrawdown,
    worstLossStreak,
    recentAvgR,
    recentPnl,
    recentTrades,
    sessions,
    latestSession,
    daily,
    ruleStatuses,
    breaches,
    behaviorFlags,
    nextSessionBrief,
    compliance,
    score,
    evidenceQuality,
    scoreFactors,
    bySetup,
    byMarket,
    setupConcentration,
    latestDate: sorted[sorted.length - 1]?.date ?? "No trades yet",
  };
}

function buildSessionSummaries(sorted: Trade[]): SessionSummary[] {
  return Object.entries(groupBy(sorted, (trade) => trade.date))
    .map(([date, rows]) => {
      const pnl = rows.reduce((sum, trade) => sum + trade.pnl, 0);
      const netR = rows.reduce((sum, trade) => sum + rMultiple(trade), 0);
      let runningPnl = 0;
      let worstCumulativePnl = 0;
      for (const trade of rows) {
        runningPnl += trade.pnl;
        worstCumulativePnl = Math.min(worstCumulativePnl, runningPnl);
      }
      return {
        date,
        pnl,
        trades: rows.length,
        wins: rows.filter((trade) => trade.pnl > 0).length,
        losses: rows.filter((trade) => trade.pnl < 0).length,
        maxContracts: Math.max(...rows.map((trade) => trade.contracts)),
        largestWin: Math.max(0, ...rows.map((trade) => trade.pnl)),
        largestLoss: Math.min(0, ...rows.map((trade) => trade.pnl)),
        netR,
        avgR: rows.length ? netR / rows.length : 0,
        worstCumulativePnl,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildBehaviorFlags({
  breaches,
  bySetup,
  maxDrawdown,
  recentAvgR,
  recentPnl,
  rules,
  sessions,
  setupConcentration,
  sorted,
}: {
  breaches: RuleStatus[];
  bySetup: ReturnType<typeof summarize>;
  maxDrawdown: number;
  recentAvgR: number;
  recentPnl: number;
  rules: RiskRule[];
  sessions: SessionSummary[];
  setupConcentration: ReturnType<typeof getConcentration>;
  sorted: Trade[];
}): BehaviorFlag[] {
  const flags: BehaviorFlag[] = [];
  const latestSession = sessions[sessions.length - 1] ?? null;
  const dailyLimit = getRuleLimit(rules, "maxDailyLoss", 2500);
  const maxContracts = getRuleLimit(rules, "maxContracts", 5);
  const lossStreakLimit = getRuleLimit(rules, "maxLossStreak", 3);
  const sizeOffenders = sorted.filter((trade) => trade.contracts > maxContracts);
  const weakestSetup = bySetup.filter((setup) => setup.count >= 3).sort((a, b) => a.avgR - b.avgR)[0];
  const bestSetup = bySetup.filter((setup) => setup.count >= 3).sort((a, b) => b.avgR - a.avgR)[0];
  const criticalBreach = breaches.find((status) => status.rule.severity === "critical");
  const recentDates = new Set(sorted.slice(-7).map((trade) => trade.date));
  const negativeOvertradingSession = sessions
    .filter((session) => session.trades >= 8 && session.avgR < 0)
    .sort((a, b) => a.avgR - b.avgR || b.trades - a.trades)[0];
  const sizeUpAfterLoss = sorted.find((trade, index) => {
    const previous = sorted[index - 1];
    return Boolean(previous && previous.pnl < 0 && trade.contracts > previous.contracts && trade.pnl < 0);
  });
  const rOutlierLoss = sorted
    .filter((trade) => rMultiple(trade) <= -2)
    .sort((a, b) => rMultiple(a) - rMultiple(b))[0];

  if (criticalBreach) {
    const evidence = criticalBreach.evidence.slice(0, 2);
    const recent = evidence.some((line) => recentDates.has(line.slice(0, 10)));
    flags.push({
      id: "critical-limit",
      label: recent ? "Limit crossed" : "Old limit breach",
      severity: recent ? "critical" : "warning",
      summary: recent ? criticalBreach.summary : "An older trade crossed a critical limit. Keep it visible, but judge the next session from recent behavior.",
      evidence,
    });
  }

  if (latestSession && latestSession.pnl <= -dailyLimit * 0.7) {
    flags.push({
      id: "daily-loss-pressure",
      label: "Daily loss pressure",
      severity: latestSession.pnl <= -dailyLimit ? "critical" : "warning",
      summary: "The latest session used too much of the daily loss budget.",
      evidence: [`${latestSession.date}: ${formatMoney(latestSession.pnl)}`, `Limit: ${formatMoney(-dailyLimit)}`],
    });
  }

  if (sizeOffenders.length) {
    const recentSizeOffenders = sizeOffenders.filter((trade) => recentDates.has(trade.date));
    const largest = sizeOffenders.reduce((max, trade) => Math.max(max, trade.contracts), 0);
    flags.push({
      id: "size-drift",
      label: recentSizeOffenders.length ? "Size drift" : "Old size drift",
      severity: recentSizeOffenders.length ? "warning" : "info",
      summary: recentSizeOffenders.length ? "Recent trades used more contracts than the limit allows." : "Older trades used more contracts than the limit allows.",
      evidence: [`Largest size: ${largest} contracts`, `Limit: ${maxContracts} contracts`],
    });
  }

  if (sizeUpAfterLoss) {
    const previous = sorted[sorted.indexOf(sizeUpAfterLoss) - 1];
    flags.push({
      id: "size-up-after-loss",
      label: recentDates.has(sizeUpAfterLoss.date) ? "Sized up after a loss" : "Old size-up pattern",
      severity: recentDates.has(sizeUpAfterLoss.date) ? "warning" : "info",
      summary: "The account increased size immediately after a losing trade and the next trade also lost. That is the kind of pattern to stop before it becomes a daily loss breach.",
      evidence: [
        `${previous.date} ${previous.market}: ${previous.contracts} contract${previous.contracts === 1 ? "" : "s"}, ${formatMoney(previous.pnl)}`,
        `${sizeUpAfterLoss.date} ${sizeUpAfterLoss.market}: ${sizeUpAfterLoss.contracts} contract${sizeUpAfterLoss.contracts === 1 ? "" : "s"}, ${formatMoney(sizeUpAfterLoss.pnl)}`,
      ],
    });
  }

  if (rOutlierLoss) {
    const lossR = rMultiple(rOutlierLoss);
    flags.push({
      id: "r-outlier-loss",
      label: "Large R loss",
      severity: recentDates.has(rOutlierLoss.date) ? "warning" : "info",
      summary: "One loss was large relative to planned risk. This matters even when the dollar loss does not break a hard limit.",
      evidence: [
        `${rOutlierLoss.date} ${rOutlierLoss.market}: ${lossR.toFixed(2)}R`,
        `${formatMoney(rOutlierLoss.pnl)} loss on ${formatMoney(getTradeRisk(rOutlierLoss))} planned risk`,
      ],
    });
  }

  if (recentAvgR < -0.1) {
    flags.push({
      id: "recent-expectancy",
      label: "Recent edge faded",
      severity: "warning",
      summary: "The most recent trades are averaging a negative R multiple.",
      evidence: [`Recent average: ${recentAvgR.toFixed(2)}R`, `Recent P&L: ${formatMoney(recentPnl)}`],
    });
  }

  if (negativeOvertradingSession) {
    flags.push({
      id: "overtrading-session",
      label: "Too many trades on a red day",
      severity: recentDates.has(negativeOvertradingSession.date) ? "warning" : "info",
      summary: "One session had a high trade count and negative average R. That usually needs a tighter stop-trading rule.",
      evidence: [
        `${negativeOvertradingSession.date}: ${negativeOvertradingSession.trades} trades`,
        `${negativeOvertradingSession.avgR.toFixed(2)}R average result, ${formatMoney(negativeOvertradingSession.pnl)}`,
      ],
    });
  }

  if (setupConcentration && setupConcentration.share >= 0.45 && setupConcentration.count >= 8 && setupConcentration.avgR < 0.08) {
    const isNegative = setupConcentration.avgR < 0;
    flags.push({
      id: "setup-concentration",
      label: isNegative ? "Too much risk in one setup" : "One setup is dominating",
      severity: isNegative ? "warning" : "info",
      summary: isNegative
        ? `${setupConcentration.name} is taking up most of the sample while producing negative R.`
        : `${setupConcentration.name} is taking up most of the sample, so the summary is sensitive to that setup's results.`,
      evidence: [
        `${setupConcentration.count}/${sorted.length} trades (${formatPercent(setupConcentration.share)})`,
        `${setupConcentration.avgR.toFixed(2)}R average result`,
      ],
    });
  }

  if (breaches.some((status) => status.rule.metric === "maxLossStreak")) {
    flags.push({
      id: "loss-streak",
      label: "Loss streak",
      severity: "warning",
      summary: "The imported history crossed the configured clustered-loss threshold.",
      evidence: [`Configured threshold: ${lossStreakLimit} losses`, `Worst streak: ${breaches.find((status) => status.rule.metric === "maxLossStreak")?.evidence[0]?.replace("Worst loss streak: ", "") ?? "review"}`],
    });
  }

  if (weakestSetup && weakestSetup.avgR < -0.15) {
    flags.push({
      id: "weak-setup",
      label: `${weakestSetup.name} needs review`,
      severity: "info",
      summary: "This setup has enough imported history for its negative average result to be visible in the review.",
      evidence: [`${weakestSetup.count} trades`, `${weakestSetup.avgR.toFixed(2)}R average result`],
    });
  }

  if (!flags.some((flag) => flag.severity === "critical" || flag.severity === "warning") && bestSetup) {
    flags.push({
      id: "stable-setup",
      label: `${bestSetup.name} has the strongest reviewed sample`,
      severity: "positive",
      summary: "This setup has the strongest current sample inside the trade history.",
      evidence: [`${bestSetup.count} trades`, `${bestSetup.avgR.toFixed(2)}R average result`],
    });
  }

  if (!flags.length && sorted.length) {
    flags.push({
      id: "steady",
      label: "No major warnings",
      severity: "positive",
      summary: "The current sample is staying inside the active limits.",
      evidence: [`${sorted.length} trades reviewed`, `Biggest dip: ${formatMoney(-maxDrawdown)}`],
    });
  }

  return dedupeFlags(flags).slice(0, 5);
}

function buildNextSessionBrief({
  behaviorFlags,
  breaches,
  latestSession,
  maxDrawdown,
  recentAvgR,
  recentPnl,
  rules,
  score,
  sorted,
}: {
  behaviorFlags: BehaviorFlag[];
  breaches: RuleStatus[];
  latestSession: SessionSummary | null;
  maxDrawdown: number;
  recentAvgR: number;
  recentPnl: number;
  rules: RiskRule[];
  score: number;
  sorted: Trade[];
}): NextSessionBrief {
  const dailyLimit = getRuleLimit(rules, "maxDailyLoss", 2500);
  const maxContracts = getRuleLimit(rules, "maxContracts", 5);
  const lossStreakLimit = getRuleLimit(rules, "maxLossStreak", 3);
  const recentDates = new Set(sorted.slice(-7).map((trade) => trade.date));
  const hasRecentCriticalBreach = breaches.some((status) => status.rule.severity === "critical" && status.evidence.some((line) => recentDates.has(line.slice(0, 10))));
  const hasRecentWarningBreach = breaches.some((status) => status.rule.severity === "warning" && status.evidence.some((line) => recentDates.has(line.slice(0, 10))));
  const latestDailyBreach = Boolean(latestSession && latestSession.pnl <= -dailyLimit);
  const hasCritical = latestDailyBreach || hasRecentCriticalBreach || behaviorFlags.some((flag) => flag.severity === "critical");
  const hasWarning = hasRecentWarningBreach || behaviorFlags.some((flag) => flag.severity === "warning");
  const watchlist = behaviorFlags
    .filter((flag) => flag.severity !== "positive")
    .map((flag) => flag.label)
    .slice(0, 3);
  const guardrails = [
    `Configured daily-loss limit: ${formatMoney(dailyLimit)}.`,
    `Configured size limit: ${maxContracts} contract${maxContracts === 1 ? "" : "s"}.`,
    `Configured loss-streak threshold: ${lossStreakLimit} trade${lossStreakLimit === 1 ? "" : "s"}.`,
  ];
  const evidence = [
    latestSession ? `Latest session: ${formatMoney(latestSession.pnl)} across ${latestSession.trades} trade${latestSession.trades === 1 ? "" : "s"}` : "No latest session yet",
    sorted.length ? `Recent 7-trade average: ${recentAvgR.toFixed(2)}R` : "Upload trades to calculate recent R",
    `Biggest dip: ${formatMoney(-maxDrawdown)}`,
  ];

  if (!sorted.length) {
    return {
      status: "caution",
      headline: "Upload trades to generate a historical review.",
      summary: "Cova needs trade history before it can summarize patterns against your configured limits.",
      watchlist: ["No trade history yet"],
      guardrails,
      evidence,
    };
  }

  if (hasCritical) {
    return {
      status: "locked",
      headline: "A critical limit was crossed in the reviewed history.",
      summary: "The imported sample contains activity beyond a configured limit. Review the underlying trades and source data before relying on this summary.",
      watchlist: watchlist.length ? watchlist : ["Critical limit warning"],
      guardrails,
      evidence: [...evidence, `${breaches.length} active limit warning${breaches.length === 1 ? "" : "s"}`],
    };
  }

  if (hasWarning || recentAvgR < 0 || score < 70) {
    const recentPressure = recentAvgR < 0 || hasRecentWarningBreach || behaviorFlags.some((flag) => flag.severity === "warning" && flag.id !== "critical-limit");
    return {
      status: "caution",
      headline: recentPressure ? "Recent history contains a recurring risk pattern." : "Older rule warnings remain in the reviewed sample.",
      summary: recentPressure
        ? "Cova detected the same warning across recent imported trades. This is retrospective analysis, not a recommendation for the next trade."
        : "Recent trades differ from the older warning pattern, but the historical rule flags remain part of the account review.",
      watchlist: watchlist.length ? watchlist : ["Recent trades need review"],
      guardrails,
      evidence: [...evidence, `Recent P&L: ${formatMoney(recentPnl)}`],
    };
  }

  return {
    status: "ready",
    headline: "The reviewed sample stayed inside the configured limits.",
    summary: "No active limit breach was detected in the imported history. This does not predict future performance or indicate that a trade is appropriate.",
    watchlist: behaviorFlags.length ? behaviorFlags.map((flag) => flag.label).slice(0, 3) : ["No current warning pattern detected"],
    guardrails,
    evidence,
  };
}

function getRuleLimit(rules: RiskRule[], metric: RiskRule["metric"], fallback: number) {
  return rules.find((rule) => rule.metric === metric && rule.enabled)?.limit ?? fallback;
}

function dedupeFlags(flags: BehaviorFlag[]) {
  const seen = new Set<string>();
  return flags.filter((flag) => {
    if (seen.has(flag.id)) {
      return false;
    }
    seen.add(flag.id);
    return true;
  });
}

function evaluateRule(rule: RiskRule, trades: Trade[], sessions: SessionSummary[], metrics: { profitFactor: number; avgR: number; worstLossStreak: number }): RuleStatus {
  let breached = false;
  let summary = "Looks within your limits.";
  let evidence: string[] = [];
  if (rule.metric === "maxDailyLoss") {
    const offenders = sessions.filter((session) => session.pnl <= -rule.limit || session.worstCumulativePnl <= -rule.limit);
    breached = offenders.length > 0;
    evidence = offenders.map((session) => {
      const intradayLow = session.worstCumulativePnl < session.pnl ? `, intraday low ${formatMoney(session.worstCumulativePnl)}` : "";
      return `${session.date}: closed ${formatMoney(session.pnl)}${intradayLow}`;
    });
    summary = breached ? `${offenders.length} session${offenders.length === 1 ? "" : "s"} crossed the ${formatMoney(rule.limit)} daily loss line.` : `Daily losses stayed above ${formatMoney(-rule.limit)}.`;
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
        avgR: averageR(rows),
      };
    })
    .sort((a, b) => b.count - a.count || b.pnl - a.pnl);
}

function getConcentration(rows: ReturnType<typeof summarize>, totalTrades: number) {
  if (!totalTrades || !rows.length) {
    return null;
  }
  const [top] = [...rows].sort((a, b) => b.count - a.count || a.avgR - b.avgR);
  return {
    ...top,
    share: top.count / totalTrades,
  };
}

function averageR(trades: Trade[]) {
  return trades.length ? trades.reduce((sum, trade) => sum + rMultiple(trade), 0) / trades.length : 0;
}

function rMultiple(trade: Trade) {
  return trade.pnl / getTradeRisk(trade);
}

function getTradeRisk(trade: Trade) {
  return Number.isFinite(trade.risk) && trade.risk > 0 ? trade.risk : Math.max(1, Math.abs(trade.pnl));
}

function getSamplePenalty(count: number) {
  if (count <= 0) {
    return 40;
  }
  if (count < 10) {
    return 7;
  }
  if (count < 25) {
    return 3;
  }
  return 0;
}

function applyEvidenceScoreCap(score: number, evidenceQuality: EvidenceQuality) {
  if (evidenceQuality.level === "none") {
    return 0;
  }
  if (evidenceQuality.level === "low") {
    return Math.min(score, 72);
  }
  if (evidenceQuality.level === "medium") {
    return Math.min(score, 86);
  }
  return score;
}

function buildEvidenceQuality(tradeCount: number, activeRuleCount: number, trades: Trade[]): EvidenceQuality {
  const missingRiskCount = trades.filter((trade) => !Number.isFinite(trade.risk) || trade.risk <= 0).length;
  const caveats = [
    activeRuleCount ? "" : "No active risk rules are enabled.",
    missingRiskCount ? `${missingRiskCount} trade${missingRiskCount === 1 ? "" : "s"} used inferred risk.` : "",
  ].filter(Boolean);

  if (!tradeCount) {
    return {
      label: "No sample",
      level: "none",
      summary: "Upload or connect trade history before trusting any score.",
      caveats: caveats.length ? caveats : ["No trades reviewed yet."],
    };
  }

  if (tradeCount < 10) {
    return {
      label: "Small sample",
      level: "low",
      summary: "Enough to preview the workflow, not enough to judge the account with confidence.",
      caveats: [`Only ${tradeCount} trade${tradeCount === 1 ? "" : "s"} reviewed.`, ...caveats],
    };
  }

  if (tradeCount < 25) {
    return {
      label: "Building sample",
      level: "medium",
      summary: "Useful for recent behavior, but still light for setup-level conclusions.",
      caveats,
    };
  }

  if (tradeCount < 50) {
    return {
      label: "Good sample",
      level: "high",
      summary: "Enough trades to review limits, drawdown, and recurring habits.",
      caveats,
    };
  }

  return {
    label: "High confidence",
    level: "high",
    summary: "The sample is large enough for stronger risk and behavior evidence.",
    caveats,
  };
}

function buildScoreFactors({
  avgR,
  avgRTrend,
  breaches,
  compliance,
  evidenceQuality,
  maxDrawdown,
  profitFactor,
  recentAvgR,
  recentPnl,
  score,
  sorted,
}: {
  avgR: number;
  avgRTrend: number;
  breaches: RuleStatus[];
  compliance: number;
  evidenceQuality: EvidenceQuality;
  maxDrawdown: number;
  profitFactor: number;
  recentAvgR: number;
  recentPnl: number;
  score: number;
  sorted: Trade[];
}): ScoreFactor[] {
  if (!sorted.length) {
    return [
      {
        label: "No trade history",
        impact: "neutral",
        summary: "The score is locked until Cova has trades to review.",
        evidence: "0 trades uploaded",
      },
    ];
  }

  const criticalBreaches = breaches.filter((status) => status.rule.severity === "critical").length;
  const warningBreaches = breaches.filter((status) => status.rule.severity === "warning").length;
  const factors: ScoreFactor[] = [
    {
      label: "Rule discipline",
      impact: breaches.length ? "negative" : "positive",
      summary: breaches.length
        ? `${breaches.length} active limit warning${breaches.length === 1 ? "" : "s"} pulled the score down.`
        : "Active limits are clean in this sample.",
      evidence: `${Math.round(compliance * 100)}% limits followed`,
    },
    {
      label: "Recent behavior",
      impact: recentAvgR < 0 ? "negative" : recentAvgR > 0.15 ? "positive" : "neutral",
      summary: recentAvgR < 0 ? "Recent trades are costing R." : "Recent trades are not pressuring the score.",
      evidence: `${recentAvgR.toFixed(2)}R recent avg, ${formatMoney(recentPnl)} recent P&L`,
    },
    {
      label: "Expectancy",
      impact: avgR > 0.1 && profitFactor >= 1.05 ? "positive" : avgR < 0 || profitFactor < 1 ? "negative" : "neutral",
      summary: "Profit factor and average R show whether winners are paying for losers.",
      evidence: `${Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞"} PF, ${avgR.toFixed(2)}R avg`,
    },
    {
      label: "Drawdown pressure",
      impact: maxDrawdown > 2500 ? "negative" : maxDrawdown < 1000 ? "positive" : "neutral",
      summary: maxDrawdown > 2500 ? "The account has a meaningful peak-to-trough pullback." : "Drawdown is controlled for this sample.",
      evidence: `Biggest dip ${formatMoney(-maxDrawdown)}`,
    },
    {
      label: "Evidence quality",
      impact: evidenceQuality.level === "low" || evidenceQuality.level === "none" ? "negative" : "neutral",
      summary: evidenceQuality.summary,
      evidence: `${evidenceQuality.label}, ${sorted.length} trade${sorted.length === 1 ? "" : "s"}`,
    },
  ];

  if (sorted.length >= 12 && Math.abs(avgRTrend) >= 0.2) {
    factors.unshift({
      label: avgRTrend > 0 ? "Recent improvement" : "Recent regression",
      impact: avgRTrend > 0 ? "positive" : "negative",
      summary: avgRTrend > 0
        ? "The newer half of the sample is producing better R than the older half."
        : "The newer half of the sample is producing worse R than the older half.",
      evidence: `${avgRTrend > 0 ? "+" : ""}${avgRTrend.toFixed(2)}R shift`,
    });
  }

  if (criticalBreaches || warningBreaches) {
    factors.unshift({
      label: "Limit severity",
      impact: "negative",
      summary: "Critical and warning limits carry the heaviest score penalties.",
      evidence: `${criticalBreaches} critical, ${warningBreaches} warning`,
    });
  }

  if (score >= 85) {
    factors.unshift({
      label: "Score support",
      impact: "positive",
      summary: "The account is scoring well because rule discipline and expectancy are aligned.",
      evidence: `${score}/100 Cova Score`,
    });
  }

  return factors.slice(0, 5);
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

  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = splitCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map(normalizeHeader);
  const issues: CsvParseIssue[] = [];
  const trades: Trade[] = [];
  const now = Date.now();

  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const row = splitCsvLine(line, delimiter);
    const record = Object.fromEntries(headers.map((header, i) => [header, row[i] ?? ""]));
    const pnlRaw = valueFrom(record, [
      "pnl",
      "pl",
      "netpnl",
      "netpl",
      "netprofitloss",
      "netprofit",
      "realizedpnl",
      "realizedpl",
      "realizedprofitloss",
      "closedpnl",
      "closedpl",
      "profitloss",
      "profitandloss",
      "profit",
      "loss",
      "amount",
      "net",
    ]);
    const contractsRaw = valueFrom(record, [
      "contracts",
      "contract",
      "qty",
      "quantity",
      "size",
      "filled",
      "filledqty",
      "filledquantity",
      "fillqty",
      "qtyfilled",
      "orderqty",
      "numberofcontracts",
      "lots",
    ]);
    const entryRaw = valueFrom(record, ["entry", "entryprice", "avgentry", "averageentry", "entryavg", "buyprice", "openprice", "open", "entryfillprice"]);
    const exitRaw = valueFrom(record, ["exit", "exitprice", "avgexit", "averageexit", "exitavg", "sellprice", "closeprice", "close", "exitfillprice"]);
    const market = valueFrom(record, ["market", "symbol", "instrument", "instrumentname", "contract", "contractname", "product", "ticker"]).trim().toUpperCase();
    const date = parseDateValue(valueFrom(record, ["date", "tradedate", "closedate", "exitdate", "timestamp", "datetime", "time", "filltime", "executiontime", "closetime", "opentime"]));
    const pnl = parseNumber(pnlRaw);
    const contracts = parseNumber(contractsRaw || "1");
    const entry = parseNumber(entryRaw);
    const exit = parseNumber(exitRaw);

    const rowIssues = [
      !date ? "missing date" : "",
      !market ? "missing market/symbol" : "",
      !pnlRaw ? "missing P&L" : "",
      pnlRaw && !Number.isFinite(pnl) ? "invalid P&L" : "",
      !Number.isFinite(contracts) || contracts <= 0 ? "invalid contracts" : "",
    ].filter(Boolean);

    if (rowIssues.length) {
      issues.push({ row: rowNumber, message: rowIssues.join(", ") });
      return;
    }

    const risk = Math.max(1, parseNumber(valueFrom(record, ["risk", "plannedrisk", "initialrisk", "maxrisk", "r", "rmultiplebase", "riskamount", "plannedloss"])) || Math.abs(pnl) || 500);
    const side = parseSide(valueFrom(record, ["side", "direction", "buysell", "action", "position", "tradeaction"]));
    trades.push({
      id: `csv-${now}-${index}`,
      date,
      market,
      side,
      contracts: Math.max(1, contracts),
      entry: Number.isFinite(entry) ? entry : 0,
      exit: Number.isFinite(exit) ? exit : 0,
      pnl,
      risk,
      setup: valueFrom(record, ["setup", "strategy", "playbook", "tag", "label", "tradetype", "category"]) || "Imported",
      notes: valueFrom(record, ["notes", "note", "comment", "comments", "journal", "description"]),
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

function normalizeHeader(header: string) {
  return header.replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valueFrom(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function parseNumber(value: string | number) {
  if (typeof value === "number") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "--") {
    return Number.NaN;
  }

  const isParenthesized = /^\(.*\)$/.test(trimmed);
  const normalized = trimmed
    .replace(/[−–—]/g, "-")
    .replace(/^\((.*)\)$/, "$1")
    .replace(/[,$%\s]/g, "")
    .replace(/[^0-9.+-]/g, "");
  if (!normalized || normalized === "-" || normalized === "+") {
    return Number.NaN;
  }

  const trailingMinus = normalized.endsWith("-");
  const numeric = Number(trailingMinus ? normalized.slice(0, -1) : normalized);
  if (!Number.isFinite(numeric)) {
    return Number.NaN;
  }
  return isParenthesized || trailingMinus ? -Math.abs(numeric) : numeric;
}

function parseDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const slashDate = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (slashDate) {
    const year = slashDate[3].length === 2 ? `20${slashDate[3]}` : slashDate[3];
    return `${year}-${slashDate[1].padStart(2, "0")}-${slashDate[2].padStart(2, "0")}`;
  }

  const excelSerial = Number(trimmed);
  if (Number.isFinite(excelSerial) && excelSerial > 20_000 && excelSerial < 80_000) {
    return new Date((excelSerial - 25_569) * 86_400_000).toISOString().slice(0, 10);
  }

  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

function parseSide(value: string): "Long" | "Short" {
  const side = value.trim().toLowerCase();
  if (["short", "sell", "sold", "s", "sl", "sld", "sellshort", "selltoclose", "selltoopen"].includes(side)) {
    return "Short";
  }
  return "Long";
}

function detectDelimiter(headerLine: string) {
  const candidates = [",", "\t", ";"];
  return candidates
    .map((delimiter) => ({ delimiter, count: splitCsvLine(headerLine, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function splitCsvLine(line: string, delimiter = ",") {
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
    if (char === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }

  cells.push(cell.trim());
  return cells;
}
