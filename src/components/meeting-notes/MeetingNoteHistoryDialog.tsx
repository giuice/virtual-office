// src/components/meeting-notes/MeetingNoteHistoryDialog.tsx
// Version history (FR-008, FR-009, AC-006, J4): every viewer lists the
// versions (who and when) and opens one read-only; an editor restores it
// after confirmation, which the database records as a new version against
// the note revision captured when "Restore this version" was clicked — never
// a revision a background refetch brought in meanwhile (block B review B-4);
// a stale restore gets the conflict warning and must be started again.
// Historical participants who are no longer members show "Former member"
// (FR-030; the version route reports current membership).
'use client';

import { ArrowLeft, History, Loader2, RotateCcw } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useMeetingNoteVersion, useMeetingNoteVersions } from '@/hooks/queries/useMeetingNote';
import { useRestoreMeetingNoteVersion } from '@/hooks/mutations/useMeetingNoteMutations';
import { useNotification } from '@/hooks/useNotification';
import { MeetingNoteConflictError } from '@/lib/meeting-notes/client-api';
import { formatMeetingDate, formatMeetingNoteTimestamp } from '@/lib/meeting-notes/format';
import { describeMeetingNoteError } from '@/lib/meeting-notes/form-errors';
import type { MeetingNoteDetail, MeetingNoteVersionSummary } from '@/types/meeting-notes';
import { MeetingNoteConflictDialog } from './MeetingNoteConflictDialog';
import { MeetingNoteContent } from './MeetingNoteContent';

export interface MeetingNoteHistoryDialogProps {
  /** The note as currently cached; its revision is the restore's base. */
  note: MeetingNoteDetail;
}

export function MeetingNoteHistoryDialog({ note }: MeetingNoteHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MeetingNoteVersionSummary | null>(null);
  /** The restore being confirmed: the version and the note revision it applies to. */
  const [pendingRestore, setPendingRestore] = useState<{ versionId: string; versionRevision: number; expectedRevision: number } | null>(null);
  const [conflict, setConflict] = useState<MeetingNoteConflictError | null>(null);
  const versions = useMeetingNoteVersions(note.id, open);
  const version = useMeetingNoteVersion(note.id, open && selected ? selected.id : null);
  const restore = useRestoreMeetingNoteVersion();
  const { showSuccess } = useNotification();

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelected(null);
      restore.reset();
    }
  };

  const confirmRestore = () => {
    if (!pendingRestore) return;
    const { versionId, versionRevision, expectedRevision } = pendingRestore;
    restore.mutate(
      { noteId: note.id, expectedRevision, versionId },
      {
        onSuccess: (saved) => {
          setPendingRestore(null);
          setSelected(null);
          showSuccess({ description: `Revision ${versionRevision} restored as revision ${saved.revision}.` });
        },
        onError: (error) => {
          setPendingRestore(null);
          if (error instanceof MeetingNoteConflictError) setConflict(error);
        },
      }
    );
  };

  const restoreError =
    restore.error && !(restore.error instanceof MeetingNoteConflictError) ? describeMeetingNoteError(restore.error) : null;
  const items = versions.data?.versions ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" data-testid="meeting-note-history-button">
            <History className="size-4" aria-hidden="true" />
            History
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" data-testid="meeting-note-history-dialog">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Every saved change is kept as a version. Versions cannot be changed.
            </DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="flex flex-col gap-3" data-testid="meeting-note-version-view">
              <Button type="button" variant="ghost" size="sm" className="-ml-2 h-8 w-fit gap-1.5" onClick={() => setSelected(null)}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                All versions
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Revision {selected.revision}</Badge>
                <span className="text-sm text-muted-foreground">
                  {selected.editorName} · {formatMeetingNoteTimestamp(selected.createdAt)}
                </span>
                {selected.revision === note.revision ? <Badge>Current</Badge> : null}
              </div>
              {version.isPending ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading version…
                </p>
              ) : version.isError ? (
                <p className="text-sm text-destructive" role="alert">
                  {describeMeetingNoteError(version.error)}
                </p>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border p-4">
                  <h3 className="break-words text-lg font-semibold" data-testid="meeting-note-version-title">
                    {version.data.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={version.data.meetingDate}>{formatMeetingDate(version.data.meetingDate)}</time>
                    <span aria-hidden="true"> · </span>
                    {version.data.participants.length === 0
                      ? 'No participants'
                      : version.data.participants.map((participant, index) => (
                          <span
                            key={participant.userId}
                            data-testid="meeting-note-version-participant"
                            data-former-member={participant.isCurrentMember ? undefined : 'true'}
                          >
                            {index > 0 ? ', ' : null}
                            {participant.displayName}
                            {participant.isCurrentMember ? null : ' (Former member)'}
                          </span>
                        ))}
                  </p>
                  <MeetingNoteContent html={version.data.content} testId="meeting-note-version-content" />
                  {version.data.summary ? (
                    <div>
                      <h4 className="text-sm font-semibold">Summary</h4>
                      <p className="whitespace-pre-wrap break-words text-sm">{version.data.summary}</p>
                    </div>
                  ) : null}
                </div>
              )}
              {restoreError ? (
                <p className="text-sm text-destructive" role="alert">
                  {restoreError}
                </p>
              ) : null}
              {note.rights.canEdit && selected.revision !== note.revision && version.isSuccess ? (
                <Button
                  type="button"
                  className="w-fit gap-1.5"
                  onClick={() =>
                    setPendingRestore({ versionId: selected.id, versionRevision: selected.revision, expectedRevision: note.revision })
                  }
                  disabled={restore.isPending}
                  data-testid="meeting-note-restore-button"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Restore this version
                </Button>
              ) : null}
            </div>
          ) : versions.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading history…
            </p>
          ) : versions.isError ? (
            <div className="flex flex-col gap-2" role="alert">
              <p className="text-sm text-destructive">{describeMeetingNoteError(versions.error)}</p>
              <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => void versions.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <ol className="flex flex-col gap-2" aria-label="Versions, newest first" data-testid="meeting-note-version-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--vo-line-soft)] p-3 text-left transition-colors hover:bg-[var(--vo-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      restore.reset();
                      setSelected(item);
                    }}
                    data-testid="meeting-note-version-item"
                    data-revision={item.revision}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block text-xs text-muted-foreground" data-testid="meeting-note-version-meta">
                        {item.editorName} · <time dateTime={item.createdAt}>{formatMeetingNoteTimestamp(item.createdAt)}</time>
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {item.revision === note.revision ? <Badge>Current</Badge> : null}
                      <Badge variant="outline">Revision {item.revision}</Badge>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingRestore !== null}
        onOpenChange={(next) => {
          if (!next && !restore.isPending) setPendingRestore(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore revision {pendingRestore?.versionRevision}?</AlertDialogTitle>
            <AlertDialogDescription>
              The note (now at revision {pendingRestore?.expectedRevision}) gets this version&apos;s title, date,
              participants, content, and summary as a new version. Action items and the transcript do not change.
              Earlier versions stay in the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restore.isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmRestore();
              }}
              data-testid="meeting-note-restore-confirm"
            >
              {restore.isPending ? 'Restoring…' : 'Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {conflict ? (
        <MeetingNoteConflictDialog
          open
          onOpenChange={(next) => {
            if (!next) setConflict(null);
          }}
          newer={conflict.note}
          mine={null}
        />
      ) : null}
    </>
  );
}
