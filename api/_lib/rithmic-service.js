import { createHmac, randomUUID } from "node:crypto";

const MAX_TRADES = 5_000;
const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 3_500_000;
const MAX_STATUS_BYTES = 16_384;

function configuredUrl(value, { allowLocal = process.env.NODE_ENV !== "production" } = {}) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("Rithmic connector is not configured.");
  }
  const local = ["127.0.0.1", "localhost"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(allowLocal && local && url.protocol === "http:"))
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname.replace(/\/$/, "") !== "/api/sync") {
    throw new Error("Rithmic connector is not configured.");
  }
  return url.toString();
}

function cleanString(value, max = 256) {
  return typeof value === "string" && value.length <= max ? value : null;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function cleanAccount(value) {
  if (!value || typeof value !== "object") return null;
  const accountKey = cleanString(value.accountKey, 64);
  const accountId = cleanString(value.accountId, 128);
  const accountName = cleanString(value.accountName, 128);
  const currency = cleanString(value.currency, 16);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(accountKey || "") || !accountId || accountName === null || !currency) return null;
  return {
    accountKey,
    accountId,
    accountName,
    currency,
  };
}

function cleanTrade(value, account) {
  if (!value || typeof value !== "object" || !account) return null;
  const sideValue = value.side ?? value.direction;
  const side = sideValue === "Short" ? "Short" : sideValue === "Long" ? "Long" : "";
  const id = cleanString(value.id, 80);
  const date = cleanString(value.date, 10);
  const market = cleanString(value.market, 80);
  const accountKey = cleanString(value.source?.accountKey, 64);
  const accountId = cleanString(value.source?.accountId, 128);
  const currency = cleanString(value.currency, 16);
  const entry = finiteNumber(value.entry);
  const exit = finiteNumber(value.exit);
  const contracts = finiteNumber(value.contracts);
  const pnl = finiteNumber(value.pnl);
  const risk = finiteNumber(value.risk);
  const setup = cleanString(value.setup, 120);
  const notes = cleanString(value.notes, 500);
  if (!id || !validDate(date) || !market || !side || setup === null || notes === null
    || !Number.isSafeInteger(contracts) || contracts <= 0
    || entry === null || entry <= 0 || exit === null || exit <= 0
    || pnl === null || risk === null || risk < 0
    || value.source?.provider !== "Rithmic"
    || accountKey !== account.accountKey
    || accountId !== account.accountId
    || currency !== account.currency
    || value.source?.currency !== account.currency) return null;
  return {
    id,
    date,
    market,
    side,
    entry,
    exit,
    contracts,
    pnl,
    currency,
    setup,
    risk,
    notes,
    source: { provider: "Rithmic", accountKey, accountId, currency },
  };
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function tradesToCsv(trades) {
  const header = ["date", "market", "side", "contracts", "entry", "exit", "pnl", "risk", "setup", "notes", "source_provider", "source_account_key", "source_account_id", "source_currency", "source_trade_id"];
  const rows = trades.map((trade) => [trade.date, trade.market, trade.side, trade.contracts, trade.entry, trade.exit, trade.pnl, trade.risk, trade.setup, trade.notes, trade.source.provider, trade.source.accountKey, trade.source.accountId, trade.source.currency, trade.id]
    .map(escapeCsv).join(","));
  return [header.join(","), ...rows].join("\n");
}

function cleanResult(value) {
  if (!value || value.provider !== "Rithmic" || !Array.isArray(value.trades)) {
    throw new Error("Rithmic sync is temporarily unavailable.");
  }
  if (value.trades.length > MAX_TRADES || (Array.isArray(value.missingPointValues) && value.missingPointValues.length)) {
    throw new Error("Rithmic sync result is too large to import safely.");
  }
  const account = cleanAccount(value.account);
  const rawAccounts = Array.isArray(value.accounts) ? value.accounts : [];
  if (rawAccounts.length > 100) throw new Error("Rithmic sync is temporarily unavailable.");
  const accounts = rawAccounts.map(cleanAccount).filter(Boolean);
  const accountKeys = accounts.map((candidate) => candidate.accountKey);
  if (accounts.length !== rawAccounts.length || new Set(accountKeys).size !== accounts.length) throw new Error("Rithmic sync is temporarily unavailable.");
  const trades = value.trades.map((trade) => cleanTrade(trade, account)).filter(Boolean);
  const ids = trades.map((trade) => trade.id);
  if (trades.length !== value.trades.length || new Set(ids).size !== ids.length) throw new Error("Rithmic sync is temporarily unavailable.");
  const reportedTrades = cleanCount(value.counts?.trades);
  const reportedAccounts = cleanCount(value.counts?.accounts);
  const rawFills = cleanCount(value.counts?.rawFills);
  const uniqueFills = cleanCount(value.counts?.uniqueFills);
  const historyWindows = cleanCount(value.counts?.historyWindows);
  if (reportedTrades !== trades.length || reportedAccounts !== accounts.length
    || rawFills === null || uniqueFills === null || historyWindows === null
    || uniqueFills > rawFills || historyWindows > 13) throw new Error("Rithmic sync is temporarily unavailable.");
  if (value.selectionRequired === true && (account || trades.length || accounts.length < 2)) throw new Error("Rithmic sync is temporarily unavailable.");
  if (value.selectionRequired !== true && !account) throw new Error("Rithmic sync is temporarily unavailable.");
  if (account && !accounts.some((candidate) => candidate.accountKey === account.accountKey
    && candidate.accountId === account.accountId
    && candidate.currency === account.currency)) throw new Error("Rithmic sync is temporarily unavailable.");
  const csv = tradesToCsv(trades);
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES
    || Buffer.byteLength(JSON.stringify({ trades, csv }), "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("Rithmic sync result is too large to import safely.");
  }
  return {
    provider: "Rithmic",
    mode: value.mode === "user-triggered-read-only" ? value.mode : "user-triggered-read-only",
    selectionRequired: value.selectionRequired === true,
    account,
    accounts,
    trades,
    csv,
    counts: {
      rawFills,
      uniqueFills,
      trades: trades.length,
      accounts: accounts.length,
      historyWindows,
    },
    missingPointValues: [],
  };
}

async function readBoundedJson(response, maxBytes) {
  const declared = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Rithmic sync result is too large to import safely.");
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error("Rithmic sync is temporarily unavailable.");
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Rithmic sync result is too large to import safely.");
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
  } catch {
    throw new Error("Rithmic sync is temporarily unavailable.");
  }
}

