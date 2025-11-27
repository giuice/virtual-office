// src/components/floor-plan/modern/ModernSpaceCard.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Space, SpaceType } from '@/types/database';
import { UserPresenceData } from '@/types/database';
import AvatarGroup from './AvatarGroup';
import { SpaceStatusBadge, SpaceTypeIndicator, CapacityIndicator } from './StatusIndicators';
import AttentionBeacon from './AttentionBeacon';
import SpaceContextMenu from './SpaceContextMenu';
import { SpaceDetailPanel } from './SpaceDetailPanel';
import { SpaceDetailBottomSheet } from './SpaceDetailBottomSheet';
import { useAttentionBeacon, SpaceBeaconData } from '@/hooks/useAttentionBeacon';
import { useSpaceDetails } from '@/hooks/useSpaceDetails';
import { cn } from '@/lib/utils';
import { floorPlanTokens } from './designTokens';

// ============================================
// Story 3.2: Gradient utilities
// ============================================

/**
 * Get the CSS custom property name for a space type gradient.
 * Maps space types to gradient CSS variables defined in tokens.css.
 */
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
  isHighlighted?: boolean;
  isUserInSpace?: boolean;
  /** Whether the current user is an admin */
  isAdmin?: boolean;
  className?: string;
  compact?: boolean;
  /** Perspective variant: orbit (default), analyst (dense with sparkline), cinema (large) */
  variant?: SpaceCardVariant;
  /** Optional beacon data for attention triggers (blocker, help requested) */
  spaceBeaconData?: SpaceBeaconData;
  /** Story 3.11: Enable hover panel detail view */
  showDetailPanel?: boolean;
  /** Story 3.11: Speaking user IDs for status display */
  speakingUserIds?: string[];
  /** Story 3.11: Presenting user ID for status display */
  presentingUserId?: string;
  /** Story 3.11: Muted user IDs for dimmed display */
  mutedUserIds?: string[];
}

