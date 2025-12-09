/**
 * Voice Activity Detector (VAD)
 * 
 * Analyzes an audio stream using Web Audio API to detect speech.
 * Used for both local (Visualizer) and remote (Avatar indicators) streams.
 */

export interface VADOptions {
	threshold?: number; // dB threshold, default -50
	interval?: number;  // check interval ms, default 100
	onSpeakingChange?: (isSpeaking: boolean, volume: number) => void;
}

export class VoiceActivityDetector {
	private audioContext: AudioContext;
	private analyser: AnalyserNode;
	private source: MediaStreamAudioSourceNode | null = null;
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private isSpeaking: boolean = false;
	private stream: MediaStream;
	private options: VADOptions;

	constructor(stream: MediaStream, options: VADOptions = {}) {
		this.stream = stream;
		this.options = {
			threshold: -40, // Increased from -50 to reduce false positives
			interval: 100,
			...options
		};

		// Initialize Audio Context (lazily or immediately?)
		// Need to handle browser compatibility
		const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
		this.audioContext = new AudioContextClass();
		this.analyser = this.audioContext.createAnalyser();
		this.analyser.fftSize = 256;
		this.analyser.smoothingTimeConstant = 0.3;

		this.start();
	}

	start() {
		if (this.source) return;

		try {
			this.source = this.audioContext.createMediaStreamSource(this.stream);
			this.source.connect(this.analyser);

			// Resume context if suspended (important for remote streams)
			if (this.audioContext.state === 'suspended') {
				this.audioContext.resume().catch(err => {
					console.warn('[VAD] Failed to resume audio context:', err);
				});
			}

			const bufferLength = this.analyser.fftSize;
			const dataArray = new Uint8Array(bufferLength);

			this.intervalId = setInterval(() => {
				// Use TimeDomainData for proper RMS volume calculation
				this.analyser.getByteTimeDomainData(dataArray);
				const volume = this.calculateVolume(dataArray);

				// Hysteresis can be added here if needed, but simple threshold is fine for MVP
				const speaking = volume > (this.options.threshold!);

				if (speaking !== this.isSpeaking) {
					this.isSpeaking = speaking;
					this.options.onSpeakingChange?.(speaking, volume);
				}
			}, this.options.interval);
		} catch (err) {
			console.error('Failed to start VAD:', err);
		}
	}

	private calculateVolume(dataArray: Uint8Array): number {
		let sum = 0;
		// 128 is zero-amplitude in 8-bit time domain data
		for (let i = 0; i < dataArray.length; i++) {
			const amplitude = (dataArray[i] - 128) / 128; // Normalize to -1..1
			sum += amplitude * amplitude;
		}
		const rms = Math.sqrt(sum / dataArray.length);
		if (rms === 0) return -Infinity;
		return 20 * Math.log10(rms);
	}

	stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		if (this.source) {
			this.source.disconnect();
			this.source = null;
		}
		// Don't close AudioContext if shared? 
		// Usually VAD has its own AC or we pass one in.
		// For simplicity, we close it to free resources.
		if (this.audioContext.state !== 'closed') {
			this.audioContext.close();
		}
	}
}
