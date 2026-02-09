// src/hooks/realtime/useKnockSignaling.ts
// Story 3.16: Knock to Enter Workflow - Realtime Signaling
'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

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

const KNOCK_CHANNEL_PREFIX = 'knock:space:';
type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CHANNEL_ERROR' | 'CLOSED' | 'SUBSCRIBING' | null;

/**
 * Get or create a Supabase Realtime channel for knock signaling on a space.
 */
function getKnockChannel(spaceId: string): RealtimeChannel {
	return supabase.channel(`${KNOCK_CHANNEL_PREFIX}${spaceId}`);
}

function createRequestId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `knock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * useKnockSignaling - Handles Supabase Realtime Broadcast for knock signaling.
 *
 * This hook manages subscriptions to knock channels and provides methods to
 * send knock requests and responses.
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
	const [occupiedChannelStatus, setOccupiedChannelStatus] = useState<ChannelStatus>(null);
	const [knockingChannelStatus, setKnockingChannelStatus] = useState<ChannelStatus>(null);

	// Subscribe to the occupied space channel to receive knock requests
	useEffect(() => {
		if (!occupiedSpaceId || !currentUserId) {
			// Cleanup previous channel if space changed to null
			if (occupiedChannelRef.current) {
				supabase.removeChannel(occupiedChannelRef.current);
				occupiedChannelRef.current = null;
			}
			setOccupiedChannelStatus(null);
			return;
		}

		const channel = getKnockChannel(occupiedSpaceId);
		occupiedChannelRef.current = channel;

		channel
			.on('broadcast', { event: 'knock' }, (payload) => {
				const data = payload.payload as KnockPayload;
				// Only handle requests (not responses) if we are an occupant
				if (data.type === 'KNOCK_REQUEST' && data.requesterId !== currentUserId) {
					onKnockRequest?.(data as KnockRequestPayload);
				}
			})
			.subscribe((status) => {
				setOccupiedChannelStatus(status as ChannelStatus);
				if (process.env.NODE_ENV === 'development') {
					console.log(`[KnockSignaling] Occupied channel (${occupiedSpaceId}) status:`, status);
				}
			});

		return () => {
			supabase.removeChannel(channel);
			occupiedChannelRef.current = null;
			setOccupiedChannelStatus(null);
		};
	}, [occupiedSpaceId, currentUserId, onKnockRequest]);

	// Subscribe to the knocking space channel to receive responses
	useEffect(() => {
		if (!knockingSpaceId || !currentUserId) {
			if (knockingChannelRef.current) {
				supabase.removeChannel(knockingChannelRef.current);
				knockingChannelRef.current = null;
			}
			setKnockingChannelStatus(null);
			return;
		}

		const channel = getKnockChannel(knockingSpaceId);
		knockingChannelRef.current = channel;

		channel
			.on('broadcast', { event: 'knock' }, (payload) => {
				const data = payload.payload as KnockPayload;
				// Only handle responses meant for us
				if (data.type === 'KNOCK_RESPONSE' && data.requesterId === currentUserId) {
					onKnockResponse?.(data as KnockResponsePayload);
				}
			})
			.subscribe((status) => {
				setKnockingChannelStatus(status as ChannelStatus);
				if (process.env.NODE_ENV === 'development') {
					console.log(`[KnockSignaling] Knocking channel (${knockingSpaceId}) status:`, status);
				}
			});

		return () => {
			supabase.removeChannel(channel);
			knockingChannelRef.current = null;
			setKnockingChannelStatus(null);
		};
	}, [knockingSpaceId, currentUserId, onKnockResponse]);

	/**
	 * Send a knock request to a space.
	 */
	const sendKnockRequest = useCallback(async (
		spaceId: string,
		userProfile: { id: string; name: string; avatarUrl?: string }
	): Promise<{ requestId: string; recipientCount: number }> => {
		const requestId = createRequestId();
		const response = await fetch('/api/spaces/knock/request', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
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
	 * Send a knock response through the server for occupant validation and logging.
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
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(input),
		});

		if (!response.ok) {
			const body = await response.json().catch(() => null);
			const message = body?.error || 'Failed to send knock response';
			throw new Error(message);
		}

		return response.json();
	}, []);

	return {
		sendKnockRequest,
		respondToKnock,
		occupiedChannelStatus,
		knockingChannelStatus,
	};
}

export default useKnockSignaling;
