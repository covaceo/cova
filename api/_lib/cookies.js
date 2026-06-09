export function parseCookies(req) {
  const raw = req.headers?.cookie || "";
  return raw.split(";").reduce((cookies, pair) => {
    const [name, ...valueParts] = pair.trim().split("=");
    if (!name) {
      return cookies;
    }
    cookies[name] = decodeURIComponent(valueParts.join("=") || "");
    return cookies;
  }, {});
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.secure ?? process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function clearCookie(name) {
  return serializeCookie(name, "", { maxAge: 0 });
}
