// Provider wire shapes of the meeting-notes fake AI server (T16, test-only).
// Anthropic Messages (JSON + SSE events) and OpenAI-compatible Chat
// Completions (JSON + `data:` chunks + `[DONE]`) for openai, kimi, and glm,
// with each provider's normal error envelope as capabilities.ts expects it:
//   anthropic: {"type":"error","error":{"type","message"},"request_id"}
//   openai:    {"error":{"message","type","param","code"}}
//   kimi:      {"error":{"message","type"}}            (+ code when scripted)
//   glm:       {"error":{"code","message"}}            (business code as text; + type when scripted)
import type { ServerResponse } from 'node:http';

import type { FakeAiProvider, FakeAiUsage } from './config';

export interface FakeAiReplyContext {
  provider: FakeAiProvider;
  res: ServerResponse;
  /** Echoed `model` of the request body. */
  model: string;
  stream: boolean;
  /** OpenAI-compatible `stream_options.include_usage`. */
  includeUsage: boolean;
  seq: number;
  /** Request body size, for a default input-token estimate. */
  bodyBytes: number;
}

/** What the "model" produced. */
export interface FakeAiModelOutput {
  text: string;
  finish: 'end' | 'length' | 'refusal';
  refusalMessage?: string;
  /** OpenAI-compatible finish_reason override. */
  finishReason?: string;
  usage?: FakeAiUsage;
  includeThinking?: boolean;
  /**
   * Streaming only: write the output and its stop signal (Anthropic message_stop; OpenAI-compatible
   * finish_reason chunk + usage, without the [DONE] terminator) and never end the response.
   */
  holdOpen?: boolean;
}

export interface FakeAiErrorFields {
  errorType?: string;
  errorCode?: string;
  message?: string;
}

const ANTHROPIC_DEFAULT_ERROR_TYPES: Readonly<Record<number, string>> = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  403: 'permission_error',
  404: 'not_found_error',
  413: 'request_too_large',
  429: 'rate_limit_error',
  500: 'api_error',
  504: 'timeout_error',
  529: 'overloaded_error',
};

function messageId(ctx: FakeAiReplyContext): string {
  return ctx.provider === 'anthropic' ? `msg_fake_${ctx.seq}` : `chatcmpl-fake-${ctx.seq}`;
}

function usageOf(ctx: FakeAiReplyContext, output: FakeAiModelOutput): { input: number; output: number } {
  return {
    input: output.usage?.inputTokens ?? Math.max(1, Math.ceil(ctx.bodyBytes / 4)),
    output: output.usage?.outputTokens ?? Math.max(1, Math.ceil((output.text.length + (output.refusalMessage?.length ?? 0)) / 4)),
  };
}

function writeJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload).toString(),
    ...headers,
  });
  res.end(payload);
}

function startSse(ctx: FakeAiReplyContext): void {
  ctx.res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    ...requestIdHeader(ctx),
  });
}

function requestIdHeader(ctx: FakeAiReplyContext): Record<string, string> {
  return ctx.provider === 'anthropic' ? { 'request-id': `req_fake_${ctx.seq}` } : { 'x-request-id': `req_fake_${ctx.seq}` };
}

