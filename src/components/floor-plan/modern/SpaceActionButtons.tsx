// src/components/floor-plan/modern/SpaceActionButtons.tsx
// Story 3.11 - AC6: Primary Action Button
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { LogIn, LogOut, DoorOpen } from 'lucide-react';
import type { KnockStatus } from '@/hooks/useKnock';

/**
 * Story 3.11 - AC6: Primary Action Button
 * Story 3.12 - AC3: Join Button Disabled for Full Spaces
 * Story 3.16 - Knock to Enter:
 * - "Knock" shown if space has occupants (etiquette: always knock before entering)
 * - "Join" shown if space is empty
 * - "Leave" shown if user is already in the space
 * - Button styled per theme with hover states
 * - Join disabled when space is full (AC3)
 */
export interface SpaceActionButtonsProps {
  isUserInSpace: boolean;
  /** @deprecated Use hasOccupants instead for knock logic */
  isPrivate?: boolean;
  /** Story 3.16: Whether the space has users inside (show Knock if true) */
  hasOccupants?: boolean;
  /** Story 3.12 - AC3: Whether the space is at full capacity */
  isFull?: boolean;
  /** Whether user can directly enter/join right now */
  canDirectEnter?: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onKnock?: () => void;
  knockStatus?: KnockStatus;
  knockCooldownRemaining?: number;
  className?: string;
}

export const SpaceActionButtons: React.FC<SpaceActionButtonsProps> = ({
  isUserInSpace,
  isPrivate = false,
  hasOccupants = false,
  isFull = false,
  canDirectEnter = true,
  onJoin,
  onLeave,
  onKnock,
  knockStatus = 'idle',
  knockCooldownRemaining = 0,
  className,
}) => {
  const shouldShowKnock = Boolean(onKnock) && (!canDirectEnter || hasOccupants);
  const shouldShowJoin = canDirectEnter;
  const isKnocking = knockStatus === 'knocking';
  const isCooldown = knockStatus === 'cooldown' && knockCooldownRemaining > 0;
  // Common button styles
  const buttonBase = cn(
    'flex items-center justify-center gap-2',
    'px-4 py-2 rounded-lg',
    'text-sm font-medium',
    'transition-all duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed'
  );

  // Primary button (Join)
  const primaryButton = cn(
    buttonBase,
    'bg-[var(--vo-active-bg)] text-[var(--vo-active-text)]',
    'hover:opacity-90',
    'focus:ring-[var(--vo-active-border)]'
  );

  // Secondary button (Leave/Knock)
  const secondaryButton = cn(
    buttonBase,
    'bg-transparent border border-[var(--vo-border-subtle)]',
    'text-foreground',
    'hover:bg-[var(--vo-hover-bg)]',
    'focus:ring-[var(--ring)]'
  );

  // Knock button (for private spaces)
  const knockButton = cn(
    buttonBase,
    'bg-[var(--vo-pill-bg)] text-[var(--vo-pill-text)]',
    'border border-[var(--vo-pill-border)]',
    'hover:bg-[var(--vo-hover-bg)]',
    'focus:ring-[var(--ring)]'
  );

  return (
    <div
      className={cn('flex gap-2 pt-2 border-t border-[var(--vo-border-subtle)]', className)}
      // AC7: exempt buttons from click-stop (they ARE the action)
      data-space-action="true"
    >
      {isUserInSpace ? (
        // User is in space - show Leave button
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLeave();
          }}
          className={cn(secondaryButton, 'flex-1')}
          data-space-action="true"
          aria-label="Leave this space"
        >
          <LogOut className="w-4 h-4" />
          Leave
        </button>
      ) : (
        <>
          {shouldShowJoin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isFull) {
                  onJoin();
                }
              }}
              className={cn(primaryButton, 'flex-1', isFull && 'opacity-50 cursor-not-allowed')}
              data-space-action="true"
              disabled={isFull}
              aria-disabled={isFull}
              title={isFull ? 'Space is full - cannot join' : 'Join this space'}
              aria-label={isFull ? 'Space is full - cannot join' : 'Join this space'}
            >
              <LogIn className="w-4 h-4" />
              {isFull ? 'Full' : 'Join'}
            </button>
          )}

          {shouldShowKnock && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isKnocking && !isCooldown) {
                  onKnock?.();
                }
              }}
              className={cn(knockButton, shouldShowJoin ? 'flex-1' : 'flex-1')}
              data-space-action="true"
              disabled={isKnocking || isCooldown}
              aria-disabled={isKnocking || isCooldown}
              title={
                isKnocking
                  ? 'Waiting for response'
                  : isCooldown
                    ? `Try again in ${knockCooldownRemaining}s`
                    : isPrivate
                      ? 'Knock to request entry'
                      : 'Knock first (optional)'
              }
              aria-label={isKnocking ? 'Knock pending' : isCooldown ? `Knock cooldown active, ${knockCooldownRemaining} seconds remaining` : 'Knock to request entry'}
            >
              <DoorOpen className="w-4 h-4" />
              {isKnocking ? 'Knocking...' : isCooldown ? `Knock (${knockCooldownRemaining}s)` : 'Knock'}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default SpaceActionButtons;
