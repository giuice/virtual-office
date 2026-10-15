// src/components/meeting-notes/MeetingNoteActionItemConflictNotice.tsx
// Conflict feedback for one action item (FR-011, §11): someone else changed
// it first, so nothing was saved. Shows the item as it is now (description as
// plain text, assignee, due date, status, revision) and the caller's choices.
'use client';

import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { formatMeetingNoteDueDate } from '@/lib/meeting-notes/format';
import type { User } from '@/types/database';
import type { MeetingNoteActionItemView } from '@/types/meeting-notes';
import { MeetingNoteActionItemAssignee } from './MeetingNoteActionItemAssignee';

export interface MeetingNoteActionItemConflictNoticeProps {
  /** The item as the route returned it with the 409. */
  newer: MeetingNoteActionItemView;
  membersById: ReadonlyMap<string, User>;
  message: string;
  /** Buttons offering what to do next. */
  children?: ReactNode;
}

export function MeetingNoteActionItemConflictNotice({ newer, membersById, message, children }: MeetingNoteActionItemConflictNoticeProps) {
  const due = formatMeetingNoteDueDate(newer.dueDate);
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      role="alert"
      data-testid="meeting-note-item-conflict"
      data-revision={newer.revision}
    >
      <p className="font-medium">{message}</p>
      <div className="flex flex-col gap-1 rounded-md bg-background/70 p-2" aria-label="Newer version of the action item">
        <p className="whitespace-pre-wrap break-words" data-testid="meeting-note-item-conflict-description">
          {newer.description}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <MeetingNoteActionItemAssignee item={newer} membersById={membersById} />
          <span>{due ? `Due ${due}` : 'No due date'}</span>
          <span>{newer.completed ? 'Done' : 'Open'}</span>
          <Badge variant="outline" className="text-[10px]">
            Revision {newer.revision}
          </Badge>
        </div>
      </div>
      {children ? <div className="flex flex-wrap justify-end gap-2">{children}</div> : null}
    </div>
  );
}
