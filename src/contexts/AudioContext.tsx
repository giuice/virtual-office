'use client';

/**
 * Audio Context Provider for WebRTC Audio Chat
 * 
 * Provides centralized audio state management for P2P audio:
 * - WebRTC manager lifecycle
 * - Mute/unmute state
 * - Speaking users tracking
 * - Permission state
 */

import React, { createContext, use, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useReducerState } from '@/hooks/useReducerState';
import { WebRTCManager, ROOM_LIMITS } from '@/lib/webrtc';
import { useAudioSignaling } from '@/hooks/realtime/useAudioSignaling';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Permission states
export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable';

interface AudioContextValue { // Manager access
	webrtcManager: WebRTCManager | null;

	// State
	isMuted: boolean;
	isAudioEnabled: boolean;
	isInitializing: boolean;
	micPermission: MicPermissionState;
	speakingUsers: Map<string, boolean>;
	mutedUserIds: Set<string>;
	error: string | null;

	// Helpers
	isUserMuted: (userId: string) => boolean;

	// Actions
	initializeAudio: () => Promise<boolean>;
	setMuted: (muted: boolean) => void;
	toggleMute: () => void;
	setSpeaking: (userId: string, isSpeaking: boolean) => void;
	cleanup: () => void;

	// Info
	peerCount: number; }

const AudioContext = createContext<AudioContextValue | null>(null);

export function useAudio(): AudioContextValue { const context = use(AudioContext);
	if (!context) {
		throw new Error('useAudio must be used within an AudioProvider'); }
	return context;
}

interface AudioProviderProps { spaceId: string | undefined;
	userId?: string; // Internal user.id (from profile), not supabase_uid
	children: ReactNode; }

interface OwnedWebRTCManager {
	manager: WebRTCManager;
	spaceId: string;
	userId: string;
}

