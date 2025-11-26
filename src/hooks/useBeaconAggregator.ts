// src/hooks/useBeaconAggregator.ts
// Story 3.10: Beacon Aggregation Hook - Collects beacon states across all spaces

import { useMemo } from 'react';
import { Space, UserPresenceData } from '@/types/database';
import { BeaconSeverity, SpaceBeaconData } from '@/hooks/useAttentionBeacon';

/**
 * Information about an active beacon
 */
export interface BeaconInfo {
  /** Space identifier */
  spaceId: string;
  /** Display name of the space */
  spaceName: string;
  /** Beacon severity level */
  severity: BeaconSeverity;
  /** Human-readable reason for the beacon */
  reason: string;
  /** Space type for additional context */
  spaceType: string;
  /** Number of users in the space */
  userCount: number;
  /** Space capacity */
  capacity: number;
}

/**
 * Result returned by useBeaconAggregator hook
 */
export interface UseBeaconAggregatorResult {
  /** All active beacons sorted by severity (critical first) */
  activeBeacons: BeaconInfo[];
  /** Count of normal severity beacons */
  normalCount: number;
  /** Count of critical severity beacons */
  criticalCount: number;
  /** Total active beacon count */
  totalCount: number;
}

/**
 * Configuration options for beacon aggregation
 */
export interface BeaconAggregatorOptions {
  /** Occupancy threshold to trigger beacon (0-1). Default: 0.8 (80%) */
  occupancyThreshold?: number;
}

const DEFAULT_OPTIONS: Required<BeaconAggregatorOptions> = {
  occupancyThreshold: 0.8,
};

/**
 * Evaluate beacon triggers for a single space
 * Reuses logic from useAttentionBeacon but without React state management
 */
function evaluateSpaceBeacon(
  space: Space,
  usersInSpace: UserPresenceData[],
  spaceBeaconData?: SpaceBeaconData,
  options: Required<BeaconAggregatorOptions> = DEFAULT_OPTIONS
): { active: boolean; severity: BeaconSeverity; reason: string } {
  // Default inactive state
  let active = false;
  let severity: BeaconSeverity = 'normal';
  let reason = '';

  // Check for blocker (critical severity)
  if (spaceBeaconData?.hasBlocker) {
    active = true;
    severity = 'critical';
    reason = 'Blocker logged';
    return { active, severity, reason };
  }

  // Check for help requested (critical severity)
  if (spaceBeaconData?.helpRequested) {
    active = true;
    severity = 'critical';
    reason = 'Help requested';
    return { active, severity, reason };
  }

  // Check occupancy threshold
  if (space.capacity > 0) {
    const occupancyRatio = usersInSpace.length / space.capacity;
    if (occupancyRatio > options.occupancyThreshold) {
      active = true;
      severity = 'normal';
      reason = 'High occupancy';
      return { active, severity, reason };
    }
  }

  return { active, severity, reason };
}

/**
 * useBeaconAggregator - Hook for aggregating beacon states across all spaces
 * 
 * Collects beacon states from all spaces and returns a sorted list
 * with critical beacons first. Uses the same trigger logic as useAttentionBeacon.
 * 
 * @param spaces - Array of all spaces
 * @param usersInSpaces - Map of space ID to users in that space
 * @param spaceBeaconDataMap - Optional map of space ID to beacon data (blockers, help)
 * @param options - Configuration options
 * @returns Aggregated beacon information
 * 
 * @example
 * const { activeBeacons, normalCount, criticalCount } = useBeaconAggregator(
 *   spaces,
 *   usersInSpaces
 * );
 */
export function useBeaconAggregator(
  spaces: Space[],
  usersInSpaces: Map<string | null, UserPresenceData[]>,
  spaceBeaconDataMap?: Map<string, SpaceBeaconData>,
  options?: BeaconAggregatorOptions
): UseBeaconAggregatorResult {
  const opts = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);

  const result = useMemo(() => {
    const activeBeacons: BeaconInfo[] = [];
    let normalCount = 0;
    let criticalCount = 0;

    for (const space of spaces) {
      const usersInSpace = usersInSpaces.get(space.id) || [];
      const spaceBeaconData = spaceBeaconDataMap?.get(space.id);
      
      const { active, severity, reason } = evaluateSpaceBeacon(
        space,
        usersInSpace,
        spaceBeaconData,
        opts
      );

      if (active) {
        activeBeacons.push({
          spaceId: space.id,
          spaceName: space.name,
          severity,
          reason,
          spaceType: space.type,
          userCount: usersInSpace.length,
          capacity: space.capacity,
        });

        if (severity === 'critical') {
          criticalCount++;
        } else {
          normalCount++;
        }
      }
    }

    // Sort by severity (critical first), then by user count (most occupied first)
    activeBeacons.sort((a, b) => {
      // Critical beacons first
      if (a.severity === 'critical' && b.severity !== 'critical') return -1;
      if (a.severity !== 'critical' && b.severity === 'critical') return 1;
      // Then by user count (descending)
      return b.userCount - a.userCount;
    });

    return {
      activeBeacons,
      normalCount,
      criticalCount,
      totalCount: activeBeacons.length,
    };
  }, [spaces, usersInSpaces, spaceBeaconDataMap, opts]);

  return result;
}

export default useBeaconAggregator;
