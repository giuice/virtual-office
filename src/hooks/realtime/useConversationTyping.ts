// src/hooks/realtime/useConversationTyping.ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { useCompany } from '@/contexts/CompanyContext';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { useConversationMembers } from '@/hooks/queries/useConversationMembers';
import { startRecoveringChannel } from '@/lib/messaging/realtime-health';
import { conversationTypingTopic } from '@/lib/messaging/typing-topic';
import { supabase } from '@/lib/supabase/client';

export interface TypingUser {
  userId: string;
  displayName: string;
}

const TYPING_EVENT = 'typing';
/** How long a remote "typing" signal stays visible without a refresh (BR-009: ≤ 5 s after the last signal). */
const REMOTE_TYPING_TTL_MS = 4000;
/** While the user keeps typing, "typing" is re-sent this often (well within the remote TTL). */
const LOCAL_TYPING_REFRESH_MS = 2000;
/** Inactivity after which the local user stops typing (sends "stopped"). */
const LOCAL_TYPING_IDLE_MS = 3000;
/** A typist missing from the roster refetches it at most this often. */
const UNKNOWN_TYPIST_REFETCH_MS = 10_000;
/**
 * Block B fix F2: while the list stream (the removal signal) is unhealthy, the
 * joined conversation's roster is re-read this often, so a removal leaves the
 * typing topic within 5 s (AC-019) — the interval plus one roster request.
 */
const REMOVAL_RECHECK_MS = 3_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TypingSignal {
  userId: string;
  isTyping: boolean;
}

function readTypingSignal(payload: unknown): TypingSignal | null {
  if (!payload || typeof payload !== 'object') return null;
  const { userId, isTyping } = payload as Record<string, unknown>;
  if (typeof userId !== 'string' || !UUID.test(userId) || typeof isTyping !== 'boolean') return null;
  return { userId: userId.toLowerCase(), isTyping };
}

/** The server refused the private join: the user is not (or no longer) a member, or the session is fenced. */
function isRefusedJoin(status: string, error: Error | undefined): boolean {
  return status === 'CHANNEL_ERROR' && /^Unauthorized\b/.test(error?.message ?? '');
}

/**
 * Phase 5 T15 (FR-015, FR-017–FR-020, BR-009): typing of the open
 * conversation.
 *
 * - Topic: the conversation's PRIVATE typing topic (`conversationTypingTopic`,
 *   T5) — join and send authorized by Realtime RLS for current members only;
 *   broadcast over the WebSocket only (never sent unless joined: a send on an
 *   unjoined channel would fall back to REST), no presence on it.
 * - Payload: `{ userId: users.id, isTyping }` only; names come from the
 *   conversation's member roster (GET /api/conversations/members). Realtime
 *   does not bind the payload to its sender, so a member's tampered client can
 *   claim another member's id (accepted: the database cannot prevent it); ids
 *   outside the roster are never shown.
 * - Own typing is never shown: signals carrying the viewer's users.id (its
 *   other tabs and devices) are ignored.
 * - Timing: "typing" on the first keystroke and again every 2 s while typing
 *   continues; "stopped" after 3 s idle, on blur, on send and on leaving the
 *   conversation; a remote indicator expires 4 s after its last signal (tab
 *   closed, signal lost).
 * - Membership: the topic is joined only while the roster lists the viewer;
 *   a roster refetch on the viewer's own removal (useConversationRealtime,
 *   independent of conversation access; while that list stream is unhealthy,
 *   a roster re-read every 3 s instead, F2) or a refused join leaves it. After a
 *   refused join it is joined again only once a later roster read lists the
 *   viewer — never retried into a refusal.
 * - Recovery: `startRecoveringChannel` (stream 'typing', health in the
 *   messaging store; not a stream the banner requires).
 */
