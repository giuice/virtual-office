import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { User } from '@/types/database'; // adjust import if needed

// Query key for presence data
const PRESENCE_QUERY_KEY = ['user-presence'];

export function useUserPresence() {
  const queryClient = useQueryClient();

  // Fetch initial presence data
  const { data: users, isLoading, error } = useQuery<User[]>({
    queryKey: PRESENCE_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/users/list');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch users');
      return json.users as User[];
    },
  });

  // Subscribe to Supabase Realtime changes on users table
  useEffect(() => {
    const channel = supabase
      .channel('user-presence-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          queryClient.setQueryData<User[]>(PRESENCE_QUERY_KEY, (old) => {
            if (!old) return old;
            const newUser = payload.new as User;
            if (payload.eventType === 'INSERT') {
              return [...old, newUser];
            }
            if (payload.eventType === 'UPDATE') {
              return old.map((u) => (u.id === newUser.id ? newUser : u));
            }
            if (payload.eventType === 'DELETE') {
              return old.filter((u) => u.id !== (payload.old as User).id);
            }
            return old;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Mutation to update current user's location
  const { mutateAsync: updateLocation } = useMutation({
    mutationFn: async (spaceId: string | null) => {
      await fetch('/api/users/location', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRESENCE_QUERY_KEY });
    },
  });

  const usersInSpaces = useMemo(() => {
    const map = new Map<string | null, User[]>();
    (users ?? []).forEach(user => {
      const key = user.current_space_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(user);
    });
    return map;
  }, [users]);

  return {
    users,
    usersInSpaces,
    isLoading,
    error,
    updateLocation,
  };
}