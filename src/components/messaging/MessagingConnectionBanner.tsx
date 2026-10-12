// src/components/messaging/MessagingConnectionBanner.tsx
'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { REQUIRED_MESSAGING_STREAMS, unhealthySince } from '@/lib/messaging/realtime-health';

/** FR-014: a required stream unhealthy longer than this (browser online) shows "Reconectando…". */
const RECONNECTING_AFTER_MS = 5_000;

export const OFFLINE_BANNER_TEXT = 'Sem conexão — mensagens serão enviadas quando voltar';
export const RECONNECTING_BANNER_TEXT = 'Reconectando…';

const subscribeOnline = (listener: () => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};
const readOnline = () => navigator.onLine !== false;
const readOnlineOnServer = () => true;

/**
 * Phase 5 T13 (FR-014, AC-014, AC-037): the drawer's connection banner — the
 * offline text as soon as the browser reports offline; "Reconectando…" while
 * online when the messages or the conversation-list stream has been unhealthy
 * for more than 5 s; nothing once all are healthy. A polite live region that
 * is always present, so each change is announced.
 */
export function MessagingConnectionBanner() {
  const { realtimeHealth } = useMessaging();
  const online = useSyncExternalStore(subscribeOnline, readOnline, readOnlineOnServer);
  const health = useSyncExternalStore(realtimeHealth.subscribe, realtimeHealth.getSnapshot, realtimeHealth.getSnapshot);
  const since = unhealthySince(health, REQUIRED_MESSAGING_STREAMS);
  // Re-render once the current unhealthy period passes the threshold.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (since === null) return;
    const left = since + RECONNECTING_AFTER_MS - Date.now();
    if (left < 0) return;
    const timer = setTimeout(() => setTick((tick) => tick + 1), left + 50);
    return () => clearTimeout(timer);
  }, [since]);

  // Decided at render: when the earliest unhealthy stream recovers while another
  // one is already past the threshold, the banner stays without a healthy flash.
  const overdue = since !== null && Date.now() - since > RECONNECTING_AFTER_MS;
  const state = !online ? 'offline' : overdue ? 'reconnecting' : 'healthy';
  const text = state === 'offline' ? OFFLINE_BANNER_TEXT : state === 'reconnecting' ? RECONNECTING_BANNER_TEXT : '';

  return (
    <div role="status" aria-live="polite" data-testid="messaging-connection-banner" data-state={state}>
      {text ? (
        <p className="border-b bg-muted px-3 py-1.5 text-xs text-muted-foreground">{text}</p>
      ) : null}
    </div>
  );
}
