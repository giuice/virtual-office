/**
 * WebRTC Manager for P2P Audio Communication
 * 
 * Manages peer-to-peer connections using WebRTC with full mesh topology.
 * Each client connects directly to all other clients in the same space.
 * 
 * Key features:
 * - P2P mesh topology for direct audio streaming
 * - Automatic peer discovery via Supabase Realtime signaling
 * - Voice Activity Detection (VAD) integration
 * - Clean resource management on disconnect
 */

import { getIceServers, ROOM_LIMITS } from './ice-config';
import { VoiceActivityDetector } from '@/lib/audio/VoiceActivityDetector';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type SignalingEvent =
	| { type: 'handshake'; userId: string }
	| { type: 'offer'; targetUserId: string; senderId: string; sdp: RTCSessionDescriptionInit }
	| { type: 'answer'; targetUserId: string; senderId: string; sdp: RTCSessionDescriptionInit }
	| { type: 'ice-candidate'; targetUserId: string; senderId: string; candidate: RTCIceCandidateInit };

export interface PeerConnection {
	pc: RTCPeerConnection;
	userId: string;
	audioElement?: HTMLAudioElement;
	stream?: MediaStream;
}

export interface WebRTCManagerEvents {
	onPeerConnected: (userId: string) => void;
	onPeerDisconnected: (userId: string) => void;
	onPeerSpeaking: (userId: string, isSpeaking: boolean) => void;
	onError: (error: Error) => void;
	onRoomLimitWarning: (currentCount: number) => void;
}

export class WebRTCManager {
	private spaceId: string;
	private currentUserId: string;
	private localStream: MediaStream | null = null;
	private peerConnections: Map<string, PeerConnection> = new Map();
	private audioElements: Map<string, HTMLAudioElement> = new Map();
	private vadMap: Map<string, VoiceActivityDetector> = new Map();
	private signalingChannel: RealtimeChannel | null = null;
	private events: Partial<WebRTCManagerEvents> = {};
	private isMuted: boolean = true; // Default: muted on entry
	private pendingAudioRetryInterval: ReturnType<typeof setInterval> | null = null;

	constructor(spaceId: string, currentUserId: string, events?: Partial<WebRTCManagerEvents>) {
		this.spaceId = spaceId;
		this.currentUserId = currentUserId;
		this.events = events || {};

		// Start retry interval for blocked audio
		this.startAudioRetryInterval();
	}

