// src/components/floor-plan/modern/ModernFloorPlan.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Space, Neighborhood } from '@/types/database';
import { useCompany } from '@/contexts/CompanyContext';
import { usePresence } from '@/contexts/PresenceContext';
import { useAudio } from '@/contexts/AudioContext';
import ModernSpaceCard from './ModernSpaceCard';
import { NeighborhoodSection, UngroupedSection } from './NeighborhoodSection';
import { floorPlanTokens } from './designTokens';
import { useGroupedSpaces } from '@/hooks/useGroupedSpaces';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
// Story 3.16: Knock to Enter
import { useKnock } from '@/hooks/useKnock';
import { useKnockSignaling, KnockRequestPayload, KnockResponsePayload } from '@/hooks/realtime/useKnockSignaling';

// Perspective types matching UX spec
export type FloorPlanPerspective = 'orbit' | 'analyst' | 'cinema';

interface ModernFloorPlanProps {
  spaces: Space[];
  onSpaceSelect?: (space: Space) => void;
  onSpaceDoubleClick?: (space: Space) => void;
  onUserClick?: (userId: string) => void;
  /** Handler for editing a space (admin only) */
  onEditSpace?: (space: Space) => void;
  highlightedSpaceId?: string | null;
  isEditable?: boolean;
  onOpenChat?: (space: Space) => void;
  /** @deprecated Use perspective instead */
  layout?: 'default' | 'compact' | 'spaced';
  className?: string;
  /** @deprecated Use perspective instead */
  compactCards?: boolean;
  /** Current perspective mode: orbit (default), analyst (dense), cinema (large) */
  perspective?: FloorPlanPerspective;
  /** Neighborhoods for grouping spaces (Story 3.9) */
  neighborhoods?: Neighborhood[];
  /** Whether to enable neighborhood grouping (Story 3.9) */
  enableNeighborhoodGrouping?: boolean;
  /** Whether the current user is an admin */
  isAdmin?: boolean;
}

// Grid classes for each perspective — fluid auto-fill per v3 spec
const perspectiveGridClasses: Record<FloorPlanPerspective, string> = {
  orbit: 'grid gap-6',
  analyst: 'grid gap-4',
  cinema: 'grid gap-6',
};

