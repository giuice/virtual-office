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
import KnockToast from './KnockToast';

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

// Grid classes for each perspective (from UX spec)
const perspectiveGridClasses: Record<FloorPlanPerspective, string> = {
  orbit: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6',
  analyst: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4',
  cinema: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8',
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
  const activeKnockRequestIdRef = useRef<string | null>(null);
  const knockStatusToastRef = useRef<string | null>(null);
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
    if (currentUserProfile?.preferences?.notifications === false) {
      return;
    }

    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(280, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(220, audioContext.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.03, audioContext.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.24);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.24);
      oscillator.onended = () => {
        void audioContext.close();
      };
    } catch {
      // Sound cue is best-effort and should never block knock interactions.
    }
  }, [currentUserProfile?.preferences?.notifications]);

  // Handle incoming knock requests (for occupants)
  const handleIncomingKnockRequest = useCallback((payload: KnockRequestPayload) => {
    playKnockCue();
    toast.custom(
      (toastId) => (
        <KnockToast
          requesterName={payload.requesterName}
          requesterAvatarUrl={payload.requesterAvatarUrl}
          onApprove={() => {
            void respondToKnockRef.current?.({
              spaceId: payload.spaceId,
              requestId: payload.requestId,
              requesterId: payload.requesterId,
              requesterName: payload.requesterName,
              decision: 'APPROVE',
            }).catch((responseError) => {
              toast.error('Failed to approve knock', {
                description: responseError instanceof Error ? responseError.message : 'Unknown error',
              });
            });
            toast.dismiss(toastId);
            toast.success(`${payload.requesterName} has been let in`);
          }}
          onDeny={() => {
            void respondToKnockRef.current?.({
              spaceId: payload.spaceId,
              requestId: payload.requestId,
              requesterId: payload.requesterId,
              requesterName: payload.requesterName,
              decision: 'DENY',
            }).catch((responseError) => {
              toast.error('Failed to deny knock', {
                description: responseError instanceof Error ? responseError.message : 'Unknown error',
              });
            });
            toast.dismiss(toastId);
            toast.info(`Access denied to ${payload.requesterName}`);
          }}
        />
      ),
      {
        duration: 30000, // Match knock timeout
        id: `knock-${payload.requestId}`,
      }
    );
  }, [playKnockCue]);

  // Handle knock responses (for requester)
  const handleKnockResponse = useCallback((payload: KnockResponsePayload) => {
    if (!payload.responderValidated) {
      return;
    }

    if (activeKnockRequestIdRef.current && payload.requestId !== activeKnockRequestIdRef.current) {
      return;
    }

    if (payload.decision === 'APPROVE') {
      knock.handleApproval();
      toast.success('Access granted!');
      // Auto-join the space
      if (knock.targetSpaceId) {
        handleEnterSpace(knock.targetSpaceId);
      }
      activeKnockRequestIdRef.current = null;
      knock.reset();
    } else {
      knock.handleDenial();
      activeKnockRequestIdRef.current = null;
      toast.error('Access denied', {
        description: `You can knock again in 60 seconds.`,
      });
    }
  }, [knock]);

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
    if (!status || status === 'SUBSCRIBED') {
      knockStatusToastRef.current = null;
      return;
    }

    const signature = `occupied-${status}`;
    if (knockStatusToastRef.current === signature) {
      return;
    }

    knockStatusToastRef.current = signature;
    toast.error('Knock listener connection issue', {
      description: `Occupied channel status: ${status}. Notifications may not arrive.`,
    });
  }, [knockSignaling.occupiedChannelStatus]);

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
    void (async () => {
      try {
        const { requestId, recipientCount } = await knockSignaling.sendKnockRequest(spaceId, {
          id: currentUserProfile.id,
          name: currentUserProfile.displayName,
          avatarUrl: currentUserProfile.avatarUrl,
        });

        activeKnockRequestIdRef.current = requestId;
        if (recipientCount <= 0) {
          toast.info('Knocking...', {
            description: 'No occupants detected in this space yet.',
            duration: 5000,
          });
        } else {
          toast.info('Knocking...', {
            description: `Waiting for response from ${recipientCount} occupant${recipientCount > 1 ? 's' : ''}.`,
            duration: 5000,
          });
        }
      } catch (requestError) {
        activeKnockRequestIdRef.current = null;
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

    activeKnockRequestIdRef.current = null;
    toast.warning('No response', {
      description: 'Your knock timed out after 30 seconds.',
    });
    knock.reset();
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

  const handleEnterSpace = async (spaceId: string) => {
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
      if (selectedSpace.capacity && (usersInSpaces.get(spaceId)?.length || 0) >= selectedSpace.capacity) {
        setError('Cannot join - space is full');
        return;
      }

      if (selectedSpace.status !== 'available' && selectedSpace.status !== 'active') {
        setError(`This space is currently ${selectedSpace.status}`);
        return;
      }

      const currentUser = users?.find(u => u.id === currentUserProfile.id);
      if (currentUser && currentUser.currentSpaceId === spaceId) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`User already in space ${spaceId}`);
        }
        return;
      }

      setError(null);

      try {
        await updateLocation(spaceId);
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

  // Derive speaking users list
  const currentSpeakingIds = Array.from(speakingUsers.entries())
    .filter(([_, isSpeaking]) => isSpeaking)
    .map(([id]) => id);

  return (
    <div className={cn(
      floorPlanTokens.floorPlanLayout.container.base,
      floorPlanTokens.floorPlanLayout.container.scrollBehavior,
      className
    )}>
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
          const cooldownRemaining = knock.getCooldownRemaining(space.id);
          const knockStatus = cooldownRemaining > 0
            ? 'cooldown'
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
              // Story 3.16: Pass onKnock handler
              onKnock={handleKnock}
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
                    <div className={gridLayoutClass}>
                      {sectionSpaces.map((space, index) => renderSpaceCard(space, index))}
                    </div>
                  </NeighborhoodSection>
                );
              })}

              {/* Render ungrouped section */}
              {ungrouped.length > 0 && (
                <UngroupedSection spaces={ungrouped} variant={perspective}>
                  <div className={gridLayoutClass}>
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
          <div className={gridLayoutClass}>
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