export function createRithmicServiceRequest(payload, { secret, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Rithmic connector is not configured.");
  const body = JSON.stringify({ requestId: payload.requestId || randomUUID(), ...payload });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-cova-signature": `v1=${signature}`,
      "x-cova-timestamp": String(timestamp),
    },
  };
}

export async function requestRithmicStatus(options = {}) {
  const connectorUrl = configuredUrl(options.connectorUrl ?? process.env.RITHMIC_CONNECTOR_URL, { allowLocal: options.allowLocal });
  const secret = options.secret ?? process.env.COVA_RITHMIC_SERVICE_SECRET;
  const signed = createRithmicServiceRequest({ operation: "status" }, { secret, timestamp: options.timestamp });
  const fetchImpl = options.fetchImpl || fetch;
  let response;
  try {
    response = await fetchImpl(connectorUrl, {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
      redirect: "error",
      signal: options.signal || AbortSignal.timeout(5_000),
    });
  } catch {
    return { available: false, environment: "Rithmic Test" };
  }
  if (!response.ok) return { available: false, environment: "Rithmic Test" };
  try {
    const body = await readBoundedJson(response, MAX_STATUS_BYTES);
    return {
      available: body?.ok === true && body?.data?.available === true && body?.data?.environment === "Rithmic Test",
      environment: "Rithmic Test",
    };
  } catch {
    return { available: false, environment: "Rithmic Test" };
  }
}

export async function requestRithmicSync(payload, options = {}) {
  const connectorUrl = configuredUrl(options.connectorUrl ?? process.env.RITHMIC_CONNECTOR_URL, { allowLocal: options.allowLocal });
  const secret = options.secret ?? process.env.COVA_RITHMIC_SERVICE_SECRET;
  const signed = createRithmicServiceRequest(payload, { secret, timestamp: options.timestamp });
  const fetchImpl = options.fetchImpl || fetch;
  let response;
  try {
    response = await fetchImpl(connectorUrl, {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
      redirect: "error",
      signal: options.signal || AbortSignal.timeout(250_000),
    });
  } catch {
    throw new Error("Rithmic sync is temporarily unavailable.");
  }
  if (!response.ok) throw new Error("Rithmic sync is temporarily unavailable.");
  let body;
  try {
    body = await readBoundedJson(response, MAX_RESPONSE_BYTES);
  } catch {
    throw new Error("Rithmic sync is temporarily unavailable.");
  }
  if (!body?.ok) throw new Error("Rithmic sync is temporarily unavailable.");
  return cleanResult(body.data);
}
