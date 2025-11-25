/**
 * Story 3.4: Attention Beacon System - Hook Unit Tests
 * Tests for useAttentionBeacon hook
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAttentionBeacon, BeaconState, BeaconOptions, SpaceBeaconData } from '../src/hooks/useAttentionBeacon';
import { UserPresenceData } from '@/types/database';

// Mock user data factory
const createMockUsers = (count: number): UserPresenceData[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `user-${i}`,
    displayName: `User ${i}`,
    avatarUrl: `https://example.com/avatar-${i}.jpg`,
    status: 'online' as const,
    currentSpaceId: 'space-1',
  }));
};

describe('useAttentionBeacon - Story 3.4 Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('AC2 - useAttentionBeacon Hook', () => {
    it('returns inactive state by default (empty space)', () => {
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', [], 10)
      );

      expect(result.current.active).toBe(false);
      expect(result.current.severity).toBe('normal');
      expect(result.current.reason).toBe('');
    });

    it('returns structured data with all required fields', () => {
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', [], 10)
      );

      expect(result.current).toHaveProperty('active');
      expect(result.current).toHaveProperty('severity');
      expect(result.current).toHaveProperty('reason');
      expect(result.current).toHaveProperty('lastChange');
    });

    it('debounces state changes (300ms minimum)', async () => {
      const users = createMockUsers(9); // 90% occupancy
      
      const { result, rerender } = renderHook(
        ({ users }) => useAttentionBeacon('space-1', users, 10),
        { initialProps: { users: [] as UserPresenceData[] } }
      );

      expect(result.current.active).toBe(false);

      // Update to high occupancy
      rerender({ users });

      // Should still be inactive due to debounce
      expect(result.current.active).toBe(false);

      // Advance past debounce time
      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.active).toBe(true);
    });
  });

  describe('AC3 - Beacon Trigger Logic', () => {
    it('triggers beacon when occupancy > 80% of capacity', async () => {
      const users = createMockUsers(9); // 90% of 10 capacity
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', users, 10)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.active).toBe(true);
      expect(result.current.reason).toBe('High occupancy');
    });

    it('does not trigger beacon when occupancy <= 80%', async () => {
      const users = createMockUsers(8); // Exactly 80%
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', users, 10)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.active).toBe(false);
    });

    it('triggers critical beacon when blocker is logged', async () => {
      const spaceData: SpaceBeaconData = { hasBlocker: true };
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', [], 10, spaceData)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.active).toBe(true);
      expect(result.current.severity).toBe('critical');
      expect(result.current.reason).toBe('Blocker logged');
    });

    it('triggers critical beacon when help is requested', async () => {
      const spaceData: SpaceBeaconData = { helpRequested: true };
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', [], 10, spaceData)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.active).toBe(true);
      expect(result.current.severity).toBe('critical');
      expect(result.current.reason).toBe('Help requested');
    });

    it('blocker takes priority over help requested', async () => {
      const spaceData: SpaceBeaconData = { hasBlocker: true, helpRequested: true };
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', [], 10, spaceData)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.reason).toBe('Blocker logged');
    });

    it('blocker takes priority over high occupancy', async () => {
      const users = createMockUsers(9);
      const spaceData: SpaceBeaconData = { hasBlocker: true };
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', users, 10, spaceData)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.reason).toBe('Blocker logged');
      expect(result.current.severity).toBe('critical');
    });
  });

  describe('AC4 - Visual Severity Levels & Auto-Escalation', () => {
    it('high occupancy starts with normal severity', async () => {
      const users = createMockUsers(9);
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', users, 10)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.severity).toBe('normal');
    });

    it('auto-escalates from normal to critical after 5 minutes', async () => {
      const users = createMockUsers(9);
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', users, 10)
      );

      // Initial state after debounce
      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.severity).toBe('normal');

      // Advance 5 minutes + escalation check interval
      await act(async () => {
        vi.advanceTimersByTime(300000 + 10000);
      });

      expect(result.current.severity).toBe('critical');
    });

    it('critical conditions start at critical severity (no escalation needed)', async () => {
      const spaceData: SpaceBeaconData = { hasBlocker: true };
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', [], 10, spaceData)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.severity).toBe('critical');
    });

    it('respects custom escalation time option', async () => {
      const users = createMockUsers(9);
      const options: BeaconOptions = { escalationTimeMs: 60000 }; // 1 minute
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', users, 10, undefined, options)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.severity).toBe('normal');

      // Advance 1 minute + check interval
      await act(async () => {
        vi.advanceTimersByTime(60000 + 10000);
      });

      expect(result.current.severity).toBe('critical');
    });
  });

  describe('Custom Options', () => {
    it('respects custom occupancy threshold', async () => {
      const users = createMockUsers(6); // 60% occupancy
      const options: BeaconOptions = { occupancyThreshold: 0.5 }; // 50% threshold
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', users, 10, undefined, options)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.active).toBe(true);
    });

    it('respects custom debounce time', async () => {
      const users = createMockUsers(9);
      const options: BeaconOptions = { debounceMs: 500 };
      
      const { result, rerender } = renderHook(
        ({ users }) => useAttentionBeacon('space-1', users, 10, undefined, options),
        { initialProps: { users: [] as UserPresenceData[] } }
      );

      rerender({ users });

      // Should still be inactive at 350ms (default would have triggered)
      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.active).toBe(false);

      // Should be active after custom debounce time
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.active).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('handles zero capacity gracefully', async () => {
      const users = createMockUsers(5);
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', users, 0)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      // Should not trigger on occupancy when capacity is 0
      expect(result.current.active).toBe(false);
    });

    it('handles undefined spaceData', async () => {
      const users = createMockUsers(9);
      
      const { result } = renderHook(() =>
        useAttentionBeacon('space-1', users, 10, undefined)
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.active).toBe(true);
      expect(result.current.reason).toBe('High occupancy');
    });

    it('updates lastChange timestamp on state change', async () => {
      const { result, rerender } = renderHook(
        ({ users }) => useAttentionBeacon('space-1', users, 10),
        { initialProps: { users: [] as UserPresenceData[] } }
      );

      expect(result.current.lastChange).toBeNull();

      const users = createMockUsers(9);
      rerender({ users });

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.lastChange).not.toBeNull();
      expect(result.current.lastChange).toBeInstanceOf(Date);
    });

    it('resets escalation timer when beacon becomes inactive', async () => {
      const users = createMockUsers(9);
      
      const { result, rerender } = renderHook(
        ({ users }) => useAttentionBeacon('space-1', users, 10),
        { initialProps: { users } }
      );

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.active).toBe(true);

      // Remove users to deactivate
      rerender({ users: [] });

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.active).toBe(false);

      // Re-add users
      rerender({ users });

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      // Should start fresh at normal severity, not carry over escalation
      expect(result.current.severity).toBe('normal');
    });
  });
});
