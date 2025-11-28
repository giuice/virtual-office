// src/components/floor-plan/modern/FullBadge.tsx
// Story 3.12 - AC2, AC7, AC8: Full status badge for space cards
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Story 3.12 - AC2: Full Spaces Have Visual Treatment
 * Displays a "Full" badge when space is at capacity.
 * Theme-aware styling with animated entry.
 */
export interface FullBadgeProps {
  className?: string;
}

export const FullBadge: React.FC<FullBadgeProps> = ({ className }) => {
  return (
    <span
      className={cn(
        // Base layout
        'inline-flex items-center px-2 py-0.5',
        'text-xs font-semibold rounded',
        // Theme tokens (defined in tokens.css)
        'bg-[var(--vo-full-badge-bg,#ef4444)]',
        'text-[var(--vo-full-badge-text,#ffffff)]',
        // Neon theme shadow support
        '[html[data-theme="neon"]_&]:shadow-[var(--vo-full-badge-shadow)]',
        // Animation
        'animate-in fade-in duration-200',
        className
      )}
      // AC8: Accessibility
      role="status"
      aria-label="Space is full"
    >
      Full
    </span>
  );
};

export default FullBadge;
