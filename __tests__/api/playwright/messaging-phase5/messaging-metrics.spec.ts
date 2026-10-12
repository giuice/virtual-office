import { randomUUID } from 'node:crypto';

import type { ConsoleMessage, Page, Request, Route } from '@playwright/test';

import { test, expect, type Phase5Device } from '../fixtures/messaging-phase5-faults';
import { waitForRealtimeReady } from '../helpers/drawer-helpers';
import { withLocalMessagingDb } from '../helpers/messaging-local-db';
import {
  STEP_TIMEOUT_MS,
  composerInput,
  createViaApi,
  goOffline,
  openConversation,
  readArrivals,
  readOutbox,
  sendFromComposer,
  storedWithTexts,
  watchArrivals,
} from '../helpers/messaging-outbox-e2e';
import type { ServerLogMark } from '../helpers/server-log';

/**
 * Phase 5 T19 — client messaging metrics that never affect messaging
 * (FR-009 send time, FR-027, FR-028; AC-028 end-to-end clause, AC-029).
 *
 * Everything is real: the app's metric recorder, its outbox and Realtime
 * streams, POST /api/messages/metrics (T6) and the raw dev-server log the
 * Phase 5 runner captures (T24). Faults are network shaping only (SPEC §15):
 * one Realtime stream closed by the T25 harness, creates/fences failed in
 * transit, browser offline mode, and the metrics route reached but its
 * answer replaced by a gateway 500, held without an answer, or flooded with
 * real traffic of the same user until its real per-user budget answers 429
 * (started early in a budget bucket). Time: the page clock (`setSystemTime`)
 * puts the browser 25 h after a send whose delivery failed in transit.
 *
 * The recorder's own debug traces (`[MessagingMetrics] recorded|send|sent|
 * send-failed`, on in the dev server) report its buffer size; requests are
 * observed on A's page.
 */

/** The fields a metric log line may carry (BR-013; metrics-contract.ts). */
const METRIC_LINE_KEYS = new Set(['ts', 'appVersion', 'type', 'reason', 'conversationType', 'durationMs', 'count', 'occurredAt']);
/** The fields a client event may carry. */
const METRIC_EVENT_KEYS = new Set(['type', 'reason', 'conversationType', 'durationMs', 'count', 'occurredAt']);
const METRIC_TYPES = new Set([
  'send_latency',
  'outbox_wait',
  'send_outcome',
  'messages_stream_drop',
  'messages_stream_recovery',
  'list_stream_drop',
  'list_stream_recovery',
  'typing_stream_drop',
  'typing_stream_recovery',
  'polling_start',
  'polling_stop',
]);
const METRICS_PATH = '/api/messages/metrics';
/** Client bounds under test (metrics-recorder.ts, metrics-contract.ts). */
const MAX_BUFFERED_EVENTS = 100;
const MAX_BATCH_EVENTS = 50;
const MAX_BATCH_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;
/** After a 429 the tab sends nothing for one budget window (metrics-recorder.ts). */
const OVERLOAD_PAUSE_MS = 60_000;
/** The route's per-user budget: 30 requests per fixed 60 s bucket (rate-limit.ts 'messaging:metrics'). */
const METRICS_BUDGET_WINDOW_MS = 60_000;
/**
 * Block C fix F9: the flood starts with at least this long left in its
 * bucket, so the bucket stays exhausted until A's tab has sent its next batch
 * (flood ~8 s to 429, offline cycle, then the tab's next request ≤ 15 s).
 */
