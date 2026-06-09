import React from 'react';
import { UserPresenceData } from '@/types/database';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Story 3.3: Avatar Constellation V2
 * Enhanced avatar with speaking, presenting, and muted status states.
 * Features animated status rings and hover interactions.
 */
export interface UserAvatarPresenceProps {
  user: UserPresenceData;
  onClick?: (userId: string) => void;
  state?: {
    /** Avatar is actively speaking (shows animated glow ring) */
    speaking?: boolean;
    /** Avatar is presenting/sharing screen (shows solid accent border) */
    presenting?: boolean;
    /** Avatar is muted/observer mode (shows dimmed state) */
    muted?: boolean;
    /** Show status text in tooltip */
    showStatusInTooltip?: boolean;
  };
  /** Avatar size - defaults to 'md' (36px per UX spec) */
  size?: 'sm' | 'md' | 'lg';
}

// Size mapping to EnhancedAvatarV2 sizes
const sizeMap = {
  sm: 'sm' as const,
  md: 'md' as const,
  lg: 'lg' as const,
};

const UserAvatarPresence: React.FC<UserAvatarPresenceProps> = ({
  user,
  onClick,
  state,
  size = 'md',
}) => {
  const isSpeaking = state?.speaking ?? false;
  const isPresenting = state?.presenting ?? false;
  const isMuted = state?.muted ?? false;
  const showStatusInTooltip = state?.showStatusInTooltip ?? true;
  // Status color for presence indicator dot
  const statusColor = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    busy: 'bg-red-500',
    offline: 'bg-gray-400',
  }[user.status || 'offline'] || 'bg-gray-400';

  const handleAvatarPress: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    if (onClick) {
      onClick(user.id);
    }
  };

  // Determine display status for tooltip
  const getDisplayStatus = (): string => {
    if (isSpeaking) return 'Speaking';
    if (isPresenting) return 'Presenting';
    if (isMuted) return 'Muted';
    return user.status || 'offline';
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              // Base styles - vo-avatar-item for constellation integration
              'vo-avatar-item relative inline-block',
              // Smooth animation (Story 3.3 AC6)
              'transition-all duration-200',
              // Hover interaction: translateY(-3px) scale(1.1) with z-index bump
              'hover:translate-y-[-3px] hover:scale-110 hover:z-50',
              // Status states (AC3) - smooth transitions via CSS
              isSpeaking && 'vo-avatar-speaking',
              isPresenting && 'vo-avatar-presenting',
              isMuted && 'vo-avatar-muted',
              // Cursor and interactivity
              onClick && 'cursor-pointer'
            )}
            data-avatar-interactive
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleAvatarPress}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={onClick ? `User ${user.displayName}` : undefined}
            tabIndex={onClick ? 0 : -1}
          >
            <EnhancedAvatarV2
              user={user}
              size={sizeMap[size]}
              display={{ status: false }}
              className={cn(
                // Photo-first design with 2px border (AC2)
                'border-2',
                // Border color inherits from theme
                'border-[var(--vo-card-bg)]'
              )}
              onError={(error) => {
                console.warn(`[UserAvatarPresence] Failed to load avatar for ${user.displayName}:`, error.additionalInfo?.message);
              }}
            />
            {/* Presence status indicator dot */}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border border-background',
                statusColor
              )}
              aria-hidden="true"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {/* Tooltip shows name, role, and status (AC6) */}
          <p className="font-medium">{user.displayName}</p>
          {showStatusInTooltip && (
            <p className={cn(
              'text-xs capitalize',
              isSpeaking && 'text-[var(--vo-accent)] font-medium',
              isPresenting && 'text-[var(--vo-accent)] font-medium',
              isMuted && 'text-muted-foreground opacity-70',
              !isSpeaking && !isPresenting && !isMuted && 'text-muted-foreground'
            )}>
              {getDisplayStatus()}
            </p>
          )}
          {process.env.NODE_ENV === 'development' && (
            <p className="text-[10px] text-muted-foreground mt-1">ID: {user.id}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default UserAvatarPresence;
