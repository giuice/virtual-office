// src/components/floor-plan/modern/ModernSpaceCard.tsx
import React, {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { Space, UserPresenceData } from "@/types/database";
import type { KnockStatus } from "@/hooks/useKnock";
import { cn } from "@/lib/utils";
import AvatarGroup from "./AvatarGroup";
import { SpaceCardFooter } from "./SpaceCardFooter";
import SpaceContextMenu from "./SpaceContextMenu";
import { SpaceDetailBottomSheet } from "./SpaceDetailBottomSheet";
import { SpaceDetailPanel } from "./SpaceDetailPanel";
import { SpaceTypeIndicator } from "./SpaceTypeIndicator";
import { isSpaceStatusEnterable } from "./NowBoard";

const EMPTY_USER_IDS: string[] = [];

function subscribeToViewportResize(onStoreChange: () => void) {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

function getIsMobileSnapshot() {
  return window.innerWidth < 768;
}

function getServerIsMobileSnapshot() {
  return false;
}

function formatSpaceType(type: Space["type"]) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getActivityText({
  isLive,
  isFull,
  isUserInSpace,
  users,
}: {
  isLive: boolean;
  isFull: boolean;
  isUserInSpace: boolean;
  users: UserPresenceData[];
}) {
  if (isLive) return "Live meeting";
  if (users.length === 0) return "Empty — available";
  if (isFull) return "Full";
  if (users.length === 1) {
    return isUserInSpace
      ? "You're here"
      : `${users[0].displayName.split(" ")[0]} is here`;
  }
  return `${users.length} people here`;
}

export type DetailSurface = "panel" | "sheet";

interface ModernSpaceCardProps {
  space: Space;
  usersInSpace: UserPresenceData[];
  onEnterSpace: (spaceId: string) => void;
  onOpenChat?: (space: Space) => void;
  onUserClick?: (userId: string) => void;
  onSpaceDoubleClick?: (space: Space) => void;
  onEditSpace?: (space: Space) => void;
  state?: {
    highlighted?: boolean;
    userInSpace?: boolean;
    admin?: boolean;
    compact?: boolean;
    detailPanel?: boolean;
    directEnter?: boolean;
  };
  className?: string;
  speakingUserIds?: string[];
  presentingUserId?: string;
  mutedUserIds?: string[];
  onLeaveSpace?: (spaceId: string) => void;
  onKnock?: (spaceId: string) => void;
  knockStatus?: KnockStatus;
  knockCooldownRemaining?: number;
  detailOpen?: boolean;
  onDetailOpenChange?: (open: boolean, surface: DetailSurface) => void;
}

const ModernSpaceCard: React.FC<ModernSpaceCardProps> = ({
  space,
  usersInSpace,
  onEnterSpace,
  onOpenChat,
  onUserClick,
  onSpaceDoubleClick,
  onEditSpace,
  state,
  className = "",
  speakingUserIds = EMPTY_USER_IDS,
  presentingUserId,
  mutedUserIds = EMPTY_USER_IDS,
  onLeaveSpace,
  onKnock,
  knockStatus,
  knockCooldownRemaining = 0,
  detailOpen = false,
  onDetailOpenChange,
}) => {
  const {
    highlighted: isHighlighted = false,
    userInSpace: isUserInSpace = false,
    admin: isAdmin = false,
    compact = false,
    detailPanel: showDetailPanel = true,
    directEnter: canDirectEnter = false,
  } = state ?? {};

  const cardRef = useRef<HTMLDivElement>(null);

  const isMobile = useSyncExternalStore(
    subscribeToViewportResize,
    getIsMobileSnapshot,
    getServerIsMobileSnapshot,
  );
  const detailSurfaceOpen = showDetailPanel && detailOpen;
  const detailSurface: DetailSurface = isMobile ? "sheet" : "panel";

  useEffect(() => {
    if (detailSurfaceOpen) {
      onDetailOpenChange?.(true, detailSurface);
    }
  }, [detailSurface, detailSurfaceOpen, onDetailOpenChange]);

  const capacity = space.capacity;
  const isFull = capacity > 0 && usersInSpace.length >= capacity;
  const isDirectEntryAvailable = isSpaceStatusEnterable(space.status);
  const isPrivateSpace = space.accessControl?.isPublic === false;
  const isLocked = isPrivateSpace || space.status === "locked";
  const exceptionalStatus = ["locked", "maintenance", "reserved"].includes(
    space.status,
  )
    ? space.status.charAt(0).toUpperCase() + space.status.slice(1)
    : null;
  const isLive = usersInSpace.some(
    (user) => speakingUserIds.includes(user.id) || user.id === presentingUserId,
  );
  const signal = isLive ? "live" : isFull ? "full" : null;
  const activityText = getActivityText({
    isLive,
    isFull,
    isUserInSpace,
    users: usersInSpace,
  });

  const handleClick = (event?: React.MouseEvent<HTMLDivElement>) => {
    if (event) {
      const target = event.target as HTMLElement;
      if (
        target.closest("[data-avatar-interactive]") ||
        target.closest("a, button:not([data-space-action])")
      ) {
        event.stopPropagation();
        return;
      }
    }

    if (showDetailPanel) {
      onDetailOpenChange?.(true, detailSurface);
      return;
    }
    if (!isUserInSpace && onKnock && !canDirectEnter) {
      onKnock(space.id);
      return;
    }
    onEnterSpace(space.id);
  };

  const handleJoin = useCallback(() => {
    onEnterSpace(space.id);
    onDetailOpenChange?.(false, detailSurface);
  }, [detailSurface, onDetailOpenChange, onEnterSpace, space.id]);

  const handleLeave = useCallback(() => {
    onLeaveSpace?.(space.id);
    onDetailOpenChange?.(false, detailSurface);
  }, [detailSurface, onDetailOpenChange, onLeaveSpace, space.id]);

  const closeDetailPanel = useCallback(() => {
    onDetailOpenChange?.(false, detailSurface);
  }, [detailSurface, onDetailOpenChange]);

  const ariaCapacity =
    capacity && capacity > 0
      ? `${usersInSpace.length} of ${capacity} participants${isFull ? ", full" : ""}`
      : `${usersInSpace.length} active`;

  return (
    <div className="relative @container/space">
      <div
        ref={cardRef}
        className={cn(
          "vo-space-card",
          isLive && "vo-space-card--live",
          isFull && !isLive && "vo-space-card--full",
          isLocked && "vo-space-card--locked",
          isUserInSpace && "vo-space-card--own",
          signal && "vo-space-card--has-signal",
          isHighlighted && "vo-space-card--selected",
          className,
        )}
        data-testid={`space-${space.id}`}
        data-selected={isHighlighted ? "true" : "false"}
        data-user-in-space={isUserInSpace ? "true" : "false"}
        data-space-id={space.id}
        data-compact={compact ? "true" : "false"}
        aria-expanded={detailSurfaceOpen}
        aria-label={`Space ${space.name}, ${formatSpaceType(space.type)}, ${ariaCapacity}`}
        aria-current={isHighlighted ? "true" : undefined}
        role="button"
        tabIndex={0}
        onPointerDownCapture={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-avatar-interactive]"))
            event.stopPropagation();
        }}
        onClick={handleClick}
        onDoubleClick={() => onSpaceDoubleClick?.(space)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleClick();
          }
          if (event.key === "Escape" && detailSurfaceOpen) closeDetailPanel();
        }}
      >
        {signal ? (
          <span
            className={cn(
              "vo-space-card-signal",
              `vo-space-card-signal--${signal}`,
            )}
            role="status"
          >
            {signal === "live" ? "LIVE" : "FULL"}
          </span>
        ) : null}

        {isUserInSpace ? <span className="vo-space-card-you">YOU</span> : null}

        <div
          className={cn(
            "vo-space-card-menu",
            signal && "vo-space-card-menu--with-signal",
          )}
          data-avatar-interactive="true"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <SpaceContextMenu
            space={space}
            isAdmin={isAdmin}
            isUserInSpace={isUserInSpace}
            onEnter={canDirectEnter ? () => onEnterSpace(space.id) : undefined}
            onKnock={onKnock ? () => onKnock(space.id) : undefined}
            canDirectEnter={canDirectEnter}
            onOpenChat={onOpenChat ? () => onOpenChat(space) : undefined}
            onEdit={onEditSpace ? () => onEditSpace(space) : undefined}
            size="sm"
            variant="ghost"
          />
        </div>

        <div className="vo-space-card-top">
          <div className="vo-space-card-icon" aria-hidden="true">
            <SpaceTypeIndicator type={space.type} showLabel={false} size="md" />
          </div>
          <div className="min-w-0">
            <div className="vo-space-card-name-row">
              <h3 className="vo-space-card-name font-display">{space.name}</h3>
              {isPrivateSpace ? (
                <span className="vo-space-card-lock" aria-label="Private space">
                  🔒
                </span>
              ) : null}
            </div>
            <p className="vo-space-card-subtitle">
              {formatSpaceType(space.type)}
              {exceptionalStatus ? (
                <span className="vo-space-card-exception">
                  {" "}
                  · {exceptionalStatus}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <p className="vo-space-card-activity">{activityText}</p>

        <AvatarGroup
          users={usersInSpace}
          max={7}
          size="sm"
          onUserClick={onUserClick}
          emptyText="✨ Empty — be the first"
          className="vo-space-card-avatars"
          speakingUserIds={speakingUserIds}
          presentingUserId={presentingUserId}
          mutedUserIds={mutedUserIds}
        />

        <SpaceCardFooter
          occupantCount={usersInSpace.length}
          capacity={capacity}
          isFull={isFull}
          isDirectEntryAvailable={isDirectEntryAvailable}
          isUserInSpace={isUserInSpace}
          canDirectEnter={canDirectEnter}
          onEnter={() => onEnterSpace(space.id)}
          onKnock={onKnock ? () => onKnock(space.id) : undefined}
          knockStatus={knockStatus}
          knockCooldownRemaining={knockCooldownRemaining}
        />
      </div>

      {detailSurfaceOpen && !isMobile ? (
        <div
          className="fixed inset-y-0 right-0 z-[80] w-[min(380px,92vw)]"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeDetailPanel();
              cardRef.current?.focus();
            }
          }}
        >
          <SpaceDetailPanel
            space={space}
            usersInSpace={usersInSpace}
            state={{
              userInSpace: isUserInSpace,
              privateSpace: isPrivateSpace,
              full: isFull,
              canDirectEnter,
            }}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onKnock={onKnock ? () => onKnock(space.id) : undefined}
            knockStatus={knockStatus}
            knockCooldownRemaining={knockCooldownRemaining}
            onUserClick={onUserClick}
            onClose={closeDetailPanel}
            speakingUserIds={speakingUserIds}
            presentingUserId={presentingUserId}
            mutedUserIds={mutedUserIds}
          />
        </div>
      ) : null}

      {isMobile && showDetailPanel ? (
        <SpaceDetailBottomSheet
          open={detailSurfaceOpen}
          onOpenChange={(open) => onDetailOpenChange?.(open, "sheet")}
          space={space}
          usersInSpace={usersInSpace}
          state={{
            userInSpace: isUserInSpace,
            privateSpace: isPrivateSpace,
            full: isFull,
            canDirectEnter,
          }}
          onJoin={handleJoin}
          onLeave={handleLeave}
          onKnock={onKnock ? () => onKnock(space.id) : undefined}
          knockStatus={knockStatus}
          knockCooldownRemaining={knockCooldownRemaining}
          onUserClick={onUserClick}
          speakingUserIds={speakingUserIds}
          presentingUserId={presentingUserId}
          mutedUserIds={mutedUserIds}
        />
      ) : null}
    </div>
  );
};

export default ModernSpaceCard;
