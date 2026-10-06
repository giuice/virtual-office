import { chromium, type Browser, type Page } from '@playwright/test';

import { test, expect } from './fixtures/messaging';
import { openDrawer, selectConversation, waitForRealtimeReady } from './helpers/drawer-helpers';
import { mediaState, recordToneInBrowser, sendVoiceNoteViaApi, voicePlayerOf } from './helpers/voice-note-helpers';

/**
 * Phase 4 T18 — best-effort cross-browser check (FR-019, AC-022). A note
 * recorded by Chrome's MediaRecorder is opened in this project's browser
 * (Chrome, Edge, Firefox, WebKit) by both members; each must either play it
 * (the media really advances to the end) or show the clear "cannot play"
 * message with a download. A broken control or a stuck/failed read fails.
 *
 * Opt-in, not part of the messaging regression suite:
 *   npm run test:messaging:voice:cross-browser
 * Results are attached to each test as `voice-playback` annotations.
 */

interface Recorded {
  recorder: string;
  mimeType: string;
  bytes: Buffer;
}

const DURATION_SECONDS = 3;

/** Records the notes with Chrome (Chromium if Chrome is not installed), as the composer does. */
async function recordWithChrome(): Promise<Recorded[]> {
  let browser: Browser;
  let recorder: string;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
    recorder = `Chrome ${browser.version()}`;
  } catch {
    browser = await chromium.launch({ channel: 'chromium' });
    recorder = `Chromium ${browser.version()}`;
  }
  try {
    const context = await browser.newContext();
    const recorded: Recorded[] = [];
    // WebM/Opus is what the composer records in Chrome/Edge (first preference);
    // MP4/AAC is the Safari-recorded container, included when Chrome can produce it.
    for (const mimeType of ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2']) {
      const bytes = await recordToneInBrowser(context, mimeType, DURATION_SECONDS);
      if (bytes) recorded.push({ recorder, mimeType, bytes });
    }
    await context.close();
    return recorded;
  } finally {
    await browser.close();
  }
}

async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.goto('/floor-plan');
  await waitForRealtimeReady(page);
  await openDrawer(page);
  await selectConversation(page, { id: conversationId });
  await waitForRealtimeReady(page);
}

type Outcome = 'plays' | 'cannot-play message';

/** Presses play (when offered) and reports what the member got. */
async function tryToPlay(page: Page, messageId: string): Promise<{ outcome: Outcome; detail: string }> {
  const player = voicePlayerOf(page, messageId);
  await expect(player).toBeVisible();
  const canPlayType = await page.evaluate(() => {
    const audio = document.createElement('audio');
    return {
      webm: audio.canPlayType('audio/webm'),
      webmOpus: audio.canPlayType('audio/webm; codecs="opus"'),
      mp4: audio.canPlayType('audio/mp4'),
    };
  });
  const typeReport = `canPlayType webm='${canPlayType.webm}' webm/opus='${canPlayType.webmOpus}' mp4='${canPlayType.mp4}'`;

  if ((await player.getAttribute('data-player-state')) !== 'unsupported') {
    await player.getByTestId('voice-note-play').click();
    await expect(player).toHaveAttribute('data-player-state', /^(playing|unsupported|failed)$/, { timeout: 15_000 });
  }
  const state = await player.getAttribute('data-player-state');
  if (state === 'unsupported') {
    await expect(player.getByTestId('voice-note-unsupported')).toContainText(
      'Este navegador não consegue reproduzir esta nota de voz',
    );
    await expect(player.getByRole('link', { name: 'Baixar nota de voz' })).toHaveAttribute('href', /\?download=1$/);
    return { outcome: 'cannot-play message', detail: typeReport };
  }
  // A failed read is neither outcome AC-022 allows.
  expect(state, `player state (${typeReport})`).toBe('playing');
  await expect.poll(async () => (await mediaState(player)).currentTime).toBeGreaterThan(0.5);
  await expect(player).toHaveAttribute('data-player-state', 'ended', { timeout: (DURATION_SECONDS + 15) * 1000 });
  const media = await mediaState(player);
  expect(media.ended).toBe(true);
  return { outcome: 'plays', detail: `${typeReport}; media duration after play ${String(media.mediaDuration)}` };
}

test.describe('Voice notes recorded in Chrome, opened in other browsers', () => {
  test('each recorded format plays or shows the cannot-play message for sender and recipient', async ({
    primaryPage,
    secondaryPage,
    messagingData,
    browserName,
    browser,
  }) => {
    test.setTimeout(180_000);
    const recorded = await recordWithChrome();
    expect(recorded.length, 'Chrome recorded no voice note').toBeGreaterThan(0);
    const conversationId = messagingData.directConversationId;
    const notes = [];
    for (const note of recorded) {
      const stored = await sendVoiceNoteViaApi(primaryPage, {
        conversationId,
        bytes: note.bytes,
        mimeType: note.mimeType,
        durationSeconds: DURATION_SECONDS,
        content: `Gravada em ${note.mimeType}`,
      });
      notes.push({ ...note, ...stored });
    }

    await openConversation(secondaryPage, conversationId);
    await openConversation(primaryPage, conversationId);
    for (const note of notes) {
      for (const [member, page] of [['recipient', secondaryPage], ['sender', primaryPage]] as const) {
        const result = await tryToPlay(page, note.messageId);
        test.info().annotations.push({
          type: 'voice-playback',
          description: `${browserName} ${browser.version()} | recorded by ${note.recorder} as ${note.mimeType} (${note.bytes.length} B) | ${member}: ${result.outcome} | ${result.detail}`,
        });
      }
    }
  });
});
