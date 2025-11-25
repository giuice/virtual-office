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
  /** Avatar is actively speaking (shows animated glow ring) */
  isSpeaking?: boolean;
  /** Avatar is presenting/sharing screen (shows solid accent border) */
  isPresenting?: boolean;
  /** Avatar is muted/observer mode (shows dimmed state) */
  isMuted?: boolean;
  /** Avatar size - defaults to 'md' (36px per UX spec) */
  size?: 'sm' | 'md' | 'lg';
  /** Show status text in tooltip */
  showStatusInTooltip?: boolean;
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
  isSpeaking = false,
  isPresenting = false,
  isMuted = false,
  size = 'md',
  showStatusInTooltip = true,
}) => {
  // Status color for presence indicator dot
  const statusColor = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    busy: 'bg-red-500',
    offline: 'bg-gray-400',
  }[user.status || 'offline'] || 'bg-gray-400';

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
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
          <div
            className={cn(
              // Base styles - vo-avatar-item for constellation integration
              'vo-avatar-item relative inline-block',
              // Hover interaction: translateY(-3px) scale(1.1) with z-index bump (AC6)
              'transition-all duration-200 ease-out',
              'hover:translate-y-[-3px] hover:scale-110 hover:z-50',
              // Status states (AC3)
              isSpeaking && 'vo-avatar-speaking',
              isPresenting && 'vo-avatar-presenting',
              isMuted && 'vo-avatar-muted',
              // Cursor and interactivity
              onClick && 'cursor-pointer'
            )}
            data-avatar-interactive
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleClick}
            onPointerDown={(e) => e.stopPropagation()}
            role={onClick ? 'button' : undefined}
            aria-label={onClick ? `User ${user.displayName}` : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={(e) => {
              if (onClick && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onClick(user.id);
              }
            }}
          >
            <EnhancedAvatarV2
              user={user}
              size={sizeMap[size]}
              showStatus={false}
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
                'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background',
                statusColor
              )}
              aria-hidden="true"
            />
          </div>
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
