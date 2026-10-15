// src/components/meeting-notes/MeetingNoteForm.tsx
// Create / edit form of a meeting note (FR-001, FR-002, FR-030): title
// (1–200), meeting date (a local day), participants (≤ 50, current members;
// former members already listed may stay), and rich text (≤ 100,000
// characters after sanitization). Mirrors the route limits and places the
// route's 400 codes next to their field; the route stays the authority.
'use client';

import { Loader2 } from 'lucide-react';
import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCompany } from '@/contexts/CompanyContext';
import type { MeetingNoteFieldsPayload } from '@/lib/meeting-notes/client-api';
import { sanitizeMeetingNoteHtml } from '@/lib/meeting-notes/content-sanitizer';
import { describeMeetingNoteError, meetingNoteFieldError, type MeetingNoteFormField } from '@/lib/meeting-notes/form-errors';
import { localDayOf, meetingDateFromLocalDay } from '@/lib/meeting-notes/period';
import { codePointLength, MEETING_NOTE_LIMITS } from '@/lib/meeting-notes/validation';
import type { MeetingNoteParticipant } from '@/types/meeting-notes';
import { MeetingNoteParticipantPicker } from './MeetingNoteParticipantPicker';
import { MeetingNoteRichTextEditorLazy } from './MeetingNoteRichTextEditorLazy';

export interface MeetingNoteFormInitialValues {
  title: string;
  /** ISO instant; null = today. */
  meetingDate: string | null;
  participants: MeetingNoteParticipant[];
  /** Saved (sanitized) HTML. */
  content: string;
}

export interface MeetingNoteFormProps {
  initial: MeetingNoteFormInitialValues;
  submitLabel: string;
  submitting: boolean;
  /** The last failed save, shown next to its field or above the buttons. */
  submitError: unknown;
  onSubmit: (fields: MeetingNoteFieldsPayload) => void;
  onCancel: () => void;
  /** Shown above the fields (e.g. the space the note belongs to). */
  header?: ReactNode;
}

type FieldErrors = Partial<Record<MeetingNoteFormField, string>>;

function todayLocalDay(): string {
  return localDayOf(new Date().toISOString());
}

export function MeetingNoteForm({
  initial,
  submitLabel,
  submitting,
  submitError,
  onSubmit,
  onCancel,
  header,
}: MeetingNoteFormProps) {
  const ids = {
    title: useId(),
    titleError: useId(),
    date: useId(),
    dateError: useId(),
    participantsLabel: useId(),
    participantsError: useId(),
    contentLabel: useId(),
    contentError: useId(),
    editor: useId(),
  };
  const { company, companyUsers } = useCompany();
  const members = useMemo(
    () => companyUsers.filter((user) => company !== null && user.companyId === company.id),
    [company, companyUsers]
  );

  const initialDay = useMemo(() => (initial.meetingDate ? localDayOf(initial.meetingDate) : todayLocalDay()), [initial.meetingDate]);
  const [title, setTitle] = useState(initial.title);
  const [day, setDay] = useState(initialDay);
  const [participants, setParticipants] = useState<MeetingNoteParticipant[]>(initial.participants);
  const contentRef = useRef(initial.content);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [lastSubmitError, setLastSubmitError] = useState<unknown>(null);

  // A new server error replaces the client-side ones until the next submit.
  const serverField = submitError && submitError !== lastSubmitError ? meetingNoteFieldError(submitError) : null;
  const errors: FieldErrors = serverField ? { ...clientErrors, [serverField.field]: serverField.message } : clientErrors;
  const formError =
    submitError && submitError !== lastSubmitError && !serverField ? describeMeetingNoteError(submitError) : null;

  const focusField = (field: MeetingNoteFormField) => {
    const target =
      field === 'title' ? ids.title : field === 'date' ? ids.date : field === 'content' ? ids.editor : null;
    if (target) document.getElementById(target)?.focus();
  };

  const validate = (): { fields: MeetingNoteFieldsPayload | null; errors: FieldErrors } => {
    const next: FieldErrors = {};
    const trimmedTitle = title.trim();
    const titleLength = codePointLength(trimmedTitle);
    if (titleLength < 1 || titleLength > MEETING_NOTE_LIMITS.titleMaxChars) {
      next.title = titleLength < 1 ? 'Enter a title.' : 'The title can have at most 200 characters.';
    }
    const meetingDate =
      day === initialDay && initial.meetingDate ? initial.meetingDate : meetingDateFromLocalDay(day);
    if (!meetingDate) next.date = 'Choose the meeting date.';
    if (participants.length > MEETING_NOTE_LIMITS.maxParticipants) {
      next.participants = 'A note can have at most 50 participants.';
    }
    const content = contentRef.current;
    if (codePointLength(sanitizeMeetingNoteHtml(content)) > MEETING_NOTE_LIMITS.contentMaxChars) {
      next.content = 'The notes are too long (at most 100,000 characters).';
    }
    if (Object.keys(next).length > 0 || !meetingDate) return { fields: null, errors: next };
    return {
      fields: {
        title: trimmedTitle,
        meetingDate,
        content,
        participantIds: participants.map((participant) => participant.userId),
      },
      errors: next,
    };
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const result = validate();
    setClientErrors(result.errors);
    setLastSubmitError(submitError);
    if (!result.fields) {
      const first = (['title', 'date', 'participants', 'content'] as const).find((field) => result.errors[field]);
      if (first) focusField(first);
      return;
    }
    onSubmit(result.fields);
  };

  const fieldError = (id: string, message: string | undefined) =>
    message ? (
      <p id={id} className="text-xs text-destructive" role="alert">
        {message}
      </p>
    ) : null;

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit} aria-busy={submitting} data-testid="meeting-note-form">
      {header}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.title}>Title</Label>
        <Input
          id={ids.title}
          value={title}
          required
          aria-invalid={errors.title ? 'true' : 'false'}
          aria-describedby={errors.title ? ids.titleError : undefined}
          onChange={(event) => setTitle(event.target.value)}
          disabled={submitting}
        />
        {fieldError(ids.titleError, errors.title)}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.date}>Meeting date</Label>
        <Input
          id={ids.date}
          type="date"
          className="w-48"
          value={day}
          required
          aria-invalid={errors.date ? 'true' : 'false'}
          aria-describedby={errors.date ? ids.dateError : undefined}
          onChange={(event) => setDay(event.target.value)}
          disabled={submitting}
        />
        {fieldError(ids.dateError, errors.date)}
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={ids.participantsLabel} className="text-sm font-medium leading-none">
          Participants
        </span>
        <MeetingNoteParticipantPicker
          labelId={ids.participantsLabel}
          describedById={errors.participants ? ids.participantsError : undefined}
          value={participants}
          members={members}
          disabled={submitting}
          onChange={setParticipants}
        />
        {fieldError(ids.participantsError, errors.participants)}
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={ids.contentLabel} className="text-sm font-medium leading-none">
          Notes
        </span>
        <MeetingNoteRichTextEditorLazy
          id={ids.editor}
          labelId={ids.contentLabel}
          describedById={errors.content ? ids.contentError : undefined}
          initialContent={initial.content}
          invalid={Boolean(errors.content)}
          disabled={submitting}
          onChange={(html) => {
            contentRef.current = html;
          }}
        />
        {fieldError(ids.contentError, errors.content)}
      </div>

      {formError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting} data-testid="meeting-note-submit">
          {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
