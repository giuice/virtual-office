import type { APIRequestContext, Locator, Page } from '@playwright/test';

import { test, expect, markReadAsSeededMember } from './fixtures/messaging';
import {
  controlRealtimeConnection,
  openDrawer,
  selectConversation,
  sendMessage,
  waitForRealtimeReady,
  type RealtimeConnectionControl,
} from './helpers/drawer-helpers';
import { recordToneInBrowser, sendVoiceNoteViaApi, voicePlayerOf } from './helpers/voice-note-helpers';

/**
 * Phase 4 T20 — receipts, stars, and attachment messages shown in the drawer
 * match the server after the existing Realtime reconnect (FR-025, AC-030,
 * BR-017).
 *
 * Disconnect method: Chromium offline emulation (`context.setOffline`) does
 * not close an open WebSocket — a probe kept the Realtime socket open and
 * SUBSCRIBED for 40 s offline — so the Realtime connection is dropped by
 * closing its socket and failing each reconnect attempt
 * (`controlRealtimeConnection`). The first test also takes the page offline
 * (a full network outage: HTTP fails, `navigator.onLine` is false); the second
 * drops only Realtime while the browser stays online (server restart, proxy
 * idle timeout, network handover), so no browser `online` event helps the
 * page catch up.
 */

const RECV_TIMEOUT_MS = 15_000;
const WEBM = 'audio/webm;codecs=opus';

interface ServerMessage {
  id: string;
  readCount?: number;
  stars?: Array<{ userId: string }>;
  attachments?: Array<{ id: string }>;
}

const readBy = (page: Page, messageId: string) => page.getByTestId(`read-by-${messageId}`);
const readersList = (page: Page, messageId: string) => page.getByTestId(`readers-list-${messageId}`);
const readerItems = (list: Locator) => list.locator('[data-testid^="reader-item-"]');
const starredIndicator = (page: Page, messageId: string) => page.getByTestId(`message-starred-${messageId}`);
const starredResults = (page: Page) => page.locator('[data-testid^="starred-result-"]');
const feedMessage = (page: Page, messageId: string) =>
  page.getByTestId('messages-feed').getByTestId(`message-${messageId}`);

/** Opens the drawer on a conversation and waits until its Realtime stream is live. */
async function openConversation(page: Page, realtime: RealtimeConnectionControl, conversationId: string) {
  await page.goto('/floor-plan');
  await openDrawer(page);
  await waitForRealtimeReady(page);
  await selectConversation(page, { id: conversationId });
  await realtime.waitForStreamConfirmation(0);
}

async function openDrawerOnly(page: Page) {
  await page.goto('/floor-plan');
  await openDrawer(page);
  await waitForRealtimeReady(page);
}

/** Restores Realtime (and the network, when it was taken offline) and waits for the rejoin. */
async function reconnect(page: Page, realtime: RealtimeConnectionControl, { goOnline = false } = {}) {
  const confirmationsBefore = realtime.streamConfirmations();
  realtime.restore();
  if (goOnline) await page.context().setOffline(false);
  await realtime.waitForStreamConfirmation(confirmationsBefore);
  await waitForRealtimeReady(page);
}

async function serverFeed(request: APIRequestContext, conversationId: string): Promise<ServerMessage[]> {
  const response = await request.get(`/api/messages/get?conversationId=${conversationId}&limit=50`);
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { messages: ServerMessage[] }).messages;
}

async function serverReadCount(request: APIRequestContext, messageId: string): Promise<number> {
  const response = await request.get(`/api/messages/${messageId}/readers`);
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { readCount: number }).readCount;
}

