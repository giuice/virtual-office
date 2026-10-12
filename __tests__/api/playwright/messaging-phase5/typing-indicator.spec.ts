import type { Page } from '@playwright/test';

import { test, expect, type Phase5Device } from '../fixtures/messaging-phase5-faults';
import { backToConversationList } from '../helpers/drawer-helpers';
import { STEP_TIMEOUT_MS, composerInput, openConversation } from '../helpers/messaging-outbox-e2e';
import type { RealtimeFaultController, RealtimeFaultKind, RetryRecord } from '../helpers/realtime-stream-faults';

/**
 * Phase 5 T15 — reliable, named, members-only typing indicator (FR-015 typing
 * clause, FR-017–FR-020, BR-009; AC-015 typing clause, AC-017, AC-018,
 * AC-019 E2E removal clause, AC-020).
 *
 * Real accounts A–E, the real app, local Supabase and its Realtime; typing
 * travels on the conversation's private members-only topic
 * `conversation:<id>:typing` (T5). Faults are the T25 per-stream harness on
 * the device's real socket (network shaping, SPEC §15); removals are the T24
 * administrative removal (service-role DELETE → revocation, T28). The
 * anon / outsider / public-topic refusals of AC-019 are integration-tested
 * (__tests__/messaging-db/conversation-typing-topic.test.ts, T5).
 *
 * Timing contract under test: an indicator stays while its typist types
 * continuously and is gone ≤ 5 s after the typist stops, blurs, sends,
 * switches conversation or closes the tab.
 */

const GONE_WITHIN_MS = 5_000;
const KEY_INTERVAL_MS = 150;
const RETRY_BASE_MS = 250;
const RETRY_MAX_MS = 5_000;
const RECOVERY_TIMEOUT_MS = 30_000;
const KINDS: readonly RealtimeFaultKind[] = ['error', 'timeout', 'close'];

const indicator = (page: Page) => page.getByTestId('typing-indicator');
const typingTopic = (conversationId: string) => `realtime:conversation:${conversationId}:typing`;
const single = (name: string) => `${name} está digitando…`;
const pair = (first: string, second: string) => `${first} e ${second} estão digitando…`;
const many = (count: number) => `${count} pessoas estão digitando…`;
/** min(cap, round(base · 1.5^(n − 1))) — the T13 backoff the typing stream shares. */
const expectedDelay = (attempt: number) => Math.min(RETRY_MAX_MS, Math.round(RETRY_BASE_MS * 1.5 ** (attempt - 1)));

interface IndicatorEntry {
  at: number;
  text: string | null;
}

/** Records, in the page, every change of the typing indicator (text, or null when absent) with the page's time. */
async function watchIndicator(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: Array<{ at: number; text: string | null }> = [];
    let last: string | null | undefined;
    const read = () => {
      const element = document.querySelector('[data-testid="typing-indicator"]');
      const text = element ? (element.textContent ?? '').trim() : null;
      if (text === last) return;
      last = text;
      log.push({ at: Date.now(), text });
    };
    (window as unknown as { __t15Typing?: typeof log }).__t15Typing = log;
    read();
    new MutationObserver(read).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

const readIndicatorLog = (page: Page): Promise<IndicatorEntry[]> =>
  page.evaluate(() => (window as unknown as { __t15Typing: IndicatorEntry[] }).__t15Typing);

/** When the indicator disappeared at or after `since` (page clock = this machine's clock). */
async function goneAt(page: Page, since: number): Promise<number> {
  let at = -1;
  await expect
    .poll(
      async () => {
        const log = await readIndicatorLog(page);
        const current = log[log.length - 1];
        if (current?.text !== null) return false;
        // The last transition to absent (it may have been absent already).
        at = Math.max(since, current.at);
        return true;
      },
      { timeout: GONE_WITHIN_MS + 5_000, message: 'typing indicator disappears' },
    )
    .toBe(true);
  return at;
}

interface Typist {
  stop(): Promise<number>;
}

/**
 * Types one key every 150 ms into the composer of `page` until stopped
 * (continuous typing). `stop()` resolves with the time of the last keystroke.
 */
async function startTyping(page: Page): Promise<Typist> {
  await composerInput(page).click();
  let running = true;
  let lastKeyAt = Date.now();
  const loop = (async () => {
    let index = 0;
    while (running) {
      await page.keyboard.type('abcdefghij'[index % 10]);
      lastKeyAt = Date.now();
      index += 1;
      if (index % 40 === 0) {
        // Keep the draft short: erase without leaving the "typing" state.
        await page.keyboard.press('Backspace');
      }
      await page.waitForTimeout(KEY_INTERVAL_MS);
    }
  })();
  return {
    stop: async () => {
      running = false;
      await loop;
      return lastKeyAt;
    },
  };
}

/** Samples the indicator: it must never be visible for `ms`. */
async function expectNoIndicator(page: Page, ms: number, what: string): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    expect(await indicator(page).count(), what).toBe(0);
    await page.waitForTimeout(250);
  }
}

