import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useKnock } from '@/hooks/useKnock';
import {
  KnockRequestPayload,
  KnockResponsePayload,
  useKnockSignaling,
} from '@/hooks/realtime/useKnockSignaling';
import type { Space, User, UserPresenceData } from '@/types/database';
import type { LocationTransitionOutcome } from '@/lib/presence/location-transition-coordinator';

interface LocationUpdateOptions {
  reason?: 'manual-enter' | 'manual-leave' | 'knock-enter';
  knockRequestId?: string;
  expectedLocationVersion?: number;
  intentGeneration?: number;
}

interface UseModernFloorPlanKnockOptions {
  spaces: Space[];
  users: UserPresenceData[] | undefined;
  usersInSpaces: Map<string | null, UserPresenceData[]>;
  currentUserProfile: User | null;
  isAdmin: boolean;
  updateLocation: (spaceId: string | null, options?: LocationUpdateOptions) => Promise<LocationTransitionOutcome>;
  beginManualIntent: () => number;
  releaseManualIntent: (generation: number) => void;
  presenceSessionId: string | null;
  onSpaceSelect?: (space: Space) => void;
  onOpenChat?: (space: Space) => void;
  onSpaceLeave?: () => void;
}

interface KnockTimeoutState {
  spaceId: string | null;
}

type KnockTimeoutAction =
  | { type: 'show'; spaceId: string | null }
  | { type: 'clear' };

function knockTimeoutReducer(_state: KnockTimeoutState, action: KnockTimeoutAction): KnockTimeoutState {
  switch (action.type) {
    case 'show':
      return { spaceId: action.spaceId };
    case 'clear':
      return { spaceId: null };
  }
}

