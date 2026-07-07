export const PROJECTX_PROVIDER = "projectx";
export const PROJECTX_PROVIDER_NAME = "TopstepX";
export const PROJECTX_COOKIE = "cova_projectx_connection";
export const DEFAULT_PROJECTX_API_BASE_URL = "https://api.topstepx.com/api";

export const POINT_VALUES = {
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

export function projectXApiBaseUrl() {
  return (process.env.PROJECTX_API_BASE_URL || DEFAULT_PROJECTX_API_BASE_URL).replace(/\/$/, "");
}

export async function projectXPost(path, body, token) {
  const response = await fetch(`${projectXApiBaseUrl()}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.errorMessage || payload?.errorCode || `ProjectX request failed: ${path}`);
  }
  return payload;
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

export function pickPrimaryAccount(accounts) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return null;
  }
  return accounts.find((account) => account?.canTrade && account?.isVisible !== false)
    || accounts.find((account) => account?.isVisible !== false)
    || accounts[0];
}

export function normalizeProjectXTrades(trades, account) {
  if (!Array.isArray(trades)) {
    return [];
  }

  return trades
    .filter((trade) => !trade?.voided)
    .map((trade, index) => normalizeProjectXTrade(trade, account, index))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function normalizeProjectXTrade(trade, account, index) {
  const market = inferMarket(trade.contractId || trade.contractName || trade.symbol || "");
  const price = Number(trade.price || 0);
  const quantity = Math.max(1, Math.abs(Number(trade.size || trade.quantity || 1)));
  const grossPnl = Number(trade.profitAndLoss || trade.pnl || 0);
  const fees = Math.abs(Number(trade.fees || 0)) + Math.abs(Number(trade.commissions || 0));
  const pnl = Math.round((grossPnl - fees) * 100) / 100;
  const timestamp = trade.creationTimestamp || trade.timestamp || trade.createdAt || new Date().toISOString();
  const side = Number(trade.side) === 0 ? "Long" : "Short";

  return {
    id: `projectx-${trade.id || index + 1}`,
    date: toDate(timestamp),
    market,
    side,
    contracts: quantity,
    entry: price,
    exit: price,
    pnl,
    risk: Math.max(1, Math.round(Math.abs(pnl || (POINT_VALUES[market] || 50) * quantity))),
    setup: "TopstepX sync",
    notes: [
      account?.name ? `Account: ${account.name}` : "ProjectX account",
      trade.contractId ? `Contract: ${trade.contractId}` : "",
      "Imported as read-only trade history.",
    ].filter(Boolean).join(" · "),
  };
}

export function inferMarket(name) {
  const compact = String(name).toUpperCase().replace(/^CON\.F\.US\./, "").replace(/[^A-Z0-9]/g, "");
  return KNOWN_ROOTS.find((root) => compact.startsWith(root)) || compact.replace(/[FGHJKMNQUVXZ]\d+$/, "") || "UNK";
}

export function toDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export function tradesToCsv(trades) {
  const headers = ["date", "market", "side", "contracts", "entry", "exit", "pnl", "risk", "setup", "notes"];
  const rows = trades.map((trade) => headers.map((key) => csvCell(trade[key])).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function csvCell(value) {
  const raw = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}
