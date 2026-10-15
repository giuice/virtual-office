// Meeting-notes fake AI server (T16, TEST-ONLY): a plain node:http server on
// 127.0.0.1 that speaks each provider's API (protocols.ts), records every
// provider request (credential headers reduced to their last 4 characters),
// and answers with outcomes scripted per test through `/__control/*`
// (control-client.ts). It replaces ONLY the external provider; started
// in-process by the Vitest DB suite and the Playwright E2E runner.
//
// Control API (JSON):
//   GET  /__control/health                      → {ok:true}
//   POST /__control/script   {provider, outcomes[]} → append to the provider's FIFO queue
//   POST /__control/default  {provider, outcome|null} → outcome used when the queue is empty
//   POST /__control/release  {provider?}         → deliver held `pause` requests ({released})
//   GET  /__control/requests[?provider=]        → {requests, received}
//   GET  /__control/state                       → {received, queued, defaults, held}
//   POST /__control/reset                       → clear queues, defaults, records; destroy held sockets
// A request with nothing scripted (empty queue, no default) is answered 500 in
// the provider envelope with a "no scripted outcome" message, recorded as 'unscripted'.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import {
  FAKE_AI_PROVIDERS,
  FAKE_AI_PROVIDER_PATHS,
  MEETING_NOTES_FAKE_AI_HOST,
  meetingNotesFakeAiPort,
  type FakeAiOutcome,
  type FakeAiOutcomeKind,
  type FakeAiProvider,
  type FakeAiRecordedRequest,
  type FakeAiRequestsResponse,
  type FakeAiStateResponse,
} from './config';
import {
  sendErrorEnvelope,
  sendModelOutput,
  sendRaw,
  sendStreamErrorAfterStart,
  type FakeAiReplyContext,
} from './protocols';

export interface MeetingNotesFakeAiServer {
  baseUrl: string;
  port: number;
  /** Destroys held and open sockets, clears timers, and stops listening. */
  close(): Promise<void>;
}

interface HeldRequest {
  kind: 'paused' | 'timeout';
  ctx: FakeAiReplyContext;
  record: FakeAiRecordedRequest;
  then?: FakeAiOutcome;
}

const OUTCOME_KINDS: ReadonlySet<string> = new Set<FakeAiOutcomeKind>([
  'success',
  'error_after_processing',
  'timeout',
  'refusal',
  'malformed_json',
  'rejection',
  'status',
  'stream_error_after_start',
  'drop_after_accept',
  'pause',
]);

/** Header names whose value is a credential: only presence + last 4 characters are recorded. */
const CREDENTIAL_HEADER = /^(authorization|proxy-authorization|x-api-key|api-key|cookie|x-goog-api-key)$|token|secret|api-key/i;
const CREDENTIAL_PRIORITY = ['x-api-key', 'authorization', 'api-key'];
const MAX_BODY_BYTES = 50 * 1024 * 1024;
const DEFAULT_MALFORMED_TEXT = '{"summary": {"keyPoints": ["The team agreed to ship on Friday"], "decisions": [';

class ControlError extends Error {}

function providerRecord<T>(make: () => T): Record<FakeAiProvider, T> {
  return { anthropic: make(), openai: make(), kimi: make(), glm: make() };
}

function isProvider(value: unknown): value is FakeAiProvider {
  return typeof value === 'string' && (FAKE_AI_PROVIDERS as readonly string[]).includes(value);
}

function assertOutcome(value: unknown, label: string): FakeAiOutcome {
  const kind = (value as { kind?: unknown } | null)?.kind;
  if (typeof value !== 'object' || value === null || typeof kind !== 'string' || !OUTCOME_KINDS.has(kind)) {
    throw new ControlError(`${label}: not a fake AI outcome (kind must be one of ${[...OUTCOME_KINDS].join(', ')})`);
  }
  const outcome = value as FakeAiOutcome;
  if ((outcome.kind === 'rejection' || outcome.kind === 'status') && !Number.isInteger(outcome.status)) {
    throw new ControlError(`${label}: '${outcome.kind}' needs an integer status`);
  }
  if (outcome.kind === 'pause' && outcome.then !== undefined) assertOutcome(outcome.then, `${label}.then`);
  return outcome;
}

