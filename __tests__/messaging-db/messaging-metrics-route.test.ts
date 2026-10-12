import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import packageJson from '../../package.json';
import { POST as metricsRoute } from '@/app/api/messages/metrics/route';
import {
  MESSAGING_METRICS_MAX_BYTES,
  MESSAGING_METRICS_MAX_COUNT,
  MESSAGING_METRIC_TYPES,
  MESSAGING_METRICS_EARLIEST_EVENT_TIME_MS,
  MESSAGING_METRICS_MAX_CLOCK_SKEW_MS,
  messagingMetricsMaxDurationMs,
} from '@/lib/messaging/metrics-contract';

import { createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { asSession, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

const ACTION = 'messaging:metrics';
const BUDGET = 30;
const WINDOW_SECONDS = 60;
const PATH = 'http://localhost/api/messages/metrics';

const REVOKE_LIMITER = 'revoke execute on function public.check_rate_limit(uuid, text, integer, integer) from service_role';
const RESTORE_LIMITER = 'grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role';

// Every key a metric log line may carry (BR-013), and nothing else.
const LINE_KEYS = new Set([
  'ts',
  'appVersion',
  'type',
  'reason',
  'conversationType',
  'durationMs',
  'count',
  'occurredAt',
]);

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

interface CapturedLine {
  method: (typeof CONSOLE_METHODS)[number];
  text: string;
}

interface RouteResult {
  status: number;
  body: { accepted?: number; dropped?: number; code?: string; error?: string };
}

// Phase 5 T6 (FR-027, BR-013, AC-028): the real POST /api/messages/metrics
// handler with real local sessions and the real check_rate_limit counter. Its
// raw console output is captured with pass-through spies (the route still
// writes to the console); nothing in the route or Supabase is replaced.
describe('messaging metrics route (local Supabase)', () => {
  let world: MessagingDbWorld;
  const sessions = new Map<string, SessionCookie[]>();
  const captured: CapturedLine[] = [];
  const spies: MockInstance[] = [];
  let sensitive: string[] = [];

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMessagingWorld({ historyMessageCount: 1 });
    await world.query(RESTORE_LIMITER);
    for (const user of [world.primary, world.secondary]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
    const users = await world.query<{ display_name: string }>(
      'select display_name from public.users where id = any($1::uuid[])',
      [[world.primary.appUserId, world.secondary.appUserId, world.outsider.appUserId]],
    );
    const conversations = await world.query<{ name: string }>(
      'select name from public.conversations where id = any($1::uuid[])',
      [[world.directConversationId, world.groupConversationId, world.roomConversationId]],
    );
    const messages = await world.query<{ content: string }>(
      'select content from public.messages where id = any($1::uuid[])',
      [[...world.historyMessageIds]],
    );
    sensitive = [
      world.companyId,
      world.directConversationId,
      world.groupConversationId,
      world.roomConversationId,
      ...world.historyMessageIds,
      ...[world.primary, world.secondary, world.outsider].flatMap((user) => [
        user.appUserId,
        user.supabaseUid,
        user.email,
      ]),
      ...users.map((row) => row.display_name),
      ...conversations.map((row) => row.name),
      ...messages.map((row) => row.content),
      ...[...sessions.values()].flat().map((cookie) => cookie.value.slice(0, 40)),
    ].filter((value) => value.length >= 6);
  });

  beforeEach(async () => {
    await resetCounters();
    captured.length = 0;
    for (const method of CONSOLE_METHODS) {
      const original = console[method].bind(console);
      spies.push(
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
          captured.push({ method, text: args.map((arg) => (typeof arg === 'string' ? arg : safeStringify(arg))).join(' ') });
          original(...args);
        }),
      );
    }
  });

  afterEach(() => {
    while (spies.length > 0) spies.pop()?.mockRestore();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (world) {
      await world.query(RESTORE_LIMITER);
      await world.cleanup();
    }
  });

  function safeStringify(value: unknown): string {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  async function resetCounters(): Promise<void> {
    await world.query('delete from private.rate_limit_counters where user_id = any($1::uuid[])', [
      [world.primary.appUserId, world.secondary.appUserId, world.outsider.appUserId],
    ]);
  }

  async function counter(user: MessagingDbUser): Promise<number> {
    const [{ total }] = await world.query<{ total: string }>(
      `select coalesce(sum(count), 0)::text as total from private.rate_limit_counters
       where user_id = $1 and action = $2`,
      [user.appUserId, ACTION],
    );
    return Number(total);
  }

  async function fill(user: MessagingDbUser, count: number): Promise<void> {
    await world.query(
      `insert into private.rate_limit_counters (user_id, action, window_start, count)
       values ($1, $2, to_timestamp(floor(extract(epoch from now()) / $3) * $3), $4)
       on conflict (user_id, action, window_start) do update set count = excluded.count`,
      [user.appUserId, ACTION, WINDOW_SECONDS, count],
    );
  }

  /** Waits for the next fixed window when fewer than `seconds` remain in this one. */
  async function ensureWindowHeadroom(seconds = 15): Promise<void> {
    const [{ remaining }] = await world.query<{ remaining: string }>(
      `select ($1::numeric - (extract(epoch from clock_timestamp())::numeric % $1::numeric))::text as remaining`,
      [WINDOW_SECONDS],
    );
    const left = Number(remaining);
    if (left < seconds) {
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(left * 1000) + 250));
    }
  }

  function cookiesOf(user: MessagingDbUser | null): SessionCookie[] {
    return user ? (sessions.get(user.appUserId) ?? []) : [];
  }

  function jsonRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
    return new NextRequest(PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  interface StreamProbe {
    /** Bytes the route pulled from the source so far. */
    pulledBytes: number;
    /** Whether the route cancelled the body. */
    cancelled: boolean;
  }

  /**
   * A body streamed in chunks (no Content-Length unless given, i.e. chunked
   * transfer) from an instrumented source that produces a chunk only when
   * the reader pulls one (highWaterMark 0: nothing is read ahead).
   */
  function streamedRequest(
    text: string,
    chunkSize = 1024,
    headers: Record<string, string> = {},
  ): { request: NextRequest; probe: StreamProbe } {
    const bytes = new TextEncoder().encode(text);
    const probe: StreamProbe = { pulledBytes: 0, cancelled: false };
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (probe.pulledBytes >= bytes.byteLength) {
            controller.close();
            return;
          }
          const chunk = bytes.slice(probe.pulledBytes, probe.pulledBytes + chunkSize);
          probe.pulledBytes += chunk.byteLength;
          controller.enqueue(chunk);
        },
        cancel() {
          probe.cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const request = new NextRequest(PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: stream,
      duplex: 'half',
    } as ConstructorParameters<typeof NextRequest>[1] & { duplex: 'half' });
    if (!('content-length' in headers)) expect(request.headers.get('content-length')).toBeNull();
    return { request, probe };
  }

  async function call(user: MessagingDbUser | null, request: NextRequest): Promise<RouteResult> {
    return asSession(cookiesOf(user), async () => {
      const response = await metricsRoute(request);
      return { status: response.status, body: (await response.json()) as RouteResult['body'] };
    });
  }

  function post(user: MessagingDbUser | null, body: unknown): Promise<RouteResult> {
    return call(user, jsonRequest(body));
  }

  function parseObject(text: string): Record<string, unknown> | null {
    try {
      const value: unknown = JSON.parse(text);
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Every captured metric line, identified by BR-013 fields only (lines carry
   * no tag): a JSON object with an `appVersion` and a known metric `type`.
   */
  function metricLines(): Record<string, unknown>[] {
    const lines: Record<string, unknown>[] = [];
    for (const line of captured) {
      const parsed = parseObject(line.text);
      if (!parsed || !('appVersion' in parsed) || !(MESSAGING_METRIC_TYPES as readonly unknown[]).includes(parsed.type)) {
        continue;
      }
      expect(line.method, 'metric lines are written with console.info').toBe('info');
      lines.push(parsed);
    }
    return lines;
  }

  function allOutput(): string {
    return captured.map((line) => line.text).join('\n');
  }

  /** No captured output at all looks like a metric line (broader than metricLines). */
  function expectNoMetricOutput(): void {
    expect(metricLines()).toHaveLength(0);
    expect(allOutput()).not.toContain('"appVersion"');
  }

  function expectBr013Line(line: Record<string, unknown>): void {
    for (const key of Object.keys(line)) expect(LINE_KEYS.has(key), `unexpected key ${key}`).toBe(true);
    expect(line.appVersion).toBe(expectedVersion);
    expect(Number.isNaN(Date.parse(String(line.ts)))).toBe(false);
  }

  function expectNoSensitiveOutput(extra: string[] = []): void {
    const output = allOutput();
    for (const value of [...sensitive, ...extra]) {
      expect(output.includes(value), `log output must not contain ${JSON.stringify(value.slice(0, 12))}…`).toBe(false);
    }
  }

  const expectedVersion = `${packageJson.version}+local`;

  const VALID_EVENTS = [
    { type: 'send_latency', durationMs: 840, conversationType: 'direct' },
    { type: 'outbox_wait', durationMs: 12_000, conversationType: 'group' },
    { type: 'send_outcome', reason: 'delivered', conversationType: 'room' },
    { type: 'send_outcome', reason: 'lost_access', conversationType: 'group' },
    { type: 'messages_stream_drop', reason: 'timeout', conversationType: 'direct' },
    { type: 'messages_stream_recovery', durationMs: 31_000, count: 3 },
    { type: 'list_stream_drop', reason: 'closed' },
    { type: 'list_stream_recovery', durationMs: 2_000, count: 1 },
    { type: 'typing_stream_drop', reason: 'error' },
    { type: 'typing_stream_recovery', durationMs: 5_000 },
    { type: 'polling_start', conversationType: 'room' },
    { type: 'polling_stop', durationMs: 45_000, count: 3 },
  ];

  it('logs a valid batch as one BR-013 line per event with the server-derived version', async () => {
    const occurredAt = Date.now() - 60_000;
    const events = VALID_EVENTS.map((event, index) => (index === 0 ? { ...event, occurredAt } : event));
    const result = await post(world.primary, { events });

    expect(result.status, JSON.stringify(result.body)).toBe(202);
    expect(result.body).toEqual({ accepted: VALID_EVENTS.length, dropped: 0 });
    const lines = metricLines();
    expect(lines).toHaveLength(VALID_EVENTS.length);
    lines.forEach((line, index) => {
      expectBr013Line(line);
      const { occurredAt: sentAt, ...sent } = events[index] as Record<string, unknown>;
      expect(line).toMatchObject(sent);
      if (sentAt !== undefined) expect(line.occurredAt).toBe(new Date(occurredAt).toISOString());
    });
    expect(await counter(world.primary)).toBe(1);
    expectNoSensitiveOutput();
  });

  it('keeps long delayed-retry latencies and old event times within the supported clock bounds', async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    // FR-009: a manual retry of an expired item keeps the original send time.
    const thirtyOneDays = 31 * day; // 2678400000 ms
    const sincePhaseStart = now - MESSAGING_METRICS_EARLIEST_EVENT_TIME_MS; // pressed at the earliest supported time
    const fortyDaysAgo = now - 40 * day;
    const result = await post(world.primary, {
      events: [
        { type: 'send_latency', durationMs: thirtyOneDays, conversationType: 'direct' },
        { type: 'send_latency', durationMs: sincePhaseStart },
        { type: 'outbox_wait', durationMs: thirtyOneDays },
        { type: 'send_outcome', reason: 'delivered', occurredAt: fortyDaysAgo },
        { type: 'send_outcome', reason: 'delivered', occurredAt: MESSAGING_METRICS_EARLIEST_EVENT_TIME_MS },
        // Out of the supported bounds: dropped.
        { type: 'send_latency', durationMs: messagingMetricsMaxDurationMs(now) + 60_000 },
        { type: 'send_outcome', reason: 'delivered', occurredAt: MESSAGING_METRICS_EARLIEST_EVENT_TIME_MS - 1 },
        { type: 'send_outcome', reason: 'delivered', occurredAt: now + MESSAGING_METRICS_MAX_CLOCK_SKEW_MS + 60_000 },
      ],
    });

    expect(result.status, JSON.stringify(result.body)).toBe(202);
    expect(result.body).toEqual({ accepted: 5, dropped: 3 });
    const lines = metricLines();
    lines.forEach(expectBr013Line);
    expect(lines).toEqual([
      expect.objectContaining({ type: 'send_latency', durationMs: 2_678_400_000, conversationType: 'direct' }),
      expect.objectContaining({ type: 'send_latency', durationMs: sincePhaseStart }),
      expect.objectContaining({ type: 'outbox_wait', durationMs: 2_678_400_000 }),
      expect.objectContaining({ type: 'send_outcome', occurredAt: new Date(fortyDaysAgo).toISOString() }),
      expect.objectContaining({ type: 'send_outcome', occurredAt: '2026-01-01T00:00:00.000Z' }),
    ]);
  });

  it('takes the version from the deployment commit, never from the client', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'ABCDEF0123456789abcdef0123456789abcdef01');
    try {
      const result = await post(world.primary, {
        appVersion: '9.9.9-forged',
        version: '9.9.9-forged',
        events: [{ type: 'send_latency', durationMs: 10, appVersion: '9.9.9-forged', version: '9.9.9-forged' }],
      });
      expect(result.status).toBe(202);
      const [line] = metricLines();
      expect(line.appVersion).toBe(`${packageJson.version}+abcdef012345`);
      expect(allOutput()).not.toContain('forged');
    } finally {
      vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    }
  });

  it('drops unknown fields, free text, invalid enums, and out-of-range numbers', async () => {
    const freeText = 'FREE-TEXT-SENTINEL olá mensagem secreta';
    const leaks = [
      freeText,
      'forged-version-7.7.7',
      'NOT-AN-ENUM-SENTINEL',
      '123456789012345',
      '86400000000',
      'javascript:alert',
    ];
    const now = Date.now();
    const result = await post(world.primary, {
      userId: world.primary.appUserId,
      appVersion: 'forged-version-7.7.7',
      events: [
        // Valid events carrying extra fields: logged without the extras.
        {
          type: 'send_latency',
          durationMs: 100,
          userId: world.primary.appUserId,
          conversationId: world.groupConversationId,
          content: freeText,
          email: world.primary.email,
          appVersion: 'forged-version-7.7.7',
          ts: 'forged',
          schema: 'forged',
          nested: { text: freeText },
        },
        { type: 'send_outcome', reason: 'expired', label: freeText },
        // Invalid events: dropped whole.
        { type: 'NOT-AN-ENUM-SENTINEL', durationMs: 5 },
        { type: 'send_outcome', reason: freeText },
        { type: 'send_outcome', reason: 'error' }, // a stream reason, not a send reason
        { type: 'send_outcome', reason: 'delivered', conversationType: 'NOT-AN-ENUM-SENTINEL' },
        { type: 'send_latency', durationMs: -1 },
        { type: 'send_latency', durationMs: 1.5 },
        { type: 'send_latency', durationMs: '100' },
        { type: 'send_latency', durationMs: 123456789012345 },
        { type: 'send_latency', durationMs: messagingMetricsMaxDurationMs(now) + 60_000 },
        { type: 'send_latency' }, // missing required duration
        { type: 'send_outcome' }, // missing required reason
        { type: 'polling_stop', durationMs: 1000, count: MESSAGING_METRICS_MAX_COUNT + 1 },
        { type: 'list_stream_drop', reason: 'closed', conversationType: 'group' }, // not allowed for the list stream
        { type: 'send_outcome', reason: 'delivered', durationMs: 5 }, // duration not allowed here
        { type: 'send_latency', durationMs: 5, occurredAt: now - 86400000000 },
        { type: 'send_latency', durationMs: 5, occurredAt: now + MESSAGING_METRICS_MAX_CLOCK_SKEW_MS + 3_600_000 },
        { type: 'send_latency', durationMs: 5, occurredAt: 'javascript:alert' },
        freeText,
        null,
        42,
        [{ type: 'send_latency', durationMs: 5 }],
      ],
    });

    expect(result.status, JSON.stringify(result.body)).toBe(202);
    expect(result.body).toEqual({ accepted: 2, dropped: 21 });
    const lines = metricLines();
    expect(lines).toEqual([
      expect.objectContaining({ type: 'send_latency', durationMs: 100 }),
      expect.objectContaining({ type: 'send_outcome', reason: 'expired' }),
    ]);
    lines.forEach(expectBr013Line);
    expectNoSensitiveOutput(leaks);
  });

  it('accepts exactly 50 events and rejects 51 without logging', async () => {
    const event = { type: 'polling_start' };
    const ok = await post(world.primary, { events: Array.from({ length: 50 }, () => event) });
    expect(ok.status).toBe(202);
    expect(ok.body).toEqual({ accepted: 50, dropped: 0 });
    expect(metricLines()).toHaveLength(50);

    captured.length = 0;
    const tooMany = await post(world.primary, { events: Array.from({ length: 51 }, () => event) });
    expect(tooMany.status).toBe(413);
    expect(tooMany.body.code).toBe('METRICS_BATCH_TOO_LARGE');
    expectNoMetricOutput();
  });

  it('accepts a body of exactly 16 KB and rejects larger bodies, declared or chunked', async () => {
    const base = JSON.stringify({ events: [{ type: 'polling_start' }], pad: '' });
    const atLimit = JSON.stringify({ events: [{ type: 'polling_start' }], pad: 'x'.repeat(MESSAGING_METRICS_MAX_BYTES - base.length) });
    expect(new TextEncoder().encode(atLimit).byteLength).toBe(MESSAGING_METRICS_MAX_BYTES);
    const overLimit = JSON.stringify({ events: [{ type: 'polling_start' }], pad: 'x'.repeat(MESSAGING_METRICS_MAX_BYTES - base.length + 1) });

    const ok = await call(world.primary, jsonRequest(atLimit));
    expect(ok.status, JSON.stringify(ok.body)).toBe(202);
    expect(metricLines()).toHaveLength(1);

    const okStreamed = streamedRequest(atLimit);
    const okStreamedResult = await call(world.primary, okStreamed.request);
    expect(okStreamedResult.status, JSON.stringify(okStreamedResult.body)).toBe(202);
    expect(okStreamed.probe.pulledBytes).toBe(MESSAGING_METRICS_MAX_BYTES);
    expect(metricLines()).toHaveLength(2);

    captured.length = 0;
    // No Content-Length header on an in-memory body: counted while reading.
    const undeclared = await call(world.primary, jsonRequest(overLimit));
    expect(undeclared.status).toBe(413);
    expect(undeclared.body.code).toBe('METRICS_PAYLOAD_TOO_LARGE');

    // Declared Content-Length over the limit: refused without reading a byte.
    const declared = streamedRequest(overLimit, 1024, { 'content-length': String(MESSAGING_METRICS_MAX_BYTES + 1) });
    const declaredResult = await call(world.primary, declared.request);
    expect(declaredResult.status).toBe(413);
    expect(declaredResult.body.code).toBe('METRICS_PAYLOAD_TOO_LARGE');
    expect(declared.probe.pulledBytes).toBe(0);
    expect(declared.probe.cancelled).toBe(true);

    // Understated Content-Length: the received bytes still decide.
    const understated = streamedRequest(overLimit, 1024, { 'content-length': '10' });
    const understatedResult = await call(world.primary, understated.request);
    expect(understatedResult.status).toBe(413);
    expect(understatedResult.body.code).toBe('METRICS_PAYLOAD_TOO_LARGE');
    expect(understated.probe.cancelled).toBe(true);

    // Chunked: no Content-Length, counted on the bytes received.
    const chunked = streamedRequest(overLimit);
    const chunkedResult = await call(world.primary, chunked.request);
    expect(chunkedResult.status).toBe(413);
    expect(chunkedResult.body.code).toBe('METRICS_PAYLOAD_TOO_LARGE');
    expect(chunked.probe.cancelled).toBe(true);

    // Multi-byte characters count as bytes, not characters.
    const multiByte = JSON.stringify({ events: [{ type: 'polling_start' }], pad: 'é'.repeat(MESSAGING_METRICS_MAX_BYTES / 2) });
    expect(multiByte.length).toBeLessThan(MESSAGING_METRICS_MAX_BYTES);
    const wide = streamedRequest(multiByte);
    expect((await call(world.primary, wide.request)).status).toBe(413);
    expect(wide.probe.cancelled).toBe(true);

    // A 4 MB chunked body is cut off right after the limit: the reader is
    // cancelled and pulls at most one chunk beyond 16 KB, never the whole body.
    const hugeChunk = 4096;
    const huge = streamedRequest(JSON.stringify({ events: [], pad: 'y'.repeat(4 * 1024 * 1024) }), hugeChunk);
    const hugeResult = await call(world.primary, huge.request);
    expect(hugeResult.status).toBe(413);
    expect(huge.probe.cancelled).toBe(true);
    expect(huge.probe.pulledBytes).toBeGreaterThan(MESSAGING_METRICS_MAX_BYTES);
    expect(huge.probe.pulledBytes).toBeLessThanOrEqual(MESSAGING_METRICS_MAX_BYTES + hugeChunk);

    expectNoMetricOutput();
  });

  it('rejects non-JSON content types and malformed bodies without logging', async () => {
    const textPlain = await call(
      world.primary,
      new NextRequest(PATH, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ events: [{ type: 'polling_start' }] }),
      }),
    );
    expect(textPlain.status).toBe(415);
    const malformed = await call(world.primary, jsonRequest('{"events": [ {"type": "polling_start"'));
    expect(malformed.status).toBe(400);
    const notArray = await post(world.primary, { events: { type: 'polling_start' } });
    expect(notArray.status).toBe(400);
    const array = await post(world.primary, [{ type: 'polling_start' }]);
    expect(array.status).toBe(400);
    expectNoMetricOutput();
    // Every authenticated request is charged, rejected ones included.
    expect(await counter(world.primary)).toBe(4);
  });

  it('rejects requests over the per-user budget without logging; other users are unaffected', async () => {
    await ensureWindowHeadroom();
    await fill(world.primary, BUDGET - 1);
    const last = await post(world.primary, { events: [{ type: 'polling_start' }] });
    expect(last.status).toBe(202);
    expect(metricLines()).toHaveLength(1);

    captured.length = 0;
    const over = await post(world.primary, { events: [{ type: 'polling_start' }] });
    expect(over.status).toBe(429);
    expect(over.body.code).toBe('rate_limited');
    // Oversized requests are charged too and still refused by the budget.
    const overOversized = await post(world.primary, { events: Array.from({ length: 51 }, () => ({ type: 'polling_start' })) });
    expect(overOversized.status).toBe(429);
    expectNoMetricOutput();

    const other = await post(world.secondary, { events: [{ type: 'polling_start' }] });
    expect(other.status).toBe(202);
    expect(metricLines()).toHaveLength(1);
  });

  it('fails closed when the limiter cannot be checked', async () => {
    await world.query(REVOKE_LIMITER);
    try {
      const result = await post(world.primary, { events: VALID_EVENTS });
      expect(result.status).toBe(429);
      expect(result.body.code).toBe('rate_limited');
      expectNoMetricOutput();
    } finally {
      await world.query(RESTORE_LIMITER);
    }
    const restored = await post(world.primary, { events: [{ type: 'polling_start' }] });
    expect(restored.status).toBe(202);
  });

  it('fails closed with 429 when the limiter client cannot be built (no service-role key)', async () => {
    // The real server environment without the key: authentication (anon key +
    // session) still succeeds, but the service-role limiter client cannot be
    // constructed, so the budget cannot be checked.
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    try {
      const result = await post(world.primary, { events: VALID_EVENTS });
      expect(result.status, JSON.stringify(result.body)).toBe(429);
      expect(result.body.code).toBe('rate_limited');
      expectNoMetricOutput();
      expect(await counter(world.primary)).toBe(0);
    } finally {
      useLocalSupabaseEnv();
    }
    const restored = await post(world.primary, { events: [{ type: 'polling_start' }] });
    expect(restored.status).toBe(202);
    expect(await counter(world.primary)).toBe(1);
  });

  it('rejects unauthenticated requests without a metric line or a charge', async () => {
    const result = await post(null, { events: VALID_EVENTS });
    expect(result.status).toBe(401);
    const forged = await call(
      null,
      new NextRequest(PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer not-a-token' },
        body: JSON.stringify({ events: VALID_EVENTS }),
      }),
    );
    expect(forged.status).toBe(401);
    expectNoMetricOutput();
    const [{ total }] = await world.query<{ total: string }>(
      `select coalesce(sum(count), 0)::text as total from private.rate_limit_counters where action = $1
       and user_id = any($2::uuid[])`,
      [ACTION, [world.primary.appUserId, world.secondary.appUserId, world.outsider.appUserId]],
    );
    expect(Number(total)).toBe(0);
  });
});
