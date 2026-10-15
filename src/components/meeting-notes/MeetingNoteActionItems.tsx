// src/components/meeting-notes/MeetingNoteActionItems.tsx
// The action items of a note (FR-011, BR-005, AC-008, AC-009). Editors add,
// edit, and delete; editors and an item's current assignee toggle its
// completion; everyone else reads. At most 100 items per note: the add
// control says so before the route refuses. The routes and the database stay
// the authority for every rule.
'use client';

import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useCompany } from '@/contexts/CompanyContext';
import { useMeetingNotesScope } from '@/hooks/queries/useMeetingNotes';
import { MEETING_NOTE_ITEM_LIMIT_MESSAGE } from '@/lib/meeting-notes/item-errors';
import { MEETING_NOTE_LIMITS } from '@/lib/meeting-notes/validation';
import type { MeetingNoteActionItemView, MeetingNoteDetail } from '@/types/meeting-notes';
import { MeetingNoteActionItemForm } from './MeetingNoteActionItemForm';
import { MeetingNoteActionItemRow } from './MeetingNoteActionItemRow';

export interface MeetingNoteActionItemsProps {
  note: MeetingNoteDetail;
}

/** BR-005: editors, and the item's assignee while they are a current member. */
function canToggleItem(item: MeetingNoteActionItemView, canEdit: boolean, viewerId: string | null): boolean {
  return canEdit || (viewerId !== null && item.assigneeId === viewerId && item.assigneeIsCurrentMember === true);
}

export function MeetingNoteActionItems({ note }: MeetingNoteActionItemsProps) {
  const scope = useMeetingNotesScope();
  const { companyUsers } = useCompany();
  const membersById = useMemo(() => new Map(companyUsers.map((user) => [user.id, user])), [companyUsers]);
  const [adding, setAdding] = useState(false);

  const viewerId = scope?.userId ?? null;
  const canEdit = note.rights.canEdit;
  const count = note.actionItems.length;
  const full = count >= MEETING_NOTE_LIMITS.maxItemsPerNote;

  return (
    <div className="flex flex-col gap-3" data-testid="meeting-note-action-items" data-count={count}>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">No action items.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Action items">
          {note.actionItems.map((item) => (
            <MeetingNoteActionItemRow
              key={item.id}
              noteId={note.id}
              item={item}
              canEdit={canEdit}
              canToggle={canToggleItem(item, canEdit, viewerId)}
              members={companyUsers}
              membersById={membersById}
            />
          ))}
        </ul>
      )}

      {canEdit ? (
        adding && !full ? (
          <MeetingNoteActionItemForm
            noteId={note.id}
            members={companyUsers}
            membersById={membersById}
            onSaved={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              disabled={full}
              onClick={() => setAdding(true)}
              data-testid="meeting-note-item-add"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add action item
            </Button>
            <span className="text-xs text-muted-foreground">
              {count}/{MEETING_NOTE_LIMITS.maxItemsPerNote}
            </span>
            {full ? (
              <p className="text-sm text-muted-foreground" role="status" data-testid="meeting-note-items-limit">
                {MEETING_NOTE_ITEM_LIMIT_MESSAGE}
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
