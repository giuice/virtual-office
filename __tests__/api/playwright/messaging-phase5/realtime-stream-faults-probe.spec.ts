import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures/messaging-phase5-faults';
import { openDrawer, selectConversation, waitForRealtimeReady } from '../helpers/drawer-helpers';
import {
  FAULT_STATUS,
  MESSAGING_REALTIME_STREAMS,
  type MessagingRealtimeStream,
  type RealtimeFaultKind,
} from '../helpers/realtime-stream-faults';

/**
 * Phase 5 T25 — per-stream Realtime fault harness probe (BR-015, AC-015,
 * AC-036). For every stream (messages/receipts/reactions, conversation list,
 * typing) × failure class (error, timed out, closed) A's target channel must
 * report the class's status through the app's own subscribe callback while,
 * on the same socket, the two other streams and Presence stay joined (no
 * status change, no join/leave/close/error frame) and keep delivering real
 * events B produces after the fault:
 *   list      B's message in the group (not open in A) → conversations UPDATE
 *             on the list topic → A's list query refetches (GET
 *             /api/conversations/get);
 *   typing    B types in the open DM → A shows "… está digitando…";
 *   messages  B's message in the open DM → messages INSERT on the messages
 *             topic → A's feed shows it.
 * The faulted stream must deliver nothing to the page (and its UI effect must
 * not happen). Presence must also receive a real event after the fault (B
 * opens a second tab: its Presence join reaches A). Afterwards restore() lets
 * every stream rejoin, a terminal closure included (application-level rejoin:
 * messages and list from T13, typing from T15).
 */

const KINDS: readonly RealtimeFaultKind[] = ['error', 'timeout', 'close'];
const DELIVERY_TIMEOUT_MS = 15_000;
/** How long an absent effect is watched (> typing TTL 4 s; > Realtime latency). */
const ABSENCE_WINDOW_MS = 6_000;
/** Recovery after restore: pending join timeout (10 s) + rejoin step (≤ 10 s). */
const RECOVERY_TIMEOUT_MS = 45_000;
const LIFECYCLE_EVENTS = ['phx_join', 'phx_leave', 'phx_close', 'phx_error'] as const;

async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.goto('/floor-plan');
  await page.waitForLoadState('networkidle');
  await openDrawer(page);
  await waitForRealtimeReady(page);
  await selectConversation(page, { id: conversationId });
}

function composerInput(page: Page) {
  return page
    .locator('[data-testid="composer"]')
    .or(page.locator('[data-testid="message-composer"]'))
    .locator('textarea, input[type="text"]')
    .first();
}

async function createAs(page: Page, conversationId: string, content: string): Promise<string> {
  const response = await page.request.post('/api/messages/create', { data: { conversationId, content } });
  const body = (await response.json().catch(() => null)) as { message?: { id?: string } } | null;
  expect(response.status(), JSON.stringify(body)).toBe(201);
  expect(body?.message?.id).toBeTruthy();
  return body?.message?.id as string;
}

/** Records A's conversation-list fetches (the list stream's invalidation effect). */
function recordListFetches(page: Page): () => number[] {
  const fetchedAt: number[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/conversations/get') {
      fetchedAt.push(Date.now());
    }
  });
  return () => [...fetchedAt];
}

/** Samples the absence of a locator for a window (it must never be visible). */
async function expectNeverVisible(page: Page, selector: ReturnType<Page['getByText']>, windowMs: number, what: string) {
  const until = Date.now() + windowMs;
  while (Date.now() < until) {
    expect(await selector.isVisible(), what).toBe(false);
    await page.waitForTimeout(200);
  }
}

interface DeliveryEvidence {
  delivered: boolean;
  passedFrames: number;
  droppedFrames: number;
  uiEffect: boolean;
}

