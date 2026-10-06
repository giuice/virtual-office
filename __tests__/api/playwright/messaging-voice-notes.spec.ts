import type { Page, Request } from '@playwright/test';

import { test, expect } from './fixtures/messaging';
import { backToConversationList, openDrawer, selectConversation, waitForRealtimeReady } from './helpers/drawer-helpers';

/**
 * Phase 4 T16 — users record, review, and send a voice note from the
 * production composer (FR-013, FR-014, FR-017; AC-017, AC-018, AC-020,
 * AC-037). Here B receives the note as a message carrying one audio
 * attachment with duration and waveform; playing it in the feed (T18) is
 * covered by messaging-voice-notes-playback.spec.ts.
 *
 * Chromium's fake capture device supplies the microphone (a periodic tone);
 * the microphone permission is granted or left ungranted per context. The
 * 2-minute limit is checked with Playwright's clock (page.clock), which
 * fakes the page's timers and performance.now from the test runner: no
 * product code, flag, or constant changes for the test, so the product limit
 * stays MAX_VOICE_NOTE_DURATION_SECONDS = 120 and cannot be altered in
 * production.
 */
test.use({
  // Full Chromium in new headless mode: the default headless shell has no
  // media capture (getUserMedia rejects with NotSupportedError).
  channel: 'chromium',
  launchOptions: {
    // Fake microphone only: no --use-fake-ui-for-media-stream, which would
    // accept every permission prompt and make the denied case impossible.
    args: ['--use-fake-device-for-media-stream'],
  },
});

const RECV_TIMEOUT_MS = 15_000;
const VOICE_ALONE_TEXT = 'Uma nota de voz é enviada sozinha: envie ou descarte a nota antes de anexar arquivos.';

interface ApiAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  duration?: number;
  waveformData?: number[];
}

interface ApiMessage {
  id: string;
  content: string;
  type: string;
  attachments?: ApiAttachment[];
}

const composerOf = (page: Page) => page.getByTestId('composer');
const recordButtonOf = (page: Page) => composerOf(page).getByRole('button', { name: 'Gravar nota de voz' });
const panelOf = (page: Page) => composerOf(page).getByTestId('voice-recording-panel');
const previewOf = (page: Page) => composerOf(page).getByTestId('voice-note-preview');
const noticeOf = (page: Page) => composerOf(page).getByTestId('voice-recording-notice');

const isUploadPost = (request: Request) =>
  new URL(request.url()).pathname === '/api/messages/upload' && request.method() === 'POST';
const isCreatePost = (request: Request) =>
  new URL(request.url()).pathname === '/api/messages/create' && request.method() === 'POST';

/**
 * Wraps getUserMedia (before any page script runs) to count calls and keep
 * every stream handed out, so a test can prove the microphone was released.
 * Observation only: the streams and errors pass through unchanged.
 */
async function instrumentMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = window as unknown as { __micCalls: number; __micStreams: MediaStream[] };
    state.__micCalls = 0;
    state.__micStreams = [];
    const devices = navigator.mediaDevices;
    if (!devices?.getUserMedia) return;
    const original = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      state.__micCalls += 1;
      const stream = await original(constraints);
      state.__micStreams.push(stream);
      return stream;
    };
  });
}

async function microphoneUse(page: Page): Promise<{ calls: number; streams: number; liveTracks: number }> {
  return page.evaluate(() => {
    const state = window as unknown as { __micCalls: number; __micStreams: MediaStream[] };
    return {
      calls: state.__micCalls,
      streams: state.__micStreams.length,
      liveTracks: state.__micStreams
        .flatMap((stream) => stream.getTracks())
        .filter((track) => track.readyState === 'live').length,
    };
  });
}

async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.goto('/floor-plan');
  // Concrete ready signal (TRACK T29): the messaging provider is subscribed,
  // so the drawer list is live before a conversation is picked.
  await waitForRealtimeReady(page);
  await openDrawer(page);
  await selectConversation(page, { id: conversationId });
  await waitForRealtimeReady(page);
}

async function grantMicrophone(page: Page): Promise<void> {
  await page.context().grantPermissions(['microphone'], { origin: new URL(page.url()).origin });
}

async function serverMessages(page: Page, conversationId: string): Promise<ApiMessage[]> {
  const response = await page.request.get(`/api/messages/get?conversationId=${conversationId}&limit=50`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { messages: ApiMessage[] }).messages;
}

