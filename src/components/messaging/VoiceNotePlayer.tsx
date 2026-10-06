'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertCircle, Download, Loader2, Pause, Play, RotateCcw } from 'lucide-react';

import { WaveformBars, fitWaveform } from '@/components/messaging/VoiceWaveform';
import { buttonVariants } from '@/components/ui/button-variants';
import { attachmentDownloadUrl } from '@/lib/messaging/attachment-display';
import { formatVoiceNoteTime } from '@/lib/messaging/voice-recording';
import { cn } from '@/lib/utils';
import type { VoiceNoteAttachment } from '@/types/messaging';

// Feed player of a voice note (Phase 4 FR-015, FR-019, AC-017, AC-022, AC-037).
//
// - Total time and progress come from the STORED duration: Chrome's
//   MediaRecorder WebM has no duration header, so the media element reports
//   Infinity (or 0) until it has played through (TRACK T16). The element's own
//   duration is never read.
// - Content is read through the authorized route (`attachment.url`), which
//   redirects to a fresh 300 s signed URL. Nothing is requested until the first
//   play (no preload), and no signed URL is kept: when a read fails (e.g. the
//   signed URL expired while the feed stayed open) the player asks the route
//   again once, by itself, and resumes where it was.
// - A browser that cannot play the format (canPlayType '' up front, or a
//   decode/format error while the route itself still answers) shows a clear
//   message with a download instead of a dead control; a failed read that is
//   not the format offers a retry.
// - One note plays at a time in the tab: starting one pauses the others.

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'unsupported' | 'failed';

const BAR_COUNT = 40;

/** The feed player currently allowed to sound; starting another pauses it. */
let activeAudio: HTMLAudioElement | null = null;

function claimPlayback(audio: HTMLAudioElement): void {
  if (activeAudio && activeAudio !== audio) activeAudio.pause();
  activeAudio = audio;
}

function releasePlayback(audio: HTMLAudioElement): void {
  if (activeAudio === audio) activeAudio = null;
}

const subscribeToNothing = () => () => {};

const playableTypes = new Map<string, boolean>();

/** '' from canPlayType means the browser knows it cannot play this type. */
function canPlayAudioType(type: string): boolean {
  let playable = playableTypes.get(type);
  if (playable === undefined) {
    playable = document.createElement('audio').canPlayType(type) !== '';
    playableTypes.set(type, playable);
  }
  return playable;
}

/**
 * A format error is ambiguous in Chrome (it also covers an HTTP error on the
 * source). If the authorized route still answers with its redirect, the
 * content is reachable and the browser could not decode it.
 */
async function classifySourceFailure(url: string): Promise<'unsupported' | 'failed'> {
  try {
    const response = await fetch(url, { redirect: 'manual', cache: 'no-store', credentials: 'same-origin' });
    return response.type === 'opaqueredirect' ? 'unsupported' : 'failed';
  } catch {
    return 'failed';
  }
}

