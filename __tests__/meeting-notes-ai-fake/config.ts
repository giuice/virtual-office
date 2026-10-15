// Shared constants and wire types of the meeting-notes fake AI server (T16).
//
// TEST-ONLY. The fake replaces ONLY the external AI provider (SPEC §15): the
// database, RLS, routes, and UI stay real. Both runners start it in-process:
//   * Vitest DB suite: vitest.meeting-notes-db.config.mts → globalSetup
//     __tests__/meeting-notes-ai-fake/vitest-global-setup.ts
//   * Playwright E2E:  playwright.meeting-notes.config.ts → globalSetup
//     __tests__/meeting-notes-ai-fake/playwright-global-setup.ts
//
// App contract for T11 (server-only adapters): when
// MEETING_NOTES_AI_BASE_URL_OVERRIDE is set (and NODE_ENV is NOT
// "production" — in production the app must ignore it and log the refusal; no
// client input may set it), each provider's base URL becomes
//   `${override}/${provider}${new URL(capability.baseUrl).pathname}` (no trailing slash)
// i.e. the provider id prefixes the real API path:
//   anthropic → {override}/anthropic            (SDK appends /v1/messages)
//   openai    → {override}/openai/v1            (SDK appends /chat/completions)
//   kimi      → {override}/kimi/v1              (SDK appends /chat/completions)
//   glm       → {override}/glm/api/paas/v4      (SDK appends /chat/completions)
// OpenAI is spoken through Chat Completions only (capabilities.ts protocol
// 'openai-chat-completions'); the Responses API is not served (a request to
// /openai/v1/responses is recorded and answered 404 in the OpenAI envelope).

/** Fixed loopback port; override with MEETING_NOTES_FAKE_AI_PORT. Not used by Supabase (5432x) or Next (32xx). */
export const MEETING_NOTES_FAKE_AI_DEFAULT_PORT = 54399;
export const MEETING_NOTES_FAKE_AI_PORT_ENV = 'MEETING_NOTES_FAKE_AI_PORT';
/** Read by the app (T11) in non-production runtimes only. */
export const MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV = 'MEETING_NOTES_AI_BASE_URL_OVERRIDE';
export const MEETING_NOTES_FAKE_AI_HOST = '127.0.0.1';

export function meetingNotesFakeAiPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[MEETING_NOTES_FAKE_AI_PORT_ENV];
  if (raw === undefined || raw === '') return MEETING_NOTES_FAKE_AI_DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${MEETING_NOTES_FAKE_AI_PORT_ENV} must be an integer port in 1024–65535 (got "${raw}").`);
  }
  return port;
}

export function meetingNotesFakeAiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `http://${MEETING_NOTES_FAKE_AI_HOST}:${meetingNotesFakeAiPort(env)}`;
}

export type FakeAiProvider = 'anthropic' | 'openai' | 'kimi' | 'glm';
export const FAKE_AI_PROVIDERS: readonly FakeAiProvider[] = ['anthropic', 'openai', 'kimi', 'glm'];

/** Request paths served per provider (relative to the fake's base URL). */
export const FAKE_AI_PROVIDER_PATHS: Readonly<Record<FakeAiProvider, string>> = {
  anthropic: '/anthropic/v1/messages',
  openai: '/openai/v1/chat/completions',
  kimi: '/kimi/v1/chat/completions',
  glm: '/glm/api/paas/v4/chat/completions',
};

export interface FakeAiUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** Fields every outcome accepts. */
interface FakeAiOutcomeBase {
  /** Wait this long after reading the request body before answering ("processing"). */
  delayMs?: number;
}

/**
 * Scripted outcome of ONE provider request. Requests with `"stream": true`
 * get SSE (Anthropic events / OpenAI `data:` chunks + `[DONE]`); others JSON.
 */
