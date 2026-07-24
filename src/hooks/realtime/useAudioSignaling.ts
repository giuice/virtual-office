'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import {
  screenShareActiveResponseSchema,
  screenShareDescriptionPayloadSchema,
  screenShareHandshakePayloadSchema,
  screenShareIcePayloadSchema,
  screenSharePresenterInvalidatedPayloadSchema,
  screenSharePublicErrorSchema,
  type ScreenSharePublicShare,
} from '@/lib/webrtc/screen-share-contract';
import { WebRTCManager, type SignalingEvent, type WebRTCSignalSender } from '@/lib/webrtc';

const MAX_BUFFERED_SIGNALS_PER_PEER = 32;
const MAX_BUFFERED_SIGNAL_PEERS = 64;
const MAX_INBOUND_SIGNALS_PER_SOURCE = 32;
const MAX_INBOUND_SIGNAL_SOURCES = 64;
const MAX_INBOUND_SIGNALS_TOTAL = 256;
const RECONCILE_DELAY_MS = 1_000;

interface UseAudioSignalingOptions {
  companyId: string | undefined;
  spaceId: string | undefined;
  currentUserId: string | undefined;
  presenceSessionId: string | null | undefined;
  accessToken: string | null | undefined;
  generation: string | number;
  webrtcManager: WebRTCManager | null;
  enabled?: boolean;
  isMuted: boolean;
  onTerminalAuthorizationDenied?: () => void;
}

interface AudioPresenceState { [key: string]: Array<{ user_id?: string; is_muted?: boolean }>; }
interface SignalingState { isConnected: boolean; error: string | null; mutedUserIds: Set<string>; activeShare: ScreenSharePublicShare | null; }
interface ScopedSignalingInput {
  companyId: string; spaceId: string; currentUserId: string; presenceSessionId: string;
  accessToken: string; generation: string | number; manager: WebRTCManager; connectionId: string;
}
type BufferedSignal =
  | { type: 'description'; payload: { sourceUserId: string; sourcePresenceSessionId: string; sourceConnectionId: string; targetUserId: string; targetPresenceSessionId: string; targetConnectionId: string; shareId: string | null; description: RTCSessionDescriptionInit } }
  | { type: 'ice'; payload: { sourceUserId: string; sourcePresenceSessionId: string; sourceConnectionId: string; targetUserId: string; targetPresenceSessionId: string; targetConnectionId: string; shareId: string | null; candidate: RTCIceCandidateInit } };

function activeRoute(spaceId: string, presenceSessionId: string): string {
  return `/api/spaces/${encodeURIComponent(spaceId)}/screen-share/active?${new URLSearchParams({ presenceSessionId }).toString()}`;
}

function createConnectionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  throw new Error('crypto.randomUUID is required for media signaling identity');
}

function isTerminalAuthorizationResponse(status: number, body: unknown): boolean {
  if (status === 401 || status === 403 || status === 409) return true;
  const parsed = screenSharePublicErrorSchema.safeParse(body);
  return parsed.success && ['UNAUTHORIZED', 'ACCESS_DENIED', 'SESSION_INVALID', 'MEMBERSHIP_SCOPE_INVALID', 'SPACE_NOT_FOUND', 'SPACE_UNAVAILABLE', 'PRESENTER_PROFILE_INVALID'].includes(parsed.data.code);
}

