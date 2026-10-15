// src/lib/meeting-notes/ai/adapters/anthropic.ts
// Anthropic Messages adapter (Phase 6 T11) via the official `@anthropic-ai/sdk`.
// Request: model, max_tokens = the model's maxOutputTokens, system prompt, ONE
// user message holding only the normalized transcript, `output_config` =
// { format: json_schema draft schema } merged with the matrix's reasoning
// fragment ({ effort }), stream: true. No `thinking` (adaptive is the default
// and `disabled`/`budget_tokens` are rejected on these models), no sampling
// parameters, no server-side `fallbacks` (FR-016/BR-013: no fallback to a
// model the admin did not choose).
// Streaming: the initial response (status + headers) is awaited separately
// from the event iteration, so an error that arrives after the 200 — such as
// an `overloaded_error` SSE event — is "inside an accepted response" and
// counted, while an initial 529 can be classified as a rejection (FR-022).
import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

import { MEETING_NOTE_AI_DRAFT_JSON_SCHEMA } from '../draft-schema';
import { MEETING_NOTE_AI_SYSTEM_PROMPT } from '../prompt';
import {
  mergeWireFragment,
  type MeetingNoteAiAdapterRequest,
  type MeetingNoteAiStreamOutcome,
} from './transport';

export function buildAnthropicDraftRequest(
  request: Pick<MeetingNoteAiAdapterRequest, 'model' | 'level' | 'transcript'>
): Anthropic.MessageCreateParamsStreaming {
  const base: Anthropic.MessageCreateParamsStreaming = {
    model: request.model.id,
    max_tokens: request.model.maxOutputTokens,
    system: MEETING_NOTE_AI_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: request.transcript }],
    output_config: { format: { type: 'json_schema', schema: { ...MEETING_NOTE_AI_DRAFT_JSON_SCHEMA } } },
    stream: true,
  };
  return mergeWireFragment(base, request.level.wire);
}

function finishOf(stopReason: string | null, stopped: boolean): MeetingNoteAiStreamOutcome['finish'] {
  if (!stopped || stopReason === null) return 'incomplete';
  switch (stopReason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end';
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'length';
    case 'refusal':
      return 'refusal';
    default:
      return 'other';
  }
}

export async function runAnthropicDraftRequest(request: MeetingNoteAiAdapterRequest): Promise<MeetingNoteAiStreamOutcome> {
  const client = new Anthropic({
    apiKey: request.apiKey,
    // An explicit key and a null token stop the SDK's own credential chain and
    // ANTHROPIC_AUTH_TOKEN; the SDK still reads ANTHROPIC_CUSTOM_HEADERS, so
    // the transport (request.fetch) rebuilds the headers from an allowlist and
    // sets only the admitted key. logLevel 'off' ignores ANTHROPIC_LOG.
    authToken: null,
    baseURL: request.baseUrl,
    maxRetries: 0,
    timeout: request.sdkTimeoutMs,
    fetch: request.fetch,
    logLevel: 'off',
  });

  // Phase 1: resolves once a 2xx response's headers arrived; a non-2xx
  // initial response or a connection failure throws here.
  const stream = await client.messages.create(buildAnthropicDraftRequest(request), { signal: request.signal });

  // Phase 2: everything below is inside an accepted response.
  let text = '';
  let stopReason: string | null = null;
  let stopped = false;
  const usage: MeetingNoteAiStreamOutcome['usage'] = {};
  for await (const event of stream) {
    switch (event.type) {
      case 'message_start':
        usage.inputTokens = event.message.usage.input_tokens;
        break;
      case 'content_block_delta':
        if (event.delta.type === 'text_delta') text += event.delta.text;
        break;
      case 'message_delta':
        stopReason = event.delta.stop_reason;
        usage.outputTokens = event.usage.output_tokens;
        break;
      case 'message_stop':
        stopped = true;
        break;
      default:
        break;
    }
  }
  return { text, finish: finishOf(stopReason, stopped), usage };
}
