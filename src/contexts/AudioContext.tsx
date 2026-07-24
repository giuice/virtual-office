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
import { useCompany } from '@/contexts/CompanyContext';
import { usePresence } from '@/contexts/PresenceContext';
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
	userId?: string; // Internal application user.id, never the Supabase Auth UUID
	children: ReactNode; }

interface OwnedWebRTCManager {
	manager: WebRTCManager;
	companyId: string;
	spaceId: string;
	userId: string;
	presenceSessionId: string;
	identity: string;
}

export function AudioProvider({ spaceId, userId, children }: AudioProviderProps) { const { session } = useAuth();
	const { company } = useCompany();
	const { presenceSessionId } = usePresence();
	const currentUserId = userId;
	const accessToken = session?.access_token ?? null;
	const tokenIdentityRef = useRef<string | null>(null);
	const tokenEpochRef = useRef(0);
	if (tokenIdentityRef.current !== accessToken) {
		tokenIdentityRef.current = accessToken;
		tokenEpochRef.current += 1;
	}
	const managerIdentity = company?.id && currentUserId && presenceSessionId && spaceId && accessToken
		? `${company.id}:${currentUserId}:${presenceSessionId}:${spaceId}:token-${tokenEpochRef.current}`
		: null;

	// State
	const [ownedWebrtcManager, updateOwnedWebrtcManager] = useReducerState<OwnedWebRTCManager | null>(null);
	const retiredIdentityRef = useRef<string | null>(null);
	const cleanedManagersRef = useRef(new WeakSet<WebRTCManager>());
	const cleanupOwnedManager = useCallback((manager: WebRTCManager): void => {
		if (cleanedManagersRef.current.has(manager)) return;
		cleanedManagersRef.current.add(manager);
		manager.cleanup();
	}, []);
	const webrtcManager = ownedWebrtcManager && ownedWebrtcManager.identity === managerIdentity
		? ownedWebrtcManager.manager
		: null;
	const [isMuted, updateIsMutedState] = useReducerState(true); // Default: muted on entry
	const [isAudioEnabled, updateIsAudioEnabled] = useReducerState(false);
	const [isInitializing, updateIsInitializing] = useReducerState(false);
	const [micPermission, updateMicPermission] = useReducerState<MicPermissionState>('prompt');
	const [speakingUsers, updateSpeakingUsers] = useReducerState<Map<string, boolean>>(new Map());
	const [error, updateError] = useReducerState<string | null>(null);
	const [peerCount, updatePeerCount] = useReducerState(0);
	const managerRef = useRef<WebRTCManager | null>(null);
	const initializationPromiseRef = useRef<Promise<boolean> | null>(null);

	const onTerminalAuthorizationDenied = useCallback(() => {
		const current = managerRef.current;
		if (!current || current !== webrtcManager || !managerIdentity) return;
		retiredIdentityRef.current = managerIdentity;
		cleanupOwnedManager(current);
		managerRef.current = null;
		updateOwnedWebrtcManager(null);
		updateIsMutedState(true);
		updateIsAudioEnabled(false);
		updateSpeakingUsers(new Map());
		updatePeerCount(0);
	}, [cleanupOwnedManager, managerIdentity, updateIsAudioEnabled, updateIsMutedState, updateOwnedWebrtcManager, updatePeerCount, updateSpeakingUsers, webrtcManager]);

	// Setup signaling only for the currently authoritative company/session/space scope.
	const signalingGeneration = managerIdentity ?? 'incomplete-media-identity';
	const { mutedUserIds } = useAudioSignaling({
		companyId: company?.id,
		spaceId,
		currentUserId,
		presenceSessionId,
		accessToken,
		generation: signalingGeneration,
		webrtcManager,
		enabled: !!webrtcManager,
		isMuted,
		onTerminalAuthorizationDenied,
	});

	// A manager is valid only for the complete company/user/session/space/token identity.
	useEffect(() => {
		if (!managerIdentity || !company?.id || !spaceId || !currentUserId || !presenceSessionId || !accessToken || retiredIdentityRef.current === managerIdentity) {
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

		updateOwnedWebrtcManager({ manager, companyId: company.id, spaceId, userId: currentUserId, presenceSessionId, identity: managerIdentity });
		managerRef.current = manager;

		// Browser audio policy: resume any blocked audio on ANY user interaction
		const handleGlobalClick = () => {
			manager.resumeRemoteAudio();
		};
		window.addEventListener('click', handleGlobalClick, { once: false });

		return () => {
			console.log('[AudioProvider] Cleaning up manager');
			window.removeEventListener('click', handleGlobalClick);
			cleanupOwnedManager(manager);
			if (managerRef.current === manager) managerRef.current = null;
			updateOwnedWebrtcManager((current) => current?.manager === manager ? null : current);
			updateIsMutedState(true);
			updateIsAudioEnabled(false);
			updateSpeakingUsers(new Map());
			updatePeerCount(0);
		};
		}, [accessToken, cleanupOwnedManager, company?.id, currentUserId, managerIdentity, presenceSessionId, spaceId, updatePeerCount, updateSpeakingUsers, updateError, updateOwnedWebrtcManager, updateIsAudioEnabled, updateIsMutedState]);

	/**
	 * Initialize audio (must be called from user gesture for Safari)
	 */
	const initializeAudio = useCallback((): Promise<boolean> => {
		if (!webrtcManager) {
			updateError('Manager não inicializado');
			return Promise.resolve(false);
		}
		if (initializationPromiseRef.current) return initializationPromiseRef.current;

		const manager = webrtcManager;
		const initialization = (async (): Promise<boolean> => {
			updateIsInitializing(true);
			updateError(null);
			try {
				const permissionStatus = await navigator.permissions?.query?.({ name: 'microphone' as PermissionName });
				if (permissionStatus) updateMicPermission(permissionStatus.state as MicPermissionState);
				await manager.initializeLocalStream();
				if (managerRef.current !== manager) return false;
				manager.resumeRemoteAudio();
				updateMicPermission('granted');
				updateIsAudioEnabled(true);
				updateIsMutedState(false);
				manager.setMuted(false);
				return true;
			} catch (err) {
				console.error('[AudioProvider] Failed to initialize audio:', err);
				if (err instanceof DOMException) {
					if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') { updateMicPermission('denied'); updateError('Permissão de microfone negada'); }
					else if (err.name === 'NotFoundError') { updateMicPermission('unavailable'); updateError('Microfone não encontrado'); }
					else updateError(err.message);
				} else updateError('Erro ao acessar microfone');
				return false;
			} finally {
				if (managerRef.current === manager) updateIsInitializing(false);
			}
		})();
		initializationPromiseRef.current = initialization;
		void initialization.finally(() => { if (initializationPromiseRef.current === initialization) initializationPromiseRef.current = null; });
		return initialization;
	}, [updateError, updateIsInitializing, updateMicPermission, updateIsAudioEnabled, updateIsMutedState, webrtcManager]);

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
		if (managerRef.current) cleanupOwnedManager(managerRef.current);
	}, [cleanupOwnedManager]);

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
