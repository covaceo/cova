export type PracticeDirection = "Long" | "Short";

export const PRACTICE_ACCOUNT_STORAGE_KEY = "cova-practice-account-v1";
export const PRACTICE_TRADES_STORAGE_KEY = "cova-practice-trades-v1";

export type PracticeMarket = "NQ" | "MNQ" | "ES" | "MES";

export type PracticeRep = {
  id: string;
  date: string;
  market: string;
  setup: string;
  session: string;
  direction: PracticeDirection;
  plannedEntry: number;
  stop: number;
  target: number;
  resultR: number;
  rulesFollowed: boolean;
  mistake: string;
  screenshotUrl: string;
  notes: string;
};

export type ReplayCandle = {
  index: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ReplayTape = {
  id: string;
  date: string;
  year: number;
  market: PracticeMarket;
  setup: string;
  session: string;
  candles: ReplayCandle[];
  levels: {
    openingRangeHigh: number;
    openingRangeLow: number;
    overnightResistance: number;
    vwap: number;
  };
};

export type PracticeAccount = {
  id: string;
  accountSize: number;
  balance: number;
  riskPerTrade: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  market: PracticeMarket;
  contracts: number;
  createdAt: string;
};

export type PracticeTrade = PracticeRep & {
  entryIndex: number;
  exitIndex: number;
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  contracts: number;
  pnl: number;
};

export type PracticePosition = {
  id: string;
  direction: PracticeDirection;
  entryIndex: number;
  entryPrice: number;
  contracts: number;
};

export type PracticeAccountStats = {
  balance: number;
  netPnl: number;
  tradeCount: number;
  winRate: number;
  avgPnl: number;
  avgR: number;
  ruleFollowRate: number;
  maxDrawdown: number;
  bestTrade: number;
  worstTrade: number;
};

export type PracticeAccountLimitStatus = {
  dailyPnl: number;
  dailyLossBreached: boolean;
  drawdownBreached: boolean;
  canOpenNewPosition: boolean;
  label: "Within practice limits" | "Daily loss reached" | "Drawdown limit reached";
};

export type SetupPracticeSummary = {
  setup: string;
  sampleSize: number;
  wins: number;
  losses: number;
  scratch: number;
  winRate: number;
  avgR: number;
  netR: number;
  ruleFollowRate: number;
  leak: string;
  score: number;
};

export type PracticeReadiness = {
  label: "No practice sample" | "Practice only" | "Building consistency" | "Practice sample ready";
  tone: "empty" | "locked" | "building" | "ready";
  summary: string;
};

export type PracticeAnalysis = {
  totalReps: number;
  avgR: number;
  netR: number;
  winRate: number;
  ruleFollowRate: number;
  bestSetup: SetupPracticeSummary | null;
  bySetup: SetupPracticeSummary[];
  readiness: PracticeReadiness;
  practiceBrief: string;
};

export const practiceSetupOptions = [
  "ORH rejection",
  "ORB pullback",
  "VWAP reclaim",
  "VWAP rejection",
  "Overnight resistance reject",
  "Level reclaim",
] as const;

const pointValues: Record<PracticeMarket, number> = {
  NQ: 20,
  MNQ: 2,
  ES: 50,
  MES: 5,
};

const marketBasePrice: Record<PracticeMarket, number> = {
  NQ: 20000,
  MNQ: 20000,
  ES: 5200,
  MES: 5200,
};

export const samplePracticeReps: PracticeRep[] = [
  ["2026-06-17", "NQ", "ORH rejection", "New York AM", "Short", 19042.25, 19064.25, 18982.25, 1.35, true, "", "", "Waited for no acceptance above ORH, then shorted the failed reclaim."],
  ["2026-06-18", "NQ", "ORH rejection", "New York AM", "Short", 19110.5, 19136.5, 19052.5, -1, false, "Entered before rejection confirmed", "", "Jumped the signal before the candle closed back under ORH."],
  ["2026-06-19", "NQ", "ORH rejection", "New York AM", "Short", 19088, 19114, 19018, 1.7, true, "", "", "Clean failed acceptance, target was VWAP."],
  ["2026-06-20", "MNQ", "ORB pullback", "New York AM", "Long", 19012, 18988, 19072, 0.6, true, "", "", "Took the first pullback after range expansion."],
  ["2026-06-21", "NQ", "VWAP reclaim", "New York AM", "Long", 18974.25, 18948.25, 19030.25, 0.9, true, "", "", "Reclaim held, but target was conservative."],
  ["2026-06-24", "NQ", "VWAP reclaim", "New York AM", "Long", 19018.5, 18992.5, 19078.5, -0.4, false, "Chased after reclaim candle", "", "Late entry made the stop too wide."],
].map(([date, market, setup, session, direction, plannedEntry, stop, target, resultR, rulesFollowed, mistake, screenshotUrl, notes], index) => ({
  id: `practice-demo-${index + 1}`,
  date: String(date),
  market: String(market),
  setup: String(setup),
  session: String(session),
  direction: direction as PracticeDirection,
  plannedEntry: Number(plannedEntry),
  stop: Number(stop),
  target: Number(target),
  resultR: Number(resultR),
  rulesFollowed: Boolean(rulesFollowed),
  mistake: String(mistake),
  screenshotUrl: String(screenshotUrl),
  notes: String(notes),
}));

export function createDefaultPracticeAccount(overrides: Partial<Omit<PracticeAccount, "id" | "createdAt">> = {}): PracticeAccount {
  const accountSize = Math.max(1000, finiteOr(overrides.accountSize, 50000));
  const riskPerTrade = Math.max(1, finiteOr(overrides.riskPerTrade, Math.max(100, accountSize * 0.01)));
  return {
    id: `practice-account-${Date.now()}`,
    accountSize,
    balance: finiteOr(overrides.balance, accountSize),
    riskPerTrade,
    maxDailyLoss: Math.max(1, finiteOr(overrides.maxDailyLoss, accountSize * 0.03)),
    maxDrawdown: Math.max(1, finiteOr(overrides.maxDrawdown, accountSize * 0.05)),
    market: normalizeMarket(overrides.market),
    contracts: Math.max(1, Math.round(finiteOr(overrides.contracts, 1))),
    createdAt: new Date().toISOString(),
  };
}

export function buildReplayTape({
  date,
  market = "NQ",
  setup = "ORH rejection",
  session = "New York AM",
  year,
}: {
  date: string;
  market?: PracticeMarket | string;
  setup?: string;
  session?: string;
  year?: number;
}): ReplayTape {
  const normalizedMarket = normalizeMarket(market);
  const normalizedDate = normalizeDate(date, year);
  const normalizedYear = year ?? Number(normalizedDate.slice(0, 4));
  const seed = hashSeed(`${normalizedMarket}-${normalizedDate}-${setup}-${session}`);
  const rand = mulberry32(seed);
  const base = marketBasePrice[normalizedMarket] + Math.floor(rand() * 700 - 260);
  const candles: ReplayCandle[] = [];
  const startHour = session.includes("PM") ? 13 : 9;
  const startMinute = session.includes("PM") ? 0 : 30;
  let previousClose = roundToTick(base + (rand() - 0.5) * 44, normalizedMarket);

  const startTotalMinutes = startHour * 60 + startMinute;
  const candleCount = Math.max(1, Math.floor((16 * 60 - startTotalMinutes) / 5));
  for (let index = 0; index < candleCount; index += 1) {
    const phase = index / Math.max(1, candleCount - 1);
    const setupBias = setup.toLowerCase().includes("rejection")
      ? Math.sin((phase + 0.18) * Math.PI * 2.2) * -8
      : setup.toLowerCase().includes("reclaim")
        ? Math.sin((phase - 0.12) * Math.PI * 2) * 9
        : Math.sin(phase * Math.PI * 2) * 3;
    const drift = (rand() - 0.48) * (normalizedMarket.includes("NQ") ? 24 : 6) + setupBias;
    const open = previousClose;
    const close = roundToTick(open + drift, normalizedMarket);
    const wick = Math.abs(rand() - 0.28) * (normalizedMarket.includes("NQ") ? 18 : 5) + 1;
    const high = roundToTick(Math.max(open, close) + wick * (0.45 + rand()), normalizedMarket);
    const low = roundToTick(Math.min(open, close) - wick * (0.45 + rand()), normalizedMarket);
    candles.push({
      index,
      time: candleTime(normalizedDate, startHour, startMinute + index * 5),
      open,
      high,
      low,
      close,
      volume: Math.round(850 + rand() * 4200 + index * 6),
    });
    previousClose = close;
  }

  const openingRange = candles.slice(0, 6);
  const openingRangeHigh = roundToTick(Math.max(...openingRange.map((candle) => candle.high)), normalizedMarket);
  const openingRangeLow = roundToTick(Math.min(...openingRange.map((candle) => candle.low)), normalizedMarket);
  const vwap = roundToTick(weightedAverage(candles.slice(0, 32)), normalizedMarket);
  const overnightResistance = roundToTick(openingRangeHigh + (normalizedMarket.includes("NQ") ? 24 : 7) + rand() * 12, normalizedMarket);

  return {
    id: `tape-${normalizedMarket}-${normalizedDate}-${slug(setup)}`,
    date: normalizedDate,
    year: normalizedYear,
    market: normalizedMarket,
    setup,
    session,
    candles,
    levels: { openingRangeHigh, openingRangeLow, overnightResistance, vwap },
  };
}

export function createPracticeTrade({
  account,
  tape,
  direction,
  entryIndex,
  entryPrice,
  exitIndex,
  exitPrice,
  contracts,
  rulesFollowed = true,
  mistake = "",
  notes = "",
}: {
  account: PracticeAccount;
  tape: ReplayTape;
  direction: PracticeDirection;
  entryIndex: number;
  entryPrice: number;
  exitIndex: number;
  exitPrice: number;
  contracts?: number;
  rulesFollowed?: boolean;
  mistake?: string;
  notes?: string;
}): PracticeTrade {
  if (exitIndex < entryIndex) {
    throw new RangeError("Practice trade exit cannot precede entry.");
  }
  const safeContracts = Math.max(1, Math.round(finiteOr(contracts, account.contracts)));
  const multiplier = direction === "Long" ? 1 : -1;
  const pnl = roundMoney((exitPrice - entryPrice) * multiplier * pointValues[tape.market] * safeContracts);
  const resultR = round(pnl / account.riskPerTrade);
  const safeEntryIndex = Math.max(0, Math.min(tape.candles.length - 1, entryIndex));
  const safeExitIndex = Math.max(safeEntryIndex, Math.min(tape.candles.length - 1, exitIndex));
  const entryCandle = tape.candles[safeEntryIndex];
  const exitCandle = tape.candles[safeExitIndex];

  return {
    id: `sim-${Date.now()}-${entryIndex}-${exitIndex}`,
    date: tape.date,
    market: tape.market,
    setup: tape.setup,
    session: tape.session,
    direction,
    plannedEntry: roundToTick(entryPrice, tape.market),
    stop: 0,
    target: 0,
    resultR,
    rulesFollowed,
    mistake,
    screenshotUrl: "",
    notes,
    entryIndex: safeEntryIndex,
    exitIndex: safeExitIndex,
    entryTime: entryCandle.time,
    exitTime: exitCandle.time,
    entryPrice: roundToTick(entryPrice, tape.market),
    exitPrice: roundToTick(exitPrice, tape.market),
    contracts: safeContracts,
    pnl,
  };
}

export function calculatePracticeAccountStats(account: PracticeAccount, trades: PracticeTrade[]): PracticeAccountStats {
  const ordered = [...trades].sort((a, b) => a.exitTime.localeCompare(b.exitTime));
  let balance = account.accountSize;
  let peak = balance;
  let maxDrawdown = 0;
  let bestTrade = ordered[0]?.pnl ?? 0;
  let worstTrade = ordered[0]?.pnl ?? 0;
  let netPnl = 0;
  let netR = 0;

  for (const trade of ordered) {
    balance = roundMoney(balance + trade.pnl);
    netPnl = roundMoney(netPnl + trade.pnl);
    netR = round(netR + trade.resultR);
    peak = Math.max(peak, balance);
    maxDrawdown = Math.max(maxDrawdown, roundMoney(peak - balance));
    bestTrade = Math.max(bestTrade, trade.pnl);
    worstTrade = Math.min(worstTrade, trade.pnl);
  }

  const tradeCount = ordered.length;
  const wins = ordered.filter((trade) => trade.pnl > 0).length;
  return {
    balance: roundMoney(account.accountSize + netPnl),
    netPnl,
    tradeCount,
    winRate: tradeCount ? wins / tradeCount : 0,
    avgPnl: tradeCount ? roundMoney(netPnl / tradeCount) : 0,
    avgR: tradeCount ? round(netR / tradeCount) : 0,
    ruleFollowRate: tradeCount ? ordered.filter((trade) => trade.rulesFollowed).length / tradeCount : 1,
    maxDrawdown: roundMoney(maxDrawdown),
    bestTrade: roundMoney(bestTrade),
    worstTrade: roundMoney(worstTrade),
  };
}

export function evaluatePracticeAccountLimits(account: PracticeAccount, trades: PracticeTrade[], activeDate: string): PracticeAccountLimitStatus {
  const dailyPnl = roundMoney(trades
    .filter((trade) => trade.date === activeDate)
    .reduce((sum, trade) => sum + trade.pnl, 0));
  const stats = calculatePracticeAccountStats(account, trades);
  const dailyLossBreached = dailyPnl <= -account.maxDailyLoss;
  const drawdownBreached = stats.maxDrawdown >= account.maxDrawdown;
  return {
    dailyPnl,
    dailyLossBreached,
    drawdownBreached,
    canOpenNewPosition: !dailyLossBreached && !drawdownBreached,
    label: drawdownBreached
      ? "Drawdown limit reached"
      : dailyLossBreached
        ? "Daily loss reached"
        : "Within practice limits",
  };
}

export function hasPracticeAccountConfigurationChanged(current: PracticeAccount, next: PracticeAccount) {
  return current.accountSize !== next.accountSize
    || current.riskPerTrade !== next.riskPerTrade
    || current.maxDailyLoss !== next.maxDailyLoss
    || current.maxDrawdown !== next.maxDrawdown
    || current.market !== next.market
    || current.contracts !== next.contracts;
}

export function practiceTradeToRep(trade: PracticeTrade): PracticeRep {
  return {
    id: trade.id,
    date: trade.date,
    market: trade.market,
    setup: trade.setup,
    session: trade.session,
    direction: trade.direction,
    plannedEntry: trade.entryPrice,
    stop: trade.stop,
    target: trade.target,
    resultR: trade.resultR,
    rulesFollowed: trade.rulesFollowed,
    mistake: trade.mistake,
    screenshotUrl: trade.screenshotUrl,
    notes: trade.notes,
  };
}

export function analyzePracticeReps(reps: PracticeRep[]): PracticeAnalysis {
  const clean = reps.filter((rep) => Number.isFinite(rep.resultR));
  const totalReps = clean.length;
  const netR = round(clean.reduce((sum, rep) => sum + rep.resultR, 0));
  const avgR = totalReps ? round(netR / totalReps) : 0;
  const wins = clean.filter((rep) => rep.resultR > 0).length;
  const winRate = totalReps ? wins / totalReps : 0;
  const ruleFollowRate = totalReps ? clean.filter((rep) => rep.rulesFollowed).length / totalReps : 0;
  const bySetup = summarizePracticeBySetup(clean);
  const bestSetup = bySetup[0] ?? null;
  const readiness = buildReadiness(bestSetup, totalReps, ruleFollowRate, avgR);
  const practiceBrief = buildPracticeBrief(bestSetup, readiness);

  return {
    totalReps,
    avgR,
    netR,
    winRate,
    ruleFollowRate,
    bestSetup,
    bySetup,
    readiness,
    practiceBrief,
  };
}

function summarizePracticeBySetup(reps: PracticeRep[]): SetupPracticeSummary[] {
  const groups = new Map<string, PracticeRep[]>();
  for (const rep of reps) {
    const key = rep.setup.trim() || "Untitled setup";
    groups.set(key, [...groups.get(key) ?? [], rep]);
  }

  return [...groups.entries()].map(([setup, items]) => {
    const sampleSize = items.length;
    const netR = round(items.reduce((sum, rep) => sum + rep.resultR, 0));
    const avgR = sampleSize ? round(netR / sampleSize) : 0;
    const wins = items.filter((rep) => rep.resultR > 0).length;
    const losses = items.filter((rep) => rep.resultR < 0).length;
    const scratch = sampleSize - wins - losses;
    const ruleFollowRate = sampleSize ? items.filter((rep) => rep.rulesFollowed).length / sampleSize : 0;
    const winRate = sampleSize ? wins / sampleSize : 0;
    const leak = mostCommonMistake(items);
    const sampleWeight = Math.min(1, sampleSize / 20);
    const score = round(avgR * (0.72 + sampleWeight * 0.28) + ruleFollowRate * 0.18 + Math.min(0.12, sampleSize / 100));
    return { setup, sampleSize, wins, losses, scratch, winRate, avgR, netR, ruleFollowRate, leak, score };
  }).sort((a, b) => b.score - a.score || b.sampleSize - a.sampleSize || b.avgR - a.avgR);
}

function mostCommonMistake(reps: PracticeRep[]) {
  const counts = new Map<string, number>();
  for (const rep of reps) {
    const mistake = rep.mistake.trim();
    if (!mistake) continue;
    counts.set(mistake, (counts.get(mistake) ?? 0) + 1);
  }
  const [mistake] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return mistake ?? "No repeated leak logged yet";
}

function buildReadiness(bestSetup: SetupPracticeSummary | null, totalReps: number, ruleFollowRate: number, avgR: number): PracticeReadiness {
  if (!totalReps || !bestSetup) {
    return {
      label: "No practice sample",
      tone: "empty",
      summary: "Log simulator reps before Cova can summarize a practice sample.",
    };
  }

  if (bestSetup.sampleSize >= 20 && bestSetup.avgR >= 0.3 && bestSetup.ruleFollowRate >= 0.8) {
    return {
      label: "Practice sample ready",
      tone: "ready",
      summary: `${bestSetup.setup} has enough clean simulator reps to treat the practice sample as mature.`,
    };
  }

  if (bestSetup.sampleSize >= 10 && bestSetup.avgR > 0 && bestSetup.ruleFollowRate >= 0.7) {
    return {
      label: "Building consistency",
      tone: "building",
      summary: `${bestSetup.setup} is improving, but still needs more clean simulator reps.`,
    };
  }

  const blocker = ruleFollowRate < 0.7 || avgR <= 0 ? "rule discipline and expectancy" : "sample size";
  return {
    label: "Practice only",
    tone: "locked",
    summary: `Keep this in replay until ${blocker} are stronger.`,
  };
}

function buildPracticeBrief(bestSetup: SetupPracticeSummary | null, readiness: PracticeReadiness) {
  if (!bestSetup) {
    return "Start with 10 replay reps of one setup. Do not mix setups until the first sample exists.";
  }

  if (readiness.tone === "ready") {
    return `${bestSetup.setup} is the cleanest practiced setup. Next drill: protect the same entry rules for 10 more reps before increasing size.`;
  }

  if (bestSetup.leak !== "No repeated leak logged yet") {
    return `${bestSetup.setup} is the next practice focus. Fix the leak: ${bestSetup.leak}.`;
  }

  return `${bestSetup.setup} is the next practice focus. Build the sample to 20 reps before treating the simulator result as mature.`;
}

function normalizeMarket(value: unknown): PracticeMarket {
  return value === "MNQ" || value === "ES" || value === "MES" || value === "NQ" ? value : "NQ";
}

function normalizeDate(date: string, year?: number) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return year ? `${year}${date.slice(4)}` : date;
  }
  const safeYear = year ?? new Date().getFullYear();
  return `${safeYear}-03-14`;
}

function candleTime(date: string, hour: number, minute: number) {
  const totalMinutes = hour * 60 + minute;
  const safeHour = Math.floor(totalMinutes / 60);
  const safeMinute = totalMinutes % 60;
  return `${date} ${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function weightedAverage(candles: ReplayCandle[]) {
  const totals = candles.reduce((acc, candle) => {
    const typical = (candle.high + candle.low + candle.close) / 3;
    acc.priceVolume += typical * candle.volume;
    acc.volume += candle.volume;
    return acc;
  }, { priceVolume: 0, volume: 0 });
  return totals.volume ? totals.priceVolume / totals.volume : candles[0]?.close ?? 0;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "setup";
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function roundToTick(value: number, market: PracticeMarket) {
  const tick = market.includes("NQ") ? 0.25 : 0.25;
  return Math.round(value / tick) * tick;
}

function finiteOr(value: unknown, fallback: number) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
