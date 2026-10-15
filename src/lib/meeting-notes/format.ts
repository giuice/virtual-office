// src/lib/meeting-notes/format.ts
// Display helpers shared by the meeting-notes lists.

const meetingDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** The meeting date as a local calendar date; the raw value when unparsable. */
export function formatMeetingDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : meetingDateFormatter.format(parsed);
}

/** Label of a note's space; null roomId means the space was deleted (FR-028). */
export function meetingNoteSpaceLabel(
  roomId: string | null,
  spaceNames: ReadonlyMap<string, string>
): { label: string; removed: boolean } {
  if (roomId === null) return { label: 'Space removed', removed: true };
  return { label: spaceNames.get(roomId) ?? 'Unknown space', removed: false };
}

const timestampFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A change time (version, last update) in the viewer's local time; the raw value when unparsable. */
export function formatMeetingNoteTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : timestampFormatter.format(parsed);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An action item's due date (FR-011, AC-009). It is a calendar date, not an
 * instant: it is shown exactly as stored ('YYYY-MM-DD') and never passes
 * through `Date`, so no time zone can move it to another day. null when the
 * value is not a date-only string.
 */
export function formatMeetingNoteDueDate(value: string | null): string | null {
  return value !== null && DATE_ONLY.test(value) ? value : null;
}
