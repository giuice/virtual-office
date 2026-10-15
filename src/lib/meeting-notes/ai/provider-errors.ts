// src/lib/meeting-notes/ai/provider-errors.ts
// Outcome codes, sanitized messages, and counting classes of a meeting-note
// draft request (Phase 6 T11; SPEC FR-020, FR-021, FR-022, §11).
//
// Counting classes (`kind`) for T12's settlement:
//   never_sent             — the provider cannot have received the transcript:
//                            preflight refusal, invalid configuration, abort
//                            before the request was handed to the network, or a
//                            connection that was refused / a host that did not
//                            resolve (no request byte can have left). Not counted.
//   preprocessing_rejected — the provider's INITIAL response was a non-2xx
//                            rejection whose status + type/code is listed in the
//                            capability matrix (classifyMeetingNoteAiPreProcessingRejection).
//                            Refunded.
//   processed_failure      — everything else after the request was sent:
//                            unlisted statuses/codes, non-envelope bodies, errors
//                            after the stream began, connection loss, timeout,
//                            cancellation after send, refusal, malformed /
//                            truncated / empty / invalid output. Counted.
// Messages are fixed per code: they never contain the API key, an
// Authorization header, the transcript, or provider text (which can echo input).
import 'server-only';

import type { MeetingNoteAiDraft, MeetingNoteAiProvider } from '@/types/meeting-notes';

import { MEETING_NOTE_AI_CAPABILITIES, type MeetingNoteAiRejectionCategory } from './capabilities';

export type MeetingNoteAiFailureKind = 'never_sent' | 'preprocessing_rejected' | 'processed_failure';

export type MeetingNoteAiFailureCode =
  // never_sent
  | 'MEETING_NOTE_AI_TRANSCRIPT_TOO_LONG_FOR_MODEL'
  | 'MEETING_NOTE_AI_CONFIGURATION_INVALID'
  | 'MEETING_NOTE_AI_CANCELLED_BEFORE_SEND'
  | 'MEETING_NOTE_AI_PROVIDER_UNREACHABLE'
  // preprocessing_rejected (by matrix category)
  | 'MEETING_NOTE_AI_PROVIDER_AUTH_FAILED'
  | 'MEETING_NOTE_AI_PROVIDER_RATE_LIMITED'
  | 'MEETING_NOTE_AI_PROVIDER_OVERLOADED'
  | 'MEETING_NOTE_AI_PROVIDER_UNAVAILABLE'
  // processed_failure
  | 'MEETING_NOTE_AI_PROVIDER_ERROR'
  | 'MEETING_NOTE_AI_STREAM_INTERRUPTED'
  | 'MEETING_NOTE_AI_CONNECTION_LOST'
  | 'MEETING_NOTE_AI_TIMEOUT'
  | 'MEETING_NOTE_AI_CANCELLED'
  | 'MEETING_NOTE_AI_REFUSED'
  | 'MEETING_NOTE_AI_OUTPUT_TRUNCATED'
  | 'MEETING_NOTE_AI_OUTPUT_MALFORMED'
  | 'MEETING_NOTE_AI_OUTPUT_INVALID'
  | 'MEETING_NOTE_AI_OUTPUT_EMPTY';

export interface MeetingNoteAiUsageReport {
  inputTokens?: number;
  outputTokens?: number;
}

export interface MeetingNoteAiDraftSuccess {
  ok: true;
  draft: MeetingNoteAiDraft;
  usage?: MeetingNoteAiUsageReport;
  /** Always true: a draft needs exactly one outbound request. */
  dispatched: true;
}

export interface MeetingNoteAiDraftFailure {
  ok: false;
  kind: MeetingNoteAiFailureKind;
  code: MeetingNoteAiFailureCode;
  /** Sanitized, user-presentable text (no key, transcript, or provider text). */
  message: string;
  /** Whether "Try again" can reasonably succeed without a settings change. */
  retryable: boolean;
  /**
   * Whether the outbound HTTP request was handed to the network (fetch was
   * called). False for preflight/config refusals and aborts before send; true
   * for everything the provider may have seen — and for a refused connection,
   * which is `never_sent` although fetch was attempted.
   */
  dispatched: boolean;
  /** Matrix category of a listed pre-processing rejection. */
  rejectionCategory?: MeetingNoteAiRejectionCategory;
  /** HTTP status of the provider's initial non-2xx response (no body is kept). */
  providerStatus?: number;
  /** FR-020 refusal details (the message names the limit). */
  estimatedInputTokens?: number;
  maxInputTokens?: number;
}

