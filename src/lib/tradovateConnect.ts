import { isLocalPreview } from "./authEnvironment";

export function getTradovateConnectEnv() {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return env.VITE_TRADOVATE_CONNECT_URL;
}

export function buildTradovateConnectUrl() {
  const returnUrl = `${window.location.pathname}${window.location.search}#import`;
  const configuredUrl = getTradovateConnectEnv();
  const target = new URL(configuredUrl || "/api/tradovate/connect", window.location.origin);
  target.searchParams.set("returnUrl", returnUrl);
  return target.toString();
}

export function canRedirectToTradovate() {
  const configuredUrl = getTradovateConnectEnv();
  if (configuredUrl && /^https?:\/\//.test(configuredUrl)) {
    return true;
  }
  if (!isLocalPreview()) {
    return true;
  }
  return window.location.port !== "5173";
}

