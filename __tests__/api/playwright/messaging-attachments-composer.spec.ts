import type { Locator, Page, Request, Route } from '@playwright/test';

import { test, expect } from './fixtures/messaging';
import {
  openDrawer,
  selectConversation,
  sendMessage,
  waitForRealtimeMessage,
  waitForRealtimeReady,
} from './helpers/drawer-helpers';

/**
 * Phase 4 T13 — the production composer sends files (FR-007, FR-008, FR-009,
 * FR-012, FR-024, BR-007; AC-008, AC-009, AC-011, AC-012, AC-016, AC-029,
 * AC-037). Rich previews in the feed are T14: delivery is checked through the
 * message's attachment count (feed DOM `data-attachment-count`) and the API.
 */

const RECV_TIMEOUT_MS = 15_000;

/** 1×1 transparent PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface ApiAttachment {
  id: string;
  name: string;
  type: string;
}

interface ApiMessage {
  id: string;
  content: string;
  type: string;
  replyToId?: string | null;
  attachments?: ApiAttachment[];
}

const textFile = (name: string, text = `content of ${name}`) => ({
  name,
  mimeType: 'text/plain',
  buffer: Buffer.from(text),
});

const composerOf = (page: Page) => page.getByTestId('composer');
const pendingRows = (page: Page) => composerOf(page).getByTestId('pending-file');
const pendingRow = (page: Page, name: string) =>
  composerOf(page).locator(`[data-testid="pending-file"][data-file-name="${name}"]`);
const sendButtonOf = (page: Page) => composerOf(page).getByTestId('message-send-button');

async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.goto('/floor-plan');
  await page.waitForLoadState('networkidle');
  await openDrawer(page);
  await selectConversation(page, { id: conversationId });
  await waitForRealtimeReady(page);
}

/** File name inside a multipart upload request. */
function uploadedFileName(request: Request): string {
  const body = request.postDataBuffer()?.toString('latin1') ?? '';
  return /filename="([^"]+)"/.exec(body)?.[1] ?? '';
}

const isUploadPost = (request: Request) =>
  new URL(request.url()).pathname === '/api/messages/upload' && request.method() === 'POST';
const isCreatePost = (request: Request) =>
  new URL(request.url()).pathname === '/api/messages/create' && request.method() === 'POST';

/** Opens the file picker with the keyboard (Enter on the attach button) and picks files. */
async function pickFilesByKeyboard(
  page: Page,
  files: Array<{ name: string; mimeType: string; buffer: Buffer }>,
): Promise<void> {
  const attach = composerOf(page).getByRole('button', { name: 'Anexar arquivos' });
  await attach.focus();
  await expect(attach).toBeFocused();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles(files);
}

/** Drags files from outside the page and drops them onto the composer. */
async function dropFiles(
  page: Page,
  target: Locator,
  files: Array<{ name: string; type: string; base64: string }>,
): Promise<void> {
  const dataTransfer = await page.evaluateHandle((specs) => {
    const transfer = new DataTransfer();
    for (const spec of specs) {
      const bytes = Uint8Array.from(atob(spec.base64), (char) => char.charCodeAt(0));
      transfer.items.add(new File([bytes], spec.name, { type: spec.type }));
    }
    return transfer;
  }, files);
  await target.dispatchEvent('dragenter', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  await expect(page.getByTestId('composer-drop-overlay')).toBeVisible();
  await target.dispatchEvent('drop', { dataTransfer });
  await expect(page.getByTestId('composer-drop-overlay')).toHaveCount(0);
}

/** Puts a PNG on the system clipboard and presses Ctrl+V in the composer text box. */
async function pasteImageWithKeyboard(page: Page): Promise<void> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(page.url()).origin,
  });
  const textarea = composerOf(page).locator('textarea');
  await textarea.focus();
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
  }, PNG_BASE64);
  await page.keyboard.press('Control+V');
}

async function serverMessages(page: Page, conversationId: string): Promise<ApiMessage[]> {
  const response = await page.request.get(`/api/messages/get?conversationId=${conversationId}&limit=50`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { messages: ApiMessage[] }).messages;
}

