const ACTIVE_STORAGE_IDENTITY_KEY = "cova-active-storage-identity-v1";

function normalizeIdentity(identity: string) {
  return encodeURIComponent(identity.trim().toLowerCase());
}

export function setActiveStorageIdentity(identity: string) {
  const normalized = normalizeIdentity(identity);
  if (normalized) {
    localStorage.setItem(ACTIVE_STORAGE_IDENTITY_KEY, normalized);
  }
}

export function getActiveStorageIdentity() {
  return localStorage.getItem(ACTIVE_STORAGE_IDENTITY_KEY) || "";
}

export function clearActiveStorageIdentity() {
  localStorage.removeItem(ACTIVE_STORAGE_IDENTITY_KEY);
}

export function scopedStorageKey(baseKey: string) {
  const identity = getActiveStorageIdentity();
  return identity ? `${baseKey}:${identity}` : `${baseKey}:signed-out`;
}

export function removeScopedStorage(baseKey: string) {
  localStorage.removeItem(scopedStorageKey(baseKey));
  localStorage.removeItem(baseKey);
}
