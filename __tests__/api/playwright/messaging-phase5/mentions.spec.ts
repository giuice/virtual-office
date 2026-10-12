import { randomUUID } from 'node:crypto';

import type { Page, Request, Route } from '@playwright/test';

import { test, expect } from '../fixtures/messaging-phase5-faults';
import { openDrawer, waitForRealtimeReady, watchMessagingChangesStream } from '../helpers/drawer-helpers';
import { withLocalMessagingDb } from '../helpers/messaging-local-db';
import {
  STEP_TIMEOUT_MS,
  composer,
  composerInput,
  createViaApi,
  openConversation,
  storedWithTexts,
} from '../helpers/messaging-outbox-e2e';

/**
 * Phase 5 T17 — @mention composition and rendering (FR-023, FR-024, FR-026,
 * BR-010; AC-023, the UI clauses of AC-024, AC-027, the mention list of
 * AC-037 and the mention clause of AC-048).
 *
 * Real accounts A–E, the real app, local Supabase and its Realtime. The list
 * is the members route roster: in the room conversation D is made a
 * workspace user who never joined its chat (no member row, no participant
 * entry, no revocation — written directly in the local database) and E is
 * removed by an administrator (revocation, T28). Stored mentions are read
 * from public.message_mentions. Several users are separate devices
 * (openDevice: own context and Supabase session).
 *
 * Block C fixes: F2 holds A's first feed read after the server answered (and
 * A's mark-read, whose receipts would refetch the feed on their own); F6
 * removes and re-adds C through the membership fixture while A stays in the
 * room; F7 drives an IME composition through the DevTools protocol
 * (Input.imeSetComposition / insertText and the composing Enter, keyCode 229).
 */

const LIVE_WITHIN_MS = 10_000;
const POLL_AFTER_UNHEALTHY_MS = 30_000;
/** Block B fix F6: a polling round's requests are abandoned this long after it starts. */
const POLL_ROUND_DEADLINE_MS = 10_000;
const MENTIONED_YOU = 'Você foi mencionado';

const listbox = (page: Page) => page.getByRole('listbox', { name: 'Mencionar membro da conversa' });
const options = (page: Page) => listbox(page).getByRole('option');
const bubble = (page: Page, messageId: string) => page.getByTestId(`message-${messageId}`);
const mentionSpans = (page: Page, messageId: string) => bubble(page, messageId).getByTestId('message-mention');
const mentionedYouCue = (page: Page, messageId: string) => page.getByTestId(`message-mentions-you-${messageId}`);

interface CreateRequest {
  body: Record<string, unknown>;
  status?: number;
}

/** Every POST /api/messages/create the page sends, with its body and (once answered) status. */
function trackCreates(page: Page): CreateRequest[] {
  const creates: CreateRequest[] = [];
  const byRequest = new Map<Request, CreateRequest>();
  page.on('request', (request) => {
    if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/messages/create') return;
    const entry: CreateRequest = { body: (request.postDataJSON() ?? {}) as Record<string, unknown> };
    creates.push(entry);
    byRequest.set(request, entry);
  });
  page.on('response', (response) => {
    const entry = byRequest.get(response.request());
    if (entry) entry.status = response.status();
  });
  return creates;
}

/** Stored mentions of a message (users.id), sorted. */
async function storedMentions(messageId: string): Promise<string[]> {
  return withLocalMessagingDb(async (db) => {
    const result = await db.query<{ user_id: string }>(
      'select mentioned_user_id::text as user_id from public.message_mentions where message_id = $1 order by 1',
      [messageId],
    );
    return result.rows.map((row) => row.user_id);
  });
}

/**
 * Makes `userId` a workspace user who never joined the conversation's chat:
 * no member row, not a participant, no revocation (deleting the row records
 * one, T28; it is removed in the same transaction).
 */
