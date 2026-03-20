// src/components/floor-plan/modern/AvatarGroup.tsx
// Story 3.3: Avatar Constellation V2 - Smart stacking with negative margin overlap
// Story 3.13: Real-time presence animations with enter/exit tracking
import React, { useState, useEffect, useRef } from 'react';
import { UserPresenceData } from '@/types/database';
import ModernUserAvatar from './ModernUserAvatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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

const AvatarGroup: React.FC<AvatarGroupProps> = ({
  users,
  max = 4, // Story 3.3: Reduced from 5 to 4 per spec
  size = 'sm',
  className = '',
  onUserClick,
  showEmpty = true,
  emptyText = 'No users',
  speakingUserIds = [],
  presentingUserId,
  mutedUserIds = [],
}) => {
  // Story 3.13 AC1: Track entering users for enter animation (only truly new users)
  const [enteringUserIds, setEnteringUserIds] = useState<Set<string>>(new Set());
  // Story 3.13 AC2: Track exiting users for leave animation
  const [exitingUsers, setExitingUsers] = useState<UserPresenceData[]>([]);
  // Phase 2 (FLOR-02): Track offline users that should fade before leaving the DOM
  const exitingUsersRef = useRef<Map<string, UserPresenceData>>(new Map());
  const offlineExitTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [exitingUserIds, setExitingUserIds] = useState<Set<string>>(new Set());

  const prevUsersRef = useRef<UserPresenceData[]>(users);
  const isInitialRender = useRef(true);

  // Story 3.13: Detect user additions/removals and trigger animations
  useEffect(() => {
    const currentUsers = users;
    const prevUsers = prevUsersRef.current;
    const currentIds = new Set(currentUsers.map(u => u.id));
    const prevIds = new Set(prevUsers.map(u => u.id));

    // Skip animation on initial render
    if (isInitialRender.current) {
      isInitialRender.current = false;
      prevUsersRef.current = currentUsers;
      return;
    }

    // Find users that were added
    const addedIds = Array.from(currentIds).filter(id => !prevIds.has(id));

    // Handle entering users (animate in)
    if (addedIds.length > 0) {
      setEnteringUserIds(prev => {
        const next = new Set(prev);
        addedIds.forEach(id => next.add(id));
        return next;
      });
      // Clear entering state after animation completes (300ms per AC1)
      setTimeout(() => {
        setEnteringUserIds(prev => {
          const next = new Set(prev);
          addedIds.forEach(id => next.delete(id));
          return next;
        });
      }, 300);
    }

    // Cancel fade for users that came back online
    users.forEach((user) => {
      if (exitingUserIds.has(user.id) && user.status !== 'offline') {
        const existingTimeout = offlineExitTimeoutsRef.current.get(user.id);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          offlineExitTimeoutsRef.current.delete(user.id);
        }
        exitingUsersRef.current.delete(user.id);
        setExitingUserIds((prev) => {
          const next = new Set(prev);
          next.delete(user.id);
          return next;
        });
      }
    });

    users.forEach((user) => {
      const prevUser = prevUsers.find((prev) => prev.id === user.id);
      if (!prevUser || prevUser.status === 'offline' || user.status !== 'offline') {
        return;
      }
      // Skip if already fading -- do not reset the timer
      if (exitingUserIds.has(user.id)) {
        return;
      }

      exitingUsersRef.current.set(user.id, { ...user });
      setExitingUserIds((prev) => new Set(prev).add(user.id));

      const existingTimeout = offlineExitTimeoutsRef.current.get(user.id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeoutId = setTimeout(() => {
        offlineExitTimeoutsRef.current.delete(user.id);
        exitingUsersRef.current.delete(user.id);
        setExitingUserIds((prev) => {
          const next = new Set(prev);
          next.delete(user.id);
          return next;
        });
      }, 3000);

      offlineExitTimeoutsRef.current.set(user.id, timeoutId);
    });

    // Find users that were removed
    const removedUsers = prevUsers.filter(
      (user) => !currentIds.has(user.id) && !exitingUsersRef.current.has(user.id)
    );

    // Handle exiting users (animate out)
    if (removedUsers.length > 0) {
      setExitingUsers(prev => [...prev, ...removedUsers]);
      // Remove from exiting state after animation completes (200ms per AC2)
      setTimeout(() => {
        setExitingUsers(prev => prev.filter(u => !removedUsers.find(r => r.id === u.id)));
      }, 200);
    }

    // Always update ref for next comparison
    prevUsersRef.current = currentUsers;
  }, [users]);

  useEffect(() => {
    return () => {
      offlineExitTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      offlineExitTimeoutsRef.current.clear();
      exitingUsersRef.current.clear();
    };
  }, []);

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

  const offlineUsers = Array.from(exitingUsersRef.current.values()).filter((user) =>
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

        {/* Story 3.3: Overflow badge styled as avatar (AC5) */}
        {remainingCount > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="vo-avatar-overflow"
                  style={{ zIndex: visibleUsers.length + 1 }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${remainingCount} more participants`}
                >
                  +{remainingCount}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {remainingCount} more {remainingCount === 1 ? 'participant' : 'participants'}
                  </p>
                  <div className="mt-1 text-xs text-muted-foreground max-w-[200px]">
                    {users.slice(max).map(user => user.displayName).join(', ')}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
};

export default AvatarGroup;
