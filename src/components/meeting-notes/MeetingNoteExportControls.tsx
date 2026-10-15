// src/components/meeting-notes/MeetingNoteExportControls.tsx
// "Export Markdown" for any viewer (FR-027, AC-019): downloads the note as a
// .md file built by the server (user and AI text escaped there). "Include
// transcript" is offered only when the note has one. The meeting date is
// written as a calendar day in the viewer's time zone, like the view shows it.
// The download is scope-fenced (useMeetingNotesScopedMutation): leaving the
// note aborts it, and a response that arrives after sign-out or an account
// switch is dropped — never saved as a file in another session.
'use client';

import { Download, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useMeetingNotesScopedMutation } from '@/hooks/mutations/useMeetingNotesScopedMutation';
import { fetchMeetingNoteMarkdown, type MeetingNoteMarkdownFile } from '@/lib/meeting-notes/client-api';
import { describeMeetingNoteError } from '@/lib/meeting-notes/form-errors';
import type { MeetingNoteDetail } from '@/types/meeting-notes';

export interface MeetingNoteExportControlsProps {
  note: Pick<MeetingNoteDetail, 'id' | 'hasTranscript'>;
}

function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Hands a downloaded file to the browser. */
function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser time to start the download before the URL goes away.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function MeetingNoteExportControls({ note }: MeetingNoteExportControlsProps) {
  const checkboxId = useId();
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const exportFile = useMeetingNotesScopedMutation<MeetingNoteMarkdownFile, boolean>({
    name: 'export-note',
    abortOnUnmount: true,
    // The file (which may hold the transcript) leaves the cache once unobserved.
    gcTime: 0,
    mutationFn: (withTranscript, { signal }) =>
      fetchMeetingNoteMarkdown(note.id, { includeTranscript: withTranscript, timeZone: viewerTimeZone() }, signal),
    onSuccess: (file) => saveFile(file.blob, file.filename),
  });

  return (
    <div className="flex flex-col items-end gap-1" data-testid="meeting-note-export">
      <div className="flex flex-wrap items-center gap-2">
        {note.hasTranscript ? (
          <label htmlFor={checkboxId} className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              id={checkboxId}
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={includeTranscript}
              disabled={exportFile.isPending}
              onChange={(event) => setIncludeTranscript(event.target.checked)}
              data-testid="meeting-note-export-include-transcript"
            />
            Include transcript
          </label>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={exportFile.isPending}
          onClick={() => exportFile.mutate(note.hasTranscript && includeTranscript)}
          data-testid="meeting-note-export-button"
        >
          {exportFile.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          Export Markdown
        </Button>
      </div>
      {exportFile.isError ? (
        <p className="text-xs text-destructive" role="alert" data-testid="meeting-note-export-error">
          The export failed. {describeMeetingNoteError(exportFile.error)}
        </p>
      ) : null}
    </div>
  );
}
