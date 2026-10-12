import { expect, type BrowserContext, type ConsoleMessage, type Page, type WebSocketRoute } from '@playwright/test';

import { isLoopbackUrl } from './local-supabase-mode';

/**
 * Phase 5 T25 — per-stream Realtime fault harness (SPEC §15, PLAN Standing
 * rules: single-stream Phoenix frame shaping on the real socket).
 *
 * Makes ONE messaging Realtime stream of a browser context fail while every
 * other channel on the same socket (the other messaging streams, Presence,
 * Knock, spaces, …) keeps flowing untouched. The browser's own WebSocket to
 * local Realtime stays the transport: `context.routeWebSocket` opens the
 * server connection from the page with the native WebSocket and hands every
 * frame to this module, which forwards it unchanged unless it belongs to the
 * faulted stream. The app's joins, its realtime-js/Phoenix client, its
 * subscribe callbacks and its retries are the real ones; no application
 * health is set here.
 *
 * Streams (topic → stream; realtime-js prefixes every topic with `realtime:`):
 *   messages  `messaging-db-changes:<companyId>:<userId>:<seq>:<uuid>`
 *             (useMessageSubscription: messages, receipts, reactions; a new
 *             topic on every application retry, so matched by prefix)
 *   list      `conversations-changes:<userId>:<uuid>` (useConversationRealtime;
 *             a new topic on every application retry from T13, so matched by
 *             prefix; the bare `conversations-changes` of earlier builds too)
 *   typing    `conversation:<id>:typing` (useConversationTyping, the T5
 *             private topic, from T15; the same topic on every rejoin) or the
 *             public `conversation:<id>` of earlier builds
 *   presence  `company:<companyId>:presence` (observed only, never faulted)
 *
 * fail(stream, kind) — until restore(stream), every server frame of that
 * stream is withheld (the stream is dark), and:
 *   'error'   the current join gets a `phx_error` (Phoenix channel crash
 *             signal; the client sees CHANNEL_ERROR and the SDK rejoins after
 *             1/2/5/10 s); each later join attempt is forwarded to the server,
 *             its real reply withheld and an error reply returned
 *             (CHANNEL_ERROR again).
 *   'timeout' the current join gets a `phx_error` (a joined channel cannot
 *             time out: this makes the client rejoin, so the recorded sequence
 *             starts CHANNEL_ERROR); each later join attempt is forwarded and
 *             its reply withheld, so the client's own join timer (10 s) fires
 *             TIMED_OUT.
 *   'close'   REAL SERVER CLOSE: the harness sends, on the target topic only,
 *             an `access_token` push with an invalid token; local Realtime
 *             answers with its own `system` error and `phx_close` and ends the
 *             server channel. The client sees CLOSED and, being closed rather
 *             than errored, the SDK never rejoins it (terminal). A later join
 *             attempt by the application is forwarded and its reply withheld
 *             (TIMED_OUT), so the stream stays unavailable until restore.
 * A fault armed while the stream has no joined channel only shapes its next
 * joins (e.g. 'timeout' before a conversation is opened gives a pure TIMED_OUT).
 *
 * Statuses are read from the application's own subscribe callbacks: the
 * messaging debug traces `[useMessageSubscription|useConversationRealtime|
 * useConversationTyping:trace] status` (enabled by the `vo:debug:messaging`
 * flag this harness sets) and Presence's `presence-observability-v1`
 * subscription events.
 *
 * API (fixtures/messaging-phase5-faults.ts → `realtimeFaults.attach(device)`):
 *   fail(stream, kind)          arm + kick; resolves with { mark, kicked }
 *   restore(stream?)            stop shaping (all streams when omitted)
 *   status(stream)              last status reported by the app callback
 *   statuses(stream, {since})   status history ({ seq, at, status, … })
 *   waitForStatus(stream, status, {since, timeout})
 *   waitForReady(stream)        SUBSCRIBED, joined, and (postgres streams)
 *                               server-confirmed changes stream
 *   frames({stream, since, …})  frame log of the classified topics
 *   mark()                      sequence point shared by frames and statuses
 *   connections()               routed sockets (open/closed)
 *   watchPage(page)             also record another tab's callbacks
 *   redeliver(seq)              sends a passed server→page postgres_changes
 *                               frame again, unchanged, on its socket (a
 *                               duplicated delivery of a real frame)
 *   dropConnection()            T13: a whole Realtime connection drop — every
 *                               routed socket of the context is closed (both
 *                               ways) and every reconnect attempt is closed
 *                               at once until restoreConnection(); all
 *                               channels (Presence included) see their socket
 *                               go, as on a real network drop
 *   retries(stream, {since})    T13: the app's own rejoin decisions
 *                               (`[<hook>] retry` traces: status, delay, attempt)
 * Install before the page creates its Realtime socket (attach reloads the
 * page by default). Do not combine with drawer-helpers'
 * controlRealtimeConnection on the same page: Playwright applies only one
 * WebSocket route per socket.
 */