const FLOOD_MIN_BUCKET_LEFT_MS = 40_000;
const POLL_AFTER_UNHEALTHY_MS = 30_000;
/** AC-002: three queued messages reach B within 10 s of connectivity returning. */
const AC002_DEADLINE_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ANSI = /\u001b\[[0-9;]*m/g;

interface MetricLine {
  raw: string;
  ts: string;
  appVersion: string;
  type: string;
  reason?: string;
  durationMs?: number;
  count?: number;
  [key: string]: unknown;
}

/**
 * Every metric line in the raw log since `mark`: a line carrying an
 * `appVersion` must be exactly one JSON object with only BR-013 fields and a
 * known type (anything else fails the scan).
 */
function metricLinesSince(serverLog: { linesSince(mark: ServerLogMark): string[] }, mark: ServerLogMark): MetricLine[] {
  const lines: MetricLine[] = [];
  for (const raw of serverLog.linesSince(mark)) {
    if (!raw.includes('"appVersion"')) continue;
    const text = raw.replace(ANSI, '');
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed).filter((key) => !METRIC_LINE_KEYS.has(key)), `only BR-013 fields: ${text}`).toEqual([]);
    expect(METRIC_TYPES.has(String(parsed.type)), `known type: ${text}`).toBe(true);
    expect(String(parsed.appVersion)).toMatch(/^[0-9A-Za-z.-]{1,32}\+(local|[0-9a-f]{12})$/);
    lines.push({ ...parsed, raw: text } as MetricLine);
  }
  return lines;
}

/** The redaction scan: no identifier, name, email or text of the test anywhere in `texts`. */
function expectRedacted(texts: readonly string[], forbidden: readonly string[], what: string): void {
  for (const text of texts) {
    expect(UUID.test(text), `${what} carries no UUID: ${text}`).toBe(false);
    expect(text.includes('@'), `${what} carries no email: ${text}`).toBe(false);
    for (const value of forbidden) {
      expect(text.toLowerCase().includes(value.toLowerCase()), `${what} does not carry "${value}"`).toBe(false);
    }
  }
}

interface MetricsRequest {
  startedAt: number;
  endedAt?: number;
  status?: number;
  failure?: string;
  body: string;
}

/** A's metric deliveries as the page issues them, with how many were in flight at once. */
function trackMetricsRequests(page: Page): { requests: MetricsRequest[]; maxInFlight(): number } {
  const requests: MetricsRequest[] = [];
  const byRequest = new Map<Request, MetricsRequest>();
  let inFlight = 0;
  let maxInFlight = 0;
  const end = (request: Request, update: Partial<MetricsRequest>) => {
    const record = byRequest.get(request);
    if (!record || record.endedAt !== undefined) return;
    Object.assign(record, update, { endedAt: Date.now() });
    inFlight -= 1;
  };
  page.on('request', (request) => {
    if (request.method() !== 'POST' || new URL(request.url()).pathname !== METRICS_PATH) return;
    const record: MetricsRequest = { startedAt: Date.now(), body: request.postData() ?? '' };
    requests.push(record);
    byRequest.set(request, record);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
  });
  // A route-fulfilled answer is reported by 'response' (its headers arrived: the request is answered).
  page.on('response', (response) => end(response.request(), { status: response.status() }));
  page.on('requestfailed', (request) => end(request, { failure: request.failure()?.errorText ?? 'failed' }));
  return { requests, maxInFlight: () => maxInFlight };
}

/** Each delivered batch: ≤ 50 events, ≤ 16 KB, only contract fields. */
function expectBatchesWithinContract(requests: readonly MetricsRequest[]): void {
  for (const request of requests) {
    expect(Buffer.byteLength(request.body, 'utf8')).toBeLessThanOrEqual(MAX_BATCH_BYTES);
    const { events } = JSON.parse(request.body) as { events: Array<Record<string, unknown>> };
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(MAX_BATCH_EVENTS);
    for (const event of events) {
      expect(Object.keys(event).filter((key) => !METRIC_EVENT_KEYS.has(key))).toEqual([]);
      expect(METRIC_TYPES.has(String(event.type))).toBe(true);
    }
  }
}

interface RecorderTrace {
  event: string;
  at: number;
  /** 'recorded': the event's type. */
  type?: string;
  /** 'send': events in the batch. */
  events?: number;
  buffered?: number;
  dropped?: number;
  aborted?: boolean;
  elapsedMs?: number;
  status?: number;
}