export type MeetingNoteAiDraftResult = MeetingNoteAiDraftSuccess | MeetingNoteAiDraftFailure;

function providerLabel(provider: MeetingNoteAiProvider): string {
  return MEETING_NOTE_AI_CAPABILITIES[provider].label;
}

const NOT_RETRYABLE: ReadonlySet<MeetingNoteAiFailureCode> = new Set<MeetingNoteAiFailureCode>([
  'MEETING_NOTE_AI_TRANSCRIPT_TOO_LONG_FOR_MODEL',
  'MEETING_NOTE_AI_CONFIGURATION_INVALID',
  'MEETING_NOTE_AI_PROVIDER_AUTH_FAILED',
  'MEETING_NOTE_AI_REFUSED',
]);

const KIND_BY_CODE: Readonly<Record<MeetingNoteAiFailureCode, MeetingNoteAiFailureKind>> = {
  MEETING_NOTE_AI_TRANSCRIPT_TOO_LONG_FOR_MODEL: 'never_sent',
  MEETING_NOTE_AI_CONFIGURATION_INVALID: 'never_sent',
  MEETING_NOTE_AI_CANCELLED_BEFORE_SEND: 'never_sent',
  MEETING_NOTE_AI_PROVIDER_UNREACHABLE: 'never_sent',
  MEETING_NOTE_AI_PROVIDER_AUTH_FAILED: 'preprocessing_rejected',
  MEETING_NOTE_AI_PROVIDER_RATE_LIMITED: 'preprocessing_rejected',
  MEETING_NOTE_AI_PROVIDER_OVERLOADED: 'preprocessing_rejected',
  MEETING_NOTE_AI_PROVIDER_UNAVAILABLE: 'preprocessing_rejected',
  MEETING_NOTE_AI_PROVIDER_ERROR: 'processed_failure',
  MEETING_NOTE_AI_STREAM_INTERRUPTED: 'processed_failure',
  MEETING_NOTE_AI_CONNECTION_LOST: 'processed_failure',
  MEETING_NOTE_AI_TIMEOUT: 'processed_failure',
  MEETING_NOTE_AI_CANCELLED: 'processed_failure',
  MEETING_NOTE_AI_REFUSED: 'processed_failure',
  MEETING_NOTE_AI_OUTPUT_TRUNCATED: 'processed_failure',
  MEETING_NOTE_AI_OUTPUT_MALFORMED: 'processed_failure',
  MEETING_NOTE_AI_OUTPUT_INVALID: 'processed_failure',
  MEETING_NOTE_AI_OUTPUT_EMPTY: 'processed_failure',
};