export const MESSAGING_REALTIME_STREAMS = ['messages', 'list', 'typing'] as const;
export type MessagingRealtimeStream = (typeof MESSAGING_REALTIME_STREAMS)[number];
export type ObservedRealtimeStream = MessagingRealtimeStream | 'presence';
export type RealtimeFaultKind = 'error' | 'timeout' | 'close';

/** The subscribe-callback status each fault class produces on the target. */
export const FAULT_STATUS: Record<RealtimeFaultKind, 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'> = {
  error: 'CHANNEL_ERROR',
  timeout: 'TIMED_OUT',
  close: 'CLOSED',
};

export const MESSAGING_DEBUG_FLAG_KEY = 'vo:debug:messaging';
/** Token the harness pushes to close a channel through the server (never a JWT). */
const INVALID_ACCESS_TOKEN = 't25-invalid-access-token';
const ERROR_REPLY_REASON = 't25 injected stream fault';

const TYPING_TOPIC = /^realtime:conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:typing)?$/i;
const PRESENCE_TOPIC = /^realtime:company:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:presence$/i;

export function classifyRealtimeTopic(topic: string): ObservedRealtimeStream | null {
  if (topic.startsWith('realtime:messaging-db-changes:')) return 'messages';
  if (topic === 'realtime:conversations-changes' || topic.startsWith('realtime:conversations-changes:')) return 'list';
  if (TYPING_TOPIC.test(topic)) return 'typing';
  if (PRESENCE_TOPIC.test(topic)) return 'presence';
  return null;
}

const isMessagingStream = (stream: ObservedRealtimeStream): stream is MessagingRealtimeStream =>
  stream !== 'presence';

/** Streams whose server confirms the postgres_changes stream after the join. */
const POSTGRES_STREAMS: ReadonlySet<ObservedRealtimeStream> = new Set(['messages', 'list', 'presence']);

// ---------------------------------------------------------------------------
// Phoenix frames (realtime-js protocol 2.0.0: JSON arrays, binary broadcasts)
// ---------------------------------------------------------------------------

interface PhoenixFrame {
  joinRef: string | null;
  ref: string | null;
  topic: string;
  event: string;
  payload: unknown;
  binary: boolean;
}

type FrameDirection = 'in' | 'out';

function decodeFrame(message: string | Buffer, direction: FrameDirection): PhoenixFrame | null {
  try {
    return decodeFrameUnsafe(message, direction);
  } catch {
    return null;
  }
}