const ModernSpaceCard: React.FC<ModernSpaceCardProps> = ({ 
  space, 
  usersInSpace, 
  onEnterSpace, 
  onOpenChat, 
  onUserClick,
  onSpaceDoubleClick,
  onEditSpace,
  isHighlighted = false,
  isUserInSpace = false,
  isAdmin = false,
  className = '',
  compact = false,
  variant = 'orbit',
  spaceBeaconData,
  showDetailPanel = true,
  speakingUserIds = [],
  presentingUserId,
  mutedUserIds = [],
}) => {
  const [hovered, setHovered] = useState(false);
  // Story 3.11: Detail panel state
  const [showPanel, setShowPanel] = useState(false);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Story 3.11: Detect mobile viewport
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Story 3.11: Lazy fetch space details when panel should show
  const shouldFetchDetails = showPanel || bottomSheetOpen;
  const { agenda, activityLog, transcript, isLoading: detailsLoading } = useSpaceDetails(
    shouldFetchDetails ? space.id : null
  );
  
  // Story 3.4: Attention Beacon integration
  const beaconState = useAttentionBeacon(
    space.id,
    usersInSpace,
    space.capacity,
    spaceBeaconData
  );
  
  // Determine if we're in analyst mode (dense view)
  const isAnalyst = variant === 'analyst';
  const isCinema = variant === 'cinema';
  const isCompact = compact || isAnalyst;
  
  // Story 3.11: Handle hover with delay to prevent flicker
  // The hover area now includes both card and panel
  const handleMouseEnter = useCallback(() => {
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setHovered(true);
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
      setHovered(false);
      setShowPanel(false);
    }, 100);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
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
    // Leave action - would need a proper handler passed down
    console.log('Leave space:', space.id);
    setShowPanel(false);
    setBottomSheetOpen(false);
  }, [space.id]);

  // Story 3.11 AC10: Show panel on keyboard focus
  const handleFocus = useCallback(() => {
    if (showDetailPanel && !isMobile && !isAnalyst) {
      setShowPanel(true);
    }
  }, [showDetailPanel, isMobile, isAnalyst]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    // Only hide if focus moves outside the card entirely
    if (!cardRef.current?.contains(e.relatedTarget as Node)) {
      setShowPanel(false);
    }
  }, []);

  // Story 3.2: Compute gradient styling
  const gradientVar = getSpaceGradientVar(space.type);

  // Functions to format space properties
  const formatSpaceType = (type: string) => {
    return type.replace(/_/g, ' ');
  };

  // Occupancy percentage for sparkline
  const occupancyPercent = space.capacity > 0 
    ? Math.min((usersInSpace.length / space.capacity) * 100, 100) 
    : 0;

  return (
    // Story 3.11: Wrapper div handles hover for both card and panel
    // This ensures mouse can move from card to panel without closing it
    <div 
      ref={wrapperRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={cardRef}
        className={cn(
          // Base card styles
          "flex flex-col relative overflow-visible",
          // Rounded corners - smaller for analyst
          isAnalyst ? "rounded-[12px]" : "rounded-[20px]",
          "border",
          // Padding varies by variant
          isAnalyst ? "p-3 gap-2" : isCinema ? "p-6 gap-4" : "p-4 gap-3",
          // Shadows and transitions
          floorPlanTokens.spaceCard.shadow.default,
          floorPlanTokens.spaceCard.transition,
          "transition-all duration-300 ease-out",
          // Hover effects
          hovered && [
            floorPlanTokens.spaceCard.shadow.hover,
            "-translate-y-[5px] scale-[1.01]",
            "z-10"
          ],
          isHighlighted && "ring-2 ring-primary",
          isUserInSpace && "ring-1 ring-blue-400",
          // Min height varies by variant
          isAnalyst ? "min-h-[100px]" : isCinema ? "min-h-[200px]" : "min-h-[160px]",
          "cursor-pointer",
          className
        )}
        // Story 3.2: Apply space type gradient and theme styling via inline styles
        style={{
          backgroundImage: gradientVar,
          backgroundColor: 'var(--vo-card-bg)',
          borderColor: hovered ? 'var(--vo-card-hover-border)' : 'var(--vo-card-border)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: hovered ? 'var(--vo-card-hover-shadow)' : undefined,
        }}
        data-testid={`space-${space.id}`}
        data-selected={isHighlighted ? 'true' : 'false'}
        data-user-in-space={isUserInSpace ? 'true' : 'false'}
        data-space-id={space.id}
        // Story 3.11 AC10: aria-expanded for accessibility
        aria-expanded={showPanel || bottomSheetOpen}
        onPointerDownCapture={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-avatar-interactive]')) {
            e.stopPropagation();
          }
        }}
        onClick={(e) => handleClick(e)}
        onDoubleClick={() => onSpaceDoubleClick?.(space)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        aria-label={`Enter space ${space.name}`}
        role="button"
        aria-current={isHighlighted ? 'true' : undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick();
          }
          // Story 3.11: Escape closes panel
          if (e.key === 'Escape' && showPanel) {
            setShowPanel(false);
          }
        }}
      >
      {/* Header section */}
      <div className={floorPlanTokens.spaceCard.content.header}>
        {/* Story 3.4: Attention Beacon - positioned absolute top-right */}
        <AttentionBeacon
          active={beaconState.active}
          severity={beaconState.severity}
          reason={beaconState.reason}
          className="absolute top-2 right-2 z-20"
        />
        
        {/* Context Menu - positioned top right, offset from beacon */}
        <div 
          className={cn(
            "absolute flex items-center gap-1 z-30",
            beaconState.active ? "top-2 right-8" : "top-2 right-2"
          )}
          data-avatar-interactive="true"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <SpaceContextMenu
            space={space}
            isAdmin={isAdmin}
            isUserInSpace={isUserInSpace}
            onEnter={() => onEnterSpace(space.id)}
            onOpenChat={onOpenChat ? () => onOpenChat(space) : undefined}
            onEdit={onEditSpace ? () => onEditSpace(space) : undefined}
            size="sm"
            variant="ghost"
          />
        </div>

        {/* Space badges below menu */}
        <div className={cn(
          "absolute flex flex-col gap-1 items-end",
          "top-10 right-2"
        )}>
          {/* Only show status badge if not compact/analyst mode */}
          {!isCompact && (
            <SpaceStatusBadge status={space.status} showIcon size="sm" />
          )}
          
          {/* Always show capacity indicator */}
          <CapacityIndicator 
            current={usersInSpace.length} 
            capacity={space.capacity} 
            size="sm"
          />
        </div>

        {/* Space name and type */}
        <h3 className={cn(
          "font-medium text-foreground pr-16 truncate",
          isAnalyst ? "text-sm" : isCinema ? "text-lg" : "text-base"
        )}>
          {space.name}
        </h3>
        
        {/* Space meta - show in analyst mode as compact text */}
        {isAnalyst && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {usersInSpace.length} Active
          </div>
        )}
        
        {/* Only show type indicator if not compact/analyst mode */}
        {!isCompact && (
          <div className="mt-1">
            <SpaceTypeIndicator type={space.type} showLabel size="sm" />
          </div>
        )}
      </div>
      
      {/* Description (if not compact mode and has description) */}
      {!isCompact && space.description && (
        <div className={floorPlanTokens.spaceCard.content.body}>
          <p className={cn(
            "text-muted-foreground line-clamp-2",
            isCinema ? "text-sm" : "text-xs"
          )}>
            {space.description}
          </p>
        </div>
      )}
      
      {/* User avatars - hidden in analyst mode per UX spec */}
      {/* Story 3.3: Max 4 visible avatars in default Orbit view per spec */}
      {!isAnalyst && (
        <div className={floorPlanTokens.spaceCard.content.footer}>
          <AvatarGroup
            users={usersInSpace}
            max={isCinema ? 6 : 4}
            size={isCinema ? 'md' : 'sm'}
            onUserClick={onUserClick}
            emptyText="Empty"
            className="mt-2"
          />
        </div>
      )}
      
      {/* Sparkline - only in analyst mode per UX spec */}
      {isAnalyst && (
        <div className="h-1 w-full bg-[var(--vo-border-subtle)] rounded-sm overflow-hidden mt-auto">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${occupancyPercent}%`,
              backgroundColor: 'var(--vo-accent)',
            }}
          />
        </div>
      )}
      </div>
      
      {/* Story 3.11: Desktop Hover Panel (AC1) - Outside card but inside wrapper */}
      {showPanel && !isMobile && showDetailPanel && (
        <div 
          className={cn(
            "absolute left-0 right-0 top-full mt-2 z-50",
            "min-w-[280px] max-w-[400px]"
          )}
          // Prevent panel interactions from closing the panel
          onClick={(e) => e.stopPropagation()}
        >
          <SpaceDetailPanel
            space={space}
            usersInSpace={usersInSpace}
            agendaPhase={agenda ?? undefined}
            activityLog={activityLog}
            transcript={transcript ?? undefined}
            isUserInSpace={isUserInSpace}
            isPrivate={!space.accessControl?.isPublic}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onUserClick={onUserClick}
            onClose={() => setShowPanel(false)}
            speakingUserIds={speakingUserIds}
            presentingUserId={presentingUserId}
            mutedUserIds={mutedUserIds}
            isLoading={detailsLoading}
          />
        </div>
      )}
      
      {/* Story 3.11: Mobile Bottom Sheet (AC8) */}
      {isMobile && showDetailPanel && (
        <SpaceDetailBottomSheet
          open={bottomSheetOpen}
          onOpenChange={setBottomSheetOpen}
          space={space}
          usersInSpace={usersInSpace}
          agendaPhase={agenda ?? undefined}
          activityLog={activityLog}
          transcript={transcript ?? undefined}
          isUserInSpace={isUserInSpace}
          isPrivate={!space.accessControl?.isPublic}
          onJoin={handleJoin}
          onLeave={handleLeave}
          onUserClick={onUserClick}
          speakingUserIds={speakingUserIds}
          presentingUserId={presentingUserId}
          mutedUserIds={mutedUserIds}
          isLoading={detailsLoading}
        />
      )}
    </div>
  );
};

export default ModernSpaceCard;