function redactCredential(value: string): { redacted: string; last4: string } {
  const secret = value.trim().replace(/^(bearer|basic)\s+/i, '');
  // Never store a whole secret: short values keep no characters at all.
  const last4 = secret.length > 8 ? secret.slice(-4) : '';
  return { redacted: `[redacted …${last4}]`, last4 };
}

function recordHeaders(req: IncomingMessage): Pick<FakeAiRecordedRequest, 'headers' | 'credential'> {
  const headers: Record<string, string> = {};
  const credentials = new Map<string, string>();
  for (const [name, raw] of Object.entries(req.headers)) {
    if (raw === undefined) continue;
    const value = Array.isArray(raw) ? raw.join(', ') : raw;
    if (CREDENTIAL_HEADER.test(name)) {
      const { redacted, last4 } = redactCredential(value);
      headers[name] = redacted;
      credentials.set(name, last4);
    } else {
      headers[name] = value;
    }
  }
  const header = CREDENTIAL_PRIORITY.find((name) => credentials.has(name));
  return { headers, credential: header ? { header, last4: credentials.get(header) ?? '' } : null };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendControlJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload).toString() });
  res.end(payload);
}

function providerForPath(path: string): FakeAiProvider | null {
  return FAKE_AI_PROVIDERS.find((provider) => FAKE_AI_PROVIDER_PATHS[provider] === path) ?? null;
}

function providerForPrefix(path: string): FakeAiProvider | null {
  return FAKE_AI_PROVIDERS.find((provider) => path.startsWith(`/${provider}/`)) ?? null;
}

class FakeAiServerState {
  private queues = providerRecord<FakeAiOutcome[]>(() => []);
  private defaults = providerRecord<FakeAiOutcome | null>(() => null);
  private records: FakeAiRecordedRequest[] = [];
  private held = new Set<HeldRequest>();
  private timers = new Set<NodeJS.Timeout>();
  private seq = 0;
  closing = false;

  // ------------------------------------------------------------------ control

  handleControl(method: string, path: string, query: URLSearchParams, body: unknown, res: ServerResponse): void {
    const route = `${method} ${path}`;
    const input = (body ?? {}) as Record<string, unknown>;
    switch (route) {
      case 'GET /__control/health':
        return sendControlJson(res, 200, { ok: true });
      case 'POST /__control/script': {
        const provider = this.requireProvider(input.provider);
        if (!Array.isArray(input.outcomes) || input.outcomes.length === 0) {
          throw new ControlError('outcomes must be a non-empty array');
        }
        const outcomes = input.outcomes.map((value, i) => assertOutcome(value, `outcomes[${i}]`));
        this.queues[provider].push(...outcomes);
        return sendControlJson(res, 200, { queued: this.queues[provider].length });
      }
      case 'POST /__control/default': {
        const provider = this.requireProvider(input.provider);
        this.defaults[provider] = input.outcome == null ? null : assertOutcome(input.outcome, 'outcome');
        return sendControlJson(res, 200, { ok: true });
      }
      case 'POST /__control/release': {
        const provider = input.provider === undefined ? null : this.requireProvider(input.provider);
        return sendControlJson(res, 200, { released: this.release(provider) });
      }
      case 'GET /__control/requests': {
        const filter = query.get('provider');
        const requests = filter ? this.records.filter((record) => record.provider === filter) : this.records;
        const response: FakeAiRequestsResponse = { requests, received: this.receivedCounts() };
        return sendControlJson(res, 200, response);
      }
      case 'GET /__control/state':
        return sendControlJson(res, 200, this.snapshot());
      case 'POST /__control/reset': {
        const dropped = this.reset();
        return sendControlJson(res, 200, { ok: true, dropped });
      }
      default:
        return sendControlJson(res, 404, { error: `unknown control route ${route}` });
    }
  }

  private requireProvider(value: unknown): FakeAiProvider {
    if (!isProvider(value)) throw new ControlError(`provider must be one of ${FAKE_AI_PROVIDERS.join(', ')}`);
    return value;
  }

  private receivedCounts(): Record<FakeAiProvider, number> {
    const counts = providerRecord(() => 0);
    for (const record of this.records) if (record.provider) counts[record.provider] += 1;
    return counts;
  }

