// src/components/meeting-notes/MeetingNoteTranscriptSection.tsx
// The stored transcript of a note (FR-005): its presence is always shown;
// the text (up to 1 MB) is fetched only when the viewer opens it and is
// rendered as plain text, never as HTML.
'use client';

import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useMeetingNoteTranscript } from '@/hooks/queries/useMeetingNote';
import { describeMeetingNoteError } from '@/lib/meeting-notes/form-errors';

export interface MeetingNoteTranscriptSectionProps {
  noteId: string;
  transcriptId: string | null;
}

export function MeetingNoteTranscriptSection({ noteId, transcriptId }: MeetingNoteTranscriptSectionProps) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const transcript = useMeetingNoteTranscript(noteId, transcriptId, open);

  if (!transcriptId) {
    return <p className="text-sm text-muted-foreground">No transcript attached.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit gap-1.5"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
        data-testid="meeting-note-transcript-toggle"
      >
        {open ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
        {open ? 'Hide transcript' : 'Show transcript'}
      </Button>
      {open ? (
        <div id={regionId}>
          {transcript.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading transcript…
            </p>
          ) : transcript.isError ? (
            <div className="flex flex-col gap-2" role="alert">
              <p className="text-sm text-destructive">{describeMeetingNoteError(transcript.error)}</p>
              <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => void transcript.refetch()}>
                Try again
              </Button>
            </div>
          ) : transcript.data ? (
            <pre
              className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-sans text-sm"
              data-testid="meeting-note-transcript"
              aria-label="Transcript"
              tabIndex={0}
            >
              {transcript.data}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">The transcript is no longer stored.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
