/**
 * Audio Signaling Hook for WebRTC P2P Connections
 * 
 * Manages Supabase Realtime channel for WebRTC signaling:
 * - handshake: Announce presence to existing peers
 * - offer: Send SDP offer to new peer
 * - answer: Respond to SDP offer
 * - ice-candidate: Exchange ICE candidates for NAT traversal
 */

import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { WebRTCManager } from '@/lib/webrtc';

interface UseAudioSignalingOptions {
	spaceId: string | undefined;
	currentUserId: string | undefined;
	webrtcManager: WebRTCManager | null;
	enabled?: boolean;
}

interface SignalingState {
	isConnected: boolean;
	error: string | null;
}

export function useAudioSignaling({
	spaceId,
	currentUserId,
	webrtcManager,
	enabled = true,
}: UseAudioSignalingOptions): SignalingState {
	const channelRef = useRef<RealtimeChannel | null>(null);
	const isConnectedRef = useRef(false);

	// Handle incoming handshake
	const handleHandshake = useCallback(
		async (payload: { userId: string }) => {
			if (!webrtcManager || payload.userId === currentUserId) return;
			console.log('[AudioSignaling] Received handshake from:', payload.userId);
			await webrtcManager.handleHandshake(payload.userId);
		},
		[webrtcManager, currentUserId]
	);

	// Handle incoming offer
	const handleOffer = useCallback(
		async (payload: { targetUserId: string; senderId: string; sdp: RTCSessionDescriptionInit }) => {
			if (!webrtcManager) return;
			console.log('[AudioSignaling] Received offer from:', payload.senderId);
			await webrtcManager.handleOffer(payload.senderId, payload.targetUserId, payload.sdp);
		},
		[webrtcManager]
	);

	// Handle incoming answer
	const handleAnswer = useCallback(
		async (payload: { targetUserId: string; senderId: string; sdp: RTCSessionDescriptionInit }) => {
			if (!webrtcManager) return;
			console.log('[AudioSignaling] Received answer from:', payload.senderId);
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

	useEffect(() => {
		if (!spaceId || !currentUserId || !webrtcManager || !enabled) {
			return;
		}

		const channelName = `room:audio:${spaceId}`;
		console.log('[AudioSignaling] Subscribing to channel:', channelName);

		const channel = supabase.channel(channelName, {
			config: {
				broadcast: { self: false }, // Don't receive own broadcasts
			},
		});

		// Set up event listeners
		channel
			.on('broadcast', { event: 'handshake' }, ({ payload }) => {
				handleHandshake(payload);
			})
			.on('broadcast', { event: 'offer' }, ({ payload }) => {
				handleOffer(payload);
			})
			.on('broadcast', { event: 'answer' }, ({ payload }) => {
				handleAnswer(payload);
			})
			.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
				handleIceCandidate(payload);
			})
			.subscribe(async (status) => {
				console.log('[AudioSignaling] Channel status:', status);

				if (status === 'SUBSCRIBED') {
					isConnectedRef.current = true;

					// Set signaling channel on manager
					webrtcManager.setSignalingChannel(channel);

					// Broadcast handshake to announce presence
					await webrtcManager.broadcastHandshake();
				} else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
					isConnectedRef.current = false;
				}
			});

		channelRef.current = channel;

		// Cleanup on unmount
		return () => {
			console.log('[AudioSignaling] Unsubscribing from channel:', channelName);
			channel.unsubscribe();
			channelRef.current = null;
			isConnectedRef.current = false;
		};
	}, [spaceId, currentUserId, webrtcManager, enabled, handleHandshake, handleOffer, handleAnswer, handleIceCandidate]);

	return {
		isConnected: isConnectedRef.current,
		error: null,
	};
}
