'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, Mic, MicOff, RotateCcw, Square, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { WaveformBars, fitWaveform } from '@/components/messaging/VoiceWaveform';
import type { PendingAttachment } from '@/hooks/ui/use-composer-attachments';
import type { VoiceRecorderStatus } from '@/hooks/ui/use-voice-recorder';
import { MAX_VOICE_NOTE_DURATION_SECONDS } from '@/lib/messaging/attachment-policy';
import {
  VOICE_NOTE_LIVE_LEVEL_COUNT,
  VOICE_NOTE_WARNING_SECONDS,
  describeVoiceRecordingProblem,
  formatVoiceNoteTime,
  type VoiceRecordingProblem,
} from '@/lib/messaging/voice-recording';
import { cn } from '@/lib/utils';

const LIMIT_TEXT = formatVoiceNoteTime(MAX_VOICE_NOTE_DURATION_SECONDS);
const PREVIEW_BAR_COUNT = 48;

/** The stored waveform as preview bars (raw when short, peak per group when long). */
function previewBars(waveform: readonly number[]): number[] {
  if (waveform.length <= PREVIEW_BAR_COUNT) return [...waveform];
  return fitWaveform(waveform, PREVIEW_BAR_COUNT);
}

interface VoiceRecordingPanelProps {
  status: VoiceRecorderStatus;
  elapsedMs: number;
  levels: readonly number[];
  /** The room mic was muted for this recording (FR-016). */
  roomMicMuted: boolean;
  onStop: () => void;
  onCancel: () => void;
}

/**
 * Live recording: indicator, waveform, timer, limit warning, room-mic notice,
 * stop and discard (FR-013, FR-014, FR-016).
 */
export function VoiceRecordingPanel({ status, elapsedMs, levels, roomMicMuted, onStop, onCancel }: VoiceRecordingPanelProps) {
  const stopRef = useRef<HTMLButtonElement>(null);
  const elapsedSeconds = elapsedMs / 1000;
  const showWarning = elapsedSeconds >= VOICE_NOTE_WARNING_SECONDS;
  const isStarting = status === 'starting';

  // Keyboard users land on "Parar" as soon as recording starts.
  useEffect(() => {
    if (status === 'recording') stopRef.current?.focus();
  }, [status]);

  return (
    <div
      className="mb-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs"
      data-testid="voice-recording-panel"
      data-recorder-status={status}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn('size-2 shrink-0 rounded-full bg-destructive', !isStarting && 'animate-pulse')}
          aria-hidden="true"
        />
        <span role="status" className="shrink-0 font-medium text-destructive">
          {isStarting ? 'Abrindo o microfone…' : 'Gravando'}
        </span>
        <WaveformBars
          levels={levels}
          barCount={VOICE_NOTE_LIVE_LEVEL_COUNT}
          className="text-destructive"
          testId="voice-recording-waveform"
        />
        <span
          role="timer"
          aria-label="Tempo de gravação"
          className="shrink-0 tabular-nums text-muted-foreground"
          data-testid="voice-recording-timer"
        >
          {formatVoiceNoteTime(elapsedSeconds)} / {LIMIT_TEXT}
        </span>
        <Button
          ref={stopRef}
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onStop}
          disabled={status !== 'recording'}
          aria-label="Parar gravação"
          title="Parar gravação"
          data-testid="voice-recording-stop"
        >
          <Square className="size-3.5 fill-current" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onCancel}
          aria-label="Descartar gravação"
          title="Descartar gravação"
          data-testid="voice-recording-cancel"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      {roomMicMuted && (
        <p
          role="status"
          className="mt-1 flex items-center gap-1 text-muted-foreground"
          data-testid="voice-recording-room-mic-notice"
        >
          <MicOff className="size-3 shrink-0" aria-hidden="true" />
          <span>Microfone da sala silenciado durante a gravação; ele volta ao parar.</span>
        </p>
      )}
      {showWarning && (
        <p role="alert" className="mt-1 font-medium text-destructive" data-testid="voice-recording-limit-warning">
          Faltam 10 segundos: a gravação para automaticamente em {LIMIT_TEXT}.
        </p>
      )}
    </div>
  );
}

