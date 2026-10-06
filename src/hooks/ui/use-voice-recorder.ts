import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { MAX_VOICE_NOTE_DURATION_SECONDS } from '@/lib/messaging/attachment-policy';
import {
  VOICE_NOTE_LEVEL_SAMPLE_INTERVAL_MS,
  VOICE_NOTE_LIVE_LEVEL_COUNT,
  VOICE_NOTE_RECORDER_BITS_PER_SECOND,
  classifyMicrophoneError,
  detectVoiceRecordingSupport,
  peakLevel,
  pickVoiceNoteRecorderMimeType,
  summarizeVoiceNoteWaveform,
  voiceNoteDurationClaim,
  type VoiceRecordingProblem,
  type VoiceRecordingSupport,
} from '@/lib/messaging/voice-recording';
import {
  isRoomMicMutedForRecording,
  muteRoomMicForRecording,
  subscribeRoomMicRecordingHold,
} from '@/lib/webrtc/room-mic-recording-hold';

export type VoiceRecorderStatus = 'idle' | 'starting' | 'recording' | 'stopping';

/** A finished recording, ready to preview and upload as a voice note. */
export interface VoiceRecording {
  blob: Blob;
  /** The recorder's MIME type (e.g. "audio/webm;codecs=opus"). */
  mimeType: string;
  /** Decimal seconds, 0 < d <= 120. */
  durationSeconds: number;
  /** 1–256 amplitudes in [0, 1]. */
  waveform: number[];
  /** True when the 2-minute limit stopped the recording (FR-014). */
  reachedLimit: boolean;
}

interface LiveState {
  elapsedMs: number;
  /** Most recent levels (0–1), oldest first, for the live waveform. */
  levels: number[];
}

/** Everything a running recording holds; released as one unit. */
interface RecordingSession {
  id: number;
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  levels: number[];
  startedAt: number;
  stoppedAt: number | null;
  reachedLimit: boolean;
  sampleTimer: ReturnType<typeof setInterval> | null;
  limitTimer: ReturnType<typeof setTimeout> | null;
  /** Reopens the room mic if this recording muted it (T17, FR-016). */
  releaseRoomMic: (() => void) | null;
}

const EMPTY_LIVE: LiveState = { elapsedMs: 0, levels: [] };
const MAX_DURATION_MS = MAX_VOICE_NOTE_DURATION_SECONDS * 1000;

const subscribeToNothing = () => () => {};
const serverSupport = (): VoiceRecordingSupport => 'unknown';
const serverRoomMicMuted = () => false;

function releaseSession(session: RecordingSession): void {
  if (session.sampleTimer !== null) clearInterval(session.sampleTimer);
  if (session.limitTimer !== null) clearTimeout(session.limitTimer);
  session.sampleTimer = null;
  session.limitTimer = null;
  session.stream?.getTracks().forEach((track) => track.stop());
  session.stream = null;
  if (session.audioContext && session.audioContext.state !== 'closed') {
    void session.audioContext.close().catch(() => {});
  }
  session.audioContext = null;
  // Every way a recording ends (stop, cancel, failure, conversation change,
  // unmount) passes here, so the room mic is never left muted by it.
  session.releaseRoomMic?.();
  session.releaseRoomMic = null;
}

function createAudioContext(): AudioContext | null {
  const AudioContextClass =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    return new AudioContextClass();
  } catch {
    return null;
  }
}

/**
 * Microphone recorder of the composer (Phase 4 T16: FR-013, FR-014, FR-017).
 *
 * `start` asks for the microphone and records with MediaRecorder in the first
 * container of the storage contract the browser supports, sampling the live
 * level through a Web Audio AnalyserNode for the waveform and the timer. The
 * recording stops by `stop`, by the 2-minute limit, or when the microphone
 * goes away; the finished recording is handed to `onRecorded`. `cancel`
 * drops it. The microphone is released on stop, cancel, failure, conversation
 * change, and unmount — no recording outlives its composer. While it
 * records, an open spatial-audio room mic is muted and reopened when the
 * recording ends (T17, FR-016; rules in room-mic-recording-hold).
 */