export function useAudioSignaling(options: UseAudioSignalingOptions): SignalingState {
  const { companyId, spaceId, currentUserId, presenceSessionId, accessToken, generation, webrtcManager, enabled = true, isMuted, onTerminalAuthorizationDenied } = options;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const scopeGenerationRef = useRef<string | number>(generation);
  const isConnectedRef = useRef(false);
  const isMutedRef = useRef(isMuted);
  const activeShareRef = useRef<ScreenSharePublicShare | null>(null);
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());
  const [activeShare, setActiveShare] = useState<ScreenSharePublicShare | null>(null);
  const [error, setError] = useState<string | null>(null);

  scopeGenerationRef.current = generation;
  isMutedRef.current = isMuted;

  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !isConnectedRef.current || !currentUserId) return;
    void channel.track({ user_id: currentUserId, is_muted: isMutedRef.current }).catch(() => undefined);
  }, [isMuted, currentUserId]);

  useEffect(() => {
    const clearRenderedShare = (): void => { activeShareRef.current = null; setActiveShare(null); };
    if (!enabled || !companyId || !spaceId || !currentUserId || !presenceSessionId || !accessToken || !webrtcManager) {
      clearRenderedShare();
      setMutedUserIds((current) => current.size === 0 ? current : new Set());
      return;
    }

    // Scope replacement is a security boundary: clear synchronously before any
    // subscription, fetch, removal, or callback from an earlier scope can settle.
    clearRenderedShare();
    setMutedUserIds((current) => current.size === 0 ? current : new Set());
    const scope: ScopedSignalingInput = {
      companyId, spaceId, currentUserId, presenceSessionId, accessToken, generation,
      manager: webrtcManager, connectionId: createConnectionId(),
    };
    const supabase = createSupabaseBrowserClient();
    const topic = `company:${scope.companyId}:space:${scope.spaceId}:media`;
    const channel = supabase.channel(topic, {
      config: { private: true, broadcast: { self: false, ack: true }, presence: { key: `${scope.currentUserId}:${scope.presenceSessionId}` } },
    });
    let cancelled = false;
    let retired = false;
    let subscribed = false;
    let activeRequest: AbortController | null = null;
    let delayedReconnectReconcile: ReturnType<typeof setTimeout> | null = null;
    let delayedBufferedReconcile: ReturnType<typeof setTimeout> | null = null;
    let bufferedRetryUsed = false;
    let subscriptionGeneration = 0;
    const inboundQueues = new Map<string, Promise<void>>();
    const inboundPendingCounts = new Map<string, number>();
    let inboundPendingTotal = 0;
    const bufferedSignals = new Map<string, BufferedSignal[]>();
    channelRef.current = channel;

    const isCurrent = (): boolean => !cancelled && !retired && channelRef.current === channel && scopeGenerationRef.current === scope.generation;
    const clearBuffers = (): void => {
      bufferedSignals.clear();
      inboundQueues.clear();
      inboundPendingCounts.clear();
      inboundPendingTotal = 0;
    };
    const clearTransport = (): void => {
      subscribed = false;
      subscriptionGeneration += 1;
      if (channelRef.current === channel) {
        isConnectedRef.current = false;
        scope.manager.setSignalingChannel(null);
      }
    };
    const retireForAuthorization = (): void => {
      if (!isCurrent()) return;
      retired = true;
      clearTransport();
      activeRequest?.abort();
      if (delayedReconnectReconcile) clearTimeout(delayedReconnectReconcile);
      if (delayedBufferedReconcile) clearTimeout(delayedBufferedReconcile);
      clearBuffers();
      clearRenderedShare();
      setMutedUserIds((current) => current.size === 0 ? current : new Set());
      if (channelRef.current === channel) channelRef.current = null;
      // The provider owns the visual lifecycle; standalone consumers still clean up.
      if (onTerminalAuthorizationDenied) onTerminalAuthorizationDenied();
      else scope.manager.cleanup();
      void supabase.removeChannel(channel).catch(() => undefined);
    };
    const isScopePayload = (payload: {
      sourceUserId: string;
      companyId: string;
      spaceId: string;
      targetUserId?: string;
      targetPresenceSessionId?: string;
      targetConnectionId?: string;
    }): boolean => (
      isCurrent() && payload.sourceUserId !== scope.currentUserId && payload.companyId === scope.companyId && payload.spaceId === scope.spaceId &&
      (payload.targetUserId === undefined || (
        payload.targetUserId === scope.currentUserId &&
        payload.targetPresenceSessionId === scope.presenceSessionId &&
        payload.targetConnectionId === scope.connectionId
      ))
    );
    const enqueue = (sourceUserId: string, handler: () => Promise<void>): void => {
      if (!isCurrent()) return;
      const sourcePending = inboundPendingCounts.get(sourceUserId) ?? 0;
      if (
        sourcePending >= MAX_INBOUND_SIGNALS_PER_SOURCE ||
        inboundPendingTotal >= MAX_INBOUND_SIGNALS_TOTAL ||
        (sourcePending === 0 && inboundPendingCounts.size >= MAX_INBOUND_SIGNAL_SOURCES)
      ) {
        setError('Media signaling queue limit reached.');
        return;
      }
      inboundPendingCounts.set(sourceUserId, sourcePending + 1);
      inboundPendingTotal += 1;
      const previous = inboundQueues.get(sourceUserId) ?? Promise.resolve();
      const next = previous.then(handler, handler).catch((handlerError: unknown) => {
        if (isCurrent()) setError(handlerError instanceof Error ? handlerError.message : 'Media signaling failed.');
      }).finally(() => {
        const remaining = inboundPendingCounts.get(sourceUserId);
        if (remaining !== undefined) {
          if (remaining <= 1) inboundPendingCounts.delete(sourceUserId);
          else inboundPendingCounts.set(sourceUserId, remaining - 1);
          inboundPendingTotal = Math.max(0, inboundPendingTotal - 1);
        }
        if (inboundQueues.get(sourceUserId) === next) inboundQueues.delete(sourceUserId);
      });
      inboundQueues.set(sourceUserId, next);
    };
    const updateMutedUsers = (): void => {
      if (!isCurrent()) return;
      const muted = new Set<string>();
      Object.values(channel.presenceState() as AudioPresenceState).forEach((presences) => presences.forEach((presence) => {
        if (presence.user_id && presence.is_muted) muted.add(presence.user_id);
      }));
      setMutedUserIds(muted);
    };
    const dispatchBuffered = async (signal: BufferedSignal): Promise<void> => {
      if (!isCurrent()) return;
      if (signal.type === 'description') {
        await scope.manager.handleDescription(signal.payload.sourceUserId, signal.payload.targetUserId, signal.payload.description, signal.payload.shareId,
          signal.payload.sourcePresenceSessionId, signal.payload.sourceConnectionId, signal.payload.targetPresenceSessionId, signal.payload.targetConnectionId);
      } else {
        await scope.manager.handleIceCandidate(signal.payload.sourceUserId, signal.payload.targetUserId, signal.payload.candidate,
          signal.payload.sourcePresenceSessionId, signal.payload.sourceConnectionId, signal.payload.targetPresenceSessionId, signal.payload.targetConnectionId);
      }
    };
    const flushAuthorizedSignals = (canonical: ScreenSharePublicShare | null): void => {
      if (!canonical || !isCurrent()) return;
      for (const [sourceUserId, signals] of bufferedSignals) {
        const accepted = signals.filter((signal) => signal.payload.shareId === canonical.shareId && canonical.presenterUserId === sourceUserId);
        bufferedSignals.delete(sourceUserId);
        accepted.forEach((signal) => enqueue(sourceUserId, () => dispatchBuffered(signal)));
      }
    };
    const scheduleReconnectReconcile = (): void => {
      if (delayedReconnectReconcile || !isCurrent()) return;
      delayedReconnectReconcile = setTimeout(() => {
        delayedReconnectReconcile = null;
        void reconcileActive();
      }, RECONCILE_DELAY_MS);
    };
    const scheduleBufferedReconcile = (): void => {
      if (delayedBufferedReconcile || !isCurrent()) return;
      // A buffered batch owns the sole delayed retry. Keep the initial reconnect
      // fallback from issuing a second authoritative read for the same batch.
      if (delayedReconnectReconcile) {
        clearTimeout(delayedReconnectReconcile);
        delayedReconnectReconcile = null;
      }
      delayedBufferedReconcile = setTimeout(() => {
        delayedBufferedReconcile = null;
        void reconcileActive();
      }, RECONCILE_DELAY_MS);
    };
    const reconcileActive = async (): Promise<void> => {
      if (activeRequest) return;
      const controller = new AbortController();
      activeRequest = controller;
      try {
        const response = await fetch(activeRoute(scope.spaceId, scope.presenceSessionId), { signal: controller.signal });
        const body: unknown = await response.json().catch(() => null);
        if (!isCurrent() || controller.signal.aborted) return;
        if (isTerminalAuthorizationResponse(response.status, body)) { retireForAuthorization(); return; }
        if (!response.ok) return;
        const parsed = screenShareActiveResponseSchema.safeParse(body);
        if (!parsed.success || (parsed.data.active && (parsed.data.active.companyId !== scope.companyId || parsed.data.active.spaceId !== scope.spaceId))) {
          setError('Screen-share reconciliation rejected an invalid response.');
          return;
        }
        activeShareRef.current = parsed.data.active;
        setActiveShare(parsed.data.active);
        flushAuthorizedSignals(parsed.data.active);
        if (!parsed.data.active && bufferedSignals.size > 0) {
          if (bufferedRetryUsed) bufferedSignals.clear();
          else {
            bufferedRetryUsed = true;
            scheduleBufferedReconcile();
          }
        }
      } catch (reconcileError) {
        if (isCurrent() && !controller.signal.aborted) setError(reconcileError instanceof Error ? reconcileError.message : 'Screen-share reconciliation failed.');
      } finally {
        if (activeRequest === controller) activeRequest = null;
      }
    };
    const bufferAuthorizedSignal = (signal: BufferedSignal): void => {
      const canonical = activeShareRef.current;
      if (canonical && canonical.shareId === signal.payload.shareId && canonical.presenterUserId === signal.payload.sourceUserId) {
        enqueue(signal.payload.sourceUserId, () => dispatchBuffered(signal));
        return;
      }
      if (bufferedSignals.size === 0) bufferedRetryUsed = false;
      let queue = bufferedSignals.get(signal.payload.sourceUserId);
      if (!queue) {
        if (bufferedSignals.size >= MAX_BUFFERED_SIGNAL_PEERS) return;
        queue = [];
        bufferedSignals.set(signal.payload.sourceUserId, queue);
      }
      if (queue.length >= MAX_BUFFERED_SIGNALS_PER_PEER) queue.shift();
      queue.push(signal);
      void reconcileActive();
    };
    const sendSignal: WebRTCSignalSender = async (event: SignalingEvent): Promise<void> => {
      const sendGeneration = subscriptionGeneration;
      if (!isCurrent() || !subscribed) throw new Error('SIGNALING_UNAVAILABLE');
      const base = { sourceUserId: scope.currentUserId, sourcePresenceSessionId: scope.presenceSessionId, sourceConnectionId: scope.connectionId, companyId: scope.companyId, spaceId: scope.spaceId, shareId: scope.manager.getActiveShareId() };
      const payload = event.type === 'handshake'
        ? screenShareHandshakePayloadSchema.parse({ type: 'handshake', ...base })
        : event.type === 'description'
          ? screenShareDescriptionPayloadSchema.parse({ type: 'description', ...base, targetUserId: event.targetUserId, targetPresenceSessionId: event.targetPresenceSessionId, targetConnectionId: event.targetConnectionId, description: event.description })
          : screenShareIcePayloadSchema.parse({ type: 'ice', ...base, targetUserId: event.targetUserId, targetPresenceSessionId: event.targetPresenceSessionId, targetConnectionId: event.targetConnectionId, candidate: event.candidate });
      const result = await channel.send({ type: 'broadcast', event: payload.type, payload });
      if (!isCurrent() || !subscribed || sendGeneration !== subscriptionGeneration || result !== 'ok') throw new Error('SIGNALING_SEND_FAILED');
    };

    channel
      .on('broadcast', { event: 'handshake' }, ({ payload }) => {
        const parsed = screenShareHandshakePayloadSchema.safeParse(payload);
        if (!parsed.success || !isScopePayload(parsed.data)) return;
        enqueue(parsed.data.sourceUserId, () => scope.manager.handleHandshake(parsed.data.sourceUserId, parsed.data.sourcePresenceSessionId, parsed.data.sourceConnectionId));
      })
      .on('broadcast', { event: 'description' }, ({ payload }) => {
        const parsed = screenShareDescriptionPayloadSchema.safeParse(payload);
        if (!parsed.success || !isScopePayload(parsed.data)) return;
        enqueue(parsed.data.sourceUserId, async () => {
          if (parsed.data.shareId === null) await scope.manager.handleDescription(parsed.data.sourceUserId, parsed.data.targetUserId, parsed.data.description, null, parsed.data.sourcePresenceSessionId, parsed.data.sourceConnectionId, parsed.data.targetPresenceSessionId, parsed.data.targetConnectionId);
          else bufferAuthorizedSignal({ type: 'description', payload: parsed.data });
        });
      })
      .on('broadcast', { event: 'ice' }, ({ payload }) => {
        const parsed = screenShareIcePayloadSchema.safeParse(payload);
        if (!parsed.success || !isScopePayload(parsed.data)) return;
        enqueue(parsed.data.sourceUserId, async () => {
          if (parsed.data.shareId === null) await scope.manager.handleIceCandidate(parsed.data.sourceUserId, parsed.data.targetUserId, parsed.data.candidate,
            parsed.data.sourcePresenceSessionId, parsed.data.sourceConnectionId, parsed.data.targetPresenceSessionId, parsed.data.targetConnectionId);
          else bufferAuthorizedSignal({ type: 'ice', payload: parsed.data });
        });
      })
      .on('broadcast', { event: 'presenter-invalidated' }, ({ payload }) => {
        const parsed = screenSharePresenterInvalidatedPayloadSchema.safeParse(payload);
        if (!parsed.success || !isScopePayload(parsed.data)) return;
        enqueue(parsed.data.sourceUserId, reconcileActive);
      })
      .on('presence', { event: 'sync' }, updateMutedUsers)
      .on('presence', { event: 'join' }, updateMutedUsers)
      .on('presence', { event: 'leave' }, () => { updateMutedUsers(); void reconcileActive(); });

    void supabase.realtime.setAuth(scope.accessToken).then(() => {
      if (!isCurrent()) return;
      channel.subscribe((status) => {
        if (!isCurrent()) return;
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          subscriptionGeneration += 1;
          isConnectedRef.current = true;
          scope.manager.setSignalingIdentity(scope.presenceSessionId, scope.connectionId);
          scope.manager.setSignalingChannel(channel, sendSignal);
          enqueue(scope.currentUserId, async () => {
            await channel.track({ user_id: scope.currentUserId, is_muted: isMutedRef.current });
            if (!isCurrent()) return;
            void reconcileActive();
            scheduleReconnectReconcile();
            await scope.manager.broadcastHandshake();
            await scope.manager.renegotiateExistingPeers();
          });
        } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          clearTransport();
        }
      });
    }).catch(() => { if (isCurrent()) setError('Private media signaling authentication failed.'); });

    return () => {
      cancelled = true;
      clearTransport();
      activeRequest?.abort();
      if (delayedReconnectReconcile) clearTimeout(delayedReconnectReconcile);
      if (delayedBufferedReconcile) clearTimeout(delayedBufferedReconcile);
      clearBuffers();
      if (channelRef.current === channel) channelRef.current = null;
      clearRenderedShare();
      setMutedUserIds((current) => current.size === 0 ? current : new Set());
      void supabase.removeChannel(channel).catch(() => undefined);
    };
  }, [accessToken, companyId, currentUserId, enabled, generation, onTerminalAuthorizationDenied, presenceSessionId, spaceId, webrtcManager]);

  return { isConnected: isConnectedRef.current, error, mutedUserIds, activeShare };
}
