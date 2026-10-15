// src/components/meeting-notes/MeetingNoteActionItemForm.tsx
// Add or edit an action item (FR-011, AC-008, AC-009): description (plain
// text, 1–1,000 characters), optional assignee from the current members,
// optional due date as a calendar date ('YYYY-MM-DD' from the date input,
// sent and shown as is — never converted through `Date`). An edit that lost
// a race shows the newer item and lets the user save again on it or load it.
'use client';

import { Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateMeetingNoteActionItem,
  useUpdateMeetingNoteActionItem,
} from '@/hooks/mutations/useMeetingNoteActionItemMutations';
import { MeetingNoteItemConflictError } from '@/lib/meeting-notes/client-api';
import {
  describeMeetingNoteItemError,
  meetingNoteItemFieldError,
  type MeetingNoteItemField,
} from '@/lib/meeting-notes/item-errors';
import { codePointLength, MEETING_NOTE_LIMITS } from '@/lib/meeting-notes/validation';
import type { User } from '@/types/database';
import type { MeetingNoteActionItemFieldsInput, MeetingNoteActionItemView } from '@/types/meeting-notes';
import { MeetingNoteActionItemAssigneeSelect } from './MeetingNoteActionItemAssigneeSelect';
import { MeetingNoteActionItemConflictNotice } from './MeetingNoteActionItemConflictNotice';

