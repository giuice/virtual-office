// src/components/meeting-notes/MeetingNoteDeleteButton.tsx
// Delete a note after confirmation (FR-010, AC-007, J10). Offered only when
// the note view says the viewer may delete (author or admin); the route and
// the database decide. Deleting removes the note, its versions, participants,
// action items, and transcript; then the Meetings page opens. The revision
// is captured when the confirmation opens; a 409 shows the newer state and
// needs a new, explicit confirmation.
'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useDeleteMeetingNote } from '@/hooks/mutations/useMeetingNoteMutations';
import { useNotification } from '@/hooks/useNotification';
import { MeetingNoteConflictError } from '@/lib/meeting-notes/client-api';
import { formatMeetingNoteTimestamp } from '@/lib/meeting-notes/format';
import { describeMeetingNoteError } from '@/lib/meeting-notes/form-errors';
import { MEETINGS_PATH } from '@/lib/meeting-notes/ui-paths';
import type { MeetingNoteDetail } from '@/types/meeting-notes';

export interface MeetingNoteDeleteButtonProps {
  /** The note as currently cached; its revision is captured when the confirmation opens. */
  note: MeetingNoteDetail;
  /** Called once the note is gone, before the Meetings page opens. */
  onDeleted: () => void;
}

/** What the confirmation shows and deletes: fixed when it opens, never the live note. */
interface DeleteTarget {
  revision: number;
  title: string;
  /** Set after a 409: the newer state the user must confirm again. */
  changed: boolean;
}

export function MeetingNoteDeleteButton({ note, onDeleted }: MeetingNoteDeleteButtonProps) {
  const router = useRouter();
  const remove = useDeleteMeetingNote();
  const { showSuccess } = useNotification();
  const [target, setTarget] = useState<DeleteTarget | null>(null);

  const confirm = () => {
    if (!target) return;
    // Only the revision the user saw in this dialog: a background refetch of
    // the note never changes what "Delete" applies to (block B review B-4).
    remove.mutate(
      { noteId: note.id, expectedRevision: target.revision },
      {
        onSuccess: () => {
          setTarget(null);
          onDeleted();
          showSuccess({ description: 'Meeting note deleted.' });
          router.replace(MEETINGS_PATH);
        },
        onError: (error) => {
          if (error instanceof MeetingNoteConflictError) {
            setTarget({ revision: error.note.revision, title: error.note.title, changed: true });
          }
        },
      }
    );
  };

  const conflictError = remove.error instanceof MeetingNoteConflictError ? remove.error : null;

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        remove.reset();
        setTarget(next ? { revision: note.revision, title: note.title, changed: false } : null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" data-testid="meeting-note-delete-button">
          <Trash2 className="size-4" aria-hidden="true" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="meeting-note-delete-dialog" data-revision={target?.revision}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this meeting note?</AlertDialogTitle>
          <AlertDialogDescription>
            &quot;{target?.title ?? note.title}&quot; (revision {target?.revision ?? note.revision}) will be permanently
            deleted with its version history, participants, action items, and transcript. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {conflictError ? (
          <div
            className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            role="alert"
            data-testid="meeting-note-delete-conflict"
          >
            <p className="font-medium">This note was changed by someone else, so nothing was deleted.</p>
            <p>
              It is now revision {conflictError.note.revision}, &quot;{conflictError.note.title}&quot;, updated{' '}
              {formatMeetingNoteTimestamp(conflictError.note.updatedAt)}. Review it, then delete this newer version
              only if you still want to.
            </p>
          </div>
        ) : remove.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {describeMeetingNoteError(remove.error)}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
            data-testid="meeting-note-delete-confirm"
          >
            {remove.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
            {target?.changed ? 'Delete newer version' : 'Delete note'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
