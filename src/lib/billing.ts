import { authorizedFetch } from "./apiClient";

export type BillingPrice = {
  currency: string;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  unitAmount: number;
};

export type BillingConfig = {
  enabled: boolean;
  price?: BillingPrice;
};

export type BillingStatus = {
  currentPeriodEnd: number | null;
  plan: "free" | "pro";
  subscriptionStatus: string;
};

async function parseJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || fallbackMessage);
  }
  return payload;
}

function trustedStripeUrl(value: unknown, hostname: string) {
  let url: URL;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("Stripe returned an invalid destination.");
  }
  if (url.protocol !== "https:" || (url.hostname !== hostname && !url.hostname.endsWith(`.${hostname}`))) {
    throw new Error("Stripe returned an invalid destination.");
  }
  return url.toString();
}

export async function fetchBillingConfig(): Promise<BillingConfig> {
  const response = await fetch("/api/billing/config", { headers: { Accept: "application/json" } });
  return parseJson<BillingConfig>(response, "Cova could not load Pro pricing.");
}

export async function fetchBillingStatus(): Promise<BillingStatus> {
  const response = await authorizedFetch("/api/billing/status", { headers: { Accept: "application/json" } });
  return parseJson<BillingStatus>(response, "Cova could not refresh billing status.");
}

export async function createProCheckout(): Promise<string> {
  const response = await authorizedFetch("/api/billing/checkout", {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const payload = await parseJson<{ url: string }>(response, "Cova could not open secure checkout.");
  return trustedStripeUrl(payload.url, "checkout.stripe.com");
}

export async function createBillingPortal(): Promise<string> {
  const response = await authorizedFetch("/api/billing/portal", {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const payload = await parseJson<{ url: string }>(response, "Cova could not open billing management.");
  return trustedStripeUrl(payload.url, "billing.stripe.com");
}

export function formatBillingAmount(price?: BillingPrice) {
  if (!price) return "$29";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: price.unitAmount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price.unitAmount / 100);
}

export function formatBillingInterval(price?: BillingPrice) {
  if (!price) return "month";
  return price.intervalCount === 1 ? price.interval : `${price.intervalCount} ${price.interval}s`;
}
