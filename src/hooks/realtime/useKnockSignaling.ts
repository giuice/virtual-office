// src/hooks/realtime/useKnockSignaling.ts
// Story 3.16: Knock to Enter Workflow - Realtime Signaling
// Uses postgres_changes on knock_requests table (reliable, same mechanism as presence)
'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js';

/**
 * Payload for a KNOCK_REQUEST broadcast message.
 */
export interface KnockRequestPayload {
	type: 'KNOCK_REQUEST';
	requestId: string;
	requesterId: string;
	requesterName: string;
	requesterAvatarUrl?: string;
	spaceId: string;
	timestamp: number;
}

/**
 * Payload for a KNOCK_RESPONSE broadcast message.
 */
export interface KnockResponsePayload {
	type: 'KNOCK_RESPONSE';
	requestId: string;
	decision: 'APPROVE' | 'DENY';
	responderId: string;
	responderName?: string;
	responderValidated: boolean;
	requesterId: string;
	spaceId: string;
	timestamp: number;
}

export type KnockPayload = KnockRequestPayload | KnockResponsePayload;

/**
 * Callback type for incoming knock requests (for occupants).
 */
export type OnKnockRequestCallback = (payload: KnockRequestPayload) => void;

/**
 * Callback type for incoming knock responses (for requester).
 */
export type OnKnockResponseCallback = (payload: KnockResponsePayload) => void;

type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CHANNEL_ERROR' | 'CLOSED' | 'SUBSCRIBING' | null;

/** Shape of a knock_requests row from postgres_changes */
interface KnockRequestRow {
	id: string;
	space_id: string;
	requester_id: string;
	requester_name: string;
	requester_avatar_url: string | null;
	responder_id: string | null;
	responder_name: string | null;
	decision: 'APPROVE' | 'DENY' | null;
	status: string;
	created_at: string;
	updated_at: string;
}

