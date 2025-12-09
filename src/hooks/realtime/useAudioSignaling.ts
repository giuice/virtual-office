/**
 * Audio Signaling Hook for WebRTC P2P Connections
 * 
 * Manages Supabase Realtime channel for WebRTC signaling:
 * - handshake: Announce presence to existing peers
 * - offer: Send SDP offer to new peer
 * - answer: Respond to SDP offer
 * - ice-candidate: Exchange ICE candidates for NAT traversal
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { WebRTCManager } from '@/lib/webrtc';

interface UseAudioSignalingOptions {
	spaceId: string | undefined;
	currentUserId: string | undefined;
	webrtcManager: WebRTCManager | null;
	enabled?: boolean;
	// Mute state to track
	isMuted: boolean;
}

interface AudioPresenceState {
	[key: string]: {
		user_id: string;
		is_muted: boolean;
		online_at: string;
	}[];
}

interface SignalingState {
	isConnected: boolean;
	error: string | null;
	mutedUserIds: Set<string>;
}

export function useAudioSignaling({
	spaceId,
	currentUserId,
	webrtcManager,
	enabled = true,
	isMuted = true,
}: UseAudioSignalingOptions): SignalingState {
	const channelRef = useRef<RealtimeChannel | null>(null);
	const isConnectedRef = useRef(false);
	const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());

	// Handle incoming handshake
	const handleHandshake = useCallback(
		async (payload: { userId: string }) => {
			if (!webrtcManager || payload.userId === currentUserId) return;
			// console.log('[AudioSignaling] Received handshake from:', payload.userId);
			await webrtcManager.handleHandshake(payload.userId);
		},
		[webrtcManager, currentUserId]
	);

	// Handle incoming offer
	const handleOffer = useCallback(
		async (payload: { targetUserId: string; senderId: string; sdp: RTCSessionDescriptionInit }) => {
			if (!webrtcManager) return;
			// console.log('[AudioSignaling] Received offer from:', payload.senderId);
			await webrtcManager.handleOffer(payload.senderId, payload.targetUserId, payload.sdp);
		},
		[webrtcManager]
	);

	// Handle incoming answer
	const handleAnswer = useCallback(
		async (payload: { targetUserId: string; senderId: string; sdp: RTCSessionDescriptionInit }) => {
			if (!webrtcManager) return;
			// console.log('[AudioSignaling] Received answer from:', payload.senderId);
			await webrtcManager.handleAnswer(payload.senderId, payload.targetUserId, payload.sdp);
		},
		[webrtcManager]
	);

	// Handle incoming ICE candidate
	const handleIceCandidate = useCallback(
		async (payload: { targetUserId: string; senderId: string; candidate: RTCIceCandidateInit }) => {
			if (!webrtcManager) return;
			await webrtcManager.handleIceCandidate(payload.senderId, payload.targetUserId, payload.candidate);
		},
		[webrtcManager]
	);

	// Update presence state
	const updatePresenceState = useCallback((channel: RealtimeChannel) => {
		const state = channel.presenceState() as AudioPresenceState;
		const mutedIds = new Set<string>();

		Object.values(state).forEach(presences => {
			presences.forEach(p => {
				if (p.is_muted && p.user_id) {
					mutedIds.add(p.user_id);
				}
			});
		});

		setMutedUserIds(mutedIds);
	}, []);

	// Track own presence
	useEffect(() => {
		const channel = channelRef.current;
		if (channel && isConnectedRef.current && currentUserId) {
			channel.track({
				user_id: currentUserId,
				is_muted: isMuted,
				online_at: new Date().toISOString(),
			});
		}
	}, [isMuted, currentUserId]);

	useEffect(() => {
		if (!spaceId || !currentUserId || !webrtcManager || !enabled) {
			return;
		}

		const channelName = `room:audio:${spaceId}`;
		console.log('[AudioSignaling] Subscribing to channel:', channelName);

		const channel = supabase.channel(channelName, {
			config: {
				broadcast: { self: false },
				presence: { key: currentUserId },
			},
		});

		// Set up event listeners
		channel
			.on('broadcast', { event: 'handshake' }, ({ payload }) => handleHandshake(payload))
			.on('broadcast', { event: 'offer' }, ({ payload }) => handleOffer(payload))
			.on('broadcast', { event: 'answer' }, ({ payload }) => handleAnswer(payload))
			.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => handleIceCandidate(payload))
			.on('presence', { event: 'sync' }, () => updatePresenceState(channel))
			.on('presence', { event: 'join' }, () => updatePresenceState(channel))
			.on('presence', { event: 'leave' }, () => updatePresenceState(channel))
			.subscribe(async (status) => {
				// console.log('[AudioSignaling] Channel status:', status);

				if (status === 'SUBSCRIBED') {
					isConnectedRef.current = true;
					webrtcManager.setSignalingChannel(channel);

					// Track initial state
					await channel.track({
						user_id: currentUserId,
						is_muted: isMuted,
						online_at: new Date().toISOString(),
					});

					// Broadcast handshake
					await webrtcManager.broadcastHandshake();
				} else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
					isConnectedRef.current = false;
				}
			});

		channelRef.current = channel;

		// Cleanup on unmount
		return () => {
			console.log('[AudioSignaling] Unsubscribing from channel:', channelName);
			// webrtcManager.setSignalingChannel(null); // Don't null it here, let manager handle its own cleanup logic if needed
			// But since we removed unsubscribe from manager, we must unsubscribe here
			channel.unsubscribe();
			channelRef.current = null;
			isConnectedRef.current = false;
		};
	}, [spaceId, currentUserId, webrtcManager, enabled, handleHandshake, handleOffer, handleAnswer, handleIceCandidate, updatePresenceState]); // Removed isMuted dependency to avoid re-subscription

	return {
		isConnected: isConnectedRef.current,
		error: null,
		mutedUserIds
	};
}
