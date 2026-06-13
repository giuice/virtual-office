// src/components/floor-plan/modern/BeaconQueue.tsx
// Story 3.10: Beacon Queue Component - Displays aggregated beacon list
'use client';

import { useReducerState } from '@/hooks/useReducerState';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BeaconInfo } from '@/hooks/useBeaconAggregator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BeaconQueueProps {
  /** Array of active beacons sorted by severity */
  beacons: BeaconInfo[];
  /** Handler when a beacon is clicked */
  onBeaconClick: (spaceId: string) => void;
  /** Maximum visible beacons before showing expand */
  maxVisible?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * BeaconQueue - Aggregated beacon alerts list
 * 
 * Story 3.10 - AC3: Beacon Queue List
 * - Displays active beacons sorted by severity (critical first)
 * - Each beacon shows: space name, severity icon, reason
 * - Click handler focuses corresponding SpaceCard
 * - Scrollable if more than maxVisible beacons
 * - Includes aria-live region for announcements
 */
export const BeaconQueue: React.FC<BeaconQueueProps> = ({
  beacons,
  onBeaconClick,
  maxVisible = 4,
  className,
}) => {
  const [isExpanded, updateIsExpanded] = useReducerState(false);
  const previousCountRef = useRef(beacons.length);
  const [announcement, updateAnnouncement] = useReducerState('');
  const announcementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track new beacons for announcements (AC6)
  useEffect(() => {
    const previousCount = previousCountRef.current;
    if (beacons.length > previousCount) {
      // Find the newest beacon (likely the first one that wasn't there before)
      const newBeacon = beacons.find(b => 
        !beacons.slice(0, previousCount).some(prev => prev.spaceId === b.spaceId)
      ) || beacons[0];
      
      if (newBeacon) {
        const severityText = newBeacon.severity === 'critical' ? 'Critical' : 'Normal';
        updateAnnouncement(`New beacon on ${newBeacon.spaceName}, ${severityText} severity. ${newBeacon.reason}`);
        
        // Clear announcement after 5 seconds
        if (announcementTimeoutRef.current) {
          clearTimeout(announcementTimeoutRef.current);
        }
        announcementTimeoutRef.current = setTimeout(() => {
          updateAnnouncement('');
        }, 5000);
      }
    }
    previousCountRef.current = beacons.length;

    return () => {
      if (announcementTimeoutRef.current) {
        clearTimeout(announcementTimeoutRef.current);
      }
    };
  }, [beacons, updateAnnouncement]);

  const handleBeaconClick = useCallback((e: React.MouseEvent | React.KeyboardEvent, spaceId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onBeaconClick(spaceId);
  }, [onBeaconClick]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, spaceId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleBeaconClick(e, spaceId);
    }
  }, [handleBeaconClick]);

  const toggleExpand = useCallback(() => {
    updateIsExpanded(prev => !prev);
  }, [updateIsExpanded]);

  // Don't render if no beacons
  if (beacons.length === 0) {
    return null;
  }

  const visibleBeacons = isExpanded ? beacons : beacons.slice(0, maxVisible);
  const hasMore = beacons.length > maxVisible;

  return (
    <section
      className={cn(
        'flex flex-col gap-1',
        className
      )}
      aria-label="Active beacons"
    >
      {/* Aria-live region for beacon announcements (AC6) */}
      <output
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </output>

      {/* Beacon header with count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span className="font-medium flex items-center gap-1.5">
          <AlertCircle className="size-3.5" aria-hidden="true" />
          Beacons ({beacons.length})
        </span>
        {hasMore && (
          <button
            type="button"
            onClick={toggleExpand}
            className={cn(
              'flex items-center gap-0.5 text-xs',
              'hover:text-foreground transition-colors',
              'focus:outline-none focus:underline',
            )}
            aria-expanded={isExpanded}
            aria-controls="beacon-queue-list"
          >
            {isExpanded ? (
              <>
                Show less <ChevronUp className="size-3" />
              </>
            ) : (
              <>
                +{beacons.length - maxVisible} more <ChevronDown className="size-3" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Beacon list */}
      <div
        id="beacon-queue-list"
        className={cn(
          'flex flex-col gap-1',
          isExpanded && 'max-h-[200px] overflow-y-auto',
        )}
      >
        {visibleBeacons.map((beacon) => (
          <button
            key={beacon.spaceId}
            type="button"
            onClick={(e) => handleBeaconClick(e, beacon.spaceId)}
            onKeyDown={(e) => handleKeyDown(e, beacon.spaceId)}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5',
              'rounded-md text-xs text-left',
              'transition-all duration-150',
              'hover:scale-[1.01]',
              'focus:outline-none focus:ring-2 focus:ring-offset-1',
              // Severity-based styling
              beacon.severity === 'critical' 
                ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 focus:ring-red-500/50'
                : 'bg-[var(--vo-pill-bg)] hover:bg-[var(--vo-hover-bg)] border border-[var(--vo-pill-border)] focus:ring-[var(--vo-accent)]',
            )}
            aria-label={`${beacon.spaceName}: ${beacon.reason}, ${beacon.severity} severity. Click to focus.`}
          >
            {/* Severity icon */}
            {beacon.severity === 'critical' ? (
              <AlertTriangle 
                className="size-3.5 flex-shrink-0 text-red-500" 
                aria-hidden="true"
              />
            ) : (
              <div 
                className="size-2.5 rounded-full flex-shrink-0 animate-pulse"
                style={{ backgroundColor: 'var(--vo-beacon-color)' }}
                aria-hidden="true"
              />
            )}

            {/* Space name */}
            <span className={cn(
              'font-medium truncate flex-1',
              beacon.severity === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-foreground'
            )}>
              {beacon.spaceName}
            </span>

            {/* Reason badge */}
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0',
              beacon.severity === 'critical'
                ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                : 'bg-[var(--vo-pill-bg)] text-[var(--vo-text-muted)]'
            )}>
              {beacon.reason}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default BeaconQueue;
