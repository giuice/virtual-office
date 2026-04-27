'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Company, Space } from '@/types/database';
import type { UserPresenceData } from '@/types/database';

const MAX_REJOIN_ATTEMPTS = 3;
export const GRACE_PERIOD_MS = 5 * 60 * 1000;
export const DISCONNECT_TS_KEY = 'vo-disconnect-timestamp';
export const FIRST_LOGIN_KEY = 'vo-first-login-done';

export interface ReconnectionContext {
  type: 'grace-rejoin' | 'home-space' | 'default-space' | 'fallback' | 'first-time';
  spaceId: string | null;
  spaceName?: string;
  reason: string;
}

interface LocationUpdateOptions {
  attempt?: number;
  contextType?: ReconnectionContext['type'];
  fallbackFromSpaceName?: string;
  spaceName?: string;
}

interface LastSpaceUser {
  id: string;
  currentSpaceId: string | null;
}

const JOINABLE_STATUSES = new Set(['active', 'available', 'in_use']);

function isJoinableSpace(space: Space): boolean {
  return JOINABLE_STATUSES.has(space.status);
}

function getActiveSpaceById(spaces: Space[], spaceId: string | null | undefined): Space | undefined {
  if (!spaceId) {
    return undefined;
  }

  return spaces.find((space) => space.id === spaceId && isJoinableSpace(space));
}

function getFirstActiveWorkspace(spaces: Space[]): Space | undefined {
  return spaces.find((space) => space.type === 'workspace' && isJoinableSpace(space));
}

function getStandardPlacementContext(
  currentUser: Pick<LastSpaceUser, 'id'>,
  spaces: Space[],
  company: Company | null,
  isFirstTime: boolean
): ReconnectionContext {
  if (isFirstTime) {
    const defaultSpace = getActiveSpaceById(spaces, company?.settings?.defaultSpaceId);
    if (defaultSpace) {
      return {
        type: 'first-time',
        spaceId: defaultSpace.id,
        spaceName: defaultSpace.name,
        reason: 'First login -- placed in company default space',
      };
    }

    const firstWorkspace = getFirstActiveWorkspace(spaces);
    if (firstWorkspace) {
      return {
        type: 'first-time',
        spaceId: firstWorkspace.id,
        spaceName: firstWorkspace.name,
        reason: 'First login -- no default space set, using first workspace',
      };
    }

    return { type: 'fallback', spaceId: null, reason: 'No active spaces available' };
  }

  const homeSpace = getActiveSpaceById(
    spaces,
    company?.settings?.homeSpaces?.[currentUser.id]
  );
  if (homeSpace) {
    return {
      type: 'home-space',
      spaceId: homeSpace.id,
      spaceName: homeSpace.name,
      reason: 'Returning user -- assigned home space',
    };
  }

  const defaultSpace = getActiveSpaceById(spaces, company?.settings?.defaultSpaceId);
  if (defaultSpace) {
    return {
      type: 'default-space',
      spaceId: defaultSpace.id,
      spaceName: defaultSpace.name,
      reason: 'No home space assigned -- using company default',
    };
  }

  const firstWorkspace = getFirstActiveWorkspace(spaces);
  if (firstWorkspace) {
    return {
      type: 'fallback',
      spaceId: firstWorkspace.id,
      spaceName: firstWorkspace.name,
      reason: 'No home or default space -- first active workspace',
    };
  }

  return { type: 'fallback', spaceId: null, reason: 'No active spaces available' };
}