async function sendTextViaApi(request: APIRequestContext, conversationId: string, content: string): Promise<string> {
  const response = await request.post('/api/messages/create', { data: { conversationId, content } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { message: { id: string } }).message.id;
}

/** Uploads the files and sends them as one message, as the composer does. */
async function sendFilesViaApi(
  request: APIRequestContext,
  conversationId: string,
  files: Array<{ name: string; mimeType: string; buffer: Buffer }>,
): Promise<{ messageId: string; attachmentIds: string[] }> {
  const attachmentIds: string[] = [];
  for (const file of files) {
    const upload = await request.post('/api/messages/upload', { multipart: { file, conversationId } });
    expect(upload.status(), await upload.text()).toBe(201);
    attachmentIds.push(((await upload.json()) as { attachment: { id: string } }).attachment.id);
  }
  const create = await request.post('/api/messages/create', { data: { conversationId, attachmentIds } });
  expect(create.status(), await create.text()).toBe(201);
  return { messageId: ((await create.json()) as { message: { id: string } }).message.id, attachmentIds };
}

/** A solid-color PNG drawn by the browser. */
async function canvasPng(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ({ w, h }) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d canvas context');
      context.fillStyle = '#8e24aa';
      context.fillRect(0, 0, w, h);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { w: width, h: height },
  );
  return Buffer.from(base64, 'base64');
}

/** The displayed receipts, star, and attachments of each message equal the server's. */
async function expectFeedMatchesServer(page: Page, server: ServerMessage[], messageIds: string[], viewerId: string) {
  for (const messageId of messageIds) {
    const stored = server.find((message) => message.id === messageId);
    expect(stored, `message ${messageId} is on the server feed`).toBeTruthy();
    if (!stored) continue;
    const readCount = stored.readCount ?? 0;
    if (readCount > 0) {
      await expect(readBy(page, messageId)).toHaveText(`Lida por ${readCount}`);
    } else {
      await expect(readBy(page, messageId)).toHaveCount(0);
    }
    const starred = (stored.stars ?? []).some((star) => star.userId === viewerId);
    await expect(starredIndicator(page, messageId)).toHaveCount(starred ? 1 : 0);
    const displayedAttachmentIds = await feedMessage(page, messageId)
      .locator('[data-attachment-id]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-attachment-id') ?? '').sort());
    expect(displayedAttachmentIds, `attachments of ${messageId}`).toEqual(
      (stored.attachments ?? []).map((attachment) => attachment.id).sort(),
    );
  }
}

