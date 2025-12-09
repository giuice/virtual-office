// src/components/floor-plan/modern/ModernFloorPlan.tsx
import React, { useState, useEffect } from 'react';
import { Space, Neighborhood } from '@/types/database';
import { useCompany } from '@/contexts/CompanyContext';
import { usePresence } from '@/contexts/PresenceContext';
import { useAudio } from '@/contexts/AudioContext';
import ModernSpaceCard from './ModernSpaceCard';
import { NeighborhoodSection, UngroupedSection } from './NeighborhoodSection';
import { floorPlanTokens } from './designTokens';
import { useGroupedSpaces } from '@/hooks/useGroupedSpaces';
import { cn } from '@/lib/utils';

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
  const [joiningSpaces, setJoiningSpaces] = useState<Set<string>>(new Set());
  const [lastRequestedSpaceId, setLastRequestedSpaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorTimeout, setErrorTimeout] = useState<NodeJS.Timeout | null>(null);

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

      setLastRequestedSpaceId(spaceId);  // Set loading state
      setError(null);

      try {
        await updateLocation(spaceId);
        setLastRequestedSpaceId(null);  // Reset after success
      } catch (error) {
        console.error('Error updating location:', error);
        setLastRequestedSpaceId(null);
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
