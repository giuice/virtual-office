// src/lib/meeting-notes/ai/adapters/index.ts
// Server-only entry point of the meeting-note AI adapters (Phase 6 T11;
// SPEC FR-016, FR-020, FR-021, FR-022, AC-026, AC-029). T12 calls
// generateMeetingNoteDraft with the snapshot taken at admission and the
// transcript ALREADY normalized (normalizeTranscriptForProvider).
//
// Per call, in order: matrix check of provider/model/reasoning level and key
// presence → FR-020 size preflight → base URL (server env override, refused in
// production) → caller-abort check → exactly ONE outbound streaming request
// (SDK retries off, a second request refused and redirects never followed by
// the transport guard, which also sends only allowlisted headers plus the
// admitted key) → deadline/abort check → stop reason check → JSON parse +
// shared draft-schema validation.
// Nothing here logs the key, the transcript, or provider text.
//
// Timeout: 180 s by default (SM-1 expects ≤60 s for a one-hour transcript;
// T9's stale job fails dispatched operations after 10 minutes, so the
// deadline must stay well below that). The deadline covers the whole streamed
// response, not only the headers.
import 'server-only';

import type { MeetingNoteAiProvider } from '@/types/meeting-notes';

import { findMeetingNoteAiModel, MEETING_NOTE_AI_CAPABILITIES } from '../capabilities';
import { resolveMeetingNoteAiBaseUrl } from '../base-url';
import { parseMeetingNoteAiDraft } from '../draft-schema';
import { preflightMeetingNoteAiTranscript } from '../preflight';
import {
  meetingNoteAiFailure,
  meetingNoteAiTooLongFailure,
  type MeetingNoteAiDraftResult,
} from '../provider-errors';
import { runAnthropicDraftRequest } from './anthropic';
import { runOpenAiCompatibleDraftRequest } from './openai-compatible';
import {
  createDispatchFetch,
  createDispatchState,
  createRequestControl,
  mapMeetingNoteAiTransportError,
  type MeetingNoteAiStreamOutcome,
} from './transport';

export const MEETING_NOTE_AI_DEFAULT_TIMEOUT_MS = 180_000;
/** Upper bound for a caller-supplied timeout (stale-operation job: 10 min). */
export const MEETING_NOTE_AI_MAX_TIMEOUT_MS = 300_000;
const SDK_TIMEOUT_MARGIN_MS = 5_000;

export interface GenerateMeetingNoteDraftInput {
  provider: MeetingNoteAiProvider;
  model: string;
  reasoningLevel: string;
  /** The company's provider key (from the admission snapshot). Never logged or returned. */
  apiKey: string;
  /** Normalized transcript; the ONLY content sent to the provider. */
  transcript: string;
  /** Aborts the outbound request (client left the page). */
  signal?: AbortSignal;
  /** Deadline for the whole request, 1 ms – 300 s; default 180 s. */
  timeoutMs?: number;
}

function outcomeFailure(provider: MeetingNoteAiProvider, outcome: MeetingNoteAiStreamOutcome) {
  switch (outcome.finish) {
    case 'refusal':
      return meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_REFUSED', true);
    case 'length':
      return meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_OUTPUT_TRUNCATED', true);
    case 'incomplete':
      return meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_STREAM_INTERRUPTED', true);
    case 'other':
      return meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_OUTPUT_INVALID', true);
    case 'end':
      return null;
  }
}

export async function generateMeetingNoteDraft(input: GenerateMeetingNoteDraftInput): Promise<MeetingNoteAiDraftResult> {
  const { provider } = input;
  if (!Object.hasOwn(MEETING_NOTE_AI_CAPABILITIES, provider)) {
    // Unknown provider: no label to name; fall back to a neutral one.
    return meetingNoteAiFailure('openai', 'MEETING_NOTE_AI_CONFIGURATION_INVALID', false);
  }
  const model = findMeetingNoteAiModel(provider, input.model);
  const level = model?.reasoningLevels.find((entry) => entry.id === input.reasoningLevel);
  if (!model || !level || typeof input.apiKey !== 'string' || input.apiKey.trim() === '') {
    return meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_CONFIGURATION_INVALID', false);
  }

  const preflight = preflightMeetingNoteAiTranscript({ provider, model: model.id, transcript: input.transcript });
  if (!preflight.ok) {
    return preflight.code === 'MEETING_NOTE_AI_TRANSCRIPT_TOO_LONG_FOR_MODEL'
      ? meetingNoteAiTooLongFailure(provider, preflight)
      : meetingNoteAiFailure(provider, preflight.code, false);
  }

  const baseUrl = resolveMeetingNoteAiBaseUrl(provider);
  if (!baseUrl.ok) return meetingNoteAiFailure(provider, baseUrl.code, false);

  if (input.signal?.aborted) return meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_CANCELLED_BEFORE_SEND', false);

  const timeoutMs = Math.min(
    Math.max(1, Math.floor(input.timeoutMs ?? MEETING_NOTE_AI_DEFAULT_TIMEOUT_MS)),
    MEETING_NOTE_AI_MAX_TIMEOUT_MS
  );
  const state = createDispatchState();
  const control = createRequestControl(input.signal, timeoutMs);
  const protocol = MEETING_NOTE_AI_CAPABILITIES[provider].protocol;
  const request = {
    provider,
    apiKey: input.apiKey,
    baseUrl: baseUrl.baseUrl,
    model,
    level,
    transcript: input.transcript,
    fetch: createDispatchFetch(state, {
      scheme: protocol === 'anthropic-messages' ? 'x-api-key' : 'bearer',
      apiKey: input.apiKey,
    }),
    signal: control.signal,
    sdkTimeoutMs: timeoutMs + SDK_TIMEOUT_MARGIN_MS,
  };

  try {
    const outcome =
      protocol === 'anthropic-messages' ? await runAnthropicDraftRequest(request) : await runOpenAiCompatibleDraftRequest(request);

    // The SDKs end an aborted stream silently. Whatever was read before the
    // deadline or the caller's abort — even a complete draft and a stop
    // signal followed by a stalled connection — the call did not finish in
    // time: a counted timeout/cancellation, and the draft is discarded.
    if (control.reason) {
      return mapMeetingNoteAiTransportError(provider, state, control);
    }
    const stopFailure = outcomeFailure(provider, outcome);
    if (stopFailure) return stopFailure;

    const parsed = parseMeetingNoteAiDraft(outcome.text);
    if (!parsed.ok) {
      const code =
        parsed.reason === 'empty'
          ? 'MEETING_NOTE_AI_OUTPUT_EMPTY'
          : parsed.reason === 'malformed'
            ? 'MEETING_NOTE_AI_OUTPUT_MALFORMED'
            : 'MEETING_NOTE_AI_OUTPUT_INVALID';
      return meetingNoteAiFailure(provider, code, true);
    }
    const hasUsage = outcome.usage.inputTokens !== undefined || outcome.usage.outputTokens !== undefined;
    return { ok: true, draft: parsed.draft, dispatched: true, ...(hasUsage ? { usage: outcome.usage } : {}) };
  } catch {
    // The thrown error is not inspected or logged: SDK errors can carry
    // provider text. The dispatch state decides.
    return mapMeetingNoteAiTransportError(provider, state, control);
  } finally {
    control.dispose();
  }
}

export { preflightMeetingNoteAiTranscript } from '../preflight';
export type {
  MeetingNoteAiDraftFailure,
  MeetingNoteAiDraftResult,
  MeetingNoteAiDraftSuccess,
  MeetingNoteAiFailureCode,
  MeetingNoteAiFailureKind,
} from '../provider-errors';
