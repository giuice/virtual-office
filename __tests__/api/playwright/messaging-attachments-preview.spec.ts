import { readFile } from 'node:fs/promises';

import type { Download, Locator, Page, Response, Route } from '@playwright/test';

import { test, expect } from './fixtures/messaging';
import {
  openDrawer,
  selectConversation,
  waitForRealtimeReady,
  watchMessagingChangesStream,
} from './helpers/drawer-helpers';

/**
 * Phase 4 T14 — attachments render as usable previews in the feed (FR-011;
 * AC-014, AC-015 member path, AC-037). Images are thumbnails that open a
 * lightbox; other files are cards with icon, name, size, and a download. All
 * content is read through the authorized route, which redirects to a fresh
 * short-lived signed URL (the non-member denial is covered by
 * `__tests__/messaging-db/message-attachments.test.ts`).
 */

const RECV_TIMEOUT_MS = 15_000;

interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

interface ApiAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
}

interface ApiMessage {
  id: string;
  content: string;
  type: string;
  attachments?: ApiAttachment[];
}

/** One hop of an attachment read seen by the page. */
interface AttachmentHop {
  path: string;
  download: boolean;
  status: number;
  location: string;
}

const composerOf = (page: Page) => page.getByTestId('composer');

async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.goto('/floor-plan');
  await waitForRealtimeReady(page);
  await openDrawer(page);
  await selectConversation(page, { id: conversationId });
  await waitForRealtimeReady(page);
}

/** A solid-color PNG of the given size, drawn by the browser. */
async function canvasPng(page: Page, width: number, height: number, color: string): Promise<Buffer> {
  const base64 = await page.evaluate(
    ({ width: w, height: h, color: fill }) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d canvas context');
      context.fillStyle = fill;
      context.fillRect(0, 0, w, h);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { width, height, color },
  );
  return Buffer.from(base64, 'base64');
}

/** Attaches files through the composer and waits until every upload is done. */
async function attachFiles(page: Page, files: UploadFile[]): Promise<void> {
  const composer = composerOf(page);
  await composer.getByTestId('composer-file-input').setInputFiles(files);
  await expect(composer.getByTestId('pending-file')).toHaveCount(files.length);
  for (const file of files) {
    await expect(
      composer.locator(`[data-testid="pending-file"][data-file-name="${file.name}"]`),
    ).toHaveAttribute('data-upload-status', 'uploaded');
  }
}

/** Sends the composed message; resolves with the stored message. */
async function submit(page: Page, text: string): Promise<ApiMessage> {
  const composer = composerOf(page);
  if (text) await composer.locator('textarea').fill(text);
  const createResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/messages/create' && response.request().method() === 'POST',
  );
  await composer.getByTestId('message-send-button').click();
  const response = await createResponse;
  expect(response.status()).toBe(201);
  return ((await response.json()) as { message: ApiMessage }).message;
}

/** Records every response of the attachment read route and of the signed Storage URL. */
function recordAttachmentHops(page: Page): AttachmentHop[] {
  const hops: AttachmentHop[] = [];
  page.on('response', (response: Response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/messages/attachment/') || url.pathname.startsWith('/storage/v1/object/sign/')) {
      hops.push({
        path: url.pathname,
        download: url.searchParams.has('download'),
        status: response.status(),
        location: response.headers()['location'] ?? '',
      });
    }
  });
  return hops;
}

/** Waits until the image has really loaded and checks its natural size. */
async function expectImageLoaded(image: Locator, width: number, height: number): Promise<void> {
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => (element.complete ? element.naturalWidth : 0)), {
      timeout: 10_000,
    })
    .toBe(width);
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalHeight)).toBe(height);
}

function expectSignedDownloadUrl(download: Download, conversationId: string, attachmentId: string, name: string): void {
  const url = new URL(download.url());
  expect(url.pathname).toMatch(
    new RegExp(`^/storage/v1/object/sign/attachments/message-attachments/${conversationId}/${attachmentId}(\\.[a-z0-9]+)?$`),
  );
  expect(url.searchParams.get('token')).toBeTruthy();
  expect(url.searchParams.get('download')).toBe(name);
}

