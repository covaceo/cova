export function getBaseUrl(req) {
  const proto = req.headers?.["x-forwarded-proto"] || "http";
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "localhost:3000";
  return `${proto}://${host}`;
}

export function getRequestUrl(req) {
  return new URL(req.url || "/", getBaseUrl(req));
}

export function safeReturnUrl(value) {
  if (!value || typeof value !== "string") {
    return "/#import";
  }

  try {
    const url = new URL(value, "https://cova.local");
    return `${url.pathname}${url.search}${url.hash || "#import"}`;
  } catch {
    return "/#import";
  }
}

export function addBrokerResult(returnTo, baseUrl, status, params = {}) {
  const target = new URL(returnTo || "/#import", baseUrl);
  target.searchParams.set("broker", "tradovate");
  target.searchParams.set("brokerStatus", status);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      target.searchParams.set(key, String(value));
    }
  });
  if (!target.hash) {
    target.hash = "import";
  }
  return target;
}
