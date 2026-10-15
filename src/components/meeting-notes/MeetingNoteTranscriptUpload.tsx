// src/components/meeting-notes/MeetingNoteTranscriptUpload.tsx
// Transcript file pickers (Phase 6 FR-012, FR-013, J5/J6):
//   * mode "create" — "New note from transcript" in a space: the note is
//     created at upload (title = file name, date = today) and its view opens;
//   * mode "attach" — "Attach transcript" / "Replace transcript" on a note
//     (editors only): replaces the stored transcript immediately, against the
//     note's revision (409 → the newer note is shown; try again on it).
// The browser pre-checks extension, emptiness, and size (≤1 MB) to answer
// fast; the route stays the authority (UTF-8/binary checks, limits) and its
// refusal is shown as is. Every request runs through the scope fence. The
// button carries data-space-action so a parent clickable surface (space
// detail panel) never treats it as navigation.
'use client';

import { useRouter } from 'next/navigation';
import { FileUp, Loader2 } from 'lucide-react';
import { useId, useRef, useState, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  useAttachMeetingNoteTranscript,
  useCreateMeetingNoteFromTranscript,
} from '@/hooks/mutations/useMeetingNoteTranscriptMutations';
import { useNotification } from '@/hooks/useNotification';
import { MeetingNoteConflictError, MeetingNotesApiError } from '@/lib/meeting-notes/client-api';
import { describeMeetingNoteError } from '@/lib/meeting-notes/form-errors';
import { meetingNotePath } from '@/lib/meeting-notes/ui-paths';
import { MEETING_NOTE_TRANSCRIPT_LIMITS } from '@/lib/meeting-notes/validation';
import type { MeetingNoteDetail } from '@/types/meeting-notes';

export type MeetingNoteTranscriptUploadProps =
  | { mode: 'create'; spaceId: string; spaceName: string; className?: string }
  | { mode: 'attach'; note: MeetingNoteDetail; className?: string };

const ACCEPT = [...MEETING_NOTE_TRANSCRIPT_LIMITS.extensions, 'text/plain', 'text/vtt'].join(',');

/** A message when the file is certainly refused; null to let the route decide. */
function precheck(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!MEETING_NOTE_TRANSCRIPT_LIMITS.extensions.some((extension) => name.endsWith(extension))) {
    return 'The transcript must be a .txt, .vtt, or .srt file.';
  }
  if (file.size === 0) return 'The transcript file is empty.';
  if (file.size > MEETING_NOTE_TRANSCRIPT_LIMITS.maxBytes) return 'The transcript file must be at most 1 MB.';
  return null;
}

function describeUploadError(error: unknown): string {
  if (error instanceof MeetingNoteConflictError) {
    return 'This note was changed by someone else. The latest version is shown; attach the transcript again if you still want to replace it.';
  }
  if (error instanceof MeetingNotesApiError && error.code.startsWith('MEETING_NOTE_TRANSCRIPT_')) return error.message;
  if (error instanceof MeetingNotesApiError && error.status === 413) return 'The transcript file must be at most 1 MB.';
  return describeMeetingNoteError(error);
}

export function MeetingNoteTranscriptUpload(props: MeetingNoteTranscriptUploadProps) {
  const router = useRouter();
  const { showSuccess } = useNotification();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const create = useCreateMeetingNoteFromTranscript();
  const attach = useAttachMeetingNoteTranscript();
  const pending = create.isPending || attach.isPending;

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    // Let the same file be chosen again after a refusal.
    event.target.value = '';
    if (!file) return;
    const refused = precheck(file);
    if (refused) {
      setError(refused);
      return;
    }
    setError(null);
    if (props.mode === 'create') {
      create.mutate(
        { spaceId: props.spaceId, file },
        {
          onSuccess: (note) => router.push(meetingNotePath(note.id)),
          onError: (failure) => setError(describeUploadError(failure)),
        }
      );
    } else {
      attach.mutate(
        { noteId: props.note.id, expectedRevision: props.note.revision, file },
        {
          onSuccess: () => showSuccess({ description: 'Transcript attached. The previous transcript was replaced.' }),
          onError: (failure) => setError(describeUploadError(failure)),
        }
      );
    }
  };

  const label =
    props.mode === 'create'
      ? 'New note from transcript'
      : props.note.hasTranscript
        ? 'Replace transcript'
        : 'Attach transcript';
  const accessibleName = props.mode === 'create' ? `New note from transcript in ${props.spaceName}` : label;

  return (
    <div className={props.className ?? 'flex flex-col gap-1.5'} data-testid={`meeting-note-transcript-upload-${props.mode}`}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFile}
        data-testid="meeting-note-transcript-file-input"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 w-fit gap-1.5"
        disabled={pending}
        aria-label={accessibleName}
        aria-describedby={error ? errorId : undefined}
        onClick={() => inputRef.current?.click()}
        data-space-action
        data-testid={props.mode === 'create' ? 'meeting-note-new-from-transcript' : 'meeting-note-attach-transcript'}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <FileUp className="size-3.5" aria-hidden="true" />}
        {pending ? 'Uploading…' : label}
      </Button>
      {props.mode === 'create' ? null : (
        <p className="text-xs text-muted-foreground">.txt, .vtt, or .srt, at most 1 MB. Replaces the stored transcript.</p>
      )}
      {error ? (
        <p id={errorId} className="text-xs text-destructive" role="alert" data-testid="meeting-note-transcript-upload-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