/** The recorder's debug traces on `page`, in the order the page wrote them. */
function watchRecorder(page: Page): RecorderTrace[] {
  const traces: RecorderTrace[] = [];
  page.on('console', (message: ConsoleMessage) => {
    const match = /^\[MessagingMetrics\] (recorded|send|sent|send-failed|discarded)\b/.exec(message.text());
    if (!match) return;
    // Placed now (console order); its details arrive asynchronously.
    const trace: RecorderTrace = { event: match[1], at: Date.now() };
    traces.push(trace);
    void (async () => {
      const value = (await message.args()[1]?.jsonValue()) as Omit<RecorderTrace, 'event' | 'at'> | undefined;
      Object.assign(trace, value ?? {});
    })().catch(() => {});
  });
  return traces;
}

const UNKNOWN_EVENT = '?';

/**
 * Replays the recorder's traces up to (not including) `until` under a drop
 * policy and returns the buffer's event types at that point, oldest first.
 * Events already waiting when tracing began are UNKNOWN_EVENT. Each step's
 * buffer size is checked against the trace (no trace missed).
 */
function replayBuffer(traces: readonly RecorderTrace[], until: RecorderTrace, policy: 'drop-oldest' | 'drop-newest'): string[] {
  let buffer: string[] | null = null;
  for (const trace of traces) {
    if (trace === until) break;
    if (trace.event === 'discarded') {
      buffer = [];
      continue;
    }
    if (trace.event !== 'recorded' && trace.event !== 'send') continue;
    // A trace whose details never arrived (console handle gone): the buffer
    // is unknown again until the next trace with details.
    if (typeof trace.buffered !== 'number') {
      buffer = null;
      continue;
    }
    const buffered = trace.buffered;
    if (buffer === null) {
      const before = trace.event === 'recorded'
        ? (buffered < MAX_BUFFERED_EVENTS ? buffered - 1 : MAX_BUFFERED_EVENTS)
        : buffered + (trace.events as number);
      buffer = Array.from({ length: before }, () => UNKNOWN_EVENT);
    }
    if (trace.event === 'recorded') {
      if (buffer.length < MAX_BUFFERED_EVENTS) buffer.push(trace.type as string);
      else if (policy === 'drop-oldest') buffer = [...buffer.slice(1), trace.type as string];
    } else {
      buffer = buffer.slice(trace.events as number);
    }
    expect(buffer.length, `replayed buffer size at ${trace.event} (${policy})`).toBe(buffered);
  }
  return buffer ?? [];
}

/**
 * Time left (ms) in the current fixed 60 s bucket of the per-user
 * 'messaging:metrics' budget (rate-limit.ts), on the database clock that
 * public.check_rate_limit uses (buckets start at multiples of the window).
 */
async function msLeftInMetricsBucket(): Promise<number> {
  return withLocalMessagingDb(async (db) => {
    const { rows } = await db.query<{ now_ms: string }>(
      'select floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text as now_ms',
    );
    return METRICS_BUDGET_WINDOW_MS - (Number(rows[0].now_ms) % METRICS_BUDGET_WINDOW_MS);
  });
}

/** Errors the user could see, or that messaging/metrics code threw, on `page`. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // The browser's own network log of a non-2xx answer is not an application error.
    if (text.startsWith('Failed to load resource')) return;
    if (/metric/i.test(text)) errors.push(`console: ${text}`);
  });
  return errors;
}

async function expectNoVisibleError(page: Page, errors: readonly string[]): Promise<void> {
  const alerts = await page
    .locator('[role="alert"]:not(#__next-route-announcer__)')
    .filter({ visible: true })
    .allInnerTexts();
  expect(alerts.filter((text) => text.trim() !== ''), 'no alert shown').toEqual([]);
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  expect(errors).toEqual([]);
}

/**
 * AC-001 then AC-002 for three texts: queued offline (pending with a text
 * label, composer empty, in the outbox, not at B), then delivered to B in
 * order, once each, within 10 s of connectivity returning.
 */
