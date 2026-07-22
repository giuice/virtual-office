// src/components/floor-plan/modern/SpaceActionButtons.tsx
// Story 3.11 - AC6: Primary Action Button
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Clock, DoorClosed, DoorOpen, Loader2, LogIn, LogOut, ShieldX, Timer } from 'lucide-react';
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

const handleKnockPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
  event.stopPropagation();
};
export interface SpaceActionButtonsProps {
  layout?: 'panel' | 'inline-card';
  state: {
    userInSpace: boolean;
    privateSpace?: boolean;
    /** Story 3.16: Whether the space has users inside (show Knock if true) */
    hasOccupants?: boolean;
    /** Story 3.12 - AC3: Whether the space is at full capacity */
    full?: boolean;
    /** Whether user can directly enter/join right now */
    canDirectEnter?: boolean;
    /** Whether the space status currently permits direct entry */
    isDirectEntryAvailable?: boolean;
  };
  onJoin: () => void;
  onLeave: () => void;
  onKnock?: () => void;
  knockStatus?: KnockStatus;
  knockCooldownRemaining?: number;
  className?: string;
}
export const SpaceActionButtons: React.FC<SpaceActionButtonsProps> = ({
  layout = 'panel',
  state,
  onJoin,
  onLeave,
  onKnock,
  knockStatus = 'idle',
  knockCooldownRemaining = 0,
  className
}) => {
  const {
    userInSpace,
    privateSpace = false,
    hasOccupants = false,
    full = false,
    canDirectEnter = true,
    isDirectEntryAvailable = true,
  } = state;
  const shouldShowKnock = Boolean(onKnock) && (!canDirectEnter || hasOccupants);
  const shouldShowJoin = canDirectEnter && isDirectEntryAvailable;
  const shouldShowUnavailable = !shouldShowJoin && !shouldShowKnock;
  const isKnocking = knockStatus === 'knocking';
  const isCooldown = knockStatus === 'cooldown' && knockCooldownRemaining > 0;
  const isInlineCard = layout === 'inline-card';
  // Common button styles
  const buttonBase = cn('flex items-center justify-center gap-2', 'px-4 py-2 rounded-lg', 'text-sm font-medium', 'transition-all duration-200', 'focus:outline-none focus:ring-2 focus:ring-offset-2', 'disabled:opacity-50 disabled:cursor-not-allowed');

  // Primary button (Join)
  const primaryButton = cn(buttonBase, 'bg-[var(--vo-active-bg)] text-[var(--vo-active-text)]', 'hover:opacity-90', 'focus:ring-[var(--vo-active-border)]');

  // Secondary button (Leave/Knock)
  const secondaryButton = cn(buttonBase, 'bg-transparent border border-[var(--vo-border-subtle)]', 'text-foreground', 'hover:bg-[var(--vo-hover-bg)]', 'focus:ring-[var(--ring)]');

  // Knock button (for private spaces)
  const knockButton = cn(buttonBase, 'bg-[var(--vo-pill-bg)] text-[var(--vo-pill-text)]', 'border border-[var(--vo-pill-border)]', 'hover:bg-[var(--vo-hover-bg)]', 'focus:ring-[var(--ring)]');
  const handleKnockClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isKnocking && !isCooldown) {
      onKnock?.();
    }
  };
  if (isInlineCard) {
    if (!onKnock || userInSpace || canDirectEnter) {
      return null;
    }
    const inlineIcon = isKnocking ? <Loader2 className="size-4 animate-spin" /> : knockStatus === 'denied' ? <ShieldX className="size-4" /> : knockStatus === 'timeout' ? <Clock className="size-4" /> : isCooldown ? <Timer className="size-4" /> : <DoorClosed className="size-4" />;
    const inlineLabel = isKnocking ? 'Knocking...' : knockStatus === 'denied' ? 'Denied' : knockStatus === 'timeout' ? 'No response' : isCooldown ? `Wait ${knockCooldownRemaining}s` : 'Knock';
    return <div className={cn('flex pt-2', className)} data-avatar-interactive="true" data-space-action="true" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
        <button type="button" onClick={handleKnockClick} onPointerDown={handleKnockPointerDown} className={cn(knockButton, 'min-h-9 w-full justify-center rounded-md border-[var(--vo-accent)]/30', isKnocking && 'animate-pulse', (knockStatus === 'denied' || knockStatus === 'timeout') && 'opacity-60', isCooldown && 'text-[var(--vo-signal-warning)]')} data-avatar-interactive="true" data-space-action="true" disabled={isKnocking || isCooldown} aria-disabled={isKnocking || isCooldown} aria-label={inlineLabel}>
          {inlineIcon}
          {inlineLabel}
        </button>
      </div>;
  }
  return <div className={cn('flex gap-2 pt-2 border-t border-[var(--vo-border-subtle)]', className)}
  // AC7: exempt buttons from click-stop (they ARE the action)
  data-space-action="true">
      {userInSpace ?
    // User is in space - show Leave button
    <button type="button" onClick={e => {
      e.stopPropagation();
      onLeave();
    }} className={cn(secondaryButton, 'flex-1')} data-space-action="true" aria-label="Leave this space">
          <LogOut className="size-4" />
          Leave
        </button> : <>
          {shouldShowJoin && <button type="button" onClick={e => {
        e.stopPropagation();
        if (!full) {
          onJoin();
        }
      }} className={cn(primaryButton, 'flex-1', full && 'opacity-50 cursor-not-allowed')} data-space-action="true" disabled={full} aria-disabled={full} title={full ? 'Space is full - cannot join' : 'Join this space'} aria-label={full ? 'Space is full - cannot join' : 'Join this space'}>
              <LogIn className="size-4" />
              {full ? 'Full' : 'Join'}
            </button>}

          {shouldShowUnavailable && <button
            type="button"
            className={cn(secondaryButton, 'flex-1')}
            data-space-action="true"
            disabled
            aria-disabled="true"
            aria-label="Unavailable"
          >
            <ShieldX className="size-4" />
            Unavailable
          </button>}

          {shouldShowKnock && <button type="button" onClick={handleKnockClick} onPointerDown={handleKnockPointerDown} className={cn(knockButton, shouldShowJoin ? 'flex-1' : 'flex-1')} data-space-action="true" disabled={isKnocking || isCooldown} aria-disabled={isKnocking || isCooldown} title={isKnocking ? 'Waiting for response' : isCooldown ? `Try again in ${knockCooldownRemaining}s` : privateSpace ? 'Knock to request entry' : 'Knock first (optional)'} aria-label={isKnocking ? 'Knock pending' : isCooldown ? `Knock cooldown active, ${knockCooldownRemaining} seconds remaining` : 'Knock to request entry'}>
              <DoorOpen className="size-4" />
              {isKnocking ? 'Knocking...' : isCooldown ? `Wait ${knockCooldownRemaining}s` : 'Knock'}
            </button>}
        </>}
    </div>;
};
export default SpaceActionButtons;
