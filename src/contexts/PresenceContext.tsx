'use client';
import React, { createContext, use, ReactNode, useCallback, useMemo } from 'react';
import { usePresenceSession } from '@/hooks/usePresenceSession';
import { useLastSpace } from '@/hooks/useLastSpace';
import { useCompany } from '@/contexts/CompanyContext';
import type { UserPresenceData } from '@/types/database';
import type { Space } from '@/types/database';
import { useUserPresence } from '@/hooks/useUserPresence';
import { useLocationTransition } from '@/hooks/useLocationTransition';
import type { PresenceRealtimeConnectionStatus } from '@/hooks/usePresenceRealtime';
import type { PresenceSnapshot } from '@/lib/presence/contracts';
import type {
  LocationTransitionInput,
  LocationTransitionOutcome,
} from '@/lib/presence/location-transition-coordinator';

interface UpdateLocationOptions {
  reason?: LocationTransitionInput['reason'];
  knockRequestId?: string;
  expectedLocationVersion?: number;
  intentGeneration?: number;
}

interface PresenceContextType { users: UserPresenceData[] | undefined;
  usersInSpaces: Map<string | null, UserPresenceData[]>;
  isLoading: boolean;
  error: unknown;
  updateLocation: (spaceId: string | null, options?: UpdateLocationOptions) => Promise<LocationTransitionOutcome>;
  transitionLocation: (input: LocationTransitionInput) => Promise<LocationTransitionOutcome>;
  beginManualIntent: () => number;
  releaseManualIntent: (generation: number) => void;
  pendingTargetSpaceId: string | null;
  presenceSessionId: string | null;
  presenceSnapshot: PresenceSnapshot | undefined;
  realtimeConnectionStatus: PresenceRealtimeConnectionStatus;
  isRealtimeDegraded: boolean;
  retryPresence: () => void;
  currentUserSpaceId: string | null;
  saveLastSpace: (spaceId: string) => void;
  clearLastSpace: () => void; }

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);
const NO_PRESENCE_SPACES: Space[] = [];

export const PresenceProvider = ({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) => { // Get current user ID from CompanyContext
  const { company, currentUserProfile, spaces } = useCompany();
  const currentUserId = enabled ? currentUserProfile?.id : undefined;
  const presenceCompany = enabled ? company : null;
  const presenceSpaces = enabled ? spaces : NO_PRESENCE_SPACES;

  const {
    sessionId: presenceSessionId,
    rotateSession,
  } = usePresenceSession(currentUserId ?? null, presenceCompany?.id ?? null);
  const {
    users,
    usersInSpaces,
    isLoading,
    error,
    connectionStatus: realtimeConnectionStatus,
    snapshot: presenceSnapshot,
    retrySnapshot: retryPresence,
  } = useUserPresence(currentUserId, presenceCompany?.id, presenceSessionId);
  const {
    transitionLocation,
    beginManualIntent,
    releaseManualIntent,
    pendingTargetSpaceId,
    isSessionRecoveryInProgress,
    confirmedSessionId,
    isTransitionPending,
  } = useLocationTransition({
    companyId: presenceCompany?.id ?? null,
    userId: currentUserId ?? null,
    sessionId: presenceSessionId,
    rotateSession,
  });
  const currentUserPresence = users?.find((user) => user.id === currentUserId) ?? null;
  const {
    saveLastSpace,
    clearLastSpace,
    suppressAutoPlacement,
    resumeAutoPlacement,
  } = useLastSpace(currentUserPresence, presenceSpaces, presenceCompany, {
    sessionId: presenceSessionId,
    snapshot: presenceSnapshot,
    transitionLocation,
    isSessionRecoveryInProgress,
    confirmedSessionId,
    isTransitionPending,
  });

  const updateLocation = useCallback(async (
    spaceId: string | null,
    options: UpdateLocationOptions = {}
  ): Promise<LocationTransitionOutcome> => {
    const reason = options.reason ?? (
      options.knockRequestId ? 'knock-enter' : spaceId === null ? 'manual-leave' : 'manual-enter'
    );
    const outcome = await transitionLocation({
      spaceId,
      reason,
      knockRequestId: options.knockRequestId,
      expectedLocationVersion: options.expectedLocationVersion,
      intentGeneration: options.intentGeneration,
    });

    if (outcome.ok) {
      if (spaceId === null) {
        suppressAutoPlacement();
      } else {
        resumeAutoPlacement();
        saveLastSpace(spaceId);
      }
    }
    return outcome;
  }, [resumeAutoPlacement, saveLastSpace, suppressAutoPlacement, transitionLocation]);

  // Get current user's space ID for messaging integration
  const currentUserSpaceId = currentUserPresence?.isOccupyingCurrentSpace
    ? currentUserPresence.currentSpaceId
    : null;

  // DISABLED: Auto-manage room conversations based on presence
  // This was causing drawer to auto-open on dashboard with persisted space data
  // TODO: Move conversation opening to floor plan click handlers for explicit navigation only

  // Log for debugging purposes
  if (process.env.NODE_ENV === 'development') { // console.log(`[PresenceContext] Current user ID: ${currentUserId || 'not set' }`);
    // console.log(`[PresenceContext] Current user space ID: ${currentUserSpaceId || 'not in space'}`);
  }

  const value = useMemo(
    () => ({
      users,
      usersInSpaces,
      isLoading,
      error,
      updateLocation,
      transitionLocation,
      beginManualIntent,
      releaseManualIntent,
      pendingTargetSpaceId,
      presenceSessionId,
      presenceSnapshot,
      realtimeConnectionStatus,
      isRealtimeDegraded: realtimeConnectionStatus === 'degraded',
      retryPresence,
      currentUserSpaceId,
      saveLastSpace,
      clearLastSpace,
    }),
    [
      beginManualIntent,
      releaseManualIntent,
      currentUserSpaceId,
      clearLastSpace,
      pendingTargetSpaceId,
      presenceSessionId,
      presenceSnapshot,
      realtimeConnectionStatus,
      retryPresence,
      saveLastSpace,
      error,
      isLoading,
      transitionLocation,
      updateLocation,
      users,
      usersInSpaces,
    ]
  );

  return (
    <PresenceContext.Provider
      value={value}
    >
      {children}
    </PresenceContext.Provider>
  );
};

export function usePresence(): PresenceContextType { const context = use(PresenceContext);
  if (!context) {
    throw new Error('usePresence must be used within a PresenceProvider'); }
  return context;
}
