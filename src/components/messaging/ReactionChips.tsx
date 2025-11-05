// src/components/messaging/ReactionChips.tsx
'use client';

import { useMemo } from 'react';
import { MessageReaction } from '@/types/messaging';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ReactionChipsProps {
  reactions: MessageReaction[];
  currentUserId?: string;
  onReactionToggle: (emoji: string) => void;
  className?: string;
}

interface AggregatedReaction {
  emoji: string;
  count: number;
  userIds: string[];
  userReacted: boolean;
  latestTimestamp: Date;
}

const toDate = (value: unknown): Date => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date(0);
};

export function ReactionChips({
  reactions,
  currentUserId,
  onReactionToggle,
  className,
}: ReactionChipsProps) {
  const aggregatedReactions = useMemo(() => {
    const map = new Map<string, AggregatedReaction>();

    reactions.forEach((reaction) => {
      const reactionTimestamp = toDate(reaction.timestamp);
      const existing = map.get(reaction.emoji);
      if (existing) {
        const alreadyReacted = existing.userIds.includes(reaction.userId);
        existing.userReacted = existing.userReacted || reaction.userId === currentUserId;
        if (!alreadyReacted) {
          existing.count++;
          existing.userIds.push(reaction.userId);
        }
        if (reactionTimestamp > existing.latestTimestamp) {
          existing.latestTimestamp = reactionTimestamp;
        }
      } else {
        map.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: 1,
          userIds: [reaction.userId],
          userReacted: reaction.userId === currentUserId,
          latestTimestamp: reactionTimestamp,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      // Sort by most recent interaction first
      const timeDiff = b.latestTimestamp.getTime() - a.latestTimestamp.getTime();
      if (timeDiff !== 0) return timeDiff;
      // Then by emoji codepoint for determinism
      return a.emoji.localeCompare(b.emoji);
    });
  }, [reactions, currentUserId]);

  if (aggregatedReactions.length === 0) {
    return null;
  }

  const handleClick = (event: React.MouseEvent, emoji: string) => {
    event.stopPropagation();
    if (event.detail === 0) {
      // Keyboard activation is handled in onKeyDown to avoid double toggles.
      return;
    }
    onReactionToggle(emoji);
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    event.stopPropagation();
  };

  const handleKeyDown = (event: React.KeyboardEvent, emoji: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      onReactionToggle(emoji);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex flex-wrap gap-1 mt-1', className)}>
        {aggregatedReactions.map(({ emoji, count, userReacted }) => (
          <Tooltip key={emoji}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors',
                  'hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring',
                  userReacted
                    ? 'bg-primary/20 border border-primary'
                    : 'bg-secondary border border-transparent'
                )}
                onClick={(event) => handleClick(event, emoji)}
                onPointerDown={handlePointerDown}
                onKeyDown={(event) => handleKeyDown(event, emoji)}
                data-avatar-interactive
                data-testid={`reaction-chip-${emoji}`}
                aria-label={`${userReacted ? 'Remove' : 'Add'} ${emoji} reaction`}
              >
                <span>{emoji}</span>
                <span className="font-medium">{count}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {count === 1
                  ? userReacted
                    ? 'You reacted'
                    : '1 reaction'
                  : `${count} reactions`}
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