export function AudioProvider({ spaceId, userId, children }: AudioProviderProps) { const { user } = useAuth();
	// Use internal userId if provided, otherwise fall back to supabase uid
	const currentUserId = userId || user?.id;

	// State
	const [ownedWebrtcManager, updateOwnedWebrtcManager] = useReducerState<OwnedWebRTCManager | null>(null);
	const webrtcManager = ownedWebrtcManager &&
		ownedWebrtcManager.spaceId === spaceId &&
		ownedWebrtcManager.userId === currentUserId
		? ownedWebrtcManager.manager
		: null;
	const [isMuted, updateIsMutedState] = useReducerState(true); // Default: muted on entry
	const [isAudioEnabled, updateIsAudioEnabled] = useReducerState(false);
	const [isInitializing, updateIsInitializing] = useReducerState(false);
	const [micPermission, updateMicPermission] = useReducerState<MicPermissionState>('prompt');
	const [speakingUsers, updateSpeakingUsers] = useReducerState<Map<string, boolean>>(new Map());
	const [error, updateError] = useReducerState<string | null>(null);
	const [peerCount, updatePeerCount] = useReducerState(0);

	// Refs for cleanup
	const managerRef = useRef<WebRTCManager | null>(null);

	// Setup signaling when manager is ready
	const { mutedUserIds } = useAudioSignaling({
		spaceId,
		currentUserId,
		webrtcManager,
		enabled: !!webrtcManager, // Enable signaling immediately for listen-only mode
		isMuted,
	});

	// Create manager when entering space
	useEffect(() => {
		if (!spaceId || !currentUserId) {
			return;
		}

		const manager = new WebRTCManager(spaceId, currentUserId, {
			onPeerConnected: (peerId) => {
				if (managerRef.current !== manager) return;
				console.log('[AudioProvider] Peer connected:', peerId);
				updatePeerCount((prev) => prev + 1);
			},
			onPeerDisconnected: (peerId) => {
				if (managerRef.current !== manager) return;
				console.log('[AudioProvider] Peer disconnected:', peerId);
				updatePeerCount((prev) => Math.max(0, prev - 1));
				// Clear speaking state for disconnected peer
				updateSpeakingUsers((prev) => {
					const next = new Map(prev);
					next.delete(peerId);
					return next;
				});
			},
			onPeerSpeaking: (peerId, isSpeaking) => {
				if (managerRef.current !== manager) return;
				updateSpeakingUsers((prev) => {
					const next = new Map(prev);
					if (isSpeaking) {
						next.set(peerId, true);
					} else {
						next.delete(peerId);
					}
					return next;
				});
			},
			onRoomLimitWarning: (count) => {
				if (managerRef.current !== manager) return;
				toast.warning(`Sala com ${count} usuários. Performance pode ser afetada acima de ${ROOM_LIMITS.SOFT_WARNING} pessoas.`);
			},
			onError: (err) => {
				if (managerRef.current !== manager) return;
				console.error('[AudioProvider] Error:', err);
				if (err.message === 'AUTOPLAY_BLOCKED') {
					updateError('Clique para habilitar o áudio');
				} else {
					updateError(err.message);
				}
			},
		});

		updateOwnedWebrtcManager({ manager, spaceId, userId: currentUserId });
		managerRef.current = manager;

		// Browser audio policy: resume any blocked audio on ANY user interaction
		const handleGlobalClick = () => {
			manager.resumeRemoteAudio();
		};
		window.addEventListener('click', handleGlobalClick, { once: false });

		return () => {
			console.log('[AudioProvider] Cleaning up manager');
			window.removeEventListener('click', handleGlobalClick);
			manager.cleanup();
			updateOwnedWebrtcManager(null);
			managerRef.current = null;
			updateIsMutedState(true);
			updateIsAudioEnabled(false);
			updateSpeakingUsers(new Map());
			updatePeerCount(0);
		};
		}, [spaceId, currentUserId, updatePeerCount, updateSpeakingUsers, updateError, updateOwnedWebrtcManager, updateIsAudioEnabled, updateIsMutedState]);

	/**
	 * Initialize audio (must be called from user gesture for Safari)
	 */
	const initializeAudio = useCallback(async (): Promise<boolean> => {
		if (!webrtcManager) {
			updateError('Manager não inicializado');
			return false;
		}

		if (isInitializing) {
			return false;
		}

		updateIsInitializing(true);
		updateError(null);

		try {
			// Check permission state
			const permissionStatus = await navigator.permissions?.query?.({ name: 'microphone' as PermissionName });
			if (permissionStatus) {
				updateMicPermission(permissionStatus.state as MicPermissionState);
			}

			// Request microphone access
			await webrtcManager.initializeLocalStream();

			// Also resume any blocked remote audio (since we now have a user gesture)
			webrtcManager.resumeRemoteAudio();

			updateMicPermission('granted');
			updateIsAudioEnabled(true);
			updateIsMutedState(false); // Start unmuted (One-click enable)
			webrtcManager.setMuted(false); // CRITICAL: Actually unmute the tracks!

			return true;
		} catch (err) {
			console.error('[AudioProvider] Failed to initialize audio:', err);

			if (err instanceof DOMException) {
				if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
					updateMicPermission('denied');
					updateError('Permissão de microfone negada');
				} else if (err.name === 'NotFoundError') {
					updateMicPermission('unavailable');
					updateError('Microfone não encontrado');
				} else {
					updateError(err.message);
				}
			} else {
				updateError('Erro ao acessar microfone');
			}

			return false;
		} finally {
			updateIsInitializing(false);
		}
		}, [webrtcManager, isInitializing, updateError, updateIsInitializing, updateMicPermission, updateIsAudioEnabled, updateIsMutedState]);

	/**
	 * Set mute state
	 */
	const setMuted = useCallback((muted: boolean) => {
		updateIsMutedState(muted);
		webrtcManager?.setMuted(muted);
		}, [webrtcManager, updateIsMutedState]);

	/**
	 * Toggle mute state
	 */
	const toggleMute = useCallback(() => {
		if (!isAudioEnabled) {
			return;
		}
		const newMuted = !isMuted;
		updateIsMutedState(newMuted);
		webrtcManager?.setMuted(newMuted);
		}, [webrtcManager, isMuted, isAudioEnabled, updateIsMutedState]);

	/**
	 * Update speaking state for a user
	 */
	const setSpeaking = useCallback((userId: string, isSpeaking: boolean) => { updateSpeakingUsers((prev) => {
			const next = new Map(prev);
			if (isSpeaking) {
				next.set(userId, true); } else { next.delete(userId); }
			return next;
		});
		}, [updateSpeakingUsers]);

	/**
	 * Manual cleanup
	 */
	const cleanup = useCallback(() => {
		if (managerRef.current) {
			managerRef.current.cleanup();
		}
	}, []);

	// Helper to check if a user is muted
	const isUserMuted = useCallback((userId: string) => { if (userId === currentUserId) return isMuted;
		return mutedUserIds.has(userId); }, [currentUserId, isMuted, mutedUserIds]);

	const value: AudioContextValue = {
		webrtcManager,
		isMuted,
		isAudioEnabled,
		isInitializing,
		micPermission,
		speakingUsers,
		error,
		initializeAudio,
		setMuted,
		toggleMute,
		setSpeaking,
		cleanup,
		peerCount,
		mutedUserIds,
		isUserMuted,
	};

	return (
		<AudioContext.Provider value={value}>
			{children}
		</AudioContext.Provider>
	);
}
