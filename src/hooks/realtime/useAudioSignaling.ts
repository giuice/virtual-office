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
  type ScreenSharePublicShare,
} from '@/lib/webrtc/screen-share-contract';
import { WebRTCManager, type SignalingEvent, type WebRTCSignalSender } from '@/lib/webrtc';

interface UseAudioSignalingOptions {
  companyId: string | undefined;
  spaceId: string | undefined;
  currentUserId: string | undefined;
  presenceSessionId: string | null | undefined;
  generation: string | number;
  webrtcManager: WebRTCManager | null;
  enabled?: boolean;
  isMuted: boolean;
}

interface AudioPresenceState {
  [key: string]: Array<{
    user_id?: string;
    is_muted?: boolean;
  }>;
}

interface SignalingState {
  isConnected: boolean;
  error: string | null;
  mutedUserIds: Set<string>;
  activeShare: ScreenSharePublicShare | null;
}

interface ScopedSignalingInput {
  companyId: string;
  spaceId: string;
  currentUserId: string;
  presenceSessionId: string;
  generation: string | number;
  manager: WebRTCManager;
}

function activeRoute(spaceId: string, presenceSessionId: string): string {
  const query = new URLSearchParams({ presenceSessionId });
  return `/api/spaces/${encodeURIComponent(spaceId)}/screen-share/active?${query.toString()}`;
}

