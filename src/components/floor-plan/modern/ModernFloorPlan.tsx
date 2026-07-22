// src/components/floor-plan/modern/ModernFloorPlan.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Neighborhood, Space, UserPresenceData } from "@/types/database";
import { useCompany } from "@/contexts/CompanyContext";
import { usePresence } from "@/contexts/PresenceContext";
import { useAudio } from "@/contexts/AudioContext";
import ModernSpaceCard from "./ModernSpaceCard";
import type { DetailSurface } from "./ModernSpaceCard";
import ModernFloorPlanGrid from "./ModernFloorPlanGrid";
import { NeighborhoodIndexRail } from "./NeighborhoodIndexRail";
import { floorPlanTokens } from "./designTokens";
import { cn } from "@/lib/utils";
import { useModernFloorPlanKnock } from "./useModernFloorPlanKnock";
import { KnockBannerHost } from "./KnockBanner";

// Perspective types matching UX spec
export type FloorPlanPerspective = "orbit" | "analyst" | "cinema";
export type FloorPlanDensity = "comfortable" | "compact";

interface ModernFloorPlanProps {
  spaces: Space[];
  onSpaceSelect?: (space: Space) => void;
  onSpaceLeave?: () => void;
  onSpaceDoubleClick?: (space: Space) => void;
  onUserClick?: (userId: string) => void;
  /** Handler for editing a space (admin only) */
  onEditSpace?: (space: Space) => void;
  highlightedSpaceId?: string | null;
  isEditable?: boolean;
  onOpenChat?: (space: Space) => void;
  className?: string;
  density?: FloorPlanDensity;
  /** Neighborhoods for grouping spaces (Story 3.9) */
  neighborhoods?: Neighborhood[];
  /** Whether to enable neighborhood grouping (Story 3.9) */
  enableNeighborhoodGrouping?: boolean;
  collapsedNeighborhoodIds?: ReadonlySet<string>;
  onToggleNeighborhood?: (neighborhoodId: string) => void;
  onExpandNeighborhood?: (neighborhoodId: string) => void;
  onShowAll?: () => void;
  isShowingAll?: boolean;
  /** Whether the current user is an admin */
  isAdmin?: boolean;
}

const EMPTY_SPACES: Space[] = [];
const EMPTY_NEIGHBORHOODS: Neighborhood[] = [];
const EMPTY_COLLAPSED_NEIGHBORHOODS = new Set<string>();
const NOOP = () => undefined;

interface OpenDetail {
  spaceId: string;
  surface: DetailSurface;
}

export function isCurrentUserAloneOnline(
  users: UserPresenceData[] | undefined,
  currentUserId: string | undefined,
) {
  if (!users || !currentUserId) {
    return false;
  }

  const currentUserIsConnected = users.some(
    (user) => user.id === currentUserId && user.isConnected === true,
  );
  const hasConnectedCoworker = users.some(
    (user) => user.id !== currentUserId && user.isConnected === true,
  );
  return currentUserIsConnected && !hasConnectedCoworker;
}

