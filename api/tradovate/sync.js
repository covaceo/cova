import { isIP } from "node:net";
import { ApiError, requirePolicyAcceptedUser, requireProEntitlement, sendApiError } from "../_lib/auth.js";
import { parseCookies } from "../_lib/cookies.js";
import { decryptSecret } from "../_lib/encryption.js";
import { acquireTradovateSyncPermit } from "../_lib/rithmic-limit.js";
import { getBrokerConnection, getTradovateConnection } from "../_lib/supabase.js";
import { diagnoseTradovateHistory } from "../_lib/tradovate-history-diagnostic.js";
import { diagnoseTradovateReport } from "../_lib/tradovate-report-diagnostic.js";

const DEFAULT_API_BASE_URL = "https://live.tradovateapi.com/v1";
const MAX_CONCURRENT_CONTRACT_LOOKUPS = 5;
const MAX_CONTRACT_LOOKUPS = 200;
const MAX_PROVIDER_ROWS = 5_000;
const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_PROVIDER_SYNC_BYTES = 6 * 1024 * 1024;
const MAX_SYNC_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CONTRACT_LABEL_LENGTH = 160;
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
      let connectionExpiresAt;
      try {
        // Expired Tradovate credentials are rejected without erasing the retained owner link.
        const connection = Object.hasOwn(req.query || {}, "history") || ["history", "history-discovery", "history-report", "fee-discovery", "fee-report"].includes(req.query?.diagnostic)
          ? await getBrokerConnection({ connectionId, provider: "tradovate", userId: user.id, pruneExpired: false })
          : await getTradovateConnection(connectionId, user.id);
        if (!connection?.access_token_encrypted) {
          res.status(404).json({ error: "Tradovate connection was not found in Supabase." });
          return;
        }
        accessToken = decryptSecret(connection.access_token_encrypted);
        connectionExpiresAt = connection.expires_at;
      } catch {
        res.status(500).json({ error: "Could not load the authorized Tradovate connection." });
        return;
      }

      let providerTimeout;
      try {
        const providerController = new AbortController();
        providerTimeout = setTimeout(() => providerController.abort(), PROVIDER_SYNC_TIMEOUT_MS);
        providerTimeout.unref?.();
        const providerSignal = providerController.signal;
        const providerBudget = createProviderByteBudget(MAX_PROVIDER_SYNC_BYTES, () => providerController.abort());
        if (Object.hasOwn(req.query || {}, "history")) {
          try {
            if (req.query.connectionId !== undefined && req.query.connectionId !== connectionId) return res.status(409).json({ error: "Tradovate connection changed. Check the connection and retry." });
            return res.status(200).json(await diagnoseTradovateReport(accessToken, req.query, providerSignal));
          } finally {
            providerController.abort();
          }
        }
        if (["history-discovery", "history-report", "fee-discovery", "fee-report"].includes(req.query?.diagnostic)) {
          try {
            if (["fee-discovery", "fee-report"].includes(req.query.diagnostic) && req.query.connectionId !== undefined && req.query.connectionId !== connectionId) return res.status(409).json({ error: "Tradovate connection changed. Check the connection and retry." });
            return res.status(200).json(await diagnoseTradovateReport(accessToken, req.query, providerSignal));
          } finally {
            providerController.abort();
          }
        }
        if (req.query?.diagnostic === "history") {
          try {
            return res.status(200).json(await diagnoseTradovateHistory(accessToken, providerSignal));
          } finally {
            providerController.abort();
          }
        }
        if (req.query?.diagnostic === "access") {
          try {
            const diagnostic = await diagnoseTradovateAccess(accessToken, connectionExpiresAt, providerSignal);
            return res.status(200).json(diagnostic);
          } finally {
            providerController.abort();
          }
        }
        const [rawFills, rawFillPairs, rawPositions] = await Promise.all([
          tradovateGet("/fill/list", accessToken, providerSignal, providerBudget),
          tradovateGet("/fillPair/list", accessToken, providerSignal, providerBudget),
          tradovateGet("/position/list", accessToken, providerSignal, providerBudget),
        ]);
        const fills = boundedProviderList(rawFills);
        const fillPairs = boundedProviderList(rawFillPairs);
        const positions = boundedProviderList(rawPositions);
        const contracts = await loadContracts(fills, accessToken, providerSignal, providerBudget);
        const trades = normalizeFillPairs(fills, fillPairs, positions, contracts);
        const payload = {
          provider: "Tradovate",
          trades,
          csv: tradesToCsv(trades),
          counts: {
            fills: Array.isArray(fills) ? fills.length : 0,
            fillPairs: Array.isArray(fillPairs) ? fillPairs.length : 0,
            positions: Array.isArray(positions) ? positions.length : 0,
            trades: trades.length,
          },
        };
        serializeTradovateSyncPayload(payload);
        res.status(200).json(payload);
      } catch (error) {
        res.status(502).json({ error: error instanceof Error ? error.message : "Tradovate sync failed." });
      } finally {
        if (providerTimeout) clearTimeout(providerTimeout);
      }
    } finally {
      await permit.release();
    }
  } catch {
    return sendApiError(res, new ApiError(503, "Tradovate sync protection is temporarily unavailable."), "Tradovate sync protection is temporarily unavailable.");
  }
}

