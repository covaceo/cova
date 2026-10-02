import type { WorkspaceRecord } from "./workspaceModel";
import type { Trade, RiskRule } from "./risk";
import { assertRecords } from "./workspaceValidation";
import { persistTradingLedger } from "./recapVerification";
const scope = (o: string) => encodeURIComponent(o);
const recoveryKey = (o: string) => "cova-workspace-hydration-v2:" + scope(o);
const keys = (o: string) =>
  [
    "cova-react-risk-os-v2:",
    "cova-workspace-aux-v1:",
    "cova-workspace-cache-v2:",
  ].map((k) => k + scope(o));
const set = (key: string, value: string | null) => {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  if (localStorage.getItem(key) !== value)
    throw Error("Browser storage verification failed.");
};
export function recoverWorkspaceHydration(
  owner: string,
): { trades: Trade[]; rules: RiskRule[] } | null {
  const raw = localStorage.getItem(recoveryKey(owner));
  if (!raw) return null;
  const journal = JSON.parse(raw);
  if (
    journal.owner !== owner ||
    !Array.isArray(journal.previous) ||
    journal.previous.length !== 3 ||
    !journal.previous.every((v: unknown) => v === null || typeof v === "string")
  )
    throw Error(
      "Invalid recovery journal. Preserve this browser and its backups.",
    );
  for (const [i, key] of keys(owner).entries()) set(key, journal.previous[i]);
  localStorage.removeItem(recoveryKey(owner));
  return JSON.parse(journal.previous[0] || '{"trades":[],"rules":[]}');
}
// Verified undo journal precedes any mutation. Interrupted hydration is rolled
// back before the next cloud operation; a cache never silently acknowledges data
// which the browser ledger did not durably receive.
export function commitWorkspaceHydration(
  owner: string,
  records: WorkspaceRecord[],
  fallbackRules: RiskRule[],
) {
  assertRecords(records);
  const names: Record<string, string> = Object.create(null),
    notes: Record<string, Record<string, unknown>> = Object.create(null);
  const active = records.filter((r) => !r.deletedAt);
  const trades = active
    .filter((r) => r.kind === "trade")
    .map((r) => r.payload as unknown as Trade);
  const rules =
    (active.find((r) => r.kind === "rules")?.payload.rules as
      RiskRule[] | undefined) ?? fallbackRules;
  for (const row of active) {
    if (row.kind === "daily_note")
      (notes[row.accountId] ||= Object.create(null))[String(row.payload.date)] =
        { note: row.payload.note, tradeId: row.payload.tradeId };
    if (row.kind === "account") names[row.accountId] = String(row.payload.name);
  }
  const target = keys(owner),
    previous = target.map((k) => localStorage.getItem(k));
  const old = JSON.parse(previous[0] || "{}");
  const value = JSON.stringify({
    trades,
    rules,
    tradeAccount:
      typeof old.tradeAccount === "string" ? old.tradeAccount : "all",
  });
  set(recoveryKey(owner), JSON.stringify({ owner, previous }));
  try {
    if (
      !persistTradingLedger(target[0], value) ||
      localStorage.getItem(target[0]) !== value
    )
      throw Error("Browser ledger could not be saved.");
    set(target[1], JSON.stringify({ version: 1, notes, names, cash: {} }));
    set(target[2], JSON.stringify({ owner, records }));
    localStorage.removeItem(recoveryKey(owner));
  } catch (e) {
    try {
      recoverWorkspaceHydration(owner);
    } catch {
      throw Error(
        "Browser hydration was interrupted. Original copies are in the recovery journal; free storage and reload.",
      );
    }
    throw e;
  }
  window.dispatchEvent(new Event("cova:account-names"));
  window.dispatchEvent(new Event("cova:broker-cash-updated"));
  return { trades, rules };
}
