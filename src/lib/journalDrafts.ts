// Browser-only drafts, scoped to the signed-in owner and exact editor identity.
// They are never workspace records or verification evidence.
const key = (scope: string) => {
  const [kind, identity] = JSON.parse(scope);
  const owner = kind === "daily" ? JSON.parse(identity)[0] : identity;
  if (typeof owner !== "string" || !owner.trim()) throw Error("Invalid draft owner");
  return "cova-journal-draft-v1:" + encodeURIComponent(scope) + ":" + encodeURIComponent(owner.trim().toLowerCase());
};
export function readJournalDraft<T>(scope: string | undefined): T | null {
  if (!scope) return null;
  try { return JSON.parse(localStorage.getItem(key(scope)) || "null"); } catch { return null; }
}
export function saveJournalDraft(scope: string | undefined, value: unknown): boolean {
  if (!scope) return false;
  try {
    const data = JSON.stringify(value);
    localStorage.setItem(key(scope), data);
    return localStorage.getItem(key(scope)) === data;
  } catch { return false; }
}
export function clearJournalDraft(scope: string | undefined) {
  if (scope) { try { localStorage.removeItem(key(scope)); } catch { /* Retain recoverable draft. */ } }
}
