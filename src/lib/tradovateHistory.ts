import { parseCsvDetailed, type Trade } from "./risk";

export type HistoryAccount = { account: { id: string; name: string }; status: "ready" | "empty" | "failed" | "deferred"; csv?: string; counts?: { trades: number }; trades?: Trade[]; reason?: string; cash?: unknown };
const HISTORY_HEADER = "date,market,side,contracts,entry,exit,pnl,risk,setup,notes,sourceProvider,sourceAccountId,sourceTradeId,sourceOpenedAt,sourceClosedAt,sourceTimeZone,sourcePnlBasis";
const POINTS: Record<string, number> = { NQ: 20, MNQ: 2, ES: 50, MES: 5, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, CL: 1000, MCL: 100, GC: 100, MGC: 10, SI: 5000, SIL: 1000, HG: 25000, ZB: 1000, ZN: 1000, ZF: 1000, ZT: 1000 };
export function recentHistoryWindow(now = new Date()) {
  const end = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`) + 86400000;
  return { startDate: new Date(end - 30 * 86400000).toISOString().slice(0, 10), endDate: new Date(end).toISOString().slice(0, 10) };
}
export function tradeAccountKey(trade: Trade) {
  return trade.source?.provider === "Rithmic" ? `Rithmic:${trade.source.accountKey}:${trade.source.accountId}` : trade.source ? `Tradovate:${trade.source.accountId}` : "local";
}
export function filterTradeAccount(trades: Trade[], selected: string) {
  return selected === "all" ? trades : trades.filter(trade => tradeAccountKey(trade) === selected);
}
export class HistoryRunGuard {
  private controller: AbortController | null = null;
  start() {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    return { signal: controller.signal, isCurrent: () => this.controller === controller && !controller.signal.aborted };
  }
  cancel() { this.controller?.abort(); this.controller = null; }
}

// Capture the committed selection event, not a render closure or its final value.
export class HistorySelectionEpoch {
  private epoch = 0;
  change() { this.epoch++; }
  capture() { const epoch = this.epoch; return () => epoch === this.epoch; }
}

type HistorySummary = { accounts: HistoryAccount[]; notice: string; outcome: "running" | "complete" | "partial" | "failed"; attempted: string[] };
const summaries = new Map<string, HistorySummary>();
const summaryKey = (owner: string, connection: string) => `cova-history-summary:${JSON.stringify([owner, connection])}`;
export function readHistorySummary(owner: string, connection: string): HistorySummary | null {
  const key = summaryKey(owner, connection);
  if (summaries.has(key)) return summaries.get(key)!;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 131072) return null;
    const value = JSON.parse(raw) as HistorySummary;
    if (!Array.isArray(value.accounts) || value.accounts.length > 256 || !Array.isArray(value.attempted) || !value.attempted.every(item => typeof item === "string") || typeof value.notice !== "string" || !["running", "complete", "partial", "failed"].includes(value.outcome)) return null;
    if (value.accounts.some(item => !item?.account || typeof item.account.id !== "string" || typeof item.account.name !== "string" || !["ready", "empty", "failed", "deferred"].includes(item.status))) return null;
    return value;
  } catch { return null; }
}
export function saveHistorySummary(owner: string, connection: string, summary: HistorySummary) {
  const key = summaryKey(owner, connection);
  const value = { ...summary, attempted: summary.attempted.slice(-128), accounts: summary.accounts.map(({ account, status, counts }) => ({ account, status, ...(counts ? { counts } : {}) })) };
  summaries.set(key, value);
  if (summaries.size > 32) summaries.delete(summaries.keys().next().value!);
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* memory fallback: no report data retained */ }
}

export async function fetchHistoryJson(fetcher: (input: string, init?: RequestInit) => Promise<Response>, url: string, signal: AbortSignal, timeoutMs = 30000, maxBytes = 2097152): Promise<unknown> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  let abort = () => {};
  const stopped = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new DOMException("History import canceled.", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new Error("Tradovate history timed out. Saved trades are unchanged; retry manually.")); }, timeoutMs);
    if (signal.aborted) abort();
  });
  const read = async () => {
    const response = await fetcher(url, { signal: controller.signal });
    if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Tradovate history is unreachable. Saved trades are unchanged.");
    if (Number(response.headers.get("content-length")) > maxBytes || !response.body) throw new Error("Tradovate history exceeded the safe import limit.");
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0, text = "";
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw new Error("Tradovate history exceeded the safe import limit.");
      text += decoder.decode(part.value, { stream: true });
    }
    const data = JSON.parse(text + decoder.decode());
    const code = data?.status || data?.error;
    if (code === "unsupported_environment") throw new Error("Automatic history currently supports Tradovate Simulation only. Saved trades are unchanged.");
    if (code === "timeout") throw new Error("Tradovate history timed out. Retry manually.");
    if (response.status === 429) throw new Error("Too many sync attempts. Wait a minute and retry.");
    if (response.status === 401 || response.status === 409) throw new Error("Tradovate connection expired or changed. Check the connection or reconnect.");
    if (!response.ok || ["provider_error", "provider_rejected", "network_or_redirect"].includes(code)) throw new Error("Tradovate rejected the history request. Saved trades are unchanged; retry or reconnect.");
    return data;
  };
  try { return await Promise.race([read(), stopped]); }
  finally { clearTimeout(timer!); signal.removeEventListener("abort", abort); controller.abort(); void reader?.cancel().catch(() => undefined); }
}

export function validateTradovateHistory(value: unknown, selectedAccount = "") {
  const fail = (): never => { throw new Error("Tradovate history was inconsistent. Nothing was imported."); };
  if (!value || typeof value !== "object") return fail();
  const data = value as { status?: string; coverage?: string; provider?: string; pnlBasis?: string; accounts?: HistoryAccount[]; window?: { startDate: string; endDate: string; timeZone: string; timezoneOffset: number } };
  if (data.status !== "history_ready" || data.coverage !== "bounded_matched_fill_pairs" || data.provider !== "Tradovate" || data.pnlBasis !== "gross_before_fees" || data.window?.timeZone !== "UTC" || data.window.timezoneOffset !== 0 || !Array.isArray(data.accounts) || data.accounts.length > 256) return fail();
  const times = [data.window.startDate, data.window.endDate].map(date => {
    if (typeof date !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) return fail();
    const time = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) return fail();
    return time;
  });
  if (times[1] <= times[0] || times[1] - times[0] > 90 * 86400000) return fail();
  const ids = new Set<string>();
  const trades: Trade[] = [], parts: string[] = [];
  let heading = "", accountId = "";
  for (const item of data.accounts) {
    if (!item?.account || typeof item.account.id !== "string" || !/^[1-9]\d{0,15}$/.test(item.account.id) || ids.has(item.account.id) || typeof item.account.name !== "string" || !item.account.name.trim() || item.account.name.length > 128 || /[\x00-\x1f]/.test(item.account.name) || !["ready", "empty", "failed", "deferred"].includes(item.status)) return fail();
    ids.add(item.account.id);
    if (selectedAccount && item.account.id !== selectedAccount && item.status !== "deferred") return fail();
    if (item.status === "failed" || item.status === "deferred") { if (item.csv !== undefined || item.trades !== undefined || item.counts !== undefined) return fail(); continue; }
    if (typeof item.csv !== "string" || item.csv.length > 2097152 || !Number.isSafeInteger(item.counts?.trades) || (item.counts?.trades ?? -1) < 0) return fail();
    const [header, ...rows] = item.csv.split(/\r?\n/);
    if (header !== HISTORY_HEADER || !Array.isArray(item.trades) || item.trades.length !== item.counts?.trades || rows.length !== item.counts?.trades) return fail();
    for (const row of rows) {
      const fields = row.split(",");
      if (fields.length !== 17 || !["Long", "Short"].includes(fields[2]) || fields[7] !== "0" || fields[8] !== "Imported" || fields[9] !== "" || fields[10] !== "Tradovate" || fields[15] !== "UTC" || fields[16] !== "gross_before_fees") return fail();
      if (![3, 4, 5, 6].every(index => /^-?\d+(?:\.\d+)?$/.test(fields[index]) && Number.isFinite(Number(fields[index])) && Math.abs(Number(fields[index])) <= 1e12)) return fail();
      if (fields[0] !== fields[14] || !Object.prototype.hasOwnProperty.call(POINTS, fields[1])) return fail();
    }
    const parsed = parseCsvDetailed(item.csv);
    if (parsed.issues.length || parsed.trades.length !== item.counts?.trades || parsed.trades.length > 5000 || (item.status === "ready") !== (parsed.trades.length > 0)) return fail();
    for (const [index, trade] of parsed.trades.entries()) {
      const pair = /^tradovate-([1-9]\d{0,15}):([1-9]\d{0,19}):([1-9]\d{0,19})$/.exec(trade.id);
      if (trade.source?.provider !== "Tradovate" || trade.source.accountId !== item.account.id || !pair || pair[1] !== item.account.id || pair[2] === pair[3] || !trade.source.openedAt || !trade.source.closedAt || trade.source.timeZone !== "UTC" || trade.source.pnlBasis !== "gross_before_fees" || !Number.isFinite(trade.pnl) || !Number.isSafeInteger(trade.contracts) || trade.contracts <= 0 || trade.contracts > 100000 || trade.risk !== 0 || trade.date < data.window.startDate || trade.date >= data.window.endDate) return fail();
      const expected = Math.round((trade.exit - trade.entry) * (trade.side === "Long" ? 1 : -1) * trade.contracts * POINTS[trade.market] * 100) / 100;
      if (Math.abs(expected - trade.pnl) > 0.005) return fail();
      const server = item.trades[index];
      if (!server || server.date !== trade.source.closedAt || ["id", "market", "side", "contracts", "entry", "exit", "pnl", "risk", "setup", "notes"].some(key => server[key as keyof Trade] !== trade[key as keyof Trade]) || JSON.stringify(server.source) !== JSON.stringify(trade.source)) return fail();
    }
    if (heading && header !== heading) return fail();
    heading = header;
    if (parsed.trades.length && !accountId) accountId = item.account.id;
    parts.push(...rows.filter(Boolean)); trades.push(...parsed.trades);
  }
  if (selectedAccount && !ids.has(selectedAccount) || data.accounts.filter(item => item.status !== "deferred").length > 4 || new Set(trades.map(trade => trade.id)).size !== trades.length || trades.length > 20000) return fail();
  return { csv: [heading, ...parts].join("\n"), trades, count: trades.length, accountId, accounts: data.accounts, window: data.window };
}
