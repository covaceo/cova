// Performance matched fill pairs. UTC requests only; no strategy grouping or fee inference.
const POINTS = Object.freeze({ NQ: 20, MNQ: 2, ES: 50, MES: 5, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, CL: 1000, MCL: 100, GC: 100, MGC: 10, SI: 5000, SIL: 1000, HG: 25000, ZB: 1000, ZN: 1000, ZF: 1000, ZT: 1000 });
const HEADER = 'symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration'.split(',');
const fail = () => { throw new Error('invalid_performance_report'); };
const numericId = value => typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value);
function number(value) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) fail();
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 1e12) fail();
  return parsed;
}
function timestamp(value) {
  const m = /^(\d{2})\/(\d{2})\/(20\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!m) fail();
  const iso = `${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
  const time = Date.parse(iso);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== iso) fail();
  return time;
}
function csvFields(line) {
  const fields = []; let value = '', quoted = false, closed = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else value += c;
    } else if (c === ',') { fields.push(value); value = ''; closed = false; }
    else if (c === '"' && !value && !closed) quoted = true;
    else if (c === '"' || closed) fail();
    else value += c;
  }
  if (quoted) fail();
  fields.push(value); return fields;
}
function money(value) {
  const negative = /^\$?\((.*)\)$/.exec(value);
  const raw = negative ? negative[1].replace(/^\$/, '') : value.replace(/^\$/, '');
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw) || negative && raw.startsWith('-')) fail();
  return number(raw.replaceAll(',', '')) * (negative ? -1 : 1);
}
export function parsePerformanceReport(text, accountId, window) {
  if (!numericId(accountId) || window?.timeZone !== 'UTC' || window?.timezoneOffset !== 0) fail();
  const dates = [window.startDate, window.endDate].map(value => {
    if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) fail();
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) fail();
    return time;
  });
  if (dates[1] <= dates[0] || dates[1] - dates[0] > 90 * 86400000) fail();
  if (typeof text !== 'string' || Buffer.byteLength(text) > 524288 || !text.endsWith('\n')) fail();
  const lines = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.length > 5001 || csvFields(lines[0]).join(',') !== HEADER.join(',')) fail();
  const seen = new Set();
  const trades = lines.slice(1).map(line => {
    const fields = csvFields(line);
    if (fields.length !== HEADER.length) fail();
    const row = Object.fromEntries(HEADER.map((key, i) => [key, fields[i]]));
    const match = /^([A-Z0-9]+)[FGHJKMNQUVXZ]\d{1,4}$/.exec(row.symbol);
    const market = match?.[1];
    if (!market || !Object.hasOwn(POINTS, market)) fail();
    if (!numericId(row.buyFillId) || !numericId(row.sellFillId) || row.buyFillId === row.sellFillId) fail();
    const id = `tradovate-${accountId}:${row.buyFillId}:${row.sellFillId}`;
    if (seen.has(id)) fail();
    seen.add(id);
    const contracts = number(row.qty), buy = number(row.buyPrice), sell = number(row.sellPrice);
    if (!Number.isSafeInteger(contracts) || contracts <= 0 || contracts > 100000 || number(row._tickSize) <= 0) fail();
    number(row._priceFormat); number(row._priceFormatType);
    const pnl = money(row.pnl);
    if (Math.abs(Math.round((sell - buy) * contracts * POINTS[market] * 100) / 100 - pnl) > 0.005) fail();
    const bought = timestamp(row.boughtTimestamp), sold = timestamp(row.soldTimestamp);
    if (bought === sold) fail();
    const duration = /^(?:(\d+)day\s*)?(?:(\d+)(?:hour|h)\s*)?(?:(\d+)min\s*)?(?:(\d+)sec)?$/.exec(row.duration);
    if (!duration || !row.duration || Math.abs((Number(duration[1] || 0) * 86400 + Number(duration[2] || 0) * 3600 + Number(duration[3] || 0) * 60 + Number(duration[4] || 0)) * 1000 - Math.abs(bought - sold)) > 1000) fail();
    const close = Math.max(bought, sold);
    if (close < Date.parse(`${window.startDate}T00:00:00Z`) || close >= Date.parse(`${window.endDate}T00:00:00Z`)) fail();
    return { id, date: new Date(close).toISOString(), market, side: bought < sold ? 'Long' : 'Short', contracts,
      entry: bought < sold ? buy : sell, exit: bought < sold ? sell : buy, pnl, risk: 0, setup: 'Imported', notes: '',
      source: { provider: 'Tradovate', accountId, openedAt: new Date(Math.min(bought, sold)).toISOString(), closedAt: new Date(close).toISOString(), timeZone: 'UTC', pnlBasis: 'gross_before_fees' },
    };
  });
  const csvHeader = 'date,market,side,contracts,entry,exit,pnl,risk,setup,notes,sourceProvider,sourceAccountId,sourceTradeId,sourceOpenedAt,sourceClosedAt,sourceTimeZone,sourcePnlBasis';
  const csv = [csvHeader, ...trades.map(t => [t.date, t.market, t.side, t.contracts, t.entry, t.exit, t.pnl, 0, 'Imported', '', 'Tradovate', accountId, t.id, t.source.openedAt, t.source.closedAt, 'UTC', 'gross_before_fees'].join(','))].join('\n');
  return { trades, csv, counts: { trades: trades.length } };
}
