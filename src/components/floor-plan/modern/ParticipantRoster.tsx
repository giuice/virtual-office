// src/components/floor-plan/modern/ParticipantRoster.tsx
// Story 3.11 - AC2: Full Participant Roster Display
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { UserPresenceData } from '@/types/database';
import ModernUserAvatar from './ModernUserAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mic, MicOff, Monitor, Eye } from 'lucide-react';

const EMPTY_USER_IDS: string[] = [];

/**
 * Story 3.11 - AC2: Full Participant Roster Display
 * - Displays ALL participants (not limited to 4 like card view)
 * - Shows avatar, name, role, status (speaking/listening/observing)
 * - Scrollable if more than 8 participants
 * - REUSES ModernUserAvatar component
 */
export interface ParticipantRosterProps {
  users: UserPresenceData[];
  onUserClick?: (userId: string) => void;
  maxHeight?: number;
  /** Speaking user IDs for status ring display */
  speakingUserIds?: string[];
  /** Presenting user ID for status ring display */
  presentingUserId?: string;
  /** Muted user IDs for dimmed display */
  mutedUserIds?: string[];
  className?: string;
}

/**
 * Get status indicator for a user
 */
function getUserStatus(
  userId: string,
  speakingUserIds: string[] = [],
  presentingUserId?: string,
  mutedUserIds: string[] = []
): 'speaking' | 'presenting' | 'muted' | 'listening' {
  if (presentingUserId === userId) return 'presenting';
  if (speakingUserIds.includes(userId)) return 'speaking';
  if (mutedUserIds.includes(userId)) return 'muted';
  return 'listening';
}

/**
 * Status icon component
 */
const StatusIcon: React.FC<{ status: ReturnType<typeof getUserStatus> }> = ({ status }) => {
  const iconClasses = 'size-3';
  
  switch (status) {
    case 'speaking':
      return <Mic className={cn(iconClasses, 'text-[var(--vo-accent)]')} />;
    case 'presenting':
      return <Monitor className={cn(iconClasses, 'text-[var(--vo-accent)]')} />;
    case 'muted':
      return <MicOff className={cn(iconClasses, 'text-muted-foreground')} />;
    case 'listening':
    default:
      return <Eye className={cn(iconClasses, 'text-muted-foreground opacity-50')} />;
  }
};

/**
 * Status label for accessibility
 */
function getStatusLabel(status: ReturnType<typeof getUserStatus>): string {
  switch (status) {
    case 'speaking': return 'Speaking';
    case 'presenting': return 'Presenting';
    case 'muted': return 'Muted';
    case 'listening': return 'Listening';
  }
}

export const ParticipantRoster: React.FC<ParticipantRosterProps> = ({
  users,
  onUserClick,
  maxHeight = 200,
  speakingUserIds = EMPTY_USER_IDS,
  presentingUserId,
  mutedUserIds = EMPTY_USER_IDS,
  className,
}) => {
  // Empty state
  if (users.length === 0) {
    return (
      <div className={cn('text-xs text-muted-foreground py-2', className)}>
        No participants
      </div>
    );
  }

  // Determine if scroll is needed (AC2: scrollable if more than 8)
  const needsScroll = users.length > 8;

  const content = (
    <div className="flex flex-col gap-1">
      {users.map((user) => {
        const status = getUserStatus(user.id, speakingUserIds, presentingUserId, mutedUserIds);
        
        const handleClick = () => onUserClick?.(user.id);
        const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClick();
          }
        };

        return (
          <div
            key={user.id}
            role="button"
            tabIndex={0}
            className={cn(
              'flex w-full items-center gap-2 p-1.5 rounded-lg text-left',
              'hover:bg-[var(--vo-hover-bg)] transition-colors cursor-pointer',
              status === 'muted' && 'opacity-60'
            )}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            data-avatar-interactive="true"
            aria-label={`${user.displayName}, ${getStatusLabel(status)}`}
          >
            {/* Avatar with status indicator */}
            <div className={cn(
              'relative flex-shrink-0',
              status === 'speaking' && 'vo-avatar-speaking',
              status === 'presenting' && 'vo-avatar-presenting'
            )}>
              <ModernUserAvatar
                user={user}
                size="sm"
                tooltipPlacement="left"
              />
            </div>

            {/* Name and status message */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">
                {user.displayName}
              </div>
              {user.statusMessage && (
                <div className="text-[10px] text-muted-foreground truncate">
                  {user.statusMessage}
                </div>
              )}
            </div>

            {/* Status icon */}
            <div className="flex-shrink-0" title={getStatusLabel(status)}>
              <StatusIcon status={status} />
            </div>
          </div>
        );
      })}
    </div>
  );

  // Wrap in ScrollArea if needed
  if (needsScroll) {
    return (
      <div className={className}>
        <div className="mb-1.5 text-xs text-muted-foreground">
          Participants ({users.length})
        </div>
        <ScrollArea
          style={{ height: maxHeight, maxHeight }}
          className="overflow-hidden pr-2"
          data-testid="participant-roster-scroll"
          data-scrollable="true"
        >
          {content}
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mb-1.5 text-xs text-muted-foreground">
        Participants ({users.length})
      </div>
      {content}
    </div>
  );
};

export default ParticipantRoster;
