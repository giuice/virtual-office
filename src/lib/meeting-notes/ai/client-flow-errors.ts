// src/lib/meeting-notes/ai/client-flow-errors.ts
// What a failed AI ticket / processing / Apply request means for the note
// view's AI flow (Phase 6 T13; SPEC FR-015, FR-021, FR-023, FR-025, §11) and
// the text the user sees. Browser-side: reads only the non-sensitive hints the
// routes send (limit, resetAt, provider label, retryable). The routes and the
// database stay the authority for every rule.
import { MeetingNotesApiError } from '@/lib/meeting-notes/client-api';
import { formatMeetingNoteTimestamp } from '@/lib/meeting-notes/format';
import { describeMeetingNoteError } from '@/lib/meeting-notes/form-errors';
import { describeMeetingNoteItemError } from '@/lib/meeting-notes/item-errors';
import { MEETING_NOTE_LIMITS } from '@/lib/meeting-notes/validation';

export type MeetingNoteAiFlowError =
  /** No provider configured (FR-025): the controls turn disabled. */
  | { kind: 'not_configured'; canConfigure: boolean }
  /** Daily limit reached (FR-023): limit and reset time. */
  | { kind: 'limit_reached'; limit: number | null; resetAt: string | null }
  /** The AI settings changed after the notice (FR-015): a new notice must be shown. */
  | { kind: 'settings_stale'; providerLabel: string | null }
  /** The ticket is older than 24 hours or unusable: a new notice must be shown. */
  | { kind: 'ticket_expired' }
  /** The note or its transcript changed after the notice. */
  | { kind: 'source_stale' }
  /** The note is gone or the caller lost access (removed, deleted). */
  | { kind: 'access_lost' }
  /** The browser request was aborted (Cancel, leaving the page, scope change). */
  | { kind: 'cancelled' }
  /** Anything else: provider failure, too long for the model, network, server. */
  | { kind: 'failed'; message: string; retryable: boolean };

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Classifies a failed ticket or processing request. */
export function classifyMeetingNoteAiError(error: unknown): MeetingNoteAiFlowError {
  if (isAbort(error)) return { kind: 'cancelled' };
  if (!(error instanceof MeetingNotesApiError)) {
    return { kind: 'failed', message: 'Something went wrong. Try again.', retryable: true };
  }
  const { details } = error;
  switch (error.code) {
    case 'MEETING_NOTE_AI_NOT_CONFIGURED':
      return { kind: 'not_configured', canConfigure: details.canConfigure === true };
    case 'MEETING_NOTE_AI_LIMIT_REACHED':
      return { kind: 'limit_reached', limit: num(details.limit), resetAt: str(details.resetAt) };
    case 'MEETING_NOTE_AI_SETTINGS_STALE': {
      const settings = details.settings && typeof details.settings === 'object' ? (details.settings as Record<string, unknown>) : {};
      return { kind: 'settings_stale', providerLabel: str(settings.providerLabel) };
    }
    case 'MEETING_NOTE_AI_TICKET_EXPIRED':
    case 'MEETING_NOTE_AI_TICKET_INVALID':
      return { kind: 'ticket_expired' };
    case 'MEETING_NOTE_AI_SOURCE_STALE':
    case 'MEETING_NOTE_AI_BINDING_MISMATCH':
      return { kind: 'source_stale' };
    case 'MEETING_NOTE_AI_CANCELLED':
      return { kind: 'cancelled' };
    default:
      break;
  }
  if (error.status === 404 || error.status === 403) return { kind: 'access_lost' };
  // 422 too long for the model, 502 provider failures, 409 operation ended /
  // draft discarded: the route's message is fixed and sanitized per code.
  if (error.code.startsWith('MEETING_NOTE_AI_') && error.message) {
    return { kind: 'failed', message: error.message, retryable: details.retryable !== false };
  }
  return { kind: 'failed', message: describeMeetingNoteError(error), retryable: true };
}

/** The daily-limit message (FR-023), with the reset time in the viewer's local time. */
export function describeMeetingNoteAiLimit(limit: number | null, resetAt: string | null): string {
  const reached =
    limit === null
      ? "Your company reached today's AI processing limit."
      : `Your company reached today's limit of ${limit} AI ${limit === 1 ? 'processing' : 'processings'}.`;
  return resetAt ? `${reached} It resets at ${formatMeetingNoteTimestamp(resetAt)}.` : reached;
}

/** User-facing text of a flow error (not used for not_configured, which disables the controls). */
export function describeMeetingNoteAiFlowError(error: MeetingNoteAiFlowError): string {
  switch (error.kind) {
    case 'not_configured':
      return 'An admin needs to configure AI.';
    case 'limit_reached':
      return describeMeetingNoteAiLimit(error.limit, error.resetAt);
    case 'settings_stale':
      return 'The AI settings changed. Review the new notice before processing.';
    case 'ticket_expired':
      return 'This notice expired. Review the notice again before processing.';
    case 'source_stale':
      return 'The note changed since the notice was shown. Reload the note and try again.';
    case 'access_lost':
      return 'This note no longer exists or you no longer have access to it.';
    case 'cancelled':
      return 'Processing was cancelled.';
    case 'failed':
      return error.message;
  }
}

/** What a failed Apply means: a conflict, the 100-item limit, lost access, or another refusal. */
export type MeetingNoteAiApplyFailure =
  | { kind: 'conflict' }
  | { kind: 'item_limit'; message: string }
  | { kind: 'access_lost'; message: string }
  | { kind: 'other'; message: string };

export function classifyMeetingNoteAiApplyError(error: unknown): MeetingNoteAiApplyFailure {
  if (error instanceof MeetingNotesApiError) {
    if (error.code === 'MEETING_NOTE_STALE_REVISION') return { kind: 'conflict' };
    if (error.code === 'MEETING_NOTE_ITEM_LIMIT_REACHED') {
      return {
        kind: 'item_limit',
        message: `${MEETING_NOTE_LIMITS.maxItemsPerNote} items maximum: nothing was applied. Accept fewer action items, or delete some from the note first.`,
      };
    }
    if (error.status === 404 || error.status === 403) {
      return {
        kind: 'access_lost',
        message: 'This note no longer exists or you no longer have access to it. The draft was discarded.',
      };
    }
    if (
      error.code === 'MEETING_NOTE_SUMMARY_INVALID' ||
      error.code === 'MEETING_NOTE_AI_APPLY_ITEMS_INVALID' ||
      error.code === 'MEETING_NOTE_AI_APPLY_EMPTY'
    ) {
      return { kind: 'other', message: error.message };
    }
  }
  return { kind: 'other', message: describeMeetingNoteItemError(error) };
}
