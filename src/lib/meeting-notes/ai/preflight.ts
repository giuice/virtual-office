// src/lib/meeting-notes/ai/preflight.ts
// Input-size preflight (Phase 6 T11; SPEC FR-020, AC-026): before any request
// leaves the server, the normalized transcript plus the fixed request text
// (system prompt and draft JSON schema) is estimated in tokens and compared
// with the configured model's budget from the capability matrix. A transcript
// that does not fit is refused — nothing is sent, nothing is counted.
//
// Estimate (deliberately conservative, no tokenizer dependency):
//   ceil(ASCII UTF-16 units / 2) + 2 × non-ASCII UTF-16 units + overhead.
// Real tokenizers average ~3–4 ASCII characters per token for prose, and one
// to two tokens per CJK/accented character; 2 characters per token and 2
// tokens per non-ASCII unit (an astral character counts as two units) stay at
// or above those rates, so the estimate over-counts rather than letting an
// oversize request through. Budget: input estimate + the output budget the
// adapter requests (the model's maxOutputTokens) must not exceed the model's
// contextWindowTokens. For OpenAI models, contextWindowTokens already holds the
// documented input cap, so the check is stricter than the provider's own.
import 'server-only';

import type { MeetingNoteAiProvider } from '@/types/meeting-notes';

import { findMeetingNoteAiModel, MEETING_NOTE_AI_CAPABILITIES } from './capabilities';
import { MEETING_NOTE_AI_DRAFT_JSON_SCHEMA } from './draft-schema';
import { MEETING_NOTE_AI_SYSTEM_PROMPT } from './prompt';

/** Role framing, message wrappers, and request parameters the estimate does not see as text. */
const REQUEST_OVERHEAD_TOKENS = 512;

export function estimateMeetingNoteAiTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) < 0x80) ascii += 1;
    else other += 1;
  }
  return Math.ceil(ascii / 2) + other * 2;
}

const FIXED_REQUEST_TOKENS =
  estimateMeetingNoteAiTokens(MEETING_NOTE_AI_SYSTEM_PROMPT) +
  estimateMeetingNoteAiTokens(JSON.stringify(MEETING_NOTE_AI_DRAFT_JSON_SCHEMA)) +
  REQUEST_OVERHEAD_TOKENS;

export type MeetingNoteAiPreflightResult =
  | {
      ok: true;
      estimatedInputTokens: number;
      /** Output budget the adapter will request (the model's maxOutputTokens). */
      outputBudgetTokens: number;
      /** Largest input estimate the model accepts with that output budget. */
      maxInputTokens: number;
    }
  | {
      ok: false;
      code: 'MEETING_NOTE_AI_TRANSCRIPT_TOO_LONG_FOR_MODEL';
      estimatedInputTokens: number;
      outputBudgetTokens: number;
      maxInputTokens: number;
      modelLabel: string;
    }
  | { ok: false; code: 'MEETING_NOTE_AI_CONFIGURATION_INVALID' };

/** FR-020: whether the normalized transcript fits the configured model. Pure; sends nothing. */
export function preflightMeetingNoteAiTranscript(input: {
  provider: MeetingNoteAiProvider;
  model: string;
  transcript: string;
}): MeetingNoteAiPreflightResult {
  if (!Object.hasOwn(MEETING_NOTE_AI_CAPABILITIES, input.provider)) {
    return { ok: false, code: 'MEETING_NOTE_AI_CONFIGURATION_INVALID' };
  }
  const model = findMeetingNoteAiModel(input.provider, input.model);
  if (!model) return { ok: false, code: 'MEETING_NOTE_AI_CONFIGURATION_INVALID' };

  const estimatedInputTokens = FIXED_REQUEST_TOKENS + estimateMeetingNoteAiTokens(input.transcript);
  const outputBudgetTokens = model.maxOutputTokens;
  const maxInputTokens = Math.max(0, model.contextWindowTokens - outputBudgetTokens);
  if (estimatedInputTokens > maxInputTokens) {
    return {
      ok: false,
      code: 'MEETING_NOTE_AI_TRANSCRIPT_TOO_LONG_FOR_MODEL',
      estimatedInputTokens,
      outputBudgetTokens,
      maxInputTokens,
      modelLabel: model.label,
    };
  }
  return { ok: true, estimatedInputTokens, outputBudgetTokens, maxInputTokens };
}
