import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

/**
 * Phase 4 T18 helpers: produce real browser-recorded voice notes without a
 * microphone, store them through the production upload/create API, and read
 * the feed player's playback state.
 */

export interface StoredVoiceNote {
  messageId: string;
  attachmentId: string;
  duration: number;
}

/**
 * Records `seconds` of a tone with MediaRecorder in a blank page of the
 * context's browser (a Web Audio oscillator, so no capture device is
 * involved) and returns the container bytes, or null when that browser
 * cannot record the type.
 */
export async function recordToneInBrowser(context: BrowserContext, mimeType: string, seconds: number): Promise<Buffer | null> {
  const page = await context.newPage();
  try {
    return await recordTone(page, mimeType, seconds);
  } finally {
    await page.close();
  }
}

async function recordTone(page: Page, mimeType: string, seconds: number): Promise<Buffer | null> {
  // A trusted click on the blank page gives it user activation, so the AudioContext runs.
  await page.mouse.click(1, 1);
  const base64 = await page.evaluate(
    async ({ type, ms }) => {
      if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(type)) return null;
      const context = new AudioContext();
      await context.resume();
      if (context.state !== 'running') throw new Error(`AudioContext is ${context.state}`);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 440;
      gain.gain.value = 0.5;
      const destination = context.createMediaStreamDestination();
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      const recorder = new MediaRecorder(destination.stream, { mimeType: type, audioBitsPerSecond: 32_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start(1000);
      await new Promise((resolve) => setTimeout(resolve, ms));
      recorder.stop();
      await stopped;
      oscillator.stop();
      await context.close();
      const bytes = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    { type: mimeType, ms: seconds * 1000 },
  );
  return base64 === null ? null : Buffer.from(base64, 'base64');
}

/** A waveform like the composer stores: rising and falling levels in [0, 1], peak 1. */
export function syntheticWaveform(samples: number): number[] {
  return Array.from({ length: samples }, (_, index) => Number((0.2 + 0.8 * Math.abs(Math.sin(index / 4))).toFixed(3)));
}

/**
 * Uploads `bytes` as a voice note (kind=voice) and sends it as its own
 * message in the conversation, as the composer does.
 */
export async function sendVoiceNoteViaApi(
  page: Page,
  options: { conversationId: string; bytes: Buffer; mimeType: string; durationSeconds: number; content?: string },
): Promise<StoredVoiceNote> {
  const extension = options.mimeType.startsWith('audio/mp4') ? 'm4a' : 'webm';
  const upload = await page.request.post('/api/messages/upload', {
    multipart: {
      file: { name: `nota-de-voz.${extension}`, mimeType: options.mimeType, buffer: options.bytes },
      conversationId: options.conversationId,
      kind: 'voice',
      duration: options.durationSeconds.toFixed(3),
      waveform: JSON.stringify(syntheticWaveform(64)),
    },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  const { attachment } = (await upload.json()) as { attachment: { id: string; duration: number } };
  const create = await page.request.post('/api/messages/create', {
    data: {
      conversationId: options.conversationId,
      ...(options.content ? { content: options.content } : {}),
      attachmentIds: [attachment.id],
    },
  });
  expect(create.status(), await create.text()).toBe(201);
  const { message } = (await create.json()) as { message: { id: string; type: string } };
  expect(message.type).toBe('file');
  return { messageId: message.id, attachmentId: attachment.id, duration: attachment.duration };
}

/** The feed player of a voice-note message. */
export function voicePlayerOf(page: Page, messageId: string): Locator {
  return page.getByTestId(`message-${messageId}`).getByTestId('voice-note-player');
}

export interface MediaSnapshot {
  currentTime: number;
  paused: boolean;
  ended: boolean;
  mediaDuration: number | string;
  src: string;
  errorCode: number | null;
}

/** Playback state of the player's media element. */
export async function mediaState(player: Locator): Promise<MediaSnapshot> {
  return player.getByTestId('voice-note-audio').evaluate((element: HTMLAudioElement) => ({
    currentTime: element.currentTime,
    paused: element.paused,
    ended: element.ended,
    // Infinity does not survive serialization: report it as text.
    mediaDuration: Number.isFinite(element.duration) ? element.duration : String(element.duration),
    src: element.currentSrc || element.getAttribute('src') || '',
    errorCode: element.error?.code ?? null,
  }));
}

export const voiceTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