function voiceNoteSummary(item: PendingAttachment): string {
  if (item.status === 'failed') return 'A nota de voz não foi enviada: tente de novo ou descarte.';
  if (item.status === 'uploading') return 'Preparando a nota de voz…';
  return 'Nota de voz pronta para enviar.';
}

interface PendingVoiceNotePreviewProps {
  item: PendingAttachment;
  /** The note can not be discarded while a send that carries it is in flight. */
  locked: boolean;
  onDiscard: (localId: string) => void;
  onRetry: (localId: string) => void;
}

/** The recorded note before sending: playback preview, upload state, retry, and discard (FR-013). */
export function PendingVoiceNotePreview({ item, locked, onDiscard, onRetry }: PendingVoiceNotePreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const voice = item.voice;

  // After stopping, focus moves to the preview player.
  useEffect(() => {
    audioRef.current?.focus();
  }, []);

  if (!voice) return null;
  const durationText = formatVoiceNoteTime(Math.ceil(voice.durationSeconds));

  return (
    <div
      className={cn(
        'mb-2 rounded-md border px-2 py-1.5 text-xs',
        item.status === 'failed' ? 'border-destructive/50 bg-destructive/5' : 'bg-secondary/40'
      )}
      data-testid="voice-note-preview"
      data-upload-status={item.status}
      data-duration-seconds={voice.durationSeconds}
      data-waveform-samples={voice.waveform.length}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Mic className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 font-medium">Nota de voz</span>
        <span className="shrink-0 tabular-nums text-muted-foreground" data-testid="voice-note-preview-duration">
          {durationText}
        </span>
        <WaveformBars
          levels={previewBars(voice.waveform)}
          barCount={PREVIEW_BAR_COUNT}
          className="text-primary"
          testId="voice-note-preview-waveform"
        />
        {item.status === 'failed' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => onRetry(item.localId)}
            aria-label="Tentar enviar a nota de voz de novo"
            title="Tentar de novo"
            data-testid="voice-note-retry"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => onDiscard(item.localId)}
          disabled={locked && item.status === 'uploaded'}
          aria-label="Descartar nota de voz"
          title="Descartar nota de voz"
          data-testid="voice-note-discard"
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={voice.previewUrl}
        aria-label="Ouvir prévia da nota de voz"
        className="mt-1 h-8 w-full"
        data-testid="voice-note-preview-audio"
      />
      {item.status === 'uploading' && (
        <div
          role="progressbar"
          aria-label="Enviando nota de voz"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={item.progress}
          className="mt-1 h-1 w-full overflow-hidden rounded bg-muted"
          data-testid="voice-note-progress"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${item.progress}%` }} />
        </div>
      )}
      {item.status === 'failed' && (
        <p role="alert" className="mt-1 flex items-center gap-1 text-destructive" data-testid="voice-note-error">
          <AlertCircle className="size-3 shrink-0" aria-hidden="true" />
          <span>{item.error}</span>
        </p>
      )}
      <p role="status" className="mt-1 text-muted-foreground" data-testid="voice-note-status">
        {voice.reachedLimit ? `A gravação parou no limite de ${LIMIT_TEXT}. ` : ''}
        {voiceNoteSummary(item)}
      </p>
    </div>
  );
}

/** Why recording is unavailable and how to fix it (FR-017); text and files keep working. */
export function VoiceRecordingNotice({
  problem,
  onDismiss,
}: {
  problem: VoiceRecordingProblem;
  onDismiss: () => void;
}) {
  const { reason, guidance } = describeVoiceRecordingProblem(problem);
  return (
    <div
      role="alert"
      className="mb-2 flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
      data-testid="voice-recording-notice"
      data-problem={problem}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 break-words">
        <p className="font-medium" data-testid="voice-recording-notice-reason">
          {reason}
        </p>
        <p data-testid="voice-recording-notice-guidance">{guidance}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        onClick={onDismiss}
        aria-label="Fechar aviso do microfone"
        data-testid="voice-recording-notice-dismiss"
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