// Inline styles for grid-template-columns (auto-fill + minmax per v3 spec)
const perspectiveGridStyles: Record<FloorPlanPerspective, React.CSSProperties> = {
  orbit: { gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' },
  analyst: { gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' },
  cinema: { gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))' },
};

const ModernFloorPlan: React.FC<ModernFloorPlanProps> = ({
  spaces = [],
  onSpaceSelect,
  onSpaceDoubleClick,
  onUserClick,
  onEditSpace,
  highlightedSpaceId = null,
  isEditable = false,
  onOpenChat,
  layout = 'default',
  className = '',
  compactCards = false,
  perspective = 'orbit',
  neighborhoods = [],
  enableNeighborhoodGrouping = true,
  isAdmin = false
}) => {
  const { currentUserProfile } = useCompany();
  const { users, usersInSpaces, isLoading, updateLocation } = usePresence();
  const { speakingUsers, mutedUserIds } = useAudio();
  const [error, setError] = useState<string | null>(null);
  const [pendingKnockRequests, setPendingKnockRequests] = useState<Map<string, KnockRequestPayload>>(new Map());
  const [timeoutSpaceId, setTimeoutSpaceId] = useState<string | null>(null);
  const activeKnockRequestIdRef = useRef<string | null>(null);
  const activeKnockSpaceIdRef = useRef<string | null>(null);
  const approvedKnockSpaceIdRef = useRef<string | null>(null);
  const knockStatusToastRef = useRef<string | null>(null);
  const knockBannerTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const timeoutResetRef = useRef<NodeJS.Timeout | null>(null);
  const respondToKnockRef = useRef<((input: {
    spaceId: string;
    requestId: string;
    requesterId: string;
    requesterName: string;
    decision: 'APPROVE' | 'DENY';
  }) => Promise<unknown>) | null>(null);

  // Story 3.16: Knock to Enter hooks
  const knock = useKnock();

  // Get current user's occupied space ID
  const currentUser = users?.find(u => u.id === currentUserProfile?.id);
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

  // Handle incoming knock requests (for occupants)
  const handleIncomingKnockRequest = useCallback((payload: KnockRequestPayload) => {
    playKnockCue();
    setPendingKnockRequests((prev) => {
      const next = new Map(prev);
      next.set(payload.spaceId, payload);
      return next;
    });

    const existingTimeout = knockBannerTimeoutsRef.current.get(payload.spaceId);
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
      knockBannerTimeoutsRef.current.delete(payload.spaceId);
    }, 30000);

    knockBannerTimeoutsRef.current.set(payload.spaceId, timeoutId);
  }, [playKnockCue]);

  const clearPendingKnockRequest = useCallback((spaceId: string) => {
    const timeoutId = knockBannerTimeoutsRef.current.get(spaceId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      knockBannerTimeoutsRef.current.delete(spaceId);
    }

    setPendingKnockRequests((prev) => {
      if (!prev.has(spaceId)) {
        return prev;
      }

      const next = new Map(prev);
      next.delete(spaceId);
      return next;
    });
  }, []);

  const handleBannerApprove = useCallback(async (request: KnockRequestPayload) => {
    clearPendingKnockRequest(request.spaceId);

    try {
      await respondToKnockRef.current?.({
        spaceId: request.spaceId,
        requestId: request.requestId,
        requesterId: request.requesterId,
        requesterName: request.requesterName,
        decision: 'APPROVE',
      });
      toast.success(`${request.requesterName} has been let in`);
    } catch (err) {
      toast.error('Failed to approve knock', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [clearPendingKnockRequest]);

  const handleBannerDeny = useCallback(async (request: KnockRequestPayload) => {
    clearPendingKnockRequest(request.spaceId);

    try {
      await respondToKnockRef.current?.({
        spaceId: request.spaceId,
        requestId: request.requestId,
        requesterId: request.requesterId,
        requesterName: request.requesterName,
        decision: 'DENY',
      });
      toast.info(`Access denied to ${request.requesterName}`);
    } catch (err) {
      toast.error('Failed to deny knock', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [clearPendingKnockRequest]);

  // Handle knock responses (for requester)
  const handleKnockResponse = useCallback((payload: KnockResponsePayload) => {
    if (!payload.responderValidated) {
      return;
    }

    const activeRequestId = activeKnockRequestIdRef.current;
    if (!activeRequestId || payload.requestId !== activeRequestId) {
      return;
    }

    if (payload.decision === 'APPROVE') {
      knock.handleApproval();
      const responderName = payload.responderName ?? 'an occupant';
      toast.success(`Approved by ${responderName}! Joining...`);
      // Auto-join the space
      if (knock.targetSpaceId) {
        approvedKnockSpaceIdRef.current = knock.targetSpaceId;
        void handleEnterSpace(knock.targetSpaceId, { allowPrivateBypass: true });
      }
      activeKnockRequestIdRef.current = null;
      activeKnockSpaceIdRef.current = null;
      knock.reset();
    } else {
      const deniedSpaceName = spaces.find((space) => space.id === knock.targetSpaceId)?.name ?? 'this space';
      knock.handleDenial();
      activeKnockRequestIdRef.current = null;
      activeKnockSpaceIdRef.current = null;
      toast.error(`Access denied to ${deniedSpaceName}`);
    }
  }, [knock, spaces]);

  const knockSignaling = useKnockSignaling({
    occupiedSpaceId,
    knockingSpaceId: knock.targetSpaceId,
    currentUserId: currentUserProfile?.id,
    onKnockRequest: handleIncomingKnockRequest,
    onKnockResponse: handleKnockResponse,
  });
  respondToKnockRef.current = knockSignaling.respondToKnock;

  useEffect(() => {
    const status = knockSignaling.occupiedChannelStatus;
    if (status === 'SUBSCRIBED') {
      knockStatusToastRef.current = null;
      return;
    }

    const isRecoverableIssue = status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED';
    if (!isRecoverableIssue) {
      return;
    }

    const signature = `occupied-${occupiedSpaceId ?? 'unknown'}-${status}`;
    if (knockStatusToastRef.current === signature) {
      return;
    }

    knockStatusToastRef.current = signature;
    toast.info('Knock listener in fallback mode', {
      description: 'Realtime is degraded; using polling fallback (may add slight delay).',
    });
  }, [knockSignaling.occupiedChannelStatus, occupiedSpaceId]);

  useEffect(() => {
    return () => {
      knockBannerTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      knockBannerTimeoutsRef.current.clear();
      if (timeoutResetRef.current) {
        clearTimeout(timeoutResetRef.current);
      }
    };
  }, []);

  // Story 3.16: Handler for knocking on a private space
  const handleKnock = useCallback((spaceId: string) => {
    if (!currentUserProfile?.id || !currentUserProfile?.displayName) {
      setError('Cannot knock: user profile not available');
      return;
    }
    if (!knock.canKnock(spaceId)) {
      const remaining = knock.getCooldownRemaining(spaceId);
      toast.warning('Cooldown active', {
        description: `Wait ${remaining}s before knocking again.`,
      });
      return;
    }
    knock.knock(spaceId);
    activeKnockSpaceIdRef.current = spaceId;
    setTimeoutSpaceId(null);
    void (async () => {
      try {
        const { requestId, recipientCount } = await knockSignaling.sendKnockRequest(spaceId, {
          id: currentUserProfile.id,
          name: currentUserProfile.displayName,
          avatarUrl: currentUserProfile.avatarUrl,
        });

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
        knock.reset();
        toast.error('Failed to send knock request', {
          description: requestError instanceof Error ? requestError.message : 'Unknown error',
        });
      }
    })();
  }, [currentUserProfile, knock, knockSignaling]);

  useEffect(() => {
    if (knock.status !== 'timeout') {
      return;
    }

    setTimeoutSpaceId(activeKnockSpaceIdRef.current);
    activeKnockRequestIdRef.current = null;
    activeKnockSpaceIdRef.current = null;
    toast('No one responded. Try again later.');

    if (timeoutResetRef.current) {
      clearTimeout(timeoutResetRef.current);
    }

    timeoutResetRef.current = setTimeout(() => {
      setTimeoutSpaceId(null);
      knock.reset();
      timeoutResetRef.current = null;
    }, 2000);
  }, [knock.status, knock.reset]);

  // Log space and user data for debugging (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('--- Modern Floor Plan Debug Info ---');
      console.log('Total spaces:', spaces.length);
      console.log('Total users:', users?.length ?? 0);

      // Log presence data by space
      usersInSpaces.forEach((usersInSpace, spaceId) => {
        const spaceName = spaceId ? (spaces.find(s => s.id === spaceId)?.name || 'Unknown') : 'Unknown';
        console.log(`Space "${spaceName}" (${spaceId}) has ${usersInSpace.length} users via presence system:`,
          usersInSpace.map(u => u.displayName).join(', '));
      });
    }
    // avoid over-logging: no need to re-log when user list changes but spaces unchanged
  }, [spaces.length, usersInSpaces]);

  // Check if current user is in space
  const isUserInSpace = (space: Space) => {
    if (!currentUserProfile?.id) return false;

    // Primary method: Check if user's current_space_id matches this space
    const currentUser = users?.find(u => u.id === currentUserProfile.id);

    if (currentUser?.currentSpaceId === space.id) {
      return true;
    }

    return false;
  };

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

  const handleEnterSpace = async (spaceId: string, options?: { allowPrivateBypass?: boolean }) => {
    try {
      if (!currentUserProfile?.id) {
        throw new Error('Cannot update location: user ID missing');
      }

      const selectedSpace = spaces.find(s => s.id === spaceId);
      if (!selectedSpace) {
        throw new Error('Space not found');
      }

      // Space validation checks
      // Story 3.12 - AC3: Client-side check for full capacity
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

      const currentUser = users?.find(u => u.id === currentUserProfile.id);
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
        const hasOnlineResponder = (usersInSpaces.get(spaceId) || []).some(
          (user) => user.id !== currentUserProfile.id && user.status !== 'offline'
        );
        setError(
          hasOnlineResponder
            ? 'This space is private. Please knock to request access.'
            : 'This private space is locked and no one is available to grant access.'
        );
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

      if (selectedSpace) {
        onSpaceSelect?.(selectedSpace);
        onOpenChat?.(selectedSpace);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Space transition failed:', error.message);
        setError(error.message);
      } else {
        console.error('Space transition failed: Unknown error');
        setError('An unknown error occurred');
      }
    }
  };

  // Story 3.11: Handler for leaving a space
  const handleLeaveSpace = async () => {
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
  };

  // Get grid layout based on perspective (new) or legacy layout prop
  const gridLayoutClass = perspectiveGridClasses[perspective] || floorPlanTokens.floorPlanLayout.grid[layout];
  const gridLayoutStyle = perspectiveGridStyles[perspective];

  // Derive speaking users list
  const currentSpeakingIds = Array.from(speakingUsers.entries())
    .filter(([_, isSpeaking]) => isSpeaking)
    .map(([id]) => id);

  return (
    <div
      className={cn(
        floorPlanTokens.floorPlanLayout.container.base,
        floorPlanTokens.floorPlanLayout.container.scrollBehavior,
        className
      )}
    >
      {/* Error message display */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
          <div className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-sm shadow-md">
            {error}
            <button
              className="ml-2 font-bold"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Render helper for space cards */}
      {(() => {
        const renderSpaceCard = (space: Space, index: number) => {
          const spaceUsers = usersInSpaces.get(space.id) || [];
          const isHighlighted = highlightedSpaceId === space.id;
          const userInSpace = isUserInSpace(space);
          const isRestrictedSpace = space.accessControl?.isPublic === false;
          const hasOnlineResponder = spaceUsers.some(
            (user) => user.id !== currentUserProfile?.id && user.status !== 'offline'
          );
          const canDirectEnter = Boolean(
            hasSpaceAccess(space) ||
            userInSpace ||
            approvedKnockSpaceIdRef.current === space.id
          );
          const canKnock = isRestrictedSpace && !canDirectEnter && hasOnlineResponder;
          const cooldownRemaining = knock.getCooldownRemaining(space.id);
          const knockStatus = cooldownRemaining > 0
            ? 'cooldown'
            : timeoutSpaceId === space.id
              ? 'timeout'
              : (knock.targetSpaceId === space.id ? knock.status : 'idle');

          return (
            <ModernSpaceCard
              key={space.id || index}
              space={space}
              usersInSpace={spaceUsers}
              onEnterSpace={handleEnterSpace}
              onLeaveSpace={handleLeaveSpace}
              onOpenChat={onOpenChat}
              onUserClick={onUserClick}
              onSpaceDoubleClick={onSpaceDoubleClick}
              onEditSpace={onEditSpace}
              isHighlighted={isHighlighted}
              isUserInSpace={userInSpace}
              isAdmin={isAdmin}
              compact={compactCards || perspective === 'analyst'}
              variant={perspective}
              speakingUserIds={currentSpeakingIds}
              mutedUserIds={Array.from(mutedUserIds)}
              canDirectEnter={canDirectEnter}
              pendingKnockRequest={pendingKnockRequests.get(space.id) || null}
              onKnockApprove={handleBannerApprove}
              onKnockDeny={handleBannerDeny}
              // Story 3.16: Pass onKnock handler
              onKnock={canKnock ? handleKnock : undefined}
              knockStatus={knockStatus}
              knockCooldownRemaining={cooldownRemaining}
            />
          );
        };

        // Group spaces by neighborhood if enabled and neighborhoods exist
        const shouldGroup = enableNeighborhoodGrouping && neighborhoods.length > 0;

        if (shouldGroup) {
          // Use grouping logic
          const grouped = new Map<string, Space[]>();
          const ungrouped: Space[] = [];

          // Initialize the map with empty arrays for each neighborhood
          neighborhoods.forEach(neighborhood => {
            grouped.set(neighborhood.id, []);
          });

          // Group spaces
          spaces.forEach(space => {
            if (space.neighborhoodId && grouped.has(space.neighborhoodId)) {
              grouped.get(space.neighborhoodId)!.push(space);
            } else {
              ungrouped.push(space);
            }
          });

          return (
            <div className="space-y-6">
              {/* Render grouped sections */}
              {neighborhoods.map(neighborhood => {
                const sectionSpaces = grouped.get(neighborhood.id) || [];
                if (sectionSpaces.length === 0) return null;

                return (
                  <NeighborhoodSection
                    key={neighborhood.id}
                    neighborhood={neighborhood}
                    spaces={sectionSpaces}
                    variant={perspective}
                  >
                    <div className={gridLayoutClass} style={gridLayoutStyle}>
                      {sectionSpaces.map((space, index) => renderSpaceCard(space, index))}
                    </div>
                  </NeighborhoodSection>
                );
              })}

              {/* Render ungrouped section */}
              {ungrouped.length > 0 && (
                <UngroupedSection spaces={ungrouped} variant={perspective}>
                  <div className={gridLayoutClass} style={gridLayoutStyle}>
                    {ungrouped.map((space, index) => renderSpaceCard(space, index))}
                  </div>
                </UngroupedSection>
              )}

              {/* Empty state */}
              {spaces.length === 0 && (
                <div className="p-8 text-center rounded-lg border border-dashed border-muted-foreground/50">
                  <p className="text-muted-foreground">No spaces available</p>
                </div>
              )}
            </div>
          );
        }

        // Flat rendering (no grouping)
        return (
          <div className={gridLayoutClass} style={gridLayoutStyle}>
            {spaces.map((space, index) => renderSpaceCard(space, index))}

            {/* Empty state */}
            {spaces.length === 0 && (
              <div className="col-span-full p-8 text-center rounded-lg border border-dashed border-muted-foreground/50">
                <p className="text-muted-foreground">No spaces available</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
};

export default ModernFloorPlan;
