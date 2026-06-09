// src/hooks/useAttentionBeacon.ts
// Story 3.4: Attention Beacon System - Hook for beacon trigger logic

import { useReducerState } from '@/hooks/useReducerState';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { UserPresenceData } from '@/types/database';

/**
 * Beacon severity levels
 */
export type BeaconSeverity = 'normal' | 'critical';

/**
 * Beacon state returned by the hook
 */
export interface BeaconState {
  /** Whether the beacon is active */
  active: boolean;
  /** Severity level: normal or critical */
  severity: BeaconSeverity;
  /** Human-readable reason for the beacon */
  reason: string;
  /** Timestamp of last state change */
  lastChange: Date | null;
}

/**
 * Configuration options for the beacon hook
 */
export interface BeaconOptions {
  /** Occupancy threshold to trigger beacon (0-1). Default: 0.8 (80%) */
  occupancyThreshold?: number;
  /** Time in ms before escalating to critical. Default: 300000 (5 minutes) */
  escalationTimeMs?: number;
  /** Debounce time in ms between state changes. Default: 300 */
  debounceMs?: number;
}

/**
 * Space state data for beacon evaluation
 * Can be extended for future trigger conditions
 */
export interface SpaceBeaconData {
  /** Whether a blocker is logged in the space */
  hasBlocker?: boolean;
  /** Whether help has been requested */
  helpRequested?: boolean;
  /** Additional trigger conditions can be added here */
}

const DEFAULT_OPTIONS: Required<BeaconOptions> = {
  occupancyThreshold: 0.8,
  escalationTimeMs: 300000, // 5 minutes
  debounceMs: 300,
};

/**
 * useAttentionBeacon - Hook for evaluating and managing beacon state
 * 
 * Evaluates trigger conditions and returns beacon state:
 * - High occupancy (>80% of capacity)
 * - Blocker logged in space
 * - Help requested signal
 * 
 * Features:
 * - Debounced state changes (300ms default)
 * - Auto-escalation from normal to critical after 5 minutes
 * - Extensible trigger logic
 * 
 * @param spaceId - Unique identifier for the space
 * @param usersInSpace - Array of users currently in the space
 * @param capacity - Maximum capacity of the space
 * @param spaceData - Optional additional space data for trigger evaluation
 * @param options - Configuration options
 * @returns BeaconState object
 * 
 * @example
 * const beaconState = useAttentionBeacon('space-1', users, 10);
 * <AttentionBeacon {...beaconState} />
 */
export function useAttentionBeacon(
  spaceId: string,
  usersInSpace: UserPresenceData[],
  capacity: number,
  spaceData?: SpaceBeaconData,
  options?: BeaconOptions
): BeaconState {
  const opts = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);
  
  // Track when beacon first became active for escalation
  const activationTimeRef = useRef<Date | null>(null);
  
  // Debounce timer ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Previous state for debouncing
  const prevStateRef = useRef<BeaconState>({
    active: false,
    severity: 'normal',
    reason: '',
    lastChange: null,
  });

  const [beaconState, updateBeaconState] = useReducerState<BeaconState>({
    active: false,
    severity: 'normal',
    reason: '',
    lastChange: null,
  });

  /**
   * Evaluate trigger conditions and compute beacon state
   * Returns raw state before debouncing/escalation
   */
  const evaluateTriggers = useCallback((): { active: boolean; severity: BeaconSeverity; reason: string } => {
    // Default inactive state
    let active = false;
    let severity: BeaconSeverity = 'normal';
    let reason = '';

    // AC3: Check for blocker (critical severity)
    if (spaceData?.hasBlocker) {
      active = true;
      severity = 'critical';
      reason = 'Blocker logged';
      return { active, severity, reason };
    }

    // AC3: Check for help requested (critical severity)
    if (spaceData?.helpRequested) {
      active = true;
      severity = 'critical';
      reason = 'Help requested';
      return { active, severity, reason };
    }

    // AC3: Check occupancy threshold
    if (capacity > 0) {
      const occupancyRatio = usersInSpace.length / capacity;
      if (occupancyRatio > opts.occupancyThreshold) {
        active = true;
        severity = 'normal';
        reason = 'High occupancy';
        return { active, severity, reason };
      }
    }

    return { active, severity, reason };
  }, [usersInSpace.length, capacity, spaceData?.hasBlocker, spaceData?.helpRequested, opts.occupancyThreshold]);

  /**
   * Check if escalation to critical is needed
   * Escalates after escalationTimeMs (default 5 minutes)
   */
  const checkEscalation = useCallback((currentState: BeaconState): BeaconSeverity => {
    if (!currentState.active || currentState.severity === 'critical') {
      return currentState.severity;
    }

    if (activationTimeRef.current) {
      const elapsed = Date.now() - activationTimeRef.current.getTime();
      if (elapsed >= opts.escalationTimeMs) {
        return 'critical';
      }
    }

    return currentState.severity;
  }, [opts.escalationTimeMs]);

  // Effect to update beacon state with debouncing
  useEffect(() => {
    const { active, severity, reason } = evaluateTriggers();
    
    // Check if state has actually changed
    const prevState = prevStateRef.current;
    const hasChanged = 
      active !== prevState.active ||
      severity !== prevState.severity ||
      reason !== prevState.reason;

    if (!hasChanged) {
      // Still check for escalation even if triggers haven't changed
      const escalatedSeverity = checkEscalation(prevState);
      if (escalatedSeverity !== prevState.severity) {
        const newState: BeaconState = {
          ...prevState,
          severity: escalatedSeverity,
          lastChange: new Date(),
        };
        updateBeaconState(newState);
        prevStateRef.current = newState;
      }
      return;
    }

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce state changes (AC2: 300ms minimum)
    debounceTimerRef.current = setTimeout(() => {
      const now = new Date();
      
      // Track activation time for escalation
      if (active && !prevState.active) {
        activationTimeRef.current = now;
      } else if (!active) {
        activationTimeRef.current = null;
      }

      const newState: BeaconState = {
        active,
        severity,
        reason,
        lastChange: now,
      };

      updateBeaconState(newState);
      prevStateRef.current = newState;
    }, opts.debounceMs);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [evaluateTriggers, checkEscalation, opts.debounceMs, updateBeaconState]);

  // Escalation timer - check periodically if we need to escalate
  useEffect(() => {
    if (!beaconState.active || beaconState.severity === 'critical') {
      return;
    }

    const checkInterval = setInterval(() => {
      const escalatedSeverity = checkEscalation(beaconState);
      if (escalatedSeverity !== beaconState.severity) {
        const newState: BeaconState = {
          ...beaconState,
          severity: escalatedSeverity,
          reason: `${beaconState.reason} (escalated)`,
          lastChange: new Date(),
        };
        updateBeaconState(newState);
        prevStateRef.current = newState;
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(checkInterval);
  }, [beaconState, checkEscalation, updateBeaconState]);

  return beaconState;
}

export default useAttentionBeacon;
