// src/components/meeting-notes/SpaceNotesTab.tsx
// The "Notes" tab of a space's detail surface (FR-003): the space's notes,
// newest meeting date first, each opening its view, plus "New note" and
// "New note from transcript" (FR-012).
// Rendered inside the detail panel / bottom sheet, which are click-stop
// surfaces (data-avatar-interactive); this root repeats the marker and stops
// pointer/click propagation so nothing here can trigger room navigation.
'use client';

import Link from 'next/link';
import { FileText, Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useSpaceMeetingNotes } from '@/hooks/queries/useMeetingNotes';
import { formatMeetingDate } from '@/lib/meeting-notes/format';
import { meetingNotePath, newMeetingNotePath } from '@/lib/meeting-notes/ui-paths';
import { MeetingNoteTranscriptUpload } from './MeetingNoteTranscriptUpload';

export interface SpaceNotesTabProps {
  spaceId: string;
  spaceName: string;
}

export function SpaceNotesTab({ spaceId, spaceName }: SpaceNotesTabProps) {
  const notes = useSpaceMeetingNotes(spaceId);
  const items = notes.data?.pages.flatMap((page) => page.items) ?? [];
  const headingId = `space-notes-${spaceId}`;

  return (
    <div
      className="flex min-h-0 flex-col gap-3"
      data-avatar-interactive="true"
      data-testid="space-notes-tab"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={headingId} className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Meeting notes
        </h4>
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
          <Link href={newMeetingNotePath(spaceId)} data-space-action aria-label={`New note in ${spaceName}`}>
            <Plus className="size-3.5" aria-hidden="true" />
            New note
          </Link>
        </Button>
      </div>
      <MeetingNoteTranscriptUpload mode="create" spaceId={spaceId} spaceName={spaceName} className="flex flex-col items-end gap-1" />

      {notes.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading notes…
        </p>
      ) : notes.isError && items.length === 0 ? (
        <div className="rounded-xl border border-[var(--vo-line-soft)] bg-[var(--vo-bg-2)] p-3 text-sm" role="alert">
          <p className="text-muted-foreground">Notes could not be loaded.</p>
          <Button type="button" size="sm" variant="ghost" className="mt-2 h-8" onClick={() => void notes.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--vo-line-soft)] p-4 text-center text-sm text-muted-foreground">
          No notes for this space yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-labelledby={headingId} data-testid="space-notes-list">
          {items.map((note) => (
            <li key={note.id}>
              <Link
                href={meetingNotePath(note.id)}
                data-space-action
                data-testid="space-note-item"
                className="flex items-start gap-3 rounded-xl border border-[var(--vo-line-soft)] bg-[var(--vo-bg-2)] p-3 transition-colors hover:border-[var(--vo-line)] hover:bg-[var(--vo-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileText className="mt-0.5 size-4 flex-none text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{note.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    <time dateTime={note.meetingDate}>{formatMeetingDate(note.meetingDate)}</time>
                    <span aria-hidden="true"> · </span>
                    {note.authorName}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {notes.isError && items.length > 0 ? (
        <p className="text-xs text-destructive" role="alert">More notes could not be loaded.</p>
      ) : null}

      {notes.hasNextPage ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 self-center"
          disabled={notes.isFetchingNextPage}
          onClick={() => void notes.fetchNextPage()}
        >
          {notes.isFetchingNextPage ? 'Loading…' : 'Load more notes'}
        </Button>
      ) : null}
    </div>
  );
}
