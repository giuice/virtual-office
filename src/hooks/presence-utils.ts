import type { UserPresenceData } from '@/types/database';

export const ACTIVE_PRESENCE_WINDOW_MS = 2 * 60 * 1000;

function parseLastActiveTime(lastActive?: string | null): number | null {
  if (!lastActive) return null;
  const timestamp = Date.parse(lastActive);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function isStalePresenceRecord(
  lastActive?: string | null,
  now: number = Date.now()
): boolean {
  const timestamp = parseLastActiveTime(lastActive);
  if (timestamp === null) return false;
  return now - timestamp >= ACTIVE_PRESENCE_WINDOW_MS;
}

export function derivePresenceStatus(
  user: UserPresenceData,
  isOnline: boolean,
  isPresenceReady: boolean,
  now: number = Date.now()
): NonNullable<UserPresenceData['status']> {
  const currentStatus = user.status ?? 'offline';

  if (isOnline) {
    return !user.status || user.status === 'offline' ? 'online' : currentStatus;
  }

  // Guard against stale DB rows that still say "online" and retain currentSpaceId.
  // Those rows are intentionally kept for reload recovery, but they must not render
  // as occupants before Realtime presence has finished syncing.
  if (
    user.currentSpaceId &&
    (!user.status || user.status === 'online') &&
    isStalePresenceRecord(user.lastActive, now)
  ) {
    return 'offline';
  }

  if (isPresenceReady && (!user.status || user.status === 'online')) {
    return 'offline';
  }

  return currentStatus;
}