/** The pending attachment returned (201) for an upload request. */
async function uploadedAttachment(request: Request): Promise<ApiAttachment> {
  const response = await request.response();
  if (!response) throw new Error('upload request got no response');
  expect(response.status()).toBe(201);
  return ((await response.json()) as { attachment: ApiAttachment }).attachment;
}

function timerSeconds(text: string | null): number {
  const match = /^(\d+):(\d{2}) \/ 2:00$/.exec((text ?? '').trim());
  if (!match) throw new Error(`unexpected timer text: ${text}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** The composer (and what it shows) stays inside the 384 px drawer without horizontal overflow. */
async function expectComposerFitsDrawer(page: Page): Promise<void> {
  const drawerBox = await page.getByTestId('messaging-drawer').boundingBox();
  const composerBox = await composerOf(page).boundingBox();
  if (!drawerBox || !composerBox) throw new Error('drawer or composer has no bounding box');
  expect(Math.round(drawerBox.width)).toBeLessThanOrEqual(384);
  expect(composerBox.x + composerBox.width).toBeLessThanOrEqual(drawerBox.x + drawerBox.width + 0.5);
  const overflow = await composerOf(page).evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Starts a recording with the keyboard and waits until it is running (focus on "Parar gravação"). */
async function startRecordingByKeyboard(page: Page): Promise<void> {
  const record = recordButtonOf(page);
  await record.focus();
  await expect(record).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panelOf(page)).toHaveAttribute('data-recorder-status', 'recording');
  await expect(panelOf(page).getByRole('button', { name: 'Parar gravação' })).toBeFocused();
}

test.describe('Composer voice notes', () => {
  test('A records with live waveform and timer, previews, and sends a voice note that B receives', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    await instrumentMicrophone(primaryPage);
    await openConversation(secondaryPage, conversationId);
    await openConversation(primaryPage, conversationId);
    await grantMicrophone(primaryPage);

    const uploads: Request[] = [];
    primaryPage.on('request', (request) => {
      if (isUploadPost(request)) uploads.push(request);
    });

    // AC-017: recording shows a live waveform and an elapsed timer.
    await startRecordingByKeyboard(primaryPage);
    const panel = panelOf(primaryPage);
    await expect(panel.getByRole('status')).toHaveText('Gravando');
    const timer = panel.getByRole('timer', { name: 'Tempo de gravação' });
    await expect(timer).toHaveText('0:00 / 2:00');
    await expect.poll(async () => timerSeconds(await timer.textContent()), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    const waveform = panel.getByTestId('voice-recording-waveform');
    await expect.poll(async () => Number(await waveform.getAttribute('data-level-count'))).toBeGreaterThanOrEqual(10);
    // The fake device's tone (attenuated by noise suppression) shows up as live levels above silence.
    await expect
      .poll(async () => Number(await waveform.getAttribute('data-max-level')), { timeout: 10_000 })
      .toBeGreaterThan(0.01);
    const countBefore = Number(await waveform.getAttribute('data-level-count'));
    await expect.poll(async () => Number(await waveform.getAttribute('data-level-count'))).toBeGreaterThan(countBefore);
    await expect(panel.getByTestId('voice-recording-limit-warning')).toHaveCount(0);
    expect(await microphoneUse(primaryPage)).toEqual({ calls: 1, streams: 1, liveTracks: 1 });
    // Nothing is sent while recording, even on Enter in the text box.
    await expect(composerOf(primaryPage).getByTestId('message-send-button')).toBeDisabled();
    await expectComposerFitsDrawer(primaryPage);

    // Stop (keyboard): the microphone is released and the preview appears.
    await primaryPage.keyboard.press('Enter');
    await expect(panel).toHaveCount(0);
    expect((await microphoneUse(primaryPage)).liveTracks).toBe(0);
    const preview = previewOf(primaryPage);
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-upload-status', 'uploaded');
    await expect(preview.getByRole('status')).toHaveText('Nota de voz pronta para enviar.');
    const durationSeconds = Number(await preview.getAttribute('data-duration-seconds'));
    expect(durationSeconds).toBeGreaterThanOrEqual(2);
    expect(durationSeconds).toBeLessThan(30);
    await expect(preview.getByTestId('voice-note-preview-duration')).toHaveText(
      `0:${String(Math.ceil(durationSeconds)).padStart(2, '0')}`,
    );
    await expectComposerFitsDrawer(primaryPage);

    // The server stored a voice note (audio is accepted only as kind=voice)
    // with the recorded duration and waveform.
    expect(uploads).toHaveLength(1);
    const uploaded = await uploadedAttachment(uploads[0]);
    expect(uploaded.type).toBe('audio/webm');
    expect(uploaded.duration).toBe(Math.ceil(durationSeconds));
    const sentWaveform = uploaded.waveformData ?? [];
    expect(sentWaveform.length).toBeGreaterThanOrEqual(10);
    expect(sentWaveform.length).toBeLessThanOrEqual(256);
    expect(sentWaveform.every((level) => level >= 0 && level <= 1)).toBe(true);
    expect(Math.max(...sentWaveform)).toBe(1);
    expect(Number(await preview.getAttribute('data-waveform-samples'))).toBe(sentWaveform.length);

    // Preview playback: the player holds the local recording and plays it.
    const audio = preview.getByTestId('voice-note-preview-audio');
    await expect(audio).toBeFocused();
    await expect(audio).toHaveAttribute('aria-label', 'Ouvir prévia da nota de voz');
    expect(await audio.getAttribute('src')).toMatch(/^blob:/);
    await audio.evaluate((element: HTMLAudioElement) => element.play());
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0.3);
    await audio.evaluate((element: HTMLAudioElement) => element.pause());

    // A voice note goes alone: adding files is refused with the reason, and no picker opens.
    let pickerOpened = false;
    primaryPage.on('filechooser', () => {
      pickerOpened = true;
    });
    const attach = composerOf(primaryPage).getByRole('button', { name: 'Anexar arquivos' });
    await expect(attach).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled keeps it focusable: activating it explains why.
    await attach.focus();
    await primaryPage.keyboard.press('Enter');
    await expect(composerOf(primaryPage).getByTestId('composer-file-rejections')).toHaveText(VOICE_ALONE_TEXT);
    expect(pickerOpened).toBe(false);
    await composerOf(primaryPage).getByRole('button', { name: 'Fechar aviso de arquivos recusados' }).click();
    // ...and so is a second recording.
    await expect(recordButtonOf(primaryPage)).toHaveAttribute('aria-disabled', 'true');
    await recordButtonOf(primaryPage).focus();
    await primaryPage.keyboard.press('Enter');
    await expect(noticeOf(primaryPage)).toHaveAttribute('data-problem', 'voice-pending');
    expect((await microphoneUse(primaryPage)).calls).toBe(1);
    await noticeOf(primaryPage).getByRole('button', { name: 'Fechar aviso do microfone' }).click();

    // Send with a caption (Enter): one file message carrying only the voice note.
    const caption = `Nota de voz ${Date.now()}`;
    const textarea = composerOf(primaryPage).locator('textarea');
    await textarea.fill(caption);
    const createResponse = primaryPage.waitForResponse((response) => isCreatePost(response.request()));
    await textarea.press('Enter');
    const response = await createResponse;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({ content: caption, attachmentIds: [uploaded.id] });
    const { message: created } = (await response.json()) as { message: ApiMessage };
    expect(created.type).toBe('file');
    await expect(textarea).toHaveValue('');
    await expect(previewOf(primaryPage)).toHaveCount(0);
    await expect(primaryPage.getByTestId(`message-${created.id}`)).toHaveAttribute('data-attachment-count', '1');

    // B receives it live: one audio attachment with duration and waveform.
    const delivered = secondaryPage.getByTestId(`message-${created.id}`);
    await expect(delivered).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(delivered).toHaveAttribute('data-attachment-count', '1');
    await expect(delivered).toContainText(caption);
    const stored = (await serverMessages(secondaryPage, conversationId)).filter((m) => m.id === created.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].attachments).toHaveLength(1);
    expect(stored[0].attachments?.[0]).toMatchObject({
      id: uploaded.id,
      type: 'audio/webm',
      duration: Math.ceil(durationSeconds),
    });
    expect(stored[0].attachments?.[0].waveformData).toHaveLength(sentWaveform.length);
  });

  test('the limit warning shows from 1:50 and the recording stops itself at 2:00, ready to send', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    await instrumentMicrophone(primaryPage);
    await openConversation(secondaryPage, conversationId);
    await openConversation(primaryPage, conversationId);
    await grantMicrophone(primaryPage);
    const uploads: Request[] = [];
    primaryPage.on('request', (request) => {
      if (isUploadPost(request)) uploads.push(request);
    });

    // Test-only clock: the page's timers and performance.now follow it.
    await primaryPage.clock.install();
    await startRecordingByKeyboard(primaryPage);
    const panel = panelOf(primaryPage);
    const timer = panel.getByRole('timer', { name: 'Tempo de gravação' });
    const warning = panel.getByTestId('voice-recording-limit-warning');

    await primaryPage.clock.fastForward(105_000);
    await expect.poll(async () => timerSeconds(await timer.textContent())).toBeGreaterThanOrEqual(105);
    expect(timerSeconds(await timer.textContent())).toBeLessThan(110);
    await expect(warning).toHaveCount(0);

    // AC-018: from 1:50 a warning shows while recording continues.
    await primaryPage.clock.fastForward(6_000);
    await expect(warning).toBeVisible();
    await expect(warning).toHaveAttribute('role', 'alert');
    await expect(warning).toHaveText('Faltam 10 segundos: a gravação para automaticamente em 2:00.');
    expect(timerSeconds(await timer.textContent())).toBeGreaterThanOrEqual(110);
    await expect(panel).toHaveAttribute('data-recorder-status', 'recording');
    expect((await microphoneUse(primaryPage)).liveTracks).toBe(1);

    // At 2:00 it stops by itself, releases the microphone, and is ready to preview/send.
    await primaryPage.clock.fastForward(10_000);
    await expect(panel).toHaveCount(0);
    expect((await microphoneUse(primaryPage)).liveTracks).toBe(0);
    const preview = previewOf(primaryPage);
    await expect(preview).toHaveAttribute('data-upload-status', 'uploaded');
    await expect(preview).toHaveAttribute('data-duration-seconds', '120');
    await expect(preview.getByTestId('voice-note-preview-duration')).toHaveText('2:00');
    await expect(preview.getByRole('status')).toHaveText(
      'A gravação parou no limite de 2:00. Nota de voz pronta para enviar.',
    );
    expect(uploads).toHaveLength(1);
    const uploaded = await uploadedAttachment(uploads[0]);
    expect(uploaded).toMatchObject({ type: 'audio/webm', duration: 120 });

    const createResponse = primaryPage.waitForResponse((response) => isCreatePost(response.request()));
    await composerOf(primaryPage).getByRole('button', { name: 'Send message' }).click();
    const response = await createResponse;
    expect(response.status()).toBe(201);
    const { message: created } = (await response.json()) as { message: ApiMessage };
    await expect(secondaryPage.getByTestId(`message-${created.id}`)).toHaveAttribute('data-attachment-count', '1', {
      timeout: RECV_TIMEOUT_MS,
    });
    const stored = (await serverMessages(secondaryPage, conversationId)).find((m) => m.id === created.id);
    expect(stored?.attachments?.[0]).toMatchObject({ type: 'audio/webm', duration: 120 });
  });

  test('discarding a recording or a recorded note sends nothing and releases the microphone', async ({
    primaryPage,
    messagingData,
  }) => {
    test.setTimeout(90_000);
    const conversationId = messagingData.directConversationId;
    await instrumentMicrophone(primaryPage);
    await openConversation(primaryPage, conversationId);
    await grantMicrophone(primaryPage);
    const uploads: Request[] = [];
    const creates: Request[] = [];
    primaryPage.on('request', (request) => {
      if (isUploadPost(request)) uploads.push(request);
      if (isCreatePost(request)) creates.push(request);
    });

    // Discard while recording (keyboard): nothing is uploaded.
    await startRecordingByKeyboard(primaryPage);
    await primaryPage.keyboard.press('Tab');
    const cancel = panelOf(primaryPage).getByRole('button', { name: 'Descartar gravação' });
    await expect(cancel).toBeFocused();
    await primaryPage.keyboard.press('Enter');
    await expect(panelOf(primaryPage)).toHaveCount(0);
    await expect(previewOf(primaryPage)).toHaveCount(0);
    expect((await microphoneUse(primaryPage)).liveTracks).toBe(0);

    // Discard the recorded note: its pending upload is cancelled on the server.
    await startRecordingByKeyboard(primaryPage);
    await primaryPage.waitForTimeout(1_200);
    await primaryPage.keyboard.press('Enter');
    const preview = previewOf(primaryPage);
    await expect(preview).toHaveAttribute('data-upload-status', 'uploaded');
    expect(uploads).toHaveLength(1);
    const attachment = await uploadedAttachment(uploads[0]);
    const cancelResponse = primaryPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/messages/upload/${attachment.id}` &&
        response.request().method() === 'DELETE',
    );
    const discard = preview.getByRole('button', { name: 'Descartar nota de voz' });
    await discard.focus();
    await primaryPage.keyboard.press('Enter');
    expect((await cancelResponse).status()).toBe(200);
    await expect(preview).toHaveCount(0);
    await expect(composerOf(primaryPage).getByTestId('message-send-button')).toBeDisabled();

    // Leaving the conversation mid-recording stops it and releases the microphone.
    await startRecordingByKeyboard(primaryPage);
    expect((await microphoneUse(primaryPage)).liveTracks).toBe(1);
    await backToConversationList(primaryPage, conversationId);
    await expect.poll(async () => (await microphoneUse(primaryPage)).liveTracks).toBe(0);
    await selectConversation(primaryPage, { id: conversationId });
    await expect(panelOf(primaryPage)).toHaveCount(0);
    await expect(previewOf(primaryPage)).toHaveCount(0);

    expect(uploads).toHaveLength(1);
    expect(creates).toHaveLength(0);
    expect((await microphoneUse(primaryPage)).calls).toBe(3);
  });

  test('denied microphone explains how to enable it while text and files still send; unsupported disables recording', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    await instrumentMicrophone(primaryPage);
    await instrumentMicrophone(secondaryPage);
    // B's browser has no MediaRecorder (unsupported recording).
    await secondaryPage.addInitScript(() => {
      Reflect.deleteProperty(window, 'MediaRecorder');
    });
    await openConversation(secondaryPage, conversationId);
    await openConversation(primaryPage, conversationId);
    // A's microphone permission is not granted: the browser refuses it.
    await primaryPage.context().clearPermissions();

    // AC-020: denied → reason and guidance; recording stays offered for a retry.
    await recordButtonOf(primaryPage).focus();
    await primaryPage.keyboard.press('Enter');
    const notice = noticeOf(primaryPage);
    await expect(notice).toHaveAttribute('role', 'alert');
    await expect(notice).toHaveAttribute('data-problem', 'denied');
    await expect(notice.getByTestId('voice-recording-notice-reason')).toHaveText('O acesso ao microfone foi negado.');
    await expect(notice.getByTestId('voice-recording-notice-guidance')).toContainText(
      'permita o microfone para este site nas configurações do navegador',
    );
    await expect(notice.getByTestId('voice-recording-notice-guidance')).toContainText(
      'Você ainda pode enviar texto e arquivos.',
    );
    await expect(panelOf(primaryPage)).toHaveCount(0);
    await expect(recordButtonOf(primaryPage)).toBeEnabled();
    expect(await microphoneUse(primaryPage)).toEqual({ calls: 1, streams: 0, liveTracks: 0 });
    await expectComposerFitsDrawer(primaryPage);

    // Text still sends and reaches B.
    const text = `Sem microfone ${Date.now()}`;
    const textarea = composerOf(primaryPage).locator('textarea');
    await textarea.fill(text);
    const createResponse = primaryPage.waitForResponse((response) => isCreatePost(response.request()));
    await textarea.press('Enter');
    const textResponse = await createResponse;
    expect(textResponse.status()).toBe(201);
    const { message: textMessage } = (await textResponse.json()) as { message: ApiMessage };
    await expect(secondaryPage.getByTestId(`message-${textMessage.id}`)).toContainText(text, {
      timeout: RECV_TIMEOUT_MS,
    });

    // Files still send too.
    const chooserPromise = primaryPage.waitForEvent('filechooser');
    await composerOf(primaryPage).getByRole('button', { name: 'Anexar arquivos' }).click();
    await (await chooserPromise).setFiles({ name: 'ainda-funciona.txt', mimeType: 'text/plain', buffer: Buffer.from('ok') });
    await expect(composerOf(primaryPage).getByTestId('pending-file')).toHaveAttribute('data-upload-status', 'uploaded');
    const fileCreate = primaryPage.waitForResponse((response) => isCreatePost(response.request()));
    await composerOf(primaryPage).getByRole('button', { name: 'Send message' }).click();
    const fileResponse = await fileCreate;
    expect(fileResponse.status()).toBe(201);
    const { message: fileMessage } = (await fileResponse.json()) as { message: ApiMessage };
    await expect(secondaryPage.getByTestId(`message-${fileMessage.id}`)).toHaveAttribute('data-attachment-count', '1', {
      timeout: RECV_TIMEOUT_MS,
    });

    // Unsupported (B): the record button is disabled with an explanation; the microphone is never asked.
    const unsupported = recordButtonOf(secondaryPage);
    await expect(unsupported).toHaveAttribute('aria-disabled', 'true');
    await expect(unsupported).toHaveAttribute('title', 'Este navegador não permite gravar notas de voz.');
    await unsupported.focus();
    await secondaryPage.keyboard.press('Enter');
    const unsupportedNotice = noticeOf(secondaryPage);
    await expect(unsupportedNotice).toHaveAttribute('data-problem', 'unsupported');
    await expect(unsupportedNotice.getByTestId('voice-recording-notice-guidance')).toContainText(
      'Use a versão atual do Chrome ou do Edge',
    );
    await expect(panelOf(secondaryPage)).toHaveCount(0);
    expect((await microphoneUse(secondaryPage)).calls).toBe(0);
    // ...and B's text still sends.
    const reply = `Sem gravação ${Date.now()}`;
    const bTextarea = composerOf(secondaryPage).locator('textarea');
    await bTextarea.fill(reply);
    const replyCreate = secondaryPage.waitForResponse((response) => isCreatePost(response.request()));
    await bTextarea.press('Enter');
    const replyResponse = await replyCreate;
    expect(replyResponse.status()).toBe(201);
    const { message: replyMessage } = (await replyResponse.json()) as { message: ApiMessage };
    await expect(primaryPage.getByTestId(`message-${replyMessage.id}`)).toContainText(reply, {
      timeout: RECV_TIMEOUT_MS,
    });
  });
});

