// src/components/floor-plan/modern/SpaceActionButtons.tsx
// Story 3.11 - AC6: Primary Action Button
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { LogIn, LogOut, DoorOpen } from 'lucide-react';

/**
 * Story 3.11 - AC6: Primary Action Button
 * - "Join" button prominent at bottom of hover panel
 * - "Leave" shown if user is already in the space
 * - "Knock" option if space is private/locked
 * - Button styled per theme with hover states
 */
export interface SpaceActionButtonsProps {
  isUserInSpace: boolean;
  isPrivate?: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onKnock?: () => void;
  className?: string;
}

export const SpaceActionButtons: React.FC<SpaceActionButtonsProps> = ({
  isUserInSpace,
  isPrivate = false,
  onJoin,
  onLeave,
  onKnock,
  className,
}) => {
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
      ) : isPrivate && onKnock ? (
        // Private space - show Knock button
        <button
          onClick={(e) => {
            e.stopPropagation();
            onKnock();
          }}
          className={cn(knockButton, 'flex-1')}
          data-space-action="true"
          aria-label="Knock to request entry"
        >
          <DoorOpen className="w-4 h-4" />
          Knock
        </button>
      ) : (
        // Public space - show Join button
        <button
          onClick={(e) => {
            e.stopPropagation();
            onJoin();
          }}
          className={cn(primaryButton, 'flex-1')}
          data-space-action="true"
          aria-label="Join this space"
        >
          <LogIn className="w-4 h-4" />
          Join
        </button>
      )}
    </div>
  );
};

export default SpaceActionButtons;