  private snapshot(): FakeAiStateResponse {
    const paused = providerRecord(() => 0);
    const timeout = providerRecord(() => 0);
    for (const entry of this.held) (entry.kind === 'paused' ? paused : timeout)[entry.ctx.provider] += 1;
    return {
      received: this.receivedCounts(),
      queued: {
        anthropic: this.queues.anthropic.length,
        openai: this.queues.openai.length,
        kimi: this.queues.kimi.length,
        glm: this.queues.glm.length,
      },
      defaults: {
        anthropic: this.defaults.anthropic?.kind ?? null,
        openai: this.defaults.openai?.kind ?? null,
        kimi: this.defaults.kimi?.kind ?? null,
        glm: this.defaults.glm?.kind ?? null,
      },
      held: { paused, timeout },
    };
  }

  /** Clears scripts and records; destroys every held socket. Returns how many were dropped. */
  reset(): number {
    const dropped = this.dropHeld();
    this.queues = providerRecord<FakeAiOutcome[]>(() => []);
    this.defaults = providerRecord<FakeAiOutcome | null>(() => null);
    this.records = [];
    this.seq = 0;
    return dropped;
  }

  dropHeld(): number {
    const count = this.held.size;
    for (const entry of this.held) entry.ctx.res.socket?.destroy();
    this.held.clear();
    return count;
  }

  clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private sleep(ms: number | undefined): Promise<void> {
    if (!ms || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        resolve();
      }, ms);
      this.timers.add(timer);
    });
  }

  private release(provider: FakeAiProvider | null): number {
    const entries = [...this.held].filter((entry) => entry.kind === 'paused' && (!provider || entry.ctx.provider === provider));
    for (const entry of entries) {
      this.held.delete(entry);
      const next = entry.then ?? this.nextOutcome(entry.ctx.provider);
      entry.record.releasedAs = next?.kind ?? 'unscripted';
      void this.execute(entry.ctx, entry.record, next);
    }
    return entries.length;
  }

  // ---------------------------------------------------------------- provider

  private nextOutcome(provider: FakeAiProvider): FakeAiOutcome | null {
    return this.queues[provider].shift() ?? this.defaults[provider];
  }

  async handleProvider(req: IncomingMessage, res: ServerResponse, path: string, raw: Buffer): Promise<void> {
    const provider = req.method === 'POST' ? providerForPath(path) : null;
    let body: unknown = null;
    let bodyParseError: string | undefined;
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch (err) {
        bodyParseError = (err as Error).message;
      }
    }
    const bodyObject = (body !== null && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const stream = bodyObject.stream === true;
    const record: FakeAiRecordedRequest = {
      seq: ++this.seq,
      receivedAt: new Date().toISOString(),
      method: req.method ?? '',
      path,
      url: req.url ?? path,
      provider,
      ...recordHeaders(req),
      body,
      ...(bodyParseError !== undefined ? { bodyParseError } : {}),
      bodyBytes: raw.length,
      stream,
      outcome: 'not_found',
    };
    this.records.push(record);

    const envelopeProvider = provider ?? providerForPrefix(path);
    const ctx: FakeAiReplyContext = {
      provider: envelopeProvider ?? 'openai',
      res,
      model: typeof bodyObject.model === 'string' ? bodyObject.model : 'unknown-model',
      stream,
      includeUsage: (bodyObject.stream_options as { include_usage?: unknown } | undefined)?.include_usage === true,
      seq: record.seq,
      bodyBytes: raw.length,
    };

    if (!provider) {
      const message = `Fake AI server: no route for ${req.method} ${path}`;
      if (envelopeProvider) sendErrorEnvelope(ctx, 404, { message });
      else sendControlJson(res, 404, { error: { message } });
      return;
    }

    const outcome = this.nextOutcome(provider);
    record.outcome = outcome?.kind ?? 'unscripted';
    await this.execute(ctx, record, outcome);
  }

  private hold(entry: HeldRequest): void {
    this.held.add(entry);
    entry.ctx.res.on('close', () => this.held.delete(entry));
  }

  private async execute(ctx: FakeAiReplyContext, record: FakeAiRecordedRequest, outcome: FakeAiOutcome | null): Promise<void> {
    const { res } = ctx;
    if (!outcome) {
      sendErrorEnvelope(ctx, 500, { message: `Fake AI server: no scripted outcome for ${ctx.provider} (request ${record.seq})` });
      return;
    }
    if (outcome.kind === 'timeout') {
      this.hold({ kind: 'timeout', ctx, record });
      return;
    }
    if (outcome.kind === 'pause') {
      this.hold({ kind: 'paused', ctx, record, then: outcome.then });
      return;
    }

    await this.sleep(outcome.delayMs);
    if (this.closing || res.destroyed || res.writableEnded) return;

    switch (outcome.kind) {
      case 'success': {
        const holdOpen = outcome.holdOpen === true && ctx.stream;
        sendModelOutput(ctx, {
          text: typeof outcome.draft === 'string' ? outcome.draft : JSON.stringify(outcome.draft),
          finish: 'end',
          usage: outcome.usage,
          includeThinking: outcome.includeThinking,
          holdOpen,
        });
        // A stalled stream is held like a timeout: reset/close destroys its socket.
        if (holdOpen) this.hold({ kind: 'timeout', ctx, record });
        return;
      }
      case 'error_after_processing':
        return sendErrorEnvelope(ctx, outcome.status ?? 500, outcome);
      case 'refusal':
        return sendModelOutput(ctx, {
          text: '',
          finish: 'refusal',
          refusalMessage: outcome.message,
          finishReason: outcome.finishReason,
        });
      case 'malformed_json':
        return sendModelOutput(ctx, {
          text: outcome.text ?? DEFAULT_MALFORMED_TEXT,
          finish: outcome.truncated ? 'length' : 'end',
        });
      case 'rejection':
        return sendErrorEnvelope(ctx, outcome.status, outcome);
      case 'status':
        return sendRaw(res, outcome.status, outcome.body, outcome.contentType, outcome.headers);
      case 'stream_error_after_start':
        return sendStreamErrorAfterStart(ctx, outcome, outcome.abrupt === true);
      case 'drop_after_accept':
        res.socket?.destroy();
        return;
    }
  }
}

