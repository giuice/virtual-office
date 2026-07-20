'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePresenceSnapshot } from '@/hooks/queries/usePresenceSnapshot';
import {
  usePresenceRealtime,
  type PresenceRealtimeConnectionStatus,
} from '@/hooks/usePresenceRealtime';
import type { UserPresenceData } from '@/types/database';
import type { PresenceSnapshotUser } from '@/lib/presence/contracts';
import { presenceQueryKeys } from '@/lib/presence/query-keys';
import {
  removeLegacyPresenceStorage,
  removeScopedPresenceStorage,
} from '@/lib/presence/storage-keys';
import { PresenceSnapshotRequestError } from '@/hooks/queries/usePresenceSnapshot';
import { invalidatePresenceClientLifecycle } from '@/lib/presence/client-lifecycle';

export function mapSnapshotUser(user: PresenceSnapshotUser): UserPresenceData {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? undefined,
    status: user.displayStatus,
    dbStatus: user.availabilityStatus,
    availabilityStatus: user.availabilityStatus,
    displayStatus: user.displayStatus,
    statusMessage: user.statusMessage ?? undefined,
    isOnline: user.isConnected,
    currentSpaceId: user.currentSpaceId,
    locationVersion: user.locationVersion,
    isConnected: user.isConnected,
    isOccupyingCurrentSpace: user.isOccupyingCurrentSpace,
  };
}
export function groupPresenceUsersBySpace(
  users: readonly UserPresenceData[],
): Map<string | null, UserPresenceData[]> {
  const grouped = new Map<string | null, UserPresenceData[]>();
  for (const user of users) {
    if (user.isOccupyingCurrentSpace !== true || user.currentSpaceId === null) {
      continue;
    }

    const occupants = grouped.get(user.currentSpaceId) ?? [];
    occupants.push(user);
    grouped.set(user.currentSpaceId, occupants);
  }
  return grouped;
}

export function getPresenceScopeInvalidationReason(
  error: unknown,
): 'auth-session-revoked' | 'membership-scope-invalidated' | null {
  if (!(error instanceof PresenceSnapshotRequestError)) return null;
  if (error.code === 'AUTH_SESSION_REVOKED') return 'auth-session-revoked';
  if (
    error.code === 'PRESENCE_VIEWER_NO_COMPANY' ||
    error.code === 'SNAPSHOT_IDENTITY_MISMATCH'
  ) {
    return 'membership-scope-invalidated';
  }
  return null;
}

export interface UserPresenceResult {
  users: UserPresenceData[] | undefined;
  usersInSpaces: Map<string | null, UserPresenceData[]>;
  isLoading: boolean;
  error: unknown;
  connectionStatus: PresenceRealtimeConnectionStatus;
  isRealtimeDegraded: boolean;
  snapshot: ReturnType<typeof usePresenceSnapshot>['data'];
  retrySnapshot: () => void;
}

/** Authoritative snapshot facade with private Realtime invalidation. */
export function useUserPresence(
  currentUserId?: string,
  companyId?: string,
  registeredSessionId: string | null = null,
): UserPresenceResult {
  const queryClient = useQueryClient();
  const previousScopeRef = useRef<{ companyId: string; userId: string } | null>(null);
  const scopeKey = companyId && currentUserId ? `${companyId}:${currentUserId}` : null;
  const [revokedScopeKey, setRevokedScopeKey] = useState<string | null>(null);
  const enabled = Boolean(
    currentUserId && companyId && revokedScopeKey !== scopeKey,
  );
  const snapshotQuery = usePresenceSnapshot(
    companyId ?? '',
    currentUserId ?? '',
    enabled,
  );
  const { refetch: refetchSnapshot } = snapshotQuery;
  const connectionStatus = usePresenceRealtime(
    companyId ?? '',
    currentUserId ?? '',
    registeredSessionId,
    enabled,
  );
  const users = useMemo(
    () => snapshotQuery.data?.users.map(mapSnapshotUser),
    [snapshotQuery.data],
  );
  const usersInSpaces = useMemo(
    () => groupPresenceUsersBySpace(users ?? []),
    [users],
  );
  const retrySnapshot = useCallback((): void => {
    void refetchSnapshot();
  }, [refetchSnapshot]);

  useEffect(() => {
    if (revokedScopeKey && revokedScopeKey !== scopeKey) {
      setRevokedScopeKey(null);
    }
  }, [revokedScopeKey, scopeKey]);

  useEffect(() => {
    const invalidationReason = getPresenceScopeInvalidationReason(snapshotQuery.error);
    if (
      !scopeKey ||
      !companyId ||
      !currentUserId ||
      !invalidationReason
    ) {
      return;
    }

    setRevokedScopeKey(scopeKey);
    void queryClient.cancelQueries({
      queryKey: presenceQueryKeys.user(companyId, currentUserId),
    });
    queryClient.removeQueries({
      queryKey: presenceQueryKeys.user(companyId, currentUserId),
    });
    try {
      removeScopedPresenceStorage(window.localStorage, companyId, currentUserId);
    } catch {
      // A fenced identity must still stop even if advisory storage is blocked.
    }
    invalidatePresenceClientLifecycle({
      reason: invalidationReason,
      companyId,
      userId: currentUserId,
    });
  }, [
    companyId,
    currentUserId,
    queryClient,
    scopeKey,
    snapshotQuery.error,
  ]);

  useEffect(() => {
    try {
      removeLegacyPresenceStorage(window.localStorage);
    } catch {
      // Advisory storage must not block authoritative Presence startup.
    }

    const previousScope = previousScopeRef.current;
    if (
      previousScope &&
      (previousScope.companyId !== companyId || previousScope.userId !== currentUserId)
    ) {
      queryClient.removeQueries({
        queryKey: presenceQueryKeys.user(previousScope.companyId, previousScope.userId),
      });
      try {
        removeScopedPresenceStorage(
          window.localStorage,
          previousScope.companyId,
          previousScope.userId,
        );
      } catch {
        // Advisory storage must not block an account/company transition.
      }
    }

    previousScopeRef.current = enabled && companyId && currentUserId
      ? { companyId, userId: currentUserId }
      : null;
  }, [companyId, currentUserId, enabled, queryClient]);

  return {
    users,
    usersInSpaces,
    isLoading: snapshotQuery.isLoading,
    error: snapshotQuery.error,
    connectionStatus,
    isRealtimeDegraded: connectionStatus === 'degraded',
    snapshot: snapshotQuery.data,
    retrySnapshot,
  };
}