/**
 * Records, for every feed message, each attachment count it was rendered
 * with (MutationObserver callbacks run before the next paint, so no rendered
 * state is missed).
 */
async function recordRenderedAttachmentCounts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: Record<string, number[]> = {};
    (window as unknown as { __attachmentCounts: Record<string, number[]> }).__attachmentCounts = seen;
    const record = () => {
      document.querySelectorAll<HTMLElement>('[data-attachment-count]').forEach((element) => {
        const id = element.dataset.testid ?? '';
        const count = Number(element.dataset.attachmentCount);
        const counts = (seen[id] ??= []);
        if (counts[counts.length - 1] !== count) counts.push(count);
      });
    };
    new MutationObserver(record).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-attachment-count'],
    });
    record();
  });
}

async function renderedAttachmentCounts(page: Page, messageId: string): Promise<number[]> {
  return page.evaluate(
    (id) =>
      (window as unknown as { __attachmentCounts: Record<string, number[]> }).__attachmentCounts[`message-${id}`] ?? [],
    messageId,
  );
}

/** Every pending-file row and the composer stay inside the 384 px drawer, without horizontal overflow. */
async function expectComposerFitsDrawer(page: Page): Promise<void> {
  const boxOf = async (locator: Locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error('element has no bounding box');
    return box;
  };
  const drawerBox = await boxOf(page.getByTestId('messaging-drawer'));
  expect(Math.round(drawerBox.width)).toBeLessThanOrEqual(384);
  const rows = await pendingRows(page).all();
  for (const row of rows) {
    const box = await boxOf(row);
    expect(box.x).toBeGreaterThanOrEqual(drawerBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(drawerBox.x + drawerBox.width + 0.5);
  }
  const overflow = await composerOf(page).evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Production composer attachments', () => {
  test('A sends a 3-file message (keyboard picker and drop) with per-file progress; B receives it only complete', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    await openConversation(secondaryPage, conversationId);
    await openConversation(primaryPage, conversationId);
    await recordRenderedAttachmentCounts(secondaryPage);

    // Uploads are held until released, so the pending state can be observed.
    const heldUploads: Route[] = [];
    let releaseUploads: () => void = () => {};
    const uploadsReleased = new Promise<void>((resolve) => {
      releaseUploads = resolve;
    });
    await primaryPage.route('**/api/messages/upload', async (route) => {
      heldUploads.push(route);
      await uploadsReleased;
      await route.continue();
    });
    const createBodies: Array<{ content?: string; attachmentIds?: string[]; clientMessageId?: string }> = [];
    primaryPage.on('request', (request) => {
      if (isCreatePost(request)) createBodies.push(request.postDataJSON());
    });

    const longPdfName = 'relatorio-trimestral-de-resultados-financeiros-consolidados-da-empresa-2026.pdf';
    await pickFilesByKeyboard(primaryPage, [
      { name: longPdfName, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%T13\n') },
      textFile('notas.txt'),
    ]);
    await dropFiles(primaryPage, composerOf(primaryPage).locator('textarea'), [
      { name: 'foto.png', type: 'image/png', base64: PNG_BASE64 },
    ]);

    // AC-008/AC-011: three pending files, each with its own progress, while uploading.
    await expect(pendingRows(primaryPage)).toHaveCount(3);
    await expect.poll(() => heldUploads.length).toBe(3);
    expect(heldUploads.map((route) => uploadedFileName(route.request())).sort()).toEqual(
      [longPdfName, 'foto.png', 'notas.txt'].sort(),
    );
    for (const name of [longPdfName, 'notas.txt', 'foto.png']) {
      const row = pendingRow(primaryPage, name);
      await expect(row).toHaveAttribute('data-upload-status', 'uploading');
      const progress = row.getByRole('progressbar', { name: `Enviando ${name}` });
      await expect(progress).toBeVisible();
      const value = Number(await progress.getAttribute('aria-valuenow'));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
      await expect(row.getByRole('button', { name: `Cancelar envio de ${name}` })).toBeVisible();
    }
    await expect(composerOf(primaryPage).getByTestId('composer-pending-files-summary')).toHaveText(
      'Enviando arquivos: 0 de 3 prontos.',
    );
    await expectComposerFitsDrawer(primaryPage);

    // BR-007: nothing is sent while uploads are running, even on Enter.
    const text = `Três arquivos ${Date.now()}`;
    const textarea = composerOf(primaryPage).locator('textarea');
    await textarea.fill(text);
    await expect(sendButtonOf(primaryPage)).toBeDisabled();
    await textarea.press('Enter');
    await primaryPage.waitForTimeout(300);
    expect(createBodies).toHaveLength(0);
    expect((await serverMessages(secondaryPage, conversationId)).some((m) => m.content === text)).toBe(false);

    releaseUploads();
    for (const name of [longPdfName, 'notas.txt', 'foto.png']) {
      await expect(pendingRow(primaryPage, name)).toHaveAttribute('data-upload-status', 'uploaded');
    }
    await expect(composerOf(primaryPage).getByTestId('composer-pending-files-summary')).toHaveText(
      '3 arquivos prontos.',
    );
    await expect(primaryPage.getByTestId('pending-file-progress')).toHaveCount(0);

    const createResponse = primaryPage.waitForResponse((response) => isCreatePost(response.request()));
    await textarea.press('Enter');
    const response = await createResponse;
    expect(response.status()).toBe(201);
    const { message: created } = (await response.json()) as { message: ApiMessage };
    expect(createBodies).toHaveLength(1);
    expect(createBodies[0].content).toBe(text);
    expect(createBodies[0].attachmentIds).toHaveLength(3);
    expect(created.attachments?.map((a) => a.name).sort()).toEqual([longPdfName, 'foto.png', 'notas.txt'].sort());

    // Sender: composer cleared, message carries the three files.
    await expect(textarea).toHaveValue('');
    await expect(pendingRows(primaryPage)).toHaveCount(0);
    await expect(primaryPage.getByTestId(`message-${created.id}`)).toHaveAttribute('data-attachment-count', '3');

    // Recipient: live delivery, rendered only ever with all three files.
    const delivered = secondaryPage.getByTestId(`message-${created.id}`);
    await expect(delivered).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(delivered).toHaveAttribute('data-attachment-count', '3');
    expect(await renderedAttachmentCounts(secondaryPage, created.id)).toEqual([3]);
    const stored = (await serverMessages(secondaryPage, conversationId)).filter((m) => m.content === text);
    expect(stored).toHaveLength(1);
    expect(stored[0].attachments?.map((a) => a.name).sort()).toEqual([longPdfName, 'foto.png', 'notas.txt'].sort());
  });

  test('invalid files are refused before upload; a failed upload retries; uploads can be cancelled and removed', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    await openConversation(secondaryPage, conversationId);
    await openConversation(primaryPage, conversationId);

    // Every upload request the browser makes, by file name; failures and
    // holds are applied per file and never reach the server.
    const uploadAttempts: string[] = [];
    let failNext = new Set<string>(['falha.txt']);
    let heldRoute: Route | null = null;
    await primaryPage.route('**/api/messages/upload', async (route) => {
      const name = uploadedFileName(route.request());
      uploadAttempts.push(name);
      if (failNext.has(name)) {
        failNext = new Set([...failNext].filter((candidate) => candidate !== name));
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Failed to upload file', code: 'INTERNAL_ERROR' }),
        });
        return;
      }
      if (name === 'lento.txt') {
        heldRoute = route;
        return;
      }
      await route.continue();
    });
    const uploadIds = new Map<string, string>();
    primaryPage.on('response', async (response) => {
      if (isUploadPost(response.request()) && response.status() === 201) {
        const { attachment } = (await response.json()) as { attachment: ApiAttachment };
        uploadIds.set(attachment.name, attachment.id);
      }
    });

    // AC-009: size, type, and count limits are enforced before any upload.
    const oversize = {
      name: 'grande.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x20),
    };
    await pickFilesByKeyboard(primaryPage, [
      oversize,
      { name: 'pacote.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') },
      textFile('a.txt'),
    ]);
    const rejections = composerOf(primaryPage).getByTestId('composer-file-rejections');
    await expect(rejections).toHaveAttribute('role', 'alert');
    await expect(rejections).toContainText('“grande.pdf” tem mais de 10 MB.');
    await expect(rejections).toContainText('“pacote.zip” não é um tipo permitido');
    await expect(pendingRows(primaryPage)).toHaveCount(1);
    await expect(pendingRow(primaryPage, 'a.txt')).toHaveAttribute('data-upload-status', 'uploaded');
    expect(uploadAttempts).toEqual(['a.txt']);

    await pickFilesByKeyboard(primaryPage, [
      textFile('falha.txt'),
      textFile('lento.txt'),
      textFile('removido.txt'),
      textFile('b.txt'),
      textFile('sexto.txt'),
    ]);
    await expect(rejections).toHaveText(/“sexto\.txt” não foi adicionado: uma mensagem leva no máximo 5 arquivos\./);
    await expect(rejections).not.toContainText('grande.pdf');
    await expect(pendingRows(primaryPage)).toHaveCount(5);
    expect(uploadAttempts).not.toContain('sexto.txt');
    await rejections.getByRole('button', { name: 'Fechar aviso de arquivos recusados' }).click();
    await expect(rejections).toHaveCount(0);

    // AC-012: the failed upload shows an error and a retry; sending waits.
    const failedRow = pendingRow(primaryPage, 'falha.txt');
    await expect(failedRow).toHaveAttribute('data-upload-status', 'failed');
    await expect(failedRow.getByTestId('pending-file-error')).toHaveText('Falha no envio do arquivo.');
    await expect(failedRow.getByTestId('pending-file-error')).toHaveAttribute('role', 'alert');
    await expect(composerOf(primaryPage).getByTestId('composer-pending-files-summary')).toHaveText(
      '1 arquivo falhou: tente de novo ou remova.',
    );
    await expect(pendingRow(primaryPage, 'removido.txt')).toHaveAttribute('data-upload-status', 'uploaded');
    await expect(pendingRow(primaryPage, 'b.txt')).toHaveAttribute('data-upload-status', 'uploaded');
    await expect(sendButtonOf(primaryPage)).toBeDisabled();

    // FR-009: an upload in flight is cancelled from its row (keyboard).
    const slowRow = pendingRow(primaryPage, 'lento.txt');
    await expect(slowRow).toHaveAttribute('data-upload-status', 'uploading');
    await expect.poll(() => heldRoute !== null).toBe(true);
    const cancel = slowRow.getByRole('button', { name: 'Cancelar envio de lento.txt' });
    await cancel.focus();
    await primaryPage.keyboard.press('Enter');
    await expect(slowRow).toHaveCount(0);
    await (heldRoute as Route | null)?.abort().catch(() => {});

    // Retry the failed upload (keyboard); it succeeds.
    const retry = failedRow.getByRole('button', { name: 'Tentar enviar falha.txt de novo' });
    await retry.focus();
    await primaryPage.keyboard.press('Enter');
    await expect(failedRow).toHaveAttribute('data-upload-status', 'uploaded');
    expect(uploadAttempts.filter((name) => name === 'falha.txt')).toHaveLength(2);

    // Removing an uploaded file cancels its pending upload on the server.
    await expect.poll(() => uploadIds.get('removido.txt')).toBeTruthy();
    const removedUploadId = uploadIds.get('removido.txt') ?? '';
    const cancelResponse = primaryPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/messages/upload/${removedUploadId}` &&
        response.request().method() === 'DELETE',
    );
    await pendingRow(primaryPage, 'removido.txt').getByRole('button', { name: 'Remover removido.txt' }).click();
    expect((await cancelResponse).status()).toBe(200);
    await expect(pendingRows(primaryPage)).toHaveCount(3);
    await expectComposerFitsDrawer(primaryPage);

    // An attachment-only message (no text) goes out with the three remaining files.
    await expect(sendButtonOf(primaryPage)).toBeEnabled();
    const createResponse = primaryPage.waitForResponse((response) => isCreatePost(response.request()));
    await sendButtonOf(primaryPage).click();
    const response = await createResponse;
    expect(response.status()).toBe(201);
    const { message: created } = (await response.json()) as { message: ApiMessage };
    expect(created.content).toBe('');
    expect(created.attachments?.map((a) => a.name).sort()).toEqual(['a.txt', 'b.txt', 'falha.txt']);
    await expect(pendingRows(primaryPage)).toHaveCount(0);

    const delivered = secondaryPage.getByTestId(`message-${created.id}`);
    await expect(delivered).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(delivered).toHaveAttribute('data-attachment-count', '3');
    const stored = (await serverMessages(secondaryPage, conversationId)).find((m) => m.id === created.id);
    expect(stored?.attachments?.map((a) => a.name).sort()).toEqual(['a.txt', 'b.txt', 'falha.txt']);
    expect(uploadAttempts).not.toContain('sexto.txt');
    expect(uploadAttempts).not.toContain('grande.pdf');
    expect(uploadAttempts).not.toContain('pacote.zip');
  });

  test('Ctrl+V adds an image; a failed send keeps text, reply target, and files, and its retry sends exactly one message', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    await openConversation(secondaryPage, conversationId);
    await openConversation(primaryPage, conversationId);

    const parentText = `Alvo da resposta ${Date.now()}`;
    const parentId = await sendMessage(primaryPage, parentText);
    await waitForRealtimeMessage(secondaryPage, parentText);
    const replyPreview = composerOf(primaryPage).getByTestId('reply-composer-preview');
    await primaryPage.getByTestId(`reply-button-${parentId}`).click();
    await expect(replyPreview).toContainText(parentText);

    // AC-016: an image on the clipboard becomes a pending file with Ctrl+V.
    const text = `Resposta com arquivos ${Date.now()}`;
    const textarea = composerOf(primaryPage).locator('textarea');
    await textarea.fill(text);
    await pasteImageWithKeyboard(primaryPage);
    await expect(pendingRows(primaryPage)).toHaveCount(1);
    await expect(pendingRows(primaryPage).first()).toHaveAttribute('data-upload-status', 'uploaded');
    await expect(textarea).toHaveValue(text);
    await pickFilesByKeyboard(primaryPage, [
      { name: 'planilha.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%reply\n') },
    ]);
    await expect(pendingRow(primaryPage, 'planilha.pdf')).toHaveAttribute('data-upload-status', 'uploaded');

    // The first create fails in transit; the retry goes through.
    const creates: Array<{ clientMessageId?: string; attachmentIds?: string[]; replyToId?: string; content?: string }> = [];
    let failCreate = true;
    await primaryPage.route('**/api/messages/create', async (route) => {
      creates.push(route.request().postDataJSON());
      if (failCreate) {
        failCreate = false;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await sendButtonOf(primaryPage).click();
    const sendError = composerOf(primaryPage).getByTestId('composer-send-error');
    await expect(sendError).toBeVisible();
    await expect(sendError).toHaveAttribute('role', 'alert');
    // AC-029: text, reply target, and both files stay.
    await expect(textarea).toHaveValue(text);
    await expect(replyPreview).toContainText(parentText);
    await expect(pendingRows(primaryPage)).toHaveCount(2);
    for (const row of await pendingRows(primaryPage).all()) {
      await expect(row).toHaveAttribute('data-upload-status', 'uploaded');
    }
    expect(creates).toHaveLength(1);
    expect(creates[0].attachmentIds).toHaveLength(2);
    expect((await serverMessages(secondaryPage, conversationId)).some((m) => m.content === text)).toBe(false);

    // Retry by keyboard: same composition key and files, one message.
    const createResponse = primaryPage.waitForResponse((response) => isCreatePost(response.request()));
    const retry = sendError.getByRole('button', { name: 'Tentar de novo' });
    await retry.focus();
    await primaryPage.keyboard.press('Enter');
    const response = await createResponse;
    expect(response.status()).toBe(201);
    const { message: created } = (await response.json()) as { message: ApiMessage };
    expect(creates).toHaveLength(2);
    expect(creates[1].clientMessageId).toBe(creates[0].clientMessageId);
    expect([...(creates[1].attachmentIds ?? [])].sort()).toEqual([...(creates[0].attachmentIds ?? [])].sort());
    expect(creates[1]).toMatchObject({ content: text, replyToId: parentId });
    expect(created.replyToId).toBe(parentId);
    expect(created.attachments).toHaveLength(2);

    await expect(textarea).toHaveValue('');
    await expect(replyPreview).toBeHidden();
    await expect(sendError).toBeHidden();
    await expect(pendingRows(primaryPage)).toHaveCount(0);

    // B: exactly one copy, threaded under the reply target, with both files.
    await expect(secondaryPage.getByTestId(`reply-count-${parentId}`)).toHaveText(/1 reply/, {
      timeout: RECV_TIMEOUT_MS,
    });
    const copies = (await serverMessages(secondaryPage, conversationId)).filter((m) => m.content === text);
    expect(copies).toHaveLength(1);
    expect(copies[0].attachments).toHaveLength(2);
    expect(copies[0].replyToId).toBe(parentId);

    // An image-only message (pasted) renders for both accounts.
    await primaryPage.unroute('**/api/messages/create');
    await pasteImageWithKeyboard(primaryPage);
    await expect(pendingRows(primaryPage)).toHaveCount(1);
    await expect(pendingRows(primaryPage).first()).toHaveAttribute('data-upload-status', 'uploaded');
    const imageResponse = primaryPage.waitForResponse((r) => isCreatePost(r.request()));
    await textarea.press('Enter');
    const imageCreate = await imageResponse;
    expect(imageCreate.status()).toBe(201);
    const { message: imageMessage } = (await imageCreate.json()) as { message: ApiMessage };
    expect(imageMessage.type).toBe('image');
    await expect(primaryPage.getByTestId(`message-${imageMessage.id}`)).toHaveAttribute('data-attachment-count', '1');
    const imageDelivered = secondaryPage.getByTestId(`message-${imageMessage.id}`);
    await expect(imageDelivered).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(imageDelivered).toHaveAttribute('data-attachment-count', '1');
  });
});

test.describe('Composer image button', () => {
  test('the image button opens an image-only picker from the keyboard and the picked image becomes a pending file (FR-007, AC-008, AC-037)', async ({
    primaryPage,
    messagingData,
  }) => {
    test.setTimeout(60_000);
    await openConversation(primaryPage, messagingData.directConversationId);

    const imageButton = composerOf(primaryPage).getByTestId('composer-image-button');
    await expect(imageButton).toHaveAccessibleName('Anexar imagens');
    await imageButton.focus();
    await expect(imageButton).toBeFocused();
    const chooserPromise = primaryPage.waitForEvent('filechooser');
    await primaryPage.keyboard.press('Enter');
    const chooser = await chooserPromise;
    expect(chooser.isMultiple()).toBe(true);
    const accept = ((await chooser.element().getAttribute('accept')) ?? '').split(',');
    expect(accept).toEqual(expect.arrayContaining(['image/jpeg', 'image/png', 'image/gif', 'image/webp']));
    expect(accept.every((value) => value.startsWith('image/') || /^\.(jpe?g|png|gif|webp)$/.test(value))).toBe(true);

    const uploaded = primaryPage.waitForResponse(
      (response) => isUploadPost(response.request()) && response.status() === 201,
    );
    await chooser.setFiles([{ name: 'imagem.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') }]);
    const row = pendingRow(primaryPage, 'imagem.png');
    await expect(row).toBeVisible();
    await uploaded;
    await expect(row).toHaveAttribute('data-upload-status', 'uploaded');

    // Leave nothing pending: removing the file cancels its upload.
    const cancelled = primaryPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.startsWith('/api/messages/upload/') &&
        response.request().method() === 'DELETE',
    );
    await row.getByTestId('pending-file-remove').click();
    expect((await cancelled).ok()).toBe(true);
    await expect(pendingRows(primaryPage)).toHaveCount(0);
  });
});