function decodeFrameUnsafe(message: string | Buffer, direction: FrameDirection): PhoenixFrame | null {
  if (typeof message === 'string') {
    try {
      const frame: unknown = JSON.parse(message);
      if (Array.isArray(frame) && frame.length === 5 && typeof frame[2] === 'string' && typeof frame[3] === 'string') {
        const [joinRef, ref, topic, event, payload] = frame as [unknown, unknown, string, string, unknown];
        return {
          joinRef: typeof joinRef === 'string' ? joinRef : null,
          ref: typeof ref === 'string' ? ref : null,
          topic,
          event,
          payload,
          binary: false,
        };
      }
    } catch {
      // Not a Phoenix JSON frame.
    }
    return null;
  }
  if (message.length < 1) return null;
  const kind = message.readUInt8(0);
  // Server → client user broadcast: kind 4, [topic, event, meta] sizes, encoding.
  if (direction === 'in' && kind === 4 && message.length >= 5) {
    const topicSize = message.readUInt8(1);
    const eventSize = message.readUInt8(2);
    const offset = 5;
    return {
      joinRef: null,
      ref: null,
      topic: message.toString('utf8', offset, offset + topicSize),
      event: 'broadcast',
      payload: { event: message.toString('utf8', offset + topicSize, offset + topicSize + eventSize) },
      binary: true,
    };
  }
  // Client → server user broadcast push: kind 3, [joinRef, ref, topic, event, meta] sizes, encoding.
  if (direction === 'out' && kind === 3 && message.length >= 7) {
    const joinRefSize = message.readUInt8(1);
    const refSize = message.readUInt8(2);
    const topicSize = message.readUInt8(3);
    const eventSize = message.readUInt8(4);
    let offset = 7;
    const joinRef = message.toString('utf8', offset, offset + joinRefSize);
    offset += joinRefSize;
    const ref = message.toString('utf8', offset, offset + refSize);
    offset += refSize;
    const topic = message.toString('utf8', offset, offset + topicSize);
    offset += topicSize;
    return {
      joinRef: joinRef || null,
      ref: ref || null,
      topic,
      event: 'broadcast',
      payload: { event: message.toString('utf8', offset, offset + eventSize) },
      binary: true,
    };
  }
  return null;
}

const encodeFrame = (frame: [string | null, string | null, string, string, unknown]): string => JSON.stringify(frame);