export function useVoiceRecorder({
  conversationId,
  onRecorded,
}: {
  conversationId: string | null;
  onRecorded: (recording: VoiceRecording) => void;
}) {
  const support = useSyncExternalStore(subscribeToNothing, detectVoiceRecordingSupport, serverSupport);
  const roomMicHeld = useSyncExternalStore(
    subscribeRoomMicRecordingHold,
    isRoomMicMutedForRecording,
    serverRoomMicMuted,
  );
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE);
  const [problem, setProblem] = useState<VoiceRecordingProblem | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const nextSessionIdRef = useRef(0);
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const isCurrent = useCallback((session: RecordingSession) => sessionRef.current?.id === session.id, []);

  /** Drops the current session (if any) without producing a recording. */
  const abandon = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    if (session.recorder && session.recorder.state !== 'inactive') {
      session.recorder.ondataavailable = null;
      session.recorder.onstop = null;
      try {
        session.recorder.stop();
      } catch {
        // already stopped
      }
    }
    releaseSession(session);
  }, []);

  const stop = useCallback((reachedLimit = false) => {
    const session = sessionRef.current;
    if (!session?.recorder || session.recorder.state === 'inactive' || session.stoppedAt !== null) return;
    session.stoppedAt = performance.now();
    session.reachedLimit = reachedLimit;
    // The timers and level sampling end now; the tracks stay until the
    // recorder has delivered its last data (released in onstop).
    if (session.sampleTimer !== null) clearInterval(session.sampleTimer);
    if (session.limitTimer !== null) clearTimeout(session.limitTimer);
    session.sampleTimer = null;
    session.limitTimer = null;
    setStatus('stopping');
    try {
      session.recorder.stop();
    } catch {
      abandon();
      setStatus('idle');
      setLive(EMPTY_LIVE);
      setProblem('failed');
    }
  }, [abandon]);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    setProblem(null);
    const mimeType = pickVoiceNoteRecorderMimeType();
    if (detectVoiceRecordingSupport() !== 'supported' || !mimeType) {
      setProblem('unsupported');
      return;
    }

    nextSessionIdRef.current += 1;
    const session: RecordingSession = {
      id: nextSessionIdRef.current,
      stream: null,
      // Created inside the user's click so it is allowed to run.
      audioContext: createAudioContext(),
      recorder: null,
      chunks: [],
      levels: [],
      startedAt: 0,
      stoppedAt: null,
      reachedLimit: false,
      sampleTimer: null,
      limitTimer: null,
      releaseRoomMic: null,
    };
    sessionRef.current = session;
    setStatus('starting');
    setLive(EMPTY_LIVE);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (error) {
      if (!isCurrent(session)) return;
      sessionRef.current = null;
      releaseSession(session);
      setStatus('idle');
      setProblem(classifyMicrophoneError(error));
      return;
    }
    session.stream = stream;
    if (!isCurrent(session)) {
      // Cancelled, switched conversation, or unmounted while asking.
      releaseSession(session);
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: VOICE_NOTE_RECORDER_BITS_PER_SECOND });
    } catch (error) {
      sessionRef.current = null;
      releaseSession(session);
      setStatus('idle');
      setProblem(classifyMicrophoneError(error));
      return;
    }
    session.recorder = recorder;

    let analyser: AnalyserNode | null = null;
    if (session.audioContext) {
      try {
        analyser = session.audioContext.createAnalyser();
        analyser.fftSize = 1024;
        session.audioContext.createMediaStreamSource(stream).connect(analyser);
        void session.audioContext.resume().catch(() => {});
      } catch {
        analyser = null;
      }
    }
    const frame = analyser ? new Uint8Array(analyser.fftSize) : null;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) session.chunks.push(event.data);
    };
    recorder.onerror = () => {
      if (!isCurrent(session)) return;
      abandon();
      setStatus('idle');
      setLive(EMPTY_LIVE);
      setProblem('failed');
    };
    recorder.onstop = () => {
      if (!isCurrent(session)) return;
      sessionRef.current = null;
      releaseSession(session);
      setStatus('idle');
      setLive(EMPTY_LIVE);
      const blob = new Blob(session.chunks, { type: recorder.mimeType || mimeType });
      if (blob.size === 0) {
        setProblem('failed');
        return;
      }
      const elapsedMs = (session.stoppedAt ?? performance.now()) - session.startedAt;
      onRecordedRef.current({
        blob,
        mimeType: blob.type,
        durationSeconds: voiceNoteDurationClaim(elapsedMs),
        waveform: summarizeVoiceNoteWaveform(session.levels),
        reachedLimit: session.reachedLimit || elapsedMs >= MAX_DURATION_MS,
      });
    };
    // The microphone unplugged or revoked mid-recording keeps what was recorded.
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (isCurrent(session)) stop();
      };
    });

    // FR-016: an open spatial-audio room mic is silenced while recording.
    session.releaseRoomMic = muteRoomMicForRecording();
    try {
      // Timeslice: data arrives every second, so a long note is not held in one buffer.
      recorder.start(1000);
    } catch (error) {
      sessionRef.current = null;
      releaseSession(session);
      setStatus('idle');
      setProblem(classifyMicrophoneError(error));
      return;
    }
    session.startedAt = performance.now();
    setStatus('recording');

    session.sampleTimer = setInterval(() => {
      if (!isCurrent(session) || session.stoppedAt !== null) return;
      const level = analyser && frame ? (analyser.getByteTimeDomainData(frame), peakLevel(frame)) : 0;
      session.levels.push(level);
      const elapsedMs = performance.now() - session.startedAt;
      setLive((previous) => ({
        elapsedMs: Math.min(elapsedMs, MAX_DURATION_MS),
        levels: [...previous.levels, level].slice(-VOICE_NOTE_LIVE_LEVEL_COUNT),
      }));
      // Backstop for a throttled limit timer (background tab).
      if (elapsedMs >= MAX_DURATION_MS) stop(true);
    }, VOICE_NOTE_LEVEL_SAMPLE_INTERVAL_MS);
    // FR-014: the recording stops by itself at 2:00.
    session.limitTimer = setTimeout(() => {
      if (isCurrent(session)) stop(true);
    }, MAX_DURATION_MS);
  }, [abandon, isCurrent, stop]);

  const cancel = useCallback(() => {
    abandon();
    setStatus('idle');
    setLive(EMPTY_LIVE);
  }, [abandon]);

  const clearProblem = useCallback(() => setProblem(null), []);

  const reportProblem = useCallback((next: VoiceRecordingProblem) => setProblem(next), []);

  // A recording never outlives its conversation or the composer.
  useEffect(() => {
    return () => {
      abandon();
      setStatus('idle');
      setLive(EMPTY_LIVE);
      setProblem(null);
    };
  }, [abandon, conversationId]);

  return {
    support,
    status,
    elapsedMs: live.elapsedMs,
    levels: live.levels,
    problem,
    /** True while this recording keeps the room mic muted (FR-016 notice). */
    roomMicMuted: roomMicHeld && status !== 'idle',
    start,
    stop,
    cancel,
    clearProblem,
    reportProblem,
  };
}