async function makeNeverJoined(conversationId: string, userId: string): Promise<void> {
  await withLocalMessagingDb(async (db) => {
    await db.query('begin');
    try {
      await db.query('delete from public.conversation_members where conversation_id = $1 and user_id = $2', [conversationId, userId]);
      await db.query(
        'delete from private.conversation_member_revocations where conversation_id = $1 and user_id = $2',
        [conversationId, userId],
      );
      await db.query(
        `update public.conversations
            set participants = array(select p from unnest(participants) as p where p::text <> $2::text)
          where id = $1`,
        [conversationId, userId],
      );
      await db.query('commit');
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
    const { rows } = await db.query<{ member: boolean; participant: boolean; revoked: boolean }>(
      `select exists(select 1 from public.conversation_members where conversation_id = $1 and user_id = $2) as member,
              exists(select 1 from public.conversations where id = $1 and $2::text = any(participants::text[])) as participant,
              exists(select 1 from private.conversation_member_revocations where conversation_id = $1 and user_id = $2) as revoked`,
      [conversationId, userId],
    );
    expect(rows[0], 'never-joined state').toEqual({ member: false, participant: false, revoked: false });
  });
}

/** The single stored message of `text` in the conversation. */
async function storedOnce(conversationId: string, text: string): Promise<{ id: string; key: string | null }> {
  await expect.poll(async () => (await storedWithTexts(conversationId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
  const [row] = await storedWithTexts(conversationId, [text]);
  return { id: row.id, key: row.key };
}

/** Records requests that only a degraded tab makes (T14 marks polls `source=poll`). */
function recordPolls(page: Page): string[] {
  const polls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).searchParams.get('source') === 'poll') polls.push(new URL(request.url()).pathname);
  });
  return polls;
}