function createRequestId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `knock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * useKnockSignaling - Handles realtime knock signaling via postgres_changes.
 *
 * Uses the knock_requests table + postgres_changes listeners instead of
 * broadcast channels (which were unreliable/TIMED_OUT in this environment).
 * This uses the same proven mechanism as presence tracking.
 */
export function useKnockSignaling(options: {
	/** The space ID the current user occupies (for receiving knock requests). */
	occupiedSpaceId?: string | null;
	/** The space ID the current user is knocking on (for receiving responses). */
	knockingSpaceId?: string | null;
	/** Current user's ID. */
	currentUserId?: string;
	/** Callback when a knock request is received (if user is an occupant). */
	onKnockRequest?: OnKnockRequestCallback;
	/** Callback when a knock response is received (if user is the requester). */
	onKnockResponse?: OnKnockResponseCallback;
}) {
	const {
		occupiedSpaceId,
		knockingSpaceId,
		currentUserId,
		onKnockRequest,
		onKnockResponse,
	} = options;

	const occupiedChannelRef = useRef<RealtimeChannel | null>(null);
	const knockingChannelRef = useRef<RealtimeChannel | null>(null);
	const onKnockRequestRef = useRef<OnKnockRequestCallback | undefined>(onKnockRequest);
	const onKnockResponseRef = useRef<OnKnockResponseCallback | undefined>(onKnockResponse);
	const [occupiedChannelStatus, setOccupiedChannelStatus] = useState<ChannelStatus>(null);
	const [knockingChannelStatus, setKnockingChannelStatus] = useState<ChannelStatus>(null);

	useEffect(() => {
		onKnockRequestRef.current = onKnockRequest;
	}, [onKnockRequest]);

	useEffect(() => {
		onKnockResponseRef.current = onKnockResponse;
	}, [onKnockResponse]);

	// Subscribe to INSERT events on knock_requests for the occupied space (occupant receives knocks)
	useEffect(() => {
		if (!occupiedSpaceId || !currentUserId) {
			if (occupiedChannelRef.current) {
				supabase.removeChannel(occupiedChannelRef.current);
				occupiedChannelRef.current = null;
			}
			setOccupiedChannelStatus(null);
			return;
		}

		const channel = supabase.channel(`knock-occupied:${occupiedSpaceId}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'knock_requests',
					filter: `space_id=eq.${occupiedSpaceId}`,
				},
				(payload: RealtimePostgresInsertPayload<KnockRequestRow>) => {
					const row = payload.new;
					// Ignore our own knock requests
					if (row.requester_id === currentUserId) return;

					onKnockRequestRef.current?.({
						type: 'KNOCK_REQUEST',
						requestId: row.id,
						requesterId: row.requester_id,
						requesterName: row.requester_name,
						requesterAvatarUrl: row.requester_avatar_url ?? undefined,
						spaceId: row.space_id,
						timestamp: new Date(row.created_at).getTime(),
					});
				}
			);

		occupiedChannelRef.current = channel;
		let isActive = true;

		channel.subscribe((status) => {
			if (!isActive) return;
			setOccupiedChannelStatus(status as ChannelStatus);
			if (process.env.NODE_ENV === 'development') {
				console.log(`[KnockSignaling] Occupied channel (${occupiedSpaceId}) status:`, status);
			}
		});

		return () => {
			isActive = false;
			supabase.removeChannel(channel);
			occupiedChannelRef.current = null;
			setOccupiedChannelStatus(null);
		};
	}, [occupiedSpaceId, currentUserId]);

	// Subscribe to UPDATE events on knock_requests for our requests (knocker receives responses)
	useEffect(() => {
		if (!knockingSpaceId || !currentUserId) {
			if (knockingChannelRef.current) {
				supabase.removeChannel(knockingChannelRef.current);
				knockingChannelRef.current = null;
			}
			setKnockingChannelStatus(null);
			return;
		}

		const channel = supabase.channel(`knock-response:${currentUserId}:${knockingSpaceId}`)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'knock_requests',
					filter: `requester_id=eq.${currentUserId}`,
				},
				(payload: RealtimePostgresUpdatePayload<KnockRequestRow>) => {
					const row = payload.new;
					// Only process rows with a decision for the space we're knocking on
					if (!row.decision || row.space_id !== knockingSpaceId) return;

					onKnockResponseRef.current?.({
						type: 'KNOCK_RESPONSE',
						requestId: row.id,
						decision: row.decision,
						responderId: row.responder_id ?? '',
						responderName: row.responder_name ?? undefined,
						responderValidated: true,
						requesterId: row.requester_id,
						spaceId: row.space_id,
						timestamp: new Date(row.updated_at).getTime(),
					});
				}
			);

		knockingChannelRef.current = channel;
		let isActive = true;

		channel.subscribe((status) => {
			if (!isActive) return;
			setKnockingChannelStatus(status as ChannelStatus);
			if (process.env.NODE_ENV === 'development') {
				console.log(`[KnockSignaling] Knocking channel (${knockingSpaceId}) status:`, status);
			}
		});

		return () => {
			isActive = false;
			supabase.removeChannel(channel);
			knockingChannelRef.current = null;
			setKnockingChannelStatus(null);
		};
	}, [knockingSpaceId, currentUserId]);

	/**
	 * Send a knock request to a space.
	 * Calls server for validation which INSERTs into knock_requests.
	 * Occupants receive the notification via postgres_changes.
	 */
	const sendKnockRequest = useCallback(async (
		spaceId: string,
		userProfile: { id: string; name: string; avatarUrl?: string }
	): Promise<{ requestId: string; recipientCount: number }> => {
		const requestId = createRequestId();
		const response = await fetch('/api/spaces/knock/request', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				spaceId,
				requestId,
				requesterName: userProfile.name,
				requesterAvatarUrl: userProfile.avatarUrl,
			}),
		});

		if (!response.ok) {
			const body = await response.json().catch(() => null);
			const message = body?.error || 'Failed to send knock request';
			throw new Error(message);
		}

		const body = await response.json();

		return {
			requestId: body.requestId as string,
			recipientCount: body.recipientCount as number,
		};
	}, []);

	/**
	 * Send a knock response through the server for validation and logging.
	 * Server UPDATEs the knock_requests row, which triggers postgres_changes
	 * for the knocker.
	 */
	const respondToKnock = useCallback(async (input: {
		spaceId: string;
		requestId: string;
		requesterId: string;
		requesterName: string;
		decision: 'APPROVE' | 'DENY';
	}) => {
		const response = await fetch('/api/spaces/knock/respond', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(input),
		});

		if (!response.ok) {
			const body = await response.json().catch(() => null);
			const message = body?.error || 'Failed to send knock response';
			throw new Error(message);
		}

		return await response.json();
	}, []);

	return {
		sendKnockRequest,
		respondToKnock,
		occupiedChannelStatus,
		knockingChannelStatus,
	};
}

export default useKnockSignaling;
