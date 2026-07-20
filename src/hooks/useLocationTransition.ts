'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchPresenceSnapshot } from '@/hooks/queries/usePresenceSnapshot';
import {
  LocationTransitionCoordinator,
  type LocationTransitionInput,
  type LocationTransitionOutcome,
} from '@/lib/presence/location-transition-coordinator';
import { handleLegacyLocationClientUpgrade } from '@/lib/presence/legacy-client-upgrade';
import { presenceQueryKeys } from '@/lib/presence/query-keys';
import { getPresenceClientEpoch } from '@/lib/presence/client-lifecycle';

interface UseLocationTransitionOptions {
  companyId: string | null;
  userId: string | null;
  sessionId: string | null;
  rotateSession: () => Promise<string | null>;
}

export interface UseLocationTransitionResult {
  transitionLocation: (input: LocationTransitionInput) => Promise<LocationTransitionOutcome>;
  beginManualIntent: () => number;
  releaseManualIntent: (generation: number) => void;
  pendingTargetSpaceId: string | null;
  isSessionRecoveryInProgress: boolean;
  confirmedSessionId: string | null;
  isTransitionPending: boolean;
}

export function useLocationTransition({
  companyId,
  userId,
  sessionId,
  rotateSession,
}: UseLocationTransitionOptions): UseLocationTransitionResult {
  const queryClient = useQueryClient();
  const sessionIdRef = useRef(sessionId);
  const rotateSessionRef = useRef(rotateSession);
  const committedCoordinatorRef = useRef<LocationTransitionCoordinator | null>(null);
  const [pendingTargetSpaceId, setPendingTargetSpaceId] = useState<string | null>(null);
  const [isSessionRecoveryInProgress, setIsSessionRecoveryInProgress] = useState(false);
  const [confirmedSessionId, setConfirmedSessionId] = useState<string | null>(null);
  const [isTransitionPending, setIsTransitionPending] = useState(false);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    rotateSessionRef.current = rotateSession;
  }, [rotateSession, sessionId]);

  const coordinator = useMemo(() => {
    let createdCoordinator: LocationTransitionCoordinator;
    const lifecycleEpoch = getPresenceClientEpoch();
    const isCurrentCoordinator = (): boolean =>
      committedCoordinatorRef.current === createdCoordinator &&
      getPresenceClientEpoch() === lifecycleEpoch;
    createdCoordinator = new LocationTransitionCoordinator({
    getSessionId: () => sessionIdRef.current,
    rotateSession: () => rotateSessionRef.current(),
    reconcile: async (isCurrentCommand) => {
      if (!companyId || !userId) return null;
      const queryKey = presenceQueryKeys.snapshot(companyId, userId);
      const inFlightSnapshot = queryClient.getQueryCache().find({ queryKey, exact: true });
      if (inFlightSnapshot?.state.fetchStatus === 'fetching') {
        await inFlightSnapshot.promise?.catch(() => undefined);
      }
      if (!isCurrentCoordinator() || !isCurrentCommand()) return null;
      const snapshot = await fetchPresenceSnapshot(companyId, userId);
      if (!isCurrentCoordinator() || !isCurrentCommand()) return null;
      if (snapshot.companyId !== companyId || snapshot.viewerUserId !== userId) return null;
      queryClient.setQueryData(queryKey, snapshot);
      const currentUser = snapshot.users.find((user) => user.id === userId);
      return currentUser
        ? {
            currentSpaceId: currentUser.currentSpaceId,
            locationVersion: currentUser.locationVersion,
          }
        : null;
    },
    onClientUpgradeRequired: (response, payload) => {
      handleLegacyLocationClientUpgrade(response, payload);
    },
    onPendingTargetChange: (spaceId) => {
      if (isCurrentCoordinator()) setPendingTargetSpaceId(spaceId);
    },
    onPendingChange: (isPending) => {
      if (isCurrentCoordinator()) setIsTransitionPending(isPending);
    },
    onSessionRecoveryChange: (isRecovering) => {
      if (isCurrentCoordinator()) setIsSessionRecoveryInProgress(isRecovering);
    },
    onSessionConfirmed: (confirmedId) => {
      if (isCurrentCoordinator()) setConfirmedSessionId(confirmedId);
    },
    });
    return createdCoordinator;
  }, [companyId, queryClient, userId]);

  useEffect(() => {
    committedCoordinatorRef.current = coordinator;
    setPendingTargetSpaceId(null);
    setIsTransitionPending(false);
    setIsSessionRecoveryInProgress(false);
    setConfirmedSessionId(null);
    return () => {
      if (committedCoordinatorRef.current === coordinator) {
        committedCoordinatorRef.current = null;
      }
      queueMicrotask(() => {
        if (committedCoordinatorRef.current !== coordinator) coordinator.dispose();
      });
    };
  }, [coordinator]);

  const transitionLocation = useCallback(
    (input: LocationTransitionInput) => coordinator.transition(input),
    [coordinator]
  );
  const beginManualIntent = useCallback(() => coordinator.beginManualIntent(), [coordinator]);
  const releaseManualIntent = useCallback(
    (generation: number) => coordinator.releaseManualIntent(generation),
    [coordinator]
  );

  return {
    transitionLocation,
    beginManualIntent,
    releaseManualIntent,
    pendingTargetSpaceId,
    isSessionRecoveryInProgress,
    confirmedSessionId,
    isTransitionPending,
  };
}
