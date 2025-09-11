// src/hooks/realtime/useRealtimeTest.ts
"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface UseRealtimeTestOptions {
  table?: string;
  schema?: string;
  /** Optional Postgres filter string, e.g., `conversation_id=eq.<id>` */
  filter?: string;
}

export function useRealtimeTest(options?: UseRealtimeTestOptions) {
  const [status, setStatus] = useState<string>('INIT');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const table = options?.table ?? 'messages';
    const schema = options?.schema ?? 'public';
    const filter = options?.filter;

    const channel = supabase.channel(`realtime-test:${schema}:${table}`);

    const handler = (payload: any) => {
      // Intentionally simple: visibility in the browser console only
      // eslint-disable-next-line no-console
      console.log('Realtime event received:', payload);
    };

    channel.on('postgres_changes', { event: '*', schema, table, ...(filter ? { filter } : {}) }, handler);

    const subscription = channel.subscribe((s) => {
      setStatus(s);
      if (s === 'CHANNEL_ERROR') {
        setError('Channel error');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
    // We only want to re-create when the options change
  }, [options?.table, options?.schema, options?.filter]);

  return { status, error };
}
