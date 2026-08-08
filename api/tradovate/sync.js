import { isIP } from "node:net";
import { ApiError, requirePolicyAcceptedUser, requireProEntitlement, sendApiError } from "../_lib/auth.js";
import { parseCookies } from "../_lib/cookies.js";
import { decryptSecret } from "../_lib/encryption.js";
import { acquireTradovateSyncPermit } from "../_lib/rithmic-limit.js";
import { getTradovateConnection } from "../_lib/supabase.js";

const DEFAULT_API_BASE_URL = "https://live.tradovateapi.com/v1";
const MAX_CONCURRENT_CONTRACT_LOOKUPS = 5;
const MAX_CONTRACT_LOOKUPS = 200;
const MAX_PROVIDER_ROWS = 5_000;
const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024;
const PROVIDER_SYNC_TIMEOUT_MS = 25_000;

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

export function tradovateClientIp(req) {
  const value = req?.headers?.["x-forwarded-for"];
  const forwarded = Array.isArray(value) ? value[0] : String(value || "");
  const ipAddress = forwarded.split(",", 1)[0].trim();
  if (!isIP(ipAddress)) throw new ApiError(503, "Tradovate sync protection is temporarily unavailable.");
  return ipAddress;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");

  let user;
  try {
    user = requireProEntitlement(await requirePolicyAcceptedUser(req));
  } catch (error) {
    return sendApiError(res, error, "Tradovate authentication is unavailable.");
  }

  const connectionId = parseCookies(req).cova_tradovate_connection;
  if (!connectionId) {
    res.status(401).json({ error: "Connect Tradovate before syncing trades." });
    return;
  }

  try {
    let permit;
    try {
      permit = await acquireTradovateSyncPermit({ actorId: user.id, ipAddress: tradovateClientIp(req) });
    } catch {
      return sendApiError(res, new ApiError(503, "Tradovate sync protection is temporarily unavailable."), "Tradovate sync protection is temporarily unavailable.");
    }
    if (!permit.allowed) {
      res.setHeader("Retry-After", String(permit.retryAfterSeconds));
      return sendApiError(res, new ApiError(429, "Too many Tradovate sync attempts. Wait and try again."), "Tradovate sync is temporarily unavailable.");
    }

    try {
      let accessToken;
      try {
        const connection = await getTradovateConnection(connectionId, user.id);
        if (!connection?.access_token_encrypted) {
          res.status(404).json({ error: "Tradovate connection was not found in Supabase." });
          return;
        }
        accessToken = decryptSecret(connection.access_token_encrypted);
      } catch {
        res.status(500).json({ error: "Could not load the authorized Tradovate connection." });
        return;
      }

      try {
        const providerSignal = AbortSignal.timeout(PROVIDER_SYNC_TIMEOUT_MS);
        const [rawFills, rawFillPairs] = await Promise.all([
          tradovateGet("/fill/list", accessToken, providerSignal),
          tradovateGet("/fillPair/list", accessToken, providerSignal),
        ]);
        const fills = boundedProviderList(rawFills);
        const fillPairs = boundedProviderList(rawFillPairs);
        const contracts = await loadContracts(fills, accessToken, providerSignal);
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
    } finally {
      await permit.release();
    }
  } catch {
    return sendApiError(res, new ApiError(503, "Tradovate sync protection is temporarily unavailable."), "Tradovate sync protection is temporarily unavailable.");
  }
}

async function tradovateGet(path, accessToken, signal = AbortSignal.timeout(PROVIDER_SYNC_TIMEOUT_MS)) {
  const baseUrl = new URL(process.env.TRADOVATE_API_BASE_URL || DEFAULT_API_BASE_URL);
  const url = new URL(path.replace(/^\//, ""), `${baseUrl.toString().replace(/\/$/, "")}/`);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    redirect: "error",
    signal,
  });
  const payload = await readBoundedJson(response, MAX_PROVIDER_RESPONSE_BYTES);
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error_description || payload?.error || `Tradovate request failed: ${path}`);
  }
  return payload;
}

async function readBoundedJson(response, maxBytes) {
  const declared = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("Tradovate sync result is too large to import safely.");
  }
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error("Tradovate sync is temporarily unavailable.");
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Tradovate sync result is too large to import safely.");
    }
    chunks.push(Buffer.from(value));
  }
  const raw = Buffer.concat(chunks, total).toString("utf8");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Tradovate sync is temporarily unavailable.");
  }
}

function boundedProviderList(value) {
  if (!Array.isArray(value)) throw new Error("Tradovate sync is temporarily unavailable.");
  if (value.length > MAX_PROVIDER_ROWS) throw new Error("Tradovate sync result is too large to import safely.");
  return value;
}

async function loadContracts(fills, accessToken, signal) {
  const ids = Array.from(new Set((Array.isArray(fills) ? fills : []).map((fill) => fill.contractId).filter(Boolean)));
  if (ids.length > MAX_CONTRACT_LOOKUPS) throw new Error("Tradovate sync result is too large to import safely.");
  const pairs = [];
  for (let offset = 0; offset < ids.length; offset += MAX_CONCURRENT_CONTRACT_LOOKUPS) {
    const batch = ids.slice(offset, offset + MAX_CONCURRENT_CONTRACT_LOOKUPS);
    pairs.push(...await Promise.all(batch.map(async (id) => {
      try {
        const contract = await tradovateGet(`/contract/item?id=${encodeURIComponent(id)}`, accessToken, signal);
        return [id, contract];
      } catch {
        if (signal.aborted) throw new Error("Tradovate sync is temporarily unavailable.");
        return [id, { id, name: `CONTRACT-${id}` }];
      }
    })));
  }
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