export interface MeetingNoteActionItemFormProps {
  noteId: string;
  /** The item being edited; omitted to add a new one. */
  item?: MeetingNoteActionItemView;
  members: readonly User[];
  membersById: ReadonlyMap<string, User>;
  onSaved: () => void;
  onCancel: () => void;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function storedAssigneeOf(item: MeetingNoteActionItemView | undefined) {
  if (!item || item.assigneeId === null) return null;
  return {
    id: item.assigneeId,
    name: item.assigneeName ?? 'Unknown member',
    isFormerMember: item.assigneeIsCurrentMember !== true,
  };
}

export function MeetingNoteActionItemForm({ noteId, item, members, membersById, onSaved, onCancel }: MeetingNoteActionItemFormProps) {
  const create = useCreateMeetingNoteActionItem();
  const update = useUpdateMeetingNoteActionItem();
  const ids = {
    description: useId(),
    descriptionError: useId(),
    assignee: useId(),
    assigneeError: useId(),
    dueDate: useId(),
    dueDateError: useId(),
  };

  const [description, setDescription] = useState(item?.description ?? '');
  const [assigneeId, setAssigneeId] = useState<string | null>(item?.assigneeId ?? null);
  const [dueDate, setDueDate] = useState(item?.dueDate ?? '');
  const [storedAssignee, setStoredAssignee] = useState(() => storedAssigneeOf(item));
  const [baseRevision, setBaseRevision] = useState(item?.revision ?? 0);
  const [errors, setErrors] = useState<Partial<Record<MeetingNoteItemField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<MeetingNoteActionItemView | null>(null);

  const submitting = create.isPending || update.isPending;
  const length = codePointLength(description.trim());

  const save = (expectedRevision: number) => {
    const trimmed = description.trim();
    const nextErrors: Partial<Record<MeetingNoteItemField, string>> = {};
    if (length < 1 || length > MEETING_NOTE_LIMITS.itemDescriptionMaxChars) {
      nextErrors.description = `Enter a description of 1 to ${MEETING_NOTE_LIMITS.itemDescriptionMaxChars.toLocaleString('en-US')} characters.`;
    }
    if (dueDate !== '' && !DATE_ONLY.test(dueDate)) {
      nextErrors.dueDate = 'Enter a valid due date or leave it empty.';
    }
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    const fields: MeetingNoteActionItemFieldsInput = {
      description: trimmed,
      assigneeId,
      dueDate: dueDate === '' ? null : dueDate,
    };
    const handlers = {
      onSuccess: () => {
        setConflict(null);
        onSaved();
      },
      onError: (error: unknown) => {
        if (error instanceof MeetingNoteItemConflictError) {
          setConflict(error.item);
          return;
        }
        const field = meetingNoteItemFieldError(error);
        if (field) {
          setErrors({ [field.field]: field.message });
          return;
        }
        setFormError(describeMeetingNoteItemError(error));
      },
    };
    if (item) {
      update.mutate({ noteId, itemId: item.id, expectedRevision, fields }, handlers);
    } else {
      create.mutate({ noteId, fields }, handlers);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!submitting) save(baseRevision);
  };

  const saveOverNewer = () => {
    if (!conflict) return;
    setBaseRevision(conflict.revision);
    save(conflict.revision);
  };

  const loadNewer = () => {
    if (!conflict) return;
    setDescription(conflict.description);
    setAssigneeId(conflict.assigneeId);
    setDueDate(conflict.dueDate ?? '');
    setStoredAssignee(storedAssigneeOf(conflict));
    setBaseRevision(conflict.revision);
    setErrors({});
    setConflict(null);
  };

  const fieldError = (id: string, message: string | undefined) =>
    message ? (
      <p id={id} className="text-xs text-destructive" role="alert">
        {message}
      </p>
    ) : null;

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-[var(--vo-line-soft)] bg-[var(--vo-bg-2)] p-3"
      noValidate
      onSubmit={handleSubmit}
      aria-busy={submitting}
      aria-label={item ? 'Edit action item' : 'New action item'}
      data-testid="meeting-note-item-form"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.description}>Description</Label>
        <Textarea
          id={ids.description}
          value={description}
          rows={2}
          required
          autoFocus
          aria-invalid={errors.description ? 'true' : 'false'}
          aria-describedby={errors.description ? ids.descriptionError : undefined}
          onChange={(event) => setDescription(event.target.value)}
          disabled={submitting}
          data-testid="meeting-note-item-description-input"
        />
        <div className="flex justify-between gap-2">
          {fieldError(ids.descriptionError, errors.description) ?? <span />}
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {length}/{MEETING_NOTE_LIMITS.itemDescriptionMaxChars.toLocaleString('en-US')}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.assignee}>Assignee</Label>
          <MeetingNoteActionItemAssigneeSelect
            id={ids.assignee}
            value={assigneeId}
            members={members}
            storedAssignee={storedAssignee}
            disabled={submitting}
            invalid={Boolean(errors.assignee)}
            describedById={errors.assignee ? ids.assigneeError : undefined}
            onChange={setAssigneeId}
          />
          {fieldError(ids.assigneeError, errors.assignee)}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.dueDate}>Due date</Label>
          <Input
            id={ids.dueDate}
            type="date"
            className="h-9"
            value={dueDate}
            aria-invalid={errors.dueDate ? 'true' : 'false'}
            aria-describedby={errors.dueDate ? ids.dueDateError : undefined}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={submitting}
            data-testid="meeting-note-item-due-input"
          />
          {fieldError(ids.dueDateError, errors.dueDate)}
        </div>
      </div>

      {conflict ? (
        <MeetingNoteActionItemConflictNotice
          newer={conflict}
          membersById={membersById}
          message="This action item was changed by someone else. Your changes were not saved."
        >
          <Button type="button" size="sm" variant="ghost" onClick={loadNewer} disabled={submitting}>
            Load the newer version
          </Button>
          <Button type="button" size="sm" onClick={saveOverNewer} disabled={submitting} data-testid="meeting-note-item-conflict-retry">
            Save my changes again
          </Button>
        </MeetingNoteActionItemConflictNotice>
      ) : null}

      {formError ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="meeting-note-item-form-error"
        >
          {formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting || conflict !== null} data-testid="meeting-note-item-save">
          {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
          {item ? 'Save item' : 'Add item'}
        </Button>
      </div>
    </form>
  );
}
