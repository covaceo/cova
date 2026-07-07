export const BROKER_STATUS_KEY = "cova-tradovate-status-v1";

export type BrokerStatus = {
  provider: string;
  status: "connected" | "token-received-needs-storage" | "needs-storage" | "missing-env" | "token-error" | "state-mismatch" | "error" | "not-connected" | "api-unavailable";
  connected: boolean;
  connectionId?: string;
  message: string;
  updatedAt: string;
};

export function readBrokerStatus(): BrokerStatus | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(BROKER_STATUS_KEY) ?? "null");
    if (typeof parsed?.provider === "string" && typeof parsed.message === "string") {
      return {
        provider: parsed.provider,
        status: parsed.status ?? "not-connected",
        connected: Boolean(parsed.connected),
        connectionId: parsed.connectionId,
        message: parsed.message,
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function writeBrokerStatus(status: BrokerStatus) {
  localStorage.setItem(BROKER_STATUS_KEY, JSON.stringify(status));
  window.dispatchEvent(new CustomEvent("cova:broker-status"));
}

export function brokerMessageForStatus(status: string) {
  const messages: Record<string, string> = {
    connected: "Tradovate connected. Trade syncing can now run from the secure backend.",
    "token-received-needs-storage": "Tradovate approved the connection, but Supabase token storage is not configured yet.",
    "needs-storage": "Tradovate approved the connection, but secure Supabase storage needs env vars before we save tokens.",
    "missing-env": "Tradovate OAuth env vars are missing.",
    "token-error": "Tradovate returned a token exchange error.",
    "state-mismatch": "Tradovate OAuth state did not match. Try connecting again.",
    error: "Tradovate returned an authorization error.",
    "not-connected": "No Tradovate connection found yet.",
    "api-unavailable": "Tradovate status check is unavailable in this preview.",
  };
  return messages[status] ?? `Tradovate connector returned: ${status}.`;
}

