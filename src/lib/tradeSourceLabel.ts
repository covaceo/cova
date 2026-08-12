import type { BrokerStatus } from "./brokerStatus";
import type { Trade } from "./risk";

export function getTradeSourceLabel(trades: Trade[]) {
  const hasSampleTrades = trades.some((trade) => trade.id.startsWith("demo-"));
  const hasRithmicTrades = trades.some((trade) => trade.source?.provider === "Rithmic");
  const hasTradovateTrades = trades.some((trade) => trade.source?.provider === "Tradovate");
  const hasImportedTrades = trades.some((trade) => !trade.source?.provider && !trade.id.startsWith("demo-"));
  const sourceLabels = [
    hasSampleTrades ? "Sample" : null,
    hasRithmicTrades ? "Rithmic" : null,
    hasTradovateTrades ? "Tradovate" : null,
    hasImportedTrades ? "CSV" : null,
  ].filter((label): label is string => Boolean(label));
  if (!sourceLabels.length) return "No trade history";

  const singleSourceLabels: Record<string, string> = {
    Sample: "Sample review",
    Rithmic: "Rithmic history",
    Tradovate: "Tradovate history",
    CSV: "Imported CSV review",
  };
  if (sourceLabels.length === 1) return singleSourceLabels[sourceLabels[0]];
  return `${sourceLabels.join(" + ")} review`;
}

export function getAccountSourceLabel(trades: Trade[], brokerStatus: Pick<BrokerStatus, "provider" | "connected"> | null) {
  if (brokerStatus?.connected) return `${brokerStatus.provider} linked`;
  return getTradeSourceLabel(trades);
}
