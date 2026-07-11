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
const POLL_INTERVAL_MS = 2000;
const FRESH_KNOCK_WINDOW_MS = 45 * 1000;
// Phase 1 fail-closed window: re-enabled in Phase 4 via service-role transaction functions.
const KNOCK_DISABLED = true;

export interface KnockTemporarilyUnavailableFailure {
	ok: false;
	error: 'Knock is temporarily unavailable';
	code: 'KNOCK_TEMPORARILY_UNAVAILABLE';
	status: 503;
}

type KnockOperationFailure = KnockTemporarilyUnavailableFailure;

export function isKnockTemporarilyUnavailableFailure(
	value: unknown
): value is KnockTemporarilyUnavailableFailure {
	return Boolean(
		value &&
		typeof value === 'object' &&
		'code' in value &&
		value.code === 'KNOCK_TEMPORARILY_UNAVAILABLE'
	);
}

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

function isFreshTimestamp(timestamp: string, maxAgeMs = FRESH_KNOCK_WINDOW_MS): boolean {
	const parsed = Date.parse(timestamp);
	if (!Number.isFinite(parsed)) return false;
	return Date.now() - parsed <= maxAgeMs;
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
		if (KNOCK_DISABLED) return;
			if (!occupiedSpaceId || !currentUserId) {
				if (occupiedChannelRef.current) {
					supabase.removeChannel(occupiedChannelRef.current);
					occupiedChannelRef.current = null;
				}
				return;
			}

		let latestStatus: ChannelStatus = null;
		const seenIncomingRequestIds = new Set<string>();
		const processIncomingKnock = (row: KnockRequestRow) => {
			if (row.requester_id === currentUserId) return;
			if (!isFreshTimestamp(row.created_at)) return;
			if (seenIncomingRequestIds.has(row.id)) return;
			seenIncomingRequestIds.add(row.id);

			onKnockRequestRef.current?.({
				type: 'KNOCK_REQUEST',
				requestId: row.id,
				requesterId: row.requester_id,
				requesterName: row.requester_name,
				requesterAvatarUrl: row.requester_avatar_url ?? undefined,
				spaceId: row.space_id,
				timestamp: new Date(row.created_at).getTime(),
			});
		};

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
					processIncomingKnock(payload.new);
				}
			);

		occupiedChannelRef.current = channel;
		let isActive = true;

		channel.subscribe((status) => {
			if (!isActive) return;
			latestStatus = status as ChannelStatus;
			setOccupiedChannelStatus(status as ChannelStatus);
			if (process.env.NODE_ENV === 'development' && status !== 'TIMED_OUT') {
				console.log(`[KnockSignaling] Occupied channel (${occupiedSpaceId}) status:`, status);
			}
		});

		const pollTimer = setInterval(async () => {
			if (!isActive) return;
			if (latestStatus !== 'TIMED_OUT' && latestStatus !== 'CHANNEL_ERROR' && latestStatus !== 'CLOSED') return;

			const cutoffIso = new Date(Date.now() - FRESH_KNOCK_WINDOW_MS).toISOString();
			const { data, error } = await supabase
				.from('knock_requests')
				.select('id, space_id, requester_id, requester_name, requester_avatar_url, responder_id, responder_name, decision, status, created_at, updated_at')
				.eq('space_id', occupiedSpaceId)
				.eq('status', 'pending')
				.gte('created_at', cutoffIso)
				.order('created_at', { ascending: true })
				.limit(20);

			if (error) {
				console.warn('[KnockSignaling] Poll fallback failed for occupied knocks:', error.message);
				return;
			}

			(data as KnockRequestRow[] | null)?.forEach(processIncomingKnock);
		}, POLL_INTERVAL_MS);

		return () => {
				isActive = false;
				clearInterval(pollTimer);
				supabase.removeChannel(channel);
				occupiedChannelRef.current = null;
			};
		}, [occupiedSpaceId, currentUserId]);

	// Subscribe to UPDATE events on knock_requests for our requests (knocker receives responses)
	useEffect(() => {
		if (KNOCK_DISABLED) return;
			if (!knockingSpaceId || !currentUserId) {
				if (knockingChannelRef.current) {
					supabase.removeChannel(knockingChannelRef.current);
					knockingChannelRef.current = null;
				}
				return;
			}

		let latestStatus: ChannelStatus = null;
		const seenResponseEvents = new Set<string>();
		const processKnockResponse = (row: KnockRequestRow) => {
			if (!row.decision || row.space_id !== knockingSpaceId) return;
			if (!isFreshTimestamp(row.updated_at)) return;
			const eventKey = `${row.id}:${row.status}:${row.updated_at}`;
			if (seenResponseEvents.has(eventKey)) return;
			seenResponseEvents.add(eventKey);

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
		};

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
					processKnockResponse(payload.new);
				}
			);

		knockingChannelRef.current = channel;
		let isActive = true;

		channel.subscribe((status) => {
			if (!isActive) return;
			latestStatus = status as ChannelStatus;
			setKnockingChannelStatus(status as ChannelStatus);
			if (process.env.NODE_ENV === 'development' && status !== 'TIMED_OUT') {
				console.log(`[KnockSignaling] Knocking channel (${knockingSpaceId}) status:`, status);
			}
		});

		const pollTimer = setInterval(async () => {
			if (!isActive) return;
			if (latestStatus !== 'TIMED_OUT' && latestStatus !== 'CHANNEL_ERROR' && latestStatus !== 'CLOSED') return;

			const cutoffIso = new Date(Date.now() - FRESH_KNOCK_WINDOW_MS).toISOString();
			const { data, error } = await supabase
				.from('knock_requests')
				.select('id, space_id, requester_id, requester_name, requester_avatar_url, responder_id, responder_name, decision, status, created_at, updated_at')
				.eq('requester_id', currentUserId)
				.eq('space_id', knockingSpaceId)
				.in('status', ['approved', 'denied'])
				.gte('updated_at', cutoffIso)
				.order('updated_at', { ascending: true })
				.limit(20);

			if (error) {
				console.warn('[KnockSignaling] Poll fallback failed for knock responses:', error.message);
				return;
			}

			(data as KnockRequestRow[] | null)?.forEach(processKnockResponse);
		}, POLL_INTERVAL_MS);

		return () => {
				isActive = false;
				clearInterval(pollTimer);
				supabase.removeChannel(channel);
				knockingChannelRef.current = null;
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
	): Promise<{ requestId: string; recipientCount: number } | KnockOperationFailure> => {
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
			if (response.status === 503 && body?.code === 'KNOCK_TEMPORARILY_UNAVAILABLE') {
				return {
					ok: false,
					error: 'Knock is temporarily unavailable',
					code: 'KNOCK_TEMPORARILY_UNAVAILABLE',
					status: 503,
				};
			}
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
	}): Promise<Record<string, unknown> | KnockOperationFailure> => {
		const response = await fetch('/api/spaces/knock/respond', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(input),
		});

		if (!response.ok) {
			const body = await response.json().catch(() => null);
			if (response.status === 503 && body?.code === 'KNOCK_TEMPORARILY_UNAVAILABLE') {
				return {
					ok: false,
					error: 'Knock is temporarily unavailable',
					code: 'KNOCK_TEMPORARILY_UNAVAILABLE',
					status: 503,
				};
			}
			const message = body?.error || 'Failed to send knock response';
			throw new Error(message);
		}

		return await response.json();
	}, []);

	return {
		sendKnockRequest,
		respondToKnock,
		occupiedChannelStatus: occupiedSpaceId && currentUserId ? occupiedChannelStatus : null,
		knockingChannelStatus: knockingSpaceId && currentUserId ? knockingChannelStatus : null,
	};
}

export default useKnockSignaling;
