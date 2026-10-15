// src/components/meeting-notes/MeetingNoteResultItem.tsx
// One note on the Meetings page: title, meeting date, space (or "Space
// removed"), author, and the matched excerpt when searching.
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { formatMeetingDate, meetingNoteSpaceLabel } from '@/lib/meeting-notes/format';
import { meetingNotePath } from '@/lib/meeting-notes/ui-paths';
import type { MeetingNoteSearchResult } from '@/types/meeting-notes';
import { MeetingNoteExcerpt } from './MeetingNoteExcerpt';

export interface MeetingNoteResultItemProps {
  note: MeetingNoteSearchResult;
  spaceNames: ReadonlyMap<string, string>;
}

export function MeetingNoteResultItem({ note, spaceNames }: MeetingNoteResultItemProps) {
  const space = meetingNoteSpaceLabel(note.roomId, spaceNames);

  return (
    <li data-testid="meeting-note-result" data-note-id={note.id}>
      <Link
        href={meetingNotePath(note.id)}
        className="block rounded-xl border border-[var(--vo-line-soft)] bg-card p-4 transition-colors hover:border-[var(--vo-line)] hover:bg-[var(--vo-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="min-w-0 break-words text-base font-semibold text-foreground">{note.title}</h3>
          <time dateTime={note.meetingDate} className="flex-none text-xs text-muted-foreground">
            {formatMeetingDate(note.meetingDate)}
          </time>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {space.removed ? (
            <Badge variant="outline" className="text-[11px]" data-testid="meeting-note-space-removed">
              {space.label}
            </Badge>
          ) : (
            <span data-testid="meeting-note-space">{space.label}</span>
          )}
          <span aria-hidden="true">·</span>
          <span>{note.authorName}</span>
        </p>
        {note.excerpt ? <MeetingNoteExcerpt excerpt={note.excerpt} /> : null}
      </Link>
    </li>
  );
}
