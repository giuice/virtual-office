'use client';
import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { debounce } from 'lodash';
import { supabase } from '@/lib/supabase/client';
import { UserPresenceData } from '@/types/database';

const PRESENCE_QUERY_KEY = ['user-presence'];

export function useUserPresence(currentUserId?: string) {
  const queryClient = useQueryClient();

  const { data: users, isLoading, error } = useQuery<UserPresenceData[]>({
    queryKey: PRESENCE_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/users/list');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch users');
      return json.users as UserPresenceData[];
    },
  });

  const currentUser = useMemo(() => {
    return users?.find((u) => u.id === currentUserId) ?? null;
  }, [users, currentUserId]);

  const safeUpdateLocation = async (spaceId: string | null) => {
    if (!currentUserId) return;
    if (currentUser && currentUser.current_space_id === spaceId) {
      console.log('[Presence] User already in this space, skipping update');
      return;
    }
    debouncedUpdateLocation(spaceId);
  };

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
          // TODO: Consider adding user notification or retry logic here
        } else {
           if (process.env.NODE_ENV === 'development') {
             console.log(`[Presence] Successfully requested location update to space ${spaceId} for user ${currentUserId}`);
           }
           // Invalidate query on success? Maybe not needed due to realtime updates.
           // queryClient.invalidateQueries({ queryKey: PRESENCE_QUERY_KEY }); 
        }
      } catch (error) {
        console.error(`[Presence] Network error updating location to space ${spaceId}:`, error);
        // TODO: Consider adding user notification or retry logic here
      }
    }, 300, { leading: true, trailing: false }) // Changed trailing to false to avoid potential double calls if component unmounts/remounts quickly
  , [currentUserId, queryClient]); // Added queryClient dependency

  const updateLocation = async (spaceId: string | null) => {
    debouncedUpdateLocation(spaceId);
  };

  const usersInSpaces = useMemo(() => {
    const map = new Map<string | null, UserPresenceData[]>();
    (users ?? []).forEach((user) => {
      const key = user.current_space_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(user);
    });
    return map;
  }, [users]);

  useEffect(() => {
    const channel = supabase
      .channel('user-presence-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          queryClient.setQueryData<UserPresenceData[]>(PRESENCE_QUERY_KEY, (old) => {
            if (!old) return old;
            const newUser = payload.new as UserPresenceData;
            const existing = old.find((u) => u.id === newUser.id);
            if (
              existing &&
              existing.current_space_id === newUser.current_space_id &&
              existing.status === newUser.status
            ) {
              // No meaningful change, skip update
              return old;
            }
            if (payload.eventType === 'INSERT') {
              return [...old, newUser];
            }
            if (payload.eventType === 'UPDATE') {
              return old.map((u) => (u.id === newUser.id ? newUser : u));
            }
            if (payload.eventType === 'DELETE') {
              return old.filter((u) => u.id !== (payload.old as UserPresenceData).id);
            }
            return old;
          });
        }
      )
      .subscribe((status, err) => { // Add callback for subscription status/errors
        if (err) {
          console.error('[Presence] Supabase subscription error:', err);
          // TODO: Handle subscription error (e.g., notify user, attempt reconnect)
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Presence] Supabase subscription status: ${status}`);
          }
          // Optional: Handle specific statuses like 'SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
             // Attempt to resubscribe or notify user
             console.warn(`[Presence] Subscription issue: ${status}. Consider reconnection logic.`);
          }
        }
      });

    // Log initial subscription attempt
    if (process.env.NODE_ENV === 'development') {
      console.log('[Presence] Attempting to subscribe to Supabase presence channel.');
    }

    return () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Presence] Unsubscribing from Supabase presence channel.');
      }
      supabase.removeChannel(channel).catch(error => {
         console.error('[Presence] Error removing Supabase channel:', error);
      });
    };
  }, [queryClient]);

  return {
    users,
    usersInSpaces,
    isLoading,
    error,
    updateLocation: safeUpdateLocation,
  };
}
