// src/components/meeting-notes/MeetingNoteActionItemDeleteButton.tsx
// Delete an action item after confirmation (FR-011; editors only — the route
// and the database decide). The confirmation shows and deletes the item as
// it was when the dialog opened (never a version a background refetch brought
// in meanwhile). If the item changed, nothing is deleted: the newer item is
// shown and the user may confirm again to delete that one.
'use client';

import { Loader2, Trash2 } from 'lucide-react';
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
import { useDeleteMeetingNoteActionItem } from '@/hooks/mutations/useMeetingNoteActionItemMutations';
import { MeetingNoteItemConflictError } from '@/lib/meeting-notes/client-api';
import { describeMeetingNoteItemError } from '@/lib/meeting-notes/item-errors';
import type { User } from '@/types/database';
import type { MeetingNoteActionItemView } from '@/types/meeting-notes';
import { MeetingNoteActionItemConflictNotice } from './MeetingNoteActionItemConflictNotice';

export interface MeetingNoteActionItemDeleteButtonProps {
  noteId: string;
  /** The item as currently cached; captured when the confirmation opens. */
  item: MeetingNoteActionItemView;
  membersById: ReadonlyMap<string, User>;
}

export function MeetingNoteActionItemDeleteButton({ noteId, item, membersById }: MeetingNoteActionItemDeleteButtonProps) {
  const remove = useDeleteMeetingNoteActionItem();
  /** The item this dialog deletes: fixed when it opens, replaced only by a 409's newer item. */
  const [target, setTarget] = useState<MeetingNoteActionItemView | null>(null);
  const [conflict, setConflict] = useState<MeetingNoteActionItemView | null>(null);
  const open = target !== null;

  const confirm = () => {
    if (!target) return;
    remove.mutate(
      { noteId, itemId: target.id, expectedRevision: target.revision },
      {
        onSuccess: () => {
          setConflict(null);
          setTarget(null);
        },
        onError: (error) => {
          if (error instanceof MeetingNoteItemConflictError) {
            // The user confirms again against the newer item they are shown.
            setConflict(error.item);
            setTarget(error.item);
          }
        },
      }
    );
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        remove.reset();
        setConflict(null);
        setTarget(next ? item : null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          aria-label="Delete action item"
          data-testid="meeting-note-item-delete"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this action item?</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-wrap break-words">
            {`"${(target ?? item).description}" will be permanently deleted.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {conflict ? (
          <MeetingNoteActionItemConflictNotice
            newer={conflict}
            membersById={membersById}
            message="This action item was changed by someone else, so it was not deleted. This is the newer version; delete it anyway?"
          />
        ) : remove.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {describeMeetingNoteItemError(remove.error)}
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
            data-testid="meeting-note-item-delete-confirm"
          >
            {remove.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
            {conflict ? 'Delete anyway' : 'Delete item'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
