/**
 * Voice Activity Detection Hook
 * 
 * Uses Web Audio API (AudioContext + AnalyserNode) to detect voice activity.
 * Samples RMS volume every 100ms and determines if user is speaking.
 * 
 * Safari-specific handling:
 * - AudioContext must be created after user gesture
 * - audioContext.resume() called after user gesture
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseVoiceActivityOptions {
	stream: MediaStream | null;
	enabled?: boolean;
	threshold?: number; // dB threshold, default -50dB
	sampleInterval?: number; // ms between samples, default 100ms
	onSpeakingChange?: (isSpeaking: boolean) => void;
}

interface VoiceActivityState {
	isSpeaking: boolean;
	volume: number; // Current RMS volume in dB
	isAnalyzing: boolean;
	resume: () => Promise<void>; // For Safari: resume audio context after user gesture
}

// Convert linear amplitude to decibels
function amplitudeToDb(amplitude: number): number {
	if (amplitude === 0) return -Infinity;
	return 20 * Math.log10(amplitude);
}

// Calculate RMS (Root Mean Square) from frequency data
function calculateRms(frequencyData: Uint8Array): number {
	let sum = 0;
	for (let i = 0; i < frequencyData.length; i++) {
		// Normalize to 0-1 range (frequency data is 0-255)
		const normalized = frequencyData[i] / 255;
		sum += normalized * normalized;
	}
	return Math.sqrt(sum / frequencyData.length);
}

export function useVoiceActivity({
	stream,
	enabled = true,
	threshold = -50, // -50dB default
	sampleInterval = 100, // 100ms default
	onSpeakingChange,
}: UseVoiceActivityOptions): VoiceActivityState {
	const [isSpeaking, setIsSpeaking] = useState(false);
	const [volume, setVolume] = useState(-Infinity);

	const audioContextRef = useRef<AudioContext | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const lastSampleTimeRef = useRef<number>(0);
	const wasSpeakingRef = useRef(false);

	// Resume audio context (required for Safari after user gesture)
	const resume = useCallback(async () => {
		if (audioContextRef.current?.state === 'suspended') {
			await audioContextRef.current.resume();
		}
	}, []);

	useEffect(() => {
		if (!stream || !enabled) {
			return;
		}

		// Create audio context if not exists
		if (!audioContextRef.current) {
			audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
		}

		const audioContext = audioContextRef.current;

		// Safari: Resume suspended context
		if (audioContext.state === 'suspended') {
			audioContext.resume().catch(console.error);
		}

		// Create analyser node
		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;
		analyser.smoothingTimeConstant = 0.3;
		analyserRef.current = analyser;

		// Connect stream to analyser
		const source = audioContext.createMediaStreamSource(stream);
		source.connect(analyser);
		sourceRef.current = source;

		// Frequency data buffer
		const frequencyData = new Uint8Array(analyser.frequencyBinCount);

		// Animation loop for sampling
		const analyze = (timestamp: number) => {
			// Throttle to sampleInterval
			if (timestamp - lastSampleTimeRef.current < sampleInterval) {
				animationFrameRef.current = requestAnimationFrame(analyze);
				return;
			}
			lastSampleTimeRef.current = timestamp;

			// Get frequency data
			analyser.getByteFrequencyData(frequencyData);

			// Calculate RMS and convert to dB
			const rms = calculateRms(frequencyData);
			const volumeDb = amplitudeToDb(rms);
			setVolume(volumeDb);

			// Determine speaking state
			const speaking = volumeDb > threshold;
			setIsSpeaking(speaking);

			// Notify on change
			if (speaking !== wasSpeakingRef.current) {
				wasSpeakingRef.current = speaking;
				onSpeakingChange?.(speaking);
			}

			animationFrameRef.current = requestAnimationFrame(analyze);
		};

		animationFrameRef.current = requestAnimationFrame(analyze);

		return () => {
			// Cleanup
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}

			if (sourceRef.current) {
				sourceRef.current.disconnect();
				sourceRef.current = null;
			}

			if (analyserRef.current) {
				analyserRef.current.disconnect();
				analyserRef.current = null;
			}

		};
	}, [stream, enabled, threshold, sampleInterval, onSpeakingChange]);

		// Cleanup audio context on unmount
		useEffect(() => {
			const closeAudioContext = () => {
				if (audioContextRef.current) {
					audioContextRef.current.close().catch(console.error);
					audioContextRef.current = null;
				}
			};
			return closeAudioContext;
		}, []);

	return {
		isSpeaking,
		volume,
		isAnalyzing: Boolean(stream && enabled),
		resume,
	};
}
