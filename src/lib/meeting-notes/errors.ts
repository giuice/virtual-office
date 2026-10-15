// src/lib/meeting-notes/errors.ts
// Errors raised by the meeting-note RPCs (migrations 20261013105021,
// 20261013110632, 20261013114402, 20261013154823, 20261013161204, and 20261013180237), carried from the repository
// to the routes.

/** Message tokens the meeting-note RPCs raise (SQLSTATE in comments). */
export const MEETING_NOTE_ERROR_TOKENS = [
  // P0001
  'MEETING_NOTE_STALE_REVISION',
  'MEETING_NOTE_ITEM_STALE_REVISION',
  // 42501
  'MEETING_NOTE_FORBIDDEN',
  'MEETING_NOTE_ITEM_FORBIDDEN',
  // P0002
  'MEETING_NOTE_NOT_FOUND',
  'MEETING_NOTE_SPACE_NOT_FOUND',
  'MEETING_NOTE_VERSION_NOT_FOUND',
  'MEETING_NOTE_ITEM_NOT_FOUND',
  // 22023
  'MEETING_NOTE_TITLE_INVALID',
  'MEETING_NOTE_DATE_REQUIRED',
  'MEETING_NOTE_CONTENT_TOO_LONG',
  'MEETING_NOTE_CONTENT_REQUIRED',
  'MEETING_NOTE_TOO_MANY_PARTICIPANTS',
  'MEETING_NOTE_PARTICIPANTS_INVALID',
  'MEETING_NOTE_PARTICIPANT_NOT_MEMBER',
  'MEETING_NOTE_REVISION_REQUIRED',
  'MEETING_NOTE_ITEM_DESCRIPTION_INVALID',
  'MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER',
  'MEETING_NOTE_ITEM_REVISION_REQUIRED',
  'MEETING_NOTE_ITEM_COMPLETED_REQUIRED',
  'MEETING_NOTE_ITEM_LIMIT_REACHED',
  // 22023, transcript intake (migration 20261013161204)
  'MEETING_NOTE_TRANSCRIPT_EMPTY',
  'MEETING_NOTE_TRANSCRIPT_TOO_LARGE',
  // 22023, search (migration 20261013114402)
  'MEETING_NOTE_SEARCH_INVALID',
  // AI admission, settlement, and usage (migration 20261013154823)
  // 22023
  'MEETING_NOTE_AI_INVALID_ARGUMENT',
  'MEETING_NOTE_AI_OUTCOME_INVALID',
  // P0001 (DETAIL JSON where noted)
  'MEETING_NOTE_AI_TICKET_EXPIRED',
  'MEETING_NOTE_AI_BINDING_MISMATCH',
  'MEETING_NOTE_AI_NOT_CONFIGURED',
  'MEETING_NOTE_AI_SETTINGS_STALE', // {current_revision, provider, model, reasoning_level}
  'MEETING_NOTE_AI_SOURCE_STALE', // {current_revision, transcript_id}
  'MEETING_NOTE_AI_LIMIT_REACHED', // {limit, used, usage_day, reset_at}
  'MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION', // {status}
  // P0002
  'MEETING_NOTE_AI_OPERATION_NOT_FOUND',
  // 42501
  'MEETING_NOTE_AI_USAGE_FORBIDDEN',
  // 22023, AI draft Apply (migration 20261013180237)
  'MEETING_NOTE_SUMMARY_INVALID',
  'MEETING_NOTE_AI_APPLY_ITEMS_INVALID',
  'MEETING_NOTE_AI_APPLY_EMPTY',
] as const;

export type MeetingNoteErrorToken = (typeof MEETING_NOTE_ERROR_TOKENS)[number];

const KNOWN_TOKENS: ReadonlySet<string> = new Set(MEETING_NOTE_ERROR_TOKENS);

export function isMeetingNoteErrorToken(value: string): value is MeetingNoteErrorToken {
  return KNOWN_TOKENS.has(value);
}

/**
 * A database error from a meeting-note RPC. `token` is set only for the
 * documented message tokens; anything else is an unexpected failure whose
 * message must not reach the client.
 */
export class MeetingNoteDbError extends Error {
  readonly sqlstate: string | undefined;
  readonly token: MeetingNoteErrorToken | null;
  /** Parsed DETAIL JSON (e.g. {"current_revision": 3}); null when absent or not JSON. */
  readonly detail: Record<string, unknown> | null;

  constructor(sqlstate: string | undefined, message: string, detail: string | null | undefined) {
    super(message);
    this.name = 'MeetingNoteDbError';
    this.sqlstate = sqlstate;
    this.token = isMeetingNoteErrorToken(message) ? message : null;
    this.detail = parseDetail(detail);
  }

  /** The current revision reported by a stale-revision error, if any. */
  get currentRevision(): number | null {
    const value = this.detail?.current_revision;
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
  }
}

function parseDetail(detail: string | null | undefined): Record<string, unknown> | null {
  if (!detail) return null;
  try {
    const parsed: unknown = JSON.parse(detail);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
