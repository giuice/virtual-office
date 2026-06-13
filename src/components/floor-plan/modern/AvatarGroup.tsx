// src/components/floor-plan/modern/AvatarGroup.tsx
// Story 3.3: Avatar Constellation V2 - Smart stacking with negative margin overlap
// Story 3.13: Real-time presence animations with enter/exit tracking
import { useReducerState } from '@/hooks/useReducerState';
import React, { useEffect, useRef, useCallback } from 'react';
import { UserPresenceData } from '@/types/database';
import ModernUserAvatar from './ModernUserAvatar';
import { cn } from '@/lib/utils';
import { AvatarOverflowBadge } from './AvatarOverflowBadge';

/**
 * Story 3.3: Avatar Constellation V2
 * Smart stacking with:
 * - Negative margin overlap (-10px) per UX spec
 * - Max 4 visible avatars (reduced from previous 8)
 * - Proper z-index layering (rightmost on top)
 * - Theme-aware overflow badge
 */
interface AvatarGroupProps {
  users: UserPresenceData[];
  /** Maximum visible avatars - defaults to 4 per Story 3.3 spec */
  max?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onUserClick?: (userId: string) => void;
  showEmpty?: boolean;
  emptyText?: string;
  /** Optional speaking user IDs for status ring display */
  speakingUserIds?: string[];
  /** Optional presenting user ID for status ring display */
  presentingUserId?: string;
  /** Optional muted user IDs for dimmed display */
  mutedUserIds?: string[];
}

const EMPTY_USER_IDS: string[] = [];

function useManagedTimeouts() {
  const timeoutIdsRef = useRef<Set<ReturnType<typeof setTimeout>> | null>(null);
  if (timeoutIdsRef.current === null) {
    timeoutIdsRef.current = new Set();
  }
  const timeoutIds = timeoutIdsRef.current;

  useEffect(() => {
    return () => {
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutIds.clear();
    };
  }, [timeoutIds]);

  return useCallback((callback: () => void, delay: number) => {
    const timeoutId = setTimeout(() => {
      timeoutIds.delete(timeoutId);
      callback();
    }, delay);
    timeoutIds.add(timeoutId);

    return {
      id: timeoutId,
      cancel: () => {
        clearTimeout(timeoutId);
        timeoutIds.delete(timeoutId);
      },
    };
  }, [timeoutIds]);
}

