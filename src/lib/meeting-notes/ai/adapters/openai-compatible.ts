// src/lib/meeting-notes/ai/adapters/openai-compatible.ts
// Chat Completions adapter for OpenAI, Kimi, and GLM (Phase 6 T11) via the
// official `openai` SDK pointed at each provider's OpenAI-compatible base URL.
// Request: model, [system prompt, ONE user message holding only the normalized
// transcript], the matrix's output-budget field (`max_completion_tokens` or
// GLM's `max_tokens`) = the model's maxOutputTokens, `response_format`
// (json_schema strict for OpenAI/Kimi, json_object for GLM — validated after
// parsing), the matrix's reasoning fragment (`reasoning_effort` or GLM's
// `thinking`), stream: true, and — OpenAI only — `stream_options.include_usage`.
// No temperature/top_p (fixed or unsupported on these reasoning models).
// Streaming: as in the Anthropic adapter, the initial response is awaited
// separately from the chunk iteration, so a `data: {"error":…}` chunk after the
// 200 is counted while an initial listed rejection can be refunded (FR-022).
import 'server-only';

import OpenAI from 'openai';
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions';
import type { ResponseFormatJSONObject, ResponseFormatJSONSchema } from 'openai/resources/shared';

import { MEETING_NOTE_AI_CAPABILITIES } from '../capabilities';
import { MEETING_NOTE_AI_DRAFT_JSON_SCHEMA, MEETING_NOTE_AI_DRAFT_SCHEMA_NAME } from '../draft-schema';
import { MEETING_NOTE_AI_SYSTEM_PROMPT } from '../prompt';
import {
  mergeWireFragment,
  type MeetingNoteAiAdapterRequest,
  type MeetingNoteAiStreamOutcome,
} from './transport';

export function buildOpenAiCompatibleDraftRequest(
  request: Pick<MeetingNoteAiAdapterRequest, 'provider' | 'model' | 'level' | 'transcript'>
): ChatCompletionCreateParamsStreaming {
  const capability = MEETING_NOTE_AI_CAPABILITIES[request.provider];
  const responseFormat: ResponseFormatJSONSchema | ResponseFormatJSONObject =
    capability.jsonOutput === 'json_schema'
      ? {
          type: 'json_schema',
          json_schema: { name: MEETING_NOTE_AI_DRAFT_SCHEMA_NAME, strict: true, schema: { ...MEETING_NOTE_AI_DRAFT_JSON_SCHEMA } },
        }
      : { type: 'json_object' };
  const base: ChatCompletionCreateParamsStreaming = {
    model: request.model.id,
    messages: [
      { role: 'system', content: MEETING_NOTE_AI_SYSTEM_PROMPT },
      { role: 'user', content: request.transcript },
    ],
    response_format: responseFormat,
    stream: true,
    ...(request.provider === 'openai' ? { stream_options: { include_usage: true } } : {}),
  };
  if (capability.outputBudgetParam === 'max_completion_tokens') base.max_completion_tokens = request.model.maxOutputTokens;
  else base.max_tokens = request.model.maxOutputTokens;
  return mergeWireFragment(base, request.level.wire);
}

function finishOf(finishReason: string | null, refused: boolean): MeetingNoteAiStreamOutcome['finish'] {
  if (refused) return 'refusal';
  switch (finishReason) {
    case null:
      return 'incomplete';
    case 'stop':
      return 'end';
    case 'length':
      return 'length';
    // OpenAI/Kimi content filter; GLM "sensitive".
    case 'content_filter':
    case 'sensitive':
      return 'refusal';
    default:
      return 'other';
  }
}

export async function runOpenAiCompatibleDraftRequest(
  request: MeetingNoteAiAdapterRequest
): Promise<MeetingNoteAiStreamOutcome> {
  const client = new OpenAI({
    apiKey: request.apiKey,
    // Explicit values stop the SDK reading OPENAI_API_KEY / ADMIN_KEY / ORG_ID /
    // PROJECT_ID / WEBHOOK_SECRET / OPENAI_LOG. The SDK still reads
    // OPENAI_CUSTOM_HEADERS, so the transport (request.fetch) rebuilds the
    // headers from an allowlist and sets only the admitted key — nothing
    // ambient reaches OpenAI, Kimi, or GLM.
    adminAPIKey: null,
    organization: null,
    project: null,
    webhookSecret: null,
    baseURL: request.baseUrl,
    maxRetries: 0,
    timeout: request.sdkTimeoutMs,
    fetch: request.fetch,
    logLevel: 'off',
  });

  // Phase 1: initial response (non-2xx and connection failures throw here).
  const stream = await client.chat.completions.create(buildOpenAiCompatibleDraftRequest(request), {
    signal: request.signal,
  });

  // Phase 2: inside an accepted response.
  let text = '';
  let refused = false;
  let finishReason: string | null = null;
  const usage: MeetingNoteAiStreamOutcome['usage'] = {};
  for await (const chunk of stream) {
    if (chunk.usage) {
      usage.inputTokens = chunk.usage.prompt_tokens;
      usage.outputTokens = chunk.usage.completion_tokens;
    }
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (typeof choice.delta?.content === 'string') text += choice.delta.content;
    if (choice.delta?.refusal) refused = true;
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }
  return { text, finish: finishOf(finishReason, refused), usage };
}
