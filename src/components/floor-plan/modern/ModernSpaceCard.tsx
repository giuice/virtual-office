// src/components/floor-plan/modern/ModernSpaceCard.tsx
import React, { useState } from 'react';
import { Space, SpaceType } from '@/types/database';
import { UserPresenceData } from '@/types/database';
import AvatarGroup from './AvatarGroup';
import { SpaceStatusBadge, SpaceTypeIndicator, CapacityIndicator } from './StatusIndicators';
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
  isHighlighted?: boolean;
  isUserInSpace?: boolean;
  className?: string;
  compact?: boolean;
  /** Perspective variant: orbit (default), analyst (dense with sparkline), cinema (large) */
  variant?: SpaceCardVariant;
}

const ModernSpaceCard: React.FC<ModernSpaceCardProps> = ({ 
  space, 
  usersInSpace, 
  onEnterSpace, 
  onOpenChat, 
  onUserClick,
  onSpaceDoubleClick,
  isHighlighted = false,
  isUserInSpace = false,
  className = '',
  compact = false,
  variant = 'orbit'
}) => {
  const [hovered, setHovered] = useState(false);
  
  // Determine if we're in analyst mode (dense view)
  const isAnalyst = variant === 'analyst';
  const isCinema = variant === 'cinema';
  const isCompact = compact || isAnalyst;
  
  const handleClick = (e?: React.MouseEvent<HTMLDivElement>) => {
    if (e) {
      const target = e.target as HTMLElement;
      // Prevent clicks on interactive elements within the card from triggering navigation
      if (target.closest('[data-avatar-interactive="true"]') || target.closest('a, button:not([data-space-action])')) {
        e.stopPropagation();
        return;
      }
    }
    onEnterSpace(space.id);
    if (onOpenChat) {
      onOpenChat(space);
    }
  };

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
    <div
      className={cn(
        // Base card styles
        "flex flex-col relative overflow-hidden",
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
      onPointerDownCapture={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-avatar-interactive]')) {
          e.stopPropagation();
        }
      }}
      onClick={(e) => handleClick(e)}
      onDoubleClick={() => onSpaceDoubleClick?.(space)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Enter space ${space.name}`}
      role="button"
      aria-current={isHighlighted ? 'true' : undefined}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      {/* Header section */}
      <div className={floorPlanTokens.spaceCard.content.header}>
        {/* Space badges at top right */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
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
      {!isAnalyst && (
        <div className={floorPlanTokens.spaceCard.content.footer}>
          <AvatarGroup
            users={usersInSpace}
            max={isCinema ? 8 : isCompact ? 4 : 6}
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
  );
};

export default ModernSpaceCard;