/**
 * Starts the fake on 127.0.0.1 (port: option, else MEETING_NOTES_FAKE_AI_PORT,
 * else 54399). Fails loudly when the port is taken.
 */
export async function startMeetingNotesFakeAiServer(options: { port?: number } = {}): Promise<MeetingNotesFakeAiServer> {
  const port = options.port ?? meetingNotesFakeAiPort();
  const state = new FakeAiServerState();

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://${MEETING_NOTES_FAKE_AI_HOST}`);
      let raw: Buffer;
      try {
        raw = await readBody(req);
      } catch {
        res.socket?.destroy();
        return;
      }
      if (url.pathname.startsWith('/__control/')) {
        try {
          const body = raw.length > 0 ? (JSON.parse(raw.toString('utf8')) as unknown) : null;
          state.handleControl(req.method ?? 'GET', url.pathname, url.searchParams, body, res);
        } catch (err) {
          const status = err instanceof ControlError || err instanceof SyntaxError ? 400 : 500;
          sendControlJson(res, status, { error: (err as Error).message });
        }
        return;
      }
      try {
        await state.handleProvider(req, res, url.pathname, raw);
      } catch (err) {
        if (!res.headersSent) sendControlJson(res, 500, { error: { message: `Fake AI server failure: ${(err as Error).message}` } });
        else res.socket?.destroy();
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      reject(
        new Error(
          err.code === 'EADDRINUSE'
            ? `Meeting-notes fake AI server: ${MEETING_NOTES_FAKE_AI_HOST}:${port} is already in use ` +
                '(another test run or an orphaned process?). Free it or set MEETING_NOTES_FAKE_AI_PORT.'
            : `Meeting-notes fake AI server failed to listen on ${MEETING_NOTES_FAKE_AI_HOST}:${port}: ${err.message}`
        )
      );
    };
    server.once('error', onError);
    server.listen(port, MEETING_NOTES_FAKE_AI_HOST, () => {
      server.off('error', onError);
      resolve();
    });
  });

  let closed: Promise<void> | null = null;
  return {
    baseUrl: `http://${MEETING_NOTES_FAKE_AI_HOST}:${port}`,
    port,
    close() {
      closed ??= new Promise<void>((resolve, reject) => {
        state.closing = true;
        state.dropHeld();
        state.clearTimers();
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
      });
      return closed;
    },
  };
}