/** The typing broadcasts that reached the page over `topic` since `since`. */
const typingBroadcasts = (harness: RealtimeFaultController, topic: string, since: number) =>
  harness
    .frames({ stream: 'typing', since, direction: 'in', action: 'pass', events: ['broadcast'] })
    .filter((frame) => frame.topic === topic && frame.detail.broadcastEvent === 'typing');

const outFrames = (harness: RealtimeFaultController, topic: string, since: number, event: string) =>
  harness.frames({ stream: 'typing', since, direction: 'out', events: [event] }).filter((frame) => frame.topic === topic);

async function openAll(devices: readonly Phase5Device[], conversationId: string): Promise<void> {
  for (const device of devices) await openConversation(device.page, conversationId);
}

test.describe('Phase 5 T15 — typing indicator', () => {
  test('AC-017/AC-018: continuous 15 s typing stays visible at every 1 s sample with the DM phrase; gone ≤ 5 s after stop, blur and send', async ({
    phase5World,
    openDevice,
  }, testInfo) => {
    const { directId } = phase5World.conversations;
    const bName = phase5World.users.B.displayName;
    const b = await openDevice('B');
    const a = await openDevice('A');
    await openAll([b, a], directId);
    await watchIndicator(a.page);
    const timings: Record<string, number> = {};

    // ---- continuous typing, sampled every second for 15 s ----------------
    const typist = await startTyping(b.page);
    await expect(indicator(a.page)).toHaveText(single(bName), { timeout: STEP_TIMEOUT_MS });
    const windowStart = Date.now();
    for (let sample = 0; sample <= 15; sample += 1) {
      await expect(indicator(a.page), `sample ${sample}s: visible with the DM phrase`).toHaveText(single(bName), {
        timeout: 100,
      });
      if (sample < 15) await a.page.waitForTimeout(Math.max(0, windowStart + (sample + 1) * 1_000 - Date.now()));
    }
    // Never hidden, never another text, between the first show and the end of the window.
    const windowLog = (await readIndicatorLog(a.page)).filter((entry) => entry.at >= windowStart);
    expect(windowLog.map((entry) => entry.text), 'no change during continuous typing').toEqual([]);

    // ---- stop (no blur): gone ≤ 5 s after the last keystroke --------------
    const lastKeyAt = await typist.stop();
    timings.stop = (await goneAt(a.page, lastKeyAt)) - lastKeyAt;
    expect(timings.stop, 'gone ≤ 5 s after B stops').toBeLessThanOrEqual(GONE_WITHIN_MS);
    await composerInput(b.page).fill('');

    // ---- blur ---------------------------------------------------------------
    const beforeBlur = await startTyping(b.page);
    await expect(indicator(a.page)).toHaveText(single(bName), { timeout: STEP_TIMEOUT_MS });
    await beforeBlur.stop();
    const blurAt = Date.now();
    await composerInput(b.page).blur();
    timings.blur = (await goneAt(a.page, blurAt)) - blurAt;
    expect(timings.blur, 'gone ≤ 5 s after B blurs the composer').toBeLessThanOrEqual(GONE_WITHIN_MS);

    // ---- send ---------------------------------------------------------------
    await composerInput(b.page).fill('');
    const beforeSend = await startTyping(b.page);
    await expect(indicator(a.page)).toHaveText(single(bName), { timeout: STEP_TIMEOUT_MS });
    await beforeSend.stop();
    const sendAt = Date.now();
    await b.page.keyboard.press('Enter');
    timings.send = (await goneAt(a.page, sendAt)) - sendAt;
    expect(timings.send, 'gone ≤ 5 s after B sends').toBeLessThanOrEqual(GONE_WITHIN_MS);
    await expect(composerInput(b.page)).toHaveValue('', { timeout: STEP_TIMEOUT_MS });

    testInfo.annotations.push({ type: 't15-gone-ms', description: JSON.stringify(timings) });
  });

  test('AC-017: gone ≤ 5 s after the typist switches to another conversation and after the typist closes the tab', async ({
    phase5World,
    openDevice,
  }, testInfo) => {
    const { directId, groupId } = phase5World.conversations;
    const bName = phase5World.users.B.displayName;
    const b = await openDevice('B');
    const a = await openDevice('A');
    await openAll([b, a], directId);
    await watchIndicator(a.page);
    const timings: Record<string, number> = {};

    // ---- conversation switch mid-typing ---------------------------------------
    const typist = await startTyping(b.page);
    await expect(indicator(a.page)).toHaveText(single(bName), { timeout: STEP_TIMEOUT_MS });
    // Still typing when the switch starts (no stop, no blur first).
    const switchAt = Date.now();
    const switching = (async () => {
      await b.page.getByRole('button', { name: 'Back to conversations' }).click();
      await b.page.getByTestId(`conversation-item-${groupId}`).click();
    })();
    timings.switch = (await goneAt(a.page, switchAt)) - switchAt;
    await typist.stop().catch(() => undefined);
    await switching;
    await expect(b.page.getByTestId('messages-feed')).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    expect(timings.switch, 'gone ≤ 5 s after B switches conversation').toBeLessThanOrEqual(GONE_WITHIN_MS);

    // ---- tab close mid-typing ----------------------------------------------------
    const tab = await b.newTab();
    await openConversation(tab, directId);
    const tabTypist = await startTyping(tab);
    await expect(indicator(a.page)).toHaveText(single(bName), { timeout: STEP_TIMEOUT_MS });
    const closeAt = Date.now();
    await tab.close();
    await tabTypist.stop().catch(() => undefined);
    timings.tabClose = (await goneAt(a.page, closeAt)) - closeAt;
    expect(timings.tabClose, 'gone ≤ 5 s after B closes the tab').toBeLessThanOrEqual(GONE_WITHIN_MS);

    testInfo.annotations.push({ type: 't15-gone-ms', description: JSON.stringify(timings) });
  });

  test('AC-018: names 1 / 2 / 3+ typists in a group and in a room', async ({ phase5World, openDevice }) => {
    const { groupId, roomId } = phase5World.conversations;
    const { B, C } = phase5World.users;
    const a = await openDevice('A');
    const b = await openDevice('B');
    const c = await openDevice('C');
    const d = await openDevice('D');

    for (const conversationId of [groupId, roomId]) {
      await openAll([a, b, c, d], conversationId);
      const typists: Typist[] = [];
      typists.push(await startTyping(b.page));
      await expect(indicator(a.page), `${conversationId}: one typist`).toHaveText(single(B.displayName), {
        timeout: STEP_TIMEOUT_MS,
      });
      typists.push(await startTyping(c.page));
      await expect(indicator(a.page), `${conversationId}: two typists`).toHaveText(pair(B.displayName, C.displayName), {
        timeout: STEP_TIMEOUT_MS,
      });
      typists.push(await startTyping(d.page));
      await expect(indicator(a.page), `${conversationId}: three typists`).toHaveText(many(3), { timeout: STEP_TIMEOUT_MS });
      for (const typist of typists) await typist.stop();
      await expect(indicator(a.page)).toHaveCount(0, { timeout: GONE_WITHIN_MS + 1_000 });
      for (const device of [b, c, d]) await composerInput(device.page).fill('');
      for (const device of [a, b, c, d]) await backToConversationList(device.page, conversationId);
    }
  });

  test('AC-020: A typing in one tab is never shown in A\'s other tab or on A\'s second device (B sees it)', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }) => {
    const { directId } = phase5World.conversations;
    const aName = phase5World.users.A.displayName;
    const b = await openDevice('B');
    const a1 = await openDevice('A');
    const a2 = await openDevice('A');
    // Observers only (no fault): the frames A's other sessions receive.
    const a1Harness = await realtimeFaults.attach(a1);
    const a2Harness = await realtimeFaults.attach(a2);
    await openAll([b, a1, a2], directId);
    const a1Tab2 = await a1.newTab();
    await openConversation(a1Tab2, directId);
    const topic = typingTopic(directId);
    await expect.poll(() => a2Harness.joinedTopics('typing'), { timeout: STEP_TIMEOUT_MS }).toEqual([topic]);
    // A#1's two tabs: one joined typing channel per tab.
    await expect.poll(() => a1Harness.joinedTopics('typing'), { timeout: STEP_TIMEOUT_MS }).toEqual([topic, topic]);

    const since1 = a1Harness.mark();
    const since2 = a2Harness.mark();
    const typist = await startTyping(a1.page);
    // Control: another member sees A typing.
    await expect(indicator(b.page)).toHaveText(single(aName), { timeout: STEP_TIMEOUT_MS });
    await Promise.all([
      expectNoIndicator(a1Tab2, 8_000, 'A\'s other tab never shows A typing'),
      expectNoIndicator(a2.page, 8_000, 'A\'s second device never shows A typing'),
    ]);
    await typist.stop();
    // Non-vacuity: A's signals did reach A's other tab and second device.
    expect(typingBroadcasts(a2Harness, topic, since2).length, 'second device received A\'s typing').toBeGreaterThan(0);
    expect(typingBroadcasts(a1Harness, topic, since1).length, 'other tab received A\'s typing').toBeGreaterThan(0);
  });

  test('AC-019: E removed from the open group leaves its typing topic ≤ 5 s and shows no further typing for it', async ({
    phase5World,
    openDevice,
    membership,
    realtimeFaults,
  }, testInfo) => {
    const { groupId } = phase5World.conversations;
    const bName = phase5World.users.B.displayName;
    const b = await openDevice('B');
    const e = await openDevice('E');
    const harness = await realtimeFaults.attach(e);
    await openAll([b, e], groupId);
    await harness.waitForReady('typing');
    const topic = typingTopic(groupId);
    expect(harness.joinedTopics('typing')).toEqual([topic]);

    // Subscribed for real: E sees B typing.
    const before = await startTyping(b.page);
    await expect(indicator(e.page)).toHaveText(single(bName), { timeout: STEP_TIMEOUT_MS });
    await before.stop();
    await expect(indicator(e.page)).toHaveCount(0, { timeout: GONE_WITHIN_MS + 1_000 });

    const removedMark = harness.mark();
    const removedAt = Date.now();
    expect(await membership.remove(groupId, 'E')).toBe(1);
    await expect
      .poll(() => outFrames(harness, topic, removedMark, 'phx_leave').length, {
        timeout: GONE_WITHIN_MS,
        message: 'E leaves the typing topic within 5 s of its removal',
      })
      .toBeGreaterThan(0);
    const leftAt = outFrames(harness, topic, removedMark, 'phx_leave')[0].at;
    expect(harness.joinedTopics('typing'), 'no typing channel left joined').toEqual([]);
    // The conversation leaves E's list (detected without a reload).
    await expect(e.page.getByTestId(`conversation-item-${groupId}`)).toHaveCount(0, { timeout: STEP_TIMEOUT_MS });

    // B keeps typing: E shows nothing and never tries to join again.
    const after = await startTyping(b.page);
    await expectNoIndicator(e.page, 8_000, 'no further typing for the group after the removal');
    await after.stop();
    expect(outFrames(harness, topic, removedMark, 'phx_join'), 'no rejoin of the typing topic').toEqual([]);
    expect(typingBroadcasts(harness, topic, removedMark).filter((frame) => frame.at > leftAt)).toEqual([]);
    testInfo.annotations.push({ type: 't15-removal-leave-ms', description: String(leftAt - removedAt) });
  });

  test('AC-019 (block B fix F2): removed while E\'s list stream — the removal signal — is down, E still leaves the typing topic ≤ 5 s after the removal and hears no further typing', async ({
    phase5World,
    openDevice,
    membership,
    realtimeFaults,
  }, testInfo) => {
    const { groupId } = phase5World.conversations;
    const b = await openDevice('B');
    const e = await openDevice('E');
    const harness = await realtimeFaults.attach(e);
    await openAll([b, e], groupId);
    await harness.waitForReady('typing');
    await harness.waitForReady('list');
    const topic = typingTopic(groupId);

    // The removal signal's stream is down when E is removed, and stays down.
    const fault = await harness.fail('list', 'error');
    await harness.waitForStatus('list', 'CHANNEL_ERROR', { since: fault.mark });
    const removedMark = harness.mark();
    const removedAt = Date.now();
    expect(await membership.remove(groupId, 'E')).toBe(1);
    await expect
      .poll(() => outFrames(harness, topic, removedMark, 'phx_leave').length, {
        timeout: GONE_WITHIN_MS,
        message: 'E leaves the typing topic within 5 s of its removal, the list stream still down',
      })
      .toBeGreaterThan(0);
    const leftAt = outFrames(harness, topic, removedMark, 'phx_leave')[0].at;
    expect(leftAt - removedAt, 'left ≤ 5 s after the removal').toBeLessThanOrEqual(GONE_WITHIN_MS);
    expect(harness.joinedTopics('typing'), 'no typing channel left joined').toEqual([]);
    await harness.settle();
    expect(
      harness.statuses('list', { since: fault.mark }).map((record) => record.status),
      'the list stream never recovered meanwhile',
    ).not.toContain('SUBSCRIBED');

    // B keeps typing: E shows nothing, hears nothing over the topic and never joins it again.
    const after = await startTyping(b.page);
    await expectNoIndicator(e.page, 5_000, 'no further typing for the group after the removal');
    await after.stop();
    expect(typingBroadcasts(harness, topic, removedMark).filter((frame) => frame.at > leftAt)).toEqual([]);
    expect(outFrames(harness, topic, removedMark, 'phx_join'), 'no rejoin of the typing topic').toEqual([]);

    // The list stream recovers later: still no rejoin.
    harness.restore('list');
    await harness.waitForReady('list', { timeout: RECOVERY_TIMEOUT_MS });
    await e.page.waitForTimeout(1_500);
    expect(outFrames(harness, topic, removedMark, 'phx_join'), 'no rejoin after the list recovered').toEqual([]);
    testInfo.annotations.push({ type: 't15-removal-list-down-leave-ms', description: String(leftAt - removedAt) });
  });

  test('FR-018 (block B fix F10): two members added within 10 s — the second one\'s continuous typing is named too, without stopping, focus or reload', async ({
    phase5World,
    openDevice,
    membership,
    realtimeFaults,
  }, testInfo) => {
    const { groupId } = phase5World.conversations;
    const { D, E } = phase5World.users;
    const a = await openDevice('A');
    const d = await openDevice('D');
    const e = await openDevice('E');
    const dHarness = await realtimeFaults.attach(d);
    const eHarness = await realtimeFaults.attach(e);
    // D and E have the group open, then are removed; A opens it afterwards (its roster lists neither).
    await openAll([d, e], groupId);
    await dHarness.waitForReady('typing');
    await eHarness.waitForReady('typing');
    const topic = typingTopic(groupId);
    for (const [key, harness] of [['D', dHarness], ['E', eHarness]] as const) {
      const mark = harness.mark();
      expect(await membership.remove(groupId, key)).toBe(1);
      await expect
        .poll(() => outFrames(harness, topic, mark, 'phx_leave').length, { timeout: STEP_TIMEOUT_MS })
        .toBeGreaterThan(0);
    }
    await openConversation(a.page, groupId);
    await watchIndicator(a.page);

    // D is added back and types continuously: A refetches its roster and names D.
    const dMark = dHarness.mark();
    await membership.restore(groupId, 'D');
    await expect.poll(() => outFrames(dHarness, topic, dMark, 'phx_join').length, { timeout: STEP_TIMEOUT_MS }).toBeGreaterThan(0);
    await dHarness.waitForReady('typing');
    const dTypist = await startTyping(d.page);
    await expect(indicator(a.page)).toHaveText(single(D.displayName), { timeout: STEP_TIMEOUT_MS });
    const dNamedAt = Date.now();

    // E is added back right after and types continuously too, while D keeps typing.
    const eMark = eHarness.mark();
    await membership.restore(groupId, 'E');
    await expect.poll(() => outFrames(eHarness, topic, eMark, 'phx_join').length, { timeout: STEP_TIMEOUT_MS }).toBeGreaterThan(0);
    await eHarness.waitForReady('typing');
    const eTypist = await startTyping(e.page);
    const eStartedAt = Date.now();
    // Non-vacuity: E's typing starts inside the 10 s refetch window of D's roster refetch.
    expect(eStartedAt - dNamedAt, 'E types within 10 s of the roster refetch D caused').toBeLessThan(9_000);
    // The roster refetch E needs is throttled, then scheduled: A names both.
    await expect(indicator(a.page)).toHaveText(pair(D.displayName, E.displayName), { timeout: 10_000 + STEP_TIMEOUT_MS });
    const bothNamedAt = Date.now();
    await eTypist.stop();
    await dTypist.stop();
    await expect(indicator(a.page)).toHaveCount(0, { timeout: GONE_WITHIN_MS + 1_000 });
    testInfo.annotations.push({
      type: 't15-second-added-typist',
      description: JSON.stringify({ eTypingAfterDNamedMs: eStartedAt - dNamedAt, eNamedAfterTypingMs: bothNamedAt - eStartedAt }),
    });
  });

  test('AC-019: E removed from a group that is not open in its drawer — detected, and E never joins its typing topic', async ({
    phase5World,
    openDevice,
    membership,
    realtimeFaults,
  }, testInfo) => {
    const { groupId, roomId } = phase5World.conversations;
    const bName = phase5World.users.B.displayName;
    const b = await openDevice('B');
    const e = await openDevice('E');
    const harness = await realtimeFaults.attach(e);
    // E has the room open: the group is not open in E's drawer.
    await openConversation(e.page, roomId);
    await harness.waitForReady('typing');
    const roomTopic = typingTopic(roomId);
    const groupTopic = typingTopic(groupId);
    expect(harness.joinedTopics('typing')).toEqual([roomTopic]);
    const listFetches: number[] = [];
    e.page.on('request', (request) => {
      if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/conversations/get') listFetches.push(Date.now());
    });

    const removedMark = harness.mark();
    const removedAt = Date.now();
    expect(await membership.remove(groupId, 'E')).toBe(1);
    // Detected while the group is not open: E's list is refreshed within 5 s.
    await expect
      .poll(() => listFetches.filter((at) => at >= removedAt).length, {
        timeout: GONE_WITHIN_MS,
        message: 'E\'s app reacts to its removal from the group within 5 s',
      })
      .toBeGreaterThan(0);
    const detectedAt = listFetches.find((at) => at >= removedAt) as number;

    // B types in the group: E never joins its topic nor hears it.
    await openConversation(b.page, groupId);
    const inGroup = await startTyping(b.page);
    await e.page.waitForTimeout(6_000);
    await inGroup.stop();
    expect(outFrames(harness, groupTopic, removedMark, 'phx_join'), 'E never joins the group typing topic').toEqual([]);
    expect(typingBroadcasts(harness, groupTopic, removedMark)).toEqual([]);

    // E's typing in the room is untouched (no leave, still joined) and live.
    expect(outFrames(harness, roomTopic, removedMark, 'phx_leave')).toEqual([]);
    expect(harness.joinedTopics('typing')).toEqual([roomTopic]);
    await composerInput(b.page).fill('');
    await backToConversationList(b.page, groupId);
    await openConversation(b.page, roomId);
    const inRoom = await startTyping(b.page);
    await expect(indicator(e.page)).toHaveText(single(bName), { timeout: STEP_TIMEOUT_MS });
    await inRoom.stop();

    // Back in its list, the group is gone; nothing of it can be opened.
    await e.page.getByRole('button', { name: 'Back to conversations' }).click();
    await expect(e.page.getByTestId(`conversation-item-${roomId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect(e.page.getByTestId(`conversation-item-${groupId}`)).toHaveCount(0);
    testInfo.annotations.push({ type: 't15-removal-detected-ms', description: String(detectedAt - removedAt) });
  });

  for (const kind of KINDS) {
    test(`AC-015 typing clause: typing-only ${kind} → recovers without user action with increasing capped delays; banner unaffected`, async ({
      phase5World,
      openDevice,
      realtimeFaults,
    }, testInfo) => {
      const { directId } = phase5World.conversations;
      const bName = phase5World.users.B.displayName;
      const b = await openDevice('B');
      const a = await openDevice('A');
      const harness = await realtimeFaults.attach(a);
      await openAll([b, a], directId);
      for (const stream of ['messages', 'list', 'typing'] as const) await harness.waitForReady(stream);
      const topic = typingTopic(directId);

      const faultAt = Date.now();
      const fault = await harness.fail('typing', kind);
      expect(fault.kicked, 'the joined typing channel was hit').toBeGreaterThan(0);
      await harness.waitForStatus('typing', kind === 'close' ? 'CLOSED' : 'CHANNEL_ERROR', {
        since: fault.mark,
        timeout: 10_000,
      });
      // Dark: B's typing does not reach A.
      const dark = await startTyping(b.page);
      await expectNoIndicator(a.page, 6_000, 'no typing indicator while the typing stream is down');
      await dark.stop();
      await composerInput(b.page).fill('');
      // Held long enough for at least two retries (a timed-out or closed
      // stream's rejoin waits for the SDK's 10 s join timeout).
      const holdUntil = faultAt + (kind === 'error' ? 10_000 : 12_000);
      await a.page.waitForTimeout(Math.max(0, holdUntil - Date.now()));
      // Typing is not a stream the banner requires.
      await expect(a.page.getByTestId('messaging-connection-banner')).toHaveAttribute('data-state', 'healthy');
      await harness.settle();
      expect(harness.statuses('typing', { since: fault.mark }).map((record) => record.status)).not.toContain('SUBSCRIBED');
      harness.restore('typing');

      // Recovered without user action: joined, and a fresh event from B arrives.
      await harness.waitForReady('typing', { timeout: RECOVERY_TIMEOUT_MS });
      expect(harness.joinedTopics('typing'), 'a single joined typing channel').toEqual([topic]);
      const freshMark = harness.mark();
      const fresh = await startTyping(b.page);
      await expect(indicator(a.page)).toHaveText(single(bName), { timeout: STEP_TIMEOUT_MS });
      await fresh.stop();
      expect(typingBroadcasts(harness, topic, freshMark).length, 'fresh typing over the recovered stream').toBeGreaterThan(0);

      // Increasing, capped delays: consecutive attempts of one unhealthy period, each per formula.
      await harness.settle();
      const retries: RetryRecord[] = harness.retries('typing', { since: fault.mark });
      expect(retries.length, 'the application retried by itself').toBeGreaterThanOrEqual(2);
      const first = retries[0].attempt;
      expect(
        retries.map((record) => [record.attempt, record.delay]),
        'increasing, capped delays',
      ).toEqual(retries.map((_record, index) => [first + index, expectedDelay(first + index)]));
      expect(Math.max(...retries.map((record) => record.delay))).toBeLessThanOrEqual(RETRY_MAX_MS);
      // Every rejoin went to the same private topic; the other streams never moved.
      expect(
        harness.frames({ stream: 'typing', since: fault.mark, direction: 'out', events: ['phx_join'] }).every((frame) => frame.topic === topic),
      ).toBe(true);
      for (const stream of ['messages', 'list'] as const) {
        expect(harness.statuses(stream, { since: fault.mark }), `${stream}: no status change`).toEqual([]);
      }
      testInfo.annotations.push({
        type: 't15-recovery',
        description: JSON.stringify({ kind, retries: retries.map((record) => [record.status, record.delay]) }),
      });
    });
  }
});
