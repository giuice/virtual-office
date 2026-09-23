'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client';
import {
  screenShareActiveResponseSchema,
  screenShareDescriptionPayloadSchema,
  screenShareHandshakePayloadSchema,
  screenShareIcePayloadSchema,
  screenShareMediaTopic,
  screenSharePresenterHintPayloadSchema,
  screenSharePresenterInvalidatedPayloadSchema,
  screenSharePublicErrorSchema,
  screenShareSignalRequestSchema,
  type ScreenSharePublicShare,
} from '@/lib/webrtc/screen-share-contract';
import { sendScreenShareSignalRequest } from '@/lib/webrtc/screen-share-signal-client';
import { WebRTCManager, type SignalingEvent, type WebRTCSignalSender } from '@/lib/webrtc';

const MAX_BUFFERED_SIGNALS_PER_PEER = 32;
const MAX_BUFFERED_SIGNAL_PEERS = 64;
const MAX_INBOUND_SIGNALS_PER_SOURCE = 32;
const MAX_INBOUND_SIGNAL_SOURCES = 64;
const MAX_INBOUND_SIGNALS_TOTAL = 256;
const RECONCILE_DELAY_MS = 1_000;
const AUTHORITATIVE_RECONCILE_INTERVAL_MS = 10_000;

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
  onSignalDelivered?: () => void;
}

interface AudioPresenceState { [key: string]: Array<{ user_id?: string; is_muted?: boolean }>; }
interface SignalingState {
  isConnected: boolean;
  error: string | null;
  mutedUserIds: Set<string>;
  activeShare: ScreenSharePublicShare | null;
  activeShareObservationVersion: number;
  getActiveShareReadVersion: () => number;
}
interface ScopedSignalingInput {
  companyId: string; spaceId: string; currentUserId: string; presenceSessionId: string;
  accessToken: string; generation: string | number; manager: WebRTCManager; connectionId: string;
}
interface OwnedChannelScope {
  channel: RealtimeChannel;
  manager: WebRTCManager;
  companyId: string;
  spaceId: string;
  currentUserId: string;
  presenceSessionId: string;
  accessToken: string;
  generation: string | number;
  connectionId: string;
}
type BufferedSignal =
  | { type: 'description'; payload: { sourceUserId: string; sourcePresenceSessionId: string; sourceConnectionId: string; targetUserId: string; targetPresenceSessionId: string; targetConnectionId: string; shareId: string | null; description: RTCSessionDescriptionInit } }
  | { type: 'ice'; payload: { sourceUserId: string; sourcePresenceSessionId: string; sourceConnectionId: string; targetUserId: string; targetPresenceSessionId: string; targetConnectionId: string; shareId: string | null; candidate: RTCIceCandidateInit } };

class MediaSignalingError extends Error {
  readonly code: 'SIGNALING_UNAVAILABLE' | 'SIGNALING_SEND_FAILED';
  readonly deliveryStatus?: string;

  constructor(code: 'SIGNALING_UNAVAILABLE' | 'SIGNALING_SEND_FAILED', deliveryStatus?: string) {
    super(code);
    this.name = 'MediaSignalingError';
    this.code = code;
    this.deliveryStatus = deliveryStatus;
  }
}

function activeRoute(spaceId: string, presenceSessionId: string): string {
  return `/api/spaces/${encodeURIComponent(spaceId)}/screen-share/active?${new URLSearchParams({ presenceSessionId }).toString()}`;
}

function createConnectionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  throw new Error('crypto.randomUUID is required for media signaling identity');
}

type ActiveReadErrorDisposition = 'viewer-terminal' | 'presenter-invalid' | 'other';

function classifyActiveReadError(status: number, body: unknown): ActiveReadErrorDisposition {
  if (status === 401 || status === 403) return 'viewer-terminal';
  const parsed = screenSharePublicErrorSchema.safeParse(body);
  if (!parsed.success) return 'other';
  if (parsed.data.code === 'PRESENTER_PROFILE_INVALID') return 'presenter-invalid';
  return [
    'UNAUTHORIZED',
    'ACCESS_DENIED',
    'SESSION_INVALID',
    'MEMBERSHIP_SCOPE_INVALID',
    'SPACE_NOT_FOUND',
    'SPACE_UNAVAILABLE',
  ].includes(parsed.data.code)
    ? 'viewer-terminal'
    : 'other';
}

