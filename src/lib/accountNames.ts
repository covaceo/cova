export type AccountNames = Record<string, string>;
export const ACCOUNT_NAMES_EVENT = "cova:account-names";
const storageKey = (owner: string) => `cova-account-names-v1:${encodeURIComponent(owner.trim().toLowerCase())}`;
const validKey = (key: string) => /^Tradovate:[1-9]\d{0,15}$/.test(key) || /^Rithmic:[A-Za-z0-9_-]{20,64}:[^\x00-\x1f]{1,128}$/.test(key);
const validName = (name: unknown): name is string => typeof name === "string" && Boolean(name.trim()) && name.length <= 128 && !/[\x00-\x1f\x7f]/.test(name);

// Display metadata only. Stable provider keys still control ledger/account selection.
export function readAccountNames(owner: string): AccountNames {
  const names: AccountNames = {};
  if (!owner) return names;
  // Recover already-imported names without another provider request or ledger rewrite.
  try {
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith("cova-history-summary:")) continue;
      const scope = JSON.parse(key.slice("cova-history-summary:".length));
      if (!Array.isArray(scope) || scope[0] !== owner) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw || raw.length > 131072) continue;
      const summary = JSON.parse(raw);
      if (!Array.isArray(summary.accounts) || summary.accounts.length > 256) continue;
      for (const item of summary.accounts) {
        const accountKey = `Tradovate:${item?.account?.id}`;
        if (validKey(accountKey) && validName(item?.account?.name)) names[accountKey] = item.account.name;
      }
    }
  } catch { /* Missing or invalid cache is not account-name evidence. */ }
  try {
    const raw = localStorage.getItem(storageKey(owner));
    if (raw && raw.length <= 131072) {
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        for (const [key, name] of Object.entries(saved)) if (validKey(key) && validName(name)) names[key] = name;
      }
    }
  } catch { /* Keep any valid in-session names when persistent storage is unavailable. */ }
  return names;
}

export function rememberAccountNames(owner: string, entries: AccountNames) {
  if (!owner) return;
  const names = readAccountNames(owner);
  for (const [key, name] of Object.entries(entries)) if (validKey(key) && validName(name)) names[key] = name;
  try { localStorage.setItem(storageKey(owner), JSON.stringify(names)); } catch { /* Display metadata must not fail an import. */ }
  window.dispatchEvent(new Event(ACCOUNT_NAMES_EVENT));
}

export function accountDisplayName(key: string, names: AccountNames): string {
  if (key === "all") return "All accounts";
  if (key === "local") return "CSV / local history";
  if (validKey(key) && validName(names[key])) return names[key];
  if (key.startsWith("Rithmic:")) return key.split(":").slice(2).join(":") || "Rithmic account";
  if (key.startsWith("Tradovate:")) return `Account ${key.slice("Tradovate:".length)}`;
  return "Account name unavailable";
}