export function useConversationTyping(conversationId: string | null) {
  const { currentUserProfile } = useCompany();
  const { realtimeHealth } = useMessaging();
  const viewerId = currentUserProfile?.id ?? null;

  const roster = useConversationMembers(conversationId, viewerId);
  const members = roster.data;
  const isMember = Boolean(viewerId && members?.some((member) => member.userId === viewerId));

  const [accessLost, setAccessLost] = useState<{ conversationId: string; at: number } | null>(null);
  const refusedHere =
    accessLost !== null && accessLost.conversationId === conversationId && roster.dataUpdatedAt <= accessLost.at;
  const canJoin = Boolean(conversationId && viewerId && isMember && !refusedHere);

  const [typistIds, setTypistIds] = useState<string[]>([]);

  // The current channel and its send guard (set by the effect below).
  const channelRef = useRef<{ channel: RealtimeChannel; isCurrent: () => boolean } | null>(null);
  const localTypingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendTyping = useCallback(
    (isTyping: boolean): boolean => {
      const current = channelRef.current;
      if (!current || !viewerId || !current.isCurrent()) return false;
      // Only over the joined WebSocket channel (send() would fall back to REST).
      if (current.channel.state !== 'joined' || !supabase.realtime.isConnected()) return false;
      void current.channel.send({ type: 'broadcast', event: TYPING_EVENT, payload: { userId: viewerId, isTyping } });
      return true;
    },
    [viewerId]
  );

  /** Stop typing for the local user (idle, blur, send, leaving the conversation). */
  const stopTyping = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (localTypingRef.current) {
      localTypingRef.current = false;
      lastSentAtRef.current = 0;
      sendTyping(false);
    }
  }, [sendTyping]);

  /** Call on every input change while the draft has text. */
  const notifyTyping = useCallback(() => {
    localTypingRef.current = true;
    const now = Date.now();
    if (now - lastSentAtRef.current >= LOCAL_TYPING_REFRESH_MS && sendTyping(true)) {
      lastSentAtRef.current = now;
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(stopTyping, LOCAL_TYPING_IDLE_MS);
  }, [sendTyping, stopTyping]);

  useEffect(() => {
    if (!canJoin || !conversationId || !viewerId) return;

    const expiry = new Map<string, ReturnType<typeof setTimeout>>();
    const clearTypist = (userId: string) => {
      const timer = expiry.get(userId);
      if (timer) clearTimeout(timer);
      expiry.delete(userId);
      setTypistIds((previous) => (previous.includes(userId) ? previous.filter((id) => id !== userId) : previous));
    };

    const stop = startRecoveringChannel({
      stream: 'typing',
      health: realtimeHealth,
      traceScope: 'useConversationTyping',
      traceChannel: 'conversation-typing',
      createTopic: () => conversationTypingTopic(conversationId),
      channelOptions: { config: { private: true, broadcast: { self: false } } },
      bind: (channel, isCurrent) => {
        channelRef.current = { channel, isCurrent };
        return channel.on('broadcast', { event: TYPING_EVENT }, ({ payload }) => {
          if (!isCurrent()) return;
          const signal = readTypingSignal(payload);
          if (!signal || signal.userId === viewerId) return;
          if (!signal.isTyping) {
            clearTypist(signal.userId);
            return;
          }
          setTypistIds((previous) => (previous.includes(signal.userId) ? previous : [...previous, signal.userId]));
          const existing = expiry.get(signal.userId);
          if (existing) clearTimeout(existing);
          expiry.set(signal.userId, setTimeout(() => clearTypist(signal.userId), REMOTE_TYPING_TTL_MS));
        });
      },
      onStatus: (status) => {
        // A rejoined channel starts a fresh refresh cycle for the local user.
        if (status === 'SUBSCRIBED') lastSentAtRef.current = 0;
      },
      isAccessLoss: isRefusedJoin,
      onAccessLost: () => {
        setAccessLost({ conversationId, at: Date.now() });
      },
    });

    return () => {
      // Leaving the conversation (switch, removal, unmount): stop typing first.
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (localTypingRef.current) {
        localTypingRef.current = false;
        sendTyping(false);
      }
      lastSentAtRef.current = 0;
      channelRef.current = null;
      stop();
      expiry.forEach((timer) => clearTimeout(timer));
      expiry.clear();
      setTypistIds([]);
    };
  }, [canJoin, conversationId, viewerId, realtimeHealth, sendTyping]);

  // Names from the roster, in arrival order; ids outside it are not shown.
  const typingUsers = useMemo<TypingUser[]>(() => {
    if (!canJoin || !members) return [];
    const byId = new Map(members.map((member) => [member.userId, member]));
    return typistIds.flatMap((userId) => {
      const member = byId.get(userId);
      return member ? [{ userId, displayName: member.displayName?.trim() || 'Alguém' }] : [];
    });
  }, [canJoin, members, typistIds]);

  // A typist the roster does not know yet (joined later): refetch it, at most
  // every 10 s. Block B fix F10: while unknown typists remain, a refetch
  // inside that window is scheduled for when it ends (and again after each
  // roster read that still lacks one), so a second member added within 10 s
  // of the first shows too; the timer goes with the conversation, the viewer
  // or the last unknown typist.
  const unknownTypist = canJoin && members ? typistIds.some((id) => !members.some((m) => m.userId === id)) : false;
  const lastUnknownRefetchRef = useRef(0);
  const { refetch, dataUpdatedAt: rosterUpdatedAt, errorUpdatedAt: rosterErrorAt } = roster;
  useEffect(() => {
    if (!unknownTypist) return;
    const refetchRoster = () => {
      lastUnknownRefetchRef.current = Date.now();
      void refetch();
    };
    const wait = lastUnknownRefetchRef.current + UNKNOWN_TYPIST_REFETCH_MS - Date.now();
    if (wait <= 0) {
      refetchRoster();
      return;
    }
    const timer = setTimeout(refetchRoster, wait);
    return () => clearTimeout(timer);
  }, [unknownTypist, refetch, rosterUpdatedAt, rosterErrorAt, conversationId, viewerId]);

  // Block B fix F2 (FR-019, AC-019): the viewer's removal reaches this hook
  // through the conversation-list stream (useConversationRealtime). While
  // that stream is not healthy a removal could go unseen, so the roster of
  // the joined conversation is read again every 3 s until it is healthy; a
  // 403 (null roster) leaves the typing topic (canJoin turns false).
  const healthSnapshot = useSyncExternalStore(
    realtimeHealth.subscribe,
    realtimeHealth.getSnapshot,
    realtimeHealth.getSnapshot
  );
  const removalSignalDown = healthSnapshot.list?.healthy !== true;
  useEffect(() => {
    if (!canJoin || !removalSignalDown) return;
    const timer = setInterval(() => {
      void refetch({ cancelRefetch: false });
    }, REMOVAL_RECHECK_MS);
    return () => clearInterval(timer);
  }, [canJoin, removalSignalDown, refetch, conversationId, viewerId]);

  return { typingUsers, notifyTyping, stopTyping };
}
