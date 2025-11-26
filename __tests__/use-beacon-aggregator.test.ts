// __tests__/use-beacon-aggregator.test.ts
// Story 3.10: Tests for useBeaconAggregator hook

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBeaconAggregator } from '@/hooks/useBeaconAggregator';
import { Space, UserPresenceData } from '@/types/database';

// Mock space factory
function createMockSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: `space-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Space',
    type: 'workspace',
    status: 'active',
    capacity: 10,
    companyId: 'company-1',
    features: [],
    accessControl: { isPublic: true },
    position: { x: 0, y: 0, width: 100, height: 100 },
    ...overrides,
  };
}

// Mock user factory
function createMockUser(spaceId: string): UserPresenceData {
  return {
    id: `user-${Math.random().toString(36).substr(2, 9)}`,
    displayName: 'Test User',
    currentSpaceId: spaceId,
    status: 'online',
  };
}

describe('useBeaconAggregator', () => {
  // T11: Returns empty when no spaces have active beacons
  it('returns empty when no spaces have active beacons', () => {
    const spaces = [
      createMockSpace({ id: 'space-1', name: 'Space 1', capacity: 10 }),
      createMockSpace({ id: 'space-2', name: 'Space 2', capacity: 10 }),
    ];
    
    // Only 1 user per space (10% occupancy, below 80% threshold)
    const usersInSpaces = new Map<string | null, UserPresenceData[]>([
      ['space-1', [createMockUser('space-1')]],
      ['space-2', [createMockUser('space-2')]],
    ]);

    const { result } = renderHook(() => useBeaconAggregator(spaces, usersInSpaces));

    expect(result.current.activeBeacons).toHaveLength(0);
    expect(result.current.normalCount).toBe(0);
    expect(result.current.criticalCount).toBe(0);
    expect(result.current.totalCount).toBe(0);
  });

  // T12: Aggregates beacons from multiple spaces
  it('aggregates beacons from multiple spaces', () => {
    const spaces = [
      createMockSpace({ id: 'space-1', name: 'High Occupancy 1', capacity: 5 }),
      createMockSpace({ id: 'space-2', name: 'High Occupancy 2', capacity: 5 }),
      createMockSpace({ id: 'space-3', name: 'Low Occupancy', capacity: 10 }),
    ];
    
    // 5 users in space-1 (100% occupancy), 5 users in space-2 (100% occupancy)
    // 1 user in space-3 (10% occupancy)
    const usersInSpaces = new Map<string | null, UserPresenceData[]>([
      ['space-1', Array(5).fill(null).map(() => createMockUser('space-1'))],
      ['space-2', Array(5).fill(null).map(() => createMockUser('space-2'))],
      ['space-3', [createMockUser('space-3')]],
    ]);

    const { result } = renderHook(() => useBeaconAggregator(spaces, usersInSpaces));

    expect(result.current.activeBeacons).toHaveLength(2);
    expect(result.current.normalCount).toBe(2);
    expect(result.current.totalCount).toBe(2);
  });

  // T13: Sorts critical beacons before normal
  it('sorts critical beacons before normal', () => {
    const spaces = [
      createMockSpace({ id: 'space-1', name: 'High Occupancy', capacity: 5 }),
      createMockSpace({ id: 'space-2', name: 'Blocker Space', capacity: 10 }),
    ];
    
    const usersInSpaces = new Map<string | null, UserPresenceData[]>([
      ['space-1', Array(5).fill(null).map(() => createMockUser('space-1'))],
      ['space-2', [createMockUser('space-2')]],
    ]);

    // Space-2 has a blocker (critical), Space-1 has high occupancy (normal)
    const spaceBeaconDataMap = new Map([
      ['space-2', { hasBlocker: true }],
    ]);

    const { result } = renderHook(() => 
      useBeaconAggregator(spaces, usersInSpaces, spaceBeaconDataMap)
    );

    expect(result.current.activeBeacons).toHaveLength(2);
    // Critical beacon should be first
    expect(result.current.activeBeacons[0].severity).toBe('critical');
    expect(result.current.activeBeacons[0].spaceName).toBe('Blocker Space');
    // Normal beacon should be second
    expect(result.current.activeBeacons[1].severity).toBe('normal');
    expect(result.current.activeBeacons[1].spaceName).toBe('High Occupancy');
  });

  // T14: Returns correct counts (normalCount, criticalCount)
  it('returns correct counts for normal and critical beacons', () => {
    const spaces = [
      createMockSpace({ id: 'space-1', name: 'Space 1', capacity: 5 }),
      createMockSpace({ id: 'space-2', name: 'Space 2', capacity: 5 }),
      createMockSpace({ id: 'space-3', name: 'Space 3', capacity: 10 }),
    ];
    
    const usersInSpaces = new Map<string | null, UserPresenceData[]>([
      ['space-1', Array(5).fill(null).map(() => createMockUser('space-1'))], // High occupancy
      ['space-2', [createMockUser('space-2')]], // Has blocker
      ['space-3', [createMockUser('space-3')]], // Help requested
    ]);

    const spaceBeaconDataMap = new Map([
      ['space-2', { hasBlocker: true }],
      ['space-3', { helpRequested: true }],
    ]);

    const { result } = renderHook(() => 
      useBeaconAggregator(spaces, usersInSpaces, spaceBeaconDataMap)
    );

    expect(result.current.normalCount).toBe(1); // High occupancy only
    expect(result.current.criticalCount).toBe(2); // Blocker + Help requested
    expect(result.current.totalCount).toBe(3);
  });

  // T15: Updates when space beacon state changes
  it('updates when space data changes', () => {
    const spaces = [
      createMockSpace({ id: 'space-1', name: 'Space 1', capacity: 10 }),
    ];
    
    // Start with low occupancy
    const usersInSpaces = new Map<string | null, UserPresenceData[]>([
      ['space-1', [createMockUser('space-1')]],
    ]);

    const { result, rerender } = renderHook(
      ({ usersMap }) => useBeaconAggregator(spaces, usersMap),
      { initialProps: { usersMap: usersInSpaces } }
    );

    expect(result.current.activeBeacons).toHaveLength(0);

    // Update to high occupancy (9 users = 90% > 80% threshold)
    const highOccupancyMap = new Map<string | null, UserPresenceData[]>([
      ['space-1', Array(9).fill(null).map(() => createMockUser('space-1'))],
    ]);

    rerender({ usersMap: highOccupancyMap });

    expect(result.current.activeBeacons).toHaveLength(1);
    expect(result.current.activeBeacons[0].reason).toBe('High occupancy');
  });

  it('handles empty spaces array', () => {
    const spaces: Space[] = [];
    const usersInSpaces = new Map<string | null, UserPresenceData[]>();

    const { result } = renderHook(() => useBeaconAggregator(spaces, usersInSpaces));

    expect(result.current.activeBeacons).toHaveLength(0);
    expect(result.current.totalCount).toBe(0);
  });

  it('handles spaces with no users', () => {
    const spaces = [
      createMockSpace({ id: 'space-1', name: 'Empty Space', capacity: 10 }),
    ];
    
    const usersInSpaces = new Map<string | null, UserPresenceData[]>([
      ['space-1', []],
    ]);

    const { result } = renderHook(() => useBeaconAggregator(spaces, usersInSpaces));

    expect(result.current.activeBeacons).toHaveLength(0);
  });

  it('respects custom occupancy threshold', () => {
    const spaces = [
      createMockSpace({ id: 'space-1', name: 'Space 1', capacity: 10 }),
    ];
    
    // 5 users = 50% occupancy
    const usersInSpaces = new Map<string | null, UserPresenceData[]>([
      ['space-1', Array(5).fill(null).map(() => createMockUser('space-1'))],
    ]);

    // Default 80% threshold - should NOT trigger
    const { result: result1 } = renderHook(() => 
      useBeaconAggregator(spaces, usersInSpaces)
    );
    expect(result1.current.activeBeacons).toHaveLength(0);

    // Custom 40% threshold - SHOULD trigger
    const { result: result2 } = renderHook(() => 
      useBeaconAggregator(spaces, usersInSpaces, undefined, { occupancyThreshold: 0.4 })
    );
    expect(result2.current.activeBeacons).toHaveLength(1);
  });
});
