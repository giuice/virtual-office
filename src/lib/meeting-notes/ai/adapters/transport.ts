// src/lib/meeting-notes/ai/adapters/transport.ts
// Shared transport guard of the meeting-note provider adapters (Phase 6 T11).
// Every SDK client gets `fetch: createDispatchFetch(state, credential)` and
// `maxRetries: 0`; the wrapper:
//   * refuses a second outbound request on the same call (exactly one request
//     per call, even if an SDK tried to retry);
//   * refuses to send when the signal is already aborted (never sent);
//   * never follows a redirect (`redirect: 'manual'`): a 3xx from the provider
//     or a gateway IS the initial response and is classified like any other
//     non-2xx (not a listed rejection → counted), so no second request is
//     made and no credential is forwarded to another origin;
//   * rebuilds the outgoing headers from an allowlist and sets ONLY the
//     admitted credential: whatever the SDKs pick up from the server
//     environment (ANTHROPIC_CUSTOM_HEADERS / OPENAI_CUSTOM_HEADERS, ambient
//     keys or tokens, organization/project ids) never leaves the server;
//   * records whether the request was handed to the network (`dispatched`),
//     whether the connection was refused / the host did not resolve (no byte
//     can have reached the provider), and the INITIAL response status plus a
//     bounded copy of a non-2xx body for FR-022 classification — so counting
//     never depends on SDK error parsing or on provider text.
// createRequestControl joins the caller's AbortSignal with the adapter's own
// deadline (the SDK's timeout stops at response headers; the deadline also
// covers the streamed body).
import 'server-only';

import type { MeetingNoteAiProvider } from '@/types/meeting-notes';

import {
  classifyMeetingNoteAiPreProcessingRejection,
  type MeetingNoteAiModelCapability,
  type MeetingNoteAiReasoningLevel,
} from '../capabilities';
import {
  meetingNoteAiFailure,
  meetingNoteAiRejectionFailure,
  type MeetingNoteAiDraftFailure,
  type MeetingNoteAiUsageReport,
} from '../provider-errors';

type FetchInput = string | URL | Request;

export interface MeetingNoteAiDispatchState {
  dispatched: boolean;
  /** Connection refused or DNS failure before any request byte could leave. */
  unreachable: boolean;
  /** Status of the provider's initial response, once headers arrived. */
  initialStatus: number | null;
  /** Parsed JSON of a non-2xx initial body (≤64 KB), else null. */
  initialErrorBody: unknown;
}

export function createDispatchState(): MeetingNoteAiDispatchState {
  return { dispatched: false, unreachable: false, initialStatus: null, initialErrorBody: null };
}

const MAX_ERROR_BODY_BYTES = 64 * 1024;
/** Error codes that prove the TCP connection was never established. */
const UNREACHABLE_CODES: ReadonlySet<string> = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

function abortError(): Error {
  const error = new Error('The meeting-note AI request was aborted before it was sent.');
  error.name = 'AbortError';
  return error;
}

/** Walks `cause` links (undici wraps socket errors as `TypeError: fetch failed`). */
function isUnreachableError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && UNREACHABLE_CODES.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ERROR_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

/** The credential admitted with the operation, and how the provider expects it. */
export interface MeetingNoteAiAdmittedCredential {
  scheme: 'x-api-key' | 'bearer';
  apiKey: string;
}

/**
 * Request headers the SDKs legitimately send besides the credential. Every
 * other header — including any credential-bearing one — is dropped.
 */
const ALLOWED_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  'accept',
  'content-type',
  'user-agent',
  'anthropic-version',
  'x-stainless-arch',
  'x-stainless-helper-method',
  'x-stainless-lang',
  'x-stainless-os',
  'x-stainless-package-version',
  'x-stainless-retry-count',
  'x-stainless-runtime',
  'x-stainless-runtime-version',
  'x-stainless-timeout',
]);

function outgoingHeaders(source: HeadersInit | undefined, credential: MeetingNoteAiAdmittedCredential): Headers {
  const headers = new Headers();
  for (const [name, value] of new Headers(source)) {
    if (ALLOWED_REQUEST_HEADERS.has(name)) headers.set(name, value);
  }
  if (credential.scheme === 'x-api-key') headers.set('x-api-key', credential.apiKey);
  else headers.set('authorization', `Bearer ${credential.apiKey}`);
  return headers;
}