// Explicit, owner-authenticated diagnostic. No ledger, renewal, storage writes or secret output.
async function diagnoseTradovateAccess(accessToken, expiresAt, signal) {
  const base = new URL(process.env.TRADOVATE_API_BASE_URL || DEFAULT_API_BASE_URL);
  if (base.origin !== "https://demo.tradovateapi.com" || !["/v1", "/v1/"].includes(base.pathname)
    || base.username || base.password || base.search || base.hash) {
    throw new Error("Tradovate access diagnostic requires the Demo environment.");
  }
  const token = typeof accessToken === "string" ? accessToken : "";
  let unverifiedJwtExpiry = "not_jwt";
  if (token.length <= 65_536 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    try {
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      unverifiedJwtExpiry = typeof claims?.exp === "number" && Number.isFinite(claims.exp)
        ? claims.exp * 1000 <= Date.now() ? "expired" : "not_expired" : "missing";
    } catch {
      unverifiedJwtExpiry = "unreadable";
    }
  }
  const expiry = Date.parse(expiresAt);
  const credential = {
    present: Boolean(token),
    surroundingWhitespace: token !== token.trim(),
    embeddedControlCharacters: /[\x00-\x1f\x7f]/.test(token),
    bearerPrefixInStoredToken: /^Bearer\s/i.test(token),
    storedExpiry: Number.isFinite(expiry) ? expiry <= Date.now() ? "expired" : "not_expired" : "invalid",
    unverifiedJwtExpiry,
  };
  const results = [];
  for (const endpoint of ["/position/list", "/auth/me"]) {
    if (signal.aborted) break;
    try {
      const response = await fetch(`https://demo.tradovateapi.com/v1${endpoint}`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        redirect: "error",
        signal,
      });
      results.push({ endpoint, ...await summarizeAccessResponse(response) });
    } catch {
      results.push({ endpoint, upstreamStatus: null, failure: signal.aborted ? "timeout" : "network_or_redirect" });
    }
  }
  return { diagnostic: "tradovate-access-v1", credential, results };
}

async function summarizeAccessResponse(response) {
  const media = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const formats = { "application/json": "json", "text/plain": "text", "text/html": "html" };
  const authenticate = response.headers.get("www-authenticate");
  const match = authenticate?.match(/\berror\s*=\s*(?:"([^"]*)"|([^,\s]+))/i);
  const category = match?.[1] || match?.[2];
  const metadata = {
    upstreamStatus: response.status,
    format: Object.hasOwn(formats, media) ? formats[media] : media ? "other" : "missing",
    authenticationError: ["invalid_token", "insufficient_scope", "invalid_request"].includes(category)
      ? category : authenticate ? "unspecified" : "missing",
  };
  const reader = response.body?.getReader?.();
  if (!reader) return { ...metadata, body: "empty" };
  let bytes = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 32_768) {
      void reader.cancel().catch(() => undefined);
      return { ...metadata, body: "truncated" };
    }
    chunks.push(Buffer.from(value));
  }
  if (!bytes) return { ...metadata, body: "empty" };
  try {
    const payload = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
    return { ...metadata, body: "json", providerError: Boolean(payload?.error || payload?.errorText) };
  } catch {
    return { ...metadata, body: "non_json" };
  }
}

