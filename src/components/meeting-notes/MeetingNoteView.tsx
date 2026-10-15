// src/components/meeting-notes/MeetingNoteView.tsx
// /meetings/[id] (FR-005, J3, J4, J10): title, meeting date, space (or
// "Space removed"), author, participants, rendered content, summary, action
// items, and the stored transcript; history and Markdown export for every
// viewer; edit and restore only when the view says the viewer may edit,
// delete only for the author or an admin; for editors, the AI draft flow
// (MeetingNoteAiPanel) and "Attach transcript". The routes and the database
// stay the authority.
'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMeetingNoteDetail } from '@/hooks/queries/useMeetingNote';
import { useMeetingNotesScope } from '@/hooks/queries/useMeetingNotes';
import { removeMeetingNoteQueries } from '@/hooks/mutations/useMeetingNoteMutations';
import { useMeetingNoteAiFlow } from '@/hooks/ui/useMeetingNoteAiFlow';
import { useNotification } from '@/hooks/useNotification';
import { MeetingNotesApiError } from '@/lib/meeting-notes/client-api';
import { formatMeetingDate, formatMeetingNoteTimestamp } from '@/lib/meeting-notes/format';
import { describeMeetingNoteError } from '@/lib/meeting-notes/form-errors';
import { MEETINGS_PATH } from '@/lib/meeting-notes/ui-paths';
import type { MeetingNoteDetail } from '@/types/meeting-notes';
import { MeetingNoteActionItems } from './MeetingNoteActionItems';
import { MeetingNoteAiPanel } from './MeetingNoteAiPanel';
import { MeetingNoteContent } from './MeetingNoteContent';
import { MeetingNoteDeleteButton } from './MeetingNoteDeleteButton';
import { MeetingNoteEditPanel } from './MeetingNoteEditPanel';
import { MeetingNoteExportControls } from './MeetingNoteExportControls';
import { MeetingNoteHistoryDialog } from './MeetingNoteHistoryDialog';
import { MeetingNoteParticipantList } from './MeetingNoteParticipantList';
import { MeetingNoteTranscriptSection } from './MeetingNoteTranscriptSection';
import { MeetingNoteTranscriptUpload } from './MeetingNoteTranscriptUpload';

export interface MeetingNoteViewProps {
  noteId: string;
}

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title} data-testid={testId}>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function MeetingNoteView({ noteId }: MeetingNoteViewProps) {
  const scope = useMeetingNotesScope();
  // Another user, company, or note never inherits this view's drafts or state
  // (the edit form and the AI draft live in the body).
  const scopeKey = scope ? `${scope.userId}:${scope.companyId}` : 'no-scope';
  return <MeetingNoteViewBody key={`${scopeKey}:${noteId}`} noteId={noteId} />;
}