async function downloadedBytes(download: Download): Promise<Buffer> {
  return readFile(await download.path());
}

const expectedSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
};

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no bounding box');
  return box;
}

const activeElementInside = (dialog: Locator) =>
  dialog.evaluate((element) => element.contains(document.activeElement));

test.describe('Feed attachment previews', () => {
  test('B sees every attachment of a mixed message: images load and open larger, file cards download the uploaded bytes', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    const secondaryStreaming = watchMessagingChangesStream(secondaryPage);
    const recipientHops = recordAttachmentHops(secondaryPage);
    await openConversation(secondaryPage, conversationId);
    await openConversation(primaryPage, conversationId);
    await secondaryStreaming();

    const photo = { name: 'foto-da-praia.png', mimeType: 'image/png', buffer: await canvasPng(primaryPage, 640, 400, '#1e88e5') };
    const chart = { name: 'grafico.png', mimeType: 'image/png', buffer: await canvasPng(primaryPage, 300, 480, '#43a047') };
    const pdf = {
      name: 'relatório-trimestral-de-resultados-consolidados-da-operação-2026.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(`%PDF-1.4\n%T14 ${Date.now()}\n%%EOF\n`),
    };
    const notes = {
      name: 'notas da reunião.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(`Pauta: prévia de anexos ${Date.now()}\n`, 'utf8'),
    };
    const images = [
      { file: photo, width: 640, height: 400 },
      { file: chart, width: 300, height: 480 },
    ];
    const documents = [pdf, notes];

    // While the send is in flight the sender sees placeholders and requests
    // no file yet (pending uploads are not readable).
    const senderHops = recordAttachmentHops(primaryPage);
    let releaseCreate: () => void = () => {};
    const createReleased = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    await primaryPage.route('**/api/messages/create', async (route: Route) => {
      await createReleased;
      await route.continue();
    });
    const text = `Anexos variados ${Date.now()}`;
    await attachFiles(primaryPage, [photo, pdf, chart, notes]);
    const sent = submit(primaryPage, text);
    const optimistic = primaryPage.locator('[data-testid^="message-temp-"]', { hasText: text });
    await expect(optimistic).toBeVisible();
    await expect(optimistic.getByTestId('attachment-image-pending')).toHaveCount(2);
    await expect(optimistic.getByTestId('attachment-file-card')).toHaveCount(2);
    await expect(optimistic.getByRole('link', { name: /^Baixar / })).toHaveCount(0);
    expect(senderHops).toHaveLength(0);
    releaseCreate();
    const created = await sent;
    await primaryPage.unroute('**/api/messages/create');
    const idOf = (name: string) => {
      const attachment = created.attachments?.find((candidate) => candidate.name === name);
      if (!attachment) throw new Error(`attachment ${name} missing from the created message`);
      return attachment.id;
    };
    expect(created.attachments?.map((attachment) => attachment.name).sort()).toEqual(
      [photo.name, chart.name, pdf.name, notes.name].sort(),
    );

    // Recipient: the message with all four attachments.
    const item = secondaryPage.getByTestId(`message-${created.id}`);
    await expect(item).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(item).toHaveAttribute('data-attachment-count', '4');
    await expect(item.getByText(text)).toBeVisible();
    await expect(item.getByTestId('attachment-image-thumbnail')).toHaveCount(2);
    await expect(item.getByTestId('attachment-file-card')).toHaveCount(2);

    // AC-014: thumbnails really load (natural size of what A uploaded) through
    // the route → 307 → signed Storage URL path.
    for (const { file, width, height } of images) {
      const thumbnail = item.getByRole('button', { name: `Ampliar imagem ${file.name}` });
      await expect(thumbnail).toBeVisible();
      await expectImageLoaded(thumbnail.locator('img'), width, height);
      const routeHop = recipientHops.find((hop) => hop.path === `/api/messages/attachment/${idOf(file.name)}`);
      expect(routeHop).toMatchObject({ status: 307, download: false });
      expect(new URL(routeHop?.location ?? 'http://invalid').pathname).toMatch(
        new RegExp(`^/storage/v1/object/sign/attachments/message-attachments/${conversationId}/${idOf(file.name)}`),
      );
    }
    expect(recipientHops.filter((hop) => hop.path.startsWith('/storage/v1/object/sign/') && hop.status === 200).length).toBeGreaterThanOrEqual(2);
    // No signed URL is kept in the page: every open/download re-asks the route.
    await expect(item.locator('[src*="/storage/v1/"], [href*="/storage/v1/"]')).toHaveCount(0);

    // AC-014: file cards with icon, name, size, and a download named after the file.
    for (const file of documents) {
      const card = item.locator(`[data-testid="attachment-file-card"][data-attachment-id="${idOf(file.name)}"]`);
      await expect(card.getByTestId('attachment-file-name')).toHaveText(file.name);
      await expect(card.getByTestId('attachment-file-size')).toHaveText(expectedSize(file.buffer.length));
      await expect(card.locator('svg').first()).toBeVisible();
      await expect(card.getByRole('link', { name: `Baixar ${file.name}` })).toBeVisible();
    }

    // AC-037: the long name truncates inside the 384 px drawer; nothing overflows.
    const drawerBox = await boxOf(secondaryPage.getByTestId('messaging-drawer'));
    expect(Math.round(drawerBox.width)).toBeLessThanOrEqual(384);
    for (const preview of await item.locator('[data-testid="attachment-image-thumbnail"], [data-testid="attachment-file-card"]').all()) {
      const box = await boxOf(preview);
      expect(box.x).toBeGreaterThanOrEqual(drawerBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(drawerBox.x + drawerBox.width + 0.5);
    }
    const longName = item.locator(`[data-attachment-id="${idOf(pdf.name)}"]`).getByTestId('attachment-file-name');
    expect(await longName.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await item.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);

    // Download by mouse (PDF) and by keyboard (TXT): same name and bytes A uploaded.
    const pdfDownloadPromise = secondaryPage.waitForEvent('download');
    await item.getByRole('link', { name: `Baixar ${pdf.name}` }).click();
    const pdfDownload = await pdfDownloadPromise;
    expect(pdfDownload.suggestedFilename()).toBe(pdf.name);
    expect((await downloadedBytes(pdfDownload)).equals(pdf.buffer)).toBe(true);

    const notesLink = item.getByRole('link', { name: `Baixar ${notes.name}` });
    await notesLink.focus();
    const notesDownloadPromise = secondaryPage.waitForEvent('download');
    await secondaryPage.keyboard.press('Enter');
    const notesDownload = await notesDownloadPromise;
    expect(notesDownload.suggestedFilename()).toBe(notes.name);
    expect((await downloadedBytes(notesDownload)).equals(notes.buffer)).toBe(true);
    // Each download went through the route (href) and was served from a signed
    // Storage URL of that object, as an attachment named after the file.
    for (const [file, download] of [[pdf, pdfDownload], [notes, notesDownload]] as const) {
      const id = idOf(file.name);
      await expect(item.getByRole('link', { name: `Baixar ${file.name}` })).toHaveAttribute(
        'href',
        `/api/messages/attachment/${id}?download=1`,
      );
      expectSignedDownloadUrl(download, conversationId, id, file.name);
    }

    // Lightbox by mouse: a labelled dialog with the full-size image; focus
    // stays inside; Esc closes and returns focus to the thumbnail.
    const photoThumbnail = item.getByRole('button', { name: `Ampliar imagem ${photo.name}` });
    // Measured before opening: the modal hides the rest of the page from the
    // accessibility tree.
    const thumbnailWidth = (await boxOf(photoThumbnail)).width;
    await photoThumbnail.click();
    const photoDialog = secondaryPage.getByRole('dialog', { name: photo.name });
    await expect(photoDialog).toBeVisible();
    const photoLarge = photoDialog.getByTestId('attachment-lightbox-image');
    await expectImageLoaded(photoLarge, 640, 400);
    expect((await boxOf(photoLarge)).width).toBeGreaterThan(thumbnailWidth * 2);
    expect(await activeElementInside(photoDialog)).toBe(true);
    for (let press = 0; press < 4; press += 1) {
      await secondaryPage.keyboard.press('Tab');
      expect(await activeElementInside(photoDialog)).toBe(true);
    }
    await secondaryPage.keyboard.press('Escape');
    await expect(photoDialog).toBeHidden();
    await expect(photoThumbnail).toBeFocused();

    // Lightbox by keyboard: Enter opens; its download link saves the image;
    // the close button (keyboard) returns focus to the thumbnail.
    const chartThumbnail = item.getByRole('button', { name: `Ampliar imagem ${chart.name}` });
    await chartThumbnail.focus();
    await secondaryPage.keyboard.press('Enter');
    const chartDialog = secondaryPage.getByRole('dialog', { name: chart.name });
    await expect(chartDialog).toBeVisible();
    await expectImageLoaded(chartDialog.getByTestId('attachment-lightbox-image'), 300, 480);
    const chartDownloadPromise = secondaryPage.waitForEvent('download');
    await chartDialog.getByRole('link', { name: `Baixar ${chart.name}` }).click();
    const chartDownload = await chartDownloadPromise;
    expect(chartDownload.suggestedFilename()).toBe(chart.name);
    expect((await downloadedBytes(chartDownload)).equals(chart.buffer)).toBe(true);
    expectSignedDownloadUrl(chartDownload, conversationId, idOf(chart.name), chart.name);
    const close = chartDialog.getByRole('button', { name: 'Fechar' });
    await close.focus();
    await secondaryPage.keyboard.press('Enter');
    await expect(chartDialog).toBeHidden();
    await expect(chartThumbnail).toBeFocused();

    // Sender: the saved message renders the same previews.
    const sentItem = primaryPage.getByTestId(`message-${created.id}`);
    await expect(sentItem).toHaveAttribute('data-attachment-count', '4');
    for (const { file, width, height } of images) {
      await expectImageLoaded(
        sentItem.getByRole('button', { name: `Ampliar imagem ${file.name}` }).locator('img'),
        width,
        height,
      );
    }
    await expect(sentItem.getByTestId('attachment-file-card')).toHaveCount(2);
  });

  test('a thumbnail that fails to load offers a keyboard retry that loads it', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(90_000);
    const conversationId = messagingData.directConversationId;
    const secondaryStreaming = watchMessagingChangesStream(secondaryPage);
    await openConversation(secondaryPage, conversationId);
    await openConversation(primaryPage, conversationId);
    await secondaryStreaming();

    // B's first read of any attachment fails; later reads pass through.
    let failedReads = 0;
    await secondaryPage.route('**/api/messages/attachment/**', async (route: Route) => {
      if (failedReads === 0) {
        failedReads += 1;
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' });
        return;
      }
      await route.continue();
    });

    const image = { name: 'instavel.png', mimeType: 'image/png', buffer: await canvasPng(primaryPage, 120, 90, '#e53935') };
    await attachFiles(primaryPage, [image]);
    const created = await submit(primaryPage, '');
    expect(created.type).toBe('image');

    const item = secondaryPage.getByTestId(`message-${created.id}`);
    await expect(item).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    const failed = item.getByTestId('attachment-image-failed');
    await expect(failed).toContainText('Não foi possível carregar a imagem.');
    expect(failedReads).toBe(1);

    const retry = failed.getByRole('button', { name: `Tentar carregar ${image.name} de novo` });
    await retry.focus();
    await secondaryPage.keyboard.press('Enter');
    await expect(failed).toHaveCount(0);
    const thumbnail = item.getByRole('button', { name: `Ampliar imagem ${image.name}` });
    await expect(thumbnail).toBeFocused();
    await expectImageLoaded(thumbnail.locator('img'), 120, 90);
  });
});