/** Identifying, content-free summary of a frame for the log. */
function summarize(frame: PhoenixFrame): FrameDetail {
  const payload = (frame.payload ?? {}) as Record<string, unknown>;
  const detail: FrameDetail = {};
  if (typeof payload.status === 'string') detail.status = payload.status;
  if (typeof payload.extension === 'string') detail.extension = payload.extension;
  if (frame.event === 'broadcast' && typeof payload.event === 'string') detail.broadcastEvent = payload.event;
  if (frame.event === 'postgres_changes') {
    const data = (payload.data ?? {}) as Record<string, unknown>;
    if (typeof data.table === 'string') detail.table = data.table;
    if (typeof data.type === 'string') detail.type = data.type;
    const record = (data.record ?? data.old_record ?? {}) as Record<string, unknown>;
    if (typeof record.id === 'string') detail.recordId = record.id;
  }
  return detail;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface FrameDetail {
  status?: string;
  extension?: string;
  broadcastEvent?: string;
  table?: string;
  type?: string;
  recordId?: string;
}

/**
 * pass: forwarded unchanged; drop: withheld by the active fault;
 * inject: produced by the harness toward the page; inject-server: produced by
 * the harness toward the server; redeliver: a passed server frame sent to the
 * page again, byte for byte.
 */
export type FrameAction = 'pass' | 'drop' | 'inject' | 'inject-server' | 'redeliver';

export interface FrameRecord {
  seq: number;
  at: number;
  connection: number;
  direction: FrameDirection;
  stream: ObservedRealtimeStream;
  topic: string;
  event: string;
  joinRef: string | null;
  ref: string | null;
  action: FrameAction;
  detail: FrameDetail;
}

export interface StatusRecord {
  seq: number;
  at: number;
  stream: ObservedRealtimeStream;
  status: string;
  page: string;
  /** typing: the conversation of the channel. */
  conversationId?: string;
}

export interface RetryRecord {
  seq: number;
  at: number;
  stream: MessagingRealtimeStream;
  /** The failure status that led to the retry. */
  status: string;
  delay: number;
  attempt: number;
  page: string;
}

export interface ConnectionRecord {
  id: number;
  openedSeq: number;
  closedSeq: number | null;
}

export interface FaultKick {
  /** Sequence point taken just before the fault was armed. */
  mark: number;
  /** Joined channels of the stream that were kicked. */
  kicked: number;
}

export interface FrameFilter {
  stream?: ObservedRealtimeStream;
  since?: number;
  direction?: FrameDirection;
  action?: FrameAction;
  events?: readonly string[];
}

export interface RealtimeFaultController {
  fail(stream: MessagingRealtimeStream, kind: RealtimeFaultKind): Promise<FaultKick>;
  restore(stream?: MessagingRealtimeStream): number;
  activeFaults(): Array<{ stream: MessagingRealtimeStream; kind: RealtimeFaultKind; joinAttempts: number }>;
  mark(): number;
  status(stream: ObservedRealtimeStream): string | null;
  statuses(stream: ObservedRealtimeStream, options?: { since?: number }): StatusRecord[];
  waitForStatus(
    stream: ObservedRealtimeStream,
    status: string,
    options?: { since?: number; timeout?: number },
  ): Promise<StatusRecord>;
  waitForReady(stream: ObservedRealtimeStream, options?: { timeout?: number }): Promise<void>;
  frames(filter?: FrameFilter): FrameRecord[];
  /** Joined topics of the stream on the open sockets. */
  joinedTopics(stream: ObservedRealtimeStream): string[];
  connections(): ConnectionRecord[];
  /** Waits for console status values still being read from the page. */
  settle(): Promise<void>;
  watchPage(page: Page, label: string): void;
  /**
   * Sends the passed server→page postgres_changes frame `seq` again, unchanged,
   * on the same socket (same topic and payload) — a duplicated delivery of a
   * real frame. Throws if that socket is closed or the frame's channel is no
   * longer joined or was rejoined since. Returns the logged redelivery.
   */
  redeliver(seq: number): FrameRecord;
  /** Refused non-loopback Realtime hosts and frames the harness failed to handle (must stay empty). */
  violations(): string[];
  /**
   * T13: drops the whole Realtime connection: closes every open routed socket
   * (page and server sides) and closes each new connection attempt at once
   * until restoreConnection(). Returns a sequence mark taken before the drop.
   */
  dropConnection(): Promise<number>;
  /** T13: lets the next connection attempt through again. Returns a sequence mark. */
  restoreConnection(): number;
  /** T13: connection attempts closed while dropped. */
  refusedConnections(): number;
  /** T13: the application's rejoin decisions of a stream (its `retry` traces). */
  retries(stream: MessagingRealtimeStream, options?: { since?: number }): RetryRecord[];
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

interface TopicState {
  stream: ObservedRealtimeStream;
  /** Join ref (= ref) of the latest phx_join of this topic. */
  joinRef: string | null;
  joined: boolean;
  /** Latest join confirmed by the server's postgres_changes `system` ok. */
  confirmedJoinRef: string | null;
  /** Join being closed by the harness's real-server close. */
  closingJoinRef: string | null;
  /**
   * T13: join the page already left. A join and its leave sent while the
   * socket was down are both flushed on reconnect; the server handles them in
   * order, so the join's late ok reply does not make the topic joined.
   */
  leftJoinRef: string | null;
}

interface RoutedConnection {
  id: number;
  page: WebSocketRoute;
  server: WebSocketRoute;
  topics: Map<string, TopicState>;
  record: ConnectionRecord;
}

interface ActiveFault {
  kind: RealtimeFaultKind;
  since: number;
  joinAttempts: number;
}

const STATUS_TRACE = /^\[(useMessageSubscription|useConversationRealtime|useConversationTyping):trace\] status\b/;
const RETRY_TRACE = /^\[(useMessageSubscription|useConversationRealtime|useConversationTyping)\] retry\b/;
const TRACE_STREAM: Record<string, MessagingRealtimeStream> = {
  useMessageSubscription: 'messages',
  useConversationRealtime: 'list',
  useConversationTyping: 'typing',
};
const PRESENCE_EVENT_PREFIX = '{"schema":"presence-observability-v1"';

class FaultHarness implements RealtimeFaultController {
  private seq = 0;
  private readonly frameLog: FrameRecord[] = [];
  private readonly statusLog: StatusRecord[] = [];
  private readonly retryLog: RetryRecord[] = [];
  private dropped = false;
  private refusedWhileDropped = 0;
  private readonly pendingStatus = new Set<Promise<void>>();
  private readonly faults = new Map<MessagingRealtimeStream, ActiveFault>();
  private readonly routed: RoutedConnection[] = [];
  private readonly refused: string[] = [];
  private readonly internalErrors: string[] = [];
  private readonly harnessRefs = new Set<string>();
  private harnessRefCounter = 0;
  /** Raw passed postgres_changes frames by log seq (for redeliver). */
  private readonly passedChanges = new Map<number, { connection: RoutedConnection; message: string | Buffer }>();

  next(): number {
    this.seq += 1;
    return this.seq;
  }

  mark(): number {
    return this.next();
  }

  // --- routing -------------------------------------------------------------

  route(ws: WebSocketRoute): void {
    if (!isLoopbackUrl(ws.url())) {
      this.refused.push(new URL(ws.url()).host);
      void ws.close({ code: 4001, reason: 'test: only local Realtime is allowed' });
      return;
    }
    if (this.dropped) {
      // T13 whole-connection drop: the attempt never reaches the server.
      this.refusedWhileDropped += 1;
      void ws.close({ code: 4000, reason: 'test: Realtime connection dropped' });
      return;
    }
    const server = ws.connectToServer();
    const connection: RoutedConnection = {
      id: this.routed.length + 1,
      page: ws,
      server,
      topics: new Map(),
      record: { id: this.routed.length + 1, openedSeq: this.next(), closedSeq: null },
    };
    this.routed.push(connection);
    ws.onMessage((message) => this.fromPage(connection, message));
    server.onMessage((message) => this.fromServer(connection, message));
    // Setting close handlers disables Playwright's automatic forwarding:
    // forward the close both ways, unchanged.
    ws.onClose((code, reason) => {
      this.closeConnection(connection);
      void server.close({ code, reason });
    });
    server.onClose((code, reason) => {
      this.closeConnection(connection);
      void ws.close({ code, reason });
    });
  }

  private closeConnection(connection: RoutedConnection): void {
    if (connection.record.closedSeq === null) {
      connection.record.closedSeq = this.next();
    }
  }

  private topicState(connection: RoutedConnection, topic: string, stream: ObservedRealtimeStream): TopicState {
    let state = connection.topics.get(topic);
    if (!state) {
      state = { stream, joinRef: null, joined: false, confirmedJoinRef: null, closingJoinRef: null, leftJoinRef: null };
      connection.topics.set(topic, state);
    }
    return state;
  }

  private log(
    connection: RoutedConnection,
    direction: FrameDirection,
    stream: ObservedRealtimeStream,
    frame: PhoenixFrame,
    action: FrameAction,
  ): number {
    const seq = this.next();
    this.frameLog.push({
      seq,
      at: Date.now(),
      connection: connection.id,
      direction,
      stream,
      topic: frame.topic,
      event: frame.event,
      joinRef: frame.joinRef,
      ref: frame.ref,
      action,
      detail: summarize(frame),
    });
    return seq;
  }

  /** Page → server: always forwarded unchanged; joins are tracked. */
  private fromPage(connection: RoutedConnection, message: string | Buffer): void {
    connection.server.send(message);
    try {
      this.trackPageFrame(connection, message);
    } catch (error) {
      this.internalErrors.push(`page frame: ${String(error)}`);
    }
  }

  private trackPageFrame(connection: RoutedConnection, message: string | Buffer): void {
    const frame = decodeFrame(message, 'out');
    const stream = frame ? classifyRealtimeTopic(frame.topic) : null;
    if (!frame || !stream) return;
    this.log(connection, 'out', stream, frame, 'pass');
    const state = this.topicState(connection, frame.topic, stream);
    if (frame.event === 'phx_join') {
      state.joinRef = frame.ref;
      state.joined = false;
      state.confirmedJoinRef = null;
      state.closingJoinRef = null;
      state.leftJoinRef = null;
      const fault = isMessagingStream(stream) ? this.faults.get(stream) : undefined;
      if (fault) {
        fault.joinAttempts += 1;
        if (fault.kind === 'error') {
          this.injectToPage(connection, stream, [
            frame.ref,
            frame.ref,
            frame.topic,
            'phx_reply',
            { status: 'error', response: { reason: ERROR_REPLY_REASON } },
          ]);
        }
        // 'timeout' and 'close': the server's reply is withheld (fromServer).
      }
    } else if (frame.event === 'phx_leave' && frame.joinRef === state.joinRef) {
      state.joined = false;
      state.leftJoinRef = frame.joinRef;
    }
  }

  /** Server → page: forwarded unless it belongs to a faulted stream. */
  private fromServer(connection: RoutedConnection, message: string | Buffer): void {
    let forward = true;
    try {
      forward = this.shapeServerFrame(connection, message);
    } catch (error) {
      // Fail open: a frame the harness cannot handle reaches the page unchanged.
      this.internalErrors.push(`server frame: ${String(error)}`);
    }
    if (forward) connection.page.send(message);
  }

  /** Returns whether the server frame is forwarded to the page. */
  private shapeServerFrame(connection: RoutedConnection, message: string | Buffer): boolean {
    const frame = decodeFrame(message, 'in');
    const stream = frame ? classifyRealtimeTopic(frame.topic) : null;
    if (!frame || !stream) return true;
    if (frame.event === 'phx_reply' && frame.ref !== null && this.harnessRefs.has(frame.ref)) {
      // Reply to the harness's own push: never the page's business.
      this.log(connection, 'in', stream, frame, 'drop');
      return false;
    }
    const state = this.topicState(connection, frame.topic, stream);
    const fault = isMessagingStream(stream) ? this.faults.get(stream) : undefined;
    const isServerClose =
      state.closingJoinRef !== null
      && frame.joinRef === state.closingJoinRef
      && (frame.event === 'phx_close' || frame.event === 'system');
    if (fault && !isServerClose) {
      this.log(connection, 'in', stream, frame, 'drop');
      return false;
    }
    const sameJoin = frame.joinRef !== null && frame.joinRef === state.joinRef;
    if (frame.event === 'phx_reply' && frame.ref !== null && frame.ref === state.joinRef) {
      state.joined = (frame.payload as { status?: unknown } | null)?.status === 'ok' && state.leftJoinRef !== frame.ref;
    } else if ((frame.event === 'phx_close' || frame.event === 'phx_error') && sameJoin) {
      state.joined = false;
    } else if (frame.event === 'system' && sameJoin) {
      const body = (frame.payload ?? {}) as { extension?: unknown; status?: unknown };
      if (body.extension === 'postgres_changes' && body.status === 'ok') {
        state.confirmedJoinRef = frame.joinRef;
      }
    }
    const seq = this.log(connection, 'in', stream, frame, 'pass');
    if (frame.event === 'postgres_changes') {
      this.passedChanges.set(seq, { connection, message });
    }
    return true;
  }

  redeliver(seq: number): FrameRecord {
    const passed = this.passedChanges.get(seq);
    const original = this.frameLog.find((record) => record.seq === seq);
    if (!passed || !original) {
      throw new Error(`No passed postgres_changes frame #${seq} to redeliver.`);
    }
    const { connection, message } = passed;
    if (connection.record.closedSeq !== null) {
      throw new Error(`Frame #${seq} came on socket ${connection.id}, which is closed.`);
    }
    const state = connection.topics.get(original.topic);
    // postgres_changes frames carry no join ref; the topic's join must be the
    // one that was current when the frame passed (no rejoin since).
    const rejoined = this.frameLog.some(
      (record) => record.seq > seq && record.connection === connection.id && record.topic === original.topic
        && record.direction === 'out' && record.event === 'phx_join',
    );
    if (!state?.joined || rejoined) {
      throw new Error(`Frame #${seq}'s channel ${original.topic} is no longer the same joined channel.`);
    }
    connection.page.send(message);
    const frame = decodeFrame(message, 'in') as PhoenixFrame;
    const redeliveredSeq = this.log(connection, 'in', original.stream, frame, 'redeliver');
    return this.frameLog.find((record) => record.seq === redeliveredSeq) as FrameRecord;
  }

  private injectToPage(
    connection: RoutedConnection,
    stream: ObservedRealtimeStream,
    frame: [string | null, string | null, string, string, unknown],
  ): void {
    const encoded = encodeFrame(frame);
    connection.page.send(encoded);
    this.log(connection, 'in', stream, decodeFrame(encoded, 'in') as PhoenixFrame, 'inject');
  }

  private openConnections(): RoutedConnection[] {
    return this.routed.filter((connection) => connection.record.closedSeq === null);
  }

  // --- faults --------------------------------------------------------------

  async fail(stream: MessagingRealtimeStream, kind: RealtimeFaultKind): Promise<FaultKick> {
    if (this.faults.has(stream)) {
      throw new Error(`The ${stream} stream is already faulted; restore it first.`);
    }
    const mark = this.mark();
    this.faults.set(stream, { kind, since: mark, joinAttempts: 0 });
    let kicked = 0;
    for (const connection of this.openConnections()) {
      for (const [topic, state] of connection.topics) {
        if (state.stream !== stream || !state.joined || state.joinRef === null) continue;
        kicked += 1;
        if (kind === 'close') {
          // Real server close: Realtime re-validates the channel's token,
          // pushes `system` error + `phx_close`, and ends the server channel.
          this.harnessRefCounter += 1;
          const ref = `t25-close-${this.harnessRefCounter}`;
          this.harnessRefs.add(ref);
          state.closingJoinRef = state.joinRef;
          const encoded = encodeFrame([state.joinRef, ref, topic, 'access_token', { access_token: INVALID_ACCESS_TOKEN }]);
          connection.server.send(encoded);
          this.log(connection, 'out', stream, decodeFrame(encoded, 'out') as PhoenixFrame, 'inject-server');
        } else {
          state.joined = false;
          this.injectToPage(connection, stream, [state.joinRef, state.joinRef, topic, 'phx_error', {}]);
        }
      }
    }
    return { mark, kicked };
  }

  restore(stream?: MessagingRealtimeStream): number {
    if (stream) {
      this.faults.delete(stream);
    } else {
      this.faults.clear();
    }
    return this.mark();
  }

  async dropConnection(): Promise<number> {
    const mark = this.mark();
    this.dropped = true;
    await Promise.all(
      this.openConnections().map(async (connection) => {
        this.closeConnection(connection);
        await connection.page.close({ code: 4000, reason: 'test: Realtime connection dropped' }).catch(() => undefined);
        await connection.server.close({ code: 1000, reason: 'test: Realtime connection dropped' }).catch(() => undefined);
      }),
    );
    return mark;
  }

  restoreConnection(): number {
    this.dropped = false;
    return this.mark();
  }

  refusedConnections(): number {
    return this.refusedWhileDropped;
  }

  retries(stream: MessagingRealtimeStream, { since = 0 }: { since?: number } = {}): RetryRecord[] {
    return this.retryLog
      .filter((record) => record.stream === stream && record.seq > since)
      .sort((left, right) => left.seq - right.seq);
  }

  activeFaults() {
    return [...this.faults].map(([stream, fault]) => ({ stream, kind: fault.kind, joinAttempts: fault.joinAttempts }));
  }

  // --- observation ---------------------------------------------------------

  watchPage(page: Page, label: string): void {
    page.on('console', (message) => this.onConsole(message, label));
  }

  private onConsole(message: ConsoleMessage, label: string): void {
    const text = message.text();
    const retry = RETRY_TRACE.exec(text);
    if (retry) {
      const seq = this.next();
      const at = Date.now();
      const stream = TRACE_STREAM[retry[1]];
      const read = (async () => {
        const value = (await message.args()[1]?.jsonValue()) as
          | { status?: unknown; delay?: unknown; attempt?: unknown }
          | undefined;
        if (typeof value?.delay !== 'number' || typeof value.status !== 'string') return;
        this.retryLog.push({
          seq,
          at,
          stream,
          status: value.status,
          delay: value.delay,
          attempt: typeof value.attempt === 'number' ? value.attempt : -1,
          page: label,
        });
      })().catch(() => {});
      this.pendingStatus.add(read);
      void read.finally(() => this.pendingStatus.delete(read));
      return;
    }
    const trace = STATUS_TRACE.exec(text);
    if (trace) {
      const seq = this.next();
      const at = Date.now();
      const stream = TRACE_STREAM[trace[1]];
      const read = (async () => {
        const value = (await message.args()[1]?.jsonValue()) as { status?: unknown; conversationId?: unknown } | undefined;
        if (typeof value?.status !== 'string') return;
        this.statusLog.push({
          seq,
          at,
          stream,
          status: value.status,
          page: label,
          ...(typeof value.conversationId === 'string' ? { conversationId: value.conversationId } : {}),
        });
      })().catch(() => {});
      this.pendingStatus.add(read);
      void read.finally(() => this.pendingStatus.delete(read));
      return;
    }
    if (text.startsWith(PRESENCE_EVENT_PREFIX)) {
      try {
        const event = JSON.parse(text) as { category?: unknown; action?: unknown; resultCode?: unknown };
        if (event.category === 'realtime' && event.action === 'subscription' && typeof event.resultCode === 'string') {
          this.statusLog.push({ seq: this.next(), at: Date.now(), stream: 'presence', status: event.resultCode, page: label });
        }
      } catch {
        // Not a complete observability line.
      }
    }
  }

  async settle(): Promise<void> {
    await Promise.all([...this.pendingStatus]);
  }

  statuses(stream: ObservedRealtimeStream, { since = 0 }: { since?: number } = {}): StatusRecord[] {
    return this.statusLog
      .filter((record) => record.stream === stream && record.seq > since)
      .sort((left, right) => left.seq - right.seq);
  }

  status(stream: ObservedRealtimeStream): string | null {
    const all = this.statuses(stream);
    return all.length ? all[all.length - 1].status : null;
  }

  async waitForStatus(
    stream: ObservedRealtimeStream,
    status: string,
    { since = 0, timeout = 30_000 }: { since?: number; timeout?: number } = {},
  ): Promise<StatusRecord> {
    let found: StatusRecord | undefined;
    await expect
      .poll(
        () => {
          found = this.statuses(stream, { since }).find((record) => record.status === status);
          return found !== undefined;
        },
        { timeout, message: `${stream} stream reports ${status} (since #${since})` },
      )
      .toBe(true);
    return found as StatusRecord;
  }

  joinedTopics(stream: ObservedRealtimeStream): string[] {
    return this.openConnections().flatMap((connection) =>
      [...connection.topics]
        .filter(([, state]) => state.stream === stream && state.joined)
        .map(([topic]) => topic),
    );
  }

  async waitForReady(stream: ObservedRealtimeStream, { timeout = 30_000 }: { timeout?: number } = {}): Promise<void> {
    await expect
      .poll(
        () => {
          const subscribed = stream === 'presence'
            ? ['SUBSCRIBED', 'RECONNECTED'].includes(this.status(stream) ?? '')
            : this.status(stream) === 'SUBSCRIBED';
          const joined = this.openConnections().some((connection) =>
            [...connection.topics.values()].some(
              (state) =>
                state.stream === stream
                && state.joined
                && (!POSTGRES_STREAMS.has(stream) || state.confirmedJoinRef === state.joinRef),
            ),
          );
          return subscribed && joined;
        },
        { timeout, message: `${stream} stream joined, SUBSCRIBED and streaming` },
      )
      .toBe(true);
  }

  frames({ stream, since = 0, direction, action, events }: FrameFilter = {}): FrameRecord[] {
    return this.frameLog.filter(
      (record) =>
        record.seq > since
        && (stream === undefined || record.stream === stream)
        && (direction === undefined || record.direction === direction)
        && (action === undefined || record.action === action)
        && (events === undefined || events.includes(record.event)),
    );
  }

  connections(): ConnectionRecord[] {
    return this.routed.map((connection) => ({ ...connection.record }));
  }

  violations(): string[] {
    return [...this.refused.map((host) => `refused non-loopback Realtime host ${host}`), ...this.internalErrors];
  }
}

/**
 * Routes the context's Realtime sockets through a fault harness and records
 * the page's subscribe-callback statuses. With `reload` (default) the page is
 * reloaded so its socket is created under the route.
 */
export async function attachRealtimeFaultHarness(
  context: BrowserContext,
  page: Page,
  label: string,
  { reload = true }: { reload?: boolean } = {},
): Promise<RealtimeFaultController> {
  const harness = new FaultHarness();
  await context.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => harness.route(ws));
  await context.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // Storage unavailable: the dev server enables the traces by default.
    }
  }, MESSAGING_DEBUG_FLAG_KEY);
  harness.watchPage(page, label);
  if (reload && page.url() !== 'about:blank') {
    await page.reload();
  }
  return harness;
}