/**
 * Phase 4 T17 — recording silences the spatial-audio room microphone
 * (FR-016, AC-019). The room mic is the floor plan's WebRTC microphone: a
 * real getUserMedia track whose `enabled` flag is the mute, shown by the
 * floor-plan control's accessible name. Both are asserted.
 */
const ROOM_MIC_NOTICE_TEXT = 'Microfone da sala silenciado durante a gravação; ele volta ao parar.';
const roomMicOf = (page: Page) =>
  page.getByRole('button', { name: /^(Enable|Mute|Unmute) microphone/ }).first();
const roomMicNoticeOf = (page: Page) => panelOf(page).getByTestId('voice-recording-room-mic-notice');

/** The audio track of the index-th microphone stream handed out (instrumentMicrophone). */
async function streamTrack(page: Page, index: number): Promise<{ enabled: boolean; live: boolean }> {
  return page.evaluate((streamIndex) => {
    const state = window as unknown as { __micStreams: MediaStream[] };
    const track = state.__micStreams[streamIndex]?.getAudioTracks()[0];
    if (!track) throw new Error(`no microphone stream at ${streamIndex}`);
    return { enabled: track.enabled, live: track.readyState === 'live' };
  }, index);
}

/** The room mic is joined and open (control and real track), or joined and muted. */
async function expectRoomMic(page: Page, roomStreamIndex: number, state: 'open' | 'muted'): Promise<void> {
  // "Mute microphone" (open; ", speaking" may follow) / "Unmute microphone" (muted).
  await expect(roomMicOf(page)).toHaveAccessibleName(state === 'open' ? /^Mute microphone/ : 'Unmute microphone');
  await expect
    .poll(() => streamTrack(page, roomStreamIndex))
    .toEqual({ enabled: state === 'open', live: true });
}

