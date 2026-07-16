'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface KnockRequestPayload {
  type: 'KNOCK_REQUEST';
  requestId: string;
  requesterId: string;
  requesterName: string;
  requesterAvatarUrl?: string;
  spaceId: string;
  timestamp: number;
}

export interface KnockResponsePayload {
  type: 'KNOCK_RESPONSE';
  requestId: string;
  decision: 'APPROVE' | 'DENY';
  responderId: string;
  responderName?: string;
  responderValidated: boolean;
  requesterId: string;
  spaceId: string;
  requesterLocationVersion?: number;
  timestamp: number;
}

type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | null;

interface PendingKnockResponse {
  requests?: Array<{
    requestId: string;
    requester: {
      id: string;
      displayName: string;
      avatarUrl: string | null;
    };
    spaceId: string;
    createdAt: string;
    expiresAt: string;
  }>;
}

interface KnockStatusResponse {
  requestId?: string;
  spaceId?: string;
  status?: string;
  decision?: 'APPROVE' | 'DENY' | null;
  responderId?: string | null;
  requesterLocationVersion?: number;
  expiresAt?: string;
  error?: string;
  code?: string;
}

interface KnockCreateResponse {
  requestId?: string;
  recipientCount?: number;
  requesterLocationVersion?: number;
  error?: string;
  code?: string;
}

const OCCUPANT_POLL_INTERVAL_MS = 5_000;
const REQUESTER_POLL_INTERVAL_MS = 2_000;

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('crypto.randomUUID is required to create a knock request');
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

