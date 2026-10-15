// src/lib/meeting-notes/search-excerpt.ts
// Phase 6 T4 (FR-026): turns the excerpt returned by public.search_meeting_notes
// (migration 20261013114402) into plain-text segments. The database wraps each
// matched word in U+E000 (start) and U+E001 (end) and strips both characters
// from the source text beforehand, so they only ever delimit highlights. The
// excerpt is plain text (content tags removed, entities decoded); the UI must
// render segments as text.
import type {
  MeetingNoteExcerptSegment,
  MeetingNoteSearchExcerpt,
  MeetingNoteSearchField,
} from '@/types/meeting-notes';

export const MEETING_NOTE_HIGHLIGHT_START = String.fromCharCode(0xe000);
export const MEETING_NOTE_HIGHLIGHT_END = String.fromCharCode(0xe001);

/** Upper bound of excerpt text sent to the client (code points). */
export const MEETING_NOTE_EXCERPT_MAX_CHARS = 600;

const FIELDS: ReadonlySet<string> = new Set<MeetingNoteSearchField>(['content', 'summary', 'action_item', 'title']);

function isSearchField(value: string): value is MeetingNoteSearchField {
  return FIELDS.has(value);
}

/** Splits a marked excerpt into segments, capped at MEETING_NOTE_EXCERPT_MAX_CHARS. */
export function parseMeetingNoteExcerpt(
  field: string | null,
  excerpt: string | null
): MeetingNoteSearchExcerpt | null {
  if (field === null || excerpt === null || !isSearchField(field)) return null;

  const segments: MeetingNoteExcerptSegment[] = [];
  let budget = MEETING_NOTE_EXCERPT_MAX_CHARS;
  let highlighted = false;
  let buffer = '';

  const flush = (): void => {
    if (buffer === '' || budget <= 0) {
      buffer = '';
      return;
    }
    const chars = Array.from(buffer);
    const text = chars.length > budget ? `${chars.slice(0, budget).join('')}…` : buffer;
    budget -= Math.min(chars.length, budget);
    const previous = segments[segments.length - 1];
    if (previous && previous.highlighted === highlighted) previous.text += text;
    else segments.push({ text, highlighted });
    buffer = '';
  };

  for (const char of excerpt) {
    if (char === MEETING_NOTE_HIGHLIGHT_START) {
      flush();
      highlighted = true;
    } else if (char === MEETING_NOTE_HIGHLIGHT_END) {
      flush();
      highlighted = false;
    } else {
      buffer += char;
    }
  }
  flush();

  return { field, segments };
}
