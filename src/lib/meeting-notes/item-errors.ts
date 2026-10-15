// src/lib/meeting-notes/item-errors.ts
// User-facing text for action-item request failures (FR-011, AC-008, AC-009)
// and which form field a route's 400 code belongs to. The route and the
// database stay the authority; this only explains their answer.
import { MeetingNotesApiError } from './client-api';
import { describeMeetingNoteError } from './form-errors';
import { MEETING_NOTE_LIMITS } from './validation';

export type MeetingNoteItemField = 'description' | 'assignee' | 'dueDate';

export const MEETING_NOTE_ITEM_LIMIT_MESSAGE = `${MEETING_NOTE_LIMITS.maxItemsPerNote} items maximum: this note already has ${MEETING_NOTE_LIMITS.maxItemsPerNote} action items. Delete one before adding another.`;

const FIELD_ERRORS: Record<string, { field: MeetingNoteItemField; message: string }> = {
  MEETING_NOTE_ITEM_DESCRIPTION_INVALID: {
    field: 'description',
    message: `Enter a description of 1 to ${MEETING_NOTE_LIMITS.itemDescriptionMaxChars.toLocaleString('en-US')} characters.`,
  },
  MEETING_NOTE_ITEM_ASSIGNEE_INVALID: { field: 'assignee', message: 'Choose an assignee from the list.' },
  MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER: {
    field: 'assignee',
    message: 'This person is no longer a member of your company. Choose someone else or leave the item unassigned.',
  },
  MEETING_NOTE_ITEM_DUE_DATE_INVALID: { field: 'dueDate', message: 'Enter a valid due date or leave it empty.' },
};

/** The field a failed item save points at, or null when it is not about one field. */
export function meetingNoteItemFieldError(error: unknown): { field: MeetingNoteItemField; message: string } | null {
  if (!(error instanceof MeetingNotesApiError) || error.status !== 400) return null;
  return FIELD_ERRORS[error.code] ?? null;
}

/** true for the 100-items refusal. */
export function isMeetingNoteItemLimitError(error: unknown): boolean {
  return error instanceof MeetingNotesApiError && error.code === 'MEETING_NOTE_ITEM_LIMIT_REACHED';
}

/** What happened and what to do, for a failed action-item change. */
export function describeMeetingNoteItemError(error: unknown): string {
  if (isMeetingNoteItemLimitError(error)) return MEETING_NOTE_ITEM_LIMIT_MESSAGE;
  const field = meetingNoteItemFieldError(error);
  if (field) return field.message;
  if (error instanceof MeetingNotesApiError) {
    switch (error.status) {
      case 403:
        return 'You do not have permission to change this action item.';
      case 404:
        return error.code === 'MEETING_NOTE_ITEM_NOT_FOUND'
          ? 'This action item no longer exists. The list was refreshed.'
          : 'This note no longer exists or you no longer have access to it.';
      case 409:
        return 'This action item was changed by someone else. Review the newer version and try again.';
      default:
        break;
    }
  }
  return describeMeetingNoteError(error);
}