function sseEvent(event: string | null, data: unknown): string {
  const line = `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
  return event ? `event: ${event}\n${line}` : line;
}

/** Ends the SSE response, or (holdOpen) writes the events and leaves the connection open. */
function finishSse(ctx: FakeAiReplyContext, body: string, holdOpen: boolean): void {
  if (holdOpen) ctx.res.write(body);
  else ctx.res.end(body);
}

/** Write then destroy the socket once the bytes are flushed (abrupt close). */
function writeThenDestroy(res: ServerResponse, chunk: string): void {
  res.write(chunk, () => res.socket?.destroy());
}

/** Split text into a few deltas so clients exercise their accumulation. */
function chunksOf(text: string, parts = 3): string[] {
  if (text.length === 0) return [];
  const size = Math.max(1, Math.ceil(text.length / parts));
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export function errorEnvelope(provider: FakeAiProvider, status: number, fields: FakeAiErrorFields, seq: number): unknown {
  const message = fields.message ?? `Fake ${provider} error (${status})`;
  switch (provider) {
    case 'anthropic':
      return {
        type: 'error',
        error: { type: fields.errorType ?? ANTHROPIC_DEFAULT_ERROR_TYPES[status] ?? 'api_error', message },
        request_id: `req_fake_${seq}`,
      };
    case 'openai':
      return {
        error: {
          message,
          type: fields.errorType ?? (status >= 500 ? 'server_error' : 'invalid_request_error'),
          param: null,
          code: fields.errorCode ?? null,
        },
      };
    case 'kimi':
      return {
        error: {
          message,
          type: fields.errorType ?? (status >= 500 ? 'server_error' : 'invalid_request_error'),
          ...(fields.errorCode !== undefined ? { code: fields.errorCode } : {}),
        },
      };
    case 'glm':
      return {
        error: {
          code: fields.errorCode ?? String(status),
          message,
          ...(fields.errorType !== undefined ? { type: fields.errorType } : {}),
        },
      };
  }
}

export function sendErrorEnvelope(ctx: FakeAiReplyContext, status: number, fields: FakeAiErrorFields): void {
  writeJson(ctx.res, status, errorEnvelope(ctx.provider, status, fields, ctx.seq), requestIdHeader(ctx));
}

export function sendRaw(
  res: ServerResponse,
  status: number,
  body: unknown,
  contentType: string | undefined,
  headers: Record<string, string> = {}
): void {
  if (typeof body === 'string') {
    res.writeHead(status, { 'content-type': contentType ?? 'text/plain; charset=utf-8', ...headers });
    res.end(body);
    return;
  }
  writeJson(res, status, body, { ...(contentType ? { 'content-type': contentType } : {}), ...headers });
}

// ---------------------------------------------------------------------------
// Model output (success, refusal, malformed/truncated)
// ---------------------------------------------------------------------------

export function sendModelOutput(ctx: FakeAiReplyContext, output: FakeAiModelOutput): void {
  if (ctx.provider === 'anthropic') {
    if (ctx.stream) streamAnthropic(ctx, output);
    else writeJson(ctx.res, 200, anthropicMessage(ctx, output), requestIdHeader(ctx));
    return;
  }
  if (ctx.stream) streamChatCompletion(ctx, output);
  else writeJson(ctx.res, 200, chatCompletion(ctx, output), requestIdHeader(ctx));
}

function anthropicStopReason(output: FakeAiModelOutput): string {
  return output.finish === 'end' ? 'end_turn' : output.finish === 'length' ? 'max_tokens' : 'refusal';
}

function anthropicStopDetails(output: FakeAiModelOutput): unknown {
  return output.finish === 'refusal'
    ? { type: 'refusal', category: null, explanation: output.refusalMessage ?? 'The request was declined.' }
    : null;
}

const FAKE_THINKING_SIGNATURE = 'fake-thinking-signature';

function anthropicMessage(ctx: FakeAiReplyContext, output: FakeAiModelOutput): unknown {
  const usage = usageOf(ctx, output);
  const content: unknown[] = [];
  if (output.includeThinking !== false) content.push({ type: 'thinking', thinking: '', signature: FAKE_THINKING_SIGNATURE });
  if (output.text.length > 0) content.push({ type: 'text', text: output.text });
  return {
    id: messageId(ctx),
    type: 'message',
    role: 'assistant',
    model: ctx.model,
    content,
    stop_reason: anthropicStopReason(output),
    stop_sequence: null,
    stop_details: anthropicStopDetails(output),
    usage: {
      input_tokens: usage.input,
      output_tokens: usage.output,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

function anthropicPrelude(ctx: FakeAiReplyContext, inputTokens: number): string {
  return sseEvent('message_start', {
    type: 'message_start',
    message: {
      id: messageId(ctx),
      type: 'message',
      role: 'assistant',
      model: ctx.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  });
}

function anthropicThinkingBlock(index: number): string {
  return (
    sseEvent('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: { type: 'thinking', thinking: '', signature: '' },
    }) +
    sseEvent('content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: { type: 'signature_delta', signature: FAKE_THINKING_SIGNATURE },
    }) +
    sseEvent('content_block_stop', { type: 'content_block_stop', index })
  );
}

function anthropicTextStart(index: number): string {
  return sseEvent('content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
}

function anthropicTextDelta(index: number, text: string): string {
  return sseEvent('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text } });
}

function streamAnthropic(ctx: FakeAiReplyContext, output: FakeAiModelOutput): void {
  const usage = usageOf(ctx, output);
  let body = anthropicPrelude(ctx, usage.input);
  let index = 0;
  if (output.includeThinking !== false) body += anthropicThinkingBlock(index++);
  if (output.text.length > 0) {
    body += anthropicTextStart(index);
    for (const piece of chunksOf(output.text)) body += anthropicTextDelta(index, piece);
    body += sseEvent('content_block_stop', { type: 'content_block_stop', index });
  }
  body += sseEvent('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: anthropicStopReason(output), stop_sequence: null, stop_details: anthropicStopDetails(output) },
    usage: { output_tokens: usage.output },
  });
  body += sseEvent('message_stop', { type: 'message_stop' });
  startSse(ctx);
  finishSse(ctx, body, output.holdOpen === true);
}

function chatFinishReason(ctx: FakeAiReplyContext, output: FakeAiModelOutput): string {
  if (output.finishReason) return output.finishReason;
  if (output.finish === 'end') return 'stop';
  if (output.finish === 'length') return 'length';
  // Refusal defaults: OpenAI reports it in `message.refusal` with "stop".
  return ctx.provider === 'openai' ? 'stop' : ctx.provider === 'glm' ? 'sensitive' : 'content_filter';
}

function chatBase(ctx: FakeAiReplyContext, object: 'chat.completion' | 'chat.completion.chunk'): Record<string, unknown> {
  return {
    id: messageId(ctx),
    object,
    created: Math.floor(Date.now() / 1000),
    model: ctx.model,
    ...(ctx.provider === 'glm' ? { request_id: `req_fake_${ctx.seq}` } : {}),
  };
}

function chatUsage(ctx: FakeAiReplyContext, output: FakeAiModelOutput): Record<string, number> {
  const usage = usageOf(ctx, output);
  return { prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output };
}

function openAiRefusal(ctx: FakeAiReplyContext, output: FakeAiModelOutput): string | null {
  return output.finish === 'refusal' && ctx.provider === 'openai'
    ? output.refusalMessage ?? "I'm sorry, I can't help with that."
    : null;
}

function chatCompletion(ctx: FakeAiReplyContext, output: FakeAiModelOutput): unknown {
  const refusal = openAiRefusal(ctx, output);
  return {
    ...chatBase(ctx, 'chat.completion'),
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: refusal !== null ? null : output.text, refusal },
        logprobs: null,
        finish_reason: chatFinishReason(ctx, output),
      },
    ],
    usage: chatUsage(ctx, output),
  };
}

function chatChunk(ctx: FakeAiReplyContext, delta: Record<string, unknown>, finishReason: string | null): unknown {
  return { ...chatBase(ctx, 'chat.completion.chunk'), choices: [{ index: 0, delta, logprobs: null, finish_reason: finishReason }] };
}

function streamChatCompletion(ctx: FakeAiReplyContext, output: FakeAiModelOutput): void {
  const refusal = openAiRefusal(ctx, output);
  let body = sseEvent(null, chatChunk(ctx, { role: 'assistant', content: '' }, null));
  if (refusal !== null) {
    for (const piece of chunksOf(refusal)) body += sseEvent(null, chatChunk(ctx, { refusal: piece }, null));
  } else {
    for (const piece of chunksOf(output.text)) body += sseEvent(null, chatChunk(ctx, { content: piece }, null));
  }
  body += sseEvent(null, chatChunk(ctx, {}, chatFinishReason(ctx, output)));
  if (ctx.includeUsage) body += sseEvent(null, { ...chatBase(ctx, 'chat.completion.chunk'), choices: [], usage: chatUsage(ctx, output) });
  // [DONE] ends the stream for the SDK; a held-open stream stalls just before it.
  if (output.holdOpen !== true) body += sseEvent(null, '[DONE]');
  startSse(ctx);
  finishSse(ctx, body, output.holdOpen === true);
}

// ---------------------------------------------------------------------------
// Error after the response was accepted (stream already begun)
// ---------------------------------------------------------------------------

const MID_STREAM_DEFAULTS: Readonly<Record<FakeAiProvider, Required<Pick<FakeAiErrorFields, 'message'>> & FakeAiErrorFields>> = {
  anthropic: { errorType: 'overloaded_error', message: 'Overloaded' },
  openai: { errorType: 'service_unavailable_error', errorCode: 'server_is_overloaded', message: 'The server is overloaded.' },
  kimi: { errorType: 'engine_overloaded_error', message: 'The engine is currently overloaded.' },
  glm: { errorCode: '1305', message: 'The service may be temporarily overloaded, please try again later.' },
};

export function sendStreamErrorAfterStart(ctx: FakeAiReplyContext, fields: FakeAiErrorFields, abrupt: boolean): void {
  const defaults = MID_STREAM_DEFAULTS[ctx.provider];
  const merged: FakeAiErrorFields = {
    errorType: fields.errorType ?? defaults.errorType,
    errorCode: fields.errorCode ?? defaults.errorCode,
    message: fields.message ?? defaults.message,
  };
  const partialText = '{"summary": {"keyPoints": ["';

  if (!ctx.stream) {
    // A JSON request: 200 headers and a partial body, then the connection closes.
    ctx.res.writeHead(200, { 'content-type': 'application/json', ...requestIdHeader(ctx) });
    writeThenDestroy(ctx.res, `{"id":"${messageId(ctx)}","content":[{"type":"text","text":`);
    return;
  }

  startSse(ctx);
  if (ctx.provider === 'anthropic') {
    const started = anthropicPrelude(ctx, Math.max(1, Math.ceil(ctx.bodyBytes / 4))) + anthropicTextStart(0) + anthropicTextDelta(0, partialText);
    if (abrupt) {
      writeThenDestroy(ctx.res, started);
      return;
    }
    const error = errorEnvelope('anthropic', 529, merged, ctx.seq) as Record<string, unknown>;
    ctx.res.end(started + sseEvent('error', { type: 'error', error: error.error }));
    return;
  }

  const started =
    sseEvent(null, chatChunk(ctx, { role: 'assistant', content: '' }, null)) + sseEvent(null, chatChunk(ctx, { content: partialText }, null));
  if (abrupt) {
    writeThenDestroy(ctx.res, started);
    return;
  }
  const envelope = errorEnvelope(ctx.provider, 503, merged, ctx.seq) as { error: Record<string, unknown> };
  ctx.res.end(started + sseEvent(null, { error: envelope.error }));
}
