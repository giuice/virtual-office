'use client';
import { useEffect, useMemo, useState } from 'react';
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
      return (json.users || []).map((user: any) => {
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
          current_space_id: user.current_space_id || null,
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
      }).filter(Boolean) as UserPresenceData[]; // Remove any null entries from validation
    },
  });

  const currentUser = useMemo(() => {
    return users?.find((u) => u.id === currentUserId) ?? null;
  }, [users, currentUserId]);

  const safeUpdateLocation = async (spaceId: string | null) => {
    if (!currentUserId) {
      console.error('[Presence] Cannot update location: currentUserId is missing');
      return;
    }
    
    // Clear any previous request that might be pending
    debouncedUpdateLocation.cancel();
    
    // If user is already in this space, log and skip unless it's null (leaving all spaces)
    if (currentUser && currentUser.current_space_id === spaceId && spaceId !== null) {
      console.log('[Presence] User already in this space, skipping update');
      return;
    }
    
    // Log the attempted change
    console.log(`[Presence] Requesting location change: ${currentUser?.current_space_id || 'null'} -> ${spaceId || 'null'}`);
    
    // Update immediately (apply debounce internally)
    await debouncedUpdateLocation(spaceId);
    
    // Manually update local state to show immediate feedback
    // This will be overwritten when the real-time update comes in
    if (currentUser) {
      queryClient.setQueryData<UserPresenceData[]>(PRESENCE_QUERY_KEY, (old) => {
        if (!old) return old;
        return old.map(u => u.id === currentUserId ? {...u, current_space_id: spaceId} : u);
      });
    }
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
      .subscribe((status, err) => {
        if (err) {
          console.error('[Presence] Supabase subscription error:', err);
          setConnectionStatus('error');
          // TODO: Consider more robust error handling (e.g., notify user)
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Presence] Supabase subscription status: ${status}`);
          }
          switch (status) {
            case 'SUBSCRIBED':
              setConnectionStatus('subscribed');
              break;
            case 'TIMED_OUT':
              setConnectionStatus('timed_out');
              console.warn(`[Presence] Subscription timed out. Supabase client may attempt reconnection.`);
              break;
            case 'CHANNEL_ERROR':
              setConnectionStatus('error');
              console.error(`[Presence] Channel error occurred.`);
              break;
            case 'CLOSED':
              // This status might be triggered during intentional unsubscription.
              // We set the status explicitly in the cleanup function.
              // setConnectionStatus('closed');
              break;
            default:
              // Handle any other statuses if necessary
              break;
          }
        }
      });

    // Log initial subscription attempt
    if (process.env.NODE_ENV === 'development') {
      console.log('[Presence] Attempting to subscribe to Supabase presence channel.');
      setConnectionStatus('subscribing'); // Set status before subscribing
    }

    return () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Presence] Unsubscribing from Supabase presence channel.');
      }
      setConnectionStatus('closed'); // Set status on cleanup
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
    connectionStatus,
  };
}