async function tradovateGet(path, accessToken, signal = AbortSignal.timeout(PROVIDER_SYNC_TIMEOUT_MS), byteBudget = null) {
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
  const payload = await readBoundedJson(response, MAX_PROVIDER_RESPONSE_BYTES, byteBudget, path);
  if (!response.ok || payload?.error) {
    throw new Error("Tradovate provider request failed.");
  }
  return payload;
}

// Server-only, fixed-schema metadata. Never log payloads, headers, URLs or identities.
function reportTradovateResponseFailure(response, path, reason) {
  try {
    const endpoint = String(path).split("?", 1)[0];
    const allowedEndpoints = ["/fill/list", "/fillPair/list", "/position/list", "/contract/item"];
    const mediaType = String(response.headers?.get?.("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    const formats = { "application/json": "json", "text/html": "html", "text/plain": "text" };
    const stream = !response.body ? "missing"
      : typeof response.body.getReader === "function" ? "web"
        : typeof response.body[Symbol.asyncIterator] === "function" ? "node" : "unsupported";
    console.warn("cova.tradovate.response_failure", {
      endpoint: allowedEndpoints.includes(endpoint) ? endpoint : "other",
      upstreamStatus: Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null,
      format: Object.hasOwn(formats, mediaType) ? formats[mediaType] : mediaType ? "other" : "missing",
      stream,
      reason: ["invalid_json", "missing_reader"].includes(reason) ? reason : "other",
    });
  } catch {
    // Logging must not change the sync result or interfere with lock release.
  }
}

async function readBoundedJson(response, maxBytes, byteBudget = null, path = "") {
  const declared = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("Tradovate sync result is too large to import safely.");
  }
  byteBudget?.assertAvailable(declared);
  const reader = response.body?.getReader?.();
  if (!reader) {
    reportTradovateResponseFailure(response, path, "missing_reader");
    throw new Error("Tradovate sync is temporarily unavailable.");
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    byteBudget?.consume(value.byteLength);
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
    reportTradovateResponseFailure(response, path, "invalid_json");
    throw new Error("Tradovate sync is temporarily unavailable.");
  }
}

function createProviderByteBudget(maxBytes, onExceeded) {
  let consumed = 0;
  function fail() {
    onExceeded?.();
    throw new Error("Tradovate sync result is too large to import safely.");
  }
  return {
    assertAvailable(bytes) {
      if (Number.isFinite(bytes) && bytes > 0 && consumed + bytes > maxBytes) fail();
    },
    consume(bytes) {
      consumed += bytes;
      if (!Number.isFinite(consumed) || consumed > maxBytes) fail();
    },
  };
}

export function serializeTradovateSyncPayload(payload) {
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > MAX_SYNC_RESPONSE_BYTES) {
    throw new Error("Tradovate sync result is too large to import safely.");
  }
  return serialized;
}

function boundedProviderList(value) {
  if (!Array.isArray(value)) throw new Error("Tradovate sync is temporarily unavailable.");
  if (value.length > MAX_PROVIDER_ROWS) throw new Error("Tradovate sync result is too large to import safely.");
  return value;
}

