import type { Locator, Page, Request, Route } from '@playwright/test';

import { test, expect } from './fixtures/messaging';
import { openDrawer, selectConversation, waitForRealtimeReady } from './helpers/drawer-helpers';
import {
  mediaState,
  recordToneInBrowser,
  sendVoiceNoteViaApi,
  voicePlayerOf,
  voiceTime,
} from './helpers/voice-note-helpers';

/**
 * Phase 4 T18 — voice notes play in the feed for sender and recipient
 * (FR-015, FR-019; AC-017, AC-022 Chromium part, AC-037). Every check reads
 * the real media element (currentTime, paused, ended) next to what the player
 * shows. Chrome's MediaRecorder WebM carries no duration header, so the
 * player's total and progress must come from the stored duration.
 *
 * Firefox and WebKit results (best effort, AC-022) come from the opt-in
 * `npm run test:messaging:voice:cross-browser`, not from this suite.
 */
test.use({
  // Full Chromium with the fake microphone, as in messaging-voice-notes.spec.ts.
  channel: 'chromium',
  launchOptions: { args: ['--use-fake-device-for-media-stream'] },
});

const RECV_TIMEOUT_MS = 15_000;
const WEBM = 'audio/webm;codecs=opus';
const TAMPERED_TOKEN = 'token-expirado';
const UNSUPPORTED_TEXT = /^Este navegador não consegue reproduzir esta nota de voz \(\d:\d{2}\)\. Baixe o arquivo para ouvir\.$/;

interface AttachmentHop {
  path: string;
  status: number;
}

async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.goto('/floor-plan');
  await waitForRealtimeReady(page);
  await openDrawer(page);
  await selectConversation(page, { id: conversationId });
  await waitForRealtimeReady(page);
}

/** Responses of the attachment read route and of signed Storage URLs seen by the page. */
function recordAttachmentHops(page: Page): AttachmentHop[] {
  const hops: AttachmentHop[] = [];
  page.on('response', (response) => {
    const { pathname } = new URL(response.url());
    if (pathname.startsWith('/api/messages/attachment/') || pathname.startsWith('/storage/v1/object/sign/')) {
      hops.push({ path: pathname, status: response.status() });
    }
  });
  return hops;
}

const routeHops = (hops: AttachmentHop[], attachmentId: string) =>
  hops.filter((hop) => hop.path === `/api/messages/attachment/${attachmentId}`);
const storageHops = (hops: AttachmentHop[], attachmentId: string) =>
  hops.filter((hop) => hop.path.startsWith('/storage/v1/object/sign/') && hop.path.includes(attachmentId));

interface StorageRead {
  tampered: boolean;
  outcome: number | 'failed';
}

/** Outcome of every signed Storage read of one attachment, in order. */
function recordStorageReads(page: Page, attachmentId: string): StorageRead[] {
  const reads: StorageRead[] = [];
  const isRead = (request: Request) => {
    const url = new URL(request.url());
    return url.pathname.startsWith('/storage/v1/object/sign/') && url.pathname.includes(attachmentId);
  };
  const tampered = (request: Request) => new URL(request.url()).searchParams.get('token') === TAMPERED_TOKEN;
  page.on('requestfinished', async (request) => {
    if (!isRead(request)) return;
    const response = await request.response();
    reads.push({ tampered: tampered(request), outcome: response?.status() ?? 'failed' });
  });
  page.on('requestfailed', (request) => {
    if (isRead(request)) reads.push({ tampered: tampered(request), outcome: 'failed' });
  });
  return reads;
}

const playButtonOf = (player: Locator) => player.getByTestId('voice-note-play');

