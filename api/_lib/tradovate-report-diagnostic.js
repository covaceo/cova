// Read-only diagnostics, not a ledger importer. Native current client supplies report POST contract.
import { parsePerformanceReport } from "./tradovate-performance.js";
const URLS = Object.freeze({ definitions: "https://rpt-demo.tradovateapi.com/v1/reports/requestReportDefinitions", accounts: "https://demo.tradovateapi.com/v1/account/list", report: "https://rpt-demo.tradovateapi.com/v1/reports/requestreport" });
const TYPES = Object.freeze({ startDate: "Date", endDate: "Date", startTime: "Time", endTime: "Time", account: "accounts", contract: "contracts" });
const hasError = value => value !== null && typeof value === "object" && ["error", "errorText", "errorMessage", "errorCode", "errors"].some(key => Object.hasOwn(value, key));
const safeLabel = value => typeof value === "string" && value.length > 0 && value.length <= 128 && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
const typeOf = value => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
function shape(value) {
  return { type: typeOf(value), count: Array.isArray(value) ? value.length : value !== null && typeof value === "object" ? Object.keys(value).length : null,
    dataType: value !== null && typeof value === "object" && Object.hasOwn(value, "data") ? typeOf(value.data) : "missing" };
}
class DiagnosticFailure extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const fail = reason => { throw new DiagnosticFailure(reason); };

function selectPerformance(payload) {
  if (hasError(payload)) fail("provider_error");
  const reports = Array.isArray(payload) ? payload : payload?.reports;
  if (hasError(reports)) fail("provider_error");
  if (!Array.isArray(reports) || reports.length > 256) fail("invalid_reports_envelope");
  if (reports.some(hasError)) fail("provider_error");
  const selected = reports.filter(report => report?.name === "Performance");
  if (!selected.length) fail("performance_missing");
  if (selected.length !== 1) fail("performance_ambiguous");
  const params = selected[0].params;
  if (!Array.isArray(params) || params.length > 32) fail("invalid_performance_params");
  const names = new Set();
  const safe = [];
  for (const param of params) {
    if (hasError(param)) fail("provider_error");
    if (!param || !safeLabel(param.name) || names.has(param.name) || !safeLabel(param.paramType)) fail("invalid_performance_descriptor");
    if (typeof param.optional !== "boolean") fail("missing_or_invalid_optional");
    names.add(param.name);
    if (!Object.hasOwn(TYPES, param.name)) { if (!param.optional) fail("unsupported_required_parameter"); continue; }
    if (TYPES[param.name] !== param.paramType) fail("unsupported_parameter_type");
    if (param.name === "contract" && !param.optional) fail("unsupported_required_parameter");
    safe.push({ name: param.name, paramType: TYPES[param.name], optional: param.optional });
  }
  if (!["startDate", "endDate", "account"].every(name => names.has(name))) fail("missing_required_contract");
  return { name: "Performance", params: safe };
}
function ownedAccounts(payload, token) {
  if (hasError(payload) || Array.isArray(payload) && payload.some(hasError)) fail("provider_error");
  if (!Array.isArray(payload) || payload.length > 256) fail("invalid_accounts");
  const ids = new Set(), names = new Set();
  return payload.map(row => {
    if (!row || !Number.isSafeInteger(row.id) || row.id <= 0 || !safeLabel(row.name) || row.name.includes(token) || ids.has(row.id) || names.has(row.name)) fail("invalid_accounts");
    ids.add(row.id); names.add(row.name);
    return { id: String(row.id), name: row.name, status: row.active === true ? "active" : row.active === false ? "inactive" : "unknown" };
  });
}

