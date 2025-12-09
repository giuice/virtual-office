/**
 * Audio Context Provider for WebRTC Audio Chat
 * 
 * Provides centralized audio state management for P2P audio:
 * - WebRTC manager lifecycle
 * - Mute/unmute state
 * - Speaking users tracking
 * - Permission state
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { WebRTCManager, ROOM_LIMITS } from '@/lib/webrtc';
import { useAudioSignaling } from '@/hooks/realtime/useAudioSignaling';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Permission states
export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable';

interface AudioContextValue {
	// Manager access
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
	peerCount: number;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function useAudio(): AudioContextValue {
	const context = useContext(AudioContext);
	if (!context) {
		throw new Error('useAudio must be used within an AudioProvider');
	}
	return context;
}

interface AudioProviderProps {
	spaceId: string | undefined;
	userId?: string; // Internal user.id (from profile), not supabase_uid
	children: ReactNode;
}

export function AudioProvider({ spaceId, userId, children }: AudioProviderProps) {
	const { user } = useAuth();
	// Use internal userId if provided, otherwise fall back to supabase uid
	const currentUserId = userId || user?.id;

	// State
	const [webrtcManager, setWebrtcManager] = useState<WebRTCManager | null>(null);
	const [isMuted, setIsMutedState] = useState(true); // Default: muted on entry
	const [isAudioEnabled, setIsAudioEnabled] = useState(false);
	const [isInitializing, setIsInitializing] = useState(false);
	const [micPermission, setMicPermission] = useState<MicPermissionState>('prompt');
	const [speakingUsers, setSpeakingUsers] = useState<Map<string, boolean>>(new Map());
	const [error, setError] = useState<string | null>(null);
	const [peerCount, setPeerCount] = useState(0);

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
				console.log('[AudioProvider] Peer connected:', peerId);
				setPeerCount((prev) => prev + 1);
			},
			onPeerDisconnected: (peerId) => {
				console.log('[AudioProvider] Peer disconnected:', peerId);
				setPeerCount((prev) => Math.max(0, prev - 1));
				// Clear speaking state for disconnected peer
				setSpeakingUsers((prev) => {
					const next = new Map(prev);
					next.delete(peerId);
					return next;
				});
				setSpeakingUsers((prev) => {
					const next = new Map(prev);
					next.delete(peerId);
					return next;
				});
			},
			onPeerSpeaking: (peerId, isSpeaking) => {
				setSpeakingUsers((prev) => {
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
				toast.warning(`Sala com ${count} usuários. Performance pode ser afetada acima de ${ROOM_LIMITS.SOFT_WARNING} pessoas.`);
			},
			onError: (err) => {
				console.error('[AudioProvider] Error:', err);
				if (err.message === 'AUTOPLAY_BLOCKED') {
					setError('Clique para habilitar o áudio');
				} else {
					setError(err.message);
				}
			},
		});

		setWebrtcManager(manager);
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
			setWebrtcManager(null);
			managerRef.current = null;
			setIsAudioEnabled(false);
			setPeerCount(0);
		};
	}, [spaceId, currentUserId]);

	/**
	 * Initialize audio (must be called from user gesture for Safari)
	 */
	const initializeAudio = useCallback(async (): Promise<boolean> => {
		if (!webrtcManager) {
			setError('Manager não inicializado');
			return false;
		}

		if (isInitializing) {
			return false;
		}

		setIsInitializing(true);
		setError(null);

		try {
			// Check permission state
			const permissionStatus = await navigator.permissions?.query?.({ name: 'microphone' as PermissionName });
			if (permissionStatus) {
				setMicPermission(permissionStatus.state as MicPermissionState);
			}

			// Request microphone access
			await webrtcManager.initializeLocalStream();

			// Also resume any blocked remote audio (since we now have a user gesture)
			webrtcManager.resumeRemoteAudio();

			setMicPermission('granted');
			setIsAudioEnabled(true);
			setIsMutedState(false); // Start unmuted (One-click enable)
			webrtcManager.setMuted(false); // CRITICAL: Actually unmute the tracks!

			return true;
		} catch (err) {
			console.error('[AudioProvider] Failed to initialize audio:', err);

			if (err instanceof DOMException) {
				if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
					setMicPermission('denied');
					setError('Permissão de microfone negada');
				} else if (err.name === 'NotFoundError') {
					setMicPermission('unavailable');
					setError('Microfone não encontrado');
				} else {
					setError(err.message);
				}
			} else {
				setError('Erro ao acessar microfone');
			}

			return false;
		} finally {
			setIsInitializing(false);
		}
	}, [webrtcManager, isInitializing]);

	/**
	 * Set mute state
	 */
	const setMuted = useCallback((muted: boolean) => {
		setIsMutedState(muted);
		webrtcManager?.setMuted(muted);
	}, [webrtcManager]);

	/**
	 * Toggle mute state
	 */
	const toggleMute = useCallback(() => {
		if (!isAudioEnabled) {
			return;
		}
		const newMuted = !isMuted;
		setIsMutedState(newMuted);
		webrtcManager?.setMuted(newMuted);
	}, [webrtcManager, isMuted, isAudioEnabled]);

	/**
	 * Update speaking state for a user
	 */
	const setSpeaking = useCallback((userId: string, isSpeaking: boolean) => {
		setSpeakingUsers((prev) => {
			const next = new Map(prev);
			if (isSpeaking) {
				next.set(userId, true);
			} else {
				next.delete(userId);
			}
			return next;
		});
	}, []);

	/**
	 * Manual cleanup
	 */
	const cleanup = useCallback(() => {
		if (managerRef.current) {
			managerRef.current.cleanup();
		}
	}, []);

	// Helper to check if a user is muted
	const isUserMuted = useCallback((userId: string) => {
		if (userId === currentUserId) return isMuted;
		return mutedUserIds.has(userId);
	}, [currentUserId, isMuted, mutedUserIds]);

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