export function useAudioSignaling(options: UseAudioSignalingOptions): SignalingState {
  const { companyId, spaceId, currentUserId, presenceSessionId, accessToken, generation, webrtcManager, enabled = true, isMuted, onTerminalAuthorizationDenied, onSignalDelivered } = options;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const channelScopeRef = useRef<OwnedChannelScope | null>(null);
  const scopeGenerationRef = useRef<string | number>(generation);
  const isConnectedRef = useRef(false);
  const isMutedRef = useRef(isMuted);
  const activeShareRef = useRef<ScreenSharePublicShare | null>(null);
  const activeShareReadVersionRef = useRef(0);
  const onTerminalAuthorizationDeniedRef = useRef(onTerminalAuthorizationDenied);
  const onSignalDeliveredRef = useRef(onSignalDelivered);
  const [isConnected, setIsConnected] = useState(false);
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());
  const [activeShare, setActiveShare] = useState<ScreenSharePublicShare | null>(null);
  const [activeShareObservationVersion, setActiveShareObservationVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const getActiveShareReadVersion = useCallback(() => activeShareReadVersionRef.current, []);

  scopeGenerationRef.current = generation;
  isMutedRef.current = isMuted;
  onTerminalAuthorizationDeniedRef.current = onTerminalAuthorizationDenied;
  onSignalDeliveredRef.current = onSignalDelivered;

  useEffect(() => {
    const owned = channelScopeRef.current;
    if (
      !owned
      || !isConnectedRef.current
      || owned.channel !== channelRef.current
      || owned.companyId !== companyId
      || owned.spaceId !== spaceId
      || owned.currentUserId !== currentUserId
      || owned.presenceSessionId !== presenceSessionId
      || owned.accessToken !== accessToken
      || owned.generation !== generation
    ) return;
    void owned.channel.track({ user_id: owned.currentUserId, is_muted: isMutedRef.current }).catch(() => undefined);
  }, [accessToken, companyId, currentUserId, generation, isMuted, presenceSessionId, spaceId]);

  useEffect(() => {
    const clearRenderedShare = (): void => { activeShareRef.current = null; setActiveShare(null); };
    if (!enabled || !companyId || !spaceId || !currentUserId || !presenceSessionId || !accessToken || !webrtcManager) {
      clearRenderedShare();
      activeShareReadVersionRef.current = 0;
      setActiveShareObservationVersion(0);
      setMutedUserIds((current) => current.size === 0 ? current : new Set());
      isConnectedRef.current = false;
      setIsConnected(false);
      setError(null);
      return;
    }

    // Scope replacement is a security boundary: clear synchronously before any
    // subscription, fetch, removal, or callback from an earlier scope can settle.
    clearRenderedShare();
    activeShareReadVersionRef.current = 0;
    setActiveShareObservationVersion(0);
    setMutedUserIds((current) => current.size === 0 ? current : new Set());
    setError(null);
    const scope: ScopedSignalingInput = {
      companyId, spaceId, currentUserId, presenceSessionId, accessToken, generation,
      manager: webrtcManager, connectionId: createConnectionId(),
    };
    const supabase = createSupabaseBrowserClient();
    const topic = screenShareMediaTopic(scope.companyId, scope.spaceId);
    const channel = supabase.channel(topic, {
      config: { private: true, broadcast: { self: true, ack: true }, presence: { key: `${scope.currentUserId}:${scope.presenceSessionId}` } },
    });
    let cancelled = false;
    let retired = false;
    let subscribed = false;
    let activeRequest: AbortController | null = null;
    let delayedReconnectReconcile: ReturnType<typeof setTimeout> | null = null;
    let delayedBufferedReconcile: ReturnType<typeof setTimeout> | null = null;
    let periodicReconcileTimer: ReturnType<typeof setTimeout> | null = null;
    let bufferedRetryUsed = false;
    let subscriptionGeneration = 0;
    let removalStarted = false;
    const inboundQueues = new Map<string, Promise<void>>();
    const inboundPendingCounts = new Map<string, number>();
    let inboundPendingTotal = 0;
    const bufferedSignals = new Map<string, BufferedSignal[]>();
    channelRef.current = channel;
    channelScopeRef.current = {
      channel,
      manager: scope.manager,
      companyId: scope.companyId,
      spaceId: scope.spaceId,
      currentUserId: scope.currentUserId,
      presenceSessionId: scope.presenceSessionId,
      accessToken: scope.accessToken,
      generation: scope.generation,
      connectionId: scope.connectionId,
    };

    const isCurrent = (): boolean => {
      const owned = channelScopeRef.current;
      return (
        !cancelled
        && !retired
        && channelRef.current === channel
        && scopeGenerationRef.current === scope.generation
        && owned?.channel === channel
        && owned.manager === scope.manager
        && owned.companyId === scope.companyId
        && owned.spaceId === scope.spaceId
        && owned.currentUserId === scope.currentUserId
        && owned.presenceSessionId === scope.presenceSessionId
        && owned.accessToken === scope.accessToken
        && owned.generation === scope.generation
        && owned.connectionId === scope.connectionId
      );
    };
    const isSubscriptionCurrent = (expectedSubscriptionGeneration: number): boolean => (
      isCurrent()
      && subscribed
      && subscriptionGeneration === expectedSubscriptionGeneration
    );
    const clearBuffers = (): void => {
      bufferedSignals.clear();
      inboundQueues.clear();
      inboundPendingCounts.clear();
      inboundPendingTotal = 0;
    };
    const clearOwnedReconciliation = (): void => {
      activeRequest?.abort();
      activeRequest = null;
      if (delayedReconnectReconcile) {
        clearTimeout(delayedReconnectReconcile);
        delayedReconnectReconcile = null;
      }
      if (delayedBufferedReconcile) {
        clearTimeout(delayedBufferedReconcile);
        delayedBufferedReconcile = null;
      }
      if (periodicReconcileTimer) {
        clearTimeout(periodicReconcileTimer);
        periodicReconcileTimer = null;
      }
    };
    const clearTransport = (): void => {
      subscribed = false;
      subscriptionGeneration += 1;
      clearOwnedReconciliation();
      if (channelRef.current === channel) {
        isConnectedRef.current = false;
        setIsConnected(false);
        scope.manager.setSignalingChannel(null);
      }
    };
    const removeOwnedChannel = (): void => {
      if (removalStarted) return;
      removalStarted = true;
      void supabase.removeChannel(channel).catch(() => undefined);
    };
    const retireForAuthorization = (): void => {
      if (!isCurrent()) return;
      retired = true;
      clearTransport();
      clearBuffers();
      clearRenderedShare();
      setMutedUserIds((current) => current.size === 0 ? current : new Set());
      if (channelRef.current === channel) channelRef.current = null;
      if (channelScopeRef.current?.channel === channel) channelScopeRef.current = null;
      // The provider owns the visual lifecycle; standalone consumers still clean up.
      if (onTerminalAuthorizationDeniedRef.current) onTerminalAuthorizationDeniedRef.current();
      else scope.manager.cleanup();
      removeOwnedChannel();
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
    const discardBufferedDisplayForShare = (canonical: ScreenSharePublicShare): void => {
      const signals = bufferedSignals.get(canonical.presenterUserId);
      if (!signals) return;
      const retained = signals.filter((signal) => signal.payload.shareId !== canonical.shareId);
      if (retained.length === 0) bufferedSignals.delete(canonical.presenterUserId);
      else bufferedSignals.set(canonical.presenterUserId, retained);
    };
    const scheduleReconnectReconcile = (expectedSubscriptionGeneration: number): void => {
      if (delayedReconnectReconcile || !isSubscriptionCurrent(expectedSubscriptionGeneration)) return;
      delayedReconnectReconcile = setTimeout(() => {
        delayedReconnectReconcile = null;
        void reconcileActive(expectedSubscriptionGeneration);
      }, RECONCILE_DELAY_MS);
    };
    const scheduleBufferedReconcile = (expectedSubscriptionGeneration: number): void => {
      if (delayedBufferedReconcile || !isSubscriptionCurrent(expectedSubscriptionGeneration)) return;
      // A buffered batch owns the sole delayed retry. Keep the initial reconnect
      // fallback from issuing a second authoritative read for the same batch.
      if (delayedReconnectReconcile) {
        clearTimeout(delayedReconnectReconcile);
        delayedReconnectReconcile = null;
      }
      delayedBufferedReconcile = setTimeout(() => {
        delayedBufferedReconcile = null;
        void reconcileActive(expectedSubscriptionGeneration);
      }, RECONCILE_DELAY_MS);
    };
    const schedulePeriodicReconcile = (expectedSubscriptionGeneration: number): void => {
      if (periodicReconcileTimer) {
        clearTimeout(periodicReconcileTimer);
        periodicReconcileTimer = null;
      }
      if (!isSubscriptionCurrent(expectedSubscriptionGeneration)) return;
      periodicReconcileTimer = setTimeout(() => {
        periodicReconcileTimer = null;
        if (!isSubscriptionCurrent(expectedSubscriptionGeneration)) return;
        void reconcileActive(expectedSubscriptionGeneration);
        schedulePeriodicReconcile(expectedSubscriptionGeneration);
      }, AUTHORITATIVE_RECONCILE_INTERVAL_MS);
    };
    const reconcileActive = async (expectedSubscriptionGeneration: number): Promise<void> => {
      if (!isSubscriptionCurrent(expectedSubscriptionGeneration) || activeRequest) return;
      const readVersion = activeShareReadVersionRef.current + 1;
      activeShareReadVersionRef.current = readVersion;
      const controller = new AbortController();
      activeRequest = controller;
      try {
        if (!isSubscriptionCurrent(expectedSubscriptionGeneration)) return;
        const response = await fetch(activeRoute(scope.spaceId, scope.presenceSessionId), { signal: controller.signal });
        const body: unknown = await response.json().catch(() => null);
        if (!isSubscriptionCurrent(expectedSubscriptionGeneration) || controller.signal.aborted) return;
        const errorDisposition = classifyActiveReadError(response.status, body);
        if (errorDisposition === 'viewer-terminal') {
          retireForAuthorization();
          return;
        }
        if (errorDisposition === 'presenter-invalid') {
          const canonical = activeShareRef.current;
          if (canonical) discardBufferedDisplayForShare(canonical);
          activeShareRef.current = null;
          setActiveShare(null);
          setActiveShareObservationVersion(readVersion);
          return;
        }
        if (!response.ok) return;
        const parsed = screenShareActiveResponseSchema.safeParse(body);
        if (!isSubscriptionCurrent(expectedSubscriptionGeneration) || controller.signal.aborted) return;
        if (!parsed.success || (parsed.data.active && (parsed.data.active.companyId !== scope.companyId || parsed.data.active.spaceId !== scope.spaceId))) {
          setError('Screen-share reconciliation rejected an invalid response.');
          return;
        }
        activeShareRef.current = parsed.data.active;
        setActiveShare(parsed.data.active);
        setActiveShareObservationVersion(readVersion);
        flushAuthorizedSignals(parsed.data.active);
        if (!parsed.data.active && bufferedSignals.size > 0) {
          if (bufferedRetryUsed) bufferedSignals.clear();
          else {
            bufferedRetryUsed = true;
            scheduleBufferedReconcile(expectedSubscriptionGeneration);
          }
        }
      } catch (reconcileError) {
        if (isSubscriptionCurrent(expectedSubscriptionGeneration) && !controller.signal.aborted) {
          setError(reconcileError instanceof Error ? reconcileError.message : 'Screen-share reconciliation failed.');
        }
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
      void reconcileActive(subscriptionGeneration);
    };
    const sendSignal: WebRTCSignalSender = async (event: SignalingEvent): Promise<void> => {
      const sendGeneration = subscriptionGeneration;
      if (!isCurrent() || !subscribed) throw new MediaSignalingError('SIGNALING_UNAVAILABLE');
      const base = {
        presenceSessionId: scope.presenceSessionId,
        connectionId: scope.connectionId,
        shareId: scope.manager.getActiveShareId(),
      };
      const payload = event.type === 'handshake'
        ? { type: 'handshake' as const, ...base }
        : event.type === 'description'
          ? { type: 'description' as const, ...base, targetUserId: event.targetUserId, targetPresenceSessionId: event.targetPresenceSessionId, targetConnectionId: event.targetConnectionId, description: event.description }
          : { type: 'ice' as const, ...base, targetUserId: event.targetUserId, targetPresenceSessionId: event.targetPresenceSessionId, targetConnectionId: event.targetConnectionId, candidate: event.candidate };
      try {
        await sendScreenShareSignalRequest(
          scope.spaceId,
          screenShareSignalRequestSchema.parse(payload),
        );
      } catch (error) {
        if (isCurrent()) setError('SIGNALING_SEND_FAILED');
        throw new MediaSignalingError(
          'SIGNALING_SEND_FAILED',
          error instanceof Error ? error.message : undefined,
        );
      }
      if (!isCurrent() || !subscribed || sendGeneration !== subscriptionGeneration) {
        throw new MediaSignalingError('SIGNALING_UNAVAILABLE');
      }
      setError((current) => current === 'SIGNALING_SEND_FAILED' ? null : current);
      onSignalDeliveredRef.current?.();
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
        if (!parsed.success) return;
        const sameUserInvalidation = parsed.data.sourceUserId === scope.currentUserId;
        const exactSelfInvalidation = (
          isCurrent()
          && sameUserInvalidation
          && parsed.data.sourcePresenceSessionId === scope.presenceSessionId
          && parsed.data.sourceConnectionId === scope.connectionId
          && parsed.data.companyId === scope.companyId
          && parsed.data.spaceId === scope.spaceId
        );
        const distinctSameUserSessionInvalidation = (
          isCurrent()
          && sameUserInvalidation
          && parsed.data.sourcePresenceSessionId !== scope.presenceSessionId
          && parsed.data.sourceConnectionId !== scope.connectionId
          && parsed.data.companyId === scope.companyId
          && parsed.data.spaceId === scope.spaceId
        );
        if (
          !exactSelfInvalidation
          && !distinctSameUserSessionInvalidation
          && !isScopePayload(parsed.data)
        ) return;
        const canonical = activeShareRef.current;
        if (
          !canonical
          || canonical.shareId !== parsed.data.shareId
          || canonical.presenterUserId !== parsed.data.sourceUserId
        ) return;
        const expectedSubscriptionGeneration = subscriptionGeneration;
        enqueue(parsed.data.sourceUserId, () => reconcileActive(expectedSubscriptionGeneration));
      })
      .on('broadcast', { event: 'presenter-hint' }, ({ payload }) => {
        const parsed = screenSharePresenterHintPayloadSchema.safeParse(payload);
        if (!parsed.success || !isScopePayload(parsed.data)) return;
        const expectedSubscriptionGeneration = subscriptionGeneration;
        enqueue(parsed.data.sourceUserId, () => reconcileActive(expectedSubscriptionGeneration));
      })
      .on('presence', { event: 'sync' }, updateMutedUsers)
      .on('presence', { event: 'join' }, updateMutedUsers)
      .on('presence', { event: 'leave' }, () => {
        updateMutedUsers();
        void reconcileActive(subscriptionGeneration);
      });

    void supabase.realtime.setAuth(scope.accessToken).then(() => {
      if (!isCurrent()) return;
      channel.subscribe((status) => {
        if (!isCurrent()) return;
        if (status === 'SUBSCRIBED') {
          clearOwnedReconciliation();
          subscribed = true;
          subscriptionGeneration += 1;
          const expectedSubscriptionGeneration = subscriptionGeneration;
          isConnectedRef.current = true;
          setIsConnected(true);
          scope.manager.setSignalingIdentity(scope.presenceSessionId, scope.connectionId);
          scope.manager.setSignalingChannel(channel, sendSignal);
          enqueue(scope.currentUserId, async () => {
            await channel.track({ user_id: scope.currentUserId, is_muted: isMutedRef.current });
            if (!isSubscriptionCurrent(expectedSubscriptionGeneration)) return;
            void reconcileActive(expectedSubscriptionGeneration);
            scheduleReconnectReconcile(expectedSubscriptionGeneration);
            schedulePeriodicReconcile(expectedSubscriptionGeneration);
            await scope.manager.broadcastHandshake();
            if (!isSubscriptionCurrent(expectedSubscriptionGeneration)) return;
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
      clearBuffers();
      if (channelRef.current === channel) channelRef.current = null;
      if (channelScopeRef.current?.channel === channel) channelScopeRef.current = null;
      clearRenderedShare();
      setMutedUserIds((current) => current.size === 0 ? current : new Set());
      removeOwnedChannel();
    };
  }, [accessToken, companyId, currentUserId, enabled, generation, presenceSessionId, spaceId, webrtcManager]);

  return {
    isConnected,
    error,
    mutedUserIds,
    activeShare,
    activeShareObservationVersion,
    getActiveShareReadVersion,
  };
}
