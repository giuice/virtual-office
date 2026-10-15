// src/components/meeting-notes/MeetingNoteEditPanel.tsx
// Editing an existing note (FR-006, FR-007, J3). The save is a full
// replacement against the revision the editor started from; when another
// change landed first, the route answers 409 with the newer note and the
// conflict dialog shows both — the user's text stays available to copy,
// also after loading the newer version.
'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useUpdateMeetingNote } from '@/hooks/mutations/useMeetingNoteMutations';
import { MeetingNoteConflictError, type MeetingNoteFieldsPayload } from '@/lib/meeting-notes/client-api';
import { meetingNoteHtmlToText } from '@/lib/meeting-notes/html-text';
import type { MeetingNoteDetail } from '@/types/meeting-notes';
import { MeetingNoteConflictDialog } from './MeetingNoteConflictDialog';
import { MeetingNoteForm, type MeetingNoteFormInitialValues } from './MeetingNoteForm';

export interface MeetingNoteEditPanelProps {
  /** The note as it was when editing started; its revision is the save's base. */
  note: MeetingNoteDetail;
  onSaved: (note: MeetingNoteDetail) => void;
  onCancel: () => void;
}

export function MeetingNoteEditPanel({ note, onSaved, onCancel }: MeetingNoteEditPanelProps) {
  const update = useUpdateMeetingNote();
  const [base, setBase] = useState(note);
  const [pending, setPending] = useState<MeetingNoteFieldsPayload | null>(null);
  const [conflict, setConflict] = useState<MeetingNoteConflictError | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [backup, setBackup] = useState<MeetingNoteFieldsPayload | null>(null);

  const initial = useMemo<MeetingNoteFormInitialValues>(
    () => ({
      title: base.title,
      meetingDate: base.meetingDate,
      participants: base.participants,
      content: base.content,
    }),
    [base]
  );
  const backupText = useMemo(
    () => (backup ? `${backup.title}\n\n${meetingNoteHtmlToText(backup.content)}`.trim() : ''),
    [backup]
  );

  const submit = (fields: MeetingNoteFieldsPayload) => {
    setPending(fields);
    update.mutate(
      { noteId: base.id, expectedRevision: base.revision, fields },
      {
        onSuccess: (saved) => onSaved(saved),
        onError: (error) => {
          if (error instanceof MeetingNoteConflictError) {
            setConflict(error);
            setConflictOpen(true);
          }
        },
      }
    );
  };

  const loadNewer = () => {
    if (!conflict) return;
    setBackup(pending);
    setBase(conflict.note);
    setConflict(null);
    setConflictOpen(false);
    update.reset();
  };

  // A conflict is answered by the dialog and the banner, not as a form error.
  const formError = update.error instanceof MeetingNoteConflictError ? null : update.error;

  return (
    <div className="flex flex-col gap-4" data-testid="meeting-note-edit-panel">
      {conflict && !conflictOpen ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
          role="alert"
        >
          <AlertTriangle className="size-4 flex-none text-amber-600" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            This note was changed by someone else while you were editing. Saving again will be refused until you
            load the newer version.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => setConflictOpen(true)}>
            Review newer version
          </Button>
        </div>
      ) : null}

      {backup ? (
        <section
          aria-labelledby="meeting-note-backup-heading"
          className="flex flex-col gap-2 rounded-md border border-[var(--vo-line-soft)] bg-[var(--vo-bg-2)] p-3"
          data-testid="meeting-note-unsaved-backup"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 id="meeting-note-backup-heading" className="text-sm font-semibold">
              Your earlier unsaved text
            </h3>
            <Button type="button" size="sm" variant="ghost" onClick={() => setBackup(null)}>
              Dismiss
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The form now shows the newer version. Copy anything you still need from here.
          </p>
          <textarea
            readOnly
            aria-labelledby="meeting-note-backup-heading"
            className="min-h-24 w-full resize-y rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={backupText}
          />
        </section>
      ) : null}

      <MeetingNoteForm
        // Remount on a new base so every field shows the newer version.
        key={`${base.id}:${base.revision}`}
        initial={initial}
        submitLabel="Save changes"
        submitting={update.isPending}
        submitError={formError}
        onSubmit={submit}
        onCancel={onCancel}
      />

      {conflict ? (
        <MeetingNoteConflictDialog
          open={conflictOpen}
          onOpenChange={setConflictOpen}
          newer={conflict.note}
          mine={pending}
          onLoadNewer={loadNewer}
        />
      ) : null}
    </div>
  );
}
