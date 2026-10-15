// src/lib/meeting-notes/form-errors.ts
// User-facing text for meeting-note request failures, and which form field a
// route's 400 code belongs to (FR-001, AC-002). The route stays the authority;
// this only places its answer next to the right field.
import { MeetingNotesApiError } from './client-api';

export type MeetingNoteFormField = 'title' | 'date' | 'participants' | 'content';

const FIELD_ERRORS: Record<string, { field: MeetingNoteFormField; message: string }> = {
  MEETING_NOTE_TITLE_INVALID: { field: 'title', message: 'Enter a title of 1 to 200 characters.' },
  MEETING_NOTE_DATE_REQUIRED: { field: 'date', message: 'Choose the meeting date.' },
  MEETING_NOTE_CONTENT_TOO_LONG: { field: 'content', message: 'The notes are too long (at most 100,000 characters).' },
  MEETING_NOTE_CONTENT_REQUIRED: { field: 'content', message: 'The notes could not be read. Try again.' },
  MEETING_NOTE_TOO_MANY_PARTICIPANTS: { field: 'participants', message: 'A note can have at most 50 participants.' },
  MEETING_NOTE_PARTICIPANTS_INVALID: { field: 'participants', message: 'The participant list is invalid. Remove and add them again.' },
  MEETING_NOTE_PARTICIPANT_NOT_MEMBER: {
    field: 'participants',
    message: 'Someone you added is no longer a member of your company. Remove them and try again.',
  },
};

/** The field a failed save points at, or null when it is not about one field. */
export function meetingNoteFieldError(error: unknown): { field: MeetingNoteFormField; message: string } | null {
  if (!(error instanceof MeetingNotesApiError) || error.status !== 400) return null;
  return FIELD_ERRORS[error.code] ?? null;
}

/** What happened and what to do, for a failed note change. */
export function describeMeetingNoteError(error: unknown): string {
  if (error instanceof MeetingNotesApiError) {
    const field = meetingNoteFieldError(error);
    if (field) return field.message;
    switch (error.status) {
      case 0:
        return 'Could not reach the server. Check your connection and try again.';
      case 401:
        return 'Your session has ended. Sign in again to continue.';
      case 403:
        return 'You do not have permission to change this note.';
      case 404:
        return error.code === 'MEETING_NOTE_SPACE_NOT_FOUND'
          ? 'This space no longer exists. Choose another space.'
          : error.code === 'MEETING_NOTE_VERSION_NOT_FOUND'
            ? 'This version no longer exists.'
            : 'This note no longer exists or you no longer have access to it.';
      case 409:
        return 'This note was changed by someone else. Review the newer version and try again.';
      case 413:
        return 'The notes are too large to save.';
      case 429:
        return 'Too many changes in a short time. Wait a moment and try again.';
      default:
        if (error.status >= 500) return 'Something went wrong on the server. Try again.';
        return error.message || 'The request could not be completed.';
    }
  }
  return 'Something went wrong. Try again.';
}
