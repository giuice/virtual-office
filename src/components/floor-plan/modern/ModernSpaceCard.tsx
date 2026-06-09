// src/components/floor-plan/modern/ModernSpaceCard.tsx
import React, { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { Space, SpaceType } from '@/types/database';
import { UserPresenceData } from '@/types/database';
import AvatarGroup from './AvatarGroup';
import { SpaceStatusBadge, SpaceTypeIndicator, CapacityIndicator } from './StatusIndicators';
import { FullBadge } from './FullBadge';
import AttentionBeacon from './AttentionBeacon';
import SpaceContextMenu from './SpaceContextMenu';
import { SpaceDetailPanel } from './SpaceDetailPanel';
import { SpaceDetailBottomSheet } from './SpaceDetailBottomSheet';
import { useAttentionBeacon, SpaceBeaconData } from '@/hooks/useAttentionBeacon';
import { useSpaceDetails } from '@/hooks/useSpaceDetails';
import { cn } from '@/lib/utils';
import { floorPlanTokens } from './designTokens';
import { GlassPanel } from '@/components/ui/glass-panel';
import { KnockBanner } from './KnockBanner';
import { SpaceActionButtons } from './SpaceActionButtons';
import type { KnockRequestPayload } from '@/hooks/realtime/useKnockSignaling';
import type { KnockStatus } from '@/hooks/useKnock';

const EMPTY_USER_IDS: string[] = [];

function subscribeToViewportResize(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange);
  return () => window.removeEventListener('resize', onStoreChange);
}

function getIsMobileSnapshot() {
  return window.innerWidth < 768;
}

function getServerIsMobileSnapshot() {
  return false;
}

function clearSpaceCardTimeouts(
  hoverTimeoutRef: React.RefObject<NodeJS.Timeout | null>,
  hideTimeoutRef: React.RefObject<NodeJS.Timeout | null>
) {
  if (hoverTimeoutRef.current) {
    clearTimeout(hoverTimeoutRef.current);
  }
  if (hideTimeoutRef.current) {
    clearTimeout(hideTimeoutRef.current);
  }
}

// ============================================
// Story 3.2: Gradient utilities
// ============================================

/**
 * Get the CSS custom property name for a space type gradient.
 * Maps space types to gradient CSS variables defined in tokens.css.
 */

// Functions to format space properties
const formatSpaceType = (type: string) => {
  return type.replace(/_/g, ' ');
};

// Occupancy percentage for sparkline
function getSpaceGradientVar(type: SpaceType): string {
  return `var(--vo-space-gradient-${type})`;
}

