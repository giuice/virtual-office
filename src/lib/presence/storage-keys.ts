const PRESENCE_STORAGE_PREFIX = "vo:presence";
const LEGACY_PRESENCE_KEYS = [
  "lastSpaceId",
  "vo-disconnect-timestamp",
  "vo-first-login-done",
] as const;
const LEGACY_KNOCK_PREFIX = "vo-knock-cooldown-";

// These keys hold scoped recovery hints only. Their values are never authority
// for placement, connectivity, access, capacity, or expiry decisions.
function scopedPresenceStoragePrefix(
  companyId: string,
  userId: string,
): string {
  return `${PRESENCE_STORAGE_PREFIX}:${companyId}:${userId}`;
}

export const presenceStorageKeys = {
  lastSpace: (companyId: string, userId: string): string =>
    `${scopedPresenceStoragePrefix(companyId, userId)}:last-space`,
  disconnectTimestamp: (companyId: string, userId: string): string =>
    `${scopedPresenceStoragePrefix(companyId, userId)}:disconnect-timestamp`,
  knockCooldown: (companyId: string, userId: string, spaceId: string): string =>
    `${scopedPresenceStoragePrefix(companyId, userId)}:knock-cooldown:${spaceId}`,
};

function collectKeys(
  storage: Storage,
  predicate: (key: string) => boolean,
): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && predicate(key)) keys.push(key);
  }
  return keys;
}

function removeKeys(storage: Storage, keys: readonly string[]): void {
  for (const key of keys) storage.removeItem(key);
}

export function removeLegacyPresenceStorage(storage: Storage): void {
  removeKeys(
    storage,
    collectKeys(
      storage,
      (key) =>
        LEGACY_PRESENCE_KEYS.some((legacyKey) => key === legacyKey) ||
        key.startsWith(LEGACY_KNOCK_PREFIX),
    ),
  );
}

export function removeScopedPresenceStorage(
  storage: Storage,
  companyId: string,
  userId: string,
): void {
  const prefix = `${scopedPresenceStoragePrefix(companyId, userId)}:`;
  removeKeys(storage, collectKeys(storage, (key) => key.startsWith(prefix)));
}

export function clearAllPresenceStorage(storage: Storage): void {
  removeKeys(
    storage,
    collectKeys(
      storage,
      (key) =>
        key.startsWith(`${PRESENCE_STORAGE_PREFIX}:`) ||
        LEGACY_PRESENCE_KEYS.some((legacyKey) => key === legacyKey) ||
        key.startsWith(LEGACY_KNOCK_PREFIX),
    ),
  );
}
