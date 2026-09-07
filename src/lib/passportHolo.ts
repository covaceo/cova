import { analyze, formatMoney } from "./risk";

export type HoloPassportMode = "flex" | "discipline" | "private" | "coach";
export type HoloPassportModel = {
  mode: HoloPassportMode;
  modeLabel: string;
  identity: string;
  rank: string;
  marketLine: string;
  heroValue: string;
  heroLabel: string;
  support: string[];
  ruleSummary: string;
  provenance: string;
  sample: boolean;
};

export function buildHoloPassportModel(analysis: ReturnType<typeof analyze>, rank: string, mode: HoloPassportMode, sample: boolean): HoloPassportModel {
  const held = analysis.ruleStatuses.filter(status => !status.breached).length;
  const count = analysis.ruleStatuses.length;
  const reviewId = `COVA-${analysis.latestDate.replace(/-/g, "").slice(2)}-${analysis.score}${held}`;
  const number = reviewId.replace(/\D/g, "").slice(-4).padStart(4, "0");
  const markets = [...new Set(analysis.trades.map(trade => trade.market).filter(Boolean))].slice(0, 2).join(" / ");
  const ruleSummary = count ? `${held}/${count} rules held` : "Rules not checked";
  const flags = `${analysis.breaches.length} flag${analysis.breaches.length === 1 ? "" : "s"}`;
  const model: HoloPassportModel = {
    mode, modeLabel: "Flex", identity: `Trader ${number}`, rank, ruleSummary,
    marketLine: `${markets ? `${markets} · ` : ""}${analysis.trades.length} reviewed trades`,
    heroValue: `${analysis.totalPnl > 0 ? "+" : ""}${formatMoney(analysis.totalPnl)}`,
    heroLabel: "Reported P&L",
    support: [`${ruleSummary} · ${analysis.profitFactor.toFixed(2)} profit factor · ${flags}`],
    provenance: `${sample ? "Sample" : "User-supplied"} data · Not account verified`, sample,
  };
  if (mode === "discipline") return {
    ...model, modeLabel: "Discipline", heroValue: count ? String(analysis.score) : "—", heroLabel: "Control score",
    support: [`${ruleSummary} · ${analysis.avgR.toFixed(2)}R average`, `${formatMoney(Math.round(analysis.maxDrawdown))} max drawdown · ${flags}`],
  };
  if (mode === "private") return {
    ...model, modeLabel: "Ghost", identity: "Private profile", marketLine: `${analysis.trades.length} reviewed trades`,
    heroValue: Number.isFinite(analysis.score) ? `${Math.floor(analysis.score / 10) * 10}+` : "—", heroLabel: "Score range",
    support: [`${ruleSummary} · ${analysis.evidenceQuality.label} sample`, `Reviewed ${analysis.latestDate} · Sensitive stats omitted`],
  };
  if (mode === "coach") {
    const warning = analysis.behaviorFlags.find(flag => flag.severity === "critical" || flag.severity === "warning")?.label
      ?? analysis.breaches[0]?.rule.name ?? "No major leak";
    return {
      ...model, modeLabel: "Coach", heroValue: count ? String(analysis.score) : "—", heroLabel: "Control score",
      support: [`${flags} · ${analysis.profitFactor.toFixed(2)} profit factor · ${analysis.avgR.toFixed(2)}R average`, `Top warning: ${warning}`],
    };
  }
  return model;
}
