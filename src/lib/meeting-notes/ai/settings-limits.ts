// src/lib/meeting-notes/ai/settings-limits.ts
// Limits of the company AI settings (Phase 6 FR-024), shared by the route and
// the admin form. The database enforces the same bounds
// (migration 20261013142351_meeting_notes_ai_settings.sql).

/** Daily limit of a company that never saved AI settings. */
export const MEETING_NOTE_AI_DEFAULT_DAILY_LIMIT = 20;
export const MEETING_NOTE_AI_MIN_DAILY_LIMIT = 1;
export const MEETING_NOTE_AI_MAX_DAILY_LIMIT = 200;

export const MEETING_NOTE_AI_KEY_MIN_LENGTH = 8;
export const MEETING_NOTE_AI_KEY_MAX_LENGTH = 512;

/** Printable ASCII without spaces (what provider API keys consist of). */
export const MEETING_NOTE_AI_KEY_PATTERN = /^[\x21-\x7E]+$/;

/** Whether `value` has the shape of an API key the database accepts. */
export function isPlausibleAiApiKey(value: string): boolean {
  return (
    value.length >= MEETING_NOTE_AI_KEY_MIN_LENGTH &&
    value.length <= MEETING_NOTE_AI_KEY_MAX_LENGTH &&
    MEETING_NOTE_AI_KEY_PATTERN.test(value)
  );
}
