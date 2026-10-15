// src/components/meeting-notes/MeetingNoteExcerpt.tsx
// A search excerpt (FR-026). Segments are plain text from the server; matches
// are wrapped in <mark> elements created here. Never rendered as HTML.
import type { MeetingNoteSearchExcerpt, MeetingNoteSearchField } from '@/types/meeting-notes';

const FIELD_LABELS: Record<MeetingNoteSearchField, string> = {
  title: 'Title',
  content: 'Notes',
  summary: 'Summary',
  action_item: 'Action item',
};

export function MeetingNoteExcerpt({ excerpt }: { excerpt: MeetingNoteSearchExcerpt }) {
  return (
    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground" data-testid="meeting-note-excerpt">
      <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
        {FIELD_LABELS[excerpt.field] ?? 'Match'}:
      </span>
      {excerpt.segments.map((segment, index) =>
        segment.highlighted ? (
          <mark key={index} className="rounded-sm bg-[var(--vo-cyan-soft)] px-0.5 text-foreground">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </p>
  );
}