async function offlineSendCycle(a: Phase5Device, b: Phase5Device, conversationId: string, label: string): Promise<number> {
  const texts = [1, 2, 3].map((index) => `t19 ${label} ${index} ${randomUUID()}`);
  await watchArrivals(b.page, texts);
  await goOffline(a.page);
  for (const [index, text] of texts.entries()) {
    await sendFromComposer(a.page, text);
    await expect(composerInput(a.page)).toHaveValue('');
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(index + 1);
  }
  const items = await readOutbox(a.page);
  expect(items.map((item) => [item.content, item.state])).toEqual(texts.map((text) => [text, 'waiting']));
  for (const item of items) {
    await expect(a.page.getByTestId(`message-delivery-state-temp-${item.clientMessageId}`)).toHaveText('pendente');
  }
  expect(Object.keys((await readArrivals(b.page)).first), `${label}: B sees nothing while A is offline`).toEqual([]);

  const reconnectedAt = Date.now();
  await a.context.setOffline(false);
  await expect
    .poll(async () => Object.keys((await readArrivals(b.page)).first).length, { timeout: AC002_DEADLINE_MS })
    .toBe(texts.length);
  const deliveredMs = Date.now() - reconnectedAt;
  expect(deliveredMs, `${label}: delivered within 10 s`).toBeLessThanOrEqual(AC002_DEADLINE_MS);
  const arrivals = await readArrivals(b.page);
  const firsts = texts.map((text) => arrivals.first[text]);
  expect([...firsts].sort((x, y) => x - y), `${label}: in order`).toEqual(firsts);
  for (const text of texts) expect(arrivals.max[text], `${label}: ${text} once`).toBe(1);
  await expect.poll(async () => (await readOutbox(a.page)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
  expect((await storedWithTexts(conversationId, texts)).map((row) => row.content)).toEqual(texts);
  return deliveredMs;
}

test.describe('Phase 5 T19 — client messaging metrics', () => {
  test.beforeEach(async ({ budgets }) => {
    await budgets.reset();
  });

  test('AC-028 end to end: a send, a stream recovery with a polling episode, and an expired item retried by hand reach the raw server log as redacted metric lines; the retried item\'s latency counts from its original send', async ({
    phase5World,
    openDevice,
    realtimeFaults,
    serverLog,
  }, testInfo) => {
    test.setTimeout(240_000);
    const { directId } = phase5World.conversations;
    const { A, B } = phase5World.users;
    const a = await openDevice('A');
    const harness = await realtimeFaults.attach(a);
    const metrics = trackMetricsRequests(a.page);
    const listPolls: number[] = [];
    a.page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/conversations/get' && url.searchParams.get('source') === 'poll') listPolls.push(Date.now());
    });
    await openConversation(a.page, directId);
    await harness.waitForReady('messages');
    await harness.waitForReady('list');
    const mark = serverLog.mark();

    // ---- A send.
    const sentText = `t19 send ${randomUUID()}`;
    await sendFromComposer(a.page, sentText);
    await expect.poll(async () => (await storedWithTexts(directId, [sentText])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);

    // ---- A stream recovery with a polling episode: the list stream closes and
    // its rejoins are refused; after 30 s unhealthy the list is polled; then
    // the stream is let back.
    const fault = await harness.fail('list', 'close');
    await harness.waitForStatus('list', 'CLOSED', { since: fault.mark, timeout: 10_000 });
    await harness.settle();
    const unhealthyAt = harness.statuses('list', { since: fault.mark }).find((record) => record.status !== 'SUBSCRIBED')?.at;
    expect(unhealthyAt).toBeDefined();
    await expect.poll(() => listPolls.length, { timeout: POLL_AFTER_UNHEALTHY_MS + 10_000 }).toBeGreaterThan(0);
    const firstPollAt = listPolls[0];
    harness.restore('list');
    await harness.waitForReady('list', { timeout: 20_000 });
    const recoveredAt = Date.now();

    // ---- An item whose delivery failed in transit, 25 h later: expired; "Tentar de novo" delivers it.
    const expiredText = `t19 expired ${randomUUID()}`;
    const blockSend = (route: Route) => route.abort('failed');
    await a.page.route('**/api/messages/create', blockSend);
    await a.page.route('**/api/messages/fence', blockSend);
    const blocked = a.page.waitForEvent('requestfailed', {
      predicate: (request) => new URL(request.url()).pathname === '/api/messages/create',
    });
    await sendFromComposer(a.page, expiredText);
    await blocked;
    const [item] = await readOutbox(a.page);
    expect(item).toMatchObject({ content: expiredText, windowStartedAt: item.pressedSendAt });
    const key = item.clientMessageId;
    await a.page.clock.setSystemTime(item.pressedSendAt + DAY_MS + HOUR_MS);
    const before = Date.now();
    const pageNow = await a.page.evaluate(() => Date.now());
    const offsetMs = pageNow - (before + Date.now()) / 2;
    await a.page.unroute('**/api/messages/create', blockSend);
    await a.page.unroute('**/api/messages/fence', blockSend);
    const stateLabel = a.page.getByTestId(`message-delivery-state-temp-${key}`);
    await expect(stateLabel).toHaveText('expirada', { timeout: 2 * STEP_TIMEOUT_MS });
    expect(await storedWithTexts(directId, [expiredText])).toHaveLength(0);

    let confirmedAt: number | null = null;
    a.page.on('response', (response) => {
      if (new URL(response.url()).pathname !== '/api/messages/create' || response.status() !== 201) return;
      if ((response.request().postDataJSON() as { clientMessageId?: string } | null)?.clientMessageId === key) {
        confirmedAt ??= Date.now();
      }
    });
    const retriedAt = Date.now();
    await a.page.getByTestId(`message-retry-temp-${key}`).click();
    await expect.poll(async () => (await readOutbox(a.page)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
    const stored = await storedWithTexts(directId, [expiredText]);
    expect(stored.map((row) => row.key)).toEqual([key]);
    expect(confirmedAt, 'the retried create was confirmed (201)').not.toBeNull();
    const confirmed = confirmedAt as unknown as number;
    // Original press → server confirmation, on the page's clock.
    const expectedLatencyMs = confirmed + offsetMs - item.pressedSendAt;
    const retryToConfirmMs = confirmed - retriedAt;

    // ---- The lines in the raw server log (each delivered within the recorder's cadence).
    const typesSeen = () => new Set(metricLinesSince(serverLog, mark).map((line) => line.type));
    await expect
      .poll(() => {
        const lines = metricLinesSince(serverLog, mark);
        const latencies = lines.filter((line) => line.type === 'send_latency');
        return {
          latencies: latencies.length,
          polling: typesSeen().has('polling_stop'),
          recovery: typesSeen().has('list_stream_recovery'),
          expired: lines.some((line) => line.type === 'send_outcome' && line.reason === 'expired'),
        };
      }, { timeout: 45_000 })
      .toEqual({ latencies: 2, polling: true, recovery: true, expired: true });
    const lines = metricLinesSince(serverLog, mark);

    // Sends: latency, outbox wait and outcome of each; the manual retry of the
    // expired item counts from its original send, not from the retry.
    const latencies = lines.filter((line) => line.type === 'send_latency').map((line) => line.durationMs as number);
    const [ordinary, retried] = [...latencies].sort((x, y) => x - y);
    expect(ordinary).toBeLessThan(STEP_TIMEOUT_MS);
    expect(Math.abs(retried - expectedLatencyMs), `latency ${retried} vs original send → confirmation ${expectedLatencyMs}`).toBeLessThanOrEqual(1_000);
    expect(retried - retryToConfirmMs, 'not the retry → confirmation time').toBeGreaterThan(DAY_MS);
    const waits = lines.filter((line) => line.type === 'outbox_wait').map((line) => line.durationMs as number);
    expect(waits).toHaveLength(2);
    expect(Math.max(...waits)).toBeGreaterThan(DAY_MS);
    expect(Math.max(...waits)).toBeLessThanOrEqual(retried);
    const outcomes = lines.filter((line) => line.type === 'send_outcome').map((line) => line.reason);
    expect(outcomes.filter((reason) => reason === 'delivered')).toHaveLength(2);
    expect(outcomes).toContain('network_error');
    expect(outcomes).toContain('expired');

    // Stream: one drop (closed) and one recovery whose duration is the outage.
    const drops = lines.filter((line) => line.type === 'list_stream_drop');
    expect(drops.map((line) => line.reason)).toEqual(['closed']);
    const recoveries = lines.filter((line) => line.type === 'list_stream_recovery');
    expect(recoveries).toHaveLength(1);
    const outageMs = recoveredAt - (unhealthyAt as number);
    expect(recoveries[0].durationMs as number).toBeGreaterThanOrEqual(POLL_AFTER_UNHEALTHY_MS);
    expect(Math.abs((recoveries[0].durationMs as number) - outageMs), `outage ${outageMs} ms`).toBeLessThanOrEqual(2_000);
    expect(recoveries[0].count as number).toBeGreaterThanOrEqual(1);

    // Polling: one episode from its first round to the recovery.
    expect(lines.filter((line) => line.type === 'polling_start')).toHaveLength(1);
    const stops = lines.filter((line) => line.type === 'polling_stop');
    expect(stops).toHaveLength(1);
    expect(stops[0].count as number).toBeGreaterThanOrEqual(1);
    expect(Math.abs((stops[0].durationMs as number) - (recoveredAt - firstPollAt))).toBeLessThanOrEqual(2_000);

    // Redaction: no message text, name, email or user/conversation/message id
    // in any metric line, nor in what the browser sent.
    const forbidden = [
      sentText,
      expiredText,
      key,
      directId,
      stored[0].id,
      ...[A, B].flatMap((user) => [user.userId, user.supabaseUid, user.email, user.displayName]),
    ];
    expectRedacted(lines.map((line) => line.raw), forbidden, 'metric log line');
    expectBatchesWithinContract(metrics.requests);
    expectRedacted(metrics.requests.map((request) => request.body), forbidden, 'metrics request');
    expect(metrics.maxInFlight()).toBe(1);

    testInfo.annotations.push({
      type: 't19-ac028',
      description: JSON.stringify({
        retriedLatencyMs: retried,
        expectedLatencyMs: Math.round(expectedLatencyMs),
        retryToConfirmMs,
        outageMs,
        recoveryDurationMs: recoveries[0].durationMs,
        pollingStop: { durationMs: stops[0].durationMs, count: stops[0].count },
        metricLines: lines.length,
        requests: metrics.requests.map((request) => request.status ?? request.failure),
      }),
    });
  });

  test('AC-029: with the metrics route erroring, then hanging, then flooded, offline sends and their delivery keep their timing; one metrics request at most in flight, a hanging one aborted after 5 s, the buffer bounded with the oldest dropped, no error shown', async ({
    phase5World,
    openDevice,
    budgets,
  }, testInfo) => {
    test.setTimeout(360_000);
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    const metrics = trackMetricsRequests(a.page);
    const recorder = watchRecorder(a.page);
    const errors = watchErrors(a.page);

    let mode: 'error' | 'hang' | 'real' = 'error';
    const held: Array<() => void> = [];
    await a.page.route(`**${METRICS_PATH}`, async (route) => {
      if (mode === 'error') {
        // The request reaches the real route; its answer is lost and a gateway 500 arrives instead.
        await route.fetch().catch(() => null);
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Failed to record metrics","code":"INTERNAL_ERROR"}' });
      } else if (mode === 'hang') {
        await new Promise<void>((resolve) => held.push(resolve));
        await route.abort().catch(() => undefined);
      } else {
        await route.continue();
      }
    });
    await openConversation(a.page, directId);
    await waitForRealtimeReady(a.page);
    // B's messages stream delivers A's messages live before the outages start.
    const warmUpId = await createViaApi(a.page, { conversationId: directId, content: `t19 warm-up ${randomUUID()}` });
    await expect(b.page.getByTestId(`message-${warmUpId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    const timings: Record<string, number> = {};
    let floodBucketLeftMs: number | null = null;
    let retained: { events: number; dropped: number } | null = null;
    const since = (at: number) => metrics.requests.filter((request) => request.startedAt >= at);

    try {
      // ---- The route errors (500).
      const errorPhase = Date.now();
      timings.error = await offlineSendCycle(a, b, directId, 'error');
      await expect.poll(() => since(errorPhase).filter((request) => request.status === 500).length, { timeout: 30_000 }).toBeGreaterThan(0);
      await expectNoVisibleError(a.page, errors);

      // ---- The route hangs: the request is aborted after 5 s.
      mode = 'hang';
      const hangPhase = Date.now();
      timings.hang = await offlineSendCycle(a, b, directId, 'hang');
      await expect.poll(() => since(hangPhase).filter((request) => request.failure !== undefined).length, { timeout: 45_000 }).toBeGreaterThan(0);
      const hung = since(hangPhase).find((request) => request.failure !== undefined) as MetricsRequest;
      const abortedAfterMs = (hung.endedAt as number) - hung.startedAt;
      expect(abortedAfterMs, 'a hanging metrics request is aborted after 5 s').toBeGreaterThanOrEqual(REQUEST_TIMEOUT_MS - 250);
      expect(abortedAfterMs).toBeLessThanOrEqual(REQUEST_TIMEOUT_MS + 1_500);
      await expectNoVisibleError(a.page, errors);

      // ---- The route is flooded: sustained real traffic of the same user
      // exhausts its real per-user budget, so A's tab is answered 429.
      // Block C fix F9: the budget is a fixed 60 s bucket and the flood
      // re-opens it at each rollover, so it starts early in a bucket (waiting
      // for the next one if needed) and A's next batch lands while it is exhausted.
      mode = 'real';
      const bucketLeftMs = await msLeftInMetricsBucket();
      if (bucketLeftMs < FLOOD_MIN_BUCKET_LEFT_MS) await a.page.waitForTimeout(bucketLeftMs + 250);
      const floodStartedAt = Date.now();
      const floodBucketEndsAt = floodStartedAt + (await msLeftInMetricsBucket());
      let flooding = true;
      const floodStatuses: number[] = [];
      const flood = (async () => {
        while (flooding) {
          const response = await a.context.request
            .post(METRICS_PATH, { data: { events: [{ type: 'polling_start' }] } })
            .catch(() => null);
          if (response) floodStatuses.push(response.status());
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      })();
      let overloaded: MetricsRequest | undefined;
      try {
        await expect.poll(() => floodStatuses.includes(429), { timeout: 30_000 }).toBe(true);
        const floodPhase = Date.now();
        timings.flood = await offlineSendCycle(a, b, directId, 'flood');
        await expect
          .poll(() => (overloaded = since(floodPhase).find((request) => request.status === 429)) !== undefined, {
            timeout: Math.max(1_000, floodBucketEndsAt - Date.now()),
            message: "A's tab answered 429 while the flooded bucket was exhausted",
          })
          .toBe(true);
        floodBucketLeftMs = floodBucketEndsAt - floodStartedAt;
      } finally {
        flooding = false;
        await flood;
      }
      await expectNoVisibleError(a.page, errors);

      // ---- Bounded buffer: after the 429 the tab sends nothing for a budget
      // window; meanwhile a burst of 28 offline sends records more events than
      // the buffer holds — the oldest are dropped, the bound never exceeded.
      await budgets.reset(['A'], ['message:create', 'message:create-request']);
      const burst = Array.from({ length: 28 }, (_, index) => `t19 burst ${index + 1} ${randomUUID()}`);
      const burstStart = Date.now();
      await goOffline(a.page);
      for (const text of burst) {
        await sendFromComposer(a.page, text);
        await expect(composerInput(a.page)).toHaveValue('');
      }
      await expect.poll(async () => (await readOutbox(a.page)).length).toBe(burst.length);
      await a.context.setOffline(false);
      await expect.poll(async () => (await storedWithTexts(directId, burst)).length, { timeout: 60_000 }).toBe(burst.length);
      expect((await storedWithTexts(directId, burst)).map((row) => row.content)).toEqual(burst);
      await expect.poll(async () => (await readOutbox(a.page)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
      await expect
        .poll(() => recorder.filter((trace) => trace.event === 'recorded' && trace.at >= burstStart && (trace.dropped ?? 0) > 0).length, {
          timeout: STEP_TIMEOUT_MS,
        })
        .toBeGreaterThan(0);
      const pauseEnd = (overloaded as MetricsRequest).startedAt + OVERLOAD_PAUSE_MS - 1_000;
      expect(since(burstStart).filter((request) => request.startedAt < pauseEnd), 'no delivery during the overload pause').toEqual([]);
      await expectNoVisibleError(a.page, errors);

      // ---- After the pause, the first batch carries the oldest of the
      // RETAINED events: the buffer replayed from the recorder's traces with
      // oldest-first dropping, which differs from what newest-first dropping
      // would have kept (block C fix F8).
      await expect
        .poll(() => since(burstStart).length, { timeout: Math.max(1_000, pauseEnd - Date.now()) + 30_000, message: 'first batch after the pause' })
        .toBeGreaterThan(0);
      const [afterPause] = since(burstStart);
      expect(afterPause.startedAt).toBeGreaterThanOrEqual(pauseEnd);
      const sendTrace = recorder.find((trace) => trace.event === 'send' && trace.at >= burstStart);
      expect(sendTrace, "the recorder's trace of that batch").toBeDefined();
      await expect
        .poll(() => recorder.filter((trace) => trace.at >= burstStart && (trace.event === 'recorded' || trace.event === 'send') && typeof trace.buffered !== 'number').length, {
          message: 'the details of every trace since the burst arrived',
        })
        .toBe(0);
      const delivered = (JSON.parse(afterPause.body) as { events: Array<{ type: string }> }).events.map((event) => event.type);
      expect(delivered.length).toBe(sendTrace?.events);
      const keptOldestDropped = replayBuffer(recorder, sendTrace as RecorderTrace, 'drop-oldest');
      const keptNewestDropped = replayBuffer(recorder, sendTrace as RecorderTrace, 'drop-newest');
      expect(keptOldestDropped).toHaveLength(MAX_BUFFERED_EVENTS);
      expect(keptOldestDropped.slice(0, delivered.length), 'retained events are known').not.toContain(UNKNOWN_EVENT);
      expect(delivered, 'the batch after the pause is the head of the oldest-dropped buffer').toEqual(
        keptOldestDropped.slice(0, delivered.length),
      );
      expect(
        keptNewestDropped.slice(0, delivered.length),
        'newest-first dropping would have sent a different batch (the check discriminates)',
      ).not.toEqual(delivered);
      retained = { events: delivered.length, dropped: sendTrace?.dropped ?? 0 };
    } finally {
      mode = 'real';
      held.splice(0).forEach((release) => release());
    }

    const recorded = recorder.filter((trace) => trace.event === 'recorded');
    const maxBuffered = Math.max(...recorded.map((trace) => trace.buffered ?? 0));
    expect(maxBuffered, 'the buffer reached its bound').toBe(MAX_BUFFERED_EVENTS);
    // At the bound, every new event drops exactly one (the oldest) event.
    const atBound = recorded
      .filter((trace) => trace.buffered === MAX_BUFFERED_EVENTS)
      .sort((x, y) => (x.dropped ?? 0) - (y.dropped ?? 0));
    expect(atBound.length).toBeGreaterThan(1);
    for (let index = 1; index < atBound.length; index += 1) {
      expect((atBound[index].dropped ?? 0) - (atBound[index - 1].dropped ?? 0)).toBe(1);
    }
    expect(metrics.maxInFlight(), 'at most one metrics request in flight').toBe(1);
    expectBatchesWithinContract(metrics.requests);
    for (const [phase, deliveredMs] of Object.entries(timings)) {
      expect(deliveredMs, `${phase}: AC-002 timing`).toBeLessThanOrEqual(AC002_DEADLINE_MS);
    }
    testInfo.annotations.push({
      type: 't19-ac029',
      description: JSON.stringify({
        deliveredMs: timings,
        requests: metrics.requests.map((request) => ({
          status: request.status ?? request.failure,
          ms: request.endedAt === undefined ? null : request.endedAt - request.startedAt,
        })),
        maxBuffered,
        dropped: Math.max(...recorded.map((trace) => trace.dropped ?? 0)),
        floodBucketLeftMs,
        retained,
      }),
    });
  });
});