/** Records at least a second, stops with the button, and waits for the uploaded preview. */
async function stopRecordingWithNote(page: Page): Promise<void> {
  const timer = panelOf(page).getByRole('timer', { name: 'Tempo de gravação' });
  await expect.poll(async () => timerSeconds(await timer.textContent()), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  await panelOf(page).getByRole('button', { name: 'Parar gravação' }).click();
  await expect(panelOf(page)).toHaveCount(0);
  await expect(previewOf(page)).toHaveAttribute('data-upload-status', 'uploaded');
}

test.describe('Room microphone during voice recording', () => {
  test('an open room mic is muted while recording and reopened when it ends; a muted one stays muted; the user choice wins', async ({
    primaryPage: page,
    messagingData,
  }) => {
    test.setTimeout(180_000);
    const conversationId = messagingData.directConversationId;
    await instrumentMicrophone(page);
    await page.goto('/floor-plan');
    await grantMicrophone(page);
    await waitForRealtimeReady(page);
    // Auto-placed in a room: room audio is offered but not joined.
    await expect(roomMicOf(page)).toHaveAccessibleName('Enable microphone', { timeout: 30_000 });
    await openDrawer(page);
    await selectConversation(page, { id: conversationId });
    await waitForRealtimeReady(page);

    // Without room audio, recording is unaffected: no notice, room audio untouched.
    await startRecordingByKeyboard(page);
    await expect(roomMicNoticeOf(page)).toHaveCount(0);
    await expect(roomMicOf(page)).toHaveAccessibleName('Enable microphone');
    await panelOf(page).getByRole('button', { name: 'Descartar gravação' }).click();
    await expect(panelOf(page)).toHaveCount(0);
    await expect(roomMicOf(page)).toHaveAccessibleName('Enable microphone');

    // Join room audio: the room mic opens on its own microphone track.
    await roomMicOf(page).click();
    await expect.poll(async () => (await microphoneUse(page)).streams).toBe(2);
    const roomStream = 1;
    await expectRoomMic(page, roomStream, 'open');

    // Start → muted with the notice; stop → reopened; sending keeps it open.
    await startRecordingByKeyboard(page);
    await expect(roomMicNoticeOf(page)).toHaveText(ROOM_MIC_NOTICE_TEXT);
    await expectRoomMic(page, roomStream, 'muted');
    await expectComposerFitsDrawer(page);
    await stopRecordingWithNote(page);
    await expectRoomMic(page, roomStream, 'open');
    const createResponse = page.waitForResponse((response) => isCreatePost(response.request()));
    await composerOf(page).locator('textarea').press('Enter');
    expect((await createResponse).status()).toBe(201);
    await expect(previewOf(page)).toHaveCount(0);
    await expectRoomMic(page, roomStream, 'open');

    // Start → muted; discard → reopened.
    await startRecordingByKeyboard(page);
    await expect(roomMicNoticeOf(page)).toBeVisible();
    await expectRoomMic(page, roomStream, 'muted');
    await panelOf(page).getByRole('button', { name: 'Descartar gravação' }).click();
    await expect(panelOf(page)).toHaveCount(0);
    await expectRoomMic(page, roomStream, 'open');

    // The user's own changes during a recording win: unmuting drops the
    // notice, and muting again is kept when the recording stops.
    await startRecordingByKeyboard(page);
    await expectRoomMic(page, roomStream, 'muted');
    await roomMicOf(page).click();
    await expectRoomMic(page, roomStream, 'open');
    await expect(roomMicNoticeOf(page)).toHaveCount(0);
    await roomMicOf(page).click();
    await expectRoomMic(page, roomStream, 'muted');
    await stopRecordingWithNote(page);
    await expectRoomMic(page, roomStream, 'muted');
    await previewOf(page).getByRole('button', { name: 'Descartar nota de voz' }).click();
    await expect(previewOf(page)).toHaveCount(0);

    // A room mic already muted stays muted through a recording.
    await startRecordingByKeyboard(page);
    await expect(roomMicNoticeOf(page)).toHaveCount(0);
    await expectRoomMic(page, roomStream, 'muted');
    await stopRecordingWithNote(page);
    await expectRoomMic(page, roomStream, 'muted');
    await previewOf(page).getByRole('button', { name: 'Descartar nota de voz' }).click();
    await expect(previewOf(page)).toHaveCount(0);

    // Leaving the conversation mid-recording reopens it.
    await roomMicOf(page).click();
    await expectRoomMic(page, roomStream, 'open');
    await startRecordingByKeyboard(page);
    await expectRoomMic(page, roomStream, 'muted');
    await backToConversationList(page, conversationId);
    await expectRoomMic(page, roomStream, 'open');

    // Closing the drawer mid-recording reopens it.
    await selectConversation(page, { id: conversationId });
    await startRecordingByKeyboard(page);
    await expectRoomMic(page, roomStream, 'muted');
    await page.getByTestId('messaging-drawer-close').click();
    await expect(page.getByTestId('messaging-drawer')).toHaveCount(0);
    await expectRoomMic(page, roomStream, 'open');

    // Every recording released its microphone; only the room mic is still live.
    const use = await microphoneUse(page);
    expect(use.calls).toBe(8);
    expect(use.liveTracks).toBe(1);
  });
});
