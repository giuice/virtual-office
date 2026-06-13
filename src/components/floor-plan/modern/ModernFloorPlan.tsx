// src/components/floor-plan/modern/ModernFloorPlan.tsx
import React, { useCallback, useEffect, useMemo } from 'react';
import { Neighborhood, Space } from '@/types/database';
import { useCompany } from '@/contexts/CompanyContext';
import { usePresence } from '@/contexts/PresenceContext';
import { useAudio } from '@/contexts/AudioContext';
import ModernSpaceCard from './ModernSpaceCard';
import ModernFloorPlanGrid from './ModernFloorPlanGrid';
import { floorPlanTokens } from './designTokens';
import { cn } from '@/lib/utils';
import { useModernFloorPlanKnock } from './useModernFloorPlanKnock';

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

const perspectiveGridClasses: Record<FloorPlanPerspective, string> = {
  orbit: 'grid gap-6',
  analyst: 'grid gap-4',
  cinema: 'grid gap-6',
};

const perspectiveGridStyles: Record<FloorPlanPerspective, React.CSSProperties> = {
  orbit: { gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' },
  analyst: { gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' },
  cinema: { gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))' },
};

const EMPTY_SPACES: Space[] = [];
const EMPTY_NEIGHBORHOODS: Neighborhood[] = [];

const ModernFloorPlan: React.FC<ModernFloorPlanProps> = ({
  spaces = EMPTY_SPACES,
  onSpaceSelect,
  onSpaceDoubleClick,
  onUserClick,
  onEditSpace,
  highlightedSpaceId = null,
  onOpenChat,
  layout = 'default',
  className = '',
  compactCards = false,
  perspective = 'orbit',
  neighborhoods = EMPTY_NEIGHBORHOODS,
  enableNeighborhoodGrouping = true,
  isAdmin = false,
}) => {
  const { currentUserProfile } = useCompany();
  const { users, usersInSpaces, isLoading, updateLocation } = usePresence();
  const { speakingUsers, mutedUserIds } = useAudio();
  const {
    error,
    setError,
    pendingKnockRequests,
    timeoutSpaceId,
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
  } = useModernFloorPlanKnock({
    spaces,
    users,
    usersInSpaces,
    currentUserProfile,
    isAdmin,
    updateLocation,
    onSpaceSelect,
    onOpenChat,
  });

  const spaceNamesById = useMemo(() => {
    return new Map(spaces.map((space) => [space.id, space.name]));
  }, [spaces]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    console.log('--- Modern Floor Plan Debug Info ---');
    console.log('Total spaces:', spaces.length);
    console.log('Total users:', users?.length ?? 0);

    usersInSpaces.forEach((usersInSpace, spaceId) => {
      const spaceName = spaceId ? (spaceNamesById.get(spaceId) || 'Unknown') : 'Unknown';
      console.log(`Space "${spaceName}" (${spaceId}) has ${usersInSpace.length} users via presence system:`,
        usersInSpace.map((user) => user.displayName).join(', '));
    });
  }, [spaceNamesById, spaces.length, users?.length, usersInSpaces]);

  const gridLayoutClass = perspectiveGridClasses[perspective] || floorPlanTokens.floorPlanLayout.grid[layout];
  const gridLayoutStyle = perspectiveGridStyles[perspective];

  const currentSpeakingIds = useMemo(() => {
    const speakingIds: string[] = [];
    speakingUsers.forEach((isSpeaking, id) => {
      if (isSpeaking) {
        speakingIds.push(id);
      }
    });
    return speakingIds;
  }, [speakingUsers]);

  const mutedUserIdsList = useMemo(() => Array.from(mutedUserIds), [mutedUserIds]);

  const renderSpaceCard = useCallback((space: Space, index: number) => {
    const spaceUsers = usersInSpaces.get(space.id) || [];
    const userInSpace = isUserInSpace(space);
    const hasOnlineResponder = spaceUsers.some(
      (user) => user.id !== currentUserProfile?.id && user.status !== 'offline'
    );
    const canDirectEnter = Boolean(
      hasSpaceAccess(space) ||
      userInSpace ||
      hasApprovedKnock(space.id)
    );
    const canKnock = space.accessControl?.isPublic === false && !canDirectEnter && hasOnlineResponder;
    const cooldownRemaining = getCooldownRemaining(space.id);
    const currentKnockStatus = cooldownRemaining > 0
      ? 'cooldown'
      : timeoutSpaceId === space.id
        ? 'timeout'
        : (knockTargetSpaceId === space.id ? knockStatus : 'idle');

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
        state={{
          highlighted: highlightedSpaceId === space.id,
          userInSpace,
          admin: isAdmin,
          compact: compactCards || perspective === 'analyst',
          directEnter: canDirectEnter,
        }}
        variant={perspective}
        speakingUserIds={currentSpeakingIds}
        mutedUserIds={mutedUserIdsList}
        pendingKnockRequest={pendingKnockRequests.get(space.id) || null}
        onKnockApprove={handleBannerApprove}
        onKnockDeny={handleBannerDeny}
        onKnock={canKnock ? handleKnock : undefined}
        knockStatus={currentKnockStatus}
        knockCooldownRemaining={cooldownRemaining}
      />
    );
  }, [
    compactCards,
    currentSpeakingIds,
    currentUserProfile?.id,
    getCooldownRemaining,
    handleBannerApprove,
    handleBannerDeny,
    handleEnterSpace,
    handleKnock,
    handleLeaveSpace,
    hasApprovedKnock,
    hasSpaceAccess,
    highlightedSpaceId,
    isAdmin,
    isUserInSpace,
    knockStatus,
    knockTargetSpaceId,
    mutedUserIdsList,
    onEditSpace,
    onOpenChat,
    onSpaceDoubleClick,
    onUserClick,
    pendingKnockRequests,
    perspective,
    timeoutSpaceId,
    usersInSpaces,
  ]);

  return (
    <div
      className={cn(
        floorPlanTokens.floorPlanLayout.container.base,
        floorPlanTokens.floorPlanLayout.container.scrollBehavior,
        className
      )}
    >
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
          <div className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-sm shadow-md">
            {error}
            <button
              type="button"
              className="ml-2 font-bold"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <ModernFloorPlanGrid
        spaces={spaces}
        neighborhoods={neighborhoods}
        enableNeighborhoodGrouping={enableNeighborhoodGrouping}
        perspective={perspective}
        gridLayoutClass={gridLayoutClass}
        gridLayoutStyle={gridLayoutStyle}
        renderSpaceCard={renderSpaceCard}
      />

      {isLoading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
          <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
};

export default ModernFloorPlan;