const ModernFloorPlan: React.FC<ModernFloorPlanProps> = ({
  spaces = EMPTY_SPACES,
  onSpaceSelect,
  onSpaceLeave,
  onSpaceDoubleClick,
  onUserClick,
  onEditSpace,
  highlightedSpaceId = null,
  onOpenChat,
  className = "",
  density = "comfortable",
  neighborhoods = EMPTY_NEIGHBORHOODS,
  enableNeighborhoodGrouping = true,
  collapsedNeighborhoodIds = EMPTY_COLLAPSED_NEIGHBORHOODS,
  onToggleNeighborhood = NOOP,
  onExpandNeighborhood = NOOP,
  onShowAll = NOOP,
  isShowingAll = true,
  isAdmin = false,
}) => {
  const [openDetail, setOpenDetail] = useState<OpenDetail | null>(null);
  const { currentUserProfile } = useCompany();
  const {
    users,
    usersInSpaces,
    isLoading,
    updateLocation,
    beginManualIntent,
    releaseManualIntent,
    presenceSessionId,
  } = usePresence();
  const { speakingUsers, mutedUserIds } = useAudio();
  const {
    error,
    setError,
    pendingKnockRequests,
    respondingKnockRequestIds,
    timeoutSpaceId,
    knockStatus,
    knockTargetSpaceId,
    getCooldownRemaining,
    handleBannerApprove,
    handleBannerDeny,
    handleEnterSpace,
    handleLeaveSpace,
    handleKnock,
    hasSpaceAccess,
    isUserInSpace,
  } = useModernFloorPlanKnock({
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
    onSpaceLeave,
    onOpenChat,
  });

  const spaceNamesById = useMemo(() => {
    return new Map(spaces.map((space) => [space.id, space.name]));
  }, [spaces]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    console.log("--- Modern Floor Plan Debug Info ---");
    console.log("Total spaces:", spaces.length);
    console.log("Total users:", users?.length ?? 0);

    usersInSpaces.forEach((usersInSpace, spaceId) => {
      const spaceName = spaceId
        ? spaceNamesById.get(spaceId) || "Unknown"
        : "Unknown";
      console.log(
        `Space "${spaceName}" (${spaceId}) has ${usersInSpace.length} users via presence system:`,
        usersInSpace.map((user) => user.displayName).join(", "),
      );
    });
  }, [spaceNamesById, spaces.length, users?.length, usersInSpaces]);

  const currentUserPresence = users?.find(
    (user) => user.id === currentUserProfile?.id,
  );
  const currentSpaceId = currentUserPresence?.isOccupyingCurrentSpace
    ? (currentUserPresence.currentSpaceId ?? undefined)
    : undefined;
  // The old card-local banner was visible only while the responder occupied
  // that card. Preserve that authorization-facing UI fence after moving the
  // host globally, without mutating the knock orchestration state.
  const visiblePendingKnockRequests = useMemo(() => {
    if (!currentSpaceId) return new Map();

    return new Map(
      Array.from(pendingKnockRequests).filter(
        ([, request]) => request.spaceId === currentSpaceId,
      ),
    );
  }, [currentSpaceId, pendingKnockRequests]);
  const isOnlyPersonOnline = isCurrentUserAloneOnline(
    users,
    currentUserProfile?.id,
  );

  const currentSpeakingIds = useMemo(() => {
    const speakingIds: string[] = [];
    speakingUsers.forEach((isSpeaking, id) => {
      if (isSpeaking) {
        speakingIds.push(id);
      }
    });
    return speakingIds;
  }, [speakingUsers]);

  const mutedUserIdsList = useMemo(
    () => Array.from(mutedUserIds),
    [mutedUserIds],
  );

  const renderSpaceCard = useCallback(
    (space: Space, index: number) => {
      const spaceUsers = usersInSpaces.get(space.id) || [];
      const userInSpace = isUserInSpace(space);
      const hasOnlineResponder = spaceUsers.some(
        (user) => user.id !== currentUserProfile?.id,
      );
      const canDirectEnter = Boolean(hasSpaceAccess(space) || userInSpace);
      // Knock is social etiquette, independent from authorization. Anyone outside an
      // occupied room may knock; access only controls whether Enter also appears.
      const canKnock = !userInSpace && hasOnlineResponder;
      const cooldownRemaining = getCooldownRemaining(space.id);
      const currentKnockStatus =
        cooldownRemaining > 0
          ? "cooldown"
          : timeoutSpaceId === space.id
            ? "timeout"
            : knockTargetSpaceId === space.id
              ? knockStatus
              : "idle";

      return (
        <ModernSpaceCard
          key={space.id || index}
          space={space}
          usersInSpace={spaceUsers}
          onEnterSpace={(spaceId) => {
            void handleEnterSpace(spaceId);
          }}
          onLeaveSpace={() => {
            void handleLeaveSpace();
          }}
          onOpenChat={onOpenChat}
          onUserClick={onUserClick}
          onSpaceDoubleClick={onSpaceDoubleClick}
          onEditSpace={onEditSpace}
          state={{
            highlighted: highlightedSpaceId === space.id,
            userInSpace,
            admin: isAdmin,
            compact: density === "compact",
            directEnter: canDirectEnter,
          }}
          variant="orbit"
          speakingUserIds={currentSpeakingIds}
          mutedUserIds={mutedUserIdsList}
          detailOpen={openDetail?.spaceId === space.id}
          onDetailOpenChange={(open, surface) => {
            setOpenDetail((currentDetail) => {
              if (!open) {
                return currentDetail?.spaceId === space.id
                  ? null
                  : currentDetail;
              }
              if (
                currentDetail?.spaceId === space.id &&
                currentDetail.surface === surface
              ) {
                return currentDetail;
              }
              return { spaceId: space.id, surface };
            });
          }}
          onKnock={canKnock ? handleKnock : undefined}
          knockStatus={currentKnockStatus}
          knockCooldownRemaining={cooldownRemaining}
        />
      );
    },
    [
      currentSpeakingIds,
      currentUserProfile?.id,
      getCooldownRemaining,
      handleEnterSpace,
      handleKnock,
      handleLeaveSpace,
      hasSpaceAccess,
      highlightedSpaceId,
      isAdmin,
      isUserInSpace,
      knockStatus,
      knockTargetSpaceId,
      mutedUserIdsList,
      openDetail,
      onEditSpace,
      onOpenChat,
      onSpaceDoubleClick,
      onUserClick,
      density,
      timeoutSpaceId,
      usersInSpaces,
    ],
  );

  return (
    <>
      <KnockBannerHost
        pendingKnockRequests={visiblePendingKnockRequests}
        respondingKnockRequestIds={respondingKnockRequestIds}
        onApprove={(request) => {
          void handleBannerApprove(request);
        }}
        onDeny={(request) => {
          void handleBannerDeny(request);
        }}
      />

      <div
        className={cn(
          floorPlanTokens.floorPlanLayout.container.base,
          floorPlanTokens.floorPlanLayout.container.scrollBehavior,
          className,
        )}
        data-testid="modern-floor-plan-background"
        inert={openDetail?.surface === "sheet"}
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

        <NeighborhoodIndexRail
          neighborhoods={neighborhoods}
          spaces={spaces}
          usersInSpaces={usersInSpaces}
          currentSpaceId={currentSpaceId}
          enableNeighborhoodGrouping={enableNeighborhoodGrouping}
          collapsedNeighborhoodIds={collapsedNeighborhoodIds}
          isShowingAll={isShowingAll}
          onShowAll={onShowAll}
          onExpandNeighborhood={onExpandNeighborhood}
        />

        {isOnlyPersonOnline ? (
          <div className="vo-empty-office">
            <span className="vo-empty-office-icon" aria-hidden="true">
              ✨
            </span>
            <h2 className="font-display">
              Good morning! The office is still quiet ✨
            </h2>
            <p>
              You&apos;re the first one here. Pick a space so teammates can find
              you.
            </p>
          </div>
        ) : null}

        <ModernFloorPlanGrid
          spaces={spaces}
          neighborhoods={neighborhoods}
          usersInSpaces={usersInSpaces}
          enableNeighborhoodGrouping={enableNeighborhoodGrouping}
          collapsedNeighborhoodIds={collapsedNeighborhoodIds}
          onToggleNeighborhood={onToggleNeighborhood}
          renderSpaceCard={renderSpaceCard}
        />

        {isLoading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
            <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        )}
      </div>
    </>
  );
};

export default ModernFloorPlan;
