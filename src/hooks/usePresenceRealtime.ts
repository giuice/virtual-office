'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import { emitPresenceEvent } from '@/lib/presence/observability';
import { presenceQueryKeys } from '@/lib/presence/query-keys';
import {
  PRESENCE_REALTIME_PAYLOAD_VERSION,
  presenceRealtimeTopic,
} from '@/lib/presence/realtime';

export type PresenceRealtimeConnectionStatus =
  | 'disabled'
  | 'connecting'
  | 'subscribed'
  | 'degraded';

const POST_SUBSCRIBE_RECONCILIATION_MS = 2_000;
const SIGNAL_INVALIDATION_COALESCE_MS = 50;

/**
 * Realtime is an acceleration signal only. Every event invalidates the scoped
 * authoritative snapshot; payload rows and Presence metas never patch cache.
 */
export function usePresenceRealtime(
  companyId: string,
  userId: string,
  registeredSessionId: string | null,
  enabled = true,
): PresenceRealtimeConnectionStatus {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] =
    useState<PresenceRealtimeConnectionStatus>('disabled');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isSubscribedRef = useRef(false);
  const registeredSessionIdRef = useRef<string | null>(registeredSessionId);
  const trackedSessionIdRef = useRef<string | null>(null);
  registeredSessionIdRef.current = registeredSessionId;

  const trackRegisteredSession = useCallback((): void => {
    const channel = channelRef.current;
    const sessionId = registeredSessionIdRef.current;
    if (
      !channel ||
      !isSubscribedRef.current ||
      !sessionId ||
      trackedSessionIdRef.current === sessionId
    ) {
      return;
    }

    // Tracking starts only after the authoritative lease registration commits.
    // The session ID itself is deliberately not sent in the Presence payload.
    trackedSessionIdRef.current = sessionId;
    void channel
      .track({ payloadVersion: PRESENCE_REALTIME_PAYLOAD_VERSION })
      .catch(() => {
        if (channelRef.current === channel) {
          trackedSessionIdRef.current = null;
          setConnectionStatus('degraded');
        }
      });
  }, []);

  useEffect(() => {
    const channel = channelRef.current;
    if (!registeredSessionId && channel && trackedSessionIdRef.current) {
      trackedSessionIdRef.current = null;
      void channel.untrack().catch(() => {
        if (channelRef.current === channel) {
          setConnectionStatus('degraded');
        }
      });
      return;
    }

    trackRegisteredSession();
  }, [registeredSessionId, trackRegisteredSession]);

  useEffect(() => {
    if (!enabled || !companyId || !userId) {
      setConnectionStatus('disabled');
      return;
    }

    let active = true;
    let delayedReconciliation: ReturnType<typeof setTimeout> | null = null;
    let signalInvalidation: ReturnType<typeof setTimeout> | null = null;
    let awaitingPostSubscribeReconciliation = false;
    let subscribedOnce = false;
    const supabase = createSupabaseBrowserClient();
    const queryKey = presenceQueryKeys.snapshot(companyId, userId);
    const observe = (action: string, resultCode: string, reason?: string): void => {
      emitPresenceEvent({
        category: 'realtime',
        action,
        resultCode,
        appUserId: userId,
        companyId,
        stateTransition: reason ?? null,
      });
    };
    const invalidateSnapshot = (reason: string): void => {
      if (!active) return;
      observe('reconcile', 'RECONCILE_INVALIDATED', reason);
      void queryClient.invalidateQueries({
        queryKey,
        exact: true,
        refetchType: 'active',
      });
    };
    const reconcileSnapshotImmediately = (reason: string): void => {
      if (
        queryClient.isFetching({ queryKey, exact: true }) > 0
      ) {
        observe('reconcile', 'RECONCILE_REUSED_INFLIGHT', reason);
        return;
      }
      invalidateSnapshot(reason);
    };
    const scheduleSignalInvalidation = (): void => {
      if (
        !active ||
        awaitingPostSubscribeReconciliation ||
        signalInvalidation
      ) {
        return;
      }

      signalInvalidation = setTimeout(() => {
        signalInvalidation = null;
        invalidateSnapshot('realtime-signal');
      }, SIGNAL_INVALIDATION_COALESCE_MS);
    };

    setConnectionStatus('connecting');
    observe('subscription', 'CONNECTING');

    const channel = supabase
      .channel(presenceRealtimeTopic(companyId), {
        config: {
          private: true,
          presence: { key: userId },
        },
      })
      .on('presence', { event: 'sync' }, scheduleSignalInvalidation)
      .on('presence', { event: 'join' }, scheduleSignalInvalidation)
      .on('presence', { event: 'leave' }, scheduleSignalInvalidation)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        scheduleSignalInvalidation,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spaces' },
        scheduleSignalInvalidation,
      );
    channelRef.current = channel;

    void supabase.realtime
      .setAuth()
      .then(() => {
        if (!active) return;

        channel.subscribe((status) => {
          if (!active) return;

          if (status === 'SUBSCRIBED') {
            observe(
              'subscription',
              subscribedOnce ? 'RECONNECTED' : 'SUBSCRIBED',
            );
            subscribedOnce = true;
            isSubscribedRef.current = true;
            // Reconnects require a fresh server-side track operation.
            trackedSessionIdRef.current = null;
            setConnectionStatus('subscribed');
            awaitingPostSubscribeReconciliation = true;
            if (signalInvalidation) {
              clearTimeout(signalInvalidation);
              signalInvalidation = null;
            }
            reconcileSnapshotImmediately('subscribe-immediate');

            if (delayedReconciliation) {
              clearTimeout(delayedReconciliation);
            }
            delayedReconciliation = setTimeout(() => {
              delayedReconciliation = null;
              awaitingPostSubscribeReconciliation = false;
              invalidateSnapshot('subscribe-delayed');
            }, POST_SUBSCRIBE_RECONCILIATION_MS);

            trackRegisteredSession();
            return;
          }

          if (
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            observe('subscription', status);
            isSubscribedRef.current = false;
            trackedSessionIdRef.current = null;
            setConnectionStatus('degraded');
          }
        });
      })
      .catch(() => {
        if (active) {
          observe('subscription', 'SET_AUTH_FAILED');
          setConnectionStatus('degraded');
        }
      });

    return () => {
      active = false;
      if (channelRef.current === channel) {
        channelRef.current = null;
        isSubscribedRef.current = false;
        trackedSessionIdRef.current = null;
      }
      if (delayedReconciliation) {
        clearTimeout(delayedReconciliation);
      }
      if (signalInvalidation) {
        clearTimeout(signalInvalidation);
      }
      observe('subscription', 'SCOPE_CLOSED');
      void supabase.removeChannel(channel);
    };
  }, [companyId, enabled, queryClient, trackRegisteredSession, userId]);

  return connectionStatus;
}