const AvatarGroup: React.FC<AvatarGroupProps> = ({
  users,
  max = 4, // Story 3.3: Reduced from 5 to 4 per spec
  size = 'sm',
  className = '',
  onUserClick,
  showEmpty = true,
  emptyText = 'No users',
  speakingUserIds = EMPTY_USER_IDS,
  presentingUserId,
  mutedUserIds = EMPTY_USER_IDS,
}) => {
  // Story 3.13 AC1: Track entering users for enter animation (only truly new users)
  const [enteringUserIds, updateEnteringUserIds] = useReducerState<Set<string>>(new Set());
  // Story 3.13 AC2: Track exiting users for leave animation
  const [exitingUsers, updateExitingUsers] = useReducerState<UserPresenceData[]>([]);
  // Phase 2 (FLOR-02): Track offline users that should fade before leaving the DOM
  const exitingUsersRef = useRef<Map<string, UserPresenceData> | null>(null);
  if (exitingUsersRef.current === null) {
    exitingUsersRef.current = new Map();
  }
  const exitingUsersMap = exitingUsersRef.current;
  const offlineExitTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>> | null>(null);
  if (offlineExitTimeoutsRef.current === null) {
    offlineExitTimeoutsRef.current = new Map();
  }
  const offlineExitTimeouts = offlineExitTimeoutsRef.current;
  const [exitingUserIds, updateExitingUserIds] = useReducerState<Set<string>>(new Set());

  const prevUsersRef = useRef<UserPresenceData[]>(users);
  const isInitialRender = useRef(true);
  // Settling period: don't trigger offline fade for the first few seconds after mount.
  // This prevents mass-fade when presence system initializes and derives stale DB 'online' → 'offline'.
  const isSettledRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleTimeout = useManagedTimeouts();

  useEffect(() => {
    settleTimerRef.current = setTimeout(() => {
      isSettledRef.current = true;
    }, 5000);

    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [exitingUsersMap, offlineExitTimeouts]);

  // Story 3.13: Detect user additions/removals and trigger animations
  useEffect(() => {
    const cleanupTimers: Array<() => void> = [];
    const currentUsers = users;
    const prevUsers = prevUsersRef.current;
    const currentIds = new Set(currentUsers.map(u => u.id));
    const prevIds = new Set(prevUsers.map(u => u.id));
    const shouldSkipAnimation = isInitialRender.current;

    // Skip animation on initial render and during settling period
    if (shouldSkipAnimation) {
      isInitialRender.current = false;
      prevUsersRef.current = currentUsers;
    }

    // Find users that were added
    const addedIds = Array.from(currentIds).filter(id => !prevIds.has(id));

    // Handle entering users (animate in)
    if (!shouldSkipAnimation && addedIds.length > 0) {
      updateEnteringUserIds(prev => {
        const next = new Set(prev);
        addedIds.forEach(id => next.add(id));
        return next;
      });
      // Clear entering state after animation completes (300ms per AC1)
      const cancelEnteringTimer = scheduleTimeout(() => {
        updateEnteringUserIds(prev => {
          const next = new Set(prev);
          addedIds.forEach(id => next.delete(id));
          return next;
        });
      }, 300);
      cleanupTimers.push(() => {
        cancelEnteringTimer.cancel();
        updateEnteringUserIds(prev => {
          const next = new Set(prev);
          addedIds.forEach(id => next.delete(id));
          return next;
        });
      });
    }

    // Cancel fade for users that came back online
    if (!shouldSkipAnimation) {
    users.forEach((user) => {
      if (exitingUserIds.has(user.id) && user.status !== 'offline') {
        const existingTimeout = offlineExitTimeouts.get(user.id);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          offlineExitTimeouts.delete(user.id);
        }
        exitingUsersMap.delete(user.id);
        updateExitingUserIds((prev) => {
          const next = new Set(prev);
          next.delete(user.id);
          return next;
        });
      }
    });
    }

    // Only trigger offline fade after settling period to prevent mass-fade on presence init
    if (!shouldSkipAnimation && isSettledRef.current) {
    users.forEach((user) => {
      const prevUser = prevUsers.find((prev) => prev.id === user.id);
      if (!prevUser || prevUser.status === 'offline' || user.status !== 'offline') {
        return;
      }
      // Skip if already fading -- do not reset the timer
      if (exitingUserIds.has(user.id)) {
        return;
      }

      exitingUsersMap.set(user.id, { ...user });
      updateExitingUserIds((prev) => new Set(prev).add(user.id));

      const existingTimeout = offlineExitTimeouts.get(user.id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeoutId = scheduleTimeout(() => {
        offlineExitTimeouts.delete(user.id);
        exitingUsersMap.delete(user.id);
        updateExitingUserIds((prev) => {
          const next = new Set(prev);
          next.delete(user.id);
          return next;
        });
      }, 3000);

      offlineExitTimeouts.set(user.id, timeoutId.id);
      cleanupTimers.push(() => {
        timeoutId.cancel();
        offlineExitTimeouts.delete(user.id);
        exitingUsersMap.delete(user.id);
        updateExitingUserIds((prev) => {
          const next = new Set(prev);
          next.delete(user.id);
          return next;
        });
      });
    });
    } // end isSettledRef guard

    // Find users that were removed
    const removedUsers = shouldSkipAnimation
      ? []
      : prevUsers.filter(
        (user) => !currentIds.has(user.id) && !exitingUsersMap.has(user.id)
      );

    // Handle exiting users (animate out)
    if (removedUsers.length > 0) {
      updateExitingUsers(prev => [...prev, ...removedUsers]);
      // Remove from exiting state after animation completes (200ms per AC2)
      const cancelExitingTimer = scheduleTimeout(() => {
        updateExitingUsers(prev => prev.filter(u => !removedUsers.find(r => r.id === u.id)));
      }, 200);
      cleanupTimers.push(() => {
        cancelExitingTimer.cancel();
        updateExitingUsers(prev => prev.filter(u => !removedUsers.find(r => r.id === u.id)));
      });
    }

    // Always update ref for next comparison
    prevUsersRef.current = currentUsers;
    return () => {
      cleanupTimers.forEach((cleanupTimer) => cleanupTimer());
    };
  }, [exitingUserIds, exitingUsersMap, offlineExitTimeouts, scheduleTimeout, users, updateEnteringUserIds, updateExitingUserIds, updateExitingUsers]);

  useEffect(() => {
    const settleTimer = settleTimerRef.current;
    return () => {
      offlineExitTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      offlineExitTimeouts.clear();
      exitingUsersMap.clear();
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
    };
  }, [exitingUsersMap, offlineExitTimeouts]);

  // If no users are present (and no exiting users)
  if (users.length === 0 && exitingUsers.length === 0 && showEmpty) {
    return (
      <div className={cn("flex items-center", className)}>
        <span className="text-xs text-muted-foreground">{emptyText}</span>
      </div>
    );
  }

  // Display empty div if no users and showEmpty is false
  if (users.length === 0 && exitingUsers.length === 0 && !showEmpty) {
    return <div className={className} />;
  }

  const offlineUsers = Array.from(exitingUsersMap.values()).filter((user) =>
    exitingUserIds.has(user.id)
  );

  // Show all users passed to this component. Users are pre-filtered by space via usersInSpaces.
  // If a user has currentSpaceId set (they're in this space), they should always be visible
  // regardless of derived status. The fade animation handles the offline transition visually.
  const currentDisplayUsers = users;

  // Combine current users, offline-fading snapshots, and legacy exit-animation users for rendering.
  const allUsers = [
    ...currentDisplayUsers,
    ...offlineUsers.filter((user) => !currentDisplayUsers.some((currentUser) => currentUser.id === user.id)),
    ...exitingUsers.filter(
      (user) =>
        !currentDisplayUsers.some((currentUser) => currentUser.id === user.id) &&
        !offlineUsers.some((offlineUser) => offlineUser.id === user.id)
    ),
  ];

  // Calculate how many users to show and how many are remaining
  const visibleUsers = allUsers.slice(0, max);
  const remainingCount = Math.max(0, allUsers.length - max);

  // Story 3.3: Check status for each user
  const isSpeaking = (userId: string) => speakingUserIds.includes(userId);
  const isPresenting = (userId: string) => presentingUserId === userId;
  const isMuted = (userId: string) => mutedUserIds.includes(userId);
  // Story 3.13 AC1: Check if user is entering
  const isEntering = (userId: string) => enteringUserIds.has(userId);
  // Story 3.13 AC2: Check if user is exiting
  const isExiting = (userId: string) => exitingUsers.some(u => u.id === userId);
  const isOfflineExiting = (userId: string) => exitingUserIds.has(userId);

  return (
    <div className={cn("flex items-center", className)}>
      {/* Story 3.3: Avatar constellation with smart stacking */}
      <div className="vo-avatar-constellation flex items-center pl-[10px]">
        {visibleUsers.map((user, index) => (
          <div
            key={user.id}
            className={cn(
              'vo-avatar-item relative',
              // Story 3.13 AC1: Enter animation
              isEntering(user.id) && 'vo-avatar-enter',
              // Story 3.13 AC2: Leave animation
              isExiting(user.id) && 'vo-avatar-leave',
              // Phase 2 (FLOR-02): Offline-only fade-out
              isOfflineExiting(user.id) && 'vo-avatar-offline-fade',
              // Story 3.3: Status state classes
              isSpeaking(user.id) && 'vo-avatar-speaking',
              isPresenting(user.id) && 'vo-avatar-presenting',
              isMuted(user.id) && 'vo-avatar-muted'
            )}
            style={{
              // Story 3.3: Negative margin overlap (-10px) per UX spec (AC4)
              marginLeft: index > 0 ? '-10px' : '0',
              // Story 3.3: Z-index layering - rightmost avatar on top
              zIndex: index + 1,
              pointerEvents: isOfflineExiting(user.id) ? 'none' : undefined,
            }}
            aria-hidden={isOfflineExiting(user.id) ? 'true' : undefined}
          >
            <ModernUserAvatar
              user={user}
              size={size}
              onClick={onUserClick}
              isOverlapping={index > 0}
              tooltipPlacement="top"
            />
          </div>
        ))}

        <AvatarOverflowBadge
          remainingCount={remainingCount}
          visibleCount={visibleUsers.length}
          users={users}
          max={max}
        />
      </div>
    </div>
  );
};

export default AvatarGroup;