function reportWindow(query) {
  const parse = value => {
    if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) fail("invalid_dates");
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) fail("invalid_dates");
    return time;
  };
  const start = parse(query.startDate), end = parse(query.endDate);
  if (end - start !== 86_400_000) fail("invalid_date_window");
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" });
  const offset = time => {
    const name = zone.formatToParts(new Date(time)).find(part => part.type === "timeZoneName")?.value;
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(name || "");
    if (!match) fail("unsupported_timezone");
    const minutes = (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0));
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(time - minutes * 60_000));
    const parts = Object.fromEntries(local.map(part => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` !== new Date(time).toISOString().slice(0, 10) || `${parts.hour}:${parts.minute}:${parts.second}` !== "00:00:00") fail("unsupported_timezone");
    return minutes;
  };
  const timezoneOffset = offset(start);
  if (offset(end) !== timezoneOffset) fail("timezone_transition");
  const display = value => `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}`;
  return { startDate: query.startDate, endDate: query.endDate, startTime: "00:00:00", endTime: "00:00:00", timeZone: "America/New_York", timezoneOffset, startValue: display(query.startDate), endValue: display(query.endDate) };
}

function recentWindow(query) {
  const today = new Date().toISOString().slice(0, 10);
  const endDate = query.endDate ?? new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const startDate = query.startDate ?? new Date(Date.parse(`${endDate}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  const times = [startDate, endDate].map(value => {
    if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) fail("invalid_dates");
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) fail("invalid_dates");
    return time;
  });
  if (times[1] <= times[0] || times[1] - times[0] > 90 * 86400000) fail("invalid_date_window");
  const display = value => `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}`;
  return { startDate, endDate, startTime: "00:00:00", endTime: "00:00:00", timeZone: "UTC", timezoneOffset: 0, startValue: display(startDate), endValue: display(endDate) };
}