function MeetingNoteViewBody({ noteId }: MeetingNoteViewProps) {
  const queryClient = useQueryClient();
  const scope = useMeetingNotesScope();
  const { showSuccess } = useNotification();
  const [deleted, setDeleted] = useState(false);
  const [editing, setEditing] = useState<MeetingNoteDetail | null>(null);
  const detail = useMeetingNoteDetail(noteId, !deleted);
  // Kept here (not in the panel) so a draft survives opening the edit form.
  const aiFlow = useMeetingNoteAiFlow(noteId);

  useEffect(() => {
    // The query is disabled once deleted, so dropping it cannot trigger a refetch.
    if (deleted && scope) removeMeetingNoteQueries(queryClient, scope, noteId);
  }, [deleted, noteId, queryClient, scope]);

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 w-fit gap-1.5">
      <Link href={MEETINGS_PATH}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Meetings
      </Link>
    </Button>
  );

  if (deleted) {
    return (
      <div className="flex max-w-4xl flex-col gap-4">
        {back}
        <p className="text-sm text-muted-foreground" role="status">
          This note was deleted. Opening Meetings…
        </p>
      </div>
    );
  }

  if (detail.isPending) {
    return (
      <div className="flex max-w-4xl flex-col gap-4">
        {back}
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading note…
        </p>
      </div>
    );
  }

  const missing = detail.isError && detail.error instanceof MeetingNotesApiError && detail.error.status === 404;
  // A failed refresh of a note already on screen is shown next to it; it
  // never unmounts an open editor and its unsaved draft (block B review B-3).
  const refreshError =
    detail.isError && !missing ? (
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        role="alert"
        data-testid="meeting-note-refresh-error"
      >
        <span className="min-w-0 flex-1">The latest version could not be loaded. {describeMeetingNoteError(detail.error)}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => void detail.refetch()}>
          Try again
        </Button>
      </div>
    ) : null;

  if (editing) {
    return (
      <div className="flex max-w-4xl flex-col gap-4">
        <h2 className="text-lg font-semibold">Edit meeting note</h2>
        {missing ? (
          <p
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
            data-testid="meeting-note-refresh-error"
          >
            This note may have been deleted, or you no longer have access to it. Copy anything you still need.
          </p>
        ) : (
          refreshError
        )}
        <div className="rounded-xl border border-[var(--vo-line-soft)] bg-card p-6">
          <MeetingNoteEditPanel
            note={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              showSuccess({ description: 'Changes saved.' });
            }}
          />
        </div>
      </div>
    );
  }

  if (detail.isError && (missing || detail.data === undefined)) {
    return (
      <div className="flex max-w-4xl flex-col gap-4">
        {back}
        <div className="rounded-xl border border-[var(--vo-line-soft)] bg-card p-6" role="alert" data-testid="meeting-note-unavailable">
          <p className="font-medium">{missing ? 'Meeting note not found' : 'The note could not be loaded'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {missing
              ? 'It may have been deleted, or it belongs to another company.'
              : describeMeetingNoteError(detail.error)}
          </p>
          {missing ? null : (
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void detail.refetch()}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  const note = detail.data;
  if (!note) return null;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {back}
      {refreshError}
      <article
        className="flex flex-col gap-6 rounded-xl border border-[var(--vo-line-soft)] bg-card p-6"
        data-testid="meeting-note-view"
        data-note-id={note.id}
        data-revision={note.revision}
      >
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="min-w-0 break-words text-2xl font-semibold" data-testid="meeting-note-title">
              {note.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2" data-testid="meeting-note-actions">
              {note.rights.canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setEditing(note)}
                  data-testid="meeting-note-edit-button"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit
                </Button>
              ) : null}
              <MeetingNoteHistoryDialog note={note} />
              {note.rights.canDelete ? <MeetingNoteDeleteButton note={note} onDeleted={() => setDeleted(true)} /> : null}
              <MeetingNoteExportControls note={note} />
            </div>
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <time dateTime={note.meetingDate} data-testid="meeting-note-date">
              {formatMeetingDate(note.meetingDate)}
            </time>
            <span aria-hidden="true">·</span>
            {note.spaceName === null ? (
              <Badge variant="outline" className="text-[11px]" data-testid="meeting-note-space-removed">
                Space removed
              </Badge>
            ) : (
              <span data-testid="meeting-note-space">{note.spaceName}</span>
            )}
            <span aria-hidden="true">·</span>
            <span data-testid="meeting-note-author">By {note.authorName}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Revision {note.revision} · Updated {formatMeetingNoteTimestamp(note.updatedAt)}
          </p>
        </header>

        <Section title="Participants">
          <MeetingNoteParticipantList participants={note.participants} />
        </Section>

        <Section title="Notes">
          <MeetingNoteContent html={note.content} emptyText="No notes written yet." />
        </Section>

        <Section title="Summary" testId="meeting-note-summary">
          {note.summary ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{note.summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No summary yet.</p>
          )}
        </Section>

        {note.rights.canEdit ? (
          <Section title="AI draft" testId="meeting-note-ai-section">
            <MeetingNoteAiPanel note={note} flow={aiFlow} />
          </Section>
        ) : null}

        <Section title="Action items" testId="meeting-note-action-items-section">
          <MeetingNoteActionItems note={note} />
        </Section>

        <Section title="Transcript" testId="meeting-note-transcript-section">
          <MeetingNoteTranscriptSection noteId={note.id} transcriptId={note.transcriptId} />
          {note.rights.canEdit ? <MeetingNoteTranscriptUpload mode="attach" note={note} /> : null}
        </Section>
      </article>
    </div>
  );
}
