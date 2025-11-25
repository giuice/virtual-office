// src/components/floor-plan/modern/AvatarGroup.tsx
// Story 3.3: Avatar Constellation V2 - Smart stacking with negative margin overlap
import React from 'react';
import { UserPresenceData } from '@/types/database';
import ModernUserAvatar from './ModernUserAvatar';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Story 3.3: Avatar Constellation V2
 * Smart stacking with:
 * - Negative margin overlap (-10px) per UX spec
 * - Max 4 visible avatars (reduced from previous 8)
 * - Proper z-index layering (rightmost on top)
 * - Theme-aware overflow badge
 */
interface AvatarGroupProps {
  users: UserPresenceData[];
  /** Maximum visible avatars - defaults to 4 per Story 3.3 spec */
  max?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onUserClick?: (userId: string) => void;
  showEmpty?: boolean;
  emptyText?: string;
  /** Optional speaking user IDs for status ring display */
  speakingUserIds?: string[];
  /** Optional presenting user ID for status ring display */
  presentingUserId?: string;
  /** Optional muted user IDs for dimmed display */
  mutedUserIds?: string[];
}

const AvatarGroup: React.FC<AvatarGroupProps> = ({
  users,
  max = 4, // Story 3.3: Reduced from 5 to 4 per spec
  size = 'sm',
  className = '',
  onUserClick,
  showEmpty = true,
  emptyText = 'No users',
  speakingUserIds = [],
  presentingUserId,
  mutedUserIds = [],
}) => {
  // If no users are present
  if (users.length === 0 && showEmpty) {
    return (
      <div className={cn("flex items-center", className)}>
        <span className="text-xs text-muted-foreground">{emptyText}</span>
      </div>
    );
  }

  // Display empty div if no users and showEmpty is false
  if (users.length === 0 && !showEmpty) {
    return <div className={className} />;
  }

  // Calculate how many users to show and how many are remaining
  const visibleUsers = users.slice(0, max);
  const remainingCount = users.length - max;

  // Story 3.3: Check status for each user
  const isSpeaking = (userId: string) => speakingUserIds.includes(userId);
  const isPresenting = (userId: string) => presentingUserId === userId;
  const isMuted = (userId: string) => mutedUserIds.includes(userId);

  return (
    <div className={cn("flex items-center", className)}>
      {/* Story 3.3: Avatar constellation with smart stacking */}
      <div className="vo-avatar-constellation flex items-center pl-[10px]">
        {visibleUsers.map((user, index) => (
          <div 
            key={user.id} 
            className={cn(
              'vo-avatar-item relative',
              // Story 3.3: Status state classes
              isSpeaking(user.id) && 'vo-avatar-speaking',
              isPresenting(user.id) && 'vo-avatar-presenting',
              isMuted(user.id) && 'vo-avatar-muted'
            )}
            style={{ 
              // Story 3.3: Negative margin overlap (-10px) per UX spec (AC4)
              marginLeft: index > 0 ? '-10px' : '0',
              // Story 3.3: Z-index layering - rightmost avatar on top
              zIndex: index + 1
            }}
          >
            <ModernUserAvatar
              user={user}
              size={size}
              onClick={onUserClick}
              isOverlapping={index > 0}
              tooltipPlacement="top"
            />
          </div>
        ))}

        {/* Story 3.3: Overflow badge styled as avatar (AC5) */}
        {remainingCount > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="vo-avatar-overflow"
                  style={{ zIndex: visibleUsers.length + 1 }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${remainingCount} more participants`}
                >
                  +{remainingCount}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {remainingCount} more {remainingCount === 1 ? 'participant' : 'participants'}
                  </p>
                  <div className="mt-1 text-xs text-muted-foreground max-w-[200px]">
                    {users.slice(max).map(user => user.displayName).join(', ')}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
};

export default AvatarGroup;