export async function diagnoseTradovateReport(token, query, signal) {
  const result = { diagnostic: "tradovate-report-v1", status: "unavailable", stage: "input", upstream: { definitions: null, accounts: null, report: null }, responseShape: null };
  let reader, abort;
  let consumed = 0;
  const aborted = new Promise((resolve, reject) => {
    abort = () => reject(new DiagnosticFailure("timeout"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  async function request(stage, body) {
    result.stage = stage;
    result.responseShape = null;
    signal.throwIfAborted();
    const response = await fetch(URLS[stage], { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal });
    signal.throwIfAborted();
    result.upstream[stage] = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
    if (!response.ok) fail("upstream_rejected");
    const cap = stage === "report" ? 1_048_576 : 262_144;
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && (declared > cap || consumed + declared > 2_097_152)) fail("oversized");
    const media = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    if (media !== "application/json") fail("unsupported_media");
    reader = response.body?.getReader?.();
    if (!reader) fail("empty_response");
    const chunks = []; let bytes = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength; consumed += value.byteLength;
        if (bytes > cap || consumed > 2_097_152) fail("oversized");
        chunks.push(Buffer.from(value));
      }
    } finally {
      try { void Promise.resolve(reader.cancel()).catch(() => undefined); } catch { /* cleanup cannot hold permit */ }
      reader = undefined;
    }
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")); } catch { fail("invalid_json"); }
    result.responseShape = shape(payload);
    if (hasError(payload)) fail("provider_error");
    return payload;
  }
  async function execute() {
    let base;
    try { base = new URL(process.env.TRADOVATE_API_BASE_URL || ""); } catch { fail("unsupported_environment"); }
    if (base.origin !== "https://demo.tradovateapi.com" || !["/v1", "/v1/"].includes(base.pathname) || base.username || base.password || base.search || base.hash) fail("unsupported_environment");
    if (typeof token !== "string" || !token || token.length > 65536 || token !== token.trim() || /[\x00-\x1f\x7f]/.test(token)) fail("invalid_credential");
    const reportMode = query.diagnostic === "history-report";
    const historyMode = query.history === "recent";
    if (!historyMode && !reportMode && query.diagnostic !== "history-discovery") fail("invalid_request");
    const keys = historyMode ? ["history", "accountId", "startDate", "endDate", "connectionId"] : reportMode ? ["diagnostic", "accountId", "startDate", "endDate"] : ["diagnostic"];
    if (Object.keys(query).some(key => !keys.includes(key))) fail("invalid_request");
    if (reportMode && (typeof query.accountId !== "string" || !/^[1-9]\d{0,15}$/.test(query.accountId) || !Number.isSafeInteger(Number(query.accountId)))) fail("invalid_account_id");
    if (historyMode && query.accountId !== undefined && (typeof query.accountId !== "string" || !/^[1-9]\d{0,15}$/.test(query.accountId))) fail("invalid_account_id");
    const window = historyMode ? recentWindow(query) : reportMode ? reportWindow(query) : null;
    const performance = selectPerformance(await request("definitions"));
    const accounts = ownedAccounts(await request("accounts"), token);
    if (historyMode) {
      if (!["startTime", "endTime"].every(name => performance.params.some(param => param.name === name))) fail("missing_time_contract");
      if (query.accountId && !accounts.some(account => account.id === query.accountId)) fail("account_not_owned");
      const selected = accounts.filter(account => query.accountId ? account.id === query.accountId : account.status === "active").slice(0, 4);
      const historyAccounts = [];
      for (const account of accounts) {
        if (!selected.includes(account)) { historyAccounts.push({ account, status: "deferred" }); continue; }
        try {
          const payload = await request("report", { name: "Performance", representationType: "csv", template: "Flex.html", timezone: 0, params: [
            { name: "startDate", value: window.startValue }, { name: "endDate", value: window.endValue },
            { name: "startTime", value: "00:00:00" }, { name: "endTime", value: "00:00:00" }, { name: "account", value: account.name },
          ] });
          if (hasError(payload?.data) || !payload || Array.isArray(payload) || typeof payload.data !== "string" || payload.data.includes(token)) fail("unsupported_report_envelope");
          const parsed = parsePerformanceReport(payload.data, account.id, window);
          historyAccounts.push({ account, status: parsed.trades.length ? "ready" : "empty", ...parsed });
        } catch (error) {
          if (signal.aborted) fail("timeout");
          historyAccounts.push({ account, status: "failed", reason: error instanceof DiagnosticFailure ? error.reason : "invalid_performance_report" });
        }
      }
      const response = { provider: "Tradovate", status: "history_ready", window, pnlBasis: "gross_before_fees", coverage: "bounded_matched_fill_pairs", accounts: historyAccounts };
      if (Buffer.byteLength(JSON.stringify(response)) > 2097152) fail("oversized_output");
      return response;
    }
    if (!reportMode) return { ...result, status: "discovery", performance, accounts };
    const account = accounts.find(row => row.id === query.accountId);
    if (!account) fail("account_not_owned");
    if (!["startTime", "endTime"].every(name => performance.params.some(param => param.name === name))) fail("missing_time_contract");
    result.provenance = { report: "Performance", representationType: "csv", account, startDate: window.startDate, endDate: window.endDate, startTime: window.startTime, endTime: window.endTime, timeZone: window.timeZone, timezoneOffset: window.timezoneOffset, coverage: "calendar_day_not_exchange_session" };
    const payload = await request("report", { name: "Performance", representationType: "csv", template: "Flex.html", timezone: window.timezoneOffset, params: [
      { name: "startDate", value: window.startValue }, { name: "endDate", value: window.endValue },
      { name: "startTime", value: window.startTime }, { name: "endTime", value: window.endTime }, { name: "account", value: account.name },
    ] });
    if (hasError(payload?.data)) fail("provider_error");
    if (!payload || Array.isArray(payload) || typeof payload.data !== "string") fail("unsupported_report_envelope");
    const text = payload.data;
    if (Buffer.byteLength(text, "utf8") > 524_288) fail("oversized_report_text");
    if (text.includes(token)) fail("unsafe_report_data");
    if (/^\s*(?:<|\{|\[|error\b|unauthorized\b|forbidden\b|access denied\b)/i.test(text)) fail("unsupported_report_content");
    const response = { ...result, status: text.trim() ? "report_data" : "empty_report", reportText: text, reportTextBytes: Buffer.byteLength(text, "utf8"), schemaValidated: false };
    if (Buffer.byteLength(JSON.stringify(response), "utf8") > 2_097_152) fail("oversized_output");
    return response;
  }
  try { return await Promise.race([execute(), aborted]); }
  catch (error) { return { ...result, status: signal.aborted ? "timeout" : error instanceof DiagnosticFailure ? error.reason : "network_or_redirect" }; }
  finally {
    signal.removeEventListener("abort", abort);
    try { void Promise.resolve(reader?.cancel()).catch(() => undefined); } catch { /* no raw errors */ }
  }
}
