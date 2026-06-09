// src/components/floor-plan/modern/AttentionBeacon.tsx
// Story 3.4: Attention Beacon System - Visual indicator for spaces needing attention

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * AttentionBeacon severity levels
 * - normal: theme accent color with 2s pulse animation
 * - critical: red (#ff4d4d) with 1s fast pulse animation
 */
export type BeaconSeverity = 'normal' | 'critical';

export interface AttentionBeaconProps {
  /** Whether the beacon is active/visible */
  active: boolean;
  /** Severity level affecting color and animation speed */
  severity: BeaconSeverity;
  /** Reason for the beacon (used for accessibility) */
  reason?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * AttentionBeacon - Visual pulse indicator for spaces needing attention
 * 
 * Renders a 10px animated circle with glow effect.
 * Uses CSS tokens for theme-aware styling.
 * 
 * @example
 * <AttentionBeacon active={true} severity="normal" reason="High occupancy" />
 * <AttentionBeacon active={true} severity="critical" reason="Blocker logged" />
 */
const AttentionBeacon: React.FC<AttentionBeaconProps> = ({
  active,
  severity,
  reason = 'Attention needed',
  className,
}) => {
  // Return null when inactive (AC1: conditional rendering)
  if (!active) {
    return null;
  }

  const isCritical = severity === 'critical';

  return (
    <output
      className={cn(
        // Base beacon styles from CSS tokens
        'vo-beacon relative',
        // Critical severity uses different color and faster animation
        isCritical && 'vo-beacon-critical',
        className
      )}
      // Accessibility attributes (AC7)
      aria-live="polite"
      aria-label={`Attention needed: ${reason}`}
      data-testid="attention-beacon"
      data-severity={severity}
    >
      {/* Visually hidden screen reader text (AC7) */}
      <span className="sr-only">
        Attention needed: {reason}
      </span>
      
      {/* Organic Ripple Animation for Critical State */}
      {isCritical && (
        <>
          <div className="absolute -inset-1 rounded-full border-2 border-[var(--vo-beacon-critical)] animate-organic-ripple" />
          <div className="absolute -inset-1 rounded-full border-2 border-[var(--vo-beacon-critical)] animate-organic-ripple [animation-delay:1.25s]" />
        </>
      )}
    </output>
  );
};

export default AttentionBeacon;
