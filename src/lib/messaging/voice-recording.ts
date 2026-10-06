// src/lib/messaging/voice-recording.ts
// Browser side of voice-note recording (Phase 4 T16: FR-013, FR-014, FR-017).
// Pure helpers used by the composer recorder; the storage contract (limits,
// containers, waveform bounds) lives in attachment-policy.ts and is reused
// here, never redefined.
import {
  MAX_VOICE_NOTE_DURATION_SECONDS,
  VOICE_NOTE_RECORDER_MIME_TYPES,
  VOICE_NOTE_WAVEFORM_MAX_SAMPLES,
  mimeTypeEssence,
} from '@/lib/messaging/attachment-policy';

/** The recording-limit warning shows during the last 10 seconds (FR-014: from 1:50). */
export const VOICE_NOTE_WARNING_SECONDS = MAX_VOICE_NOTE_DURATION_SECONDS - 10;

/**
 * Recorder bitrate: 32 kbps Opus/AAC is clear for speech and about 4 KB/s,
 * far below the server's size bound (40 KB/s × duration + 64 KB).
 */
export const VOICE_NOTE_RECORDER_BITS_PER_SECOND = 32_000;

/** How often the live level is sampled (live waveform, stored summary, timer). */
export const VOICE_NOTE_LEVEL_SAMPLE_INTERVAL_MS = 100;

/** Number of bars in the live waveform. */
export const VOICE_NOTE_LIVE_LEVEL_COUNT = 32;

export type VoiceRecordingSupport = 'unknown' | 'supported' | 'unsupported';

/** Why recording could not start or continue. */
export type VoiceRecordingProblem =
  | 'denied'
  | 'no-device'
  | 'busy'
  | 'unsupported'
  | 'failed'
  | 'files-pending'
  | 'voice-pending';

/** First MediaRecorder type of the storage contract this browser records; null when none. */
export function pickVoiceNoteRecorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null;
  }
  return VOICE_NOTE_RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/**
 * Whether this browser can record a voice note: microphone capture (only
 * offered in secure contexts), MediaRecorder, and one accepted container.
 */
export function detectVoiceRecordingSupport(): VoiceRecordingSupport {
  if (typeof window === 'undefined') return 'unknown';
  const canCapture = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
  return canCapture && pickVoiceNoteRecorderMimeType() !== null ? 'supported' : 'unsupported';
}

/** Maps a getUserMedia/MediaRecorder failure to what the user is told. */
export function classifyMicrophoneError(error: unknown): VoiceRecordingProblem {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no-device';
    case 'NotSupportedError':
      return 'unsupported';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    default:
      return 'failed';
  }
}

export interface VoiceRecordingProblemText {
  reason: string;
  guidance: string;
}

const TEXT_AND_FILES_STILL_WORK = 'Você ainda pode enviar texto e arquivos.';

/** Reason and how to fix it, shown in the composer (FR-017). */
export function describeVoiceRecordingProblem(problem: VoiceRecordingProblem): VoiceRecordingProblemText {
  switch (problem) {
    case 'denied':
      return {
        reason: 'O acesso ao microfone foi negado.',
        guidance: `Para gravar, permita o microfone para este site nas configurações do navegador (ícone ao lado do endereço) e tente de novo. ${TEXT_AND_FILES_STILL_WORK}`,
      };
    case 'no-device':
      return {
        reason: 'Nenhum microfone encontrado.',
        guidance: `Conecte um microfone, confira se o sistema o reconhece e tente de novo. ${TEXT_AND_FILES_STILL_WORK}`,
      };
    case 'busy':
      return {
        reason: 'Não foi possível usar o microfone.',
        guidance: `Ele pode estar em uso por outro aplicativo: feche-o e tente de novo. ${TEXT_AND_FILES_STILL_WORK}`,
      };
    case 'unsupported':
      return {
        reason: 'Este navegador não permite gravar notas de voz.',
        guidance: `Use a versão atual do Chrome ou do Edge, em uma conexão segura (https). ${TEXT_AND_FILES_STILL_WORK}`,
      };
    case 'files-pending':
      return {
        reason: 'Uma nota de voz é enviada sozinha.',
        guidance: 'Envie ou remova os arquivos anexados antes de gravar.',
      };
    case 'voice-pending':
      return {
        reason: 'Esta mensagem já tem uma nota de voz.',
        guidance: 'Envie ou descarte a nota antes de gravar outra.',
      };
    case 'failed':
    default:
      return {
        reason: 'A gravação falhou.',
        guidance: `Tente gravar de novo. ${TEXT_AND_FILES_STILL_WORK}`,
      };
  }
}

/** Peak amplitude (0–1) of one AnalyserNode time-domain frame (bytes centred on 128). */
export function peakLevel(frame: Uint8Array): number {
  let peak = 0;
  for (let index = 0; index < frame.length; index += 1) {
    const deviation = Math.abs(frame[index] - 128);
    if (deviation > peak) peak = deviation;
  }
  return Math.min(1, peak / 128);
}

/**
 * Stored waveform summary: at most VOICE_NOTE_WAVEFORM_MAX_SAMPLES buckets
 * (peak of each), scaled so the loudest bucket is 1 and rounded to 3
 * decimals — always 1–256 numbers in [0, 1], as the upload contract needs.
 */
export function summarizeVoiceNoteWaveform(levels: readonly number[]): number[] {
  if (levels.length === 0) return [0];
  const bucketCount = Math.min(VOICE_NOTE_WAVEFORM_MAX_SAMPLES, levels.length);
  const buckets: number[] = [];
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor((bucket * levels.length) / bucketCount);
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * levels.length) / bucketCount));
    let peak = 0;
    for (let index = start; index < end; index += 1) {
      const level = levels[index];
      if (Number.isFinite(level) && level > peak) peak = level;
    }
    buckets.push(peak);
  }
  const loudest = Math.max(...buckets);
  return buckets.map((level) =>
    loudest > 0 ? Math.min(1, Math.max(0, Math.round((level / loudest) * 1000) / 1000)) : 0
  );
}

/**
 * Duration claimed for the upload: decimal seconds, 3 decimals, clamped to
 * the product limit (the server refuses anything above 120.000).
 */
export function voiceNoteDurationClaim(elapsedMs: number): number {
  const seconds = Math.min(MAX_VOICE_NOTE_DURATION_SECONDS, Math.max(0.001, elapsedMs / 1000));
  return Math.round(seconds * 1000) / 1000;
}

/** "m:ss" for the timer and the preview. */
export function formatVoiceNoteTime(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** File name of a recording (the server stores the extension of the verified container). */
export function voiceNoteFileName(mimeType: string): string {
  return mimeTypeEssence(mimeType) === 'audio/mp4' ? 'nota-de-voz.m4a' : 'nota-de-voz.webm';
}
