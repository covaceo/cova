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
}

export function removeCurrentIdentityStorage() {
  const identity = getActiveStorageIdentity();
  const suffix = `:${identity || "signed-out"}`;
  for (const storage of [localStorage, sessionStorage]) {
    const keys = Array.from({ length: storage.length }, (_value, index) => storage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith("cova-") && key.endsWith(suffix)));
    keys.forEach((key) => storage.removeItem(key));
  }
}
