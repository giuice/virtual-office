// src/components/meeting-notes/MeetingNoteActionItemRow.tsx
// One action item (FR-011, BR-005, AC-008, AC-009): description as plain
// text, assignee, due date exactly as stored, and status. Editors and the
// item's current assignee get the completion checkbox; everyone else sees the
// status only. Editors also edit and delete. A completion that lost a race
// shows the newer item and offers to try again on it.
'use client';

import { Pencil } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSetMeetingNoteActionItemCompleted } from '@/hooks/mutations/useMeetingNoteActionItemMutations';
import { MeetingNoteItemConflictError } from '@/lib/meeting-notes/client-api';
import { formatMeetingNoteDueDate } from '@/lib/meeting-notes/format';
import { describeMeetingNoteItemError } from '@/lib/meeting-notes/item-errors';
import { cn } from '@/lib/utils';
import type { User } from '@/types/database';
import type { MeetingNoteActionItemView } from '@/types/meeting-notes';
import { MeetingNoteActionItemAssignee } from './MeetingNoteActionItemAssignee';
import { MeetingNoteActionItemConflictNotice } from './MeetingNoteActionItemConflictNotice';
import { MeetingNoteActionItemDeleteButton } from './MeetingNoteActionItemDeleteButton';
import { MeetingNoteActionItemForm } from './MeetingNoteActionItemForm';

export interface MeetingNoteActionItemRowProps {
  noteId: string;
  item: MeetingNoteActionItemView;
  /** Note editor: edit, delete, and completion. */
  canEdit: boolean;
  /** Editor or the item's current assignee. */
  canToggle: boolean;
  members: readonly User[];
  membersById: ReadonlyMap<string, User>;
}

const LABEL_PREVIEW_CHARS = 80;

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > LABEL_PREVIEW_CHARS ? `${flat.slice(0, LABEL_PREVIEW_CHARS)}…` : flat;
}

export function MeetingNoteActionItemRow({ noteId, item, canEdit, canToggle, members, membersById }: MeetingNoteActionItemRowProps) {
  const toggle = useSetMeetingNoteActionItemCompleted();
  const [editing, setEditing] = useState(false);
  const [conflict, setConflict] = useState<{ newer: MeetingNoteActionItemView; wanted: boolean } | null>(null);
  const due = formatMeetingNoteDueDate(item.dueDate);

  const setCompleted = (completed: boolean, expectedRevision: number) => {
    setConflict(null);
    toggle.mutate(
      { noteId, itemId: item.id, expectedRevision, completed },
      {
        onError: (error) => {
          if (error instanceof MeetingNoteItemConflictError) setConflict({ newer: error.item, wanted: completed });
        },
      }
    );
  };

  if (editing) {
    return (
      <li data-testid="meeting-note-item" data-item-id={item.id} data-editing="true">
        <MeetingNoteActionItemForm
          noteId={noteId}
          item={item}
          members={members}
          membersById={membersById}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      className="flex flex-col gap-2 rounded-lg border border-[var(--vo-line-soft)] p-3"
      data-testid="meeting-note-item"
      data-item-id={item.id}
      data-completed={item.completed ? 'true' : 'false'}
      data-revision={item.revision}
    >
      <div className="flex items-start gap-3">
        {canToggle ? (
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
            checked={item.completed}
            disabled={toggle.isPending}
            aria-label={`Done: ${preview(item.description)}`}
            onChange={(event) => setCompleted(event.target.checked, item.revision)}
            data-testid="meeting-note-item-toggle"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p
            className={cn('whitespace-pre-wrap break-words text-sm', item.completed && 'text-muted-foreground line-through')}
            data-testid="meeting-note-item-description"
          >
            {item.description}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <MeetingNoteActionItemAssignee item={item} membersById={membersById} />
            {due ? (
              <span data-testid="meeting-note-item-due">
                Due <time dateTime={due}>{due}</time>
              </span>
            ) : (
              <span data-testid="meeting-note-item-due" data-empty="true">
                No due date
              </span>
            )}
            <Badge
              variant={item.completed ? 'secondary' : 'outline'}
              className="text-[10px]"
              data-testid="meeting-note-item-status"
            >
              {item.completed ? 'Done' : 'Open'}
            </Badge>
          </div>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="Edit action item"
              onClick={() => setEditing(true)}
              data-testid="meeting-note-item-edit"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <MeetingNoteActionItemDeleteButton noteId={noteId} item={item} membersById={membersById} />
          </div>
        ) : null}
      </div>

      {conflict ? (
        <MeetingNoteActionItemConflictNotice
          newer={conflict.newer}
          membersById={membersById}
          message={
            conflict.newer.completed === conflict.wanted
              ? `This action item was changed by someone else. It is already ${conflict.wanted ? 'done' : 'open'}.`
              : 'This action item was changed by someone else, so your change was not saved.'
          }
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setConflict(null);
              toggle.reset();
            }}
          >
            Dismiss
          </Button>
          {conflict.newer.completed !== conflict.wanted && canToggle ? (
            <Button
              type="button"
              size="sm"
              disabled={toggle.isPending}
              onClick={() => setCompleted(conflict.wanted, conflict.newer.revision)}
              data-testid="meeting-note-item-conflict-retry"
            >
              {conflict.wanted ? 'Mark as done again' : 'Mark as open again'}
            </Button>
          ) : null}
        </MeetingNoteActionItemConflictNotice>
      ) : toggle.isError ? (
        <p className="text-xs text-destructive" role="alert" data-testid="meeting-note-item-error">
          {describeMeetingNoteItemError(toggle.error)}
        </p>
      ) : null}
    </li>
  );
}