export function useAudioSignaling(options: UseAudioSignalingOptions): SignalingState {
  const {
    companyId,
    spaceId,
    currentUserId,
    presenceSessionId,
    generation,
    webrtcManager,
    enabled = true,
    isMuted,
  } = options;
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
    if (!enabled || !companyId || !spaceId || !currentUserId || !presenceSessionId || !webrtcManager) {
      activeShareRef.current = null;
      setActiveShare(null);
      setMutedUserIds(new Set());
      return;
    }

    const scope: ScopedSignalingInput = {
      companyId,
      spaceId,
      currentUserId,
      presenceSessionId,
      generation,
      manager: webrtcManager,
    };
    const supabase = createSupabaseBrowserClient();
    const topic = `company:${scope.companyId}:space:${scope.spaceId}:media`;
    const channel = supabase.channel(topic, {
      config: {
        private: true,
        broadcast: { self: false, ack: true },
        presence: { key: `${scope.currentUserId}:${scope.presenceSessionId}` },
      },
    });
    let cancelled = false;
    let subscribed = false;
    let activeRequest: AbortController | null = null;
    channelRef.current = channel;

    const isCurrent = (): boolean => (
      !cancelled &&
      channelRef.current === channel &&
      scopeGenerationRef.current === scope.generation
    );
    const isScopePayload = (payload: {
      sourceUserId: string;
      companyId: string;
      spaceId: string;
      targetUserId?: string;
      shareId: string | null;
    }, allowUnverifiedShare = false): boolean => (
      isCurrent() &&
      payload.sourceUserId !== scope.currentUserId &&
      payload.companyId === scope.companyId &&
      payload.spaceId === scope.spaceId &&
      (payload.targetUserId === undefined || payload.targetUserId === scope.currentUserId) &&
      (allowUnverifiedShare || payload.shareId === null || payload.shareId === activeShareRef.current?.shareId)
    );
    const updateMutedUsers = (): void => {
      if (!isCurrent()) return;
      const muted = new Set<string>();
      const state = channel.presenceState() as AudioPresenceState;
      Object.values(state).forEach((presences) => {
        presences.forEach((presence) => {
          if (presence.user_id && presence.is_muted) muted.add(presence.user_id);
        });
      });
      setMutedUserIds(muted);
    };
    const reconcileActive = async (): Promise<void> => {
      activeRequest?.abort();
      const controller = new AbortController();
      activeRequest = controller;
      try {
        const response = await fetch(activeRoute(scope.spaceId, scope.presenceSessionId), { signal: controller.signal });
        const body: unknown = await response.json().catch(() => null);
        if (!isCurrent() || controller.signal.aborted || !response.ok) return;
        const parsed = screenShareActiveResponseSchema.safeParse(body);
        if (!parsed.success || (parsed.data.active && (
          parsed.data.active.companyId !== scope.companyId ||
          parsed.data.active.spaceId !== scope.spaceId
        ))) {
          setError('Screen-share reconciliation rejected an invalid response.');
          return;
        }
        activeShareRef.current = parsed.data.active;
        setActiveShare(parsed.data.active);
      } catch (reconcileError) {
        if (isCurrent() && !controller.signal.aborted) {
          setError(reconcileError instanceof Error ? reconcileError.message : 'Screen-share reconciliation failed.');
        }
      }
    };
    const sendSignal: WebRTCSignalSender = async (event: SignalingEvent): Promise<void> => {
      if (!isCurrent() || !subscribed) return;
      const base = {
        sourceUserId: scope.currentUserId,
        companyId: scope.companyId,
        spaceId: scope.spaceId,
        shareId: scope.manager.getActiveShareId(),
      };
      const payload = event.type === 'handshake'
        ? screenShareHandshakePayloadSchema.parse({ type: 'handshake', ...base })
        : event.type === 'description'
          ? screenShareDescriptionPayloadSchema.parse({
            type: 'description',
            ...base,
            targetUserId: event.targetUserId,
            description: event.description,
          })
          : screenShareIcePayloadSchema.parse({
            type: 'ice',
            ...base,
            targetUserId: event.targetUserId,
            candidate: event.candidate,
          });
      await channel.send({ type: 'broadcast', event: payload.type, payload });
    };
    const runCurrent = (handler: () => Promise<void>): void => {
      if (!isCurrent()) return;
      void handler().catch((handlerError: unknown) => {
        if (isCurrent()) setError(handlerError instanceof Error ? handlerError.message : 'Media signaling failed.');
      });
    };

    channel
      .on('broadcast', { event: 'handshake' }, ({ payload }) => {
        const parsed = screenShareHandshakePayloadSchema.safeParse(payload);
        if (!parsed.success || !isScopePayload(parsed.data)) return;
        runCurrent(() => scope.manager.handleHandshake(parsed.data.sourceUserId));
      })
      .on('broadcast', { event: 'description' }, ({ payload }) => {
        const parsed = screenShareDescriptionPayloadSchema.safeParse(payload);
        if (!parsed.success || !isScopePayload(parsed.data)) return;
        runCurrent(() => scope.manager.handleDescription(
          parsed.data.sourceUserId,
          parsed.data.targetUserId,
          parsed.data.description,
          parsed.data.shareId,
        ));
      })
      .on('broadcast', { event: 'ice' }, ({ payload }) => {
        const parsed = screenShareIcePayloadSchema.safeParse(payload);
        if (!parsed.success || !isScopePayload(parsed.data)) return;
        runCurrent(() => scope.manager.handleIceCandidate(
          parsed.data.sourceUserId,
          parsed.data.targetUserId,
          parsed.data.candidate,
        ));
      })
      .on('broadcast', { event: 'presenter-invalidated' }, ({ payload }) => {
        const parsed = screenSharePresenterInvalidatedPayloadSchema.safeParse(payload);
        if (!parsed.success || !isScopePayload(parsed.data, true)) return;
        runCurrent(reconcileActive);
      })
      .on('presence', { event: 'sync' }, updateMutedUsers)
      .on('presence', { event: 'join' }, updateMutedUsers)
      .on('presence', { event: 'leave' }, () => {
        updateMutedUsers();
        runCurrent(reconcileActive);
      });

    void supabase.realtime.setAuth().then(() => {
      if (isCurrent()) {
        channel.subscribe((status) => {
          if (!isCurrent()) return;
          if (status === 'SUBSCRIBED') {
            subscribed = true;
            isConnectedRef.current = true;
            scope.manager.setSignalingChannel(channel, sendSignal);
            runCurrent(async () => {
              await channel.track({ user_id: scope.currentUserId, is_muted: isMutedRef.current });
              if (!isCurrent()) return;
              void reconcileActive();
              await scope.manager.broadcastHandshake();
            });
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            subscribed = false;
            isConnectedRef.current = false;
          }
        });
      }
    }).catch(() => {
      if (isCurrent()) setError('Private media signaling authentication failed.');
    });

    return () => {
      cancelled = true;
      subscribed = false;
      activeRequest?.abort();
      if (channelRef.current === channel) {
        channelRef.current = null;
        isConnectedRef.current = false;
        scope.manager.setSignalingChannel(null);
      }
      void supabase.removeChannel(channel).catch(() => undefined);
    };
  }, [companyId, currentUserId, enabled, generation, presenceSessionId, spaceId, webrtcManager]);

  return {
    isConnected: isConnectedRef.current,
    error,
    mutedUserIds,
    activeShare,
  };
}
