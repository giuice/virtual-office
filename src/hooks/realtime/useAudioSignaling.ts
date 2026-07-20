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
	const isMutedRef = useRef(isMuted);
	const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());
	isMutedRef.current = isMuted;

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
			void channel.track({
				user_id: currentUserId,
				is_muted: isMuted,
				online_at: new Date().toISOString(),
			}).catch((error) => {
				if (channelRef.current === channel) {
					console.error('[AudioSignaling] Failed to update presence:', error);
				}
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
		let cancelled = false;
		channelRef.current = channel;
		const isCurrentChannel = () => !cancelled && channelRef.current === channel;
		const runCurrentHandler = (handler: () => Promise<void>) => {
			if (!isCurrentChannel()) return;
			void handler().catch((error: unknown) => {
				if (isCurrentChannel()) {
					console.error('[AudioSignaling] Signaling handler failed:', error);
				}
			});
		};

		// Set up event listeners
		channel
			.on('broadcast', { event: 'handshake' }, ({ payload }) => {
				runCurrentHandler(() => handleHandshake(payload));
			})
			.on('broadcast', { event: 'offer' }, ({ payload }) => {
				runCurrentHandler(() => handleOffer(payload));
			})
			.on('broadcast', { event: 'answer' }, ({ payload }) => {
				runCurrentHandler(() => handleAnswer(payload));
			})
			.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
				runCurrentHandler(() => handleIceCandidate(payload));
			})
			.on('presence', { event: 'sync' }, () => {
				if (isCurrentChannel()) updatePresenceState(channel);
			})
			.on('presence', { event: 'join' }, () => {
				if (isCurrentChannel()) updatePresenceState(channel);
			})
			.on('presence', { event: 'leave' }, () => {
				if (isCurrentChannel()) updatePresenceState(channel);
			})
			.subscribe((status) => {
				// console.log('[AudioSignaling] Channel status:', status);

				if (status === 'SUBSCRIBED') {
					void (async () => {
						if (cancelled || channelRef.current !== channel) return;
						isConnectedRef.current = true;
						webrtcManager.setSignalingChannel(channel);

						try {
							// Track initial state before announcing this peer.
							await channel.track({
								user_id: currentUserId,
								is_muted: isMutedRef.current,
								online_at: new Date().toISOString(),
							});

							// A space/manager transition may retire this subscription while
							// track is in flight. Never handshake through a stale manager.
							if (cancelled || channelRef.current !== channel) return;
							await webrtcManager.broadcastHandshake();
						} catch (error) {
							if (!cancelled && channelRef.current === channel) {
								isConnectedRef.current = false;
								console.error('[AudioSignaling] Failed to initialize signaling:', error);
							}
						}
					})();
				} else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
					if (channelRef.current === channel) {
						isConnectedRef.current = false;
					}
				}
			});

		// Cleanup on unmount
		return () => {
			cancelled = true;
			console.log('[AudioSignaling] Unsubscribing from channel:', channelName);
			if (channelRef.current === channel) {
				webrtcManager.setSignalingChannel(null);
				channelRef.current = null;
				isConnectedRef.current = false;
			}
			void supabase.removeChannel(channel).catch((error: unknown) => {
				console.error('[AudioSignaling] Failed to remove signaling channel:', error);
			});
		};
		}, [spaceId, currentUserId, webrtcManager, enabled, handleHandshake, handleOffer, handleAnswer, handleIceCandidate, updatePresenceState]);

	return {
		isConnected: isConnectedRef.current,
		error: null,
		mutedUserIds
	};
}
