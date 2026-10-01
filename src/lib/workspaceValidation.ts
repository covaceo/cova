// New boundary validation. Cloud rows are data, never broker authorization proof.
import type { Trade, RiskRule } from "./risk";
import { tradeAccountKey } from "./tradovateHistory";
import type {
  WorkspaceValue,
  WorkspaceRecord,
  WorkspaceWrite,
} from "./workspaceModel";
export const WORKSPACE_DISCLOSURE = "workspace-cloud-v1";
export const uuid = (x: unknown): x is string =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    x,
  );
const object = (x: unknown): x is Record<string, any> =>
  !!x &&
  typeof x === "object" &&
  !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;
const text = (x: unknown, max: number, min = 0): x is string =>
  typeof x === "string" && x.length >= min && x.length <= max;
const finite = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1e14;
const exact = (x: Record<string, any>, keys: string[]) =>
  Object.keys(x).every((k) => keys.includes(k));
export const account = (x: unknown): x is string =>
  text(x, 240, 1) &&
  (x === "local" ||
    x === "all" ||
    /^Tradovate:[1-9]\d{0,15}$/.test(x) ||
    /^Rithmic:[A-Za-z0-9_-]{20,64}:[^\x00-\x1f]{1,128}$/.test(x));
export const date = (x: unknown): x is string =>
  typeof x === "string" &&
  /^20\d\d-\d\d-\d\d$/.test(x) &&
  Number.isFinite(Date.parse(x + "T00:00:00Z")) &&
  new Date(x + "T00:00:00Z").toISOString().slice(0, 10) === x;