test.describe('Phase 5 T17 — @mention composition and rendering', () => {
  test.beforeEach(async ({ budgets }) => {
    await budgets.reset();
  });

  test('AC-023/AC-037: in a room the "@" list holds only current room-chat members but the viewer (not a never-joined or removed user), filters as A types and works with arrows, Enter, Tab, Escape and the mouse; chosen mentions are highlighted and stored, a typed "@name" stays plain', async ({
    phase5World,
    openDevice,
    membership,
  }) => {
    const { roomId } = phase5World.conversations;
    const { B, C, D } = phase5World.users;
    await makeNeverJoined(roomId, D.userId);
    expect(await membership.remove(roomId, 'E')).toBe(1);
    const a = await openDevice('A');
    const creates = trackCreates(a.page);
    await openConversation(a.page, roomId);
    const input = composerInput(a.page);
    await input.click();

    // ---- "@" opens the list: B and C only (D never joined, E removed, A is the viewer).
    await a.page.keyboard.type('@');
    await expect(listbox(a.page)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect(options(a.page)).toHaveText([B.displayName, C.displayName]);
    const listId = await listbox(a.page).getAttribute('id');
    expect(listId).toBeTruthy();
    await expect(input).toHaveAttribute('aria-controls', listId as string);
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    const firstOptionId = await options(a.page).nth(0).getAttribute('id');
    const secondOptionId = await options(a.page).nth(1).getAttribute('id');
    await expect(input).toHaveAttribute('aria-activedescendant', firstOptionId as string);
    await expect(options(a.page).nth(0)).toHaveAttribute('aria-selected', 'true');

    // Escape closes it and keeps the text; the "@" stays closed while A types after it.
    await a.page.keyboard.press('Escape');
    await expect(listbox(a.page)).toBeHidden();
    await expect(input).toHaveValue('@');
    await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/);
    await a.page.keyboard.press('Backspace');

    // Filtering while typing; no match closes it; a match reopens it.
    const cWord = C.displayName.split(' ').at(-1) as string;
    await a.page.keyboard.type(`@${cWord.slice(0, 3)}`);
    await expect(options(a.page)).toHaveText([C.displayName]);
    await a.page.keyboard.type('zz');
    await expect(listbox(a.page)).toBeHidden();
    await a.page.keyboard.press('Backspace');
    await a.page.keyboard.press('Backspace');
    await expect(options(a.page)).toHaveText([C.displayName]);
    // Tab chooses.
    await a.page.keyboard.press('Tab');
    await expect(listbox(a.page)).toBeHidden();
    await expect(input).toHaveValue(`@${C.displayName} `);
    await expect(input).toBeFocused();

    // Arrows move the active option (aria-selected + aria-activedescendant); Enter chooses.
    await a.page.keyboard.type('e @');
    await expect(options(a.page)).toHaveText([B.displayName, C.displayName]);
    await a.page.keyboard.press('ArrowDown');
    await expect(options(a.page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options(a.page).nth(0)).toHaveAttribute('aria-selected', 'false');
    await expect(input).toHaveAttribute('aria-activedescendant', secondOptionId as string);
    await a.page.keyboard.press('ArrowUp');
    await expect(options(a.page).nth(0)).toHaveAttribute('aria-selected', 'true');
    await a.page.keyboard.press('Enter');
    await expect(input).toHaveValue(`@${C.displayName} e @${B.displayName} `);

    // The mouse chooses too (focus stays in the field).
    await a.page.keyboard.type('e @');
    await options(a.page).filter({ hasText: B.displayName }).click();
    await expect(listbox(a.page)).toBeHidden();
    await expect(input).toBeFocused();
    const text = `@${C.displayName} e @${B.displayName} e @${B.displayName} t17 room ${randomUUID()}`;
    await a.page.keyboard.type(text.slice(`@${C.displayName} e @${B.displayName} e @${B.displayName} `.length));
    await expect(input).toHaveValue(text);

    // Chosen mentions are highlighted in the field.
    const highlighted = composer(a.page).getByTestId('composer-mention');
    await expect(highlighted).toHaveText([`@${C.displayName}`, `@${B.displayName}`, `@${B.displayName}`]);
    await expect(highlighted.nth(0)).toHaveAttribute('data-user-id', C.userId);
    await expect(highlighted.nth(1)).toHaveAttribute('data-user-id', B.userId);

    // ---- Sent through the outbox with the chosen ids; stored as mentions.
    await a.page.keyboard.press('Enter');
    await expect(input).toHaveValue('', { timeout: STEP_TIMEOUT_MS });
    const sent = await storedOnce(roomId, text);
    await expect.poll(() => creates.filter((create) => create.status !== undefined).length, { timeout: STEP_TIMEOUT_MS }).toBeGreaterThan(0);
    const textCreate = creates.find((create) => create.body.content === text);
    expect(textCreate?.body, 'queued text send (outbox attempt) with the chosen mentions').toMatchObject({
      clientMessageId: sent.key,
      attemptGeneration: 1,
      mentionIds: [B.userId, C.userId].sort(),
    });
    expect(await storedMentions(sent.id)).toEqual([B.userId, C.userId].sort());
    await expect(mentionSpans(a.page, sent.id)).toHaveText(
      [`@${C.displayName}`, `@${B.displayName}`, `@${B.displayName}`],
      { timeout: STEP_TIMEOUT_MS },
    );
    await expect(mentionedYouCue(a.page, sent.id), 'the sender is not mentioned').toHaveCount(0);
    await expect(composer(a.page).getByTestId('composer-mention')).toHaveCount(0);

    // ---- "@name" typed without choosing it is plain text: no id sent, none stored, not styled.
    const plain = `plain @${B.displayName}, sem escolher ${randomUUID()}`;
    await input.click();
    await a.page.keyboard.type(plain);
    await expect(listbox(a.page)).toBeHidden();
    await expect(composer(a.page).getByTestId('composer-mention')).toHaveCount(0);
    await a.page.keyboard.press('Enter');
    const plainSent = await storedOnce(roomId, plain);
    await expect(bubble(a.page, plainSent.id)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    const plainCreate = creates.find((create) => create.body.content === plain);
    expect(plainCreate?.body.clientMessageId).toBe(plainSent.key);
    expect(plainCreate?.body, 'no mention ids for unchosen text').not.toHaveProperty('mentionIds');
    expect(await storedMentions(plainSent.id)).toEqual([]);
    await expect(mentionSpans(a.page, plainSent.id)).toHaveCount(0);
  });

  test('AC-027: B and C see A\'s mentions styled; only the mentioned viewer sees the whole message highlighted with a text cue — live, no polling; an attachment message carries its mention through the Phase 4 retry with the same ids', async ({
    phase5World,
    openDevice,
  }) => {
    const { groupId } = phase5World.conversations;
    const { B, C } = phase5World.users;
    const b = await openDevice('B');
    const c = await openDevice('C');
    const a = await openDevice('A');
    const bPolls = recordPolls(b.page);
    const cPolls = recordPolls(c.page);
    await openConversation(b.page, groupId);
    await openConversation(c.page, groupId);
    await openConversation(a.page, groupId);
    const creates = trackCreates(a.page);
    const input = composerInput(a.page);

    // ---- Text: A mentions B.
    const bWord = B.displayName.split(' ').at(-1) as string;
    const text = `Oi @${B.displayName} t17 group ${randomUUID()}`;
    await input.click();
    await a.page.keyboard.type(`Oi @${bWord.slice(0, 3)}`);
    await expect(options(a.page)).toHaveText([B.displayName]);
    await a.page.keyboard.press('Enter');
    await a.page.keyboard.type(text.slice(`Oi @${B.displayName} `.length));
    await a.page.keyboard.press('Enter');
    const sent = await storedOnce(groupId, text);
    expect(await storedMentions(sent.id)).toEqual([B.userId]);
    expect(creates.find((create) => create.body.content === text)?.body).toMatchObject({ mentionIds: [B.userId] });

    // B: the mention styled and the whole message highlighted with the cue.
    await expect(mentionSpans(b.page, sent.id)).toHaveText([`@${B.displayName}`], { timeout: LIVE_WITHIN_MS });
    await expect(mentionedYouCue(b.page, sent.id)).toHaveText(MENTIONED_YOU, { timeout: LIVE_WITHIN_MS });
    await expect(bubble(b.page, sent.id)).toHaveAttribute('data-mentions-viewer', 'true');
    // C and A: the mention styled, no highlight.
    for (const page of [c.page, a.page]) {
      await expect(mentionSpans(page, sent.id)).toHaveText([`@${B.displayName}`], { timeout: LIVE_WITHIN_MS });
      await expect(mentionedYouCue(page, sent.id)).toHaveCount(0);
      await expect(bubble(page, sent.id)).not.toHaveAttribute('data-mentions-viewer', /.*/);
    }

    // ---- Attachment: A mentions C on a file message; the first create is stored
    // but its response is lost; "Tentar de novo" resends the same key and ids.
    const cWord = C.displayName.split(' ').at(-1) as string;
    const fileText = `Arquivo para @${C.displayName} t17 file ${randomUUID()}`;
    await input.click();
    await a.page.keyboard.type(`Arquivo para @${cWord.slice(0, 3)}`);
    await expect(options(a.page)).toHaveText([C.displayName]);
    await a.page.keyboard.press('Tab');
    await a.page.keyboard.type(fileText.slice(`Arquivo para @${C.displayName} `.length));
    const file = { name: `t17-${randomUUID()}.txt`, mimeType: 'text/plain', buffer: Buffer.from('t17 mention attachment') };
    await composer(a.page).getByTestId('composer-file-input').setInputFiles(file);
    await expect(composer(a.page).getByTestId('pending-file')).toHaveAttribute('data-upload-status', 'uploaded', {
      timeout: STEP_TIMEOUT_MS,
    });
    let dropped = 0;
    await a.page.route('**/api/messages/create', async (route: Route) => {
      if (dropped > 0) {
        await route.continue();
        return;
      }
      dropped += 1;
      // Reaches the server (stored), then the response is lost.
      await route.fetch();
      await route.abort('failed');
    });
    await composer(a.page).getByTestId('message-send-button').click();
    const sendError = composer(a.page).getByTestId('composer-send-error');
    await expect(sendError).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    const fileSent = await storedOnce(groupId, fileText);
    await sendError.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(input).toHaveValue('', { timeout: STEP_TIMEOUT_MS });
    const fileCreates = creates.filter((create) => create.body.content === fileText);
    expect(fileCreates).toHaveLength(2);
    expect(fileCreates[0].body).toMatchObject({ clientMessageId: fileSent.key, mentionIds: [C.userId] });
    expect(fileCreates[1].body).toMatchObject({ clientMessageId: fileSent.key, mentionIds: [C.userId] });
    expect(fileCreates[1].body.attachmentIds).toEqual(fileCreates[0].body.attachmentIds);
    await expect.poll(() => fileCreates[1].status, { timeout: STEP_TIMEOUT_MS }).toBe(200);
    expect(await storedOnce(groupId, fileText)).toEqual(fileSent);
    expect(await storedMentions(fileSent.id)).toEqual([C.userId]);

    await expect(mentionedYouCue(c.page, fileSent.id)).toHaveText(MENTIONED_YOU, { timeout: LIVE_WITHIN_MS });
    await expect(bubble(c.page, fileSent.id)).toHaveAttribute('data-attachment-count', '1');
    await expect(mentionSpans(c.page, fileSent.id)).toHaveText([`@${C.displayName}`]);
    for (const page of [b.page, a.page]) {
      await expect(mentionSpans(page, fileSent.id)).toHaveText([`@${C.displayName}`], { timeout: LIVE_WITHIN_MS });
      await expect(mentionedYouCue(page, fileSent.id)).toHaveCount(0);
    }
    await expect(a.page.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(0);

    // Live, without polling (all streams healthy).
    expect(bPolls, 'B: no polling while healthy').toEqual([]);
    expect(cPolls, 'C: no polling while healthy').toEqual([]);
  });

  test('AC-048 (mention clause): a stale poll released after a mention arrived live keeps the mention, its highlight and one bubble', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const { groupId } = phase5World.conversations;
    const { A } = phase5World.users;
    const b = await openDevice('B');
    const a = await openDevice('A');
    const harness = await realtimeFaults.attach(a);
    await openConversation(a.page, groupId);
    await harness.waitForReady('messages');
    await harness.waitForReady('list');

    // The first feed poll reads the server at once and is held in transit.
    let feedPolls = 0;
    let heldBody: { messages: Array<{ id: string }> } | null = null;
    let heldAt = 0;
    let release: () => void = () => undefined;
    const releaseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let heldFinished = false;
    await a.page.route(
      (url) => url.pathname === '/api/messages/get' && url.searchParams.get('source') === 'poll',
      async (route: Route) => {
        feedPolls += 1;
        if (feedPolls !== 1) {
          await route.continue();
          return;
        }
        heldAt = Date.now();
        const response = await route.fetch();
        const body = await response.text();
        heldBody = JSON.parse(body);
        await releaseGate;
        await route.fulfill({ response, body });
        heldFinished = true;
      },
    );

    // ---- Only the list stream goes dark; the messages stream stays live.
    const fault = await harness.fail('list', 'close');
    await harness.waitForStatus('list', 'CLOSED', { since: fault.mark, timeout: 10_000 });
    await expect.poll(() => heldBody !== null, { timeout: POLL_AFTER_UNHEALTHY_MS + 10_000 }).toBe(true);
    expect(harness.status('messages'), 'the messages stream stays up').toBe('SUBSCRIBED');

    // ---- B mentions A after the held poll read the server; it arrives live.
    const text = `@${A.displayName} t17 stale poll ${randomUUID()}`;
    const messageId = await createViaApi(b.page, {
      conversationId: groupId,
      content: text,
      clientMessageId: randomUUID(),
      mentionIds: [A.userId],
    });
    await expect(mentionedYouCue(a.page, messageId)).toHaveText(MENTIONED_YOU, { timeout: LIVE_WITHIN_MS });
    await expect(mentionSpans(a.page, messageId)).toHaveText([`@${A.displayName}`]);
    const stale = heldBody as unknown as { messages: Array<{ id: string }> };
    expect(stale.messages.some((message) => message.id === messageId), 'the held poll predates the mention').toBe(false);

    // ---- Released: the mention, its highlight and one bubble stay (watched continuously).
    await a.page.evaluate((id) => {
      const violations: Array<{ at: number; bubbles: number; cues: number; mentions: number }> = [];
      const check = () => {
        const bubbles = document.querySelectorAll(`[data-testid="message-${id}"]`).length;
        const cues = document.querySelectorAll(`[data-testid="message-mentions-you-${id}"]`).length;
        const mentions = document.querySelectorAll(`[data-testid="message-${id}"] [data-testid="message-mention"]`).length;
        if (bubbles !== 1 || cues !== 1 || mentions !== 1) violations.push({ at: Date.now(), bubbles, cues, mentions });
      };
      (window as unknown as { __t17Violations?: typeof violations }).__t17Violations = violations;
      check();
      new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    }, messageId);
    const heldToReleaseMs = Date.now() - heldAt;
    expect(heldToReleaseMs, 'released before the round deadline').toBeLessThan(POLL_ROUND_DEADLINE_MS - 500);
    release();
    await expect.poll(() => heldFinished, { timeout: STEP_TIMEOUT_MS }).toBe(true);
    await a.page.waitForTimeout(2_000);
    expect(
      await a.page.evaluate(() => (window as unknown as { __t17Violations: unknown[] }).__t17Violations),
      'mention, highlight and single bubble kept',
    ).toEqual([]);
    await expect(mentionedYouCue(a.page, messageId)).toHaveText(MENTIONED_YOU);
    expect(await storedMentions(messageId)).toEqual([A.userId]);
    testInfo.annotations.push({ type: 't17-stale-poll', description: JSON.stringify({ heldToReleaseMs, feedPolls }) });
  });

  test('block C fix F2: a mention that arrives live while the conversation\'s first feed read is in flight shows once, with its cue, after that read settles — no focus change, reconnect or polling', async ({
    phase5World,
    openDevice,
  }) => {
    const { groupId } = phase5World.conversations;
    const { A } = phase5World.users;
    const b = await openDevice('B');
    const a = await openDevice('A');
    const aPolls = recordPolls(a.page);

    // A's first feed read of the group reads the server at once; its answer is held.
    let feedReads = 0;
    let heldBody: { messages: Array<{ id: string }> } | null = null;
    let release: () => void = () => undefined;
    const releaseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let heldFinished = false;
    await a.page.route(
      (url) => url.pathname === '/api/messages/get' && url.searchParams.get('conversationId') === groupId && !url.searchParams.has('source'),
      async (route: Route) => {
        feedReads += 1;
        if (feedReads !== 1) {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        const body = await response.text();
        heldBody = JSON.parse(body);
        await releaseGate;
        await route.fulfill({ response, body }).catch(() => undefined);
        heldFinished = true;
      },
    );
    // Opening marks the conversation read; those receipts would refetch the
    // feed by themselves, so the mark-read is held until the end.
    let releaseRead: () => void = () => undefined;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    await a.page.route('**/api/conversations/read', async (route: Route) => {
      await readGate;
      await route.continue().catch(() => undefined);
    });
    // The Realtime frames A's tab receives (its sockets from the next load on).
    const frames: string[] = [];
    a.page.on('websocket', (socket) => {
      socket.on('framereceived', ({ payload }) => {
        if (typeof payload === 'string') frames.push(payload);
      });
    });
    const framesWith = (text: string) => frames.filter((frame) => frame.includes(text)).length;
    const streamConfirmed = watchMessagingChangesStream(a.page);

    try {
      await a.page.goto('/floor-plan');
      await waitForRealtimeReady(a.page);
      await streamConfirmed();
      await openDrawer(a.page);
      await a.page.getByTestId(`conversation-item-${groupId}`).click();
      await expect.poll(() => heldBody !== null, { timeout: STEP_TIMEOUT_MS, message: 'the first feed read reached the server' }).toBe(true);

      // ---- B mentions A while that read is held; A's tab receives the INSERT.
      const text = `@${A.displayName} t17 first read ${randomUUID()}`;
      const messageId = await createViaApi(b.page, {
        conversationId: groupId,
        content: text,
        clientMessageId: randomUUID(),
        mentionIds: [A.userId],
      });
      await expect.poll(() => framesWith(text), { timeout: LIVE_WITHIN_MS, message: "A's tab received the INSERT" }).toBeGreaterThan(0);
      await a.page.waitForTimeout(500);
      const held = heldBody as unknown as { messages: Array<{ id: string }> };
      expect(held.messages.some((message) => message.id === messageId), 'the held read predates the mention').toBe(false);
      expect(heldFinished).toBe(false);

      // ---- Released: the message and its mention cue appear, once.
      release();
      await expect.poll(() => heldFinished, { timeout: STEP_TIMEOUT_MS }).toBe(true);
      await expect(mentionedYouCue(a.page, messageId)).toHaveText(MENTIONED_YOU, { timeout: LIVE_WITHIN_MS });
      await expect(bubble(a.page, messageId)).toHaveCount(1);
      await expect(mentionSpans(a.page, messageId)).toHaveText([`@${A.displayName}`]);
      expect(await storedMentions(messageId)).toEqual([A.userId]);
      expect(aPolls, 'A: no polling (streams healthy)').toEqual([]);
    } finally {
      release();
      releaseRead();
    }
  });

  test('block C fix F6: while A keeps the conversation open, the next "@" list drops a member who was removed and offers them again once re-added', async ({
    phase5World,
    openDevice,
    membership,
  }) => {
    const { roomId } = phase5World.conversations;
    const { C } = phase5World.users;
    const a = await openDevice('A');
    await openConversation(a.page, roomId);
    const input = composerInput(a.page);
    await input.click();
    const openList = async () => {
      await a.page.keyboard.type('@');
      await expect(listbox(a.page)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    };
    const closeList = async () => {
      await a.page.keyboard.press('Escape');
      await a.page.keyboard.press('Backspace');
      await expect(input).toHaveValue('');
    };

    // ---- The roster is loaded: C is offered.
    await openList();
    await expect(options(a.page).filter({ hasText: C.displayName })).toHaveCount(1);
    const everyone = await options(a.page).evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()),
    );
    await closeList();

    // ---- C is removed (A stays in the room): the next list no longer offers C.
    expect(await membership.remove(roomId, 'C')).toBe(1);
    await openList();
    await expect(options(a.page)).toHaveText(everyone.filter((name) => name !== C.displayName), { timeout: STEP_TIMEOUT_MS });
    await closeList();

    // ---- C is re-added: the next list offers C again.
    await membership.restore(roomId, 'C');
    await openList();
    await expect(options(a.page)).toHaveText(everyone, { timeout: STEP_TIMEOUT_MS });
    await closeList();
  });

  test('block C fix F7: Enter that confirms an IME composition neither chooses a mention nor sends; a plain Enter afterwards sends', async ({
    phase5World,
    openDevice,
  }) => {
    const { roomId } = phase5World.conversations;
    const { C } = phase5World.users;
    const a = await openDevice('A');
    const creates = trackCreates(a.page);
    await openConversation(a.page, roomId);
    const input = composerInput(a.page);
    await input.click();
    // The browser's IME, through the DevTools protocol: a composition in the
    // field, and the Enter keydown an IME sends while composing (keyCode 229).
    const cdp = await a.page.context().newCDPSession(a.page);
    const compose = (text: string) =>
      cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    const commit = (text: string) => cdp.send('Input.insertText', { text });
    const composingEnter = async () => {
      for (const type of ['rawKeyDown', 'keyUp'] as const) {
        await cdp.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
      }
    };

    // ---- An "@" query composed by the IME: its confirming Enter chooses nothing.
    const cPrefix = (C.displayName.split(' ').at(-1) as string).slice(0, 3);
    await a.page.keyboard.type('@');
    await expect(listbox(a.page)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await compose(cPrefix);
    await expect(input).toHaveValue(`@${cPrefix}`);
    await expect(options(a.page).filter({ hasText: C.displayName })).toHaveCount(1);
    await composingEnter();
    await commit(cPrefix);
    await expect(input).toHaveValue(`@${cPrefix}`);
    await expect(composer(a.page).getByTestId('composer-mention')).toHaveCount(0);
    await a.page.keyboard.press('Escape');
    await input.fill('');

    // ---- List closed: the composition's Enter does not send the unfinished draft.
    const text = `t17 ime ${randomUUID()} `;
    await a.page.keyboard.type(text);
    await compose('ka');
    await composingEnter();
    await commit('ka');
    await expect(input).toHaveValue(`${text}ka`);
    await a.page.waitForTimeout(1_000);
    expect(creates, 'nothing sent while composing').toEqual([]);

    // ---- A plain Enter sends it once.
    await a.page.keyboard.press('Enter');
    await expect(input).toHaveValue('', { timeout: STEP_TIMEOUT_MS });
    expect((await storedOnce(roomId, `${text}ka`.trim())).id).toBeTruthy();
  });
});
