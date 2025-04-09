import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { UserPresenceData } from '@/types/database';

const PRESENCE_QUERY_KEY = ['user-presence'];

export function useUserPresence() {
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
    const map = new Map<string | null, UserPresenceData[]>();
    (users ?? []).forEach((user) => {
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