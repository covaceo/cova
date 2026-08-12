export type DashboardReviewTarget = "import" | "rules" | "coach" | "passport";

type DashboardReviewState = {
  behaviorFlags: { severity: "info" | "warning" | "critical" | "positive" }[];
  breaches: unknown[];
  evidenceQuality: { level: string };
  nextSessionBrief: { status: "ready" | "caution" | "locked" };
  trades: unknown[];
};

export function getActionableReviewCount(analysis: DashboardReviewState) {
  if (!analysis.trades.length) return 0;
  if (analysis.breaches.length) return analysis.breaches.length;
  const behaviorWarnings = analysis.behaviorFlags.filter((flag) => flag.severity === "warning" || flag.severity === "critical").length;
  if (behaviorWarnings) return behaviorWarnings;
  return analysis.nextSessionBrief.status === "ready" ? 0 : 1;
}

export function getDashboardSummaryAction(analysis: DashboardReviewState): { label: string; target: DashboardReviewTarget } {
  if (!analysis.trades.length) return { label: "Add trade history", target: "import" };
  if (analysis.breaches.length) return { label: "Review warnings", target: "rules" };
  if (getActionableReviewCount(analysis)) return { label: "Review warnings", target: "coach" };
  if (analysis.evidenceQuality.level !== "high") return { label: "Add more trades", target: "import" };
  return { label: "Open Passport", target: "passport" };
}
