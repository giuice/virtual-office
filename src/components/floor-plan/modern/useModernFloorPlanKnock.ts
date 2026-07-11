import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useKnock } from '@/hooks/useKnock';
import {
  KnockRequestPayload,
  KnockResponsePayload,
  isKnockTemporarilyUnavailableFailure,
  useKnockSignaling,
} from '@/hooks/realtime/useKnockSignaling';
import type { Space, User, UserPresenceData } from '@/types/database';

interface UseModernFloorPlanKnockOptions {
  spaces: Space[];
  users: UserPresenceData[] | undefined;
  usersInSpaces: Map<string | null, UserPresenceData[]>;
  currentUserProfile: User | null;
  isAdmin: boolean;
  updateLocation: (spaceId: string | null) => Promise<void>;
  onSpaceSelect?: (space: Space) => void;
  onOpenChat?: (space: Space) => void;
}

interface KnockTimeoutState {
  spaceId: string | null;
}

// Phase 1 fail-closed window: re-enabled in Phase 4 via service-role transaction functions.
const KNOCK_DISABLED = true;
const KNOCK_TEMPORARILY_UNAVAILABLE_MESSAGE =
  'Private spaces are temporarily unavailable unless you have direct access. Please try again later.';

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
  onSpaceSelect,
  onOpenChat,
}: UseModernFloorPlanKnockOptions) {
  const [error, setError] = useState<string | null>(null);
  const [pendingKnockRequests, setPendingKnockRequests] = useState<Map<string, KnockRequestPayload>>(new Map());
  const [knockTimeoutState, dispatchKnockTimeout] = useReducer(knockTimeoutReducer, { spaceId: null });
  const activeKnockRequestIdRef = useRef<string | null>(null);
  const activeKnockSpaceIdRef = useRef<string | null>(null);
  const approvedKnockSpaceIdRef = useRef<string | null>(null);
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
  } = useKnock();

  const currentUser = useMemo(
    () => users?.find((user) => user.id === currentUserProfile?.id),
    [users, currentUserProfile?.id]
  );
  const occupiedSpaceId = currentUser?.currentSpaceId ?? null;

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
    if (KNOCK_DISABLED) return;
    playKnockCue();
    setPendingKnockRequests((prev) => {
      const next = new Map(prev);
      next.set(payload.spaceId, payload);
      return next;
    });

    const existingTimeout = knockBannerTimeouts.get(payload.spaceId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutId = setTimeout(() => {
      setPendingKnockRequests((prev) => {
        const currentRequest = prev.get(payload.spaceId);
        if (!currentRequest || currentRequest.requestId !== payload.requestId) {
          return prev;
        }

        const next = new Map(prev);
        next.delete(payload.spaceId);
        return next;
      });
      knockBannerTimeouts.delete(payload.spaceId);
    }, 30000);

    knockBannerTimeouts.set(payload.spaceId, timeoutId);
  }, [knockBannerTimeouts, playKnockCue]);

  const clearPendingKnockRequest = useCallback((spaceId: string) => {
    const timeoutId = knockBannerTimeouts.get(spaceId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      knockBannerTimeouts.delete(spaceId);
    }

    setPendingKnockRequests((prev) => {
      if (!prev.has(spaceId)) {
        return prev;
      }

      const next = new Map(prev);
      next.delete(spaceId);
      return next;
    });
  }, [knockBannerTimeouts]);

  const handleBannerApprove = useCallback(async (request: KnockRequestPayload) => {
    if (KNOCK_DISABLED) return;
    clearPendingKnockRequest(request.spaceId);

    try {
      const result = await respondToKnockRef.current?.({
        spaceId: request.spaceId,
        requestId: request.requestId,
        requesterId: request.requesterId,
        requesterName: request.requesterName,
        decision: 'APPROVE',
      });
      if (isKnockTemporarilyUnavailableFailure(result)) return;
      toast.success(`${request.requesterName} has been let in`);
    } catch (err) {
      toast.error('Failed to approve knock', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [clearPendingKnockRequest]);

  const handleBannerDeny = useCallback(async (request: KnockRequestPayload) => {
    if (KNOCK_DISABLED) return;
    clearPendingKnockRequest(request.spaceId);

    try {
      const result = await respondToKnockRef.current?.({
        spaceId: request.spaceId,
        requestId: request.requestId,
        requesterId: request.requesterId,
        requesterName: request.requesterName,
        decision: 'DENY',
      });
      if (isKnockTemporarilyUnavailableFailure(result)) return;
      toast.info(`Access denied to ${request.requesterName}`);
    } catch (err) {
      toast.error('Failed to deny knock', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [clearPendingKnockRequest]);

  const isUserInSpace = useCallback((space: Space) => {
    return occupiedSpaceId === space.id;
  }, [occupiedSpaceId]);

  const hasApprovedKnock = useCallback((spaceId: string) => {
    return approvedKnockSpaceIdRef.current === spaceId;
  }, []);

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
    options?: { allowPrivateBypass?: boolean }
  ) => {
    try {
      if (!currentUserProfile?.id) {
        throw new Error('Cannot update location: user ID missing');
      }

      const selectedSpace = spaces.find((space) => space.id === spaceId);
      if (!selectedSpace) {
        throw new Error('Space not found');
      }

      const activeOccupantCount = (usersInSpaces.get(spaceId) || []).filter(
        (user) => user.id !== currentUserProfile.id && user.status !== 'offline'
      ).length;

      if (selectedSpace.capacity && activeOccupantCount >= selectedSpace.capacity) {
        setError('Cannot join - space is full');
        return;
      }

      if (selectedSpace.status !== 'available' && selectedSpace.status !== 'active') {
        setError(`This space is currently ${selectedSpace.status}`);
        return;
      }

      const isRestrictedSpace = selectedSpace.accessControl?.isPublic === false;
      const hasApprovedKnock = approvedKnockSpaceIdRef.current === spaceId;
      const isAlreadyInSpace = currentUser?.currentSpaceId === spaceId;
      const canDirectEnter = Boolean(
        hasSpaceAccess(selectedSpace) ||
        options?.allowPrivateBypass ||
        hasApprovedKnock ||
        isAlreadyInSpace
      );

      if (isRestrictedSpace && !canDirectEnter) {
        setError(KNOCK_TEMPORARILY_UNAVAILABLE_MESSAGE);
        return;
      }

      if (isAlreadyInSpace) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`User already in space ${spaceId}`);
        }
        return;
      }

      setError(null);

      try {
        await updateLocation(spaceId);
        if (approvedKnockSpaceIdRef.current === spaceId) {
          approvedKnockSpaceIdRef.current = null;
        }
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
    } catch (error) {
      if (error instanceof Error) {
        console.error('Space transition failed:', error.message);
        setError(error.message);
      } else {
        console.error('Space transition failed: Unknown error');
        setError('An unknown error occurred');
      }
    }
  }, [
    currentUser?.currentSpaceId,
    currentUserProfile?.id,
    hasSpaceAccess,
    onOpenChat,
    onSpaceSelect,
    spaces,
    updateLocation,
    usersInSpaces,
  ]);

  const handleLeaveSpace = useCallback(async () => {
    try {
      if (!currentUserProfile?.id) {
        throw new Error('Cannot update location: user ID missing');
      }

      setError(null);
      await updateLocation(null);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Leave space failed:', error.message);
        setError(error.message);
      } else {
        console.error('Leave space failed: Unknown error');
        setError('An unknown error occurred');
      }
    }
  }, [currentUserProfile?.id, updateLocation]);

  const handleKnockResponse = useCallback((payload: KnockResponsePayload) => {
    if (KNOCK_DISABLED) return;
    if (!payload.responderValidated) {
      return;
    }

    const activeRequestId = activeKnockRequestIdRef.current;
    if (!activeRequestId || payload.requestId !== activeRequestId) {
      return;
    }

    if (payload.decision === 'APPROVE') {
      handleApproval();
      const responderName = payload.responderName ?? 'an occupant';
      toast.success(`Approved by ${responderName}! Joining...`);
      if (knockTargetSpaceId) {
        approvedKnockSpaceIdRef.current = knockTargetSpaceId;
        void handleEnterSpace(knockTargetSpaceId, { allowPrivateBypass: true });
      }
      activeKnockRequestIdRef.current = null;
      activeKnockSpaceIdRef.current = null;
      resetKnock();
    } else {
      const deniedSpaceName = spaces.find((space) => space.id === knockTargetSpaceId)?.name ?? 'this space';
      handleDenial();
      activeKnockRequestIdRef.current = null;
      activeKnockSpaceIdRef.current = null;
      toast.error(`Access denied to ${deniedSpaceName}`);
    }
  }, [handleApproval, handleDenial, handleEnterSpace, knockTargetSpaceId, resetKnock, spaces]);

  const {
    sendKnockRequest,
    respondToKnock,
    occupiedChannelStatus,
  } = useKnockSignaling({
    occupiedSpaceId,
    knockingSpaceId: knockTargetSpaceId,
    currentUserId: currentUserProfile?.id,
    onKnockRequest: handleIncomingKnockRequest,
    onKnockResponse: handleKnockResponse,
  });
  respondToKnockRef.current = respondToKnock;

  useEffect(() => {
    if (occupiedChannelStatus === 'SUBSCRIBED') {
      knockStatusToastRef.current = null;
      return;
    }

    const isRecoverableIssue = occupiedChannelStatus === 'TIMED_OUT' ||
      occupiedChannelStatus === 'CHANNEL_ERROR' ||
      occupiedChannelStatus === 'CLOSED';
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
    if (KNOCK_DISABLED) {
      setError(KNOCK_TEMPORARILY_UNAVAILABLE_MESSAGE);
      return;
    }
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
    activeKnockSpaceIdRef.current = spaceId;
    dispatchKnockTimeout({ type: 'clear' });
    void (async () => {
      try {
        const result = await sendKnockRequest(spaceId, {
          id: currentUserProfile.id,
          name: currentUserProfile.displayName,
          avatarUrl: currentUserProfile.avatarUrl,
        });

        if (isKnockTemporarilyUnavailableFailure(result)) {
          activeKnockRequestIdRef.current = null;
          activeKnockSpaceIdRef.current = null;
          resetKnock();
          toast.error(KNOCK_TEMPORARILY_UNAVAILABLE_MESSAGE);
          return;
        }

        const { requestId, recipientCount } = result;

        activeKnockRequestIdRef.current = requestId;
        toast.info('Knocking...', {
          description:
            recipientCount > 0
              ? `Waiting for response from ${recipientCount} occupant${recipientCount > 1 ? 's' : ''}.`
              : 'Waiting for a response from occupants in this space.',
          duration: 5000,
        });
      } catch (requestError) {
        activeKnockRequestIdRef.current = null;
        activeKnockSpaceIdRef.current = null;
        resetKnock();
        toast.error('Failed to send knock request', {
          description: requestError instanceof Error ? requestError.message : 'Unknown error',
        });
      }
    })();
  }, [
    canStartKnock,
    currentUserProfile?.avatarUrl,
    currentUserProfile?.displayName,
    currentUserProfile?.id,
    getCooldownRemaining,
    resetKnock,
    sendKnockRequest,
    startKnock,
  ]);

  useEffect(() => {
    if (knockStatus !== 'timeout') {
      return;
    }

    dispatchKnockTimeout({ type: 'show', spaceId: activeKnockSpaceIdRef.current });
    activeKnockRequestIdRef.current = null;
    activeKnockSpaceIdRef.current = null;
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
  }, [knockStatus, resetKnock]);

  return {
    error,
    setError,
    pendingKnockRequests,
    timeoutSpaceId: knockTimeoutState.spaceId,
    knockStatus,
    knockTargetSpaceId,
    getCooldownRemaining,
    handleBannerApprove,
    handleBannerDeny,
    handleEnterSpace,
    handleLeaveSpace,
    handleKnock: KNOCK_DISABLED ? undefined : handleKnock,
    hasApprovedKnock,
    hasSpaceAccess,
    isUserInSpace,
  };
}
