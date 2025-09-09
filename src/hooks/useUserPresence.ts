'use client';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { debounce } from 'lodash';
import { supabase } from '@/lib/supabase/client';
import { UserPresenceData } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';

const PRESENCE_QUERY_KEY = ['user-presence'];
type ConnectionStatus = 'idle' | 'subscribing' | 'subscribed' | 'error' | 'timed_out' | 'closed';

export function useUserPresence(currentUserId?: string) {
  // Log initialization with current user ID
  if (process.env.NODE_ENV === 'development') {
    console.log(`[useUserPresence] Initialize with userId: ${currentUserId || 'undefined'}`);
  }
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [isInitialized, setIsInitialized] = useState(false);
  const [updateInProgress, setUpdateInProgress] = useState(false);
  const initializationGuard = useRef(false);
  const subscriptionRef = useRef<any>(null);
  const lastUpdateRef = useRef<string | null>(null);
  const { user: authUser } = useAuth();
  // Prefer user_metadata.avatar_url (Google) then direct photoURL
  const currentUserPhotoUrl = (authUser as any)?.user_metadata?.avatar_url || (authUser as any)?.photoURL || '';

  const { data: users, isLoading, error } = useQuery<UserPresenceData[]>({
    queryKey: PRESENCE_QUERY_KEY,
    queryFn: async () => {
      console.log('[Presence] Fetching user presence data with avatar info');
      const res = await fetch('/api/users/list');
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        console.error(`[Presence] API error (${res.status}):`, errorText);
        throw new Error(`Failed to fetch users: ${res.status} ${errorText}`);
      }
      
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch users');
      
      // Process and validate user data with avatar information
      const now = Date.now();
      const ACTIVE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes grace window

      const mapped: UserPresenceData[] = (json.users || []).map((user: any) => {
        // Validate required fields
        if (!user.id) {
          console.error('[Presence] User missing ID - skipping');
          return null; // Will be filtered out below
        }

        // Ensure avatar and other fields are properly formatted
        const processedUser: UserPresenceData = {
          id: user.id,
          displayName: user.displayName || 'Unknown User',
          avatarUrl: user.avatarUrl || '',
          status: user.status || 'offline',
          statusMessage: user.statusMessage || '',
          // API returns camelCase from SupabaseUserRepository; keep snake_case fallback
          currentSpaceId: user.currentSpaceId ?? user.current_space_id ?? null,
          avatarLoading: false,
          avatarError: false
        };

        // If this is the current user and DB avatar is missing, use Google/social photo
        if (currentUserId && user.id === currentUserId && !processedUser.avatarUrl && currentUserPhotoUrl) {
          processedUser.avatarUrl = currentUserPhotoUrl;
          if (process.env.NODE_ENV === 'development') {
            console.log('[Presence] Injected current user Google avatar into presence data');
          }
        }
        
        // Log avatar data for debugging
        if (process.env.NODE_ENV === 'development') {
          if (!user.avatarUrl) {
            console.log(`[Presence] User ${user.displayName} (${user.id}) has no avatar URL`);
          }
        }
        
        return processedUser;
      }).filter(Boolean) as UserPresenceData[];

      // Filter out logged-out or stale users, but always keep current user if present
      const filtered = mapped.filter((u) => {
        if (currentUserId && u.id === currentUserId) return true;
        const inSpace = u.currentSpaceId !== null;
        if (inSpace) return true;
        const userRaw = (json.users || []).find((x: any) => x.id === u.id);
        const lastActive = userRaw?.lastActive || userRaw?.last_active;
        const isRecentlyActive = lastActive ? (now - Date.parse(lastActive)) < ACTIVE_WINDOW_MS : false;
        const isOnlineByStatus = u.status && u.status !== 'offline';
        return isOnlineByStatus || isRecentlyActive;
      });

      return filtered;
    },
  });

  const currentUser = useMemo(() => {
    return users?.find((u) => u.id === currentUserId) ?? null;
  }, [users, currentUserId]);

  const debouncedUpdateLocation = useMemo(() =>
    debounce(async (spaceId: string | null) => {
      if (!currentUserId) {
        console.error("[Presence] Cannot update location: currentUserId is missing.");
        return;
      }
      try {
        const response = await fetch('/api/users/location', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUserId, spaceId }),
        });

        if (!response.ok) {
          // Log error details if the API call fails
          const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
          console.error(`[Presence] Failed to update location to space ${spaceId}. Status: ${response.status}`, errorData);
          
          // Revert the optimistic update if the server call failed
          queryClient.setQueryData<UserPresenceData[]>(PRESENCE_QUERY_KEY, (old) => {
            if (!old) return old;
            
            // Find current user and check what their original space was
            const user = old.find(u => u.id === currentUserId);
            console.log(`[Presence] Reverting failed update for user ${currentUserId}`);
            return old;
          });
          
          throw new Error(`Failed to update location: ${errorData.message || response.statusText}`);
        } else {
          const responseData = await response.json();
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Presence] Successfully updated location to space ${spaceId} for user ${currentUserId}`, responseData);
          }
          // No need to manually update the query data here - the realtime subscription will handle it
          return responseData;
        }
      } catch (error) {
        console.error(`[Presence] Network error updating location to space ${spaceId}:`, error);
        throw error; // Re-throw so the caller can handle it
      }
    }, 250, { leading: true, trailing: false }) // Reduced debounce time and avoid trailing calls
  , [currentUserId, queryClient]);

  const safeUpdateLocation = useCallback(async (spaceId: string | null) => {
    if (!currentUserId) {
      console.error('[Presence] Cannot update location: currentUserId is missing');
      return;
    }

    // Prevent multiple simultaneous updates
    if (updateInProgress) {
      console.log('[Presence] Update already in progress, skipping duplicate request');
      return;
    }

    // Check if this is the same update we just made
    const updateKey = `${currentUserId}-${spaceId}`;
    if (lastUpdateRef.current === updateKey) {
      console.log('[Presence] Same update already processed, skipping:', updateKey);
      return;
    }
    
  // Clear any previous request that might be pending
  debouncedUpdateLocation?.cancel?.();
    
    // If user is already in this space, log and skip unless it's null (leaving all spaces)
    if (currentUser && currentUser.currentSpaceId === spaceId && spaceId !== null) {
      console.log('[Presence] User already in this space, skipping update');
      // Mark this as processed to prevent re-execution
      lastUpdateRef.current = updateKey;
      return;
    }
    
    // Log the attempted change
    console.log(`[Presence] Requesting location change: ${currentUser?.currentSpaceId || 'null'} -> ${spaceId || 'null'}`);
    
    setUpdateInProgress(true);
    
    try {
      // Update immediately (apply debounce internally)
      await debouncedUpdateLocation(spaceId);
      
      // Mark this update as completed
      lastUpdateRef.current = updateKey;
      
      // Manually update local state to show immediate feedback
      // This will be overwritten when the real-time update comes in
      if (currentUser) {
        queryClient.setQueryData<UserPresenceData[]>(PRESENCE_QUERY_KEY, (old) => {
          if (!old) return old;
          return old.map(u => u.id === currentUserId ? {...u, currentSpaceId: spaceId} : u);
        });
      }
    } finally {
      setUpdateInProgress(false);
    }
  
  const updateLocation = async (spaceId: string | null) => {
    if (!currentUserId) {
      console.error("[Presence] Cannot update location: currentUserId is missing in updateLocation call.");
      
      // For debugging: log some helpful context
      console.warn("[Presence] Debug info: Make sure PresenceProvider has access to the current user ID");
      console.warn("[Presence] Current state:", {
        currentUserId,
        usersCount: users?.length || 0,
        currentUser: currentUser ? { id: currentUser.id, name: currentUser.displayName } : null
      });
      
      return Promise.reject(new Error("Cannot update location: currentUserId is missing"));
    }
    
    return debouncedUpdateLocation(spaceId);
  };

  }, [currentUserId, currentUser, updateInProgress, debouncedUpdateLocation, queryClient]);

  const usersInSpaces = useMemo(() => {
    const map = new Map<string | null, UserPresenceData[]>();
    (users ?? []).forEach((user) => {
      const key = user.currentSpaceId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(user);
    });
    return map;
  }, [users]);

  useEffect(() => {
    // Prevent multiple initializations
    if (initializationGuard.current || isInitialized) {
      console.log('[Presence] Already initialized, skipping subscription setup');
      return;
    }

    initializationGuard.current = true;
    setConnectionStatus('subscribing');
    
    // Helper to map DB row (snake_case) to UserPresenceData
    const mapDbRowToPresence = (row: any): UserPresenceData => ({
      id: row.id,
      displayName: row.display_name ?? row.displayName ?? 'Unknown User',
      avatarUrl: row.avatar_url ?? row.avatarUrl ?? '',
      status: row.status ?? 'offline',
      statusMessage: row.status_message ?? row.statusMessage ?? '',
      currentSpaceId: row.current_space_id ?? row.currentSpaceId ?? null,
      avatarLoading: false,
      avatarError: false,
    });

    const channel = supabase
      .channel('user-presence-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          queryClient.setQueryData<UserPresenceData[]>(PRESENCE_QUERY_KEY, (prev) => {
            const old = prev ?? [];
            const eventType = (payload as any).eventType;

            if (eventType === 'DELETE') {
              const oldRow = payload.old as any;
              if (!oldRow?.id) return old;
              return old.filter((u) => u.id !== String(oldRow.id));
            }

            if (!payload.new) return old; // Nothing to apply
            const newUser = mapDbRowToPresence(payload.new);
            const existing = old.find((u) => u.id === newUser.id);

            // Skip if nothing meaningful changed
            if (
              existing &&
              existing.currentSpaceId === newUser.currentSpaceId &&
              existing.status === newUser.status &&
              existing.displayName === newUser.displayName &&
              existing.avatarUrl === newUser.avatarUrl
            ) {
              return old;
            }

            if (eventType === 'INSERT') {
              if (existing) {
                return old.map((u) => (u.id === newUser.id ? newUser : u));
              }
              return [...old, newUser];
            }

            if (eventType === 'UPDATE') {
              return old.map((u) => (u.id === newUser.id ? newUser : u));
            }

            return old;
          });
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('[Presence] Supabase subscription error:', err);
          setConnectionStatus('error');
          initializationGuard.current = false; // Allow retry on error
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Presence] Supabase subscription status: ${status}`);
          }
          switch (status) {
            case 'SUBSCRIBED':
              setConnectionStatus('subscribed');
              setIsInitialized(true);
              break;
            case 'TIMED_OUT':
              setConnectionStatus('timed_out');
              console.warn(`[Presence] Subscription timed out. Supabase client may attempt reconnection.`);
              initializationGuard.current = false; // Allow retry
              break;
            case 'CHANNEL_ERROR':
              setConnectionStatus('error');
              console.error(`[Presence] Channel error occurred.`);
              initializationGuard.current = false; // Allow retry
              break;
            case 'CLOSED':
              setConnectionStatus('closed');
              // Do not flip isInitialized here to avoid effect re-run and cleanup loop
              initializationGuard.current = false;
              break;
            default:
              break;
          }
        }
      });

    // Store subscription reference for cleanup
    subscriptionRef.current = channel;

    // Log initial subscription attempt
    if (process.env.NODE_ENV === 'development') {
      console.log('[Presence] Attempting to subscribe to Supabase presence channel.');
    }

    return () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Presence] Unsubscribing from Supabase presence channel.');
      }
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current).catch(error => {
          console.error('[Presence] Error removing Supabase channel:', error);
        });
        subscriptionRef.current = null;
      }
    };
  // Only depend on stable queryClient to avoid re-subscribe loops
  }, [queryClient]);

  return {
    users,
    usersInSpaces,
    isLoading,
    error,
    updateLocation: safeUpdateLocation,
    connectionStatus,
    isInitialized,
    updateInProgress,
  };
}