export function getReconnectionContext(
  currentUser: Pick<LastSpaceUser, 'id'>,
  spaces: Space[],
  company: Company | null,
  lastSpaceId: string | null
): ReconnectionContext {
  const disconnectTimestamp = typeof window !== 'undefined'
    ? window.localStorage.getItem(DISCONNECT_TS_KEY)
    : null;
  const disconnectTs = disconnectTimestamp ? Number.parseInt(disconnectTimestamp, 10) : 0;
  const withinGrace = disconnectTs > 0 && Date.now() - disconnectTs < GRACE_PERIOD_MS;

  if (withinGrace && lastSpaceId) {
    const lastSpace = getActiveSpaceById(spaces, lastSpaceId);
    if (lastSpace) {
      return {
        type: 'grace-rejoin',
        spaceId: lastSpace.id,
        spaceName: lastSpace.name,
        reason: 'Within 5-minute grace period',
      };
    }
  }

  const isFirstTime = typeof window === 'undefined'
    ? true
    : !window.localStorage.getItem(FIRST_LOGIN_KEY);

  return getStandardPlacementContext(currentUser, spaces, company, isFirstTime);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const PRESENCE_QUERY_KEY = ['user-presence'];

export function useLastSpace(currentUser: LastSpaceUser | null, spaces: Space[], company: Company | null) {
  const [lastSpaceId, setLastSpaceId] = useLocalStorage<string | null>('lastSpaceId', null);
  const [isRejoinInProgress, setIsRejoinInProgress] = useState(false);
  const [rejoinAttempts, setRejoinAttempts] = useState(0);
  const isUpdatingRef = useRef(false);
  const lastUpdateRef = useRef<string | null>(null);
  // When true, the auto-placement effect skips its next run.
  // Set by saveLastSpace() so that manual space clicks (which already call
  // updateLocation via PresenceContext) are never overwritten by auto-placement
  // trying to move the user back to home/default space.
  const manualChangeRef = useRef(false);
  const queryClient = useQueryClient();

  const markFirstLoginComplete = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FIRST_LOGIN_KEY, 'true');
    }
  }, []);

  const clearDisconnectTimestamp = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DISCONNECT_TS_KEY);
    }
  }, []);

  const saveDisconnectTimestamp = useCallback(() => {
    if (typeof window !== 'undefined' && (currentUser?.currentSpaceId || lastSpaceId)) {
      window.localStorage.setItem(DISCONNECT_TS_KEY, Date.now().toString());
    }
  }, [currentUser?.currentSpaceId, lastSpaceId]);

  const updateUserLocation = useCallback(async (
    userId: string,
    spaceId: string | null,
    options: LocationUpdateOptions = {}
  ) => {
    if (!spaceId) {
      return;
    }

    if (isUpdatingRef.current) {
      return;
    }

    const initialContextType = options.contextType;
    let attempt = options.attempt ?? 0;
    let targetSpaceId = spaceId;
    let targetSpaceName = options.spaceName;
    let contextType = initialContextType;
    let fallbackFromSpaceName = options.fallbackFromSpaceName;

    isUpdatingRef.current = true;
    setIsRejoinInProgress(true);
    setRejoinAttempts(attempt);

    try {
      while (attempt < MAX_REJOIN_ATTEMPTS) {
        const response = await fetch('/api/users/location', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, spaceId: targetSpaceId }),
        });

        if (response.ok) {
          console.log('[useLastSpace] API call succeeded, placing user in space:', targetSpaceId);
          const updateKey = `${userId}-${targetSpaceId}`;
          lastUpdateRef.current = updateKey;
          setLastSpaceId(targetSpaceId);
          setRejoinAttempts(0);
          clearDisconnectTimestamp();

          // Optimistically update presence query data so the user appears in their space
          // immediately, without waiting for Realtime postgres_changes event
          queryClient.setQueryData<UserPresenceData[]>(PRESENCE_QUERY_KEY, (old) => {
            if (!old) return old;
            return old.map(u =>
              u.id === userId ? { ...u, currentSpaceId: targetSpaceId, status: u.status === 'offline' ? 'online' : u.status } : u
            );
          });

          // Fallback: if query data wasn't available for optimistic update, force a refetch
          // so the user appears in the space once the query loads from the (now-updated) DB
          const currentData = queryClient.getQueryData<UserPresenceData[]>(PRESENCE_QUERY_KEY);
          if (!currentData) {
            void queryClient.invalidateQueries({ queryKey: PRESENCE_QUERY_KEY });
          }

          if (contextType === 'first-time') {
            markFirstLoginComplete();
          }

          if (fallbackFromSpaceName && targetSpaceName) {
            toast(`${fallbackFromSpaceName} is full -- moved to ${targetSpaceName}`);
          } else if (contextType === 'grace-rejoin' && targetSpaceName) {
            toast(`Reconnected to ${targetSpaceName}`);
          } else if (contextType === 'first-time' && targetSpaceName) {
            toast(`Welcome! You've been placed in ${targetSpaceName}`);
          }

          return;
        }

        const errorData = await response.json().catch(() => ({
          code: 'UNKNOWN',
          message: 'Failed to parse error response',
        }));

        console.error('[useLastSpace] API call failed:', { status: response.status, code: errorData.code, message: errorData.message, targetSpaceId });

        if (response.status === 409 && errorData.code === 'SPACE_FULL' && currentUser) {
          const fallbackContext = getStandardPlacementContext(
            currentUser,
            spaces,
            company,
            false
          );

          if (fallbackContext.spaceId && fallbackContext.spaceId !== targetSpaceId) {
            fallbackFromSpaceName = targetSpaceName || 'The space';
            targetSpaceId = fallbackContext.spaceId;
            targetSpaceName = fallbackContext.spaceName;
            contextType = fallbackContext.type;
            attempt = 0;
            setRejoinAttempts(0);
            continue;
          }

          setLastSpaceId(null);
          setRejoinAttempts(0);
          toast.error('Cannot join - space is full', {
            description: `${targetSpaceName || 'The space'} is currently at capacity. Try again later.`,
          });
          return;
        }

        attempt += 1;
        setRejoinAttempts(attempt);

        if (attempt >= MAX_REJOIN_ATTEMPTS) {
          setLastSpaceId(null);
          setRejoinAttempts(0);
          toast.error('Rejoin Failed', {
            description: errorData.message || response.statusText,
          });
          return;
        }

        const backoffDelay = Math.pow(2, attempt) * 1000;
        await sleep(backoffDelay);
      }
    } catch (error) {
      setLastSpaceId(null);
      setRejoinAttempts(0);
      toast.error('Rejoin Failed', {
        description: error instanceof Error
          ? error.message
          : `Network error trying to rejoin ${targetSpaceName || 'last space'}.`,
      });
    } finally {
      isUpdatingRef.current = false;
      setIsRejoinInProgress(false);
    }
  }, [
    clearDisconnectTimestamp,
    company,
    currentUser,
    markFirstLoginComplete,
    setLastSpaceId,
    spaces,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleDisconnect = () => {
      saveDisconnectTimestamp();
    };

    window.addEventListener('beforeunload', handleDisconnect);
    window.addEventListener('pagehide', handleDisconnect);

    return () => {
      window.removeEventListener('beforeunload', handleDisconnect);
      window.removeEventListener('pagehide', handleDisconnect);
    };
  }, [saveDisconnectTimestamp]);

  useEffect(() => {
    // Skip when saveLastSpace() was just called — the user clicked a space
    // manually and the API call is already handled by PresenceContext.updateLocation.
    // Auto-placement must not overwrite it with the home/default space.
    if (manualChangeRef.current) {
      manualChangeRef.current = false;
      console.log('[useLastSpace] Skipped: manual space change in progress');
      return;
    }

    if (isUpdatingRef.current || isRejoinInProgress) {
      console.log('[useLastSpace] Skipped: update in progress');
      return;
    }

    if (!currentUser || spaces.length === 0) {
      console.log('[useLastSpace] Skipped: no currentUser or no spaces', { hasUser: !!currentUser, spacesCount: spaces.length });
      return;
    }

    const context = getReconnectionContext(currentUser, spaces, company, lastSpaceId);
    console.log('[useLastSpace] Reconnection context:', { type: context.type, spaceId: context.spaceId, spaceName: context.spaceName, reason: context.reason, userCurrentSpaceId: currentUser.currentSpaceId, lastSpaceId });

    if (!context.spaceId) {
      console.log('[useLastSpace] Skipped: no target spaceId in context');
      return;
    }

    const updateKey = `${currentUser.id}-${context.spaceId}`;
    if (lastUpdateRef.current === updateKey) {
      console.log('[useLastSpace] Skipped: already updated with this key');
      return;
    }

    if (currentUser.currentSpaceId === context.spaceId) {
      console.log('[useLastSpace] Already in target space, setting updateKey only');
      lastUpdateRef.current = updateKey;
      setLastSpaceId(context.spaceId);
      if (context.type === 'first-time') {
        markFirstLoginComplete();
      }
      clearDisconnectTimestamp();
      return;
    }

    if (currentUser.currentSpaceId && currentUser.currentSpaceId !== context.spaceId) {
      console.log('[useLastSpace] Skipped: user already in different space', { currentSpaceId: currentUser.currentSpaceId, targetSpaceId: context.spaceId });
      return;
    }

    console.log('[useLastSpace] Calling updateUserLocation:', { userId: currentUser.id, spaceId: context.spaceId, contextType: context.type });
    void updateUserLocation(currentUser.id, context.spaceId, {
      contextType: context.type,
      spaceName: context.spaceName,
    });
  }, [
    clearDisconnectTimestamp,
    company,
    currentUser,
    isRejoinInProgress,
    lastSpaceId,
    markFirstLoginComplete,
    spaces,
    updateUserLocation,
  ]);

  const saveLastSpace = useCallback((spaceId: string) => {
    // Signal that this is a manual space change — the auto-placement effect
    // must skip its next run so it doesn't overwrite the user's click with
    // the home/default space. The API call is handled separately by
    // PresenceContext.updateLocation (called from ModernFloorPlan).
    manualChangeRef.current = true;
    setLastSpaceId(spaceId);
  }, [setLastSpaceId]);

  const clearLastSpace = useCallback(() => {
    saveDisconnectTimestamp();
    setLastSpaceId(null);
    lastUpdateRef.current = null;
  }, [saveDisconnectTimestamp, setLastSpaceId]);

  return {
    lastSpaceId,
    saveLastSpace,
    clearLastSpace,
    isRejoinInProgress,
    rejoinAttempts,
  };
}