export function useModernFloorPlanKnock({
  spaces,
  users,
  usersInSpaces,
  currentUserProfile,
  isAdmin,
  updateLocation,
  beginManualIntent,
  releaseManualIntent,
  presenceSessionId,
  onSpaceSelect,
  onOpenChat,
  onSpaceLeave,
}: UseModernFloorPlanKnockOptions) {
  const [error, setError] = useState<string | null>(null);
  const [pendingKnockRequests, setPendingKnockRequests] = useState<Map<string, KnockRequestPayload>>(new Map());
  const [respondingKnockRequestIds, setRespondingKnockRequestIds] = useState<Set<string>>(new Set());
  const [knockTimeoutState, dispatchKnockTimeout] = useReducer(knockTimeoutReducer, { spaceId: null });
  const [activeKnockRequestId, setActiveKnockRequestId] = useState<string | null>(null);
  const activeKnockSpaceIdRef = useRef<string | null>(null);
  const activeKnockIntentGenerationRef = useRef<number | null>(null);
  const knockStatusToastRef = useRef<string | null>(null);
  const knockBannerTimeoutsRef = useRef<Map<string, NodeJS.Timeout> | null>(null);
  const timeoutResetRef = useRef<NodeJS.Timeout | null>(null);
  const respondToKnockRef = useRef<((input: {
    spaceId: string;
    requestId: string;
    requesterId: string;
    requesterName: string;
    decision: 'APPROVE' | 'DENY';
  }) => Promise<unknown>) | null>(null);
  const respondingKnockRequestIdsRef = useRef(new Set<string>());
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  if (knockBannerTimeoutsRef.current === null) {
    knockBannerTimeoutsRef.current = new Map();
  }
  const knockBannerTimeouts = knockBannerTimeoutsRef.current;

  const {
    status: knockStatus,
    targetSpaceId: knockTargetSpaceId,
    knock: startKnock,
    reset: resetKnock,
    canKnock: canStartKnock,
    getCooldownRemaining,
    handleApproval,
    handleDenial,
  } = useKnock(currentUserProfile?.companyId ?? null, currentUserProfile?.id ?? null);

  const currentUser = useMemo(
    () => users?.find((user) => user.id === currentUserProfile?.id),
    [users, currentUserProfile?.id]
  );
  const occupiedSpaceId = currentUser?.isOccupyingCurrentSpace
    ? currentUser.currentSpaceId
    : null;

  const playKnockCue = useCallback(() => {
    try {
      const audio = new Audio('/sounds/knock.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {
        // Browser autoplay policy prevented playback - not critical
      });
    } catch {
      // Sound cue is best-effort, never block knock flow
    }
  }, []);

  const handleIncomingKnockRequest = useCallback((payload: KnockRequestPayload) => {
    playKnockCue();
    setPendingKnockRequests((prev) => {
      const next = new Map(prev);
      next.set(payload.requestId, payload);
      return next;
    });

    const existingTimeout = knockBannerTimeouts.get(payload.requestId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutId = setTimeout(() => {
      setPendingKnockRequests((prev) => {
        const currentRequest = prev.get(payload.requestId);
        if (!currentRequest || currentRequest.requestId !== payload.requestId) {
          return prev;
        }

        const next = new Map(prev);
        next.delete(payload.requestId);
        return next;
      });
      knockBannerTimeouts.delete(payload.requestId);
    }, 30000);

    knockBannerTimeouts.set(payload.requestId, timeoutId);
  }, [knockBannerTimeouts, playKnockCue]);

  const clearPendingKnockRequest = useCallback((requestId: string) => {
    const timeoutId = knockBannerTimeouts.get(requestId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      knockBannerTimeouts.delete(requestId);
    }

    setPendingKnockRequests((prev) => {
      if (!prev.has(requestId)) {
        return prev;
      }

      const next = new Map(prev);
      next.delete(requestId);
      return next;
    });
  }, [knockBannerTimeouts]);

  const handleBannerResponse = useCallback(async (
    request: KnockRequestPayload,
    decision: 'APPROVE' | 'DENY'
  ) => {
    if (respondingKnockRequestIdsRef.current.has(request.requestId)) return;
    const respondToKnock = respondToKnockRef.current;
    if (!respondToKnock) return;

    respondingKnockRequestIdsRef.current.add(request.requestId);
    setRespondingKnockRequestIds((previous) => new Set(previous).add(request.requestId));
    try {
      await respondToKnock({
        spaceId: request.spaceId,
        requestId: request.requestId,
        requesterId: request.requesterId,
        requesterName: request.requesterName,
        decision,
      });
      if (!isMountedRef.current) return;
      clearPendingKnockRequest(request.requestId);
      if (decision === 'APPROVE') {
        toast.success(`${request.requesterName} has been let in`);
      } else {
        toast.info(`Access denied to ${request.requesterName}`);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      toast.error(`Failed to ${decision === 'APPROVE' ? 'approve' : 'deny'} knock`, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      respondingKnockRequestIdsRef.current.delete(request.requestId);
      if (isMountedRef.current) {
        setRespondingKnockRequestIds((previous) => {
          if (!previous.has(request.requestId)) return previous;
          const next = new Set(previous);
          next.delete(request.requestId);
          return next;
        });
      }
    }
  }, [clearPendingKnockRequest]);

  const handleBannerApprove = useCallback(async (request: KnockRequestPayload) => {
    await handleBannerResponse(request, 'APPROVE');
  }, [handleBannerResponse]);

  const handleBannerDeny = useCallback(async (request: KnockRequestPayload) => {
    await handleBannerResponse(request, 'DENY');
  }, [handleBannerResponse]);

  const isUserInSpace = useCallback((space: Space) => {
    return occupiedSpaceId === space.id;
  }, [occupiedSpaceId]);

  const hasApprovedKnock = useCallback((_spaceId: string) => false, []);

  const hasSpaceAccess = useCallback((space: Space): boolean => {
    if (!currentUserProfile?.id) {
      return false;
    }

    const accessControl = space.accessControl;
    if (accessControl?.isPublic !== false) {
      return true;
    }

    return Boolean(
      isAdmin ||
      accessControl.ownerId === currentUserProfile.id ||
      accessControl.allowedUsers?.includes(currentUserProfile.id) ||
      (currentUserProfile.role && accessControl.allowedRoles?.includes(currentUserProfile.role))
    );
  }, [currentUserProfile?.id, currentUserProfile?.role, isAdmin]);

  const handleEnterSpace = useCallback(async (
    spaceId: string,
    options?: {
      knockRequestId?: string;
      expectedLocationVersion?: number;
      intentGeneration?: number;
    }
  ): Promise<boolean> => {
    try {
      if (!currentUserProfile?.id) {
        throw new Error('Cannot update location: user ID missing');
      }

      const selectedSpace = spaces.find((space) => space.id === spaceId);
      if (!selectedSpace) {
        throw new Error('Space not found');
      }

      const activeOccupantCount = (usersInSpaces.get(spaceId) || []).filter(
        (user) => user.id !== currentUserProfile.id
      ).length;

      if (selectedSpace.capacity && activeOccupantCount >= selectedSpace.capacity) {
        setError('Cannot join - space is full');
        return false;
      }

      if (selectedSpace.status !== 'available' && selectedSpace.status !== 'active') {
        setError(`This space is currently ${selectedSpace.status}`);
        return false;
      }

      const isRestrictedSpace = selectedSpace.accessControl?.isPublic === false;
      const isAlreadyInSpace = Boolean(
        currentUser?.isOccupyingCurrentSpace && currentUser.currentSpaceId === spaceId
      );
      const canDirectEnter = Boolean(
        hasSpaceAccess(selectedSpace) ||
        options?.knockRequestId ||
        isAlreadyInSpace
      );

      if (isRestrictedSpace && !canDirectEnter) {
        setError('This private room requires an approved knock before entry.');
        return false;
      }

      if (isAlreadyInSpace) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`User already in space ${spaceId}`);
        }
        return false;
      }

      setError(null);

      try {
        const outcome = await updateLocation(spaceId, options?.knockRequestId
          ? {
              reason: 'knock-enter',
              knockRequestId: options.knockRequestId,
              expectedLocationVersion: options.expectedLocationVersion,
              intentGeneration: options.intentGeneration,
            }
          : { reason: 'manual-enter' });
        if (!outcome.ok) {
          if (outcome.skipped) return false;
          setError(outcome.message);
          return false;
        }
        setError(null);
      } catch (error) {
        console.error('Error updating location:', error);
        setError('Failed to enter space. Please try again.');
        if (error instanceof Error) {
          throw error;
        } else {
          throw new Error('Unknown error during location update');
        }
      }

      onSpaceSelect?.(selectedSpace);
      onOpenChat?.(selectedSpace);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Space transition failed:', error.message);
        setError(error.message);
      } else {
        console.error('Space transition failed: Unknown error');
        setError('An unknown error occurred');
      }
      return false;
    }
  }, [
    currentUser?.currentSpaceId,
    currentUser?.isOccupyingCurrentSpace,
    currentUserProfile?.id,
    hasSpaceAccess,
    onOpenChat,
    onSpaceSelect,
    spaces,
    updateLocation,
    usersInSpaces,
  ]);

  const handleLeaveSpace = useCallback(async (): Promise<boolean> => {
    try {
      if (!currentUserProfile?.id) {
        throw new Error('Cannot update location: user ID missing');
      }

      setError(null);
      const outcome = await updateLocation(null, { reason: 'manual-leave' });
      if (!outcome.ok) {
        if (outcome.skipped) return false;
        setError(outcome.message);
        return false;
      }
      setError(null);
      onSpaceLeave?.();
      return true;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Leave space failed:', error.message);
        setError(error.message);
      } else {
        console.error('Leave space failed: Unknown error');
        setError('An unknown error occurred');
      }
      return false;
    }
  }, [currentUserProfile?.id, onSpaceLeave, updateLocation]);

  const releaseActiveKnockIntent = useCallback(() => {
    const generation = activeKnockIntentGenerationRef.current;
    if (generation !== null) releaseManualIntent(generation);
    activeKnockIntentGenerationRef.current = null;
  }, [releaseManualIntent]);

  const handleKnockResponse = useCallback((payload: KnockResponsePayload) => {
    if (!payload.responderValidated) {
      return;
    }

    const activeRequestId = activeKnockRequestId;
    if (!activeRequestId || payload.requestId !== activeRequestId) {
      return;
    }

    if (payload.decision === 'APPROVE') {
      handleApproval();
      const responderName = payload.responderName ?? 'an occupant';
      toast.info(`Approved by ${responderName}. Confirming entry...`);
      void (async () => {
        const didEnter = knockTargetSpaceId
          ? await handleEnterSpace(knockTargetSpaceId, {
              knockRequestId: payload.requestId,
              expectedLocationVersion: payload.requesterLocationVersion,
              intentGeneration: activeKnockIntentGenerationRef.current ?? undefined,
            })
          : false;
        setActiveKnockRequestId(null);
        activeKnockSpaceIdRef.current = null;
        releaseActiveKnockIntent();
        resetKnock();
        if (didEnter) toast.success(`Joined after approval from ${responderName}`);
      })();
    } else {
      const deniedSpaceName = spaces.find((space) => space.id === knockTargetSpaceId)?.name ?? 'this space';
      handleDenial();
      setActiveKnockRequestId(null);
      activeKnockSpaceIdRef.current = null;
      releaseActiveKnockIntent();
      toast.error(`Access denied to ${deniedSpaceName}`);
    }
  }, [activeKnockRequestId, handleApproval, handleDenial, handleEnterSpace, knockTargetSpaceId, releaseActiveKnockIntent, resetKnock, spaces]);

  const {
    sendKnockRequest,
    respondToKnock,
    occupiedChannelStatus,
  } = useKnockSignaling({
    companyId: currentUserProfile?.companyId,
    occupiedSpaceId,
    activeRequestId: activeKnockRequestId,
    presenceSessionId,
    currentUserId: currentUserProfile?.id,
    onKnockRequest: handleIncomingKnockRequest,
    onKnockResponse: handleKnockResponse,
  });
  useEffect(() => {
    respondToKnockRef.current = respondToKnock;
  }, [respondToKnock]);

  useEffect(() => {
    if (occupiedChannelStatus === 'SUBSCRIBED') {
      knockStatusToastRef.current = null;
      return;
    }

    const isRecoverableIssue = occupiedChannelStatus === 'CHANNEL_ERROR';
    if (!isRecoverableIssue) {
      return;
    }

    const signature = `occupied-${occupiedSpaceId ?? 'unknown'}-${occupiedChannelStatus}`;
    if (knockStatusToastRef.current === signature) {
      return;
    }

    knockStatusToastRef.current = signature;
    toast.info('Knock listener in fallback mode', {
      description: 'Realtime is degraded; using polling fallback (may add slight delay).',
    });
  }, [occupiedChannelStatus, occupiedSpaceId]);

  useEffect(() => {
    const activeKnockBannerTimeouts = knockBannerTimeouts;
    return () => {
      activeKnockBannerTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      activeKnockBannerTimeouts.clear();
    };
  }, [knockBannerTimeouts]);

  const handleKnock = useCallback((spaceId: string) => {
    if (!currentUserProfile?.id || !currentUserProfile?.displayName) {
      setError('Cannot knock: user profile not available');
      return;
    }
    if (!canStartKnock(spaceId)) {
      const remaining = getCooldownRemaining(spaceId);
      toast.warning('Cooldown active', {
        description: `Wait ${remaining}s before knocking again.`,
      });
      return;
    }
    startKnock(spaceId);
    activeKnockIntentGenerationRef.current = beginManualIntent();
    activeKnockSpaceIdRef.current = spaceId;
    dispatchKnockTimeout({ type: 'clear' });
    void (async () => {
      try {
        const result = await sendKnockRequest(spaceId, {
          id: currentUserProfile.id,
          name: currentUserProfile.displayName,
          avatarUrl: currentUserProfile.avatarUrl ?? undefined,
        });

        const { requestId, recipientCount } = result;

        setActiveKnockRequestId(requestId);
        toast.info('Knocking...', {
          description:
            recipientCount > 0
              ? `Waiting for response from ${recipientCount} occupant${recipientCount > 1 ? 's' : ''}.`
              : 'Waiting for a response from occupants in this space.',
          duration: 5000,
        });
      } catch (requestError) {
        setActiveKnockRequestId(null);
        activeKnockSpaceIdRef.current = null;
        releaseActiveKnockIntent();
        resetKnock();
        toast.error('Failed to send knock request', {
          description: requestError instanceof Error ? requestError.message : 'Unknown error',
        });
      }
    })();
  }, [
    beginManualIntent,
    canStartKnock,
    currentUserProfile?.avatarUrl,
    currentUserProfile?.displayName,
    currentUserProfile?.id,
    getCooldownRemaining,
    resetKnock,
    releaseActiveKnockIntent,
    sendKnockRequest,
    startKnock,
  ]);

  useEffect(() => {
    if (knockStatus !== 'timeout') {
      return;
    }

    dispatchKnockTimeout({ type: 'show', spaceId: activeKnockSpaceIdRef.current });
    setActiveKnockRequestId(null);
    activeKnockSpaceIdRef.current = null;
    releaseActiveKnockIntent();
    toast('No one responded. Try again later.');

    if (timeoutResetRef.current) {
      clearTimeout(timeoutResetRef.current);
    }

    const timeoutId = setTimeout(() => {
      dispatchKnockTimeout({ type: 'clear' });
      resetKnock();
      timeoutResetRef.current = null;
    }, 2000);
    timeoutResetRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
      if (timeoutResetRef.current === timeoutId) {
        timeoutResetRef.current = null;
      }
    };
  }, [knockStatus, releaseActiveKnockIntent, resetKnock]);

  useEffect(() => () => releaseActiveKnockIntent(), [releaseActiveKnockIntent]);

  return {
    error,
    setError,
    pendingKnockRequests,
    respondingKnockRequestIds,
    timeoutSpaceId: knockTimeoutState.spaceId,
    knockStatus,
    knockTargetSpaceId,
    getCooldownRemaining,
    handleBannerApprove,
    handleBannerDeny,
    handleEnterSpace,
    handleLeaveSpace,
    handleKnock,
    hasApprovedKnock,
    hasSpaceAccess,
    isUserInSpace,
  };
}