/** The route url, made distinct per reload so the browser cannot reuse a stale redirect. */
function sourceUrl(url: string, generation: number): string {
  if (generation === 0) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${generation}`;
}

interface VoiceNotePlayerProps {
  attachment: VoiceNoteAttachment;
  /** The message is still being sent: the note is not readable yet. */
  pending: boolean;
}

export function VoiceNotePlayer({ attachment, pending }: VoiceNotePlayerProps) {
  const supported = useSyncExternalStore(subscribeToNothing, () => canPlayAudioType(attachment.type), () => true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const [retries, setRetries] = useState(0);
  const [state, setState] = useState<PlayerState>('idle');
  const [position, setPosition] = useState(0);
  // Transient playback bookkeeping (not rendered).
  const playback = useRef({ generation: -1, wantsPlay: false, recovered: false, lastPosition: 0, resumeAt: 0 });
  const mounted = useRef(true);

  const duration = attachment.duration;
  const durationText = formatVoiceNoteTime(duration);
  const shownPosition = state === 'ended' ? 0 : Math.min(position, duration);
  const progress = duration > 0 ? shownPosition / duration : 0;
  const positionText = formatVoiceNoteTime(shownPosition);
  const bars = fitWaveform(attachment.waveformData ?? [], BAR_COUNT);
  const downloadUrl = attachmentDownloadUrl(attachment.url);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The element exists once the message is sent; forget it when it goes away.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) releasePlayback(audio);
    };
  }, [pending]);

  // The retry control disappears on click; keep keyboard focus on the player.
  useEffect(() => {
    if (retries > 0) playButtonRef.current?.focus();
  }, [retries]);

  const loadSource = (audio: HTMLAudioElement) => {
    playback.current.generation += 1;
    // Setting src restarts the media load, which requests the route again.
    audio.src = sourceUrl(attachment.url, playback.current.generation);
  };

  const startPlayback = (audio: HTMLAudioElement) => {
    playback.current.wantsPlay = true;
    claimPlayback(audio);
    setState('loading');
    audio.play().catch((error: unknown) => {
      // Load failures arrive through the element's error event; a reload
      // (new src) aborts the pending play on purpose.
      if (error instanceof DOMException && error.name === 'NotAllowedError' && mounted.current) {
        playback.current.wantsPlay = false;
        setState('paused');
      }
    });
  };

  const handlePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    playback.current.recovered = false;
    if (playback.current.generation < 0 || audio.error) loadSource(audio);
    startPlayback(audio);
  };

  const handlePause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    playback.current.wantsPlay = false;
    audio.pause();
  };

  const handleRetry = () => {
    const audio = audioRef.current;
    if (!audio) return;
    playback.current.recovered = false;
    playback.current.resumeAt = playback.current.lastPosition;
    loadSource(audio);
    startPlayback(audio);
    setRetries((count) => count + 1);
  };

  const onMediaError = () => {
    const audio = audioRef.current;
    const code = audio?.error?.code;
    if (!audio || !code || code === MediaError.MEDIA_ERR_ABORTED) return;
    if (code === MediaError.MEDIA_ERR_DECODE) {
      playback.current.wantsPlay = false;
      setState('unsupported');
      return;
    }
    if (!playback.current.recovered) {
      // First failure of this attempt: read through the route again (fresh
      // signed URL) and continue from the last position.
      playback.current.recovered = true;
      playback.current.resumeAt = playback.current.lastPosition;
      loadSource(audio);
      if (playback.current.wantsPlay) startPlayback(audio);
      return;
    }
    playback.current.wantsPlay = false;
    if (code === MediaError.MEDIA_ERR_NETWORK) {
      setState('failed');
      return;
    }
    void classifySourceFailure(attachment.url).then((result) => {
      if (mounted.current) setState(result);
    });
  };

  const onLoadedMetadata = () => {
    const audio = audioRef.current;
    const resumeAt = playback.current.resumeAt;
    if (!audio || resumeAt <= 0) return;
    playback.current.resumeAt = 0;
    try {
      audio.currentTime = resumeAt;
    } catch {
      // Not seekable yet: playback restarts from the beginning.
    }
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    playback.current.lastPosition = audio.currentTime;
    setPosition(audio.currentTime);
  };

  const onEnded = () => {
    const audio = audioRef.current;
    playback.current.wantsPlay = false;
    playback.current.lastPosition = 0;
    if (audio) releasePlayback(audio);
    setPosition(0);
    setState('ended');
  };

  const onPaused = () => {
    const audio = audioRef.current;
    // A stale pause from a reload arrives after play() resumed: ignore it.
    if (!audio || !audio.paused || audio.ended || audio.error) return;
    playback.current.wantsPlay = false;
    setState((current) => (current === 'playing' || current === 'loading' ? 'paused' : current));
  };

  if (!supported || state === 'unsupported') {
    return (
      <div
        role="group"
        aria-label={`Nota de voz, ${durationText}`}
        className="flex w-60 min-w-0 max-w-full items-start gap-2 rounded-md border bg-background/90 p-2 text-xs text-foreground"
        data-testid="voice-note-player"
        data-attachment-id={attachment.id}
        data-player-state="unsupported"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1" role="status" data-testid="voice-note-unsupported">
          Este navegador não consegue reproduzir esta nota de voz ({durationText}). Baixe o arquivo para ouvir.
        </p>
        <a
          href={downloadUrl}
          download={attachment.name}
          aria-label="Baixar nota de voz"
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-8 shrink-0')}
        >
          <Download aria-hidden="true" />
        </a>
      </div>
    );
  }

  // 'loading' only follows a play request (or a failure being checked).
  const isPlaying = state === 'playing' || state === 'loading';
  const isBusy = state === 'loading';
  const buttonLabel = pending ? 'Enviando nota de voz' : isPlaying ? 'Pausar nota de voz' : 'Reproduzir nota de voz';

  return (
    <div
      role="group"
      aria-label={`Nota de voz, ${durationText}`}
      className="flex w-60 min-w-0 max-w-full flex-col gap-1"
      data-testid="voice-note-player"
      data-attachment-id={attachment.id}
      data-player-state={pending ? 'pending' : state}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          ref={playButtonRef}
          type="button"
          className={cn(
            buttonVariants({ variant: 'secondary', size: 'icon' }),
            'size-8 shrink-0 rounded-full text-foreground'
          )}
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={pending || state === 'failed'}
          aria-label={buttonLabel}
          aria-busy={isBusy || undefined}
          data-testid="voice-note-play"
        >
          {pending || isBusy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : isPlaying ? (
            <Pause className="size-4 fill-current" aria-hidden="true" />
          ) : (
            <Play className="size-4 fill-current" aria-hidden="true" />
          )}
        </button>
        <div
          role="progressbar"
          aria-label="Progresso da nota de voz"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={Math.floor(shownPosition)}
          aria-valuetext={`${positionText} de ${durationText}`}
          className="relative flex h-6 min-w-0 flex-1"
          data-testid="voice-note-progress"
          data-progress={progress.toFixed(3)}
        >
          <WaveformBars levels={bars} barCount={BAR_COUNT} className="opacity-40" testId="voice-note-waveform" />
          <div
            className="absolute inset-0 flex"
            style={{ clipPath: `inset(0 ${(100 - progress * 100).toFixed(2)}% 0 0)` }}
            aria-hidden="true"
          >
            <WaveformBars levels={bars} barCount={BAR_COUNT} />
          </div>
        </div>
        <span className="shrink-0 tabular-nums text-xs opacity-80" aria-hidden="true" data-testid="voice-note-time">
          {positionText} / {durationText}
        </span>
      </div>
      {state === 'failed' && (
        <div className="flex min-w-0 items-center gap-1 text-xs" role="alert" data-testid="voice-note-failed">
          <AlertCircle className="size-3 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">Não foi possível carregar a nota de voz.</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={handleRetry}
            aria-label="Tentar carregar a nota de voz de novo"
          >
            <RotateCcw className="size-3" aria-hidden="true" />
            Tentar de novo
          </button>
        </div>
      )}
      {!pending && (
        <audio
          ref={audioRef}
          preload="none"
          className="hidden"
          data-testid="voice-note-audio"
          onPlaying={() => setState('playing')}
          onWaiting={() => {
            if (playback.current.wantsPlay) setState('loading');
          }}
          onPause={onPaused}
          onEnded={onEnded}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onError={onMediaError}
        />
      )}
    </div>
  );
}
