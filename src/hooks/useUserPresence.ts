'use client';
import { useReducerState } from '@/hooks/useReducerState';
import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import debounce from 'lodash/debounce';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { UserPresenceData } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { ACTIVE_PRESENCE_WINDOW_MS, derivePresenceStatus } from './presence-utils';

const PRESENCE_QUERY_KEY = ['user-presence'];
const PRESENCE_CHANNEL_NAME = 'user-presence-channel';
type ConnectionStatus = 'idle' | 'subscribing' | 'subscribed' | 'error' | 'timed_out' | 'closed';

type PresencePayload = {
  user_id?: string;
  status?: string;
  current_space_id?: string | null;
  last_seen_at?: string;
  [key: string]: unknown;
};

interface PresenceLeavePayload {
  leftPresences?: PresencePayload[];
}

function sendUnloadPresenceUpdate(currentUserId: string) {
  const payload = JSON.stringify({ userId: currentUserId, spaceId: null, offline: true });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/users/location', payload);
    return;
  }

  void fetch('/api/users/location', {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    keepalive: true,
  }).catch((error) => {
    console.error('[Presence] Failed to send unload cleanup request:', error);
  });
}

export function useUserPresence(currentUserId?: string) {
  // Log initialization with current user ID
  if (process.env.NODE_ENV === 'development') {
    // console.log(`[useUserPresence] Initialize with userId: ${currentUserId || 'undefined'}`);
  }
  const queryClient = useQueryClient();
  const [connectionStatus, updateConnectionStatus] = useReducerState<ConnectionStatus>('idle');
  const [isInitialized, updateIsInitialized] = useReducerState(false);
  const [updateInProgress, updateUpdateInProgress] = useReducerState(false);
  const [isPresenceReady, updateIsPresenceReady] = useReducerState(false);
  const initializationGuard = useRef(false);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const lastPresencePayloadRef = useRef<string | null>(null);
  const lastUpdateRef = useRef<string | null>(null);
  const [presenceState, updatePresenceState] = useReducerState<Record<string, PresencePayload[]>>({});
  const { user: authUser } = useAuth();
  // Prefer user_metadata.avatar_url (Google) then direct photoURL
  const currentUserPhotoUrl = (authUser as any)?.user_metadata?.avatar_url || (authUser as any)?.photoURL || '';

  const { data: rawUsers, isLoading, error } = useQuery<UserPresenceData[]>({
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

      const mapped: UserPresenceData[] = (json.users || []).flatMap((user: any) => {
        // Validate required fields
        if (!user.id) {
          console.error('[Presence] User missing ID - skipping');
          return [];
        }

        // Ensure avatar and other fields are properly formatted
        const processedUser: UserPresenceData = {
          id: user.id,
          displayName: user.displayName || user.email || 'Unknown User',
          avatarUrl: user.avatarUrl || '',
          status: user.status || 'offline',
          statusMessage: user.statusMessage || '',
          lastActive: user.lastActive ?? user.last_active,
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
        
        return [processedUser];
      });

      // Filter out logged-out or stale users, but always keep current user if present
      const filtered = mapped.filter((u) => {
        if (currentUserId && u.id === currentUserId) return true;
        const inSpace = u.currentSpaceId !== null;
        if (inSpace) return true;
        const userRaw = (json.users || []).find((x: any) => x.id === u.id);
        const lastActive = userRaw?.lastActive || userRaw?.last_active;
        const isRecentlyActive = lastActive ? (now - Date.parse(lastActive)) < ACTIVE_PRESENCE_WINDOW_MS : false;
        const isOnlineByStatus = u.status && u.status !== 'offline';
        return isOnlineByStatus || isRecentlyActive;
      });

      return filtered;
    },
  });

  const currentUser = useMemo(() => {
    return rawUsers?.find((u) => u.id === currentUserId) ?? null;
  }, [rawUsers, currentUserId]);

  const onlineUserIds = useMemo(() => {
    const ids = new Set<string>();
    Object.entries(presenceState).forEach(([key, presences]) => {
      if (!Array.isArray(presences)) return;
      presences.forEach((presence) => {
        const id = (presence?.user_id ?? key) as string | undefined;
        if (id) {
          ids.add(String(id));
        }
      });
    });
    return ids;
  }, [presenceState]);

  const presenceAwareUsers = useMemo(() => {
    if (!rawUsers) return undefined;

    return rawUsers.map((user) => {
      const isOnline = onlineUserIds.has(user.id);
      const derivedStatus = derivePresenceStatus(user, isOnline, isPresenceReady);

      return {
        ...user,
        dbStatus: user.status,
        status: derivedStatus,
        isOnline,
      };
    });
  }, [rawUsers, onlineUserIds, isPresenceReady]);

  const snapshotPresenceState = useCallback((channel: RealtimeChannel) => {
    const state = channel.presenceState() as Record<string, PresencePayload[]>;
    const clone: Record<string, PresencePayload[]> = {};

    Object.entries(state).forEach(([key, presences]) => {
      clone[key] = Array.isArray(presences)
        ? presences.map((presence) => ({ ...presence }))
        : [];
    });

    updatePresenceState(clone);
  }, [updatePresenceState]);

  const computePresenceSignature = useCallback((payload: PresencePayload | null) => {
    if (!payload) return null;
    const { last_seen_at, ...rest } = payload;
    return JSON.stringify(rest);
  }, []);

  const buildPresencePayload = useCallback((): PresencePayload | null => {
    if (!currentUserId) return null;

    return {
      user_id: currentUserId,
      status: currentUser?.status ?? 'online',
      current_space_id: currentUser?.currentSpaceId ?? null,
      last_seen_at: new Date().toISOString(),
    };
  }, [currentUserId, currentUser?.status, currentUser?.currentSpaceId]);

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
    
    updateUpdateInProgress(true);
    
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
      updateUpdateInProgress(false);
    }
  }, [currentUserId, currentUser, updateInProgress, debouncedUpdateLocation, queryClient, updateUpdateInProgress]);

  const usersInSpaces = useMemo(() => {
    const map = new Map<string | null, UserPresenceData[]>();
    (presenceAwareUsers ?? []).forEach((user) => {
      // Offline users should not appear in spaces — their avatar is hidden.
      // Always include the current user so they see their own avatar immediately
      // (before Realtime presence overrides their DB status from offline to online).
      if (user.status === 'offline' && user.id !== currentUserId) return;
      const key = user.currentSpaceId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(user);
    });
    return map;
  }, [presenceAwareUsers, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    if (connectionStatus !== 'subscribed') return;

    const channel = presenceChannelRef.current;
    if (!channel) return;

    const payload = buildPresencePayload();
    const signature = computePresenceSignature(payload);

    if (!payload || !signature) return;
    if (lastPresencePayloadRef.current === signature) {
      return;
    }

    lastPresencePayloadRef.current = signature;

    channel.track(payload).catch((error) => {
      console.error('[Presence] Error updating presence payload:', error);
    });
  }, [currentUserId, connectionStatus, buildPresencePayload, computePresenceSignature]);

  useEffect(() => {
    if (!currentUserId) return;

    const handleBeforeUnload = () => {
      localStorage.setItem('vo-disconnect-timestamp', Date.now().toString());
      sendUnloadPresenceUpdate(currentUserId);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        localStorage.setItem('vo-disconnect-timestamp', Date.now().toString());
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      return () => {};
    }

    if (initializationGuard.current) {
      return () => {};
    }

    initializationGuard.current = true;

    const mapDbRowToPresence = (row: any): UserPresenceData => ({
      id: row.id,
      displayName: row.display_name ?? row.displayName ?? row.email ?? 'Unknown User',
      avatarUrl: row.avatar_url ?? row.avatarUrl ?? '',
      status: row.status ?? 'offline',
      statusMessage: row.status_message ?? row.statusMessage ?? '',
      lastActive: row.last_active ?? row.lastActive,
      currentSpaceId: row.current_space_id ?? row.currentSpaceId ?? null,
      avatarLoading: false,
      avatarError: false,
    });

    const channel = supabase.channel(PRESENCE_CHANNEL_NAME, {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    const handlePresenceSnapshot = () => {
      snapshotPresenceState(channel);
      // Only mark ready once the current user is tracked in presence state,
      // so we don't prematurely derive everyone as offline from an empty snapshot
      const state = channel.presenceState();
      if (currentUserId && state[currentUserId]) {
        updateIsPresenceReady(true);
      }
    };

    channel
      .on('presence', { event: 'sync' }, handlePresenceSnapshot)
      .on('presence', { event: 'join' }, handlePresenceSnapshot)
      .on('presence', { event: 'leave' }, (payload: PresenceLeavePayload) => {
        handlePresenceSnapshot();

        const leftUserIds = new Set(
          (payload.leftPresences ?? [])
            .map((presence) => presence.user_id)
            .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)
        );

        if (leftUserIds.size === 0) {
          return;
        }

        // NOTE: We do NOT mutate rawUsers query data here. The presenceAwareUsers
        // memo derives offline status from onlineUserIds (which updates via presenceState).
        // Mutating rawUsers would overwrite the DB status and break the derivation logic,
        // causing users to appear permanently offline even after reconnecting.
        //
        // Also intentionally NOT posting cleanup to /api/users/location for peer users.
        // The user's own beforeunload handler and server-side cleanup handle legitimate
        // offline transitions. Peer clients must never write location state for other users,
        // as it causes permanent eviction on network hiccups / tab switches / reloads.
      })
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

            if (!payload.new) return old;
            const newUser = mapDbRowToPresence(payload.new);
            const existing = old.find((u) => u.id === newUser.id);

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
      );

    presenceChannelRef.current = channel;

    channel.subscribe(async (status, err) => {
      if (err) {
        console.error('[Presence] Supabase subscription error:', err);
        updateConnectionStatus('error');
        initializationGuard.current = false;
        return;
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Presence] Supabase subscription status: ${status}`);
      }

      switch (status) {
        case 'SUBSCRIBED': {
          updateConnectionStatus('subscribed');
          updateIsInitialized(true);
          handlePresenceSnapshot();

          const payload = buildPresencePayload();
          const signature = computePresenceSignature(payload);

          if (payload && signature) {
            lastPresencePayloadRef.current = signature;
            try {
              await channel.track(payload);
            } catch (trackError) {
              console.error('[Presence] Failed to track presence payload:', trackError);
            }
          }
          break;
        }
        case 'TIMED_OUT':
          updateConnectionStatus('timed_out');
          console.warn('[Presence] Subscription timed out. Supabase client may attempt reconnection.');
          initializationGuard.current = false;
          break;
        case 'CHANNEL_ERROR':
          updateConnectionStatus('error');
          console.error('[Presence] Channel error occurred.');
          initializationGuard.current = false;
          break;
        case 'CLOSED':
          updateConnectionStatus('closed');
          initializationGuard.current = false;
          break;
        default:
          break;
      }
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Presence] Attempting to subscribe to Supabase presence channel as ${currentUserId}`);
    }

    return () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Presence] Unsubscribing from Supabase presence channel.');
      }

      updatePresenceState({});
      presenceChannelRef.current = null;
      initializationGuard.current = false;
      updateIsInitialized(false);
      updateIsPresenceReady(false);
      lastPresencePayloadRef.current = null;

      channel.unsubscribe().catch((error) => {
        console.error('[Presence] Error unsubscribing from Supabase channel:', error);
      });
      supabase.removeChannel(channel).catch((error) => {
        console.error('[Presence] Error removing Supabase channel:', error);
      });
    };
  }, [currentUserId, queryClient, snapshotPresenceState, buildPresencePayload, computePresenceSignature, updateIsPresenceReady, updateConnectionStatus, updateIsInitialized, updatePresenceState]);

  return {
    users: presenceAwareUsers,
    usersInSpaces,
    isLoading,
    error,
    updateLocation: safeUpdateLocation,
    connectionStatus,
    isInitialized,
    isPresenceReady,
    updateInProgress,
  };
}
