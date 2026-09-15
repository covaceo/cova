// Definitions only. GET is a bounded read-only hypothesis, not a verified method contract.
// Official endpoint/schema: https://partner.tradovate.com/resources/admin-dashboards/reports
const ENDPOINT = "https://rpt-demo.tradovateapi.com/v1/reports/requestReportDefinitions";
const MAX_BYTES = 262_144;
const PARAM_TYPES = Object.freeze({ startDate: "Date", endDate: "Date", startTime: "Time", endTime: "Time", account: "accounts", contract: "contracts" });
const hasError = value => value && typeof value === "object"
  && ["error", "errorText", "errorMessage", "errorCode", "errors"].some(key => Object.hasOwn(value, key));
const label = value => typeof value === "string" && value.length > 0 && value.length <= 128 && value === value.trim();

export async function diagnoseTradovateHistory(accessToken, signal) {
  const result = { diagnostic: "tradovate-history-definitions-v1", upstreamStatus: null, status: "network_or_redirect", validDefinitionCount: 0, performanceAvailable: false, requiredParameters: [], requiredParametersComplete: false };
  let base;
  try { base = new URL(process.env.TRADOVATE_API_BASE_URL || ""); } catch { return { ...result, status: "unsupported_environment" }; }
  if (base.origin !== "https://demo.tradovateapi.com" || !["/v1", "/v1/"].includes(base.pathname)
    || base.username || base.password || base.search || base.hash) return { ...result, status: "unsupported_environment" };
  if (typeof accessToken !== "string" || !accessToken || accessToken.length > 65_536
    || accessToken !== accessToken.trim() || /[\x00-\x1f\x7f]/.test(accessToken)) return { ...result, status: "invalid_credential" };
  let reader;
  let abort;
  const aborted = new Promise((resolve, reject) => {
    abort = () => reject(new Error("History diagnostic deadline"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  async function read() {
    signal.throwIfAborted();
    const response = await fetch(ENDPOINT, { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, redirect: "error", signal });
    signal.throwIfAborted();
    result.upstreamStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
    if (!response.ok) return { ...result, status: "upstream_rejected" };
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) return { ...result, status: "oversized" };
    const media = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    if (media !== "application/json") return { ...result, status: "non_json" };
    reader = response.body?.getReader?.();
    if (!reader) return { ...result, status: "empty" };
    const chunks = [];
    let bytes = 0;
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) return { ...result, status: "oversized" };
      chunks.push(Buffer.from(value));
    }
    if (!bytes) return { ...result, status: "empty" };
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")); } catch { return { ...result, status: "non_json" }; }
    if (hasError(payload) || (Array.isArray(payload) && payload.some(hasError))) return { ...result, status: "provider_error" };
    if (!Array.isArray(payload) || payload.length > 256) return { ...result, status: "invalid_definitions" };
    const names = new Set();
    for (const definition of payload) {
      if (!definition || !label(definition.name) || names.has(definition.name) || !Array.isArray(definition.params) || definition.params.length > 32) return { ...result, status: "invalid_definitions" };
      names.add(definition.name);
      const params = new Set();
      for (const param of definition.params) {
        if (!param || hasError(param) || !label(param.name) || params.has(param.name) || !label(param.paramType) || typeof param.optional !== "boolean") return { ...result, status: "invalid_definitions" };
        params.add(param.name);
      }
    }
    const performance = payload.find(definition => definition.name === "Performance");
    const required = performance?.params.filter(param => !param.optional) || [];
    const allowed = required.filter(param => Object.hasOwn(PARAM_TYPES, param.name) && PARAM_TYPES[param.name] === param.paramType);
    return { ...result, status: "definitions", validDefinitionCount: payload.length, performanceAvailable: Boolean(performance),
      requiredParameters: allowed.map(param => ({ name: param.name, paramType: PARAM_TYPES[param.name], optional: false })),
      requiredParametersComplete: Boolean(performance) && allowed.length === required.length };
  }
  try {
    return await Promise.race([read(), aborted]);
  } catch {
    return { ...result, status: signal.aborted ? "timeout" : "network_or_redirect" };
  } finally {
    signal.removeEventListener("abort", abort);
    // Cancellation is best-effort and never allowed to hold the sync permit.
    try { void Promise.resolve(reader?.cancel()).catch(() => undefined); } catch { /* no provider-controlled errors escape */ }
  }
}