export function validTrade(t: unknown): t is Trade {
  if (
    !object(t) ||
    !exact(t, [
      "id",
      "date",
      "market",
      "side",
      "contracts",
      "entry",
      "exit",
      "pnl",
      "risk",
      "riskStatus",
      "setup",
      "notes",
      "manual",
      "source",
    ]) ||
    !text(t.id, 240, 1) ||
    t.id.startsWith("demo-") ||
    !text(t.date, 40, 10) ||
    !date(t.date.slice(0, 10)) ||
    !Number.isFinite(Date.parse(t.date)) ||
    !text(t.market, 80, 1) ||
    !["Long", "Short"].includes(t.side) ||
    !finite(t.contracts) ||
    t.contracts <= 0 ||
    !["entry", "exit", "pnl", "risk"].every((k) => finite(t[k])) ||
    t.risk < 0 ||
    !text(t.setup, 2000) ||
    !text(t.notes, 10000) ||
    (t.riskStatus !== undefined &&
      !["provided", "missing"].includes(t.riskStatus))
  )
    return false;
  if (
    t.manual !== undefined &&
    (!object(t.manual) ||
      !exact(t.manual, ["accountKey", "currency", "pnlBasis"]) ||
      !t.id.startsWith("manual-") ||
      !account(t.manual.accountKey) ||
      t.manual.accountKey === "all" ||
      t.manual.currency !== "USD" ||
      !["gross_before_fees", "reported_net"].includes(t.manual.pnlBasis) ||
      t.source !== undefined)
  )
    return false;
  if (t.source !== undefined) {
    const s = t.source;
    if (!object(s)) return false;
    if (s.provider === "Tradovate") {
      if (
        !exact(s, [
          "provider",
          "accountId",
          "openedAt",
          "closedAt",
          "timeZone",
          "pnlBasis",
        ]) ||
        !/^\d{1,16}$/.test(s.accountId) ||
        !t.id.startsWith("tradovate-" + s.accountId + ":") ||
        (s.pnlBasis !== undefined && s.pnlBasis !== "gross_before_fees") ||
        (s.timeZone !== undefined && s.timeZone !== "UTC") ||
        ["openedAt", "closedAt"].some(
          (k) =>
            s[k] !== undefined &&
            (!text(s[k], 40) || !Number.isFinite(Date.parse(s[k]))),
        )
      )
        return false;
    } else if (s.provider === "Rithmic") {
      if (
        !exact(s, ["provider", "accountKey", "accountId", "currency"]) ||
        !account(`Rithmic:${s.accountKey}:${s.accountId}`) ||
        !text(s.currency, 8, 1)
      )
        return false;
    } else return false;
  }
  return true;
}
export function validRules(r: unknown): r is RiskRule[] {
  return (
    Array.isArray(r) &&
    r.length <= 64 &&
    new Set(r.map((v) => v?.id)).size === r.length &&
    r.every(
      (v) =>
        object(v) &&
        exact(v, ["id", "name", "metric", "limit", "severity", "enabled"]) &&
        text(v.id, 100, 1) &&
        text(v.name, 200, 1) &&
        [
          "maxDailyLoss",
          "maxTradeLoss",
          "maxContracts",
          "maxLossStreak",
          "minProfitFactor",
          "minAvgR",
        ].includes(v.metric) &&
        finite(v.limit) &&
        v.limit >= 0 &&
        ["critical", "warning", "info"].includes(v.severity) &&
        typeof v.enabled === "boolean",
    )
  );
}
export function assertValue(
  v: unknown,
  deleted = false,
): asserts v is WorkspaceValue {
  if (
    !object(v) ||
    !["trade", "rules", "daily_note", "account", "broker_cash"].includes(
      v.kind,
    ) ||
    !text(v.recordId, 240, 1) ||
    !account(v.accountId) ||
    v.schemaVersion !== 1 ||
    !object(v.payload) ||
    JSON.stringify(v.payload).length > 2100000
  )
    throw Error("Invalid workspace record.");
  if (deleted) {
    if (Object.keys(v.payload).length)
      throw Error("Deletion payload must be empty.");
    return;
  }
  const p = v.payload;
  let valid = false;
  if (v.kind === "trade")
    valid =
      validTrade(p) &&
      p.id === v.recordId &&
      tradeAccountKey(p) === v.accountId;
  if (v.kind === "rules")
    valid =
      v.recordId === "current" &&
      v.accountId === "all" &&
      exact(p, ["rules"]) &&
      validRules(p.rules);
  if (v.kind === "daily_note")
    valid =
      exact(p, ["date", "note", "tradeId"]) &&
      date(p.date) &&
      text(p.note, 2000) &&
      (p.tradeId === null || text(p.tradeId, 240, 1)) &&
      v.recordId === JSON.stringify([v.accountId, p.date]);
  if (v.kind === "account")
    valid =
      v.accountId !== "all" &&
      v.recordId === v.accountId &&
      exact(p, ["name"]) &&
      text(p.name, 128, 1) &&
      !/[\x00-\x1f\x7f]/.test(p.name);
  // Cash is intentionally not uploaded by the new candidate. Existing cloud cash
  // stays opaque and is never used to mint a broker freshness receipt.
  if (v.kind === "broker_cash")
    valid =
      exact(p, ["cash", "fingerprint"]) &&
      object(p.cash) &&
      text(p.fingerprint, 2000000) &&
      v.recordId === v.accountId &&
      v.accountId.startsWith("Tradovate:");
  if (!valid)
    throw Error(
      "Unsupported or invalid workspace payload. Original data is retained.",
    );
}
export function assertWrites(
  rows: unknown,
  maximum = 500,
): asserts rows is WorkspaceWrite[] {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > maximum)
    throw Error("Invalid number of workspace changes.");
  const seen = new Set();
  for (const r of rows) {
    assertValue(r, !!r?.deleted);
    if (
      !exact(r, [
        "kind",
        "recordId",
        "accountId",
        "schemaVersion",
        "payload",
        "expectedRevision",
        "deleted",
      ]) ||
      !Number.isSafeInteger((r as any).expectedRevision) ||
      (r as any).expectedRevision < 0 ||
      typeof (r as any).deleted !== "boolean" ||
      (r.kind === "broker_cash" && !(r as any).deleted)
    )
      throw Error("Invalid workspace change.");
    const k = JSON.stringify([r.kind, r.recordId]);
    if (seen.has(k)) throw Error("Duplicate workspace change.");
    seen.add(k);
  }
}
export function assertRecords(
  rows: unknown,
): asserts rows is WorkspaceRecord[] {
  if (!Array.isArray(rows) || rows.length > 100000)
    throw Error("Workspace snapshot is too large.");
  const seen = new Set();
  for (const r of rows) {
    assertValue(r, !!r?.deletedAt);
    if (
      !exact(r, [
        "kind",
        "recordId",
        "accountId",
        "schemaVersion",
        "payload",
        "revision",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]) ||
      !Number.isSafeInteger((r as any).revision) ||
      (r as any).revision < 1 ||
      ![(r as any).createdAt, (r as any).updatedAt].every(
        (x) => typeof x === "string" && Number.isFinite(Date.parse(x)),
      ) ||
      ((r as any).deletedAt !== null &&
        (typeof (r as any).deletedAt !== "string" ||
          !Number.isFinite(Date.parse((r as any).deletedAt))))
    )
      throw Error("Invalid workspace snapshot.");
    const k = JSON.stringify([r.kind, r.recordId]);
    if (seen.has(k)) throw Error("Duplicate workspace identity.");
    seen.add(k);
  }
}