export function useKnockSignaling(options: {
  occupiedSpaceId?: string | null;
  activeRequestId?: string | null;
  presenceSessionId?: string | null;
  currentUserId?: string;
  onKnockRequest?: (payload: KnockRequestPayload) => void;
  onKnockResponse?: (payload: KnockResponsePayload) => void;
}) {
  const {
    occupiedSpaceId,
    activeRequestId,
    presenceSessionId,
    currentUserId,
    onKnockRequest,
    onKnockResponse,
  } = options;
  const onKnockRequestRef = useRef(onKnockRequest);
  const onKnockResponseRef = useRef(onKnockResponse);
  const [occupiedChannelStatus, setOccupiedChannelStatus] = useState<ChannelStatus>(null);
  const [knockingChannelStatus, setKnockingChannelStatus] = useState<ChannelStatus>(null);

  useEffect(() => {
    onKnockRequestRef.current = onKnockRequest;
  }, [onKnockRequest]);

  useEffect(() => {
    onKnockResponseRef.current = onKnockResponse;
  }, [onKnockResponse]);

  useEffect(() => {
    if (!occupiedSpaceId || !currentUserId || !presenceSessionId) {
      setOccupiedChannelStatus(null);
      return;
    }

    let isActive = true;
    const seenRequestIds = new Set<string>();

    const reconcilePending = async (): Promise<void> => {
      const query = new URLSearchParams({
        spaceId: occupiedSpaceId,
        sessionId: presenceSessionId,
      });
      try {
        const response = await fetch(`/api/spaces/knock/pending?${query.toString()}`);
        const body = await readJson<PendingKnockResponse>(response);
        if (!isActive) return;

        if (!response.ok || !body) {
          setOccupiedChannelStatus('CHANNEL_ERROR');
          return;
        }

        setOccupiedChannelStatus('SUBSCRIBED');
        for (const request of body.requests ?? []) {
          if (seenRequestIds.has(request.requestId)) continue;
          seenRequestIds.add(request.requestId);
          onKnockRequestRef.current?.({
            type: 'KNOCK_REQUEST',
            requestId: request.requestId,
            requesterId: request.requester.id,
            requesterName: request.requester.displayName,
            requesterAvatarUrl: request.requester.avatarUrl ?? undefined,
            spaceId: request.spaceId,
            timestamp: Date.parse(request.createdAt),
          });
        }
      } catch {
        if (isActive) setOccupiedChannelStatus('CHANNEL_ERROR');
      }
    };

    void reconcilePending();
    const intervalId = setInterval(() => void reconcilePending(), OCCUPANT_POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [currentUserId, occupiedSpaceId, presenceSessionId]);

  useEffect(() => {
    if (!activeRequestId || !currentUserId || !presenceSessionId) {
      setKnockingChannelStatus(null);
      return;
    }

    let isActive = true;
    let deliveredTerminal = false;

    const reconcileStatus = async (): Promise<void> => {
      const query = new URLSearchParams({ sessionId: presenceSessionId });
      try {
        const response = await fetch(
          `/api/spaces/knock/status/${encodeURIComponent(activeRequestId)}?${query.toString()}`
        );
        const body = await readJson<KnockStatusResponse>(response);
        if (!isActive) return;

        if (!response.ok || !body) {
          setKnockingChannelStatus('CHANNEL_ERROR');
          return;
        }

        setKnockingChannelStatus('SUBSCRIBED');
        if (deliveredTerminal || !body.decision || !body.requestId || !body.spaceId) return;
        if (body.status !== 'approved' && body.status !== 'denied') return;

        deliveredTerminal = true;
        onKnockResponseRef.current?.({
          type: 'KNOCK_RESPONSE',
          requestId: body.requestId,
          decision: body.decision,
          responderId: body.responderId ?? '',
          responderValidated: true,
          requesterId: currentUserId,
          spaceId: body.spaceId,
          requesterLocationVersion: body.requesterLocationVersion ?? 0,
          timestamp: body.expiresAt ? Date.parse(body.expiresAt) : Date.now(),
        });
      } catch {
        if (isActive) setKnockingChannelStatus('CHANNEL_ERROR');
      }
    };

    void reconcileStatus();
    const intervalId = setInterval(() => void reconcileStatus(), REQUESTER_POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [activeRequestId, currentUserId, presenceSessionId]);

  const sendKnockRequest = useCallback(async (
    spaceId: string,
    _userProfile?: { id: string; name: string; avatarUrl?: string }
  ): Promise<{ requestId: string; recipientCount: number; requesterLocationVersion: number }> => {
    if (!presenceSessionId) {
      throw new Error('Presence is still connecting. Please try again in a moment.');
    }

    const requestId = createRequestId();
    const response = await fetch('/api/spaces/knock/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, requestId, sessionId: presenceSessionId }),
    });
    const body = await readJson<KnockCreateResponse>(response);

    if (!response.ok) {
      if (response.status === 409 && body?.code === 'KNOCK_ALREADY_PENDING' && body.requestId) {
        return {
          requestId: body.requestId,
          recipientCount: body.recipientCount ?? 0,
          requesterLocationVersion: body.requesterLocationVersion ?? 0,
        };
      }
      throw new Error(body?.error ?? 'Failed to send knock request');
    }

    if (!body?.requestId) throw new Error('Knock request did not return an id');
    return {
      requestId: body.requestId,
      recipientCount: body.recipientCount ?? 0,
      requesterLocationVersion: body.requesterLocationVersion ?? 0,
    };
  }, [presenceSessionId]);

  const respondToKnock = useCallback(async (input: {
    spaceId: string;
    requestId: string;
    requesterId: string;
    requesterName: string;
    decision: 'APPROVE' | 'DENY';
  }): Promise<Record<string, unknown>> => {
    if (!presenceSessionId) {
      throw new Error('Presence is still connecting. Please try again in a moment.');
    }

    const response = await fetch('/api/spaces/knock/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: presenceSessionId,
        requestId: input.requestId,
        decision: input.decision,
      }),
    });
    const body = await readJson<Record<string, unknown> & { error?: string }>(response);
    if (!response.ok) throw new Error(body?.error ?? 'Failed to send knock response');
    return body ?? {};
  }, [presenceSessionId]);

  return {
    sendKnockRequest,
    respondToKnock,
    occupiedChannelStatus,
    knockingChannelStatus,
  };
}

export default useKnockSignaling;