export type FakeAiOutcome =
  /** 200 with `draft` (JSON-serialized, or used as-is when a string) as the model's text output. */
  | (FakeAiOutcomeBase & {
      kind: 'success';
      draft: unknown;
      usage?: FakeAiUsage;
      /** Anthropic only: prepend an empty adaptive-thinking block (default true, as Opus 5.5 always thinks). */
      includeThinking?: boolean;
      /**
       * Streaming requests only: send the whole output INCLUDING the stop signal (Anthropic
       * message_stop; OpenAI-compatible finish_reason chunk + usage, but not the [DONE]
       * terminator, after which the SDK stops reading) and never end the response — the
       * connection stalls until /__control/reset or server close (held as 'timeout').
       */
      holdOpen?: boolean;
    })
  /** Non-2xx (default 500) with the provider's normal error envelope, after reading the body. Unlisted → counted. */
  | (FakeAiOutcomeBase & {
      kind: 'error_after_processing';
      status?: number;
      errorType?: string;
      errorCode?: string;
      message?: string;
    })
  /** Read the body, never answer until /__control/reset or server close (then the socket is destroyed). */
  | { kind: 'timeout' }
  /**
   * 200 refusal. Anthropic: `stop_reason: "refusal"` + `stop_details`. OpenAI: `message.refusal`
   * with finish_reason "stop"; Kimi: finish_reason "content_filter"; GLM: finish_reason "sensitive".
   */
  | (FakeAiOutcomeBase & { kind: 'refusal'; message?: string; finishReason?: string })
  /**
   * 200 whose model text is not valid JSON. `truncated: true` → Anthropic `stop_reason: "max_tokens"`,
   * OpenAI-compatible `finish_reason: "length"`.
   */
  | (FakeAiOutcomeBase & { kind: 'malformed_json'; text?: string; truncated?: boolean })
  /** Initial non-2xx rejection with the provider's normal envelope carrying `errorType` and/or `errorCode`. */
  | (FakeAiOutcomeBase & {
      kind: 'rejection';
      status: number;
      errorType?: string;
      errorCode?: string;
      message?: string;
    })
  /** Arbitrary status and body (object → JSON, string → raw text) for unlisted statuses or non-envelope bodies. */
  | (FakeAiOutcomeBase & {
      kind: 'status';
      status: number;
      body: unknown;
      contentType?: string;
      headers?: Record<string, string>;
    })
  /**
   * 200 + some streamed output, then an error (Anthropic `event: error` with `errorType`, default
   * overloaded_error; OpenAI-compatible `data: {"error":{...}}`), or an abrupt socket close when
   * `abrupt: true`. A non-streaming request gets 200 headers + a partial JSON body, then a socket close.
   */
  | (FakeAiOutcomeBase & {
      kind: 'stream_error_after_start';
      errorType?: string;
      errorCode?: string;
      message?: string;
      abrupt?: boolean;
    })
  /** Read the whole body, record it, then destroy the socket without any response bytes. */
  | (FakeAiOutcomeBase & { kind: 'drop_after_accept' })
  /**
   * Hold the request until POST /__control/release, then deliver `then`, or (when absent) the next
   * scripted outcome for that provider (its queue, else its default).
   */
  | { kind: 'pause'; then?: FakeAiOutcome };

export type FakeAiOutcomeKind = FakeAiOutcome['kind'];

/** One request the fake received (control requests are not recorded). */
export interface FakeAiRecordedRequest {
  /** 1-based arrival order across the whole server since the last reset. */
  seq: number;
  receivedAt: string;
  method: string;
  /** Path without query string. */
  path: string;
  /** Path + query string as received. */
  url: string;
  /** null for an unknown path (answered 404). */
  provider: FakeAiProvider | null;
  /**
   * All request headers (lower-case names). Credential headers (authorization, x-api-key,
   * api-key, proxy-authorization, cookie, …) are replaced by `[redacted …<last 4 chars>]`; the
   * full value is never stored.
   */
  headers: Record<string, string>;
  /** Last 4 characters of the credential the request carried, and its header; null when none. */
  credential: { header: string; last4: string } | null;
  /** Parsed JSON body, or null when absent/unparseable (then `bodyParseError` is set). */
  body: unknown;
  bodyParseError?: string;
  bodyBytes: number;
  stream: boolean;
  /** Outcome applied (pause records 'pause'; the released outcome is appended as `releasedAs`). */
  outcome: FakeAiOutcomeKind | 'unscripted' | 'not_found';
  releasedAs?: FakeAiOutcomeKind | 'unscripted';
}

export interface FakeAiRequestsResponse {
  requests: FakeAiRecordedRequest[];
  /** Requests received per provider since the last reset ("exactly one outbound request"). */
  received: Record<FakeAiProvider, number>;
}

export interface FakeAiStateResponse {
  received: Record<FakeAiProvider, number>;
  queued: Record<FakeAiProvider, number>;
  defaults: Record<FakeAiProvider, FakeAiOutcomeKind | null>;
  /** Requests currently held open: paused (until release) and timeout (until reset/close). */
  held: { paused: Record<FakeAiProvider, number>; timeout: Record<FakeAiProvider, number> };
}