/** The player stays inside the 384 px drawer without horizontal overflow. */
async function expectFitsDrawer(page: Page, element: Locator): Promise<void> {
  const drawer = await page.getByTestId('messaging-drawer').boundingBox();
  const box = await element.boundingBox();
  if (!drawer || !box) throw new Error('drawer or element has no bounding box');
  expect(Math.round(drawer.width)).toBeLessThanOrEqual(384);
  expect(box.x).toBeGreaterThanOrEqual(drawer.x - 0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(drawer.x + drawer.width + 0.5);
  const overflow = await page.getByTestId('messages-feed').evaluate((feed) => feed.scrollWidth - feed.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Progress shown by the player and the media position, read in the same task. */
async function progressAndPosition(player: Locator): Promise<{ progress: number; currentTime: number; ended: boolean }> {
  return player.evaluate((element) => {
    const bar = element.querySelector<HTMLElement>('[data-testid="voice-note-progress"]');
    const audio = element.querySelector<HTMLAudioElement>('[data-testid="voice-note-audio"]');
    return {
      progress: Number(bar?.dataset.progress ?? 'NaN'),
      currentTime: audio?.currentTime ?? Number.NaN,
      ended: audio?.ended ?? false,
    };
  });
}

/**
 * Plays a note from the start to the end with the keyboard, pausing and
 * resuming once, and checks the media and the player agree all along.
 */
async function playThroughWithPause(page: Page, player: Locator, durationSeconds: number): Promise<void> {
  const total = voiceTime(durationSeconds);
  const button = playButtonOf(player);
  const progressbar = player.getByRole('progressbar', { name: 'Progresso da nota de voz' });

  await expect(player).toHaveAttribute('data-player-state', /^(idle|ended)$/);
  await expect(button).toHaveAccessibleName('Reproduzir nota de voz');
  await expect(progressbar).toHaveAttribute('aria-valuetext', `0:00 de ${total}`);
  await expect(player.getByTestId('voice-note-time')).toHaveText(`0:00 / ${total}`);

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(player).toHaveAttribute('data-player-state', 'playing');
  await expect(button).toHaveAccessibleName('Pausar nota de voz');
  await expect.poll(async () => (await mediaState(player)).currentTime).toBeGreaterThan(1);

  // Total and progress follow the STORED duration (the media's own is not usable).
  test.info().annotations.push({
    type: 'media-duration-while-playing',
    description: `media element reports ${String((await mediaState(player)).mediaDuration)}; stored ${durationSeconds}s`,
  });
  const sample = await progressAndPosition(player);
  expect(sample.ended).toBe(false);
  expect(sample.progress).toBeGreaterThan(0);
  expect(Math.abs(sample.progress * durationSeconds - sample.currentTime)).toBeLessThan(0.6);
  await expect(progressbar).toHaveAttribute('aria-valuetext', new RegExp(`^0:0[1-9] de ${total}$`));
  await expect(progressbar).toHaveAttribute('aria-valuemax', String(durationSeconds));

  // Pause: the media stops and stays where it was.
  await page.keyboard.press('Enter');
  await expect(player).toHaveAttribute('data-player-state', 'paused');
  await expect(button).toHaveAccessibleName('Reproduzir nota de voz');
  const pausedAt = await mediaState(player);
  expect(pausedAt.paused).toBe(true);
  const pausedProgress = (await progressAndPosition(player)).progress;
  await page.waitForTimeout(700);
  expect((await mediaState(player)).currentTime).toBe(pausedAt.currentTime);
  expect((await progressAndPosition(player)).progress).toBe(pausedProgress);

  // Resume: it continues from there and the progress keeps moving.
  await page.keyboard.press('Enter');
  await expect(player).toHaveAttribute('data-player-state', 'playing');
  await expect.poll(async () => (await mediaState(player)).currentTime).toBeGreaterThan(pausedAt.currentTime + 0.3);
  await expect.poll(async () => (await progressAndPosition(player)).progress).toBeGreaterThan(pausedProgress);

  // End: the media ended and the player is back at the start, ready to replay.
  await expect(player).toHaveAttribute('data-player-state', 'ended', { timeout: (durationSeconds + 10) * 1000 });
  expect((await mediaState(player)).ended).toBe(true);
  await expect(button).toHaveAccessibleName('Reproduzir nota de voz');
  await expect(button).toBeFocused();
  await expect(player.getByTestId('voice-note-progress')).toHaveAttribute('data-progress', '0.000');
  await expect(player.getByTestId('voice-note-time')).toHaveText(`0:00 / ${total}`);
}

test.describe('Voice note playback in the feed', () => {
  test('A records a voice note; A and B play it with play/pause, the stored duration, and moving progress', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(150_000);
    const conversationId = messagingData.directConversationId;
    const recipientHops = recordAttachmentHops(secondaryPage);
    await openConversation(secondaryPage, conversationId);
    await openConversation(primaryPage, conversationId);
    await primaryPage.context().grantPermissions(['microphone'], { origin: new URL(primaryPage.url()).origin });

    // A records about 3 s from the fake microphone in Chrome and sends it.
    const composer = primaryPage.getByTestId('composer');
    const uploadResponse = primaryPage.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/messages/upload' && response.request().method() === 'POST',
    );
    await composer.getByRole('button', { name: 'Gravar nota de voz' }).click();
    const panel = composer.getByTestId('voice-recording-panel');
    await expect(panel).toHaveAttribute('data-recorder-status', 'recording');
    await expect(panel.getByRole('timer')).toHaveText(/^0:0[3-9] \/ 2:00$/, { timeout: 10_000 });
    await panel.getByRole('button', { name: 'Parar gravação' }).click();
    await expect(composer.getByTestId('voice-note-preview')).toHaveAttribute('data-upload-status', 'uploaded');
    const uploaded = (await (await uploadResponse).json()) as { attachment: { id: string; type: string; duration: number } };
    expect(uploaded.attachment.type).toBe('audio/webm');
    const duration = uploaded.attachment.duration;
    expect(duration).toBeGreaterThanOrEqual(3);
    expect(duration).toBeLessThan(10);
    const createResponse = primaryPage.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/messages/create' && response.request().method() === 'POST',
    );
    await composer.getByTestId('message-send-button').click();
    const created = (await (await createResponse).json()) as { message: { id: string } };
    const messageId = created.message.id;
    const attachmentId = uploaded.attachment.id;

    // B: a player (not a download card) with the stored total; nothing is
    // fetched before B presses play.
    const recipientPlayer = voicePlayerOf(secondaryPage, messageId);
    await expect(recipientPlayer).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(secondaryPage.getByTestId(`message-${messageId}`).getByTestId('attachment-file-card')).toHaveCount(0);
    await expect(recipientPlayer).toHaveAttribute('data-player-state', 'idle');
    await expect(recipientPlayer).toHaveAccessibleName(`Nota de voz, ${voiceTime(duration)}`);
    expect(routeHops(recipientHops, attachmentId)).toHaveLength(0);
    await expectFitsDrawer(secondaryPage, recipientPlayer);

    await playThroughWithPause(secondaryPage, recipientPlayer, duration);
    // The media element held only the authorized route; its read was the
    // route's redirect to a signed Storage URL that answered with the audio.
    const recipientMedia = await mediaState(recipientPlayer);
    expect(new URL(recipientMedia.src).pathname).toBe(`/api/messages/attachment/${attachmentId}`);
    expect(routeHops(recipientHops, attachmentId).map((hop) => hop.status)).toContain(307);
    expect(storageHops(recipientHops, attachmentId).every((hop) => hop.status === 200 || hop.status === 206)).toBe(true);
    expect(storageHops(recipientHops, attachmentId).length).toBeGreaterThan(0);
    test.info().annotations.push({
      type: 'media-duration-after-play',
      description: `Chrome reports ${String(recipientMedia.mediaDuration)} for the recorded WebM; stored ${duration}s`,
    });

    // The note can be replayed from the start.
    await playButtonOf(recipientPlayer).press('Enter');
    await expect(recipientPlayer).toHaveAttribute('data-player-state', 'playing');
    await expect.poll(async () => (await mediaState(recipientPlayer)).currentTime).toBeGreaterThan(0.3);
    await playButtonOf(recipientPlayer).press('Enter');
    await expect(recipientPlayer).toHaveAttribute('data-player-state', 'paused');

    // A (sender) plays the same note from its own bubble.
    const senderPlayer = voicePlayerOf(primaryPage, messageId);
    await expect(senderPlayer).toBeVisible();
    await expectFitsDrawer(primaryPage, senderPlayer);
    await playThroughWithPause(primaryPage, senderPlayer, duration);
  });

  test('total and progress follow the stored duration, not what the media element reports', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    // About 3 s of real audio stored with a 9 s duration: Chrome's own duration
    // (Infinity, or about 3 once it has scanned the file) can never produce
    // what the player must show.
    const bytes = await recordToneInBrowser(primaryPage.context(), WEBM, 3);
    if (!bytes) throw new Error('Chromium cannot record audio/webm;codecs=opus');
    const note = await sendVoiceNoteViaApi(primaryPage, { conversationId, bytes, mimeType: WEBM, durationSeconds: 9 });
    expect(note.duration).toBe(9);

    await openConversation(secondaryPage, conversationId);
    const player = voicePlayerOf(secondaryPage, note.messageId);
    await expect(player.getByTestId('voice-note-time')).toHaveText('0:00 / 0:09');
    await playButtonOf(player).click();
    await expect(player).toHaveAttribute('data-player-state', 'playing');
    await expect.poll(async () => (await mediaState(player)).currentTime).toBeGreaterThan(1);
    const sample = await progressAndPosition(player);
    expect(sample.ended).toBe(false);
    expect(Math.abs(sample.progress * 9 - sample.currentTime)).toBeLessThan(0.5);
    expect(sample.progress).toBeLessThan(0.34);
    await expect(player.getByRole('progressbar')).toHaveAttribute('aria-valuetext', /^0:0[1-3] de 0:09$/);
    await expect(player.getByTestId('voice-note-time')).toHaveText(/^0:0[1-3] \/ 0:09$/);
    test.info().annotations.push({
      type: 'media-duration-vs-stored',
      description: `media element reports ${String((await mediaState(player)).mediaDuration)}; stored 9s`,
    });
    // The media ends after its real length; the player returns to the start.
    await expect(player).toHaveAttribute('data-player-state', 'ended', { timeout: 15_000 });
    await expect(player.getByTestId('voice-note-time')).toHaveText('0:00 / 0:09');
  });

  test('one note plays at a time, and a signed URL that Storage rejects is read again through the route', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    const bytes = await recordToneInBrowser(primaryPage.context(), WEBM, 4);
    if (!bytes) throw new Error('Chromium cannot record audio/webm;codecs=opus');
    const first = await sendVoiceNoteViaApi(primaryPage, { conversationId, bytes, mimeType: WEBM, durationSeconds: 4, content: 'Primeira nota' });
    const second = await sendVoiceNoteViaApi(primaryPage, { conversationId, bytes, mimeType: WEBM, durationSeconds: 4, content: 'Segunda nota' });

    // B's first read of the second note gets a signed URL whose token Storage
    // rejects (as it rejects an expired one); later reads pass through.
    const hops = recordAttachmentHops(secondaryPage);
    let tamperedReads = 0;
    await secondaryPage.route(`**/api/messages/attachment/${second.attachmentId}*`, async (route: Route) => {
      if (tamperedReads > 0) return route.continue();
      tamperedReads += 1;
      const original = await route.fetch({ maxRedirects: 0 });
      expect(original.status()).toBe(307);
      const location = new URL(original.headers()['location']);
      location.searchParams.set('token', TAMPERED_TOKEN);
      await route.fulfill({ status: 307, headers: { location: location.toString(), 'cache-control': 'private, no-store' } });
    });
    const storageReads = recordStorageReads(secondaryPage, second.attachmentId);
    await openConversation(secondaryPage, conversationId);

    const firstPlayer = voicePlayerOf(secondaryPage, first.messageId);
    const secondPlayer = voicePlayerOf(secondaryPage, second.messageId);
    await expect(firstPlayer).toBeVisible();
    await expect(secondPlayer).toBeVisible();

    await playButtonOf(firstPlayer).click();
    await expect(firstPlayer).toHaveAttribute('data-player-state', 'playing');
    await expect.poll(async () => (await mediaState(firstPlayer)).currentTime).toBeGreaterThan(0.5);

    // Starting the second pauses the first.
    await playButtonOf(secondPlayer).click();
    await expect(firstPlayer).toHaveAttribute('data-player-state', 'paused');
    expect((await mediaState(firstPlayer)).paused).toBe(true);
    await expect(playButtonOf(firstPlayer)).toHaveAccessibleName('Reproduzir nota de voz');

    // The rejected read recovers by itself: a second route request, then playback.
    await expect(secondPlayer).toHaveAttribute('data-player-state', 'playing', { timeout: 10_000 });
    await expect.poll(async () => (await mediaState(secondPlayer)).currentTime).toBeGreaterThan(0.5);
    expect(tamperedReads).toBe(1);
    const secondRouteStatuses = routeHops(hops, second.attachmentId).map((hop) => hop.status);
    expect(secondRouteStatuses).toEqual([307, 307]);
    // Storage refused the tampered token (the browser blocks the error body,
    // so the media element sees a failed read); the fresh URL then served audio.
    expect(storageReads[0]).toEqual({ tampered: true, outcome: 'failed' });
    expect(storageReads.length).toBeGreaterThan(1);
    expect(storageReads.slice(1).every((read) => !read.tampered && (read.outcome === 200 || read.outcome === 206))).toBe(true);
    await expect(secondPlayer.getByRole('alert')).toHaveCount(0);

    // And the first, restarted, pauses the second.
    await playButtonOf(firstPlayer).click();
    await expect(secondPlayer).toHaveAttribute('data-player-state', 'paused');
    expect((await mediaState(secondPlayer)).paused).toBe(true);
    await expect(firstPlayer).toHaveAttribute('data-player-state', 'playing');
    await expect(firstPlayer).toHaveAttribute('data-player-state', 'ended', { timeout: 15_000 });
  });

  test('a read that keeps failing shows the error with a retry that plays the note', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    const bytes = await recordToneInBrowser(primaryPage.context(), WEBM, 3);
    if (!bytes) throw new Error('Chromium cannot record audio/webm;codecs=opus');
    const note = await sendVoiceNoteViaApi(primaryPage, { conversationId, bytes, mimeType: WEBM, durationSeconds: 3 });

    const failingReads: Request[] = [];
    const routePattern = `**/api/messages/attachment/${note.attachmentId}*`;
    await secondaryPage.route(routePattern, async (route: Route) => {
      failingReads.push(route.request());
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal server error"}' });
    });
    await openConversation(secondaryPage, conversationId);
    const player = voicePlayerOf(secondaryPage, note.messageId);
    await playButtonOf(player).click();

    // Not a format problem: a retry, no "cannot play" message.
    await expect(player).toHaveAttribute('data-player-state', 'failed', { timeout: 10_000 });
    const alert = player.getByRole('alert');
    await expect(alert).toContainText('Não foi possível carregar a nota de voz.');
    await expect(player.getByTestId('voice-note-unsupported')).toHaveCount(0);
    await expect(playButtonOf(player)).toBeDisabled();
    // The initial read, the automatic re-read, and the route check.
    expect(failingReads.length).toBe(3);

    await secondaryPage.unroute(routePattern);
    const retry = player.getByRole('button', { name: 'Tentar carregar a nota de voz de novo' });
    await retry.focus();
    await secondaryPage.keyboard.press('Enter');
    await expect(player).toHaveAttribute('data-player-state', 'playing', { timeout: 10_000 });
    await expect.poll(async () => (await mediaState(player)).currentTime).toBeGreaterThan(0.5);
    await expect(playButtonOf(player)).toBeFocused();
    await expect(playButtonOf(player)).toHaveAccessibleName('Pausar nota de voz');
    await expect(alert).toHaveCount(0);
  });

  test('a browser that cannot play the note shows a clear message with a download instead of a control', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    const bytes = await recordToneInBrowser(primaryPage.context(), WEBM, 3);
    if (!bytes) throw new Error('Chromium cannot record audio/webm;codecs=opus');
    const playable = await sendVoiceNoteViaApi(primaryPage, { conversationId, bytes, mimeType: WEBM, durationSeconds: 3, content: 'Nota boa' });
    // Same WebM header, undecodable body: Chrome cannot play it.
    const corrupt = Buffer.concat([bytes.subarray(0, 64), Buffer.alloc(8 * 1024, 0xee)]);
    const broken = await sendVoiceNoteViaApi(primaryPage, { conversationId, bytes: corrupt, mimeType: WEBM, durationSeconds: 3, content: 'Nota quebrada' });

    // Decode failure (B): after the automatic re-read fails the same way and
    // the route still answers, the player says it cannot play and offers the file.
    const hops = recordAttachmentHops(secondaryPage);
    await openConversation(secondaryPage, conversationId);
    const brokenPlayer = voicePlayerOf(secondaryPage, broken.messageId);
    await playButtonOf(brokenPlayer).click();
    await expect(brokenPlayer).toHaveAttribute('data-player-state', 'unsupported', { timeout: 10_000 });
    await expect(brokenPlayer.getByTestId('voice-note-unsupported')).toHaveText(UNSUPPORTED_TEXT);
    await expect(brokenPlayer.getByTestId('voice-note-play')).toHaveCount(0);
    const download = brokenPlayer.getByRole('link', { name: 'Baixar nota de voz' });
    await expect(download).toHaveAttribute('href', `/api/messages/attachment/${broken.attachmentId}?download=1`);
    expect(routeHops(hops, broken.attachmentId).length).toBeGreaterThanOrEqual(2);
    await expectFitsDrawer(secondaryPage, brokenPlayer);
    // The playable note next to it keeps its normal control.
    await expect(playButtonOf(voicePlayerOf(secondaryPage, playable.messageId))).toHaveAccessibleName('Reproduzir nota de voz');

    // Unsupported type (A, a browser whose canPlayType rejects WebM): the
    // message shows up front and nothing is requested.
    await primaryPage.addInitScript(() => {
      const original = HTMLMediaElement.prototype.canPlayType;
      HTMLMediaElement.prototype.canPlayType = function canPlayType(type: string) {
        return type.startsWith('audio/webm') ? '' : original.call(this, type);
      };
    });
    const senderHops = recordAttachmentHops(primaryPage);
    await openConversation(primaryPage, conversationId);
    const senderPlayer = voicePlayerOf(primaryPage, playable.messageId);
    await expect(senderPlayer).toHaveAttribute('data-player-state', 'unsupported');
    await expect(senderPlayer.getByTestId('voice-note-unsupported')).toHaveText(UNSUPPORTED_TEXT);
    await expect(senderPlayer.getByTestId('voice-note-unsupported')).toContainText('(0:03)');
    await expect(senderPlayer.getByTestId('voice-note-play')).toHaveCount(0);
    const senderDownload = senderPlayer.getByRole('link', { name: 'Baixar nota de voz' });
    await senderDownload.focus();
    await expect(senderDownload).toBeFocused();
    expect(routeHops(senderHops, playable.attachmentId)).toHaveLength(0);
  });
});