async function loadContracts(fills, accessToken, signal, byteBudget) {
  const ids = Array.from(new Set((Array.isArray(fills) ? fills : []).map((fill) => fill.contractId).filter(Boolean)));
  if (ids.length > MAX_CONTRACT_LOOKUPS) throw new Error("Tradovate sync result is too large to import safely.");
  const pairs = [];
  for (let offset = 0; offset < ids.length; offset += MAX_CONCURRENT_CONTRACT_LOOKUPS) {
    const batch = ids.slice(offset, offset + MAX_CONCURRENT_CONTRACT_LOOKUPS);
    pairs.push(...await Promise.all(batch.map(async (id) => {
      const contract = await tradovateGet(`/contract/item?id=${encodeURIComponent(id)}`, accessToken, signal, byteBudget);
      const requestedContractId = providerIdentifier(id);
      const returnedContractId = providerIdentifier(contract?.id);
      if (returnedContractId !== requestedContractId) {
        throw new Error("Tradovate returned mismatched contract metadata.");
      }
      return [requestedContractId, contract];
    })));
  }
  return new Map(pairs);
}

function normalizeFillPairs(fills, fillPairs, positions, contracts) {
  if (!Array.isArray(fills) || !Array.isArray(fillPairs) || !Array.isArray(positions)) {
    return [];
  }

  const fillsById = new Map();
  const fillCapacities = new Map();
  for (const fill of fills) {
    const fillId = providerIdentifier(fill?.id);
    const fillQuantity = fill?.qty;
    if (typeof fillQuantity !== "number" || !Number.isSafeInteger(fillQuantity) || fillQuantity <= 0) {
      throw new Error("Tradovate returned an invalid fill quantity.");
    }
    providerPrice(fill?.price);
    providerTimestamp(fill?.timestamp);
    if (fillsById.has(fillId)) throw new Error("Tradovate returned duplicate fill identifiers.");
    fillsById.set(fillId, fill);
    fillCapacities.set(fillId, fillQuantity);
  }

  const positionsById = new Map();
  for (const position of positions) {
    const positionId = providerIdentifier(position?.id);
    if (positionsById.has(positionId)) throw new Error("Tradovate returned duplicate position identifiers.");
    positionsById.set(positionId, position);
  }

  const pairIds = new Set();
  const fillConsumption = new Map();
  const trades = fillPairs.map((pair) => {
    const pairId = providerIdentifier(pair?.id);
    if (pairIds.has(pairId)) throw new Error("Tradovate returned duplicate fill-pair identifiers.");
    pairIds.add(pairId);
    return normalizeFillPair(pair, pairId, fillsById, fillCapacities, fillConsumption, positionsById, contracts);
  });
  if (trades.length !== fillPairs.length || new Set(trades.map((trade) => trade.id)).size !== trades.length) {
    throw new Error("Tradovate returned an inconsistent trade ledger.");
  }
  return trades.sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeFillPair(pair, pairId, fillsById, fillCapacities, fillConsumption, positionsById, contracts) {
  const buyFillId = providerIdentifier(pair?.buyFillId);
  const sellFillId = providerIdentifier(pair?.sellFillId);
  if (buyFillId === sellFillId) throw new Error("Tradovate returned an incomplete fill pair.");
  const buyFill = fillsById.get(buyFillId);
  const sellFill = fillsById.get(sellFillId);
  if (!buyFill || !sellFill) throw new Error("Tradovate returned an incomplete fill pair.");

  const positionId = providerIdentifier(pair.positionId);
  const position = positionsById.get(positionId);
  if (!position) throw new Error("Tradovate returned an unresolved fill-pair position.");
  const pairAccountId = providerIdentifier(position.accountId);
  const positionContractId = providerIdentifier(position.contractId);

  const buyTime = providerTimestamp(buyFill.timestamp);
  const sellTime = providerTimestamp(sellFill.timestamp);
  const isLong = buyTime <= sellTime;
  const buyContractId = providerIdentifier(buyFill.contractId);
  const sellContractId = providerIdentifier(sellFill.contractId);
  if (buyContractId !== sellContractId || buyContractId !== positionContractId) {
    throw new Error("Tradovate returned a cross-contract fill pair.");
  }
  const contract = contracts.get(buyFill.contractId) || contracts.get(buyContractId);
  const contractLabel = boundedProviderText(contract?.name || contract?.symbol || contract?.productName);
  const market = inferMarket(contractLabel);
  const pointValue = POINT_VALUES[market];
  const buyCapacity = fillCapacities.get(buyFillId);
  const sellCapacity = fillCapacities.get(sellFillId);
  const quantity = pair?.qty;
  const buyPrice = providerPrice(pair?.buyPrice);
  const sellPrice = providerPrice(pair?.sellPrice);
  providerPrice(buyFill.price);
  providerPrice(sellFill.price);
  const exitTime = isLong ? sellFill.timestamp : buyFill.timestamp;
  if (!contract || !contractLabel || !pointValue
    || !Number.isFinite(buyTime) || !Number.isFinite(sellTime)
    || typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0
    || quantity > buyCapacity || quantity > sellCapacity
    || !Number.isFinite(buyPrice) || buyPrice <= 0
    || !Number.isFinite(sellPrice) || sellPrice <= 0
    || !exitTime) {
    throw new Error("Tradovate returned an incomplete trade ledger.");
  }
  const nextBuyConsumption = (fillConsumption.get(buyFillId) || 0) + quantity;
  const nextSellConsumption = (fillConsumption.get(sellFillId) || 0) + quantity;
  if (nextBuyConsumption > buyCapacity || nextSellConsumption > sellCapacity) {
    throw new Error("Tradovate fill quantity was reused across multiple pairs.");
  }
  fillConsumption.set(buyFillId, nextBuyConsumption);
  fillConsumption.set(sellFillId, nextSellConsumption);

  // Gross P&L is sale proceeds minus purchase cost for longs and shorts.
  const priceDelta = sellPrice - buyPrice;
  const pnl = Math.round(priceDelta * quantity * pointValue * 100) / 100;
  const sourceTradeId = `tradovate-${pairId}`;

  return {
    id: sourceTradeId,
    date: toDate(exitTime),
    market,
    side: isLong ? "Long" : "Short",
    contracts: quantity,
    entry: isLong ? buyPrice : sellPrice,
    exit: isLong ? sellPrice : buyPrice,
    pnl,
    risk: 0,
    setup: "Tradovate sync",
    notes: `Synced from ${contractLabel}`,
    source: { provider: "Tradovate", accountId: pairAccountId },
  };
}

function providerPrice(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("Tradovate returned an invalid provider price.");
  }
  return value;
}