test.describe('Timeline data after the Realtime reconnect', () => {
  test.use({ messagingSeedOptions: { includeThirdMember: true } });

  test('network outage: receipts, a star, and image/file/voice messages changed while offline show as on the server after reconnect', async ({
    browser,
    primaryPage,
    secondaryPage,
    primaryStorageState,
    messagingData,
  }) => {
    test.setTimeout(150_000);
    const conversationId = messagingData.directConversationId;
    const primaryId = messagingData.primary.userId;

    const realtime = await controlRealtimeConnection(primaryPage);
    await openConversation(primaryPage, realtime, conversationId);
    await openDrawerOnly(secondaryPage);

    // Before the outage, B's message arrives live and A's own message is unread.
    const starTarget = await sendTextViaApi(secondaryPage.request, conversationId, `t20-star-${Date.now()}`);
    await expect(feedMessage(primaryPage, starTarget)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    const ownMessage = await sendMessage(primaryPage, `t20-receipt-${Date.now()}`);
    await expect(readBy(primaryPage, ownMessage)).toHaveCount(0);
    await expect(starredIndicator(primaryPage, starTarget)).toHaveCount(0);

    // Recorded before the outage: B's tab records a real voice note.
    const voiceBytes = await recordToneInBrowser(secondaryPage.context(), WEBM, 2);
    if (!voiceBytes) throw new Error('Chromium cannot record audio/webm;codecs=opus');
    const image = { name: 't20-foto.png', mimeType: 'image/png', buffer: await canvasPng(secondaryPage, 320, 200) };
    const pdf = { name: 't20-relatorio.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n%T20 ${Date.now()}\n%%EOF\n`) };

    // A's other session: stars are personal, so a star made there reaches this page only by refetch.
    const otherSession = await browser.newContext({ storageState: primaryStorageState });

    // --- Outage.
    await primaryPage.context().setOffline(true);
    await realtime.drop();
    expect(await primaryPage.evaluate(() => navigator.onLine)).toBe(false);

    // B reads A's message.
    await selectConversation(secondaryPage, { id: conversationId });
    await expect(feedMessage(secondaryPage, ownMessage)).toBeInViewport({ timeout: RECV_TIMEOUT_MS });
    await expect.poll(() => serverReadCount(otherSession.request, ownMessage), { timeout: RECV_TIMEOUT_MS }).toBe(1);
    // A stars B's message elsewhere.
    const star = await otherSession.request.post(`/api/messages/${starTarget}/star`);
    expect(star.status()).toBe(201);
    // B sends an image + file message and a voice note.
    const files = await sendFilesViaApi(secondaryPage.request, conversationId, [image, pdf]);
    const voice = await sendVoiceNoteViaApi(secondaryPage, { conversationId, bytes: voiceBytes, mimeType: WEBM, durationSeconds: 2 });

    // The app's own reconnect keeps trying while the connection is down.
    await expect.poll(() => realtime.refusedAttempts(), { timeout: RECV_TIMEOUT_MS }).toBeGreaterThan(0);
    // Nothing reached the disconnected page.
    await expect(readBy(primaryPage, ownMessage)).toHaveCount(0);
    await expect(starredIndicator(primaryPage, starTarget)).toHaveCount(0);
    await expect(feedMessage(primaryPage, files.messageId)).toHaveCount(0);
    await expect(feedMessage(primaryPage, voice.messageId)).toHaveCount(0);

    // --- Back online: the existing reconnect restores Realtime.
    await reconnect(primaryPage, realtime, { goOnline: true });

    await expect(readBy(primaryPage, ownMessage)).toHaveText('Lida por 1', { timeout: RECV_TIMEOUT_MS });
    await expect(starredIndicator(primaryPage, starTarget)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    const filesMessage = feedMessage(primaryPage, files.messageId);
    await expect(filesMessage).toHaveAttribute('data-attachment-count', '2', { timeout: RECV_TIMEOUT_MS });
    const thumbnail = filesMessage.getByTestId('attachment-image-thumbnail').locator('img');
    await expect(thumbnail).toBeVisible();
    await expect
      .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: RECV_TIMEOUT_MS })
      .toBe(320);
    await expect(filesMessage.getByTestId('attachment-file-name')).toHaveText(pdf.name);
    await expect(voicePlayerOf(primaryPage, voice.messageId)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(voicePlayerOf(primaryPage, voice.messageId)).toHaveAttribute('data-attachment-id', voice.attachmentId);

    await expectFeedMatchesServer(
      primaryPage,
      await serverFeed(primaryPage.request, conversationId),
      [ownMessage, starTarget, files.messageId, voice.messageId],
      primaryId,
    );

    await otherSession.close();
  });

  test('Realtime-only drop: the open reader list and the open starred view show the server state after reconnect', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(150_000);
    const conversationId = messagingData.groupConversationId ?? '';
    const tertiaryId = messagingData.tertiary?.userId ?? '';
    expect(conversationId, 'group conversation seeded').toBeTruthy();
    expect(tertiaryId, 'third member seeded').toBeTruthy();

    const realtime = await controlRealtimeConnection(primaryPage);
    await openConversation(primaryPage, realtime, conversationId);
    await openDrawerOnly(secondaryPage);

    const first = await sendMessage(primaryPage, `t20-readers-${Date.now()}`);
    const second = await sendMessage(primaryPage, `t20-starred-${Date.now()}`);

    // --- Cycle 1: the reader list of A's message is open across the drop.
    expect(
      await markReadAsSeededMember(primaryPage.request, { conversationId, userId: tertiaryId, messageIds: [first] }),
    ).toBe(1);
    const trigger = readBy(primaryPage, first);
    await expect(trigger).toHaveText('Lida por 1', { timeout: RECV_TIMEOUT_MS });
    await trigger.click();
    const list = readersList(primaryPage, first);
    await expect(readerItems(list)).toHaveCount(1);
    await expect(list.getByTestId(`reader-item-${tertiaryId}`)).toBeVisible();

    await realtime.drop();
    expect(await primaryPage.evaluate(() => navigator.onLine)).toBe(true);

    // B opens the group and reads both messages while A is disconnected.
    await selectConversation(secondaryPage, { id: conversationId });
    await expect(feedMessage(secondaryPage, second)).toBeInViewport({ timeout: RECV_TIMEOUT_MS });
    await expect.poll(() => serverReadCount(primaryPage.request, first), { timeout: RECV_TIMEOUT_MS }).toBe(2);
    await expect.poll(() => serverReadCount(primaryPage.request, second), { timeout: RECV_TIMEOUT_MS }).toBe(1);
    await expect(readerItems(list)).toHaveCount(1);

    await reconnect(primaryPage, realtime);

    await expect(trigger).toHaveText('Lida por 2', { timeout: RECV_TIMEOUT_MS });
    await expect(readBy(primaryPage, second)).toHaveText('Lida por 1', { timeout: RECV_TIMEOUT_MS });
    await expect(list).toBeVisible();
    await expect(readerItems(list)).toHaveCount(2, { timeout: RECV_TIMEOUT_MS });
    await expect(list.getByTestId(`reader-item-${messagingData.secondary.userId}`)).toBeVisible();
    await expect(list).toContainText('Lida por 2');
    await primaryPage.keyboard.press('Escape');
    await expect(list).toBeHidden();

    // --- Cycle 2: the starred view is open across the drop.
    const starSecond = await primaryPage.request.post(`/api/messages/${second}/star`);
    expect(starSecond.status()).toBe(201);
    await primaryPage.getByTestId('starred-filter-toggle').click();
    await expect(primaryPage.getByTestId('starred-messages-view')).toBeVisible();
    await expect(starredResults(primaryPage)).toHaveCount(1, { timeout: RECV_TIMEOUT_MS });
    await expect(primaryPage.getByTestId(`starred-result-${second}`)).toBeVisible();

    await realtime.drop();

    // As A, from outside this page (an API call): star the first message, unstar the second.
    const starFirst = await primaryPage.request.post(`/api/messages/${first}/star`);
    expect(starFirst.status()).toBe(201);
    const unstarSecond = await primaryPage.request.delete(`/api/messages/${second}/star`);
    expect(unstarSecond.status()).toBe(200);
    await expect(primaryPage.getByTestId(`starred-result-${second}`)).toBeVisible();

    await reconnect(primaryPage, realtime);

    await expect(primaryPage.getByTestId(`starred-result-${first}`)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(primaryPage.getByTestId(`starred-result-${second}`)).toHaveCount(0);
    const starredOnServer = await primaryPage.request.get(`/api/messages/starred?conversationId=${conversationId}`);
    expect(starredOnServer.ok()).toBe(true);
    const serverStarredIds = ((await starredOnServer.json()) as { messages: Array<{ id: string }> }).messages.map(
      (message) => message.id,
    );
    expect(serverStarredIds).toEqual([first]);
    await expect(starredResults(primaryPage)).toHaveCount(serverStarredIds.length);

    // Back in the feed, the per-message stars match too.
    await primaryPage.getByTestId('starred-filter-toggle').click();
    await expect(primaryPage.getByTestId('messages-feed')).toBeVisible();
    await expectFeedMatchesServer(
      primaryPage,
      await serverFeed(primaryPage.request, conversationId),
      [first, second],
      messagingData.primary.userId,
    );
  });
});