	/**
	 * Initialize local audio stream (must be called after user gesture for Safari)
	 */
	async initializeLocalStream(): Promise<MediaStream> {
		try {
			this.localStream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				}
			});

			// Start muted by default
			this.setMuted(true);

			// If we already have peers, we need to add this stream to them and renegotiate
			if (this.peerConnections.size > 0) {
				await this.addLocalStreamToPeers();
			}

			return this.localStream;
		} catch (error) {
			const err = error instanceof Error ? error : new Error('Failed to get user media');
			this.events.onError?.(err);
			throw err;
		}
	}

	/**
	 * Add local stream tracks to existing peer connections and renegotiate
	 */
	private async addLocalStreamToPeers(): Promise<void> {
		if (!this.localStream) return;

		const promises = Array.from(this.peerConnections.entries()).map(async ([peerId, { pc }]) => {
			try {
				// Add tracks to the connection
				this.localStream!.getTracks().forEach(track => {
					pc.addTrack(track, this.localStream!);
				});

				// Create new offer (renegotiation)
				const offer = await pc.createOffer();
				await pc.setLocalDescription(offer);

				// Send offer to peer
				await this.signalingChannel?.send({
					type: 'broadcast',
					event: 'offer',
					payload: {
						targetUserId: peerId,
						senderId: this.currentUserId,
						sdp: offer,
					},
				});
			} catch (err) {
				console.error(`[WebRTC] Failed to renegotiate with peer ${peerId}:`, err);
			}
		});

		await Promise.all(promises);
	}

	/**
	 * Set the signaling channel for WebRTC negotiations
	 */
	setSignalingChannel(channel: RealtimeChannel): void {
		this.signalingChannel = channel;
	}

	/**
	 * Broadcast a handshake to announce presence to existing peers
	 */
	async broadcastHandshake(): Promise<void> {
		if (!this.signalingChannel) {
			throw new Error('Signaling channel not set');
		}

		await this.signalingChannel.send({
			type: 'broadcast',
			event: 'handshake',
			payload: { userId: this.currentUserId },
		});
	}

	/**
	 * Handle incoming handshake - create offer for new peer
	 */
	async handleHandshake(senderId: string): Promise<void> {
		if (senderId === this.currentUserId) return;

		// Check room limit
		if (this.peerConnections.size >= ROOM_LIMITS.SOFT_WARNING) {
			this.events.onRoomLimitWarning?.(this.peerConnections.size + 1);
		}

		// Create new peer connection and send offer
		const pc = await this.createPeerConnection(senderId);
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);

		await this.signalingChannel?.send({
			type: 'broadcast',
			event: 'offer',
			payload: {
				targetUserId: senderId,
				senderId: this.currentUserId,
				sdp: offer,
			},
		});
	}

	/**
	 * Handle incoming offer - create and send answer
	 * Supports both initial connection and renegotiation
	 */
	async handleOffer(senderId: string, targetUserId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
		// Only process offers targeted at us
		if (targetUserId !== this.currentUserId) return;
		if (senderId === this.currentUserId) return;

		// Check for existing connection (renegotiation case)
		let pc: RTCPeerConnection;
		const existing = this.peerConnections.get(senderId);
		if (existing) {
			// Reuse existing connection for renegotiation
			pc = existing.pc;
		} else {
			// Create new connection
			pc = await this.createPeerConnection(senderId);
		}

		await pc.setRemoteDescription(new RTCSessionDescription(sdp));

		const answer = await pc.createAnswer();
		await pc.setLocalDescription(answer);

		await this.signalingChannel?.send({
			type: 'broadcast',
			event: 'answer',
			payload: {
				targetUserId: senderId,
				senderId: this.currentUserId,
				sdp: answer,
			},
		});
	}

	/**
	 * Handle incoming answer
	 */
	async handleAnswer(senderId: string, targetUserId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
		if (targetUserId !== this.currentUserId) return;

		const peerConn = this.peerConnections.get(senderId);
		if (peerConn?.pc) {
			await peerConn.pc.setRemoteDescription(new RTCSessionDescription(sdp));
		}
	}

	/**
	 * Handle incoming ICE candidate
	 */
	async handleIceCandidate(senderId: string, targetUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
		if (targetUserId !== this.currentUserId) return;

		const peerConn = this.peerConnections.get(senderId);
		if (peerConn?.pc) {
			// Safari compatibility: use RTCIceCandidate constructor
			await peerConn.pc.addIceCandidate(new RTCIceCandidate(candidate));
		}
	}

	/**
	 * Create a new RTCPeerConnection for a peer
	 */
	private async createPeerConnection(peerId: string): Promise<RTCPeerConnection> {
		// Close existing connection if any
		const existing = this.peerConnections.get(peerId);
		if (existing) {
			existing.pc.close();
		}

		const pc = new RTCPeerConnection({
			iceServers: getIceServers(),
		});

		// Add local tracks if available
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => {
				pc.addTrack(track, this.localStream!);
			});
		}

		// Handle incoming tracks
		pc.ontrack = (event) => {
			this.handleRemoteTrack(peerId, event);
		};

		// Handle ICE candidates
		pc.onicecandidate = (event) => {
			if (event.candidate) {
				this.signalingChannel?.send({
					type: 'broadcast',
					event: 'ice-candidate',
					payload: {
						targetUserId: peerId,
						senderId: this.currentUserId,
						candidate: event.candidate.toJSON(),
					},
				});
			}
		};

		// Handle connection state changes
		pc.onconnectionstatechange = () => {
			switch (pc.connectionState) {
				case 'connected':
					this.events.onPeerConnected?.(peerId);
					break;
				case 'disconnected':
				case 'failed':
				case 'closed':
					this.cleanupPeer(peerId);
					this.events.onPeerDisconnected?.(peerId);
					break;
			}
		};

		this.peerConnections.set(peerId, { pc, userId: peerId });
		return pc;
	}

	/**
	 * Handle incoming remote track (audio stream)
	 */
	private handleRemoteTrack(peerId: string, event: RTCTrackEvent): void {
		const [stream] = event.streams;
		if (!stream) return;

		// Create audio element for this peer
		let audioEl = this.audioElements.get(peerId);
		if (!audioEl) {
			audioEl = document.createElement('audio');
			audioEl.autoplay = true;
			audioEl.setAttribute('playsinline', ''); // Safari iOS
			audioEl.style.display = 'none';
			document.body.appendChild(audioEl);
			this.audioElements.set(peerId, audioEl);
		}

		audioEl.srcObject = stream;

		// Safari autoplay handling - silent retry, don't show error
		audioEl.play().catch(() => {
			// Audio blocked, will be retried by interval
			console.log('[WebRTC] Audio blocked for peer, will retry:', peerId);
		});

		// Store stream reference
		const peerConn = this.peerConnections.get(peerId);

		// Setup VAD for remote stream
		const vad = new VoiceActivityDetector(stream, {
			onSpeakingChange: (isSpeaking) => {
				this.events.onPeerSpeaking?.(peerId, isSpeaking);
			}
		});
		this.vadMap.set(peerId, vad);
	}

	/**
	 * Set mute state for local audio
	 */
	setMuted(muted: boolean): void {
		this.isMuted = muted;
		if (this.localStream) {
			this.localStream.getAudioTracks().forEach(track => {
				track.enabled = !muted;
			});
		}
	}

	/**
	 * Get current mute state
	 */
	getMuted(): boolean {
		return this.isMuted;
	}

	/**
	 * Toggle mute state
	 */
	toggleMute(): boolean {
		this.setMuted(!this.isMuted);
		return this.isMuted;
	}

	/**
	 * Get local audio stream for VAD
	 */
	getLocalStream(): MediaStream | null {
		return this.localStream;
	}

	/**
	 * Get all connected peer IDs
	 */
	getConnectedPeers(): string[] {
		return Array.from(this.peerConnections.keys());
	}

	/**
	 * Get peer count
	 */
	getPeerCount(): number {
		return this.peerConnections.size;
	}

	/**
	 * Cleanup a specific peer connection
	 */
	cleanupPeer(peerId: string): void {
		const peerConn = this.peerConnections.get(peerId);
		if (peerConn) {
			peerConn.pc.close();
			this.peerConnections.delete(peerId);
		}

		const audioEl = this.audioElements.get(peerId);
		if (audioEl) {
			audioEl.srcObject = null;
			audioEl.remove();
			this.audioElements.delete(peerId);
		}

		const vad = this.vadMap.get(peerId);
		if (vad) {
			vad.stop();
			this.vadMap.delete(peerId);
		}
	}

	/**
	 * Start interval to retry playing blocked audio
	 */
	private startAudioRetryInterval(): void {
		this.pendingAudioRetryInterval = setInterval(() => {
			this.audioElements.forEach((el) => {
				if (el.paused && el.srcObject) {
					el.play().catch(() => { /* still blocked, will retry */ });
				}
			});
		}, 500);
	}

	/**
	 * Retry playing all remote audio elements
	 * Call this from a user gesture event handler (e.g. onClick)
	 */
	resumeRemoteAudio(): void {
		this.audioElements.forEach((el) => {
			el.play().catch(err => console.warn('Still failed to play remote audio:', err));
		});
	}

	/**
	 * Full cleanup - close all connections and release resources
	 * CRITICAL: Must be called on component unmount to prevent ghost audio
	 */
	cleanup(): void {
		// 1. Close all peer connections
		this.peerConnections.forEach((peerConn, peerId) => {
			peerConn.pc.close();
			this.peerConnections.delete(peerId);
		});

		// 2. Stop local media tracks
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => {
				track.stop();
			});
			this.localStream = null;
		}

		// 3. Remove all audio elements
		this.audioElements.forEach((el, peerId) => {
			el.srcObject = null;
			el.remove();
			this.audioElements.delete(peerId);
		});

		// 4. Stop all VADs
		this.vadMap.forEach((vad) => vad.stop());
		this.vadMap.clear();

		// 5. Stop retry interval
		if (this.pendingAudioRetryInterval) {
			clearInterval(this.pendingAudioRetryInterval);
			this.pendingAudioRetryInterval = null;
		}

		// 6. Clear signaling channel reference
		this.signalingChannel = null;
	}
}