// Perspective/variant type
export type SpaceCardVariant = 'orbit' | 'analyst' | 'cinema';
interface ModernSpaceCardProps {
  space: Space;
  usersInSpace: UserPresenceData[];
  onEnterSpace: (spaceId: string) => void;
  onOpenChat?: (space: Space) => void;
  onUserClick?: (userId: string) => void;
  onSpaceDoubleClick?: (space: Space) => void;
  /** Handler for editing the space (admin only) */
  onEditSpace?: (space: Space) => void;
  state?: {
    highlighted?: boolean;
    userInSpace?: boolean;
    /** Whether the current user is an admin */
    admin?: boolean;
    compact?: boolean;
    /** Story 3.11: Enable hover panel detail view */
    detailPanel?: boolean;
    /** Whether direct enter should be allowed for this space */
    directEnter?: boolean;
  };
  className?: string;
  /** Perspective variant: orbit (default), analyst (dense with sparkline), cinema (large) */
  variant?: SpaceCardVariant;
  /** Optional beacon data for attention triggers (blocker, help requested) */
  spaceBeaconData?: SpaceBeaconData;
  /** Story 3.11: Speaking user IDs for status display */
  speakingUserIds?: string[];
  /** Story 3.11: Presenting user ID for status display */
  presentingUserId?: string;
  /** Story 3.11: Muted user IDs for dimmed display */
  mutedUserIds?: string[];
  /** Story 3.11: Handler for leaving the space */
  onLeaveSpace?: (spaceId: string) => void;
  /** Story 3.16: Handler for knocking on a private space */
  onKnock?: (spaceId: string) => void;
  /** Pending knock request for this space (shown as banner for occupants) */
  pendingKnockRequest?: KnockRequestPayload | null;
  /** Handler when occupant approves a knock */
  onKnockApprove?: (request: KnockRequestPayload) => void;
  /** Handler when occupant denies a knock */
  onKnockDeny?: (request: KnockRequestPayload) => void;
  /** Story 3.16: Current knock status for this space */
  knockStatus?: KnockStatus;
  /** Story 3.16: Cooldown remaining for this space */
  knockCooldownRemaining?: number;
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
  className = '',
  variant = 'orbit',
  spaceBeaconData,
  speakingUserIds = EMPTY_USER_IDS,
  presentingUserId,
  mutedUserIds = EMPTY_USER_IDS,
  onLeaveSpace,
  // Story 3.16: Knock to Enter
  onKnock,
  pendingKnockRequest = null,
  onKnockApprove,
  onKnockDeny,
  knockStatus,
  knockCooldownRemaining = 0
}) => {
  const {
    highlighted: isHighlighted = false,
    userInSpace: isUserInSpace = false,
    admin: isAdmin = false,
    compact = false,
    detailPanel: showDetailPanel = true,
    directEnter: canDirectEnter = false,
  } = state ?? {};

  // Story 3.11: Detail panel state
  const [showPanel, setShowPanel] = useState(false);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Story 3.11: Detect mobile viewport
  const isMobile = useSyncExternalStore(
    subscribeToViewportResize,
    getIsMobileSnapshot,
    getServerIsMobileSnapshot
  );

  // Story 3.11: Lazy fetch space details when panel should show
  const shouldFetchDetails = showPanel || bottomSheetOpen;
  const {
    agenda,
    activityLog,
    transcript,
    isLoading: detailsLoading
  } = useSpaceDetails(shouldFetchDetails ? space.id : null);

  // Story 3.4: Attention Beacon integration
  const beaconState = useAttentionBeacon(space.id, usersInSpace, space.capacity, spaceBeaconData);

  // Determine if we're in analyst mode (dense view)
  const isAnalyst = variant === 'analyst';
  const isCinema = variant === 'cinema';
  const isCompact = compact || isAnalyst;

  // Story 3.12 - AC2: Calculate if space is at capacity
  const isFull = space.capacity > 0 && usersInSpace.length >= space.capacity;

  // Story 3.11: Handle hover with delay to prevent flicker
  // The hover area now includes both card and panel
  const handleMouseEnter = useCallback(() => {
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (showDetailPanel && !isMobile && !isAnalyst) {
      // AC1: 300ms delay before showing panel
      hoverTimeoutRef.current = setTimeout(() => {
        setShowPanel(true);
      }, 300);
    }
  }, [showDetailPanel, isMobile, isAnalyst]);
  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // Add small delay before hiding to allow mouse to move to panel
    hideTimeoutRef.current = setTimeout(() => {
      setShowPanel(false);
    }, 100);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => clearSpaceCardTimeouts(hoverTimeoutRef, hideTimeoutRef);
  }, []);
  const handleClick = (e?: React.MouseEvent<HTMLDivElement>) => {
    if (e) {
      const target = e.target as HTMLElement;
      // Prevent clicks on interactive elements within the card from triggering navigation
      if (target.closest('[data-avatar-interactive="true"]') || target.closest('a, button:not([data-space-action])')) {
        e.stopPropagation();
        return;
      }
    }

    // Story 3.11 AC8: Mobile tap opens bottom sheet instead of navigating
    if (isMobile && showDetailPanel && !isAnalyst) {
      setBottomSheetOpen(true);
      return;
    }
    if (!isUserInSpace && onKnock && !canDirectEnter) {
      onKnock(space.id);
      return;
    }
    onEnterSpace(space.id);
    if (onOpenChat) {
      onOpenChat(space);
    }
  };

  // Story 3.11: Handlers for detail panel actions
  const handleJoin = useCallback(() => {
    onEnterSpace(space.id);
    if (onOpenChat) {
      onOpenChat(space);
    }
    setShowPanel(false);
    setBottomSheetOpen(false);
  }, [space, onEnterSpace, onOpenChat]);
  const handleLeave = useCallback(() => {
    if (onLeaveSpace) {
      onLeaveSpace(space.id);
    }
    setShowPanel(false);
    setBottomSheetOpen(false);
  }, [space.id, onLeaveSpace]);

  // Story 3.11 AC10: Show panel on keyboard focus
  const revealDetailPanelOnFocus = useCallback(() => {
    if (showDetailPanel && !isMobile && !isAnalyst) {
      setShowPanel(true);
    }
  }, [showDetailPanel, isMobile, isAnalyst]);
  const hideDetailPanelOnBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    // Only hide if focus moves outside the card entirely
    if (!cardRef.current?.contains(e.relatedTarget as Node)) {
      setShowPanel(false);
    }
  }, []);

  // Story 3.2: Compute gradient styling
  const gradientVar = getSpaceGradientVar(space.type);

  // Functions to format space properties

  // Occupancy percentage for sparkline
  const occupancyPercent = space.capacity > 0 ? Math.min(usersInSpace.length / space.capacity * 100, 100) : 0;
  const isRestrictedSpace = space.accessControl?.isPublic === false;
  return (
    // Story 3.11: Wrapper div handles hover for both card and panel
    // This ensures mouse can move from card to panel without closing it
    <div ref={wrapperRef} className={cn("relative",
    // Container query for responsive internal layout
    "@container/space")} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <GlassPanel ref={cardRef} interactive withGlow className={cn(
      // Base card styles
      "flex flex-col relative overflow-visible",
      // Padding varies by variant
      isAnalyst ? "p-3 gap-2" : isCinema ? "p-6 gap-4" : "p-4 gap-3",
      // Min height varies by variant
      isAnalyst ? "min-h-[100px]" : isCinema ? "min-h-[200px]" : "min-h-[160px]",
      // Story 3.12 - AC2: Dimmed styling when space is full
      isFull && "opacity-70 saturate-[0.7]", isHighlighted && "ring-2 ring-primary", isUserInSpace && "ring-1 ring-blue-400", className)}
      // Story 3.2: Apply space type gradient and theme styling via inline styles
      style={{
        backgroundImage: gradientVar
      }} data-testid={`space-${space.id}`} data-selected={isHighlighted ? 'true' : 'false'} data-user-in-space={isUserInSpace ? 'true' : 'false'} data-space-id={space.id}
      // Story 3.11 AC10: aria-expanded for accessibility
      aria-expanded={showPanel || bottomSheetOpen} onPointerDownCapture={e => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-avatar-interactive]')) {
          e.stopPropagation();
        }
      }} onClick={e => handleClick(e)} onDoubleClick={() => onSpaceDoubleClick?.(space)} onFocus={revealDetailPanelOnFocus} onBlur={hideDetailPanelOnBlur}
      // Story 3.12 - AC8: Enhanced aria-label with capacity info
      aria-label={space.capacity > 0 ? `Space ${space.name}, ${usersInSpace.length} of ${space.capacity} participants${isFull ? ', full' : ''}` : `Space ${space.name}, ${usersInSpace.length} active`} role="button" aria-current={isHighlighted ? 'true' : undefined} tabIndex={0} onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
        // Story 3.11: Escape closes panel
        if (e.key === 'Escape' && showPanel) {
          setShowPanel(false);
        }
      }}>
        {pendingKnockRequest && isUserInSpace && <KnockBanner requesterName={pendingKnockRequest.requesterName} requesterAvatarUrl={pendingKnockRequest.requesterAvatarUrl} onApprove={() => onKnockApprove?.(pendingKnockRequest)} onDeny={() => onKnockDeny?.(pendingKnockRequest)} />}

        {/* Header section */}
        <div className={floorPlanTokens.spaceCard.content.header}>
          {/* Story 3.4: Attention Beacon - positioned absolute top-right */}
          <AttentionBeacon active={beaconState.active} severity={beaconState.severity} reason={beaconState.reason} className="absolute top-2 right-2 z-20" />

          {/* Context Menu - positioned top right, offset from beacon */}
          <div className={cn("absolute flex items-center gap-1 z-30", beaconState.active ? "top-2 right-8" : "top-2 right-2")} data-avatar-interactive="true" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <SpaceContextMenu space={space} isAdmin={isAdmin} isUserInSpace={isUserInSpace} onEnter={canDirectEnter ? () => onEnterSpace(space.id) : undefined} onKnock={onKnock ? () => onKnock(space.id) : undefined} canDirectEnter={canDirectEnter} onOpenChat={onOpenChat ? () => onOpenChat(space) : undefined} onEdit={onEditSpace ? () => onEditSpace(space) : undefined} size="sm" variant="ghost" />
          </div>

          {/* Space badges below menu */}
          <div className={cn("absolute flex flex-col gap-1 items-end", "top-10 right-2")}>
            {/* Story 3.12 - AC2: Show Full badge when space is at capacity */}
            {isFull && <FullBadge />}

            {/* Only show status badge if not compact/analyst mode */}
            {!isCompact && <SpaceStatusBadge status={space.status} showIcon size="sm" />}

            {/* Always show capacity indicator */}
            <CapacityIndicator current={usersInSpace.length} capacity={space.capacity} size="sm" />
          </div>

          {/* Space name and type */}
          <h3 className={cn("font-medium text-foreground pr-16 truncate", isAnalyst ? "text-sm" : isCinema ? "text-lg" : "text-base")}>
            {space.name}
          </h3>

          {/* Space meta - show in analyst mode as compact text */}
          {isAnalyst && <div className="text-xs text-muted-foreground mt-0.5">
              {usersInSpace.length} Active
            </div>}

          {/* Only show type indicator if not compact/analyst mode */}
          {!isCompact && <div className="mt-1">
              <SpaceTypeIndicator type={space.type} showLabel size="sm" />
            </div>}
        </div>

        {/* Description (if not compact mode and has description) */}
        {!isCompact && space.description && <div className={cn(floorPlanTokens.spaceCard.content.body,
        // Hide description in cinema mode when container is wide enough
        "@min-[400px]:hidden")}>
            <p className={cn("text-muted-foreground line-clamp-2", isCinema ? "text-sm" : "text-xs")}>
              {space.description}
            </p>
          </div>}

        {/* Cinema Split Layout (Container Query) */}
        <div className={cn("flex flex-col gap-4 flex-grow",
        // When container is wide enough, switch to row layout
        "@min-[400px]:flex-row @min-[400px]:items-stretch")}>
          
          {/* Log Stream (Only visible in Cinema mode when wide) */}
          <div className={cn("hidden", "@min-[400px]:flex @min-[400px]:flex-1 @min-[400px]:items-center", "font-mono text-xs text-vo-text-muted bg-vo-log-bg p-3 rounded-lg border-l-2 border-vo-accent shadow-inner")}>
            {">"} {space.description || "No recent activity."}
          </div>

          {/* Right side of split (Avatars and Phase) */}
          <div className={cn("flex flex-row justify-between items-center", "@min-[400px]:flex-col @min-[400px]:justify-between @min-[400px]:items-end @min-[400px]:min-w-[120px]")}>
            {/* User avatars - hidden in analyst mode per UX spec */}
            {/* Story 3.3: Max 4 visible avatars in default Orbit view per spec */}
            {!isAnalyst && <div className={cn(floorPlanTokens.spaceCard.content.footer, "@min-[400px]:mt-2")}>
                <AvatarGroup users={usersInSpace} max={isCinema ? 6 : 4} size={isCinema ? 'md' : 'sm'} onUserClick={onUserClick} emptyText="Empty" className="mt-2 @min-[400px]:mt-0" speakingUserIds={speakingUserIds} mutedUserIds={mutedUserIds} />
              </div>}
          </div>
        </div>

        {/* Sparkline - only in analyst mode per UX spec */}
        {isAnalyst && <div className="h-8 w-full flex items-end gap-[2px] mt-auto pt-2 cursor-crosshair relative group">
            {Array(24).fill(0).map((_, i) => {
            const height = Math.max(15, ((i * 37 + space.id.length * 11) % 100));
            return <div key={i} className="flex-1 bg-vo-border-subtle rounded-t-[2px] min-h-[4px] transition-all duration-200 hover:bg-vo-accent hover:scale-y-125 origin-bottom" style={{
              height: `${height}%`
            }} />;
          })}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-vo-text-primary text-vo-bg-base px-2 py-1 rounded-md text-[10px] font-bold opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 pointer-events-none whitespace-nowrap z-20">
              Activity: {Math.round(occupancyPercent)}/m
            </div>
          </div>}

        {isRestrictedSpace && !isUserInSpace && <SpaceActionButtons layout="inline-card" state={{ userInSpace: isUserInSpace, privateSpace: isRestrictedSpace, hasOccupants: usersInSpace.length > 0, canDirectEnter }} onJoin={handleJoin} onLeave={handleLeave} onKnock={onKnock ? () => onKnock(space.id) : undefined} knockStatus={knockStatus} knockCooldownRemaining={knockCooldownRemaining} />}
      </GlassPanel>

      {/* Story 3.11: Desktop Hover Panel (AC1) - Outside card but inside wrapper */}
      {showPanel && !isMobile && showDetailPanel && <div className={cn("absolute left-0 right-0 top-full mt-2 z-50", "min-w-[280px] max-w-[400px]")}
      // Prevent panel interactions from closing the panel
      onClick={e => e.stopPropagation()}>
          <SpaceDetailPanel space={space} usersInSpace={usersInSpace} agendaPhase={agenda ?? undefined} activityLog={activityLog} transcript={transcript ?? undefined} state={{ userInSpace: isUserInSpace, privateSpace: !space.accessControl?.isPublic, full: isFull, canDirectEnter, loading: detailsLoading }} onJoin={handleJoin} onLeave={handleLeave} onKnock={onKnock ? () => onKnock(space.id) : undefined} knockStatus={knockStatus} knockCooldownRemaining={knockCooldownRemaining} onUserClick={onUserClick} onClose={() => setShowPanel(false)} speakingUserIds={speakingUserIds} presentingUserId={presentingUserId} mutedUserIds={mutedUserIds} />
        </div>}

      {/* Story 3.11: Mobile Bottom Sheet (AC8) */}
      {isMobile && showDetailPanel && <SpaceDetailBottomSheet open={bottomSheetOpen} onOpenChange={setBottomSheetOpen} space={space} usersInSpace={usersInSpace} agendaPhase={agenda ?? undefined} activityLog={activityLog} transcript={transcript ?? undefined} state={{ userInSpace: isUserInSpace, privateSpace: !space.accessControl?.isPublic, full: isFull, canDirectEnter, loading: detailsLoading }} onJoin={handleJoin} onLeave={handleLeave} onKnock={onKnock ? () => onKnock(space.id) : undefined} knockStatus={knockStatus} knockCooldownRemaining={knockCooldownRemaining} onUserClick={onUserClick} speakingUserIds={speakingUserIds} presentingUserId={presentingUserId} mutedUserIds={mutedUserIds} />}
    </div>
  );
};
export default ModernSpaceCard;