test.describe('Phase 5 T25 — per-stream Realtime fault harness probe', () => {
  for (const target of MESSAGING_REALTIME_STREAMS) {
    for (const kind of KINDS) {
      const expected = FAULT_STATUS[kind];
      test(`${target} stream ${kind} → ${expected}; other streams and Presence keep delivering`, async ({
        phase5World,
        openDevice,
        realtimeFaults,
      }, testInfo) => {
        const { directId, groupId } = phase5World.conversations;
        const b = await openDevice('B');
        const bRealtime = await realtimeFaults.attach(b, { reload: false });
        const a = await openDevice('A');
        const aRealtime = await realtimeFaults.attach(a, { reload: false });
        const listFetches = recordListFetches(a.page);

        await openConversation(b.page, directId);
        await openConversation(a.page, directId);
        for (const stream of [...MESSAGING_REALTIME_STREAMS, 'presence'] as const) {
          await aRealtime.waitForReady(stream);
        }
        await bRealtime.waitForReady('typing');
        expect(aRealtime.joinedTopics('typing')).toEqual([`realtime:conversation:${directId}:typing`]);
        const openSockets = aRealtime.connections().filter((connection) => connection.closedSeq === null);
        expect(openSockets, 'A has one Realtime socket').toHaveLength(1);

        // --- the fault ---------------------------------------------------
        const fault = await aRealtime.fail(target, kind);
        expect(fault.kicked, `joined ${target} channels kicked`).toBeGreaterThan(0);
        await aRealtime.waitForStatus(target, expected, { since: fault.mark });

        const evidence: Partial<Record<MessagingRealtimeStream, DeliveryEvidence>> = {};
        const affected = (stream: MessagingRealtimeStream) => stream === target;
        const frameCounts = (stream: MessagingRealtimeStream, since: number, events: readonly string[]) => ({
          passedFrames: aRealtime.frames({ stream, since, direction: 'in', action: 'pass', events }).length,
          droppedFrames: aRealtime.frames({ stream, since, direction: 'in', action: 'drop', events }).length,
        });

        // --- list: B writes in the group (not open in A) ------------------
        {
          const since = aRealtime.mark();
          const fetchesBefore = listFetches().length;
          const startedAt = Date.now();
          await createAs(b.page, groupId, `t25 list ${target}/${kind} ${randomUUID()}`);
          const groupUpdate = () =>
            aRealtime
              .frames({ stream: 'list', since, direction: 'in', action: 'pass', events: ['postgres_changes'] })
              .find((frame) => frame.detail.table === 'conversations' && frame.detail.recordId === groupId);
          if (affected('list')) {
            await a.page.waitForTimeout(ABSENCE_WINDOW_MS);
            expect(groupUpdate(), 'faulted list stream delivered nothing').toBeUndefined();
            expect(listFetches().slice(fetchesBefore), 'no list refetch without the list stream').toEqual([]);
          } else {
            await expect.poll(() => groupUpdate() !== undefined, { timeout: DELIVERY_TIMEOUT_MS }).toBe(true);
            const frameAt = groupUpdate()?.at ?? startedAt;
            await expect
              .poll(() => listFetches().filter((at) => at >= frameAt).length, {
                timeout: DELIVERY_TIMEOUT_MS,
                message: 'A refetched the conversation list after the list event',
              })
              .toBeGreaterThan(0);
          }
          evidence.list = {
            delivered: groupUpdate() !== undefined,
            ...frameCounts('list', since, ['postgres_changes']),
            uiEffect: listFetches().length > fetchesBefore,
          };
        }

        // --- typing: B types in the open DM -------------------------------
        {
          const since = aRealtime.mark();
          const indicator = a.page.getByText(/está digitando…/);
          const input = composerInput(b.page);
          await input.click();
          const typing = input.pressSequentially(`t25 typing ${target} ${kind}`, { delay: 120 });
          let shown = false;
          if (affected('typing')) {
            await expectNeverVisible(a.page, indicator, ABSENCE_WINDOW_MS, 'no typing indicator without the typing stream');
          } else {
            await expect(indicator, 'A sees B typing').toBeVisible({ timeout: DELIVERY_TIMEOUT_MS });
            shown = true;
          }
          await typing;
          await input.fill('');
          const broadcasts = frameCounts('typing', since, ['broadcast']);
          evidence.typing = { delivered: broadcasts.passedFrames > 0, ...broadcasts, uiEffect: shown };
          if (affected('typing')) {
            expect(broadcasts.passedFrames, 'faulted typing stream delivered nothing').toBe(0);
          } else {
            expect(broadcasts.passedFrames, 'typing broadcasts reached A').toBeGreaterThan(0);
          }
        }

        // --- messages: B writes in the open DM ----------------------------
        {
          const since = aRealtime.mark();
          const text = `t25 messages ${target}/${kind} ${randomUUID()}`;
          const messageId = await createAs(b.page, directId, text);
          const inFeed = a.page.locator('[data-testid="messages-feed"] [data-testid^="message-"]', { hasText: text });
          const insert = () =>
            aRealtime
              .frames({ stream: 'messages', since, direction: 'in', action: 'pass', events: ['postgres_changes'] })
              .find((frame) => frame.detail.table === 'messages' && frame.detail.recordId === messageId);
          if (affected('messages')) {
            await expectNeverVisible(a.page, inFeed.first(), ABSENCE_WINDOW_MS, 'message not in the feed without the messages stream');
            expect(insert(), 'faulted messages stream delivered nothing').toBeUndefined();
          } else {
            await expect(inFeed.first(), 'A sees B\'s message').toBeVisible({ timeout: DELIVERY_TIMEOUT_MS });
            await expect.poll(() => insert() !== undefined, { timeout: DELIVERY_TIMEOUT_MS }).toBe(true);
          }
          evidence.messages = {
            delivered: insert() !== undefined,
            ...frameCounts('messages', since, ['postgres_changes']),
            uiEffect: await inFeed.first().isVisible(),
          };
        }

        // --- Presence: a real Presence event after the fault -------------
        // B opens another tab: its Presence join (presence_diff) and session
        // placement reach A on the company Presence channel.
        let presenceEvents = 0;
        {
          const since = aRealtime.mark();
          const bTab = await b.newTab();
          await bTab.goto('/floor-plan');
          const passed = () =>
            aRealtime.frames({
              stream: 'presence',
              since,
              direction: 'in',
              action: 'pass',
              events: ['presence_diff', 'postgres_changes'],
            }).length;
          await expect
            .poll(passed, { timeout: DELIVERY_TIMEOUT_MS, message: 'A received a Presence event after the fault' })
            .toBeGreaterThan(0);
          presenceEvents = passed();
          await bTab.close();
        }

        // --- the other streams and Presence never moved -------------------
        await aRealtime.settle();
        const targetStatuses = aRealtime.statuses(target, { since: fault.mark }).map((record) => record.status);
        for (const stream of [...MESSAGING_REALTIME_STREAMS.filter((s) => s !== target), 'presence'] as const) {
          expect(aRealtime.statuses(stream, { since: fault.mark }), `${stream}: no status change`).toEqual([]);
          expect(
            aRealtime.frames({ stream, since: fault.mark, events: LIFECYCLE_EVENTS }),
            `${stream}: no join/leave/close/error on the socket`,
          ).toEqual([]);
          expect(
            aRealtime.frames({ stream, since: fault.mark, direction: 'in' }).filter((frame) => frame.detail.status === 'error'),
            `${stream}: no error reply or system error`,
          ).toEqual([]);
          expect(aRealtime.joinedTopics(stream).length, `${stream} still joined`).toBeGreaterThan(0);
        }
        expect(
          aRealtime.connections().filter((connection) => connection.openedSeq > fault.mark || connection.closedSeq !== null),
          'same socket throughout (no reconnect)',
        ).toEqual([]);
        expect(targetStatuses, `${target} never recovered while faulted`).not.toContain('SUBSCRIBED');
        const joinAttempts = aRealtime.activeFaults().find((active) => active.stream === target)?.joinAttempts ?? 0;
        const harnessFrames = aRealtime
          .frames({ stream: target, since: fault.mark })
          .filter((frame) => frame.action === 'inject' || frame.action === 'inject-server')
          .map((frame) => `${frame.action}:${frame.event}`);

        // --- restore ------------------------------------------------------
        // Every class recovers after restore (T15: the typing stream's terminal
        // closure too, rejoining the same private topic).
        const restoreMark = aRealtime.restore(target);
        await aRealtime.waitForStatus(target, 'SUBSCRIBED', { since: restoreMark, timeout: RECOVERY_TIMEOUT_MS });
        const afterRestore = 'SUBSCRIBED';

        const cell = {
          stream: target,
          kind,
          browser: testInfo.project.name,
          targetStatuses,
          joinAttemptsWhileFaulted: joinAttempts,
          harnessFrames,
          afterRestore,
          evidence,
          presenceEventsAfterFault: presenceEvents,
        };
        testInfo.annotations.push({ type: 't25-cell', description: JSON.stringify(cell) });
        await testInfo.attach('t25-cell.json', { body: JSON.stringify(cell, null, 2), contentType: 'application/json' });
      });
    }
  }
});
