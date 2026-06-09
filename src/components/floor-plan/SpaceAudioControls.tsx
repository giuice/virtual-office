/**
 * Space Audio Controls Component
 * 
 * Provides mic toggle, audio status, and permission handling for P2P audio.
 * Story 8A.4: Mic Controls & Default State
 * 
 * Features:
 * - Mic toggle with Lucide icons
 * - Keyboard shortcut: M to toggle
 * - Permission denied UI
 * - Safari audio enable button
 */

'use client';

import React, { useEffect, useCallback } from 'react';
import { Mic, MicOff, AlertCircle, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAudio } from '@/contexts/AudioContext';
import { useVoiceActivity } from '@/hooks/useVoiceActivity';

interface SpaceAudioControlsProps {
	className?: string;
	onSpeakingChange?: (isSpeaking: boolean) => void;
}

export function SpaceAudioControls({ className, onSpeakingChange }: SpaceAudioControlsProps) {
	const {
		webrtcManager,
		isMuted,
		isAudioEnabled,
		isInitializing,
		micPermission,
		error,
		initializeAudio,
		toggleMute,
		peerCount,
	} = useAudio();

	// Voice Activity Detection
	const localStream = webrtcManager?.getLocalStream() ?? null;
	const { isSpeaking } = useVoiceActivity({
		stream: localStream,
		enabled: isAudioEnabled && !isMuted,
		onSpeakingChange,
	});

	// Keyboard shortcut: M to toggle mute (only when not typing)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			// Ignore if user is typing in any input field or contenteditable
			const isTyping =
				['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) ||
				target?.isContentEditable ||
				target?.closest('[contenteditable="true"]');

			if (e.key.toLowerCase() === 'm' && !isTyping) {
				e.preventDefault();
				if (isAudioEnabled) {
					toggleMute();
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isAudioEnabled, toggleMute]);

	// Handle enable audio click
	const handleEnableAudio = useCallback(async () => {
		await initializeAudio();
	}, [initializeAudio]);

	// Permission denied state - icon only
	if (micPermission === 'denied') {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={cn('size-9 text-destructive', className)}
							disabled
						>
							<MicOff className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>Permissão de microfone negada</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	// Audio not initialized - show enable button (icon only)
	if (!isAudioEnabled) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={cn('size-9', className)}
							onClick={handleEnableAudio}
							disabled={isInitializing}
						>
							{isInitializing ? (
								<span className="size-4 animate-pulse">●</span>
							) : (
								<Mic className="size-4 text-muted-foreground" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>Entrar no áudio</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	// Error state with retry button (icon only)
	if (error) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={cn('size-9 text-amber-500', className)}
							onClick={handleEnableAudio}
						>
							<AlertCircle className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>{error} - Clique para tentar novamente</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	// Audio enabled - show mic toggle (icon only)
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant={isMuted ? 'ghost' : 'default'}
						size="icon"
						onClick={toggleMute}
						className={cn(
							'size-9 transition-all duration-200',
							!isMuted && isSpeaking && 'ring-2 ring-green-500 ring-offset-2',
							className
						)}
					>
						{isMuted ? (
							<MicOff className="size-4 text-muted-foreground" />
						) : (
							<Mic className={cn(
								'size-4',
								isSpeaking ? 'text-green-500' : 'text-foreground'
							)} />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>{isMuted ? 'Ativar microfone (M)' : 'Desativar microfone (M)'}</p>
					{peerCount > 0 && (
						<p className="text-xs text-muted-foreground">{peerCount} conectado{peerCount > 1 ? 's' : ''}</p>
					)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