function providerTimestamp(value) {
  if (typeof value !== "string") {
    throw new Error("Tradovate returned an invalid provider timestamp.");
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error("Tradovate returned an invalid provider timestamp.");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth
    || hour > 23 || minute > 59 || second > 59) {
    throw new Error("Tradovate returned an invalid provider timestamp.");
  }
  if (zone !== "Z") {
    const [zoneHour, zoneMinute] = zone.slice(1).split(":").map(Number);
    if (zoneHour > 23 || zoneMinute > 59) {
      throw new Error("Tradovate returned an invalid provider timestamp.");
    }
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Tradovate returned an invalid provider timestamp.");
  return timestamp;
}

function providerIdentifier(value) {
  const identifier = String(value ?? "");
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(identifier)) {
    throw new Error("Tradovate returned an invalid provider identifier.");
  }
  return identifier;
}

function boundedProviderText(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_CONTRACT_LABEL_LENGTH);
}

function inferMarket(name) {
  const compact = String(name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
  return KNOWN_ROOTS.find((root) => compact.startsWith(root)) || compact.replace(/[FGHJKMNQUVXZ]\d+$/, "") || "UNK";
}

function toDate(value) {
  return new Date(providerTimestamp(value)).toISOString().slice(0, 10);
}

function tradesToCsv(trades) {
  const headers = ["date", "market", "side", "contracts", "entry", "exit", "pnl", "risk", "setup", "notes", "source_provider", "source_account_id", "source_trade_id"];
  const rows = trades.map((trade) => [
    trade.date,
    trade.market,
    trade.side,
    trade.contracts,
    trade.entry,
    trade.exit,
    trade.pnl,
    trade.risk,
    trade.setup,
    trade.notes,
    trade.source?.provider,
    trade.source?.accountId,
    trade.id,
  ].map(csvCell).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function csvCell(value) {
  const raw = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}
