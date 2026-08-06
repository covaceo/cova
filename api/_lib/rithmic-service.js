import { createHmac, randomUUID } from "node:crypto";

const MAX_TRADES = 5_000;
const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 3_500_000;

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
  return typeof value === "string" ? value.slice(0, max) : "";
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanAccount(value) {
  if (!value || typeof value !== "object") return null;
  const accountId = cleanString(value.accountId, 128);
  if (!accountId) return null;
  return {
    accountId,
    accountName: cleanString(value.accountName, 128),
    currency: cleanString(value.currency, 16),
  };
}

function cleanTrade(value) {
  if (!value || typeof value !== "object") return null;
  const sideValue = value.side ?? value.direction;
  const side = sideValue === "Short" ? "Short" : sideValue === "Long" ? "Long" : "";
  if (!side) return null;
  const id = cleanString(value.id, 80);
  const date = cleanString(value.date, 10);
  const market = cleanString(value.market, 80);
  const accountId = cleanString(value.source?.accountId, 128);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !market || !accountId || value.source?.provider !== "Rithmic") return null;
  return {
    id,
    date,
    market,
    side,
    entry: cleanNumber(value.entry),
    exit: cleanNumber(value.exit),
    contracts: cleanNumber(value.contracts),
    pnl: cleanNumber(value.pnl),
    setup: cleanString(value.setup, 120),
    risk: cleanNumber(value.risk),
    notes: cleanString(value.notes, 500),
    source: { provider: "Rithmic", accountId },
  };
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function tradesToCsv(trades) {
  const header = ["date", "market", "side", "contracts", "entry", "exit", "pnl", "risk", "setup", "notes", "source_provider", "source_account_id", "source_trade_id"];
  const rows = trades.map((trade) => [trade.date, trade.market, trade.side, trade.contracts, trade.entry, trade.exit, trade.pnl, trade.risk, trade.setup, trade.notes, trade.source.provider, trade.source.accountId, trade.id]
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
  const trades = value.trades.map(cleanTrade).filter(Boolean);
  if (trades.length !== value.trades.length) throw new Error("Rithmic sync is temporarily unavailable.");
  const reportedTrades = Number(value.counts?.trades);
  if (Number.isFinite(reportedTrades) && reportedTrades !== trades.length) throw new Error("Rithmic sync is temporarily unavailable.");
  const csv = tradesToCsv(trades);
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES
    || Buffer.byteLength(JSON.stringify({ trades, csv }), "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("Rithmic sync result is too large to import safely.");
  }
  return {
    provider: "Rithmic",
    mode: value.mode === "user-triggered-read-only" ? value.mode : "user-triggered-read-only",
    selectionRequired: value.selectionRequired === true,
    account: cleanAccount(value.account),
    accounts: Array.isArray(value.accounts) ? value.accounts.slice(0, 100).map(cleanAccount).filter(Boolean) : [],
    trades,
    csv,
    counts: {
      rawFills: cleanNumber(value.counts?.rawFills),
      uniqueFills: cleanNumber(value.counts?.uniqueFills),
      trades: trades.length,
      accounts: cleanNumber(value.counts?.accounts),
      historyWindows: cleanNumber(value.counts?.historyWindows),
    },
    missingPointValues: Array.isArray(value.missingPointValues) ? value.missingPointValues.slice(0, 200).map((item) => cleanString(item, 160)) : [],
  };
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
    const body = await response.json();
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
      signal: options.signal || AbortSignal.timeout(50_000),
    });
  } catch {
    throw new Error("Rithmic sync is temporarily unavailable.");
  }
  if (!response.ok) throw new Error("Rithmic sync is temporarily unavailable.");
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("Rithmic sync is temporarily unavailable.");
  }
  if (!body?.ok) throw new Error("Rithmic sync is temporarily unavailable.");
  return cleanResult(body.data);
}