function messageFor(code: MeetingNoteAiFailureCode, provider: MeetingNoteAiProvider): string {
  const label = providerLabel(provider);
  switch (code) {
    case 'MEETING_NOTE_AI_TRANSCRIPT_TOO_LONG_FOR_MODEL':
      return 'The transcript is too long for the configured AI model.';
    case 'MEETING_NOTE_AI_CONFIGURATION_INVALID':
      return 'The AI settings are not valid. Ask an admin to review them.';
    case 'MEETING_NOTE_AI_CANCELLED_BEFORE_SEND':
      return 'Processing was cancelled before the transcript was sent.';
    case 'MEETING_NOTE_AI_PROVIDER_UNREACHABLE':
      return `${label} could not be reached. Try again later.`;
    case 'MEETING_NOTE_AI_PROVIDER_AUTH_FAILED':
      return `${label} rejected the API key or its permissions. Ask an admin to check the AI settings.`;
    case 'MEETING_NOTE_AI_PROVIDER_RATE_LIMITED':
      return `${label} refused the request because of a rate or usage limit on the company's account. Try again later.`;
    case 'MEETING_NOTE_AI_PROVIDER_OVERLOADED':
      return `${label} is overloaded right now. Try again in a few minutes.`;
    case 'MEETING_NOTE_AI_PROVIDER_UNAVAILABLE':
      return `${label} is unavailable right now. Try again later.`;
    case 'MEETING_NOTE_AI_PROVIDER_ERROR':
      return `${label} returned an error while processing the transcript.`;
    case 'MEETING_NOTE_AI_STREAM_INTERRUPTED':
      return `${label} stopped with an error while writing the draft.`;
    case 'MEETING_NOTE_AI_CONNECTION_LOST':
      return `The connection to ${label} was lost before the draft arrived.`;
    case 'MEETING_NOTE_AI_TIMEOUT':
      return `${label} did not finish the draft in time.`;
    case 'MEETING_NOTE_AI_CANCELLED':
      return 'Processing was cancelled after the transcript was sent.';
    case 'MEETING_NOTE_AI_REFUSED':
      return `${label} declined to process this transcript.`;
    case 'MEETING_NOTE_AI_OUTPUT_TRUNCATED':
      return `${label} stopped before the draft was complete.`;
    case 'MEETING_NOTE_AI_OUTPUT_MALFORMED':
      return `${label} returned a draft that could not be read.`;
    case 'MEETING_NOTE_AI_OUTPUT_INVALID':
      return `${label} returned a draft in an unexpected format.`;
    case 'MEETING_NOTE_AI_OUTPUT_EMPTY':
      return `${label} returned an empty draft.`;
  }
}

export function meetingNoteAiFailure(
  provider: MeetingNoteAiProvider,
  code: MeetingNoteAiFailureCode,
  dispatched: boolean,
  extra: Pick<
    MeetingNoteAiDraftFailure,
    'rejectionCategory' | 'providerStatus' | 'estimatedInputTokens' | 'maxInputTokens'
  > = {}
): MeetingNoteAiDraftFailure {
  return {
    ok: false,
    kind: KIND_BY_CODE[code],
    code,
    message: messageFor(code, provider),
    retryable: !NOT_RETRYABLE.has(code),
    dispatched,
    ...extra,
  };
}

/** FR-020 refusal; the message names the limit and the two ways out. */
export function meetingNoteAiTooLongFailure(
  provider: MeetingNoteAiProvider,
  details: { estimatedInputTokens: number; maxInputTokens: number; modelLabel: string }
): MeetingNoteAiDraftFailure {
  const failure = meetingNoteAiFailure(provider, 'MEETING_NOTE_AI_TRANSCRIPT_TOO_LONG_FOR_MODEL', false, {
    estimatedInputTokens: details.estimatedInputTokens,
    maxInputTokens: details.maxInputTokens,
  });
  const fmt = (n: number) => n.toLocaleString('en-US');
  return {
    ...failure,
    message:
      `The transcript is too long for ${details.modelLabel}: about ${fmt(details.estimatedInputTokens)} tokens, ` +
      `limit ${fmt(details.maxInputTokens)}. Use a smaller file or ask an admin to choose a model with a larger context.`,
  };
}

const CODE_BY_CATEGORY: Readonly<Record<MeetingNoteAiRejectionCategory, MeetingNoteAiFailureCode>> = {
  authentication: 'MEETING_NOTE_AI_PROVIDER_AUTH_FAILED',
  permission: 'MEETING_NOTE_AI_PROVIDER_AUTH_FAILED',
  rate_limit: 'MEETING_NOTE_AI_PROVIDER_RATE_LIMITED',
  overloaded: 'MEETING_NOTE_AI_PROVIDER_OVERLOADED',
  unavailable: 'MEETING_NOTE_AI_PROVIDER_UNAVAILABLE',
};

export function meetingNoteAiRejectionFailure(
  provider: MeetingNoteAiProvider,
  category: MeetingNoteAiRejectionCategory,
  status: number
): MeetingNoteAiDraftFailure {
  return meetingNoteAiFailure(provider, CODE_BY_CATEGORY[category], true, {
    rejectionCategory: category,
    providerStatus: status,
  });
}
