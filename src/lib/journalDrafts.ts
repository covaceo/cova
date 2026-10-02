// Browser-only drafts, scoped to owner/editor and isolated by browser tab.
// They are never workspace records or verification evidence.
// sessionStorage survives refresh and gives duplicated/new tabs independent copies.
// localStorage retains the existing last-draft recovery copy for a new tab.
const key = (scope: string) => {
  const [kind, identity] = JSON.parse(scope);
  const owner = kind === "daily" ? JSON.parse(identity)[0] : identity;
  if (typeof owner !== "string" || !owner.trim()) throw Error("Invalid draft owner");
  return "cova-journal-draft-v1:" + encodeURIComponent(scope) + ":" + encodeURIComponent(owner.trim().toLowerCase());
};
export function readJournalDraft<T>(scope: string | undefined): T | null {
  if (!scope) return null;
  try {
    const storageKey = key(scope);
    let data = sessionStorage.getItem(storageKey);
    if (data === null) {
      data = localStorage.getItem(storageKey) || "null";
      // Adopt once. An explicit null also prevents another tab's draft from
      // appearing here after this tab has saved or discarded its own draft.
      sessionStorage.setItem(storageKey, data);
    }
    return JSON.parse(data);
  } catch { return null; }
}
export function saveJournalDraft(scope: string | undefined, value: unknown): boolean {
  if (!scope) return false;
  try {
    const data = JSON.stringify(value);
    const storageKey = key(scope);
    sessionStorage.setItem(storageKey, data);
    if (sessionStorage.getItem(storageKey) !== data) return false;
    localStorage.setItem(storageKey, data);
    return localStorage.getItem(storageKey) === data;
  } catch { return false; }
}
export function clearJournalDraft(scope: string | undefined) {
  if (scope) { try {
    const storageKey = key(scope);
    const ownDraft = sessionStorage.getItem(storageKey);
    sessionStorage.setItem(storageKey, "null");
    if (ownDraft !== null && localStorage.getItem(storageKey) === ownDraft)
      localStorage.removeItem(storageKey);
  } catch { /* Retain recoverable draft. */ } }
}