export function createDispatchFetch(
  state: MeetingNoteAiDispatchState,
  credential: MeetingNoteAiAdmittedCredential
): (input: FetchInput, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    if (state.dispatched) throw new Error('Only one outbound request is allowed per meeting-note AI call.');
    // The SDKs pass a URL plus an init; a Request object would carry its own
    // headers past the allowlist, so it is refused before anything is sent.
    if (input instanceof Request) throw new Error('The meeting-note AI transport only accepts a URL.');
    if (init?.signal?.aborted) throw abortError();
    const guarded: RequestInit = { ...init, headers: outgoingHeaders(init?.headers, credential), redirect: 'manual' };
    state.dispatched = true;
    let response: Response;
    try {
      response = await fetch(input, guarded);
    } catch (err) {
      if (isUnreachableError(err)) state.unreachable = true;
      throw err;
    }
    state.initialStatus = response.status;
    if (!response.ok) state.initialErrorBody = await readBoundedJson(response.clone());
    return response;
  };
}

export interface MeetingNoteAiRequestControl {
  signal: AbortSignal;
  /** Why the request was aborted, if it was. */
  readonly reason: 'timeout' | 'cancelled' | null;
  dispose(): void;
}

export function createRequestControl(callerSignal: AbortSignal | undefined, timeoutMs: number): MeetingNoteAiRequestControl {
  const controller = new AbortController();
  let reason: 'timeout' | 'cancelled' | null = null;
  const onCallerAbort = () => {
    reason ??= 'cancelled';
    controller.abort();
  };
  if (callerSignal?.aborted) onCallerAbort();
  else callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    reason ??= 'timeout';
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    get reason() {
      return reason;
    },
    dispose() {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

/**
 * Maps anything thrown while sending or reading the response to a failure.
 * The decision uses only the dispatch state and the abort reason:
 *   not dispatched           → never sent (cancelled before send / invalid configuration)
 *   connection refused / DNS → never sent (provider unreachable)
 *   deadline / caller abort  → counted timeout / cancellation
 *   initial non-2xx          → matrix classification (listed → refunded, else counted;
 *                              a 3xx redirect is never followed and is counted)
 *   initial 2xx              → counted: the stream had begun (mid-stream error or drop)
 *   no response yet          → counted: connection lost after the request was sent
 */
export function mapMeetingNoteAiTransportError(
  provider: MeetingNoteAiProvider,
  state: MeetingNoteAiDispatchState,
  control: MeetingNoteAiRequestControl
): MeetingNoteAiDraftFailure {
  if (!state.dispatched) {
    return control.reason
      ? meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_CANCELLED_BEFORE_SEND', false)
      : meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_CONFIGURATION_INVALID', false);
  }
  if (state.unreachable) return meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_PROVIDER_UNREACHABLE', true);
  const status = state.initialStatus;
  if (status !== null && (status < 200 || status >= 300)) {
    const category = classifyMeetingNoteAiPreProcessingRejection(provider, status, state.initialErrorBody);
    return category
      ? meetingNoteAiRejectionFailure(provider, category, status)
      : meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_PROVIDER_ERROR', true, { providerStatus: status });
  }
  if (control.reason === 'timeout') return meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_TIMEOUT', true);
  if (control.reason === 'cancelled') return meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_CANCELLED', true);
  if (status !== null) return meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_STREAM_INTERRUPTED', true);
  return meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_CONNECTION_LOST', true);
}

/**
 * Merges a capability-matrix wire fragment into a request body: plain-object
 * values are merged one level deep (Anthropic `output_config.effort` beside
 * `output_config.format`), anything else is set. The fragment holds only
 * documented provider fields, so the merged body keeps the base's type.
 */
export function mergeWireFragment<T extends object>(base: T, wire: Readonly<Record<string, unknown>>): T {
  const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(wire)) {
    const current = merged[key];
    const isPlain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
    merged[key] = isPlain(current) && isPlain(value) ? { ...current, ...value } : value;
  }
  return merged as T;
}

/** What an adapter read from a stream that ended without throwing. */
export interface MeetingNoteAiStreamOutcome {
  /** Concatenated model text (thinking/reasoning content excluded). */
  text: string;
  /**
   * end: normal stop; length: output budget reached (truncated); refusal: the
   * model or a provider filter declined; incomplete: the stream ended without
   * its stop signal; other: any other stop reason.
   */
  finish: 'end' | 'length' | 'refusal' | 'incomplete' | 'other';
  usage: MeetingNoteAiUsageReport;
}

export interface MeetingNoteAiAdapterRequest {
  provider: MeetingNoteAiProvider;
  apiKey: string;
  baseUrl: string;
  model: MeetingNoteAiModelCapability;
  level: MeetingNoteAiReasoningLevel;
  transcript: string;
  fetch: (input: FetchInput, init?: RequestInit) => Promise<Response>;
  signal: AbortSignal;
  /** SDK header timeout; kept above the adapter deadline so the deadline decides. */
  sdkTimeoutMs: number;
}
