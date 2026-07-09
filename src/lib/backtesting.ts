export type PracticeDirection = "Long" | "Short";

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
  label: "No practice sample" | "Practice only" | "Building permission" | "Live-size ready";
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
      summary: "Log practice reps before Cova gives live-trading permission.",
    };
  }

  if (bestSetup.sampleSize >= 20 && bestSetup.avgR >= 0.3 && bestSetup.ruleFollowRate >= 0.8) {
    return {
      label: "Live-size ready",
      tone: "ready",
      summary: `${bestSetup.setup} has enough clean reps to consider normal size with your guardrails on.`,
    };
  }

  if (bestSetup.sampleSize >= 10 && bestSetup.avgR > 0 && bestSetup.ruleFollowRate >= 0.7) {
    return {
      label: "Building permission",
      tone: "building",
      summary: `${bestSetup.setup} is improving, but needs more clean reps before full live size.`,
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

  return `${bestSetup.setup} is the next practice focus. Build the sample to 20 reps before calling it live-size ready.`;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
