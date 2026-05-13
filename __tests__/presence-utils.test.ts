import { describe, expect, it } from 'vitest';
import { ACTIVE_PRESENCE_WINDOW_MS, derivePresenceStatus } from '@/hooks/presence-utils';
import type { UserPresenceData } from '@/types/database';

const NOW = Date.parse('2026-05-13T18:11:32.717Z');

function makeUser(overrides: Partial<UserPresenceData> = {}): UserPresenceData {
  return {
    id: 'user-1',
    displayName: 'Ghost User',
    status: 'online',
    currentSpaceId: 'space-1',
    lastActive: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe('derivePresenceStatus', () => {
  it('marks stale DB-online space occupants offline before presence sync is ready', () => {
    const staleUser = makeUser({
      lastActive: new Date(NOW - ACTIVE_PRESENCE_WINDOW_MS - 1).toISOString(),
    });

    expect(derivePresenceStatus(staleUser, false, false, NOW)).toBe('offline');
  });

  it('keeps recently active DB-online occupants visible until presence sync resolves', () => {
    const recentUser = makeUser({
      lastActive: new Date(NOW - ACTIVE_PRESENCE_WINDOW_MS + 1).toISOString(),
    });

    expect(derivePresenceStatus(recentUser, false, false, NOW)).toBe('online');
  });

  it('uses realtime presence as authority when the user is online', () => {
    const offlineDbUser = makeUser({
      status: 'offline',
      lastActive: new Date(NOW - ACTIVE_PRESENCE_WINDOW_MS - 1).toISOString(),
    });

    expect(derivePresenceStatus(offlineDbUser, true, true, NOW)).toBe('online');
  });

  it('marks DB-online users offline after presence sync if they are absent from realtime', () => {
    const recentUser = makeUser({
      lastActive: new Date(NOW - 1000).toISOString(),
    });

    expect(derivePresenceStatus(recentUser, false, true, NOW)).toBe('offline');
  });
});
