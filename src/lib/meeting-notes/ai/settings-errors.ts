// src/lib/meeting-notes/ai/settings-errors.ts
// Errors of the AI settings RPCs (migration 20261013142351). Only the
// documented message tokens are kept: an unexpected database error keeps its
// SQLSTATE and nothing else, so no message or detail text (which could echo
// parameter values) ever reaches a response or a log line.

export const MEETING_NOTE_AI_SETTINGS_ERROR_TOKENS = [
  // 42501
  'MEETING_NOTE_AI_SETTINGS_FORBIDDEN',
  // P0001 (DETAIL {"current_revision": n|null})
  'MEETING_NOTE_AI_SETTINGS_STALE_REVISION',
  // 22023
  'MEETING_NOTE_AI_SETTINGS_INVALID_ARGUMENT',
  'MEETING_NOTE_AI_PROVIDER_INVALID',
  'MEETING_NOTE_AI_MODEL_INVALID',
  'MEETING_NOTE_AI_REASONING_INVALID',
  'MEETING_NOTE_AI_DAILY_LIMIT_INVALID',
  'MEETING_NOTE_AI_KEY_REQUIRED',
  'MEETING_NOTE_AI_KEY_INVALID',
] as const;

export type MeetingNoteAiSettingsErrorToken = (typeof MEETING_NOTE_AI_SETTINGS_ERROR_TOKENS)[number];

const KNOWN: ReadonlySet<string> = new Set(MEETING_NOTE_AI_SETTINGS_ERROR_TOKENS);

export class MeetingNoteAiSettingsDbError extends Error {
  readonly sqlstate: string | undefined;
  readonly token: MeetingNoteAiSettingsErrorToken | null;
  /** current_revision from a stale-revision DETAIL; null when absent. */
  readonly currentRevision: number | null;

  constructor(sqlstate: string | undefined, message: string | undefined, detail: string | null | undefined) {
    const token = message && KNOWN.has(message) ? (message as MeetingNoteAiSettingsErrorToken) : null;
    // The message is the token or a fixed text — never the database text.
    super(token ?? 'unexpected AI settings database error');
    this.name = 'MeetingNoteAiSettingsDbError';
    this.sqlstate = sqlstate;
    this.token = token;
    this.currentRevision = token === 'MEETING_NOTE_AI_SETTINGS_STALE_REVISION' ? parseRevision(detail) : null;
  }
}

function parseRevision(detail: string | null | undefined): number | null {
  if (!detail) return null;
  try {
    const parsed: unknown = JSON.parse(detail);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = (parsed as Record<string, unknown>).current_revision;
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
  } catch {
    return null;
  }
}
