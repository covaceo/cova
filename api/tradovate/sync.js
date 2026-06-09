import { parseCookies } from "../_lib/cookies.js";
import { decryptSecret } from "../_lib/encryption.js";
import { getTradovateConnection } from "../_lib/supabase.js";

const DEFAULT_API_BASE_URL = "https://live.tradovateapi.com/v1";

const POINT_VALUES = {
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  YM: 5,
  MYM: 0.5,
  RTY: 50,
  M2K: 5,
  CL: 1000,
  MCL: 100,
  GC: 100,
  MGC: 10,
  SI: 5000,
  SIL: 1000,
  HG: 25000,
  ZB: 1000,
  ZN: 1000,
  ZF: 1000,
  ZT: 1000,
};

const KNOWN_ROOTS = Object.keys(POINT_VALUES).sort((a, b) => b.length - a.length);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const connectionId = parseCookies(req).cova_tradovate_connection;
  if (!connectionId) {
    res.status(401).json({ error: "Connect Tradovate before syncing trades." });
    return;
  }

  let accessToken;
  try {
    const connection = await getTradovateConnection(connectionId);
    if (!connection?.access_token_encrypted) {
      res.status(404).json({ error: "Tradovate connection was not found in Supabase." });
      return;
    }
    accessToken = decryptSecret(connection.access_token_encrypted);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not load Tradovate connection." });
    return;
  }

  try {
    const [fills, fillPairs] = await Promise.all([
      tradovateGet("/fill/list", accessToken),
      tradovateGet("/fillPair/list", accessToken),
    ]);
    const contracts = await loadContracts(fills, accessToken);
    const trades = normalizeFillPairs(fills, fillPairs, contracts);

    res.status(200).json({
      provider: "Tradovate",
      trades,
      csv: tradesToCsv(trades),
      counts: {
        fills: Array.isArray(fills) ? fills.length : 0,
        fillPairs: Array.isArray(fillPairs) ? fillPairs.length : 0,
        trades: trades.length,
      },
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Tradovate sync failed." });
  }
}

async function tradovateGet(path, accessToken) {
  const baseUrl = new URL(process.env.TRADOVATE_API_BASE_URL || DEFAULT_API_BASE_URL);
  const url = new URL(path.replace(/^\//, ""), `${baseUrl.toString().replace(/\/$/, "")}/`);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error_description || payload?.error || `Tradovate request failed: ${path}`);
  }
  return payload;
}

async function loadContracts(fills, accessToken) {
  const ids = Array.from(new Set((Array.isArray(fills) ? fills : []).map((fill) => fill.contractId).filter(Boolean)));
  const pairs = await Promise.all(ids.map(async (id) => {
    try {
      const contract = await tradovateGet(`/contract/item?id=${encodeURIComponent(id)}`, accessToken);
      return [id, contract];
    } catch {
      return [id, { id, name: `CONTRACT-${id}` }];
    }
  }));
  return new Map(pairs);
}

function normalizeFillPairs(fills, fillPairs, contracts) {
  if (!Array.isArray(fills) || !Array.isArray(fillPairs)) {
    return [];
  }

  const fillsById = new Map(fills.map((fill) => [fill.id, fill]));
  return fillPairs
    .map((pair, index) => normalizeFillPair(pair, fillsById, contracts, index))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeFillPair(pair, fillsById, contracts, index) {
  const buyFill = fillsById.get(pair.buyFillId);
  const sellFill = fillsById.get(pair.sellFillId);
  if (!buyFill || !sellFill) {
    return null;
  }

  const buyTime = new Date(buyFill.timestamp || buyFill.tradeDate || buyFill.createdAt || 0).getTime();
  const sellTime = new Date(sellFill.timestamp || sellFill.tradeDate || sellFill.createdAt || 0).getTime();
  const isLong = buyTime <= sellTime;
  const contract = contracts.get(buyFill.contractId || sellFill.contractId) || {};
  const market = inferMarket(contract.name || contract.symbol || contract.productName || `CONTRACT-${buyFill.contractId || sellFill.contractId}`);
  const pointValue = POINT_VALUES[market] || 1;
  const quantity = Number(pair.qty || pair.quantity || Math.min(Number(buyFill.qty || buyFill.quantity || 1), Number(sellFill.qty || sellFill.quantity || 1)) || 1);
  const buyPrice = Number(pair.buyPrice || buyFill.price || buyFill.avgPrice || 0);
  const sellPrice = Number(pair.sellPrice || sellFill.price || sellFill.avgPrice || 0);
  const priceDelta = isLong ? sellPrice - buyPrice : buyPrice - sellPrice;
  const pnl = Math.round(priceDelta * quantity * pointValue * 100) / 100;
  const exitTime = isLong ? sellFill.timestamp || sellFill.tradeDate || sellFill.createdAt : buyFill.timestamp || buyFill.tradeDate || buyFill.createdAt;

  return {
    id: `tradovate-${pair.id || index + 1}`,
    date: toDate(exitTime || new Date().toISOString()),
    market,
    side: isLong ? "Long" : "Short",
    contracts: quantity,
    entry: isLong ? buyPrice : sellPrice,
    exit: isLong ? sellPrice : buyPrice,
    pnl,
    risk: Math.max(1, Math.round(Math.abs(pnl || pointValue * quantity))),
    setup: "Tradovate sync",
    notes: contract.name ? `Synced from ${contract.name}` : "Synced from Tradovate fill pair",
  };
}

function inferMarket(name) {
  const compact = String(name).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return KNOWN_ROOTS.find((root) => compact.startsWith(root)) || compact.replace(/[FGHJKMNQUVXZ]\d+$/, "") || "UNK";
}

function toDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function tradesToCsv(trades) {
  const headers = ["date", "market", "side", "contracts", "entry", "exit", "pnl", "risk", "setup", "notes"];
  const rows = trades.map((trade) => headers.map((key) => csvCell(trade[key])).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function csvCell(value) {
  const raw = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}
